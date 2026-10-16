// Пуска истински сървър с временна папка и проверява админ панела, акаунтите, наградите и идеите.
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-admin-'));
let proc;

function startServer() {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, ADMIN_KEY: 'secret-test', ADMIN_DATA_DIR: DIR, GAME_SPEED: '0.002', GITHUB_TOKEN: '', DATA_REPO: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((res) => proc.stdout.on('data', (d) => { if (String(d).includes('работи')) res(); }));
}
const stopServer = () => new Promise((res) => { proc.once('exit', res); proc.kill('SIGTERM'); });

function client() {
  const jar = {};
  const req = async (method, url, body, admin = true) => {
    const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { 'X-Quizzard-Admin': '1' } : { 'X-Quizzard': '1' }), Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const [k, v] = kv.split('='); jar[k] = v; }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  return { req, jar };
}

async function playBotGame(jar) {
  const ws = new WebSocket(`ws://localhost:${PORT}`, { headers: { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') } });
  await new Promise((r) => ws.on('open', r));
  let name = null;
  const done = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('играта не свърши')), 60000);
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'game') {
        const meP = m.state.players.find((p) => !p.isBot);
        if (meP) name = meP.name;
        const c = m.state.current;
        // Отговаряме вярно след разкриването не можем, затова просто избираме първия отговор
        if (c && c.type === 'question' && c.participants.includes(meP?.id) && !c.answers[meP.id]) ws.send(JSON.stringify({ t: 'answer', value: c.kind === 'num' ? 5 : c.q.options[0] }));
        if (c && c.type === 'pick' && c.picker === meP?.id) ws.send(JSON.stringify({ t: 'pick', region: c.options[0] }));
        if (m.state.phase === 'ended') { clearTimeout(t); resolve(); }
      }
      if (m.t === 'error') { clearTimeout(t); reject(new Error(m.msg)); }
    });
  });
  ws.send(JSON.stringify({ t: 'bots', name: 'Гост', grade: 2, bots: 1 }));
  await done;
  ws.close();
  return name;
}

