// Админ панел: вход с парола (ADMIN_KEY), API за въпроси, сигнали, стаи, настройки и статистика.
// Свързва се с играта без да променя game.js: допълва няколко метода на Game (време, запис на отговорите, край).
const crypto = require('crypto');
const fs = require('fs');
const { Game } = require('../game');
const { SUBJECTS } = require('../questions');
const { Store } = require('./store');
const { Bank, parseLine, toLine, GRADES, norm } = require('./bank');
const { award, levelOf } = require('./rewards');
const { Accounts, handlePublic, checkName, IDEA_CATEGORIES, IDEA_STATUS } = require('./accounts');

const ADMIN_KEY = process.env.ADMIN_KEY || '';
const SESSION_HOURS = 12;
const DEFAULT_BOTS = ['Бот Мечо', 'Бот Зайо', 'Бот Лиса', 'Бот Щърко'];
const DEFAULT_SETTINGS = {
  times: { mc: 20, num: 20, pick: 15 },
  onlinePlayers: 3, onlineWait: 15, onlineBattleRounds: 3, defaultBattleRounds: 3,
  botNames: DEFAULT_BOTS, disabledSubjects: [],
  maintenance: { on: false, message: 'Играта се обновява. Опитай пак след малко.' },
  announcement: { on: false, text: '', kind: 'info' },
};
const LIMITS = { audit: 400, reports: 3000, gameLog: 300, days: 180 };

const store = new Store({
  content: { delay: 2000, init: () => ({ overrides: {}, added: {}, settings: {}, audit: [], auditId: 0 }) },
  players: { delay: 60 * 1000, init: () => ({ users: {} }) },
  avatars: { delay: 3000, init: () => ({ pending: {}, approved: {} }) },
  community: { delay: 3000, init: () => ({ ideas: [], ideaId: 0 }) },
  activity: { delay: 5 * 60 * 1000, init: () => ({ days: {}, q: {}, subj: {}, totals: { games: 0, completed: 0, answers: 0, correct: 0 }, reports: [], reportId: 0, gameLog: [] }) },
});
let bank = null, accounts = null;
let ctx = { rooms: new Map(), wss: null, send: () => {}, onBankChange: () => {} };
const startedAt = Date.now();

