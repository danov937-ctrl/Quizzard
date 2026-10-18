// Акаунти на играчите и предложения за играта.
// Играчите са деца (7–10 г.): пазим потребителско име, парола и имейл на родителя (за потвърждение,
// нова парола и седмичен отчет). Без истинско име. Играта работи и без акаунт.
const crypto = require('crypto');
const R = require('./rewards');
const mail = require('./mail');

const COOKIE = 'qz_player';
const SESSION_DAYS = 180;
// Корени на груби думи: такъв прякор не се приема (администраторът може и ръчно да преименува/блокира)
const BAD = ['пишк', 'путк', 'курв', 'шиба', 'ебе', 'еба', 'педал', 'гъз', 'лайна', 'лайно', 'мамка', 'майна', 'хуй', 'fuck', 'shit', 'bitch', 'dick', 'porn', 'секс', 'sex', 'admin', 'админ'];
const IDEA_CATEGORIES = { feature: 'Нова идея', questions: 'Въпроси', design: 'Външен вид', bug: 'Нещо не работи', other: 'Друго' };
const IDEA_STATUS = ['new', 'published', 'planned', 'done', 'rejected'];
const PUBLIC_IDEAS = ['published', 'planned', 'done'];

const normName = (n) => String(n || '').toLowerCase().replace(/\s+/g, ' ').trim();
function checkName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (n.length < 3 || n.length > 16) return { error: 'Прякорът трябва да е между 3 и 16 знака.' };
  if (!/^[a-zA-Zа-яА-ЯёЁ0-9 _\-.]+$/.test(n)) return { error: 'Използвай само букви, цифри, интервал, точка, тире или долна черта.' };
  const flat = n.toLowerCase().replace(/[^a-zа-я]/g, '');
  if (BAD.some((b) => flat.includes(b)) || /^(бот|bot)(\s|$)/i.test(n)) return { error: 'Този прякор не е позволен. Избери друг.' };
  return { name: n };
}
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const EMAIL_TAKEN = 'С този имейл вече има регистрация. Влез в профила си. Ако не помниш паролата, натисни „Забравена парола?“.';
const normEmail = (e) => String(e || '').trim().toLowerCase();
function checkEmail(e) {
  e = normEmail(e);
  if (!e) return { error: 'Напиши имейла на родител.' };
  if (e.length > 120 || !EMAIL_RE.test(e)) return { error: 'Имейлът не изглежда правилен. Провери го.' };
  return { email: e };
}
// Навършени години от дата ГГГГ-ММ-ДД (null при невалидна дата)
function ageOf(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], da = +m[3], t = new Date(Date.UTC(y, mo - 1, da));
  if (t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== da) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < da)) age--;
  return age;
}
const maskEmail = (e) => { if (!e) return null; const [a, d] = e.split('@'); return `${a.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, a.length - 2)))}@${d}`; };
const scrypt = (pass, salt) => crypto.scryptSync(String(pass), salt, 32).toString('hex');
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

class Accounts {
  constructor(store) {
    this.store = store;
    const p = store.get('players');
    p.users ||= {}; p.secret ||= crypto.randomBytes(32).toString('hex');
    if (!store.get('players')._init) { p._init = true; store.touch('players'); }
    const av = store.get('avatars');
    av.pending ||= {}; av.approved ||= {};
    const c = store.get('community');
    c.ideas ||= []; c.ideaId ||= 0;
    this.limits = new Map(); this.hooks = [];
  }
  get users() { return this.store.get('players').users; }
  get secret() { return this.store.get('players').secret; }
  byName(name) { const n = normName(name); return Object.values(this.users).find((u) => normName(u.name) === n) || null; }
  // Един имейл = една регистрация (детски или за възрастен). Старите профили с общ имейл още могат да влизат.
  byEmail(email) { const e = normEmail(email); return e ? Object.values(this.users).filter((u) => u.email === e) : []; }
  // Чака родителят да потвърди по имейл (само ако изпращането на имейли е включено)
  needsConsent(u) { return mail.enabled() && !!u.email && !u.consentAt; }

