// Състояние на играта за админ панела: грешки от сървъра и от браузърите на играчите
// (еднаквите се събират в един ред с брояч) и аларма по имейл, когато нещо се счупи.
const mail = require('./mail');

const MAX = 150; // различни грешки, които пазим
const ALERT_EVERY = 3600000; // най-много едно писмо на час
const SPIKE = 30; // толкова грешки за 10 минути = аларма

class Health {
  constructor(store, { settings, base }) {
    this.store = store; this.settings = settings; this.base = base;
    const a = store.get('activity'); a.errors ||= [];
    this.recent = []; // времена на последните грешки (за алармата)
    this.lastAlert = 0; this.lastStoreError = null;
    this.hookServer();
  }
  get list() { return this.store.get('activity').errors; }

  // source: 'server' | 'browser'
  add(source, message, where = '', extra = {}) {
    message = String(message || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    where = String(where || '').slice(0, 200);
    if (!message) return;
    const now = new Date().toISOString();
    const key = `${source}|${message}|${where}`;
    let e = this.list.find((x) => x.key === key);
    if (e) { e.count++; e.last = now; if (extra.ua) e.ua = extra.ua; if (extra.page) e.page = extra.page; }
    else {
      e = { key, source, message, where, count: 1, first: now, last: now, ...extra };
      this.list.push(e);
      if (this.list.length > MAX) { this.list.sort((x, y) => Date.parse(y.last) - Date.parse(x.last)); this.list.length = MAX; }
    }
    this.recent.push(Date.now());
    this.store.touch('activity');
  }
  // Всяко console.error на сървъра влиза в дневника (и продължава да се печата в логовете на Render)
  hookServer() {
    if (console.error.__qz) return;
    const orig = console.error;
    const self = this;
    const wrapped = function (...args) {
      orig.apply(console, args);
      try {
        const [first, ...rest] = args;
        const err = args.find((x) => x instanceof Error);
        const text = [first, ...rest].map((x) => (x instanceof Error ? x.message : typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ');
        const where = err?.stack?.split('\n').find((l) => l.includes('/server/') && !l.includes('health.js'))?.trim().replace(/^at\s+/, '') || '';
        self.add('server', text, where);
      } catch {}
    };
    wrapped.__qz = true;
    console.error = wrapped;
    process.on('unhandledRejection', (e) => console.error('Необработена грешка:', e));
  }
  clear() { this.list.length = 0; this.store.touch('activity'); }
  report() {
    return this.list.slice().sort((x, y) => Date.parse(y.last) - Date.parse(x.last)).map(({ key, ...e }) => e);
  }

  // ---------- аларма ----------
  alertTo() {
    const s = this.settings();
    const to = String(s.alertEmail || s.contact || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ? to : null;
  }
  async check(now = Date.now()) {
    this.recent = this.recent.filter((t) => now - t < 600000);
    const st = this.store.status;
    const problems = [];
    if (st.lastError && st.lastError !== this.lastStoreError) problems.push(`Записът на данните не става: ${st.lastError}`);
    this.lastStoreError = st.lastError;
    if (this.recent.length >= SPIKE) problems.push(`${this.recent.length} грешки за последните 10 минути.`);
    if (!problems.length || now - this.lastAlert < ALERT_EVERY) return { sent: false };
    const to = this.alertTo();
    if (!to || !mail.enabled()) return { sent: false };
    this.lastAlert = now;
    const top = this.report().slice(0, 5).map((e) => `<li>${mail.esc(e.message)} <small>(${e.count}×, ${e.source === 'browser' ? 'в браузъра' : 'на сървъра'})</small></li>`).join('');
    const base = this.base();
    await mail.send({
      to, subject: '⚠️ Проблем в играта',
      html: mail.layout('Нещо в играта не е наред', `<p>${problems.map(mail.esc).join('<br>')}</p>${top ? `<p>Последни грешки:</p><ul>${top}</ul>` : ''}${mail.button(base + '/admin/#health', 'Отвори „Състояние“ в панела')}<p style="font-size:12px">Следващо писмо – най-рано след час.</p>`).replaceAll('{{BASE}}', base),
      text: problems.join('\n') + `\n${base}/admin/#health`,
    }).catch((e) => console.error('alert mail', e.message));
    return { sent: true, to };
  }
  start() { setInterval(() => this.check().catch(() => {}), 60000).unref(); }
}

module.exports = { Health };