// ---------- настройки ----------
function settings() {
  const s = store.get('content').settings || {};
  return { ...DEFAULT_SETTINGS, ...s, times: { ...DEFAULT_SETTINGS.times, ...(s.times || {}) }, maintenance: { ...DEFAULT_SETTINGS.maintenance, ...(s.maintenance || {}) }, announcement: { ...DEFAULT_SETTINGS.announcement, ...(s.announcement || {}) } };
}
const clampInt = (v, a, b, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
function cleanSettings(input, cur) {
  const t = input.times || {};
  const s = {
    times: { mc: clampInt(t.mc, 5, 120, cur.times.mc), num: clampInt(t.num, 5, 120, cur.times.num), pick: clampInt(t.pick, 5, 120, cur.times.pick) },
    onlinePlayers: clampInt(input.onlinePlayers, 2, 4, cur.onlinePlayers),
    onlineWait: clampInt(input.onlineWait, 3, 120, cur.onlineWait),
    onlineBattleRounds: clampInt(input.onlineBattleRounds, 2, 5, cur.onlineBattleRounds),
    defaultBattleRounds: clampInt(input.defaultBattleRounds, 2, 5, cur.defaultBattleRounds),
    botNames: Array.isArray(input.botNames) ? input.botNames.map((n) => String(n).replace(/[<>]/g, '').trim().slice(0, 16)).filter(Boolean).slice(0, 8) : cur.botNames,
    disabledSubjects: Array.isArray(input.disabledSubjects) ? input.disabledSubjects.filter((x) => SUBJECTS[x]) : cur.disabledSubjects,
    maintenance: input.maintenance ? { on: !!input.maintenance.on, message: String(input.maintenance.message || '').slice(0, 200) || DEFAULT_SETTINGS.maintenance.message } : cur.maintenance,
    announcement: input.announcement ? { on: !!input.announcement.on, text: String(input.announcement.text || '').slice(0, 300), kind: ['info', 'warn', 'party'].includes(input.announcement.kind) ? input.announcement.kind : 'info' } : cur.announcement,
  };
  if (s.botNames.length < 4) s.botNames = [...s.botNames, ...DEFAULT_BOTS.filter((n) => !s.botNames.includes(n))].slice(0, 4);
  return s;
}

// ---------- връзка с играта ----------
const today = () => new Date().toISOString().slice(0, 10);
function day() {
  const a = store.get('activity'), d = today();
  if (!a.days[d]) {
    a.days[d] = { games: 0, completed: 0, online: 0, friends: 0, bots: 0, humans: 0, answers: 0, correct: 0, peakPlayers: 0, peakRooms: 0 };
    const keys = Object.keys(a.days).sort();
    while (keys.length > LIMITS.days) delete a.days[keys.shift()];
  }
  return a.days[d];
}

function patchGame() {
  const origT = Game.prototype.t;
  Game.prototype.t = function (kind) {
    const s = settings().times[kind];
    return s ? Math.max(1, s * 1000 * this.speed) : origT.call(this, kind);
  };
  // Статистика по въпроси: броят се само отговорите на хора (не на ботове)
  const origRecord = Game.prototype.record;
  Game.prototype.record = function (q, participants, given, ok, best) {
    origRecord.call(this, q, participants, given, ok, best);
    if (!this.meta) return;
    const a = store.get('activity'), d = day();
    for (const pid of participants) {
      const p = this.player(pid);
      if (!p || p.isBot) continue;
      const good = !!ok(pid);
      if (this.meta.uids[pid]) {
        accounts.onAnswer(this.meta.uids[pid], good, q.subject);
        const run = (this.meta.runs[pid] ||= { cur: 0, best: 0, mcN: 0, mcOk: 0 });
        run.cur = good ? run.cur + 1 : 0; run.best = Math.max(run.best, run.cur);
        if (q.kind === 'mc') { run.mcN++; if (good) run.mcOk++; }
      }
      if (q.id && q.id !== 'gen') { const s = (a.q[q.id] ||= [0, 0]); s[0]++; if (good) s[1]++; }
      const sg = ((a.subj[q.subject] ||= {})[q.grade || this.grade] ||= [0, 0]); sg[0]++; if (good) sg[1]++;
      a.totals.answers++; d.answers++; if (good) { a.totals.correct++; d.correct++; }
    }
    store.touch('activity');
  };
  const origFinish = Game.prototype.finish;
  Game.prototype.finish = function () {
    origFinish.call(this);
    if (!this.meta || this.meta.ended) return;
    this.meta.ended = true;
    const a = store.get('activity');
    a.totals.completed++; day().completed++;
    const w = this.player(this.winner);
    for (const [pid, uid] of Object.entries(this.meta.uids)) if (!this.player(pid)?.isBot) accounts.onGameEnd(uid, { won: pid === this.winner, score: this.score(pid), mode: this.meta.mode, run: this.meta.runs[pid] });
    logGame(this, true, w && !w.isBot);
  };
  const origAbort = Game.prototype.abort;
  Game.prototype.abort = function () {
    origAbort.call(this);
    if (this.meta && !this.meta.ended) { this.meta.ended = true; logGame(this, false, false); }
  };
}
function logGame(g, completed, humanWon) {
  const a = store.get('activity');
  a.gameLog.push({ at: new Date(g.meta.at).toISOString(), mode: g.meta.mode, grade: g.grade, humans: g.meta.humans, bots: g.meta.bots, sec: Math.round((Date.now() - g.meta.at) / 1000), completed, humanWon, rounds: g.battleRounds });
  if (a.gameLog.length > LIMITS.gameLog) a.gameLog.splice(0, a.gameLog.length - LIMITS.gameLog);
  store.touch('activity');
}

// Извиква се от сървъра при всяка нова игра
function onGameStart(room, game) {
  const humans = room.members.filter((m) => !m.isBot).length;
  game.meta = { at: Date.now(), mode: room.isPublic ? 'online' : room.mode === 'bots' ? 'bots' : 'friends', humans, bots: room.members.length - humans,
    runs: {}, uids: Object.fromEntries(room.members.filter((m) => m.uid && !m.isBot).map((m) => [m.id, m.uid])) };
  const a = store.get('activity'), d = day();
  a.totals.games++; d.games++; d[game.meta.mode]++; d.humans += humans;
  store.touch('activity');
}

function addReport(entry) {
  const a = store.get('activity');
  a.reports.push({ id: ++a.reportId, status: 'new', note: '', ...entry });
  if (a.reports.length > LIMITS.reports) a.reports.splice(0, a.reports.length - LIMITS.reports);
  store.touch('activity');
}

// Пикове на онлайн играчи и стаи
function sampleLive() {
  const d = day();
  const players = ctx.wss ? ctx.wss.clients.size : 0;
  if (players > d.peakPlayers) { d.peakPlayers = players; store.touch('activity'); }
  if (ctx.rooms.size > d.peakRooms) { d.peakRooms = ctx.rooms.size; store.touch('activity'); }
}

async function init(c) {
  ctx = { ...ctx, ...c };
  await Promise.race([store.init(), new Promise((r) => setTimeout(r, 10000))]);
  bank = new Bank(store.get('content'), () => ctx.onBankChange());
  accounts = new Accounts(store);
  patchGame();
  importOldReports();
  setInterval(sampleLive, 20000).unref();
  const bye = async () => { try { await store.flush(); } finally { process.exit(0); } };
  process.once('SIGTERM', bye); process.once('SIGINT', bye);
}
// Сигналите от стария файл data/reports.jsonl влизат в новия списък веднъж
function importOldReports() {
  const file = ctx.reportsFile;
  const a = store.get('activity');
  if (!file || a.reports.length || !fs.existsSync(file)) return;
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) { try { if (l.trim()) addReport(JSON.parse(l)); } catch {} }
}

