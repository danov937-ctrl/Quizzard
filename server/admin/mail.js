// Изпращане на имейли през Resend (https://resend.com): RESEND_API_KEY + MAIL_FROM (напр. "Quizzard <noreply@quizzard.bg>").
// Без тях имейли не се пращат и сайтът работи без потвърждение от родител.
// MAIL_OUTBOX=<папка> записва писмата като файлове вместо да ги праща (за тестове).
const fs = require('fs');
const path = require('path');

const KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.MAIL_FROM || '';
const OUTBOX = process.env.MAIL_OUTBOX || '';
const enabled = () => !!((KEY && FROM) || OUTBOX);

async function send({ to, subject, html, text }) {
  if (OUTBOX) {
    fs.mkdirSync(OUTBOX, { recursive: true });
    fs.writeFileSync(path.join(OUTBOX, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`), JSON.stringify({ to, subject, html, text }));
    return { ok: true };
  }
  if (!KEY || !FROM) return { skipped: true };
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to: [to], subject, html, text }) });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { ok: true };
}

// Обща рамка на писмата
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function layout(title, body) {
  return `<!doctype html><html lang="bg"><body style="margin:0;background:#0e2a4a;padding:24px;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#f4e4bc;border-radius:16px;padding:24px;color:#3a2414">
  <h1 style="margin:0 0 12px;font-size:22px">🧙 Quizzard</h1><h2 style="font-size:18px;margin:0 0 12px">${esc(title)}</h2>${body}
  <p style="font-size:12px;color:#7a5c3e;margin-top:24px">Получавате това писмо, защото имейлът ви е посочен при регистрация на дете в Quizzard. <a href="{{BASE}}/privacy.html" style="color:#7a5c3e">Поверителност</a></p></div></body></html>`;
}
const button = (href, label) => `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#f2b632;color:#3a2414;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;

module.exports = { send, enabled, layout, button, esc };