  // ---------- сесии ----------
  token(u) {
    const exp = Date.now() + SESSION_DAYS * 86400000;
    const sig = crypto.createHmac('sha256', this.secret).update(`${u.id}.${exp}.${u.pwv || 0}`).digest('hex');
    return `${u.id}.${exp}.${sig}`;
  }
  fromToken(tok) {
    const [id, exp, sig] = String(tok || '').split('.');
    const u = id && this.users[id];
    if (!u || !sig || Number(exp) < Date.now() || u.banned) return null;
    const good = crypto.createHmac('sha256', this.secret).update(`${id}.${exp}.${u.pwv || 0}`).digest('hex');
    return safeEq(sig, good) ? u : null;
  }
  fromRequest(req) {
    const m = (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(COOKIE + '='));
    return m ? this.fromToken(decodeURIComponent(m.slice(COOKIE.length + 1))) : null;
  }
  cookieFor(u, req) {
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return u ? `${COOKIE}=${this.token(u)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Lax${secure}` : `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
  }
  // Прост лимит на опитите по IP: key → { n, until }
  limited(key, max, ms) {
    const now = Date.now(), x = this.limits.get(key) || { n: 0, reset: now + ms };
    if (now > x.reset) { x.n = 0; x.reset = now + ms; }
    x.n++; this.limits.set(key, x);
    if (this.limits.size > 5000) for (const [k, v] of this.limits) if (v.reset < now) this.limits.delete(k);
    return x.n > max;
  }

  // Аватар за показване: снимка само ако е одобрена от администратора, иначе вграденото животно
  avatarOf(u) {
    const a = u.avatar || {};
    if (a.photo && this.store.get('avatars').approved[u.id]) return { photo: `/api/avatar/${u.id}?v=${a.photo}` };
    const i = (u.id.charCodeAt(1) + u.id.charCodeAt(2)) || 0;
    return { icon: a.icon || R.AVATARS[i % 12].icon, color: a.color || R.COLORS[i % R.COLORS.length] };
  }
  // Кратко описание за стаята: аватар и ниво на играч с акаунт
  badgeOf(uid) { const u = uid && this.users[uid]; return u ? { avatar: this.avatarOf(u), level: R.levelOf(u.xp || 0), flag: u.flag || null, adult: !!u.adult } : {}; }
  profile(u) {
    if (!u) return null;
    const av = this.store.get('avatars');
    const week = u.week && u.week.key === R.weekKey() ? u.week : { xp: 0, games: 0 };
    return {
      id: u.id, name: u.name, grade: u.grade || null, createdAt: u.createdAt, games: u.games || 0, wins: u.wins || 0, answers: u.answers || 0, correct: u.correct || 0, best: u.best || 0,
      ...R.levelInfo(u.xp || 0), streak: u.lastDay === new Date().toISOString().slice(0, 10) || u.lastDay === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? u.streak || 0 : 0, bestStreak: u.bestStreak || 0,
      week, avatar: this.avatarOf(u), avatarChoice: u.avatar || {}, photoStatus: av.pending[u.id] ? 'pending' : av.approved[u.id] ? (u.avatar?.photo ? 'approved' : 'off') : u.photoRejected ? 'rejected' : null,
      badges: R.badgesFor(u).map((b) => ({ id: b.id, icon: b.icon, name: b.name, desc: b.desc, at: u.badges?.[b.id] || null })),
      newBadges: (u.newBadges || []).map((id) => R.BADGES.find((b) => b.id === id)).filter(Boolean).map(({ id, icon, name, desc }) => ({ id, icon, name, desc })),
      subjects: Object.fromEntries(Object.entries(u.subj || {}).map(([k, v]) => [k, { n: v[0], ok: v[1] }])),
      avatars: R.AVATARS, colors: R.COLORS, ranks: this.ranksOf(u),
      team: this.league ? this.league.publicTeam(this.league.teams[u.team]) : null, hasParentLink: !!u.parentToken,
      adult: !!u.adult, coins: u.adult ? u.coins ?? 0 : null, flag: u.flag || null,
      flagOptions: { patterns: R.FLAG_PATTERNS, colors: R.FLAG_COLORS, emblems: R.FLAG_EMBLEMS },
      email: maskEmail(u.email), needsConsent: this.needsConsent(u), consentAt: u.consentAt || null, weeklyMail: u.weeklyMail !== false, mail: mail.enabled(),
    };
  }
  // Класации: week – най-активни тази седмица (опит), xp – ниво, wins – победи, accuracy – точност (поне 50 отговора)
  // Децата и възрастните имат отделни класации; при възрастните има и класация по парички
  board(kind, adult = false) {
    const wk = R.weekKey();
    const K = {
      week: { f: (u) => u.week?.key === wk && u.week.xp > 0, v: (u) => u.week.xp },
      xp: { f: (u) => (u.xp || 0) > 0, v: (u) => u.xp || 0 },
      wins: { f: (u) => (u.wins || 0) > 0, v: (u) => u.wins || 0 },
      accuracy: { f: (u) => (u.answers || 0) >= 50, v: (u) => Math.round((1000 * u.correct) / u.answers) / 10 },
      coins: { f: (u) => u.adult && (u.coins || 0) > 0, v: (u) => u.coins || 0 },
    }[kind] || null;
    if (!K) return [];
    return Object.values(this.users).filter((u) => !u.banned && !!u.adult === !!adult && !this.needsConsent(u) && K.f(u)).map((u) => ({ u, v: K.v(u) })).sort((a, b) => b.v - a.v || (b.u.xp || 0) - (a.u.xp || 0));
  }
  leaderboard(kind = 'week', limit = 20, adult = false) {
    return this.board(kind, adult).slice(0, limit).map(({ u, v }, i) => ({ place: i + 1, name: u.name, value: v, level: R.levelOf(u.xp || 0), avatar: this.avatarOf(u), badges: Object.keys(u.badges || {}).length, grade: u.grade || null, flag: u.flag || null }));
  }
  ranksOf(u) { const out = {}; for (const k of ['week', 'xp', 'wins', 'accuracy', ...(u.adult ? ['coins'] : [])]) { const i = this.board(k, u.adult).findIndex((x) => x.u === u); out[k] = i >= 0 ? i + 1 : null; } return out; }

  // Регистрация на дете (с имейл и съгласие на родител) или на възрастен (adult: true, рождена дата).
  // От рождената дата пазим само годината.
  register({ name, email, password, grade, consent, adult, birthDate }) {
    if (adult) return this.registerAdult({ name, email, password, consent, birthDate });
    const c = checkName(name);
    if (c.error) return c;
    if (this.byName(c.name)) return { error: 'Това потребителско име вече е заето. Опитай с друго.' };
    const e = checkEmail(email);
    if (e.error) return e;
    if (this.byEmail(e.email).length) return { error: EMAIL_TAKEN };
    if (String(password || '').length < 4) return { error: 'Паролата трябва да е поне 4 знака.' };
    if (String(password).length > 64) return { error: 'Паролата е твърде дълга.' };
    if (!consent) return { error: 'Нужно е съгласие от родител. Помоли мама или татко да прочетат и да отметнат квадратчето.' };
    const salt = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    const u = { id: 'u' + crypto.randomBytes(6).toString('hex'), name: c.name, email: e.email, consentAskedAt: now, consentAt: null, weeklyMail: true, salt, hash: scrypt(password, salt), pwv: 0, grade: [1, 2, 3, 4].includes(Number(grade)) ? Number(grade) : null, createdAt: now, lastSeen: now, games: 0, wins: 0, answers: 0, correct: 0, best: 0 };
    this.users[u.id] = u;
    this.store.touch('players');
    return { user: u };
  }
  registerAdult({ name, email, password, consent, birthDate }) {
    const c = checkName(name);
    if (c.error) return c;
    if (this.byName(c.name)) return { error: 'Това потребителско име вече е заето. Опитай с друго.' };
    const e = checkEmail(email);
    if (e.error) return e;
    if (this.byEmail(e.email).length) return { error: EMAIL_TAKEN };
    const age = ageOf(birthDate);
    if (age === null) return { error: 'Въведи рождената си дата.' };
    if (age < 18) return { error: 'Профил за възрастни може да има само пълнолетен. Можеш да играеш в детския режим с профил, направен от родител.' };
    if (age > 120) return { error: 'Провери рождената дата.' };
    if (String(password || '').length < 8) return { error: 'Паролата трябва да е поне 8 знака.' };
    if (String(password).length > 64) return { error: 'Паролата е твърде дълга.' };
    if (!consent) return { error: 'Нужно е да приемеш условията и политиката за поверителност.' };
    const salt = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    const u = { id: 'u' + crypto.randomBytes(6).toString('hex'), adult: true, birthYear: Number(String(birthDate).slice(0, 4)), name: c.name, email: e.email, termsAt: now, consentAt: now, weeklyMail: false, salt, hash: scrypt(password, salt), pwv: 0, grade: null, createdAt: now, lastSeen: now, games: 0, wins: 0, answers: 0, correct: 0, best: 0 };
    this.users[u.id] = u;
    if (this.wallet) this.wallet.ensure(u);
    this.store.touch('players');
    return { user: u };
  }
  // Вход с потребителско име или с имейл на родителя + парола.
  // Нови регистрации са по една на имейл; при стари профили с общ имейл влиза този, чиято парола съвпада.
  login({ login, name, password }) {
    const id = String(login ?? name ?? '').trim();
    let u = null;
    if (id.includes('@')) {
      const hits = this.byEmail(id).filter((x) => safeEq(scrypt(password, x.salt), x.hash));
      if (hits.length > 1) return { error: 'С този имейл има няколко профила с тази парола. Влез с потребителското име.' };
      u = hits[0] || null;
    } else {
      const x = this.byName(id);
      u = x && safeEq(scrypt(password, x.salt), x.hash) ? x : null;
    }
    if (!u) return { error: id.includes('@') ? 'Грешен имейл или парола.' : 'Грешно потребителско име или парола.' };
    if (u.banned) return { error: 'Този акаунт е спрян. Помоли възрастен да се свърже с нас.' };
    u.lastSeen = new Date().toISOString(); this.store.touch('players');
    return { user: u };
  }
  setEmail(u, email) {
    const e = checkEmail(email);
    if (e.error) return e;
    if (this.byEmail(e.email).some((x) => x.id !== u.id)) return { error: EMAIL_TAKEN };
    if (e.email === u.email) return { ok: true, same: true };
    if (u.adult) { u.email = e.email; this.store.touch('players'); return { ok: true, same: true }; } // без писмо до родител
    u.email = e.email; u.consentAt = null; u.consentAskedAt = new Date().toISOString(); delete u.consentToken;
    this.store.touch('players');
    return { ok: true };
  }
  setPassword(u, password) {
    u.salt = crypto.randomBytes(16).toString('hex'); u.hash = scrypt(password, u.salt); u.pwv = (u.pwv || 0) + 1;
    this.store.touch('players');
  }

  // Извиква се от играта: отговор и край на игра
  // hooks: (user, спечелен опит, { ok, q, given } или { game, won }) – турнири и отчет за родителя
  onAnswer(uid, ok, q, given) {
    const u = this.users[uid]; if (!u) return;
    const before = u.xp || 0;
    R.onAnswer(u, ok, q?.subject);
    for (const h of this.hooks) h(u, (u.xp || 0) - before, { ok, q, given });
    this.store.touch('players');
  }
  onGameEnd(uid, info) {
    const u = this.users[uid]; if (!u) return [];
    const before = u.xp || 0;
    const fresh = R.onGameEnd(u, info);
    for (const h of this.hooks) h(u, (u.xp || 0) - before, { game: true, won: info.won });
    u.lastSeen = new Date().toISOString(); this.store.touch('players');
    return fresh;
  }
  // Пълно изтриване на акаунт: профил, снимка, авторство на идеите
  deleteUser(uid) {
    const u = this.users[uid]; if (!u) return false;
    delete this.users[uid];
    const av = this.store.get('avatars'); delete av.pending[uid]; delete av.approved[uid];
    for (const i of this.ideas) if (i.uid === uid) { i.uid = null; i.by = null; }
    for (const t of this.store.get('community').tournaments || []) for (const team of Object.values(t.players || {})) delete team[uid];
    for (const n of ['players', 'avatars', 'community']) this.store.touch(n);
    return true;
  }
  // Всичко, което пазим за играча (за родителя)
  exportData(u) {
    const { salt, hash, pwv, parentToken, consentToken, reset, ...rest } = u;
    const av = this.store.get('avatars');
    return { ...rest, photo: av.approved[u.id] || av.pending[u.id]?.data || null, ideas: this.ideas.filter((i) => i.uid === u.id).map(({ voters, uid, ...i }) => i), exportedAt: new Date().toISOString() };
  }
  // Снимка за профила: малка (до ~40 KB), вижда се от другите едва след одобрение в панела
  setPhoto(u, dataUrl) {
    if (this.needsConsent(u)) return { error: 'Снимка може да се качи, след като родител потвърди профила по имейл.' };
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) return { error: 'Снимката трябва да е JPG, PNG или WEBP.' };
    if (m[2].length > 60000) return { error: 'Снимката е твърде голяма.' };
    const av = this.store.get('avatars');
    av.pending[u.id] = { data: dataUrl, at: new Date().toISOString(), name: u.name };
    u.photoRejected = false;
    this.store.touch('avatars'); this.store.touch('players');
    return { ok: true };
  }

  // ---------- предложения ----------
  get ideas() { return this.store.get('community').ideas; }
  publicIdea(i, voter) { return { id: i.id, text: i.text, category: i.category, status: i.status, reply: i.reply || '', likes: (i.voters || []).length, liked: !!voter && (i.voters || []).includes(voter), by: i.by || null, at: i.at }; }
  addIdea({ text, category }, user) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 5) return { error: 'Напиши малко повече за идеята си.' };
    if (text.length > 600) return { error: 'Идеята е твърде дълга (най-много 600 знака).' };
    const c = this.store.get('community');
    const idea = { id: ++c.ideaId, text, category: IDEA_CATEGORIES[category] ? category : 'other', status: 'new', reply: '', by: user ? user.name : null, uid: user ? user.id : null, at: new Date().toISOString(), voters: [] };
    c.ideas.push(idea);
    if (c.ideas.length > 3000) c.ideas.splice(0, c.ideas.length - 3000);
    this.store.touch('community');
    return { idea };
  }
  like(id, voter) {
    const i = this.ideas.find((x) => x.id === Number(id) && PUBLIC_IDEAS.includes(x.status));
    if (!i) return { error: 'Няма такава идея.' };
    i.voters ||= [];
    const k = i.voters.indexOf(voter);
    if (k >= 0) i.voters.splice(k, 1); else i.voters.push(voter);
    this.store.touch('community');
    return { likes: i.voters.length, liked: k < 0 };
  }
}

// ---------- HTTP за играчите ----------
function json(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function html(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Знаменосци</title><body style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:0 16px;line-height:1.5"><h1>🚩 Знаменосци</h1><p>${String(text).replace(/[<>&]/g, '')}</p><p><a href="/">Към играта</a></p></body>`);
}
async function handlePublic(acc, req, res, url, readBody) {
  const p = url.pathname;
  const pic = p.match(/^\/api\/avatar\/(u[0-9a-f]+)$/);
  if (pic) {
    const data = acc.store.get('avatars').approved[pic[1]];
    const m = data && /^data:(image\/[a-z]+);base64,(.+)$/.exec(data);
    if (!m) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=86400' });
    return res.end(Buffer.from(m[2], 'base64'));
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const me = acc.fromRequest(req);
  const post = req.method === 'POST';
  if (post && req.headers['x-quizzard'] !== '1') return json(res, 403, { error: 'Забранено.' });
  const body = post ? await readBody(req).catch(() => ({})) : {};

  if (acc.wallet && (await acc.wallet.handle({ p, post, body, me, ip, req, res, json })) !== false) return;
  if (p === '/api/account/flag' && post) {
    if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
    const out = R.cleanFlag(body, me);
    if (out.error) return json(res, 400, out);
    me.flag = out.flag; acc.store.touch('players');
    return json(res, 200, { user: acc.profile(me) });
  }
  if (acc.parents && (await acc.parents.handle({ p, url, post, body, me, ip, req, res, json, html })) !== false) return;
  if (p === '/api/account/me') return json(res, 200, { user: acc.profile(me) });
  if (p === '/api/account/register' && post) {
    // Цял клас може да се регистрира от една училищна мрежа, затова лимитът е по-висок
    if (acc.limited('reg:' + ip, 60, 3600000)) return json(res, 429, { error: 'Твърде много нови акаунти от това място. Опитай по-късно.' });
    const out = acc.register(body);
    if (out.error) return json(res, 400, out);
    if (acc.parents) await acc.parents.askConsent(out.user);
    return json(res, 200, { user: acc.profile(out.user) }, { 'Set-Cookie': acc.cookieFor(out.user, req) });
  }
  if (p === '/api/account/login' && post) {
    if (acc.limited('login:' + ip, 12, 600000)) return json(res, 429, { error: 'Твърде много опити. Изчакай 10 минути.' });
    const out = acc.login(body);
    if (out.error) return json(res, 400, out);
    return json(res, 200, { user: acc.profile(out.user) }, { 'Set-Cookie': acc.cookieFor(out.user, req) });
  }
  if (p === '/api/account/logout' && post) return json(res, 200, { ok: true }, { 'Set-Cookie': acc.cookieFor(null, req) });
  if (p === '/api/account/password' && post) {
    if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
    if (acc.limited('pw:' + ip, 10, 600000)) return json(res, 429, { error: 'Твърде много опити. Изчакай 10 минути.' });
    if (!safeEq(scrypt(body.old, me.salt), me.hash)) return json(res, 400, { error: 'Старата парола не е вярна.' });
    if (String(body.password || '').length < 4) return json(res, 400, { error: 'Новата парола трябва да е поне 4 знака.' });
    acc.setPassword(me, body.password);
    acc.parents?.passwordChanged(me).catch(() => {});
    return json(res, 200, { ok: true }, { 'Set-Cookie': acc.cookieFor(me, req) });
  }
  if (p === '/api/leaderboard') {
    const adult = url.searchParams.get('aud') === 'adult';
    const kind = ['week', 'xp', 'wins', 'accuracy', ...(adult ? ['coins'] : [])].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'week';
    return json(res, 200, { kind, adult, top: acc.leaderboard(kind, 20, adult), me: me && !!me.adult === adult ? { name: me.name, place: acc.ranksOf(me)[kind] } : null });
  }
  const L = acc.league;
  if (p === '/api/tournament') { const t = L.current(); return json(res, 200, { tournament: L.publicTournament(t, me) }); }
  if (p === '/api/account/team' && post) {
    if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
    if (body.leave) return json(res, 200, { ...L.leaveTeam(me), user: acc.profile(me) });
    if (acc.limited('team:' + ip, 20, 600000)) return json(res, 429, { error: 'Твърде много опити. Изчакай малко.' });
    const out = L.joinTeam(me, body.code);
    return json(res, out.error ? 400 : 200, out.error ? out : { ...out, user: acc.profile(me) });
  }
  if (p === '/api/account/parent-link' && post) {
    if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
    return json(res, 200, { token: L.parentLink(me, !!body.renew) });
  }
  if (p === '/api/account/export') {
    if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
    return json(res, 200, acc.exportData(me), { 'Content-Disposition': 'attachment; filename="znamenostsi-moite-danni.json"' });
  }
  if (p === '/api/account/delete' && post) {
    if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
    if (acc.limited('del:' + ip, 10, 600000)) return json(res, 429, { error: 'Твърде много опити. Изчакай 10 минути.' });
    if (!safeEq(scrypt(body.password, me.salt), me.hash)) return json(res, 400, { error: 'Паролата не е вярна.' });
    acc.deleteUser(me.id); await acc.store.flush();
    return json(res, 200, { ok: true }, { 'Set-Cookie': acc.cookieFor(null, req) });
  }
  // Отчет за родителя по личен линк (без вход): /parent.html#<код>
  const par = p.match(/^\/api\/parent\/([A-Za-z0-9_-]{20,40})(\/delete|\/export)?$/);
  if (par) {
    if (acc.limited('parent:' + ip, 60, 600000)) return json(res, 429, { error: 'Твърде много опити. Изчакай малко.' });
    const u = L.byParentToken(par[1]);
    if (!u) return json(res, 404, { error: 'Линкът не е валиден. Може детето да е направило нов линк или профилът да е изтрит.' });
    if (par[2] === '/export') return json(res, 200, acc.exportData(u), { 'Content-Disposition': 'attachment; filename="znamenostsi-danni.json"' });
    if (par[2] === '/delete' && post) { acc.deleteUser(u.id); await acc.store.flush(); return json(res, 200, { ok: true }); }
    return json(res, 200, { report: L.report(u) });
  }
  if (p === '/api/account/seen' && post) { if (me) { me.newBadges = []; acc.store.touch('players'); } return json(res, 200, { ok: true }); }
  if (p === '/api/account/avatar' && post) {
    if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
    const lvl = R.levelOf(me.xp || 0);
    if (body.photo) {
      if (!acc.store.get('avatars').approved[me.id]) return json(res, 400, { error: 'Снимката още не е одобрена.' });
      me.avatar = { ...(me.avatar || {}), photo: Date.now() };
    } else {
      const a = R.AVATARS.find((x) => x.icon === body.icon);
      if (!a) return json(res, 400, { error: 'Непознат аватар.' });
      if (a.level > lvl) return json(res, 400, { error: `Този аватар се отключва на ниво ${a.level}.` });
      me.avatar = { icon: a.icon, color: R.COLORS.includes(body.color) ? body.color : R.COLORS[0] };
    }
    acc.store.touch('players');
    return json(res, 200, { user: acc.profile(me) });
  }
  if (p === '/api/account/photo' && post) {
    if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
    if (acc.limited('photo:' + me.id, 5, 3600000)) return json(res, 429, { error: 'Опитай пак по-късно.' });
    const out = acc.setPhoto(me, body.data);
    return json(res, out.error ? 400 : 200, out.error ? out : { user: acc.profile(me) });
  }

  if (p === '/api/ideas' && !post) {
    const voter = me ? me.id : String(url.searchParams.get('voter') || '').slice(0, 40);
    const items = acc.ideas.filter((i) => PUBLIC_IDEAS.includes(i.status)).map((i) => acc.publicIdea(i, voter)).sort((a, b) => b.likes - a.likes || b.id - a.id).slice(0, 100);
    const mine = me ? acc.ideas.filter((i) => i.uid === me.id).slice(-10).reverse().map((i) => acc.publicIdea(i, voter)) : [];
    return json(res, 200, { items, mine, categories: IDEA_CATEGORIES });
  }
  if (p === '/api/ideas' && post) {
    if (acc.limited('idea:' + ip, 8, 3600000)) return json(res, 429, { error: 'Благодарим! Изпрати следващата идея малко по-късно.' });
    const out = acc.addIdea(body, me);
    return json(res, out.error ? 400 : 200, out.error ? out : { ok: true });
  }
  const like = p.match(/^\/api\/ideas\/(\d+)\/like$/);
  if (like && post) {
    if (acc.limited('like:' + ip, 60, 600000)) return json(res, 429, { error: 'Изчакай малко.' });
    const voter = me ? me.id : 'v' + String(body.voter || '').replace(/[^a-z0-9]/gi, '').slice(0, 32);
    if (voter.length < 9) return json(res, 400, { error: 'Липсва идентификатор.' });
    const out = acc.like(like[1], voter);
    return json(res, out.error ? 400 : 200, out);
  }
  return json(res, 404, { error: 'Няма такава функция.' });
}

module.exports = { Accounts, handlePublic, ageOf, checkName, checkEmail, normEmail, maskEmail, scrypt, safeEq, IDEA_CATEGORIES, IDEA_STATUS, COOKIE };