// ---------- дневник ----------
function audit(action, key, before, after, extra = {}) {
  const c = store.get('content');
  const q = key ? bank.get(key) : null;
  c.audit.push({ id: ++c.auditId, at: new Date().toISOString(), action, key, label: extra.label || (q ? q.text.slice(0, 90) : ''), before, after });
  if (c.audit.length > LIMITS.audit) c.audit.splice(0, c.audit.length - LIMITS.audit);
  store.touch('content');
}

// ---------- вход ----------
const sign = (exp) => crypto.createHmac('sha256', ADMIN_KEY).update('admin:' + exp).digest('hex');
function tokenOk(tok) {
  if (!ADMIN_KEY || !tok) return false;
  const [exp, sig] = String(tok).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function cookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
const attempts = new Map();
function ipOf(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }

// ---------- HTTP ----------
function json(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 3e6) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Публичен статус за играта: съобщение до всички и режим „поддръжка“
function publicStatus() {
  const s = settings();
  return { announcement: s.announcement.on && s.announcement.text ? { text: s.announcement.text, kind: s.announcement.kind } : null, maintenance: s.maintenance.on ? s.maintenance.message : null };
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/api/status') return json(res, 200, publicStatus());
  if (p.startsWith('/api/account/') || p === '/api/leaderboard' || p.startsWith('/api/ideas') || p.startsWith('/api/avatar/')) {
    try { await handlePublic(accounts, req, res, url, readBody); } catch (e) { console.error('public api', e); json(res, 500, { error: 'Грешка в сървъра.' }); }
    return true;
  }
  if (!p.startsWith('/api/admin/')) return false;
  const route = p.slice('/api/admin/'.length).split('/').map(decodeURIComponent);
  const method = req.method;
  try {
    if (route[0] === 'login' && method === 'POST') return await login(req, res);
    if (route[0] === 'logout') return json(res, 200, { ok: true }, { 'Set-Cookie': 'qz_admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' });
    if (!ADMIN_KEY) return json(res, 503, { error: 'На сървъра не е зададена парола (ADMIN_KEY).', noKey: true });
    if (!tokenOk(cookie(req, 'qz_admin'))) return json(res, 401, { error: 'Нужен е вход.' });
    // Защита от заявки от чужди сайтове: промени само с наш заглавен ред
    if (method !== 'GET' && req.headers['x-quizzard-admin'] !== '1') return json(res, 403, { error: 'Забранено.' });
    const body = method === 'GET' ? {} : await readBody(req);
    const out = await api(method, route, url.searchParams, body, res);
    if (out !== undefined) json(res, out && out.error ? 400 : 200, out);
  } catch (e) {
    console.error('admin api', e);
    json(res, 500, { error: 'Грешка в сървъра: ' + e.message });
  }
  return true;
}

async function login(req, res) {
  const ip = ipOf(req), now = Date.now();
  const a = attempts.get(ip) || { n: 0, until: 0 };
  if (a.until > now) return json(res, 429, { error: `Твърде много опити. Опитай пак след ${Math.ceil((a.until - now) / 60000)} мин.` });
  if (!ADMIN_KEY) return json(res, 503, { error: 'На сървъра не е зададена парола (ADMIN_KEY).', noKey: true });
  const body = await readBody(req).catch(() => ({}));
  const pass = String(body.password || '');
  const ok = pass.length === ADMIN_KEY.length && crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(ADMIN_KEY));
  if (!ok) {
    a.n++; if (a.n >= 5) { a.until = now + 10 * 60 * 1000; a.n = 0; }
    attempts.set(ip, a);
    return json(res, 401, { error: 'Грешна парола.' });
  }
  attempts.delete(ip);
  const exp = now + SESSION_HOURS * 3600 * 1000;
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  json(res, 200, { ok: true }, { 'Set-Cookie': `qz_admin=${exp}.${sign(exp)}; Path=/; Max-Age=${SESSION_HOURS * 3600}; HttpOnly; SameSite=Strict${secure}` });
}

