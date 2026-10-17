// Турнири между класове и училища + седмичен отчет за родителя.
// Класът е „отбор“: администраторът (или учителят чрез него) създава клас и дава код,
// децата въвеждат кода в профила си. В активен турнир точките опит на децата отиват и за класа им.
// Отчетът за родителя се отваря с личен линк (без имейл): /parent.html#<код>.
const crypto = require('crypto');
const { weekKey } = require('./rewards');

const code = (n = 5) => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (const b of crypto.randomBytes(n)) s += A[b % A.length]; return s; };
const clean = (s, max) => String(s || '').replace(/[<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const MISTAKES = 40;

class League {
  constructor(store, accounts) {
    this.store = store; this.acc = accounts;
    const c = store.get('community');
    c.teams ||= {}; c.tournaments ||= []; c.tournamentId ||= 0;
    accounts.hooks.push((u, xp, info) => this.onActivity(u, xp, info));
  }
  get c() { return this.store.get('community'); }
  get teams() { return this.c.teams; }

  // ---------- класове ----------
  createTeam({ name, school, town, grade }) {
    name = clean(name, 20); school = clean(school, 80); town = clean(town, 40);
    if (name.length < 1) return { error: 'Напиши име на класа, напр. 3Б.' };
    if (school.length < 3) return { error: 'Напиши името на училището.' };
    let k; do { k = code(); } while (Object.values(this.teams).some((t) => t.code === k));
    const t = { id: 't' + crypto.randomBytes(5).toString('hex'), name, school, town, grade: [1, 2, 3, 4].includes(Number(grade)) ? Number(grade) : null, code: k, createdAt: new Date().toISOString() };
    this.teams[t.id] = t; this.store.touch('community');
    return { team: t };
  }
  updateTeam(id, input) {
    const t = this.teams[id]; if (!t) return { error: 'Няма такъв клас.' };
    if (input.name !== undefined) t.name = clean(input.name, 20) || t.name;
    if (input.school !== undefined) t.school = clean(input.school, 80) || t.school;
    if (input.town !== undefined) t.town = clean(input.town, 40);
    if (input.grade !== undefined) t.grade = [1, 2, 3, 4].includes(Number(input.grade)) ? Number(input.grade) : null;
    if (input.newCode) { let k; do { k = code(); } while (Object.values(this.teams).some((x) => x.code === k)); t.code = k; }
    this.store.touch('community'); return { team: t };
  }
  deleteTeam(id) {
    if (!this.teams[id]) return { error: 'Няма такъв клас.' };
    delete this.teams[id];
    for (const u of Object.values(this.acc.users)) if (u.team === id) delete u.team;
    this.store.touch('community'); this.store.touch('players'); return { ok: true };
  }
  members(id) { return Object.values(this.acc.users).filter((u) => u.team === id); }
  joinTeam(u, k) {
    const t = Object.values(this.teams).find((x) => x.code === String(k || '').toUpperCase().replace(/\s/g, ''));
    if (!t) return { error: 'Няма клас с такъв код. Провери го с учителя.' };
    u.team = t.id; this.store.touch('players');
    return { team: this.publicTeam(t) };
  }
  leaveTeam(u) { delete u.team; this.store.touch('players'); return { ok: true }; }
  publicTeam(t) { return t ? { id: t.id, name: t.name, school: t.school, town: t.town, grade: t.grade } : null; }

  // ---------- турнири ----------
  createTournament({ name, start, end, grades, scoring }) {
    name = clean(name, 60);
    const s = Date.parse(start), e = Date.parse(end);
    if (name.length < 3) return { error: 'Дай име на турнира.' };
    if (!s || !e || e <= s) return { error: 'Провери датите: краят трябва да е след началото.' };
    const t = { id: ++this.c.tournamentId, name, start: new Date(s).toISOString(), end: new Date(e).toISOString(), grades: (grades || []).map(Number).filter((g) => [1, 2, 3, 4].includes(g)), scoring: scoring === 'avg' ? 'avg' : 'sum', scores: {}, players: {}, createdAt: new Date().toISOString() };
    this.c.tournaments.push(t); this.store.touch('community');
    return { tournament: t };
  }
  updateTournament(id, input) {
    const t = this.c.tournaments.find((x) => x.id === Number(id)); if (!t) return { error: 'Няма такъв турнир.' };
    if (input.name) t.name = clean(input.name, 60);
    if (input.start && Date.parse(input.start)) t.start = new Date(Date.parse(input.start)).toISOString();
    if (input.end && Date.parse(input.end)) t.end = new Date(Date.parse(input.end)).toISOString();
    if (Array.isArray(input.grades)) t.grades = input.grades.map(Number).filter((g) => [1, 2, 3, 4].includes(g));
    if (input.scoring) t.scoring = input.scoring === 'avg' ? 'avg' : 'sum';
    this.store.touch('community'); return { tournament: t };
  }
  deleteTournament(id) { this.c.tournaments = this.c.tournaments.filter((x) => x.id !== Number(id)); this.store.touch('community'); return { ok: true }; }
  active(now = Date.now()) { return this.c.tournaments.filter((t) => Date.parse(t.start) <= now && now < Date.parse(t.end)); }
  current() {
    const now = Date.now();
    return this.active(now)[0] || this.c.tournaments.filter((t) => Date.parse(t.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0]
      || this.c.tournaments.filter((t) => Date.parse(t.end) <= now).sort((a, b) => Date.parse(b.end) - Date.parse(a.end))[0] || null;
  }
  // Класиране: класове (сбор или средно на дете, за да е честно към малките класове) и училища
  standings(t) {
    const teams = Object.entries(t.scores).filter(([id]) => this.teams[id]).map(([id, xp]) => {
      const players = Object.keys(t.players[id] || {}).length;
      return { id, ...this.publicTeam(this.teams[id]), xp, players, avg: players ? Math.round(xp / players) : 0 };
    });
    const key = t.scoring === 'avg' ? 'avg' : 'xp';
    teams.sort((a, b) => b[key] - a[key] || b.players - a.players);
    teams.forEach((x, i) => { x.place = i + 1; x.value = x[key]; });
    const bySchool = {};
    for (const x of teams) { const s = (bySchool[x.school] ||= { school: x.school, town: x.town, xp: 0, players: 0, classes: 0 }); s.xp += x.xp; s.players += x.players; s.classes++; }
    const schools = Object.values(bySchool).map((s) => ({ ...s, avg: s.players ? Math.round(s.xp / s.players) : 0 }))
      .sort((a, b) => b[key] - a[key]).map((s, i) => ({ ...s, place: i + 1, value: s[key] }));
    return { teams, schools };
  }
  publicTournament(t, u) {
    if (!t) return null;
    const now = Date.now();
    const st = this.standings(t);
    const mine = u?.team ? st.teams.find((x) => x.id === u.team) || null : null;
    const status = now < Date.parse(t.start) ? 'soon' : now >= Date.parse(t.end) ? 'over' : 'live';
    const myPoints = u?.team ? t.players[u.team]?.[u.id] || 0 : 0;
    return { id: t.id, name: t.name, start: t.start, end: t.end, grades: t.grades, scoring: t.scoring, status, teams: st.teams.slice(0, 30), schools: st.schools.slice(0, 20), mine, myPoints,
      myTeam: u?.team ? this.publicTeam(this.teams[u.team]) : null, eligible: !u?.team ? false : !t.grades.length || !this.teams[u.team]?.grade || t.grades.includes(this.teams[u.team].grade) };
  }

  // ---------- събития от играта ----------
  // info: { ok, q, given } за отговор или { game: true, won } за край на игра
  onActivity(u, xp, info) {
    // турнир
    if (xp > 0 && u.team && this.teams[u.team]) {
      const g = this.teams[u.team].grade;
      for (const t of this.active()) {
        if (t.grades.length && g && !t.grades.includes(g)) continue;
        t.scores[u.team] = (t.scores[u.team] || 0) + xp;
        const p = (t.players[u.team] ||= {}); p[u.id] = (p[u.id] || 0) + xp;
        this.store.touch('community');
      }
    }
    // седмичен отчет
    const wk = weekKey();
    if (!u.report || u.report.key !== wk) { if (u.report) u.prevReport = u.report; u.report = { key: wk, games: 0, wins: 0, answers: 0, correct: 0, subj: {}, days: [] }; }
    const r = u.report, d = new Date().toISOString().slice(0, 10);
    if (!r.days.includes(d)) r.days.push(d);
    if (info.game) { r.games++; if (info.won) r.wins++; }
    else if (info.q) {
      r.answers++; if (info.ok) r.correct++;
      const s = (r.subj[info.q.subject] ||= [0, 0]); s[0]++; if (info.ok) s[1]++;
      if (!info.ok) {
        (u.mistakes ||= []).push({ at: new Date().toISOString(), subject: info.q.subject, grade: info.q.grade, text: info.q.text, right: info.q.kind === 'num' ? info.q.answer : info.q.correct, given: info.given ?? null, kind: info.q.kind });
        if (u.mistakes.length > MISTAKES) u.mistakes.splice(0, u.mistakes.length - MISTAKES);
      }
    }
  }

  // ---------- отчет за родителя ----------
  parentLink(u, renew) {
    if (!u.parentToken || renew) { u.parentToken = crypto.randomBytes(18).toString('base64url'); this.store.touch('players'); }
    return u.parentToken;
  }
  byParentToken(tok) {
    if (!tok || String(tok).length < 20) return null;
    return Object.values(this.acc.users).find((u) => u.parentToken && u.parentToken.length === tok.length && crypto.timingSafeEqual(Buffer.from(u.parentToken), Buffer.from(tok))) || null;
  }
  report(u) {
    const wk = weekKey();
    const cur = u.report?.key === wk ? u.report : { games: 0, wins: 0, answers: 0, correct: 0, subj: {}, days: [] };
    const prev = u.report?.key === wk ? u.prevReport : u.report;
    const subj = (r) => Object.entries(r?.subj || {}).map(([s, v]) => ({ subject: s, n: v[0], ok: v[1], pct: Math.round((100 * v[1]) / v[0]) })).sort((a, b) => b.n - a.n);
    const weekAgo = Date.now() - 7 * 86400000;
    const p = this.acc.profile(u);
    const t = this.current();
    return {
      name: u.name, grade: u.grade, level: p.level, title: p.title, xp: p.xp, streak: p.streak, avatar: p.avatar,
      badges: p.badges.filter((b) => b.at).map(({ icon, name, at }) => ({ icon, name, at })),
      week: { key: wk, games: cur.games, wins: cur.wins, answers: cur.answers, correct: cur.correct, days: cur.days.length, subjects: subj(cur) },
      prev: prev ? { key: prev.key, answers: prev.answers, correct: prev.correct, games: prev.games, days: (prev.days || []).length } : null,
      allTime: { games: u.games || 0, wins: u.wins || 0, answers: u.answers || 0, correct: u.correct || 0, subjects: Object.entries(u.subj || {}).map(([s, v]) => ({ subject: s, n: v[0], ok: v[1], pct: Math.round((100 * v[1]) / v[0]) })).sort((a, b) => a.pct - b.pct) },
      mistakes: (u.mistakes || []).filter((m) => Date.parse(m.at) >= weekAgo).slice(-15).reverse(),
      team: this.publicTeam(this.teams[u.team]), tournament: t ? this.publicTournament(t, u) : null,
      createdAt: u.createdAt,
    };
  }
}

module.exports = { League };
