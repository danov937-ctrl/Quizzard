// Един имейл = една регистрация: при регистрация (дете и възрастен) и при смяна на имейла.
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4200 + Math.floor(Math.random() * 90);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-uniq-'));
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
const kid = (name, email) => ({ name, email, password: 'тайна1', grade: 2, consent: true });
const adult = (name, email) => ({ adult: true, name, email, password: 'dulga-parola', birthDate: `${new Date().getFullYear() - 30}-06-15`, consent: true });

(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, ADMIN_KEY: 'secret-test', ADMIN_DATA_DIR: DIR, GITHUB_TOKEN: '', DATA_REPO: '', DATABASE_URL: '', MAIL_OUTBOX: path.join(DIR, 'outbox'), NO_MAIL_TIMER: '1', RESEND_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res) => proc.stdout.on('data', (d) => String(d).includes('работи') && res()));
  try {
    const a = client(), b = client(), c = client(), d = client();

    // 1) първата регистрация минава
    assert.strictEqual((await a('POST', '/api/account/register', kid('Първо1', ' Mama@Primer.bg '))).status, 200);

    // 2) същият имейл (и с други букви) за второ дете не се допуска
    let r = await b('POST', '/api/account/register', kid('Второ2', 'mama@primer.bg'));
    assert.strictEqual(r.status, 400); assert.match(r.data.error, /вече има регистрация/);
    assert.strictEqual((await b('POST', '/api/account/register', kid('Второ2', 'MAMA@PRIMER.BG'))).status, 400, 'без значение от главните букви');
    assert.strictEqual((await b('POST', '/api/account/login', { login: 'Второ2', password: 'тайна1' })).status, 400, 'профилът не е създаден');

    // 3) възрастен със същия имейл също не може
    r = await b('POST', '/api/account/register', adult('Възрастен1', 'mama@primer.bg'));
    assert.strictEqual(r.status, 400); assert.match(r.data.error, /вече има регистрация/);

    // 4) друг имейл минава
    assert.strictEqual((await b('POST', '/api/account/register', kid('Второ2', 'tatko@primer.bg'))).status, 200);
    assert.strictEqual((await c('POST', '/api/account/register', adult('Възрастен1', 'baba@primer.bg'))).status, 200);

    // 5) смяна на имейл към чужд не се допуска, към свободен – да
    r = await b('POST', '/api/account/email', { email: 'mama@primer.bg', password: 'тайна1' });
    assert.strictEqual(r.status, 400); assert.match(r.data.error, /вече има регистрация/);
    assert.strictEqual((await b('POST', '/api/account/email', { email: 'tatko@primer.bg', password: 'тайна1' })).status, 200, 'същия си имейл може да го въведе пак');
    assert.strictEqual((await b('POST', '/api/account/email', { email: 'nov@primer.bg', password: 'тайна1' })).status, 200, 'смяна към свободен имейл');
    r = await c('POST', '/api/account/email', { email: 'nov@primer.bg', password: 'dulga-parola' });
    assert.strictEqual(r.status, 400, 'и възрастен не може да вземе зает имейл');

    // 6) след изтриване на профила имейлът се освобождава
    assert.strictEqual((await a('POST', '/api/account/delete', { password: 'тайна1' })).status, 200);
    assert.strictEqual((await d('POST', '/api/account/register', kid('Трето3', 'mama@primer.bg'))).status, 200, 'свободният имейл може да се ползва пак');

    console.log('unique_email: всички проверки минаха');
  } finally {
    proc.kill('SIGTERM');
  }
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
