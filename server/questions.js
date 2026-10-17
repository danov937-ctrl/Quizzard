// Банка въпроси: зарежда текстовите файлове от ../data и добавя генерирани задачи по математика.
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const SUBJECTS = {
  bel: 'Български език', mat: 'Математика', okol: 'Околен свят', prir: 'Човекът и природата',
  obsht: 'Човекът и обществото', eng: 'Английски език', muz: 'Музика', izk: 'Изобразително изкуство',
  tech: 'Технологии', sport: 'Физическо възпитание', comp: 'Компютърно моделиране',
};
// Режим за възрастни (18+): отделни категории и „клас“ ADULT, за да не се смесват с детските въпроси
const ADULT = 9;
const ADULT_SUBJECTS = {
  hist: 'История', geo: 'География', sci: 'Природни науки', film: 'Кино и телевизия', music: 'Музика',
  spt: 'Спорт', lit: 'Литература', art: 'Изкуство и архитектура', tec: 'Наука и технологии', gen: 'Обща култура',
};
// Файловете в data/adult/ са по категории: hist_mc.txt, sport_mc.txt… (името на файла дава ключа)
const ADULT_FILE_KEY = { sport: 'spt', tech: 'tec' };
Object.assign(SUBJECTS, ADULT_SUBJECTS);

