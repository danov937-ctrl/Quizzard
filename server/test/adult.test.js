// Режим за възрастни: регистрация за възрастни, отделни въпроси, парички и залог, знаме, отделни класации.
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 4000 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-adult-'));
let proc;

function startServer() {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, ADMIN_KEY: 'secret-test', ADMIN_DATA_DIR: DIR, GAME_SPEED: '0.002', GITHUB_TOKEN: '', DATA_REPO: '', MAIL_OUTBOX: path.join(DIR, 'outbox'), NO_MAIL_TIMER: '1', RESEND_API_KEY: '', REWARDED_ADS: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((res) => proc.stdout.on('data', (d) => { if (String(d).includes('работи')) res(); }));
}
const stopServer = () => new Promise((res) => { proc.once('exit', res); proc.kill('SIGTERM'); });
function client() {
  const jar = {};
  const req = async (method, url, body) => {
    const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', 'X-Quizzard': '1', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const [k, v] = kv.split('='); jar[k] = v; }
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { req, jar };
}
const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

// Свързва играч; връща { ws, next(pred) } за чакане на съобщение
function connect(jar) {
  const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { Cookie: Object.entries(jar || {}).map(([k, v]) => `${k}=${v}`).join('; ') } });
  const waiters = [], log = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw); log.push(m);
    for (const w of waiters.slice()) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
  });
  const next = (pred, ms = 60000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('няма отговор')), ms); waiters.push({ pred, res: (m) => { clearTimeout(t); res(m); } }); });
  return { ws, next, ready: new Promise((r) => ws.on('open', r)) };
}
// Играе автоматично: първия отговор и първата област
function autoplay(c) {
  c.ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t !== 'game') return;
    const meP = m.state.players.find((p) => p.id === c.pid), cur = m.state.current;
    if (cur?.type === 'question' && cur.participants.includes(c.pid) && !cur.answers[c.pid]) c.ws.send(JSON.stringify({ t: 'answer', value: cur.kind === 'num' ? 1900 : cur.q.options[0] }));
    if (cur?.type === 'pick' && cur.picker === meP?.id) c.ws.send(JSON.stringify({ t: 'pick', region: cur.options[0] }));
  });
}

