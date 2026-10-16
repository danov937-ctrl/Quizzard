// Акаунти на играчите и предложения за играта.
// Играчите са деца (7–10 г.), затова пазим само прякор и парола: без имейл, без истинско име.
// Играта работи и без акаунт; акаунтът пази победите и точността и дава място в класацията.
const crypto = require('crypto');
const R = require('./rewards');

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
    this.limits = new Map();
  }
  get users() { return this.store.get('players').users; }
  get secret() { return this.store.get('players').secret; }
  byName(name) { const n = normName(name); return Object.values(this.users).find((u) => normName(u.name) === n) || null; }

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
  badgeOf(uid) { const u = uid && this.users[uid]; return u ? { avatar: this.avatarOf(u), level: R.levelOf(u.xp || 0) } : {}; }
  profile(u) {
    if (!u) return null;
    const av = this.store.get('avatars');
    const week = u.week && u.week.key === R.weekKey() ? u.week : { xp: 0, games: 0 };
    return {
      id: u.id, name: u.name, grade: u.grade || null, createdAt: u.createdAt, games: u.games || 0, wins: u.wins || 0, answers: u.answers || 0, correct: u.correct || 0, best: u.best || 0,
      ...R.levelInfo(u.xp || 0), streak: u.lastDay === new Date().toISOString().slice(0, 10) || u.lastDay === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? u.streak || 0 : 0, bestStreak: u.bestStreak || 0,
      week, avatar: this.avatarOf(u), avatarChoice: u.avatar || {}, photoStatus: av.pending[u.id] ? 'pending' : av.approved[u.id] ? (u.avatar?.photo ? 'approved' : 'off') : u.photoRejected ? 'rejected' : null,
      badges: R.BADGES.map((b) => ({ id: b.id, icon: b.icon, name: b.name, desc: b.desc, at: u.badges?.[b.id] || null })),
      newBadges: (u.newBadges || []).map((id) => R.BADGES.find((b) => b.id === id)).filter(Boolean).map(({ id, icon, name, desc }) => ({ id, icon, name, desc })),
      subjects: Object.fromEntries(Object.entries(u.subj || {}).map(([k, v]) => [k, { n: v[0], ok: v[1] }])),
      avatars: R.AVATARS, colors: R.COLORS, ranks: this.ranksOf(u),
    };
  }
  // Класации: week – най-активни тази седмица (опит), xp – ниво, wins – победи, accuracy – точност (поне 50 отговора)
  board(kind) {
    const wk = R.weekKey();
    const K = {
      week: { f: (u) => u.week?.key === wk && u.week.xp > 0, v: (u) => u.week.xp },
      xp: { f: (u) => (u.xp || 0) > 0, v: (u) => u.xp || 0 },
      wins: { f: (u) => (u.wins || 0) > 0, v: (u) => u.wins || 0 },
      accuracy: { f: (u) => (u.answers || 0) >= 50, v: (u) => Math.round((1000 * u.correct) / u.answers) / 10 },
    }[kind] || null;
    if (!K) return [];
    return Object.values(this.users).filter((u) => !u.banned && K.f(u)).map((u) => ({ u, v: K.v(u) })).sort((a, b) => b.v - a.v || (b.u.xp || 0) - (a.u.xp || 0));
  }
  leaderboard(kind = 'week', limit = 20) {
    return this.board(kind).slice(0, limit).map(({ u, v }, i) => ({ place: i + 1, name: u.name, value: v, level: R.levelOf(u.xp || 0), avatar: this.avatarOf(u), badges: Object.keys(u.badges || {}).length, grade: u.grade || null }));
  }
  ranksOf(u) { const out = {}; for (const k of ['week', 'xp', 'wins', 'accuracy']) { const i = this.board(k).findIndex((x) => x.u === u); out[k] = i >= 0 ? i + 1 : null; } return out; }

  register({ name, password, grade }) {
    const c = checkName(name);
    if (c.error) return c;
    if (this.byName(c.name)) return { error: 'Този прякор вече е зает. Опитай с друг.' };
    if (String(password || '').length < 4) return { error: 'Паролата трябва да е поне 4 знака.' };
    if (String(password).length > 64) return { error: 'Паролата е твърде дълга.' };
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { id: 'u' + crypto.randomBytes(6).toString('hex'), name: c.name, salt, hash: scrypt(password, salt), pwv: 0, grade: [1, 2, 3, 4].includes(Number(grade)) ? Number(grade) : null, createdAt: new Date().toISOString(), lastSeen: new Date().toISOString(), games: 0, wins: 0, answers: 0, correct: 0, best: 0 };
    this.users[u.id] = u;
    this.store.touch('players');
    return { user: u };
  }
  login({ name, password }) {
    const u = this.byName(name);
    if (!u || !safeEq(scrypt(password, u.salt), u.hash)) return { error: 'Грешен прякор или парола.' };
    if (u.banned) return { error: 'Този акаунт е спрян. Помоли възрастен да се свърже с нас.' };
    u.lastSeen = new Date().toISOString(); this.store.touch('players');
    return { user: u };
  }
  setPassword(u, password) {
    u.salt = crypto.randomBytes(16).toString('hex'); u.hash = scrypt(password, u.salt); u.pwv = (u.pwv || 0) + 1;
    this.store.touch('players');
  }

  // Извиква се от играта: отговор и край на игра
  onAnswer(uid, ok, subject) { const u = this.users[uid]; if (!u) return; R.onAnswer(u, ok, subject); this.store.touch('players'); }
  onGameEnd(uid, info) {
    const u = this.users[uid]; if (!u) return [];
    const fresh = R.onGameEnd(u, info);
    u.lastSeen = new Date().toISOString(); this.store.touch('players');
    return fresh;
  }
  // Снимка за профила: малка (до ~40 KB), вижда се от другите едва след одобрение в панела
  setPhoto(u, dataUrl) {
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

  if (p === '/api/account/me') return json(res, 200, { user: acc.profile(me) });
  if (p === '/api/account/register' && post) {
    if (acc.limited('reg:' + ip, 6, 3600000)) return json(res, 429, { error: 'Твърде много нови акаунти от това място. Опитай по-късно.' });
    const out = acc.register(body);
    if (out.error) return json(res, 400, out);
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
    return json(res, 200, { ok: true }, { 'Set-Cookie': acc.cookieFor(me, req) });
  }
  if (p === '/api/leaderboard') {
    const kind = ['week', 'xp', 'wins', 'accuracy'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'week';
    return json(res, 200, { kind, top: acc.leaderboard(kind, 20), me: me ? { name: me.name, place: acc.ranksOf(me)[kind] } : null });
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

module.exports = { Accounts, handlePublic, checkName, IDEA_CATEGORIES, IDEA_STATUS, COOKIE };