// ---------- помощни за изгледите ----------
function qStats(key) { const s = store.get('activity').q[key]; return s ? { n: s[0], ok: s[1], pct: Math.round((100 * s[1]) / s[0]) } : { n: 0, ok: 0, pct: null }; }
function reportsByKey() {
  const byText = new Map(bank.list().map((q) => [norm(q.text), q.key]));
  const out = {};
  for (const r of store.get('activity').reports) {
    const k = r.question && byText.get(norm(r.question.text));
    if (k) (out[k] ||= []).push(r);
  }
  return out;
}
function liveRooms() {
  return [...ctx.rooms.values()].map((r) => {
    const g = r.game;
    return {
      code: r.code, mode: r.isPublic ? 'online' : r.mode === 'bots' ? 'bots' : 'friends', grade: r.grade, battleRounds: r.battleRounds,
      phase: g ? g.phase : 'lobby', round: g ? g.round : 0, startedAt: g?.meta?.at || null, emptySince: r.emptySince,
      members: r.members.map((m) => ({ id: m.id, name: m.name, isBot: m.isBot, connected: m.isBot || !!m.ws, host: r.hostId === m.id, score: g ? g.score(m.id) : null, alive: g ? g.player(m.id)?.alive : true })),
      question: g?.current?.q ? { text: g.current.q.text, subject: g.current.q.subject } : null,
    };
  });
}
function lastDays(n) {
  const a = store.get('activity'), out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ date: d, ...(a.days[d] || { games: 0, completed: 0, online: 0, friends: 0, bots: 0, humans: 0, answers: 0, correct: 0, peakPlayers: 0, peakRooms: 0 }) });
  }
  return out;
}
function kickMember(room, m, msg) {
  const ws = m.ws;
  m.kicked = true;
  if (room.game && room.game.phase !== 'ended') { m.ws = null; m.isBot = true; room.game.takeOver(m.id); }
  else room.members = room.members.filter((x) => x !== m);
  if (room.hostId === m.id) room.hostId = room.members.find((x) => !x.isBot)?.id || null;
  if (ws) { ctx.send(ws, { t: 'error', msg }); ctx.send(ws, { t: 'left' }); }
}

