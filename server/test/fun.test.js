// Ежедневен сандък (награди) и бързи реакции в играта.
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../admin/rewards');
const { Game } = require('../game');

const PORT = 4400 + Math.floor(Math.random() * 90);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-fun-'));
let proc;
const dayAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function client() {
  const jar = {};
  return async (method, url, body) => {
    const res = await fetch(`http://localhost:${PORT}` + url, {
      method, headers: { 'Content-Type': 'application/json', 'X-Quizzard': '1', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const [k, v] = kv.split('='); jar[k] = v; }
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

// ---------- правилата на сандъка (без сървър) ----------
{
  const u = { xp: 0 };
  assert.deepStrictEqual([R.dailyState(u).day, R.dailyState(u).claimedToday, R.dailyState(u).run], [1, false, 0], 'нов играч: сандък №1');
  let w = R.claimDaily(u);
  assert.strictEqual(w.xp, 20); assert.strictEqual(u.xp, 20);
  assert.ok(R.claimDaily(u).error, 'втори път през същия ден не става');
  assert.strictEqual(R.dailyState(u).claimedToday, true);

  const six = { xp: 0, daily: { last: dayAgo(1), run: 6, best: 6 } };
  assert.strictEqual(R.dailyState(six).day, 7, 'шести ден подред → следва седмият');
  w = R.claimDaily(six);
  assert.strictEqual(w.xp, 150, 'седмият сандък е най-големият'); assert.strictEqual(w.day, 7);
  assert.ok(six.badges.chest_7, 'значка „Седем сандъка“');

  const next = { xp: 0, daily: { last: dayAgo(1), run: 7, best: 7 } };
  assert.strictEqual(R.dailyState(next).day, 1, 'след седмия започва нов кръг');
  assert.strictEqual(R.claimDaily(next).xp, 20);

  const lost = { xp: 0, daily: { last: dayAgo(3), run: 6, best: 6 } };
  assert.strictEqual(R.dailyState(lost).run, 0, 'пропуснат ден: серията се нулира');
  assert.strictEqual(R.claimDaily(lost).xp, 20); assert.strictEqual(lost.daily.best, 6, 'рекордът се пази');

  const lv = { xp: R.levelInfo(0).to - 5 };
  assert.strictEqual(R.claimDaily(lv).levelUp, 2, 'награда, която вдига нивото');
}

// ---------- реакции (без сървър) ----------
(async () => {
  const players = [{ id: 'h', name: 'Аз', isBot: false }, { id: 'b1', name: 'Бот 1', isBot: true }, { id: 'b2', name: 'Бот 2', isBot: true }];
  const g = new Game(players, { grade: 2, battleRounds: 1, speed: 0.5, onChange: () => {} });
  const reacts = () => g.fx.filter((f) => f.type === 'react');
  g.react('h', '🔥');
  assert.strictEqual(reacts().length >= 1 && reacts()[0].emoji, '🔥'); assert.strictEqual(reacts()[0].pid, 'h');
  const n = reacts().length;
  g.react('h', '😎');
  assert.strictEqual(reacts().filter((f) => f.pid === 'h').length, 1, 'втора реакция веднага се игнорира');
  g.players[0].lastReact = 0; g.react('h', 'ЗДРАВЕЙТЕ');
  g.react('h', '<script>');
  assert.strictEqual(reacts().filter((f) => f.pid === 'h').length, 1, 'само емоджита от списъка');
  g.react('няма', '🔥');
  assert.strictEqual(reacts().length, n, 'непознат играч не може да реагира');
  g.abort();
  g.react('h', '🔥'); assert.ok(true, 'след края на играта не гърми');

  // ---------- през сървъра ----------
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, ADMIN_KEY: 'secret-test', ADMIN_DATA_DIR: DIR, GITHUB_TOKEN: '', DATA_REPO: '', DATABASE_URL: '', NO_MAIL_TIMER: '1', RESEND_API_KEY: '', GAME_SPEED: '0.02' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res) => proc.stdout.on('data', (d) => String(d).includes('работи') && res()));
  try {
    const api = client(), anon = client();
    let r = await anon('POST', '/api/account/daily', {});
    assert.strictEqual(r.status, 401, 'без вход няма награда');
    r = await api('POST', '/api/account/register', { name: 'Сандъчко', email: 'sandu@primer.bg', password: 'parola1', grade: 2, consent: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.strictEqual(r.data.user.daily.claimedToday, false); assert.strictEqual(r.data.user.daily.day, 1);
    assert.deepStrictEqual(r.data.user.daily.rewards, R.DAILY);
    const xp0 = r.data.user.xp;
    r = await api('POST', '/api/account/daily', {});
    assert.strictEqual(r.status, 200, JSON.stringify(r.data)); assert.strictEqual(r.data.reward.xp, 20);
    assert.strictEqual(r.data.user.xp, xp0 + 20); assert.strictEqual(r.data.user.daily.claimedToday, true);
    r = await api('POST', '/api/account/daily', {});
    assert.strictEqual(r.status, 400, 'втори път през деня'); assert.ok(/вече/.test(r.data.error));
    r = await api('GET', '/api/account/me');
    assert.strictEqual(r.data.user.daily.claimedToday, true, 'пази се между заявките');

    // реакция по WebSocket в игра с ботове
    const { WebSocket } = require('ws');
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const got = [];
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'game') for (const f of m.state.fx || []) if (f.type === 'react') got.push(f); });
    ws.send(JSON.stringify({ t: 'bots', name: 'Мария', grade: 2, count: 2 }));
    await new Promise((res) => setTimeout(res, 600));
    ws.send(JSON.stringify({ t: 'react', emoji: '👏' }));
    await new Promise((res) => setTimeout(res, 500));
    assert.ok(got.some((f) => f.emoji === '👏'), 'реакцията стига до играча през сървъра');
    ws.send(JSON.stringify({ t: 'react', emoji: 'x'.repeat(50) }));
    ws.close();
    console.log('fun: всички проверки минаха');
  } finally { proc.kill(); await new Promise((r) => setTimeout(r, 300)); fs.rmSync(DIR, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); proc && proc.kill(); process.exit(1); });