(async () => {
  await startServer();
  const a = client(), b = client(), kid = client();
  try {
    // ----- регистрация -----
    let r = await a.req('POST', '/api/account/register', { adult: true, name: 'Знаменосец', email: 'a@primer.bg', password: 'kratka', birthDate: yearsAgo(30), consent: true });
    assert.strictEqual(r.status, 400, 'паролата за възрастни е поне 8 знака');
    r = await a.req('POST', '/api/account/register', { adult: true, name: 'Знаменосец', email: 'a@primer.bg', password: 'dulga-parola', birthDate: yearsAgo(17), consent: true });
    assert.strictEqual(r.status, 400, 'под 18 не става'); assert.match(r.data.error, /пълнолет/);
    r = await a.req('POST', '/api/account/register', { adult: true, name: 'Знаменосец', email: 'a@primer.bg', password: 'dulga-parola', birthDate: yearsAgo(30), consent: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.user.adult && r.data.user.coins === 1000 && !r.data.user.needsConsent, 'възрастен: 1000 парички, без родител');
    assert.ok(!r.data.user.badges.some((x) => x.id === 'master_mat') && r.data.user.badges.some((x) => x.id === 'master_hist'), 'значки за възрастни');
    assert.strictEqual((await b.req('POST', '/api/account/register', { adult: true, name: 'Рицаря', email: 'a@primer.bg', password: 'dulga-parola', birthDate: yearsAgo(40), consent: true })).status, 400, 'един възрастен на имейл');
    assert.strictEqual((await b.req('POST', '/api/account/register', { adult: true, name: 'Рицаря', email: 'b@primer.bg', password: 'dulga-parola', birthDate: yearsAgo(40), consent: true })).status, 200);
    assert.strictEqual((await kid.req('POST', '/api/account/register', { name: 'Звездичка7', email: 'roditel@primer.bg', password: 'tajna', grade: 3, consent: true })).status, 200);

    // ----- знаме -----
    r = await a.req('POST', '/api/account/flag', { pattern: 'v3', colors: ['#1e5aa8', '#ffffff', '#d62828'], emblem: '🦁' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data)); assert.strictEqual(r.data.user.flag.pattern, 'v3');
    assert.strictEqual((await a.req('POST', '/api/account/flag', { pattern: 'v3', colors: ['#1e5aa8', '#ffffff', '#d62828'], emblem: '🦄' })).status, 400, 'емблемата се отключва с ниво');
    assert.strictEqual((await a.req('POST', '/api/account/flag', { pattern: 'v3', colors: ['red', '#ffffff', '#d62828'] })).status, 400, 'само цветове от палитрата');

    // ----- парички -----
    r = await a.req('GET', '/api/coins');
    assert.strictEqual(r.data.coins, 1000); assert.strictEqual(r.data.stake, 100); assert.ok(r.data.packs.length >= 3);
    assert.strictEqual((await a.req('POST', '/api/coins/buy', { pack: 'p1000' })).status, 503, 'плащанията са изключени');
    assert.strictEqual((await a.req('POST', '/api/coins/ad/start', {})).status, 503, 'рекламите са изключени без мрежа');
    assert.strictEqual((await kid.req('GET', '/api/coins')).status, 403, 'децата нямат парички');

    // ----- достъп до режимите -----
    const k = connect(kid.jar); await k.ready;
    k.ws.send(JSON.stringify({ t: 'bots', grade: 9, bots: 1 }));
    assert.match((await k.next((m) => m.t === 'error')).msg, /детския режим/, 'дете не влиза в режима за възрастни');
    const g = connect(); await g.ready;
    g.ws.send(JSON.stringify({ t: 'quick', name: 'Гост', grade: 9 }));
    assert.match((await g.next((m) => m.t === 'error')).msg, /профил за възрастни/, 'гост не играе онлайн със залог');
    const ca = connect(a.jar); await ca.ready;
    ca.ws.send(JSON.stringify({ t: 'quick', grade: 2 }));
    assert.match((await ca.next((m) => m.t === 'error')).msg, /само за деца/, 'възрастен не влиза в онлайн игрите на децата');

    // ----- игра с ботове за възрастни: въпроси само от категориите за възрастни, без залог -----
    g.ws.send(JSON.stringify({ t: 'bots', name: 'Гост', grade: 9, bots: 1 }));
    const gj = await g.next((m) => m.t === 'joined'); g.pid = gj.pid; autoplay(g);
    const ADULT = ['hist', 'geo', 'sci', 'film', 'music', 'spt', 'lit', 'art', 'tec', 'gen'];
    const seen = new Set();
    g.ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'game' && m.state.current?.q) seen.add(m.state.current.q.subject); });
    const gEnd = await g.next((m) => m.t === 'game' && m.state.phase === 'ended');
    assert.ok(seen.size > 2 && [...seen].every((s) => ADULT.includes(s)), 'само въпроси за възрастни: ' + [...seen]);
    assert.strictEqual(gEnd.lobby.stake, 0, 'с ботове няма залог');

    // ----- двама възрастни с приятели: залог 100, победителят взима 200 -----
    ca.ws.send(JSON.stringify({ t: 'create', grade: 9 }));
    const room = await ca.next((m) => m.t === 'joined'); ca.pid = room.pid;
    const cb = connect(b.jar); await cb.ready;
    cb.ws.send(JSON.stringify({ t: 'join', code: room.code }));
    cb.pid = (await cb.next((m) => m.t === 'joined')).pid;
    const lob = await ca.next((m) => m.t === 'lobby' && m.lobby.members.length === 2);
    assert.strictEqual(lob.lobby.stake, 100); assert.ok(lob.lobby.members.every((m) => m.coins === 1000 && m.adult));
    assert.ok(lob.lobby.members.find((m) => m.id === ca.pid).flag, 'знамето се вижда в стаята');
    autoplay(ca); autoplay(cb);
    ca.ws.send(JSON.stringify({ t: 'start' }));
    const end = await ca.next((m) => m.t === 'game' && m.state.phase === 'ended' && m.lobby.stakes?.result);
    assert.strictEqual(end.lobby.stakes.pot, 200);
    const ua = (await a.req('GET', '/api/account/me')).data.user, ub = (await b.req('GET', '/api/account/me')).data.user;
    const winA = end.lobby.stakes.result.winner === ca.pid;
    assert.deepStrictEqual([ua.coins, ub.coins], winA ? [1100, 900] : [900, 1100], 'победителят взима залога');

    // ----- отделни класации -----
    const kidBoard = (await kid.req('GET', '/api/leaderboard?kind=xp')).data.top.map((x) => x.name);
    const adultBoard = (await a.req('GET', '/api/leaderboard?kind=coins&aud=adult')).data.top.map((x) => x.name);
    assert.ok(!kidBoard.includes('Знаменосец') && adultBoard.includes('Знаменосец') && !adultBoard.includes('Звездичка7'), 'децата и възрастните са в отделни класации');

    for (const c of [k, g, ca, cb]) c.ws.close();
    console.log('OK: режим за възрастни: регистрация за възрастни, знаме, парички и залог, отделни въпроси и класации');
  } finally {
    await stopServer();
    fs.rmSync(DIR, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); proc && proc.kill(); process.exit(1); });
