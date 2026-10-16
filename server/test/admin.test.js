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
const OUTBOX = path.join(DIR, 'outbox');
// Последното писмо до този адрес и линкът от него (#код)
function lastMail(to, page) {
  const files = fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX).sort() : [];
  const mails = files.map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX, f), 'utf8'))).filter((m) => m.to === to && (!page || m.html.includes(page)));
  const m = mails[mails.length - 1];
  return m && { ...m, token: page ? new RegExp(page.replace('.', '\\.') + '#([A-Za-z0-9_-]+)').exec(m.html)?.[1] : null };
}

function startServer() {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, ADMIN_KEY: 'secret-test', ADMIN_DATA_DIR: DIR, GAME_SPEED: '0.002', GITHUB_TOKEN: '', DATA_REPO: '', MAIL_OUTBOX: OUTBOX, NO_MAIL_TIMER: '1', RESEND_API_KEY: '', PUBLIC_URL: 'https://quizzard.test' }, stdio: ['ignore', 'pipe', 'inherit'] });
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
    assert.strictEqual((await kid.req('POST', '/api/account/register', { name: 'Звездичка7', password: 'тайна1', consent: true }, false)).status, 400, 'нужен е имейл');
    assert.strictEqual((await kid.req('POST', '/api/account/register', { name: 'Звездичка7', email: 'mama@', password: 'тайна1', consent: true }, false)).status, 400, 'грешен имейл');
    assert.strictEqual((await kid.req('POST', '/api/account/register', { name: 'Звездичка7', email: 'mama@primer.bg', password: 'тайна1' }, false)).status, 400, 'нужно е съгласие');
    r = await kid.req('POST', '/api/account/register', { name: 'Звездичка7', email: ' Mama@Primer.bg ', password: 'тайна1', grade: 2, consent: true }, false);
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.user.needsConsent, 'чака потвърждение от родител');
    assert.ok(!JSON.stringify(r.data.user).includes('mama@primer.bg'), 'имейлът е скрит в профила');
    assert.strictEqual((await client().req('POST', '/api/account/register', { name: 'звездичка7', email: 'x@y.bg', password: 'xxxx', consent: true }, false)).status, 400, 'прякорът е зает');
    assert.strictEqual((await client().req('POST', '/api/account/login', { login: 'Звездичка7', password: 'грешна' }, false)).status, 400);
    assert.strictEqual((await client().req('POST', '/api/account/login', { login: 'MAMA@primer.bg', password: 'тайна1' }, false)).status, 200, 'вход с имейл');
    assert.strictEqual((await client().req('POST', '/api/account/login', { name: 'Звездичка7', password: 'тайна1' }, false)).status, 200, 'вход с потребителско име');
    // брат със същия имейл: входът с имейл намира профила по паролата
    const bro = client();
    assert.strictEqual((await bro.req('POST', '/api/account/register', { name: 'Батко', email: 'mama@primer.bg', password: 'друга9', consent: true }, false)).status, 200);
    assert.strictEqual((await client().req('POST', '/api/account/login', { login: 'mama@primer.bg', password: 'друга9' }, false)).data.user.name, 'Батко');
    // съгласие от родителя по имейл
    const png0 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    assert.strictEqual((await kid.req('POST', '/api/account/photo', { data: png0 }, false)).status, 400, 'без съгласие няма снимка');
    const cm = lastMail('mama@primer.bg', '/consent.html');
    assert.ok(cm && cm.html.includes('https://quizzard.test/consent.html#'), 'писмо за съгласие с линк към сайта');
    const cBro = lastMail('mama@primer.bg', '/consent.html').token;
    assert.strictEqual((await client().req('GET', '/api/consent/' + cBro)).data.name, 'Батко');
    assert.ok((await client().req('POST', '/api/consent/' + cBro, { action: 'refuse' }, false)).data.deleted, 'родителят отказва: профилът се трие');
    assert.strictEqual((await client().req('POST', '/api/account/login', { login: 'Батко', password: 'друга9' }, false)).status, 400);
    const cKid = fs.readdirSync(OUTBOX).sort().map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX, f), 'utf8'))).find((m) => m.subject.includes('Звездичка7'));
    const cTok = /consent\.html#([A-Za-z0-9_-]+)/.exec(cKid.html)[1];
    assert.strictEqual((await client().req('POST', '/api/consent/' + cTok, { action: 'confirm' }, false)).data.confirmed, true);
    assert.ok(!(await kid.req('GET', '/api/account/me', undefined, false)).data.user.needsConsent, 'потвърден');

    // ----- турнир между класове -----
    const team = (await admin.req('POST', '/api/admin/teams', { name: '2А', school: 'ОУ „Христо Ботев“', town: 'София', grade: 2 })).data.team;
    const team2 = (await admin.req('POST', '/api/admin/teams', { name: '2Б', school: 'СУ „Иван Вазов“', grade: 2 })).data.team;
    assert.ok(team.code && team2.code !== team.code);
    const tour = (await admin.req('POST', '/api/admin/tournaments', { name: 'Есенна купа', start: new Date(Date.now() - 86400000).toISOString(), end: new Date(Date.now() + 7 * 86400000).toISOString(), grades: [2] })).data.tournament;
    assert.ok(tour.id);
    assert.strictEqual((await kid.req('POST', '/api/account/team', { code: 'XXXXX' }, false)).status, 400);
    assert.strictEqual((await kid.req('POST', '/api/account/team', { code: team.code.toLowerCase() }, false)).data.user.team.name, '2А');
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
    const cup = (await kid.req('GET', '/api/tournament', undefined, false)).data.tournament;
    assert.strictEqual(cup.status, 'live'); assert.strictEqual(cup.mine.place, 1); assert.ok(cup.myPoints > 0 && cup.teams[0].xp === cup.myPoints, 'точките отиват за класа');
    assert.strictEqual(cup.schools[0].school, 'ОУ „Христо Ботев“');
    // отчет за родителя
    const ptok = (await kid.req('POST', '/api/account/parent-link', {}, false)).data.token;
    const rep = (await client().req('GET', '/api/parent/' + ptok)).data.report;
    assert.strictEqual(rep.name, 'Звездичка7'); assert.strictEqual(rep.week.games, 1); assert.ok(rep.week.answers > 0);
    assert.ok(Array.isArray(rep.mistakes) && rep.tournament.mine.place === 1);
    assert.strictEqual((await client().req('GET', '/api/parent/' + 'x'.repeat(24))).status, 404);
    const ptok2 = (await kid.req('POST', '/api/account/parent-link', { renew: true }, false)).data.token;
    assert.strictEqual((await client().req('GET', '/api/parent/' + ptok)).status, 404, 'старият линк спира');
    assert.strictEqual((await client().req('GET', '/api/parent/' + ptok2)).status, 200);
    // изтегляне на данните
    const mine = (await kid.req('GET', '/api/account/export', undefined, false)).data;
    assert.strictEqual(mine.email, 'mama@primer.bg'); assert.ok(!mine.hash && !mine.salt && !mine.parentToken, 'без паролата и линковете');
    // забравена парола по имейл
    assert.strictEqual((await client().req('POST', '/api/account/forgot', { login: 'Звездичка7' }, false)).status, 200);
    const rTok = lastMail('mama@primer.bg', '/reset.html').token;
    assert.strictEqual((await client().req('GET', '/api/reset/' + rTok)).data.name, 'Звездичка7');
    const rr = client();
    assert.strictEqual((await rr.req('POST', '/api/reset/' + rTok, { password: 'нова55' }, false)).status, 200);
    assert.strictEqual((await rr.req('GET', '/api/account/me', undefined, false)).data.user.name, 'Звездичка7', 'влиза след новата парола');
    assert.strictEqual((await client().req('POST', '/api/reset/' + rTok, { password: 'още1' }, false)).status, 404, 'линкът е еднократен');
    kid.jar.qz_player = rr.jar.qz_player;
    assert.strictEqual((await client().req('GET', '/api/mail/off?e=mama@primer.bg&s=bad')).status, 400);
    assert.strictEqual((await admin.req('POST', '/api/admin/mail/weekly')).status, 200);
    // изтриване от детето и от родителя
    const del1 = client();
    await del1.req('POST', '/api/account/register', { name: 'Временен', email: 'b@b.bg', password: 'abcd', consent: true }, false);
    assert.strictEqual((await del1.req('POST', '/api/account/delete', { password: 'грешна' }, false)).status, 400);
    assert.strictEqual((await del1.req('POST', '/api/account/delete', { password: 'abcd' }, false)).status, 200);
    const del2 = client();
    await del2.req('POST', '/api/account/register', { name: 'Временен2', email: 'c@c.bg', password: 'abcd', consent: true }, false);
    const t2 = (await del2.req('POST', '/api/account/parent-link', {}, false)).data.token;
    assert.ok((await client().req('GET', '/api/parent/' + t2 + '/export')).data.name === 'Временен2');
    assert.strictEqual((await client().req('POST', '/api/parent/' + t2 + '/delete', {}, false)).status, 200);
    assert.strictEqual((await del2.req('GET', '/api/account/me', undefined, false)).data.user, null, 'изтрит от родителя');

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
    assert.strictEqual(pl.items[0].consent, 'yes'); assert.strictEqual(pl.items[0].email, 'mama@primer.bg');
    assert.ok((await admin.req('GET', `/api/admin/players/${me.id}/export`)).data.name === 'Звездичка7');
    assert.strictEqual((await admin.req('GET', '/api/admin/teams')).data.items.find((t) => t.id === team.id).members, 1);
    const reset = (await admin.req('POST', `/api/admin/players/${me.id}/reset-password`)).data;
    assert.strictEqual((await client().req('POST', '/api/account/login', { login: 'Звездичка7', password: reset.password }, false)).status, 200, 'новата парола работи');
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
    assert.strictEqual((await admin.req('GET', '/api/admin/tournaments')).data.items[0].standings.teams[0].name, '2А', 'турнирът е запазен');
    console.log('OK: админ панел, акаунти с имейл, съгласие, нова парола, турнири, отчет за родителя, награди, снимки, идеи, настройки и запазване');
  } finally {
    await stopServer();
    fs.rmSync(DIR, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); proc && proc.kill(); process.exit(1); });
