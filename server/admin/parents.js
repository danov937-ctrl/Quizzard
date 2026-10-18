// Всичко с имейла на родителя: потвърждение (съгласие за дете под 14 г.), добре дошъл след потвърждение,
// нова парола, известие за сменена парола, седмичен отчет всеки понеделник и автоматично изтриване на стари профили.
// Без RESEND_API_KEY + MAIL_FROM имейли не се пращат: профилите работят без потвърждение.
const crypto = require('crypto');
const mail = require('./mail');
const { weekKey } = require('./rewards');

const SUBJ = { bel: 'Български език', mat: 'Математика', okol: 'Околен свят', prir: 'Човекът и природата', obsht: 'Човекът и обществото', eng: 'Английски език', muz: 'Музика', izk: 'Изобразително изкуство', tech: 'Технологии', sport: 'Физическо възпитание', comp: 'Компютърно моделиране' };
const CONSENT_DAYS = 30; // непотвърден профил се изтрива след толкова дни
const RESET_MS = 3600000; // линкът за нова парола важи 1 час
const tok = () => crypto.randomBytes(18).toString('base64url');
const eqTok = (a, b) => !!a && !!b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const pct = (ok, n) => (n ? Math.round((100 * ok) / n) : 0);

// Час и ден в София (за пращането в понеделник сутрин)
function sofia(d = new Date()) {
  const f = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sofia', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: f.weekday, hour: Number(f.hour) };
}

class Parents {
  constructor(store, acc, opts = {}) {
    this.store = store; this.acc = acc;
    this.settings = opts.settings || (() => ({}));
    this.audit = opts.audit || (() => {});
    acc.parents = this;
  }
  // Адрес на сайта за линковете в писмата. Не го вземаме от заявката, за да не може някой да подмени линка.
  base() { return (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, ''); }
  async send(to, subject, title, body, text) {
    const html = mail.layout(title, body).replaceAll('{{BASE}}', this.base());
    try { return await mail.send({ to, subject, html, text }); } catch (e) { console.error('mail', e.message); return { error: e.message }; }
  }
  sig(email) { return crypto.createHmac('sha256', this.acc.secret).update('off:' + email).digest('base64url').slice(0, 22); }
  offLink(email) { return `${this.base()}/api/mail/off?e=${encodeURIComponent(email)}&s=${this.sig(email)}`; }