// ---------- маршрути ----------
async function api(method, route, qs, body, res) {
  const [r0, r1, r2] = route;
  const c = store.get('content'), a = store.get('activity');

  if (r0 === 'me') return { ok: true, storage: store.status };

  if (r0 === 'overview' && method === 'GET') {
    const list = bank.list();
    const active = list.filter((q) => !q.hidden);
    const rooms = liveRooms();
    const s = settings();
    return {
      storage: store.status, uptime: Math.round((Date.now() - startedAt) / 1000), memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      live: { players: ctx.wss ? ctx.wss.clients.size : 0, rooms: rooms.length, playing: rooms.filter((r) => r.phase !== 'lobby' && r.phase !== 'ended').length },
      questions: { total: active.length, mc: active.filter((q) => q.kind === 'mc').length, num: active.filter((q) => q.kind === 'num').length, hidden: list.length - active.length, edited: list.filter((q) => q.edited).length, added: list.filter((q) => q.origin === 'added').length },
      reports: { open: a.reports.filter((x) => x.status === 'new').length, total: a.reports.length },
      players: { total: Object.keys(accounts.users).length, today: Object.values(accounts.users).filter((u) => (u.createdAt || '').startsWith(today())).length, active7: Object.values(accounts.users).filter((u) => Date.now() - Date.parse(u.lastSeen || 0) < 7 * 86400000).length },
      ideas: { open: accounts.ideas.filter((i) => i.status === 'new').length, total: accounts.ideas.length },
      photos: Object.keys(store.get('avatars').pending).length,
      problems: bank.problems().length,
      totals: a.totals, today: lastDays(1)[0], days: lastDays(14),
      maintenance: s.maintenance.on, announcement: s.announcement.on,
      recentGames: a.gameLog.slice(-8).reverse(),
      recentAudit: c.audit.slice(-6).reverse().map(({ before, after, ...x }) => x),
    };
  }

  // ----- въпроси -----
  if (r0 === 'questions' && !r1 && method === 'GET') {
    const term = norm(qs.get('q') || ''), subject = qs.get('subject'), grade = Number(qs.get('grade')) || null, kind = qs.get('kind'), status = qs.get('status') || 'all', sort = qs.get('sort') || '';
    const page = Math.max(1, Number(qs.get('page')) || 1), size = Math.min(200, Math.max(10, Number(qs.get('size')) || 50));
    const reps = reportsByKey();
    const probs = new Map(); for (const x of bank.problems()) (probs.get(x.key) || probs.set(x.key, []).get(x.key)).push(x.msg);
    let items = bank.list().map((q) => ({ ...q, stats: qStats(q.key), reports: (reps[q.key] || []).filter((r) => r.status === 'new').length, problems: probs.get(q.key) || [] }));
    if (term) items = items.filter((q) => norm(q.text).includes(term) || (q.options || []).some((o) => norm(o).includes(term)) || String(q.answer ?? '') === term);
    if (subject) items = items.filter((q) => q.subject === subject);
    if (grade) items = items.filter((q) => q.grade === grade);
    if (kind) items = items.filter((q) => q.kind === kind);
    const F = {
      active: (q) => !q.hidden, hidden: (q) => q.hidden, edited: (q) => q.edited, added: (q) => q.origin === 'added', reported: (q) => q.reports > 0,
      hard: (q) => q.stats.n >= 5 && q.stats.pct < 40, unseen: (q) => !q.hidden && q.stats.n === 0, problems: (q) => q.problems.length > 0,
    };
    if (F[status]) items = items.filter(F[status]);
    const S = {
      hard: (x, y) => (x.stats.pct ?? 101) - (y.stats.pct ?? 101) || y.stats.n - x.stats.n,
      easy: (x, y) => (y.stats.pct ?? -1) - (x.stats.pct ?? -1),
      played: (x, y) => y.stats.n - x.stats.n,
      newest: (x, y) => String(y.createdAt || '').localeCompare(String(x.createdAt || '')),
      text: (x, y) => x.text.localeCompare(y.text, 'bg'),
      grade: (x, y) => x.grade - y.grade || x.subject.localeCompare(y.subject),
    };
    if (S[sort]) items.sort(S[sort]);
    return { total: items.length, page, size, items: items.slice((page - 1) * size, page * size) };
  }
  if (r0 === 'questions' && r1 === 'bulk' && method === 'POST') {
    const keys = Array.isArray(body.keys) ? body.keys.slice(0, 2000) : [];
    let done = 0; const errors = [];
    for (const k of keys) {
      let out;
      if (body.action === 'hide') out = bank.setHidden(k, true);
      else if (body.action === 'show') out = bank.setHidden(k, false);
      else if (body.action === 'delete') out = bank.remove(k);
      else if (body.action === 'grade') out = bank.update(k, { grade: body.value });
      else if (body.action === 'subject') out = bank.update(k, { subject: body.value });
      else return { error: 'Непознато действие.' };
      if (out.error) errors.push(out.error); else { done++; audit('bulk-' + body.action, k, out.before, out.after); }
    }
    return { done, errors: [...new Set(errors)] };
  }
  if (r0 === 'questions' && !r1 && method === 'POST') {
    const out = bank.add(body);
    if (out.error) return out;
    audit('add', out.key, null, out.after);
    return { ok: true, key: out.key };
  }
  if (r0 === 'questions' && r1) {
    const key = r1;
    if (method === 'GET') {
      const q = bank.get(key);
      if (!q) return { error: 'Няма такъв въпрос.' };
      return { q, original: bank.original(key), stats: qStats(key), reports: reportsByKey()[key] || [], history: c.audit.filter((x) => x.key === key).reverse(), problems: bank.problems().filter((x) => x.key === key) };
    }
    let out, action;
    if (method === 'PUT') { out = bank.update(key, body); action = 'edit'; }
    else if (method === 'DELETE') { out = bank.remove(key); action = 'delete'; }
    else if (r2 === 'hide') { out = bank.setHidden(key, true); action = 'hide'; }
    else if (r2 === 'show') { out = bank.setHidden(key, false); action = 'show'; }
    else if (r2 === 'reset') { out = bank.reset(key); action = 'reset'; }
    else return { error: 'Непознато действие.' };
    if (out.error) return out;
    audit(action, key, out.before, out.after, { label: (bank.get(key) || out.before?.added || {}).text?.slice(0, 90) });
    return { ok: true };
  }
  if (r0 === 'import' && method === 'POST') {
    const lines = String(body.text || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).slice(0, 2000);
    const seen = new Set();
    const rows = lines.map((line, i) => {
      const { q, error } = parseLine(line);
      if (error) return { n: i + 1, line, error };
      if (bank.duplicateOf(q.text, null, q.pic) || seen.has(norm(q.text) + q.pic)) return { n: i + 1, line, error: 'Вече има такъв въпрос.' };
      seen.add(norm(q.text) + q.pic);
      return { n: i + 1, line, q };
    });
    let added = 0;
    if (!body.dryRun) for (const r of rows) if (r.q) { const out = bank.add(r.q); if (!out.error) { added++; audit('import', out.key, null, out.after); } else r.error = out.error; }
    return { rows, added, ok: rows.filter((r) => r.q && !r.error).length };
  }
  if (r0 === 'export' && method === 'GET') {
    const kind = qs.get('kind') === 'num' ? 'num' : 'mc', scope = qs.get('scope') || 'active';
    let list = bank.list().filter((q) => q.kind === kind);
    if (scope === 'active') list = list.filter((q) => !q.hidden);
    if (scope === 'changed') list = list.filter((q) => q.edited || q.origin === 'added');
    if (qs.get('subject')) list = list.filter((q) => q.subject === qs.get('subject'));
    list.sort((x, y) => x.subject.localeCompare(y.subject) || x.grade - y.grade);
    const head = kind === 'mc' ? '# клас|предмет|въпрос|ВЕРЕН|грешен|грешен|грешен' : '# клас|предмет|въпрос|отговор';
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="quizzard_${kind}_${scope}.txt"` });
    res.end([head, ...list.map(toLine)].join('\n') + '\n');
    return undefined;
  }
  if (r0 === 'problems') {
    const groups = {};
    for (const x of bank.problems()) { const q = bank.get(x.key); (groups[x.kind] ||= { msg: x.msg, items: [] }).items.push({ key: x.key, text: q.text, subject: q.subject, grade: q.grade, other: x.other ? bank.get(x.other)?.text : null }); }
    return { groups };
  }
  if (r0 === 'coverage') return { coverage: bank.coverage(), subjects: SUBJECTS, disabled: settings().disabledSubjects };

  // ----- анализ -----
  if (r0 === 'analytics' && method === 'GET') {
    const min = Math.max(1, Number(qs.get('min')) || 5);
    const list = bank.list().filter((q) => !q.hidden).map((q) => ({ key: q.key, text: q.text, subject: q.subject, grade: q.grade, kind: q.kind, correct: q.kind === 'mc' ? q.options[0] : q.answer, stats: qStats(q.key) }));
    const played = list.filter((q) => q.stats.n >= min);
    const bySubject = Object.keys(SUBJECTS).map((s) => {
      const g = a.subj[s] || {};
      const grades = Object.fromEntries(GRADES.map((x) => [x, g[x] ? { n: g[x][0], pct: Math.round((100 * g[x][1]) / g[x][0]) } : null]));
      const n = Object.values(g).reduce((t, v) => t + v[0], 0), ok = Object.values(g).reduce((t, v) => t + v[1], 0);
      return { subject: s, name: SUBJECTS[s], n, pct: n ? Math.round((100 * ok) / n) : null, grades };
    });
    const modes = a.gameLog.reduce((m, g) => { (m[g.mode] ||= { n: 0, completed: 0, sec: 0 }); m[g.mode].n++; if (g.completed) { m[g.mode].completed++; m[g.mode].sec += g.sec; } return m; }, {});
    return {
      hardest: played.slice().sort((x, y) => x.stats.pct - y.stats.pct).slice(0, 25),
      easiest: played.slice().sort((x, y) => y.stats.pct - x.stats.pct).slice(0, 15),
      unseen: list.filter((q) => q.stats.n === 0).length, seen: list.length - list.filter((q) => q.stats.n === 0).length,
      bySubject, days: lastDays(30), totals: a.totals, modes, games: a.gameLog.slice().reverse().slice(0, 60),
    };
  }

  // ----- сигнали -----
  if (r0 === 'reports' && method === 'GET') {
    const status = qs.get('status') || 'new';
    const byText = new Map(bank.list().map((q) => [norm(q.text), q.key]));
    const items = a.reports.filter((x) => status === 'all' || x.status === status).slice().reverse().slice(0, 500)
      .map((x) => ({ ...x, key: x.question ? byText.get(norm(x.question.text)) || null : null }));
    const counts = a.reports.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
    const reasons = a.reports.reduce((m, x) => { m[x.reason] = (m[x.reason] || 0) + 1; return m; }, {});
    return { items, counts, reasons };
  }
  if (r0 === 'reports' && r1 === 'bulk' && method === 'POST') {
    const ids = new Set((body.ids || []).map(Number));
    for (const x of a.reports) if (ids.has(x.id) && ['new', 'done', 'dismissed'].includes(body.status)) x.status = body.status;
    store.touch('activity'); await store.save('activity');
    return { ok: true };
  }
  if (r0 === 'reports' && r1 && method === 'PUT') {
    const x = a.reports.find((y) => y.id === Number(r1));
    if (!x) return { error: 'Няма такъв сигнал.' };
    if (['new', 'done', 'dismissed'].includes(body.status)) x.status = body.status;
    if (body.note !== undefined) x.note = String(body.note).slice(0, 500);
    store.touch('activity'); await store.save('activity');
    return { ok: true };
  }

  // ----- стаи на живо -----
  if (r0 === 'rooms' && !r1) return { rooms: liveRooms() };
  if (r0 === 'rooms' && r1 && method === 'POST') {
    const room = ctx.rooms.get(r1);
    if (!room) return { error: 'Стаята вече я няма.' };
    if (r2 === 'close') {
      for (const m of room.members) if (!m.isBot && m.ws) { m.kicked = true; ctx.send(m.ws, { t: 'error', msg: 'Стаята беше затворена от администратор.' }); ctx.send(m.ws, { t: 'left' }); m.ws = null; }
      room.destroy();
      audit('room-close', null, null, null, { label: `Стая ${room.code}` });
      return { ok: true };
    }
    if (r2 === 'kick') {
      const m = room.members.find((x) => x.id === body.pid);
      if (!m) return { error: 'Няма такъв играч.' };
      if (m.isBot) return { error: 'Това е бот.' };
      kickMember(room, m, 'Администратор те извади от стаята.');
      if (!room.members.some((x) => !x.isBot)) room.destroy(); else room.broadcast();
      audit('kick', null, null, null, { label: `${m.name} от стая ${room.code}` });
      return { ok: true };
    }
  }

  // ----- играчи -----
  if (r0 === 'players' && !r1 && method === 'GET') {
    const term = norm(qs.get('q') || ''), sort = qs.get('sort') || 'recent';
    let items = Object.values(accounts.users).map((u) => ({ id: u.id, name: u.name, grade: u.grade, createdAt: u.createdAt, lastSeen: u.lastSeen, games: u.games || 0, wins: u.wins || 0, answers: u.answers || 0, correct: u.correct || 0, best: u.best || 0, xp: u.xp || 0, level: levelOf(u.xp || 0), badges: Object.keys(u.badges || {}).length, avatar: accounts.avatarOf(u), banned: !!u.banned, pct: u.answers ? Math.round((100 * u.correct) / u.answers) : null }));
    if (term) items = items.filter((u) => norm(u.name).includes(term));
    const S = { recent: (x, y) => String(y.lastSeen).localeCompare(String(x.lastSeen)), new: (x, y) => String(y.createdAt).localeCompare(String(x.createdAt)), wins: (x, y) => y.wins - x.wins, games: (x, y) => y.games - x.games, name: (x, y) => x.name.localeCompare(y.name, 'bg') };
    items.sort(S[sort] || S.recent);
    return { total: items.length, items: items.slice(0, 500) };
  }
  if (r0 === 'players' && r1) {
    const u = accounts.users[r1];
    if (!u) return { error: 'Няма такъв играч.' };
    if (method === 'PUT') {
      if (body.name !== undefined && body.name !== u.name) {
        const c = checkName(body.name);
        if (c.error) return c;
        const other = accounts.byName(c.name);
        if (other && other.id !== u.id) return { error: 'Този прякор вече е зает.' };
        audit('player-rename', null, null, null, { label: `${u.name} → ${c.name}` }); u.name = c.name;
      }
      if (body.banned !== undefined && !!body.banned !== !!u.banned) { u.banned = !!body.banned; u.pwv = (u.pwv || 0) + 1; audit(u.banned ? 'player-ban' : 'player-unban', null, null, null, { label: u.name }); }
      if (body.grade !== undefined) u.grade = [1, 2, 3, 4].includes(Number(body.grade)) ? Number(body.grade) : null;
      store.touch('players'); await store.save('players');
      return { ok: true };
    }
    if (method === 'POST' && r2 === 'reset-password') {
      const words = ['лъв', 'мечо', 'зайо', 'сова', 'рибка', 'звезда', 'слънце', 'облак', 'ябълка', 'круша'];
      const pass = words[crypto.randomInt(words.length)] + crypto.randomInt(100, 999);
      accounts.setPassword(u, pass);
      audit('player-password', null, null, null, { label: u.name });
      await store.save('players');
      return { ok: true, password: pass };
    }
    if (method === 'DELETE') {
      delete accounts.users[r1];
      for (const i of accounts.ideas) if (i.uid === r1) { i.uid = null; i.by = null; }
      audit('player-delete', null, null, null, { label: u.name });
      store.touch('players'); store.touch('community'); await store.flush();
      return { ok: true };
    }
  }

  // ----- снимки за одобрение -----
  if (r0 === 'photos' && method === 'GET') {
    const av = store.get('avatars');
    return {
      pending: Object.entries(av.pending).map(([uid, x]) => ({ uid, name: accounts.users[uid]?.name || x.name, at: x.at, data: x.data })),
      approved: Object.entries(av.approved).map(([uid, data]) => ({ uid, name: accounts.users[uid]?.name || '?', data })).slice(0, 300),
    };
  }
  if (r0 === 'photos' && r1 && method === 'POST') {
    const av = store.get('avatars'), u = accounts.users[r1];
    if (r2 === 'approve' && av.pending[r1]) {
      av.approved[r1] = av.pending[r1].data; delete av.pending[r1];
      if (u) { u.avatar = { ...(u.avatar || {}), photo: Date.now() }; u.photoRejected = false; }
      audit('photo-approve', null, null, null, { label: u?.name || r1 });
    } else if (r2 === 'reject') {
      delete av.pending[r1]; delete av.approved[r1];
      if (u) { u.photoRejected = true; if (u.avatar) delete u.avatar.photo; }
      audit('photo-reject', null, null, null, { label: u?.name || r1 });
    } else return { error: 'Няма такава снимка.' };
    store.touch('avatars'); store.touch('players'); await store.flush();
    return { ok: true };
  }

  // ----- идеи от играчите -----
  if (r0 === 'ideas' && !r1 && method === 'GET') {
    const status = qs.get('status') || 'new';
    const items = accounts.ideas.filter((i) => status === 'all' || i.status === status).slice().reverse()
      .map(({ voters, ...i }) => ({ ...i, likes: (voters || []).length }));
    if (qs.get('sort') === 'likes') items.sort((x, y) => y.likes - x.likes);
    const counts = accounts.ideas.reduce((m, i) => { m[i.status] = (m[i.status] || 0) + 1; return m; }, {});
    return { items: items.slice(0, 500), counts, categories: IDEA_CATEGORIES };
  }
  if (r0 === 'ideas' && r1 && method === 'PUT') {
    const i = accounts.ideas.find((x) => x.id === Number(r1));
    if (!i) return { error: 'Няма такава идея.' };
    if (IDEA_STATUS.includes(body.status)) i.status = body.status;
    const author = i.uid && accounts.users[i.uid];
    if (author && ['published', 'planned', 'done'].includes(i.status) && !author.ideaPublished) { author.ideaPublished = true; award(author); store.touch('players'); }
    if (body.reply !== undefined) i.reply = String(body.reply).slice(0, 400);
    if (body.text !== undefined && String(body.text).trim().length >= 5) i.text = String(body.text).replace(/\s+/g, ' ').trim().slice(0, 600);
    store.touch('community'); await store.save('community');
    return { ok: true };
  }
  if (r0 === 'ideas' && r1 && method === 'DELETE') {
    const c2 = store.get('community');
    c2.ideas = c2.ideas.filter((x) => x.id !== Number(r1));
    store.touch('community'); await store.save('community');
    return { ok: true };
  }

  // ----- настройки -----
  if (r0 === 'settings' && method === 'GET') return { settings: settings(), defaults: DEFAULT_SETTINGS, subjects: SUBJECTS };
  if (r0 === 'settings' && method === 'PUT') {
    const before = settings();
    const next = cleanSettings(body, before);
    c.settings = next;
    if (JSON.stringify(before.disabledSubjects) !== JSON.stringify(next.disabledSubjects)) bank.rebuild();
    audit('settings', null, before, next, { label: 'Настройки на играта' });
    await store.save('content');
    return { ok: true, settings: settings() };
  }

  // ----- дневник -----
  if (r0 === 'audit' && !r1 && method === 'GET') return { items: c.audit.slice().reverse() };
  if (r0 === 'audit' && r1 && r2 === 'revert' && method === 'POST') {
    const e = c.audit.find((x) => x.id === Number(r1));
    if (!e) return { error: 'Няма такъв запис.' };
    if (e.action === 'settings') { const before = settings(); c.settings = e.before; bank.rebuild(); audit('revert', null, before, e.before, { label: 'Настройки (върнати)' }); }
    else if (e.key) { const before = bank.snapshot(e.key); bank.restore(e.key, e.before); audit('revert', e.key, before, e.before, { label: e.label }); }
    else return { error: 'Това действие не може да се върне.' };
    e.reverted = true;
    store.touch('content');
    return { ok: true };
  }

  // ----- архив -----
  if (r0 === 'backup' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="quizzard-backup-${today()}.json"` });
    res.end(JSON.stringify({ version: 1, at: new Date().toISOString(), content: c, activity: a, players: store.get('players'), community: store.get('community'), avatars: store.get('avatars') }));
    return undefined;
  }
  if (r0 === 'restore' && method === 'POST') {
    if (!body || body.version !== 1 || !body.content) return { error: 'Това не е архив от панела.' };
    const cc = store.get('content');
    for (const k of Object.keys(cc)) delete cc[k];
    Object.assign(cc, { overrides: {}, added: {}, settings: {}, audit: [], auditId: 0 }, body.content);
    if (body.withActivity) for (const name of ['activity', 'players', 'community', 'avatars']) {
      if (!body[name]) continue;
      const x = store.get(name); for (const k of Object.keys(x)) delete x[k]; Object.assign(x, body[name]);
    }
    bank = new Bank(cc, () => ctx.onBankChange());
    accounts = new Accounts(store);
    audit('restore', null, null, null, { label: 'Възстановен архив от ' + (body.at || '?') });
    for (const n of ['content', 'activity', 'players', 'community', 'avatars']) store.touch(n);
    await store.flush();
    return { ok: true };
  }
  if (r0 === 'storage' && r1 === 'save' && method === 'POST') {
    for (const n of ['content', 'activity', 'players', 'community', 'avatars']) store.touch(n);
    await store.flush();
    return { ok: true, storage: store.status };
  }
  return { error: 'Няма такава функция.' };
}

module.exports = { init, handle, settings, onGameStart, addReport, publicStatus, get bank() { return bank; }, get accounts() { return accounts; } };
