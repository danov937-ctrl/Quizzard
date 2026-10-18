// Възрастен потвърждава имейла си веднъж и добавя детски профили без ново потвърждение.
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4300 + Math.floor(Math.random() * 90);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-family-'));
const OUTBOX = path.join(DIR, 'outbox');
let proc;

function client() {
  const jar = {};
  return async (method, url, body) => {
    const res = await fetch(`http://localhost:${PORT}` + url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Quizzard': '1', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const [k, v] = kv.split('='); jar[k] = v; }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
}
const outbox = () => (fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX).sort().map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX, f), 'utf8'))) : []);
const mailsTo = (to, text) => outbox().filter((m) => m.to === to && (!text || m.html.includes(text)));
async function waitMail(to, text, n = 1) {
  for (let i = 0; i < 80; i++) { const m = mailsTo(to, text); if (m.length >= n) return m[m.length - 1]; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error(`няма писмо до ${to} с „${text}“`);
}
const tokenOf = (m) => /consent\.html#([A-Za-z0-9_-]+)/.exec(m.html)[1];
const adultBody = (name, email) => ({ adult: true, name, email, password: 'dulga-parola', birthDate: `${new Date().getFullYear() - 35}-05-10`, consent: true });

(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, ADMIN_KEY: 'secret-test', ADMIN_DATA_DIR: DIR, GITHUB_TOKEN: '', DATA_REPO: '', DATABASE_URL: '', MAIL_OUTBOX: OUTBOX, NO_MAIL_TIMER: '1', RESEND_API_KEY: '', PUBLIC_URL: 'https://t.test' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res) => proc.stdout.on('data', (d) => String(d).includes('работи') && res()));
  try {
    const mama = client(), kid = client(), other = client();

    // 1) възрастният се регистрира: чака потвърждение на имейла
    let r = await mama('POST', '/api/account/register', adultBody('Мама1', 'mama@primer.bg'));
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.strictEqual(r.data.user.needsConsent, true);
    const conf = await waitMail('mama@primer.bg', 'Потвърди имейла');
    assert.ok(conf.html.includes('https://t.test/consent.html#'), 'писмо с линк към сайта');
    assert.match(conf.subject, /Потвърдете имейла/);

    // 2) преди потвърждение не може да добавя деца
    r = await mama('POST', '/api/account/child', { name: 'Дете1', password: 'тайна1', grade: 2 });
    assert.strictEqual(r.status, 400); assert.match(r.data.error, /Първо потвърди/);

    // 3) страницата за потвърждение разпознава възрастен; потвърждава се с един клик
    const tok = tokenOf(conf);
    r = await client()('GET', '/api/consent/' + tok);
    assert.strictEqual(r.data.adult, true); assert.strictEqual(r.data.confirmed, false); assert.strictEqual(r.data.report, null);
    r = await client()('POST', '/api/consent/' + tok, { action: 'confirm' });
    assert.strictEqual(r.data.confirmed, true); assert.strictEqual(r.data.adult, true); assert.strictEqual(r.data.report, null);
    await waitMail('mama@primer.bg', 'Имейлът е потвърден');
    assert.strictEqual((await mama('GET', '/api/account/me')).data.user.needsConsent, false);

    // 4) добавя дете: същият имейл, БЕЗ ново писмо за потвърждение
    const before = outbox().length;
    r = await mama('POST', '/api/account/child', { name: 'Дете1', password: 'тайна1', grade: 2 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.data));
    assert.deepStrictEqual(r.data.user.children.map((c) => c.name), ['Дете1']);
    await new Promise((x) => setTimeout(x, 300));
    assert.strictEqual(outbox().length, before, 'за детето няма ново писмо');

    // 5) детето влиза с името и паролата си и не чака потвърждение
    r = await kid('POST', '/api/account/login', { login: 'Дете1', password: 'тайна1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.user.needsConsent, false); assert.strictEqual(r.data.user.hasGuardian, true); assert.strictEqual(r.data.user.grade, 2);

    // 6) проверки: заето име, къса парола, дете не добавя деца, дете не сменя имейла
    assert.match((await mama('POST', '/api/account/child', { name: 'дете1', password: 'тайна1' })).data.error, /заето/);
    assert.strictEqual((await mama('POST', '/api/account/child', { name: 'Дете2', password: 'abc' })).status, 400);
    r = await kid('POST', '/api/account/child', { name: 'Дете9', password: 'тайна1' });
    assert.strictEqual(r.status, 400); assert.match(r.data.error, /възрастен/);
    r = await kid('POST', '/api/account/email', { email: 'drug@primer.bg', password: 'тайна1' });
    assert.strictEqual(r.status, 400); assert.match(r.data.error, /управлява от родителя/);

    // 7) имейлът остава „един имейл = една регистрация“
    r = await other('POST', '/api/account/register', { name: 'Чужд1', email: 'MAMA@primer.bg', password: 'тайна1', grade: 3, consent: true });
    assert.strictEqual(r.status, 400); assert.match(r.data.error, /вече има регистрация/);

    // 8) „Забравена парола“ с имейла дава едно писмо с линк за всеки профил в семейството
    assert.strictEqual((await other('POST', '/api/account/forgot', { login: 'mama@primer.bg' })).status, 200);
    const reset = await waitMail('mama@primer.bg', '/reset.html#');
    assert.ok(reset.html.includes('Мама1') && reset.html.includes('Дете1'), 'в писмото са и възрастният, и детето');

    // 9) смяна на имейла на възрастния: децата го следват, потвърждава се наново (веднъж)
    r = await mama('POST', '/api/account/email', { email: 'mama2@primer.bg', password: 'dulga-parola' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.user.needsConsent, true);
    const conf2 = await waitMail('mama2@primer.bg', '/consent.html#');
    assert.strictEqual((await mama('POST', '/api/account/child', { name: 'Дете2', password: 'тайна1' })).status, 400, 'докато не потвърди новия имейл, не добавя деца');
    assert.strictEqual((await client()('POST', '/api/account/login', { login: 'mama2@primer.bg', password: 'тайна1' })).data.user.name, 'Дете1', 'детето вече е с новия имейл');
    assert.strictEqual((await client()('POST', '/api/consent/' + tokenOf(conf2), { action: 'confirm' })).data.confirmed, true);

    // 10) до 6 деца; изтриване на дете от възрастния (с неговата парола)
    for (let i = 2; i <= 6; i++) assert.strictEqual((await mama('POST', '/api/account/child', { name: 'Дете' + i, password: 'тайна1' })).status, 200, 'дете ' + i);
    r = await mama('POST', '/api/account/child', { name: 'Дете7', password: 'тайна1' });
    assert.strictEqual(r.status, 400); assert.match(r.data.error, /6 детски/);
    const kidId = (await mama('GET', '/api/account/me')).data.user.children.find((c) => c.name === 'Дете6').id;
    assert.strictEqual((await mama('POST', '/api/account/child/delete', { id: kidId, password: 'грешна-парола' })).status, 400);
    assert.strictEqual((await other('POST', '/api/account/child/delete', { id: kidId, password: 'dulga-parola' })).status, 401, 'само влязъл възрастен');
    r = await mama('POST', '/api/account/child/delete', { id: kidId, password: 'dulga-parola' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.user.children.length, 5);
    assert.strictEqual((await client()('POST', '/api/account/login', { login: 'Дете6', password: 'тайна1' })).status, 400, 'изтритото дете не влиза');

    console.log('family: всички проверки минаха');
  } finally {
    proc.kill('SIGTERM');
  }
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
