// Изпращане на имейли през Resend (https://resend.com): RESEND_API_KEY + MAIL_FROM (напр. "Знаменосци <noreply@znamenostsi.bg>").
// Без тях имейли не се пращат и сайтът работи без потвърждение от родител.
// MAIL_OUTBOX=<папка> записва писмата като файлове вместо да ги праща (за тестове).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.MAIL_FROM || '';
const OUTBOX = process.env.MAIL_OUTBOX || '';
const enabled = () => !!((KEY && FROM) || OUTBOX);
const RETRY_MS = Number(process.env.MAIL_RETRY_MS) || 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function send({ to, subject, html, text, idempotencyKey }) {
  if (OUTBOX) {
    fs.mkdirSync(OUTBOX, { recursive: true });
    fs.writeFileSync(path.join(OUTBOX, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`), JSON.stringify({ to, subject, html, text }));
    return { ok: true };
  }
  if (!KEY || !FROM) return { skipped: true };
  // Един и същ Idempotency-Key за всички опити: ако първият е стигнал до Resend, повторният не праща второ писмо.
  // Повтаряме до 2 пъти само при мрежова грешка, 429 и 5xx; другите грешки (напр. 422 – лош адрес) се връщат веднага.
  const body = JSON.stringify({ from: FROM, to: [to], subject, html, text });
  const idem = idempotencyKey || crypto.randomUUID();
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem }, body });
    } catch (e) {
      if (attempt >= 2) throw e;
      await sleep(RETRY_MS * 2 ** attempt); continue;
    }
    if (res.ok) return { ok: true };
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      const ra = Number(res.headers?.get?.('retry-after')) * 1000;
      await sleep(Math.min(ra > 0 ? ra : RETRY_MS * 2 ** attempt, 5000)); continue;
    }
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// Обща рамка на писмата
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function layout(title, body) {
  return `<!doctype html><html lang="bg"><body style="margin:0;background:#0e2a4a;padding:24px;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#f4e4bc;border-radius:16px;padding:24px;color:#3a2414">
  <h1 style="margin:0 0 12px;font-size:22px">🚩 Знаменосци</h1><h2 style="font-size:18px;margin:0 0 12px">${esc(title)}</h2>${body}
  <p style="font-size:12px;color:#7a5c3e;margin-top:24px">Получавате това писмо, защото имейлът ви е посочен при регистрация в „Знаменосци“. <a href="{{BASE}}/privacy.html" style="color:#7a5c3e">Поверителност</a></p></div></body></html>`;
}
const button = (href, label) => `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#f2b632;color:#3a2414;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;

module.exports = { send, enabled, layout, button, esc };
