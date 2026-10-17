// Награди за играчите с акаунт: точки опит (XP), нива със средновековни титли, значки и аватари.
const SUBJECTS = { bel: 'Български език', mat: 'Математика', okol: 'Околен свят', prir: 'Човекът и природата', obsht: 'Човекът и обществото', eng: 'Английски език', muz: 'Музика', izk: 'Изобразително изкуство', tech: 'Технологии', sport: 'Физическо възпитание', comp: 'Компютърно моделиране' };
const SUBJ_ICON = { bel: '📖', mat: '➗', okol: '🌳', prir: '🔬', obsht: '🏛️', eng: '🇬🇧', muz: '🎵', izk: '🎨', tech: '🛠️', sport: '⚽', comp: '💻' };
// Категориите в режима за възрастни
const ADULT_SUBJECTS = { hist: 'История', geo: 'География', sci: 'Природни науки', film: 'Кино и телевизия', music: 'Музика', spt: 'Спорт', lit: 'Литература', art: 'Изкуство и архитектура', tec: 'Наука и технологии', gen: 'Обща култура' };
const ADULT_ICON = { hist: '📜', geo: '🌍', sci: '🧪', film: '🎬', music: '🎸', spt: '🏅', lit: '📚', art: '🖼️', tec: '🚀', gen: '💡' };
const subjectsOf = (u) => (u.adult ? ADULT_SUBJECTS : SUBJECTS);

// ---------- опит и нива ----------
const XP = { correct: 10, wrong: 2, game: 30, win: 70, firstToday: 20 };
// За ниво n+1 са нужни 100 + 60·(n−1) точки повече от ниво n
const xpFor = (level) => { let t = 0; for (let n = 1; n < level; n++) t += 100 + 60 * (n - 1); return t; };
function levelOf(xp) { let l = 1; while (xp >= xpFor(l + 1)) l++; return l; }
const TITLES = [[1, 'Новобранец'], [3, 'Оръженосец'], [5, 'Рицар'], [8, 'Капитан'], [12, 'Барон'], [16, 'Граф'], [20, 'Херцог'], [25, 'Владетел'], [30, 'Легенда']];
const titleOf = (level) => TITLES.filter(([l]) => level >= l).pop()[1];
function levelInfo(xp = 0) {
  const level = levelOf(xp), from = xpFor(level), to = xpFor(level + 1);
  return { xp, level, title: titleOf(level), from, to, progress: Math.round((100 * (xp - from)) / (to - from)) };
}

// ---------- аватари (вградени; някои се отключват с ниво) ----------
const AVATARS = [
  ['🦁', 1], ['🐯', 1], ['🐻', 1], ['🐼', 1], ['🦊', 1], ['🐰', 1], ['🐸', 1], ['🐵', 1], ['🐱', 1], ['🐶', 1], ['🐨', 1], ['🐧', 1],
  ['🦉', 3], ['🐢', 3], ['🐬', 5], ['🦄', 5], ['🧙', 8], ['🛡️', 8], ['🦖', 10], ['🐲', 12], ['🤴', 16], ['👸', 16], ['🏰', 20], ['👑', 25],
].map(([icon, level]) => ({ icon, level }));
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#f4511e', '#3949ab', '#c0ca33', '#6d4c41'];