(async () => {
  await startServer();
  const admin = client(), kid = client();
  try {
    // ----- вход в панела -----
    assert.strictEqual((await admin.req('GET', '/api/admin/overview')).status, 401, 'без вход няма достъп');
    assert.strictEqual((await admin.req('POST', '/api/admin/login', { password: 'грешна' })).status, 401);
    assert.strictEqual((await admin.req('POST', '/api/admin/login', { password: 'secret-test' })).status, 200);
    const ov = (await admin.req('GET', '/api/admin/overview')).data;
    assert.ok(ov.questions.total > 2000, 'въпросите са заредени');
    const noHeader = await fetch(BASE + '/api/admin/questions', { method: 'POST', headers: { Cookie: 'qz_admin=' + admin.jar.qz_admin }, body: '{}' });
    assert.strictEqual(noHeader.status, 403, 'промени само с нашия заглавен ред');

    // ----- въпроси: търсене, редакция, скриване, добавяне, внасяне, връщане -----
    const list = (await admin.req('GET', '/api/admin/questions?subject=mat&grade=1&kind=mc')).data;
    assert.ok(list.total > 10 && list.items.every((q) => q.subject === 'mat' && q.grade === 1));
    const q0 = list.items[0];
    let r = await admin.req('PUT', '/api/admin/questions/' + q0.key, { text: q0.text + ' (проверка)' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    let got = (await admin.req('GET', '/api/admin/questions/' + q0.key)).data;
    assert.ok(got.q.edited && got.q.text.endsWith('(проверка)') && got.original.text === q0.text);
    r = await admin.req('PUT', '/api/admin/questions/' + q0.key, { options: ['1', '1', '2', '3'] });
    assert.strictEqual(r.status, 400, 'еднакви отговори не се приемат');
    await admin.req('POST', `/api/admin/questions/${q0.key}/hide`);
    assert.ok((await admin.req('GET', '/api/admin/questions?status=hidden')).data.items.some((q) => q.key === q0.key));
    const added = await admin.req('POST', '/api/admin/questions', { kind: 'mc', grade: 3, subject: 'okol', text: 'Коя е най-високата планина в България?', options: ['Рила', 'Пирин', 'Стара планина', 'Родопи'] });
    assert.strictEqual(added.status, 200, JSON.stringify(added.data));
    assert.strictEqual((await admin.req('POST', '/api/admin/questions', { kind: 'mc', grade: 3, subject: 'okol', text: 'Коя е най-високата планина в България?', options: ['a', 'b', 'c', 'd'] })).status, 400, 'без повторения');
    const imp = (await admin.req('POST', '/api/admin/import', { text: '2|mat|Колко е 7 + 8 в задача за проверка?|15|14|16|13\n4|okol|Числов въпрос за проверка: колко са дните в една седмица и още три?|10\nлош ред', dryRun: true })).data;
    assert.strictEqual(imp.ok, 2); assert.ok(imp.rows[2].error);
    assert.strictEqual((await admin.req('POST', '/api/admin/import', { text: '2|mat|Колко е 7 + 8 в задача за проверка?|15|14|16|13' })).data.added, 1);
    const exp = await admin.req('GET', '/api/admin/export?kind=mc&scope=changed');
    assert.ok(String(exp.data).includes('Коя е най-високата планина в България?|Рила'), 'изнасяне на новите');
    const audit = (await admin.req('GET', '/api/admin/audit')).data.items;
    const editEntry = audit.find((x) => x.action === 'edit' && x.key === q0.key);
    await admin.req('POST', `/api/admin/audit/${editEntry.id}/revert`);
    got = (await admin.req('GET', '/api/admin/questions/' + q0.key)).data;
    assert.strictEqual(got.q.text, q0.text, 'връщане на редакцията');
    assert.ok((await admin.req('GET', '/api/admin/problems')).data.groups);
    assert.ok((await admin.req('GET', '/api/admin/coverage')).data.coverage.mat[1].mc > 0);

    // ----- акаунти -----
    assert.strictEqual((await kid.req('POST', '/api/account/register', { name: 'ab', password: '1234' }, false)).status, 400, 'кратък прякор');
    assert.strictEqual((await kid.req('POST', '/api/account/register', { name: 'Бот Мечо', password: '1234' }, false)).status, 400, 'не може да се представя за бот');
    r = await kid.req('POST', '/api/account/register', { name: 'Звездичка7', password: 'тайна1', grade: 2 }, false);
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.strictEqual((await client().req('POST', '/api/account/register', { name: 'звездичка7', password: 'xxxx' }, false)).status, 400, 'прякорът е зает');
    assert.strictEqual((await client().req('POST', '/api/account/login', { name: 'Звездичка7', password: 'грешна' }, false)).status, 400);
    assert.strictEqual((await kid.req('POST', '/api/account/avatar', { icon: '👑' }, false)).status, 400, 'аватарът се отключва с ниво');
    assert.strictEqual((await kid.req('POST', '/api/account/avatar', { icon: '🦊', color: '#43a047' }, false)).data.user.avatar.icon, '🦊');

    // ----- игра с акаунт → опит, значки, класация -----
    const name = await playBotGame(kid.jar);
    assert.strictEqual(name, 'Звездичка7', 'в играта е с прякора от профила');
    await new Promise((res) => setTimeout(res, 200));
    const me = (await kid.req('GET', '/api/account/me', undefined, false)).data.user;
    assert.strictEqual(me.games, 1); assert.ok(me.xp > 0 && me.answers > 0);
    assert.ok(me.newBadges.some((b) => b.id === 'first_game'), 'значка за първа игра');
    const board = (await kid.req('GET', '/api/leaderboard?kind=week', undefined, false)).data;
    assert.strictEqual(board.top[0].name, 'Звездичка7'); assert.strictEqual(board.me.place, 1);
    await kid.req('POST', '/api/account/seen', {}, false);
    assert.strictEqual((await kid.req('GET', '/api/account/me', undefined, false)).data.user.newBadges.length, 0);
    const stats = (await admin.req('GET', '/api/admin/analytics')).data;
    assert.strictEqual(stats.totals.games, 1); assert.ok(stats.totals.answers > 0, 'отговорите на детето се броят');

    // ----- снимка за профила: видима чак след одобрение -----
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    assert.strictEqual((await kid.req('POST', '/api/account/photo', { data: png }, false)).data.user.photoStatus, 'pending');
    assert.strictEqual((await fetch(`${BASE}/api/avatar/${me.id}`)).status, 404, 'неодобрената снимка не се показва');
    await admin.req('POST', `/api/admin/photos/${me.id}/approve`);
    assert.strictEqual((await fetch(`${BASE}/api/avatar/${me.id}`)).status, 200);
    assert.ok((await kid.req('GET', '/api/account/me', undefined, false)).data.user.avatar.photo);

    // ----- идеи: видими след публикуване -----
    assert.strictEqual((await kid.req('POST', '/api/ideas', { text: 'Искам въпроси за динозаври!', category: 'questions' }, false)).status, 200);
    let ideas = (await client().req('GET', '/api/ideas?voter=abc')).data;
    assert.strictEqual(ideas.items.length, 0, 'непубликувана идея не се вижда');
    const pending = (await admin.req('GET', '/api/admin/ideas?status=new')).data.items;
    await admin.req('PUT', '/api/admin/ideas/' + pending[0].id, { status: 'published', reply: 'Добра идея!' });
    ideas = (await client().req('GET', '/api/ideas?voter=abc')).data;
    assert.strictEqual(ideas.items[0].reply, 'Добра идея!');
    const liked = (await client().req('POST', `/api/ideas/${ideas.items[0].id}/like`, { voter: 'abcdef123456' }, false)).data;
    assert.strictEqual(liked.likes, 1);
    assert.ok((await kid.req('GET', '/api/account/me', undefined, false)).data.user.badges.find((b) => b.id === 'idea').at, 'значка „Изобретател“');

    // ----- играчи в панела -----
    const pl = (await admin.req('GET', '/api/admin/players')).data;
    assert.strictEqual(pl.total, 1);
    const reset = (await admin.req('POST', `/api/admin/players/${me.id}/reset-password`)).data;
    assert.strictEqual((await client().req('POST', '/api/account/login', { name: 'Звездичка7', password: reset.password }, false)).status, 200, 'новата парола работи');
    assert.strictEqual((await kid.req('GET', '/api/account/me', undefined, false)).data.user, null, 'старата сесия спира след нова парола');

    // ----- настройки, съобщение, поддръжка -----
    const s = (await admin.req('GET', '/api/admin/settings')).data.settings;
    await admin.req('PUT', '/api/admin/settings', { ...s, times: { mc: 30, num: 25, pick: 10 }, announcement: { on: true, text: 'Здравейте!', kind: 'party' }, maintenance: { on: true, message: 'Обновяваме.' } });
    const st = (await fetch(BASE + '/api/status').then((x) => x.json()));
    assert.strictEqual(st.announcement.text, 'Здравейте!'); assert.strictEqual(st.maintenance, 'Обновяваме.');
    await assert.rejects(playBotGame({}), /Обновяваме/, 'при поддръжка нова игра не започва');
    const s2 = (await admin.req('GET', '/api/admin/settings')).data.settings;
    await admin.req('PUT', '/api/admin/settings', { ...s2, maintenance: { on: false } });

    // ----- данните оцеляват рестарт -----
    await stopServer();
    await startServer();
    await admin.req('POST', '/api/admin/login', { password: 'secret-test' });
    const after = (await admin.req('GET', '/api/admin/overview')).data;
    assert.strictEqual(after.questions.added, 2, 'добавените въпроси са запазени');
    assert.strictEqual(after.players.total, 1, 'акаунтите са запазени');
    assert.strictEqual((await admin.req('GET', '/api/admin/settings')).data.settings.times.mc, 30, 'настройките са запазени');
    console.log('OK: админ панел, акаунти, награди, снимки, идеи, настройки и запазване');
  } finally {
    await stopServer();
    fs.rmSync(DIR, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); proc && proc.kill(); process.exit(1); });
