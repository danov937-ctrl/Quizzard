// Проверка на изпращането през Resend с подменен fetch: повторни опити и Idempotency-Key.
const assert = require('assert');

process.env.RESEND_API_KEY = 're_test_key';
process.env.MAIL_FROM = 'Знаменосци <noreply@mail.example.test>';
process.env.MAIL_RETRY_MS = '1';
delete process.env.MAIL_OUTBOX;
const mail = require('../admin/mail');

const resp = (status, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => `status ${status}` });
let calls;
function stub(...steps) {
  calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
}
const msg = { to: 'mama@example.bg', subject: 'Тест', html: '<p>Тест</p>', text: 'Тест' };

(async () => {
  assert.strictEqual(mail.enabled(), true);

  // 1) Успех от първия опит: един повик, има ключ за идемпотентност и правилен получател
  stub(resp(200));
  assert.deepStrictEqual(await mail.send(msg), { ok: true });
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].opts.headers['Idempotency-Key'], 'има Idempotency-Key');
  assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer re_test_key');
  assert.deepStrictEqual(JSON.parse(calls[0].opts.body).to, ['mama@example.bg']);

  // 2) 500, после 429 с retry-after, после успех: 3 повика с един и същ ключ
  stub(resp(500), resp(429, { 'retry-after': '0' }), resp(200));
  assert.deepStrictEqual(await mail.send(msg), { ok: true });
  assert.strictEqual(calls.length, 3);
  assert.strictEqual(new Set(calls.map((c) => c.opts.headers['Idempotency-Key'])).size, 1, 'повторните опити пазят същия ключ');

  // 3) Различни писма получават различни ключове
  stub(resp(200));
  await mail.send(msg); const k1 = calls[0].opts.headers['Idempotency-Key'];
  await mail.send(msg); const k2 = calls[1].opts.headers['Idempotency-Key'];
  assert.notStrictEqual(k1, k2);

  // 4) Подаден ключ се ползва както е
  stub(resp(200));
  await mail.send({ ...msg, idempotencyKey: 'reset-42' });
  assert.strictEqual(calls[0].opts.headers['Idempotency-Key'], 'reset-42');

  // 5) Грешка 422 (лош адрес): без повторни опити
  stub(resp(422));
  await assert.rejects(mail.send(msg), /Resend 422/);
  assert.strictEqual(calls.length, 1);

  // 6) Мрежова грешка два пъти, после успех
  stub(new Error('ECONNRESET'), new Error('ECONNRESET'), resp(200));
  assert.deepStrictEqual(await mail.send(msg), { ok: true });
  assert.strictEqual(calls.length, 3);

  // 7) Постоянна грешка 500: общо 3 опита и накрая грешка
  stub(resp(500));
  await assert.rejects(mail.send(msg), /Resend 500/);
  assert.strictEqual(calls.length, 3);

  console.log('mail_retry: всички проверки минаха');
})().catch((e) => { console.error(e); process.exit(1); });