function readLines(file) {
  return fs.readFileSync(path.join(DATA, file), 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split('|').map((x) => x.trim()));
}
// questions_mc.txt / questions_num.txt + всички файлове в data/q/ (*_mc.txt и *_num.txt по предмети)
function readAll(suffix, base) {
  const extra = fs.existsSync(path.join(DATA, 'q')) ? fs.readdirSync(path.join(DATA, 'q')).filter((f) => f.endsWith(suffix)).sort().map((f) => 'q/' + f) : [];
  const seen = new Set();
  return [base, ...extra].flatMap(readLines).filter((row) => {
    const pic = row.length === 8 || row.length === 5 ? row[row.length - 1] : ''; // въпроси с картинка се различават по картинката
    const key = String(row[2] || '').toLowerCase().replace(/[^а-яa-z0-9]/g, '') + pic;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// По желание последно поле с картинка (емоджи), напр. въпросите в q/pic_*.txt
const MC = readAll('_mc.txt', 'questions_mc.txt')
  .filter((r) => (r.length === 7 || r.length === 8) && [1, 2, 3, 4].includes(+r[0]) && new Set(r.slice(3, 7)).size === 4)
  .map(([g, s, q, a, b, c, d, pic], i) => ({ id: 'mc' + i, kind: 'mc', grade: +g, subject: s, text: q, correct: a, options: [a, b, c, d], ...(pic ? { pic } : {}) }));
const NUM = readAll('_num.txt', 'questions_num.txt')
  .filter((r) => (r.length === 4 || r.length === 5) && [1, 2, 3, 4].includes(+r[0]) && Number.isInteger(+r[3]))
  .map(([g, s, q, a, pic], i) => ({ id: 'num' + i, kind: 'num', grade: +g, subject: s, text: q, answer: +a, ...(pic ? { pic } : {}) }));

// Въпроси за възрастни: категория|трудност 1-3|въпрос|верен|грешен|грешен|грешен (или …|число)
function readAdult(suffix) {
  const dir = path.join(DATA, 'adult');
  if (!fs.existsSync(dir)) return [];
  const seen = new Set();
  return fs.readdirSync(dir).filter((f) => f.endsWith(suffix)).sort().flatMap((f) => {
    const base = f.slice(0, -suffix.length), subject = ADULT_FILE_KEY[base] || base;
    if (!ADULT_SUBJECTS[subject]) return [];
    return readLines('adult/' + f).map((r) => ({ subject, r })).filter(({ r }) => {
      const key = String(r[2] || '').toLowerCase().replace(/[^а-яa-z0-9]/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });
  });
}
for (const [i, { subject, r }] of readAdult('_mc.txt').entries()) {
  if (r.length !== 7 || new Set(r.slice(3, 7)).size !== 4) continue;
  MC.push({ id: 'amc' + i, kind: 'mc', grade: ADULT, subject, diff: +r[1] || 2, text: r[2], correct: r[3], options: r.slice(3, 7) });
}
for (const [i, { subject, r }] of readAdult('_num.txt').entries()) {
  if (r.length !== 4 || !Number.isInteger(+r[3])) continue;
  NUM.push({ id: 'anum' + i, kind: 'num', grade: ADULT, subject, diff: +r[1] || 2, text: r[2], answer: +r[3] });
}

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Генерирана задача по математика според класа: { text, answer }
function mathTask(grade) {
  const ops = {
    1: () => { const a = rnd(1, 10), b = rnd(1, 10); return Math.random() < 0.5 || a + b > 20 ? [`${a} + ${b}`, a + b] : [`${Math.max(a, b)} − ${Math.min(a, b)}`, Math.abs(a - b)]; },
    2: () => pick([
      () => { const a = rnd(10, 60), b = rnd(5, 39); return [`${a} + ${b}`, a + b]; },
      () => { const a = rnd(30, 99), b = rnd(5, a - 1); return [`${a} − ${b}`, a - b]; },
      () => { const a = rnd(2, 5), b = rnd(2, 10); return [`${a} · ${b}`, a * b]; },
    ])(),
    3: () => pick([
      () => { const a = rnd(100, 600), b = rnd(50, 399); return [`${a} + ${b}`, a + b]; },
      () => { const a = rnd(300, 999), b = rnd(50, a - 1); return [`${a} − ${b}`, a - b]; },
      () => { const a = rnd(2, 10), b = rnd(2, 10); return [`${a} · ${b}`, a * b]; },
      () => { const b = rnd(2, 10), c = rnd(2, 10); return [`${b * c} : ${b}`, c]; },
    ])(),
    4: () => pick([
      () => { const a = rnd(1000, 6000), b = rnd(500, 3999); return [`${a} + ${b}`, a + b]; },
      () => { const a = rnd(12, 99), b = rnd(3, 9); return [`${a} · ${b}`, a * b]; },
      () => { const b = rnd(3, 9), c = rnd(12, 99); return [`${b * c} : ${b}`, c]; },
      () => { const a = rnd(5, 20), b = rnd(3, 12); return [`Какво е лицето на правоъгълник ${a} см на ${b} см (в кв. см)?`, a * b]; },
    ])(),
    [ADULT]: () => pick([
      () => { const a = rnd(12, 49), b = rnd(12, 49); return [`${a} · ${b}`, a * b]; },
      () => { const p = pick([10, 15, 20, 25, 30, 40, 75]), b = rnd(2, 40) * 20; return [`Колко е ${p}% от ${b}?`, (p * b) / 100]; },
      () => { const a = rnd(1000, 9999), b = rnd(1000, 9999); return [`${a} + ${b}`, a + b]; },
      () => { const b = rnd(6, 19), c = rnd(12, 60); return [`${b * c} : ${b}`, c]; },
    ])(),
  };
  const [expr, answer] = ops[grade]();
  return { text: expr.endsWith('?') ? expr : `Колко е ${expr}?`, answer };
}

function mathMC(grade) {
  const t = mathTask(grade);
  const wrong = new Set();
  const spread = Math.max(4, Math.round(Math.abs(t.answer) * 0.15));
  while (wrong.size < 3) {
    const w = t.answer + (Math.random() < 0.5 ? -1 : 1) * rnd(1, spread);
    if (w !== t.answer && w >= 0) wrong.add(w);
  }
  const options = [String(t.answer), ...[...wrong].map(String)];
  return { id: 'gen', kind: 'mc', grade, subject: grade === ADULT ? 'gen' : 'mat', text: t.text, correct: options[0], options: shuffle(options) };
}

function mathNum(grade) {
  const g = grade === ADULT ? ADULT : Math.min(4, grade + 1); // по-трудно, за да има разлика в отговорите
  const t = mathTask(g);
  return { id: 'gen', kind: 'num', grade, subject: grade === ADULT ? 'gen' : 'mat', text: t.text, answer: t.answer };
}

// Подбира въпроси за стая с даден клас, без повторения в рамките на една игра.
// Подбира въпроси за стая: избран клас (и класа под него), избрани предмети (по подразбиране всички),
// без повторения в рамките на една игра.
class QuestionPicker {
  constructor(grade, subjects = null) {
    this.grade = grade;
    this.subjects = subjects && subjects.length ? new Set(subjects) : null;
    this.used = new Set();
  }
  allowed(q) { return !this.subjects || this.subjects.has(q.subject); }
  pool(list) {
    const base = list.filter((q) => this.allowed(q));
    const fresh = (arr) => arr.filter((q) => !this.used.has(q.id));
    const near = base.filter((q) => q.grade <= this.grade && q.grade >= this.grade - 1);
    const lower = this.grade === ADULT ? near : base.filter((q) => q.grade <= this.grade);
    let ok = fresh(near);
    if (!ok.length) ok = fresh(lower);
    if (!ok.length && lower.length) { for (const q of lower) this.used.delete(q.id); ok = near.length ? near : lower; } // свършили са – започваме отначало
    return ok;
  }
  take(q) { if (q.id !== 'gen') this.used.add(q.id); return q; }
  // Първо се избира предмет (равен шанс, без същия предмет два пъти подред), после въпрос от него
  pickBalanced(pool) {
    const bySubj = {};
    for (const q of pool) (bySubj[q.subject] ||= []).push(q);
    let subjects = Object.keys(bySubj);
    if (subjects.length > 1) subjects = subjects.filter((x) => x !== this.lastSubject);
    const subj = pick(subjects);
    this.lastSubject = subj;
    return pick(bySubj[subj]);
  }
  nextMC() {
    const mathOk = (!this.subjects || this.subjects.has('mat')) && this.grade !== ADULT;
    const pool = this.pool(MC);
    if (mathOk && (!pool.length || Math.random() < 0.1)) return mathMC(this.grade);
    if (!pool.length) return mathMC(this.grade);
    const q = this.take(this.pickBalanced(pool));
    return { ...q, options: shuffle(q.options) };
  }
  // Числовите въпроси решават равенства; ако в избраните предмети няма, ползваме сметка
  nextNum() {
    const pool = this.pool(NUM);
    if (!pool.length || Math.random() < (this.grade === ADULT ? 0.15 : 0.4)) return mathNum(this.grade);
    return this.take(pick(pool));
  }
}

// Упражнение и предизвикателство на деня: n въпроса наведнъж (отговорите се пращат, защото няма противник).
// При seed (напр. датата) изборът е еднакъв за всички деца от един клас през този ден.
function seededRandom(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
function practiceSet({ grade, subjects = null, n = 10, seed = null }) {
  const r = seed ? seededRandom(seed) : Math.random;
  const sh = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const set = subjects && subjects.length ? new Set(subjects) : null;
  const ok = (q) => (!set || set.has(q.subject)) && q.grade <= grade && q.grade >= grade - 1;
  // по равно от всеки предмет, като се редуват
  const bySubj = {};
  for (const q of sh(MC.filter(ok))) (bySubj[q.subject] ||= []).push(q);
  const order = sh(Object.keys(bySubj));
  const nums = sh(NUM.filter(ok)).slice(0, Math.floor(n / 5));
  const mcCount = n - nums.length;
  const out = [];
  for (let i = 0; out.length < mcCount && order.length; i++) {
    const s = order[i % order.length], q = bySubj[s].pop();
    if (q) out.push({ ...q, options: sh(q.options) });
    if (!bySubj[s].length) { order.splice(order.indexOf(s), 1); i--; }
  }
  out.push(...nums);
  while (out.length < n && (!set || set.has('mat') || grade === ADULT)) out.push(seed ? { ...mathNumSeeded(grade, r) } : mathMC(grade));
  return out.map(({ id, ...q }) => q);
}
function mathNumSeeded(grade, r) {
  const a = Math.floor(r() * 9) + 2, b = Math.floor(r() * 9) + 2;
  if (grade === ADULT) { const t = mathTask(ADULT); return { kind: 'num', grade, subject: 'gen', text: t.text, answer: t.answer }; }
  return grade <= 1 ? { kind: 'num', grade, subject: 'mat', text: `Колко е ${a} + ${b}?`, answer: a + b } : { kind: 'num', grade, subject: 'mat', text: `Колко е ${a} · ${b}?`, answer: a * b };
}

module.exports = { QuestionPicker, SUBJECTS, ADULT, ADULT_SUBJECTS, MC, NUM, mathMC, mathNum, shuffle, practiceSet };