// ---------- значки ----------
const sum = (o) => Object.values(o || {}).reduce((t, v) => t + v[1], 0);
const BADGES = [
  { id: 'first_game', icon: '🎮', name: 'Първа битка', desc: 'Изиграй първата си игра', test: (u) => u.games >= 1 },
  { id: 'first_win', icon: '🏆', name: 'Първа победа', desc: 'Спечели игра', test: (u) => u.wins >= 1 },
  { id: 'games_10', icon: '⚔️', name: 'Воин', desc: 'Изиграй 10 игри', test: (u) => u.games >= 10 },
  { id: 'games_50', icon: '🛡️', name: 'Ветеран', desc: 'Изиграй 50 игри', test: (u) => u.games >= 50 },
  { id: 'games_200', icon: '🏰', name: 'Пазител на крепостта', desc: 'Изиграй 200 игри', test: (u) => u.games >= 200 },
  { id: 'wins_10', icon: '🥇', name: 'Победител', desc: 'Спечели 10 игри', test: (u) => u.wins >= 10 },
  { id: 'wins_50', icon: '👑', name: 'Завоевател', desc: 'Спечели 50 игри', test: (u) => u.wins >= 50 },
  { id: 'correct_100', icon: '✅', name: 'Сто верни', desc: 'Отговори вярно на 100 въпроса', test: (u) => u.correct >= 100 },
  { id: 'correct_500', icon: '📚', name: 'Книжен червей', desc: 'Отговори вярно на 500 въпроса', test: (u) => u.correct >= 500 },
  { id: 'correct_2000', icon: '🧠', name: 'Мъдрец', desc: 'Отговори вярно на 2000 въпроса', test: (u) => u.correct >= 2000 },
  { id: 'streak_3', icon: '🔥', name: 'Три дни подред', desc: 'Играй 3 дни подред', test: (u) => (u.bestStreak || 0) >= 3 },
  { id: 'streak_7', icon: '🌟', name: 'Цяла седмица', desc: 'Играй 7 дни подред', test: (u) => (u.bestStreak || 0) >= 7 },
  { id: 'streak_30', icon: '💎', name: 'Цял месец', desc: 'Играй 30 дни подред', test: (u) => (u.bestStreak || 0) >= 30 },
  { id: 'run_5', icon: '⚡', name: 'Пет подред', desc: '5 верни отговора подред в една игра', test: (u) => (u.bestRun || 0) >= 5 },
  { id: 'run_10', icon: '🌩️', name: 'Десет подред', desc: '10 верни отговора подред в една игра', test: (u) => (u.bestRun || 0) >= 10 },
  { id: 'perfect', icon: '💯', name: 'Безгрешен', desc: 'Игра без нито един грешен отговор (поне 8 въпроса)', test: (u) => !!u.perfect },
  { id: 'online_10', icon: '🌍', name: 'Пътешественик', desc: 'Изиграй 10 онлайн игри', test: (u) => (u.modes?.online || 0) >= 10 },
  { id: 'friends_10', icon: '🤝', name: 'Добър приятел', desc: 'Изиграй 10 игри с приятели', test: (u) => (u.modes?.friends || 0) >= 10 },
  { id: 'all_subjects', icon: '🦉', name: 'Всезнайко', desc: 'Поне 5 верни отговора по всеки предмет', test: (u) => Object.keys(subjectsOf(u)).every((s) => (u.subj?.[s]?.[1] || 0) >= 5) },
  { id: 'level_5', icon: '🗡️', name: 'Рицар', desc: 'Стигни ниво 5', test: (u) => levelOf(u.xp || 0) >= 5 },
  { id: 'level_12', icon: '🏅', name: 'Барон', desc: 'Стигни ниво 12', test: (u) => levelOf(u.xp || 0) >= 12 },
  { id: 'level_20', icon: '🎖️', name: 'Херцог', desc: 'Стигни ниво 20', test: (u) => levelOf(u.xp || 0) >= 20 },
  { id: 'idea', icon: '💡', name: 'Изобретател', desc: 'Твоя идея за играта е публикувана', test: (u) => !!u.ideaPublished },
  ...Object.keys(SUBJECTS).map((s) => ({ id: 'master_' + s, aud: 'kid', icon: SUBJ_ICON[s], name: `Майстор: ${SUBJECTS[s]}`, desc: `50 верни отговора по ${SUBJECTS[s]}`, test: (u) => (u.subj?.[s]?.[1] || 0) >= 50 })),
  ...Object.keys(ADULT_SUBJECTS).map((s) => ({ id: 'master_' + s, aud: 'adult', icon: ADULT_ICON[s], name: `Майстор: ${ADULT_SUBJECTS[s]}`, desc: `50 верни отговора по ${ADULT_SUBJECTS[s]}`, test: (u) => (u.subj?.[s]?.[1] || 0) >= 50 })),
  { id: 'coins_5000', aud: 'adult', icon: '💰', name: 'Съкровищница', desc: 'Събери 5000 парички', test: (u) => (u.coinsBest || 0) >= 5000 },
];
// Значките за децата и за възрастните са отделни (напр. „Майстор“ по различните категории)
const badgesFor = (u) => BADGES.filter((b) => !b.aud || b.aud === (u.adult ? 'adult' : 'kid'));