  // ---------- потвърждение от родител ----------
  async askConsent(u) {
    if (!mail.enabled() || !u.email || u.consentAt) return { skipped: true };
    u.consentToken ||= tok(); u.consentAskedAt = new Date().toISOString(); this.store.touch('players');
    const B = this.base(), e = mail.esc;
    if (u.adult) {
      const link = `${B}/consent.html#${u.consentToken}`;
      return this.send(u.email, 'Потвърдете имейла си в „Знаменосци“', 'Потвърдете имейла си',
        `<p>Здравейте! С този имейл е направен профил за възрастен <b>„${e(u.name)}“</b> в „Знаменосци“.</p>
         <p>Натиснете бутона, за да потвърдите, че имейлът е ваш. Това е <b>едно потвърждение</b>: важи и за всички детски профили, които добавите към профила си.</p>
         ${mail.button(link, 'Потвърди имейла')}
         <p>Ако не сте се регистрирали вие, отворете линка и изберете „Изтрий профила“. Без потвърждение профилът се изтрива сам след ${CONSENT_DAYS} дни.</p>`,
        `Потвърдете имейла си в „Знаменосци“: ${link}`);
    }
    return this.send(u.email, `Потвърдете профила на ${u.name} в „Знаменосци“`, 'Потвърдете профила на детето',
      `<p>Здравейте! В „Знаменосци“, образователна игра с въпроси за 1.–4. клас, е направен профил <b>„${e(u.name)}“</b> с вашия имейл.</p>
       <p>Децата под 14 години могат да имат профил само със съгласие от родител. С профила детето пази нивата, значките и резултатите си. Пазим само потребителското име, паролата (криптирана), имейла ви и резултатите от играта.</p>
       ${mail.button(`${B}/consent.html#${u.consentToken}`, 'Прегледай и потвърди')}
       <p>Ако не сте вие или не сте съгласни, отворете линка и изберете „Изтрий профила“. Без потвърждение профилът се изтрива сам след ${CONSENT_DAYS} дни.</p>
       <p style="font-size:13px">След потвърждение ще получавате кратък отчет всеки понеделник. Можете да го спрете с един клик от всяко писмо.</p>`,
      `Потвърдете профила „${u.name}“ в „Знаменосци“: ${B}/consent.html#${u.consentToken}`);
  }
  // ---------- добре дошъл (след потвърждение от родител) ----------
  async welcome(u) {
    if (!mail.enabled() || !u.email || !u.consentAt) return { skipped: true };
    const B = this.base(), e = mail.esc;
    if (u.adult) {
      return this.send(u.email, 'Имейлът е потвърден', 'Имейлът е потвърден ✅',
        `<p>Благодарим! Профилът <b>„${e(u.name)}“</b> в „Знаменосци“ е потвърден и вече се показва в класациите.</p>
         <p>Ако имате деца, влезте в профила си → ⚙️ → „Детски профили“ и добавете профил на детето. <b>Не е нужно ново потвърждение</b>: този имейл важи за всички. Седмичните отчети за децата идват тук.</p>`,
        `Имейлът е потвърден. Детски профили: влезте в профила си → ⚙️ → „Детски профили“.`);
    }
    const link = `${B}/parent.html#${this.acc.league.parentLink(u)}`;
    return this.send(u.email, `Профилът на ${u.name} е потвърден`, 'Профилът е потвърден ✅',
      `<p>Благодарим! Профилът <b>„${e(u.name)}“</b> в „Знаменосци“ е потвърден и детето вече може да пази нивата, значките и резултатите си.</p>
       <p><b>Какво да знаете:</b></p>
       <ul><li>Всеки понеделник ще получавате кратък отчет какво е упражнявало детето.</li>
       <li>Пълният отчет с грешките е винаги на разположение: ${mail.button(link, 'Отвори отчета')}</li>
       <li>Ако детето забрави паролата, от входа има „Забравена парола?“ – линкът идва на този имейл.</li>
       <li>Можете да изтеглите или изтриете данните на детето по всяко време от отчета.</li></ul>`,
      `Профилът „${u.name}“ в „Знаменосци“ е потвърден. Отчет: ${link}`);
  }
  // ---------- известие за сменена парола ----------
  // Само до потвърдени имейли: на непотвърден адрес пращаме единствено писмото за потвърждение
  async passwordChanged(u) {
    if (!mail.enabled() || !u.email || !u.consentAt) return { skipped: true };
    const B = this.base(), e = mail.esc;
    return this.send(u.email, `Паролата на ${u.name} беше сменена`, 'Паролата е сменена 🔑',
      `<p>Паролата на профила <b>„${e(u.name)}“</b> в „Знаменосци“ току-що беше сменена.</p>
       <p>Ако това сте вие или детето, не е нужно да правите нищо.</p>
       <p><b>Ако не сте вие:</b> отворете „Забравена парола?“ на входа и си поставете нова парола, а ако не успеете – пишете ни от страницата <a href="${B}/privacy.html" style="color:#7a5c3e">Поверителност</a>.</p>`,
      `Паролата на профила „${u.name}“ в „Знаменосци“ беше сменена. Ако не сте вие, използвайте „Забравена парола?“ на ${B}`);
  }
  byConsent(t) { return Object.values(this.acc.users).find((u) => eqTok(u.consentToken, t)) || null; }

  // ---------- забравена парола ----------
  // Изпраща едно писмо на всеки имейл с линк за всяко дете към него. Не казваме дали имейлът съществува.
  async forgot(id) {
    id = String(id || '').trim();
    const users = id.includes('@') ? this.acc.byEmail(id) : [this.acc.byName(id)].filter((u) => u && u.email);
    const byMail = {};
    for (const u of users) { if (u.banned) continue; u.reset = { token: tok(), exp: Date.now() + RESET_MS }; (byMail[u.email] ||= []).push(u); }
    if (users.length) this.store.touch('players');
    const B = this.base(), e = mail.esc;
    for (const [to, list] of Object.entries(byMail)) {
      await this.send(to, 'Нова парола за „Знаменосци“', 'Нова парола',
        `<p>Някой поиска нова парола за ${list.length > 1 ? 'профилите' : 'профила'} в „Знаменосци“ с този имейл.</p>
         ${list.map((u) => `<p><b>${e(u.name)}</b></p>${mail.button(`${B}/reset.html#${u.reset.token}`, 'Нова парола за ' + u.name)}`).join('')}
         <p>Линкът важи 1 час. Ако не сте поискали нова парола, просто не правете нищо.</p>`,
        list.map((u) => `${u.name}: ${B}/reset.html#${u.reset.token}`).join('\n'));
    }
    return { ok: true };
  }
  byReset(t) { const u = Object.values(this.acc.users).find((x) => eqTok(x.reset?.token, t)); return u && u.reset.exp > Date.now() ? u : null; }

  // ---------- седмичен отчет ----------
  lastWeek(u) {
    const prev = weekKey(new Date(Date.now() - 7 * 86400000));
    return u.report?.key === prev ? u.report : u.prevReport?.key === prev ? u.prevReport : null;
  }
  async weekly({ force = false } = {}) {
    if (!mail.enabled()) return { sent: 0, skipped: 'no-mail' };
    const wk = weekKey();
    const groups = {};
    for (const u of Object.values(this.acc.users)) {
      if (!u.email || !u.consentAt || u.weeklyMail === false || u.banned) continue;
      if (!force && u.mailedWeek === wk) continue;
      const r = this.lastWeek(u);
      u.mailedWeek = wk; this.store.touch('players');
      if (!r || (!r.answers && !r.games)) continue; // не е играл: не пращаме празно писмо
      (groups[u.email] ||= []).push({ u, r });
    }
    let sent = 0;
    const B = this.base(), e = mail.esc;
    for (const [to, list] of Object.entries(groups)) {
      const blocks = list.map(({ u, r }) => {
        const subj = Object.entries(r.subj || {}).map(([s, v]) => ({ s, n: v[0], p: pct(v[1], v[0]) })).filter((x) => x.n >= 3).sort((a, b) => a.p - b.p);
        const weak = subj.filter((x) => x.p < 60).slice(0, 2), strong = subj.slice().reverse().filter((x) => x.p >= 80).slice(0, 2);
        const link = `${B}/parent.html#${this.acc.league.parentLink(u)}`;
        return `<h3 style="margin:18px 0 6px">${e(u.name)}</h3>
          <p>${(r.days || []).length} ${(r.days || []).length === 1 ? 'ден' : 'дни'} с игра · ${r.games} игри · ${r.answers} отговора · <b>${pct(r.correct, r.answers)}% верни</b></p>
          ${strong.length ? `<p>⭐ Справя се добре с: ${strong.map((x) => `${e(SUBJ[x.s] || x.s)} (${x.p}%)`).join(', ')}</p>` : ''}
          ${weak.length ? `<p>💡 Има нужда от помощ при: ${weak.map((x) => `${e(SUBJ[x.s] || x.s)} (${x.p}%)`).join(', ')}</p>` : ''}
          ${mail.button(link, 'Виж грешките и целия отчет')}`;
      }).join('');
      const out = await this.send(to, `Седмицата в „Знаменосци“: ${list.map((x) => x.u.name).join(', ')}`, 'Какво упражнява детето миналата седмица',
        `${blocks}<p style="font-size:12px"><a href="${e(this.offLink(to))}" style="color:#7a5c3e">Не искам седмичен отчет</a></p>`,
        list.map(({ u, r }) => `${u.name}: ${r.answers} отговора, ${pct(r.correct, r.answers)}% верни`).join('\n') + `\nСпиране: ${this.offLink(to)}`);
      if (!out.error) sent++;
    }
    if (sent) await this.store.flush().catch(() => {});
    return { sent };
  }

  // ---------- изтриване по график ----------
  // Непотвърдени профили след 30 дни и неактивни профили след N месеца (настройка, по подразбиране 24)
  sweep(now = Date.now()) {
    const months = Number(this.settings().retentionMonths) || 24;
    let unconfirmed = 0, inactive = 0;
    for (const u of Object.values(this.acc.users)) {
      if (this.acc.needsConsent(u) && now - Date.parse(u.consentAskedAt || u.createdAt) > CONSENT_DAYS * 86400000) { this.acc.deleteUser(u.id); unconfirmed++; }
      else if (now - Date.parse(u.lastSeen || u.createdAt) > months * 30.5 * 86400000) { this.acc.deleteUser(u.id); inactive++; }
    }
    if (unconfirmed || inactive) this.audit('players-cleanup', null, null, null, { label: `Изтрити автоматично: ${unconfirmed} непотвърдени, ${inactive} неактивни над ${months} месеца` });
    return { unconfirmed, inactive };
  }
  // Вика се на всеки 10 минути
  async tick() {
    const p = this.store.get('players');
    const d = new Date().toISOString().slice(0, 10);
    if (p.sweptOn !== d) { p.sweptOn = d; this.store.touch('players'); this.sweep(); }
    const s = sofia();
    if (s.day === 'Mon' && s.hour >= 8 && p.weeklyOn !== weekKey()) { p.weeklyOn = weekKey(); this.store.touch('players'); await this.weekly(); }
  }
  start() { const t = setInterval(() => this.tick().catch((e) => console.error('parents tick', e)), 10 * 60 * 1000); t.unref(); setTimeout(() => this.tick().catch(() => {}), 30000).unref(); }

  // ---------- HTTP ----------
  // Връща true, ако е обработил заявката
  async handle({ p, url, post, body, me, ip, req, res, json, html }) {
    const acc = this.acc;
    const S = require('./accounts');
    const cons = p.match(/^\/api\/consent\/([A-Za-z0-9_-]{20,40})$/);
    if (cons) {
      if (acc.limited('consent:' + ip, 40, 600000)) return json(res, 429, { error: 'Твърде много опити. Изчакайте малко.' });
      const u = this.byConsent(cons[1]);
      if (!u) return json(res, 404, { error: 'Линкът не е валиден. Може профилът вече да е изтрит.' });
      if (!post) return json(res, 200, { name: u.name, grade: u.grade, createdAt: u.createdAt, email: S.maskEmail(u.email), adult: !!u.adult, confirmed: !!u.consentAt, report: u.consentAt && !u.adult ? acc.league.parentLink(u) : null });
      if (body.action === 'refuse') { acc.deleteUser(u.id); await this.store.flush(); return json(res, 200, { deleted: true }); }
      if (body.action !== 'confirm') return json(res, 400, { error: 'Непознато действие.' });
      const first = !u.consentAt;
      u.consentAt ||= new Date().toISOString(); this.store.touch('players'); await this.store.flush().catch(() => {});
      if (first) this.welcome(u).catch(() => {});
      return json(res, 200, { confirmed: true, adult: !!u.adult, report: u.adult ? null : acc.league.parentLink(u) });
    }
    if (p === '/api/account/consent-resend' && post) {
      if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
      if (acc.limited('resend:' + me.id, 3, 3600000)) return json(res, 429, { error: 'Вече изпратихме писмо. Провери и папката „Спам“.' });
      const out = await this.askConsent(me);
      return json(res, out.error ? 502 : 200, out.error ? { error: 'Не успяхме да изпратим писмото. Опитай по-късно.' } : { ok: true });
    }
    if (p === '/api/account/email' && post) {
      if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
      if (acc.limited('email:' + ip, 10, 600000)) return json(res, 429, { error: 'Твърде много опити. Изчакай 10 минути.' });
      if (!S.safeEq(S.scrypt(body.password, me.salt), me.hash)) return json(res, 400, { error: 'Паролата не е вярна.' });
      const out = acc.setEmail(me, body.email);
      if (out.error) return json(res, 400, out);
      if (!out.same) await this.askConsent(me);
      return json(res, 200, { user: acc.profile(me) });
    }
    if (p === '/api/account/weekly' && post) {
      if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
      me.weeklyMail = !!body.on; this.store.touch('players');
      return json(res, 200, { user: acc.profile(me) });
    }
    if (p === '/api/account/forgot' && post) {
      if (acc.limited('forgot:' + ip, 5, 3600000)) return json(res, 429, { error: 'Твърде много опити. Опитай след час.' });
      if (!mail.enabled()) return json(res, 503, { error: 'В момента не можем да пращаме имейли. Помоли възрастен да ни пише от страницата „Поверителност“.' });
      await this.forgot(body.login);
      return json(res, 200, { ok: true });
    }
    const rs = p.match(/^\/api\/reset\/([A-Za-z0-9_-]{20,40})$/);
    if (rs) {
      if (acc.limited('reset:' + ip, 20, 600000)) return json(res, 429, { error: 'Твърде много опити. Изчакай малко.' });
      const u = this.byReset(rs[1]);
      if (!u) return json(res, 404, { error: 'Линкът е изтекъл или вече е използван. Поискай нов.' });
      if (!post) return json(res, 200, { name: u.name });
      if (String(body.password || '').length < 4) return json(res, 400, { error: 'Паролата трябва да е поне 4 знака.' });
      if (String(body.password).length > 64) return json(res, 400, { error: 'Паролата е твърде дълга.' });
      delete u.reset; acc.setPassword(u, body.password);
      this.passwordChanged(u).catch(() => {});
      return json(res, 200, { user: acc.profile(u) }, { 'Set-Cookie': acc.cookieFor(u, req) });
    }
    if (p === '/api/mail/off') {
      const e = String(url.searchParams.get('e') || '').toLowerCase(), s = String(url.searchParams.get('s') || '');
      const ok = e && eqTok(s, this.sig(e));
      if (ok) { for (const u of acc.byEmail(e)) u.weeklyMail = false; this.store.touch('players'); }
      return html(res, ok ? 200 : 400, ok ? 'Готово. Повече няма да получавате седмичен отчет. Можете да го включите отново от профила на детето (⚙️).' : 'Линкът не е валиден.');
    }
    return false;
  }
}

module.exports = { Parents, CONSENT_DAYS };