// ---------- знамена ----------
// Всеки играч с профил си прави знаме: шарка, до 3 цвята и емблема. Някои емблеми се отключват с ниво.
const FLAG_PATTERNS = ['h3', 'v3', 'h2', 'v2', 'diag', 'cross', 'nordic', 'chevron', 'solid'];
const FLAG_COLORS = ['#ffffff', '#111111', '#d62828', '#00966e', '#1e5aa8', '#f4c20d', '#f77f00', '#7b2cbf', '#8b5a2b', '#5fa8d3', '#e5383b', '#2b9348'];
const FLAG_EMBLEMS = [
  ['', 1], ['🦁', 1], ['⭐', 1], ['🌙', 1], ['☀️', 1], ['🛡️', 1], ['⚔️', 1], ['🌲', 1], ['🌹', 1], ['🔥', 1],
  ['🦅', 3], ['🐺', 3], ['🐻', 3], ['⚓', 3], ['🏰', 5], ['🗝️', 5], ['🐎', 5], ['🌾', 5], ['🐉', 8], ['👑', 12], ['💎', 16], ['🦄', 20],
].map(([icon, level]) => ({ icon, level }));
function cleanFlag(input, u) {
  const f = input && typeof input === 'object' ? input : {};
  const pattern = FLAG_PATTERNS.includes(f.pattern) ? f.pattern : 'h3';
  const colors = (Array.isArray(f.colors) ? f.colors : []).slice(0, 3).map((c) => (FLAG_COLORS.includes(c) ? c : null));
  if (colors.length < 3 || colors.includes(null)) return { error: 'Избери три цвята от палитрата.' };
  const em = FLAG_EMBLEMS.find((e) => e.icon === (f.emblem || ''));
  if (!em) return { error: 'Непозната емблема.' };
  if (em.level > levelOf(u.xp || 0)) return { error: `Тази емблема се отключва на ниво ${em.level}.` };
  return { flag: { pattern, colors, emblem: em.icon } };
}

// Седмица във формат 2026-W42 (за седмичната класация на най-активните)
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

function addXp(u, n) {
  u.xp = (u.xp || 0) + n;
  const wk = weekKey();
  if (!u.week || u.week.key !== wk) { if (u.week) u.lastWeek = u.week; u.week = { key: wk, xp: 0, games: 0 }; }
  u.week.xp += n;
}
// Проверява за нови значки; връща списъка с току-що спечелените
function award(u) {
  u.badges ||= {}; u.newBadges ||= [];
  const fresh = [];
  for (const b of badgesFor(u)) if (!u.badges[b.id] && b.test(u)) { u.badges[b.id] = new Date().toISOString(); u.newBadges.push(b.id); fresh.push(b.id); }
  if (u.newBadges.length > 20) u.newBadges = u.newBadges.slice(-20);
  return fresh;
}
function onAnswer(u, ok, subject) {
  u.answers = (u.answers || 0) + 1; if (ok) u.correct = (u.correct || 0) + 1;
  if (subject && subjectsOf(u)[subject]) { const s = ((u.subj ||= {})[subject] ||= [0, 0]); s[0]++; if (ok) s[1]++; }
  addXp(u, ok ? XP.correct : XP.wrong);
}
// run: { best: най-дълга серия верни, mcN, mcOk } за тази игра
function onGameEnd(u, { won, score, mode, run }) {
  const today = dayKey(), yesterday = dayKey(new Date(Date.now() - 86400000));
  let gain = XP.game + (won ? XP.win : 0);
  if (u.lastDay !== today) { gain += XP.firstToday; u.streak = u.lastDay === yesterday ? (u.streak || 0) + 1 : 1; u.lastDay = today; }
  u.bestStreak = Math.max(u.bestStreak || 0, u.streak || 1);
  u.games = (u.games || 0) + 1; if (won) u.wins = (u.wins || 0) + 1;
  if (score > (u.best || 0)) u.best = score;
  (u.modes ||= {})[mode] = (u.modes[mode] || 0) + 1;
  if (run) { u.bestRun = Math.max(u.bestRun || 0, run.best || 0); if (run.mcN >= 8 && run.mcOk === run.mcN) u.perfect = true; }
  addXp(u, gain);
  u.week.games = (u.week.games || 0) + 1;
  return award(u);
}

module.exports = { XP, levelInfo, levelOf, AVATARS, COLORS, BADGES, badgesFor, ADULT_SUBJECTS, FLAG_PATTERNS, FLAG_COLORS, FLAG_EMBLEMS, cleanFlag, award, onAnswer, onGameEnd, weekKey, addXp, sum };
