// Банка въпроси с промени от админ панела. Базовите въпроси идват от data/ (questions.js),
// а редакциите, скритите и добавените въпроси се пазят отделно (store „content“) и се
// прилагат върху масивите MC и NUM, които играта ползва (на място, без смяна на референцията).
const crypto = require('crypto');
const { MC, NUM, SUBJECTS } = require('../questions');

const GRADES = [1, 2, 3, 4];
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const norm = (s) => String(s || '').toLowerCase().replace(/[^а-яa-z0-9]/g, '');
// Стабилен ключ на базов въпрос: по вида и оригиналния текст (номерът на реда се мени)
const baseKey = (kind, text, pic) => 'b' + hash(kind + '|' + text + (pic ? '|' + pic : ''));

// Снимка на въпросите от файловете, преди каквато и да е промяна
const BASE = [
  ...MC.map((q) => ({ key: baseKey('mc', q.text, q.pic), kind: 'mc', grade: q.grade, subject: q.subject, text: q.text, options: q.options.slice(), pic: q.pic || '' })),
  ...NUM.map((q) => ({ key: baseKey('num', q.text, q.pic), kind: 'num', grade: q.grade, subject: q.subject, text: q.text, answer: q.answer, pic: q.pic || '' })),
];
const BASE_BY_KEY = new Map(BASE.map((q) => [q.key, q]));

// Проверява и почиства въпрос от панела. Връща { q } или { error }.
function clean(input, kind) {
  const q = { kind: kind || input.kind };
  if (!['mc', 'num'].includes(q.kind)) return { error: 'Непознат вид въпрос.' };
  q.grade = Number(input.grade);
  if (!GRADES.includes(q.grade)) return { error: 'Класът трябва да е от 1 до 4.' };
  q.subject = String(input.subject || '');
  if (!SUBJECTS[q.subject]) return { error: 'Непознат предмет.' };
  q.text = String(input.text || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  if (q.text.length < 5) return { error: 'Въпросът е твърде кратък.' };
  if (q.text.length > 300) return { error: 'Въпросът е твърде дълъг (най-много 300 знака).' };
  // Картинка към въпроса (емоджи), по желание
  q.pic = String(input.pic || '').replace(/[|<>]/g, '').trim().slice(0, 16);
  if (q.kind === 'mc') {
    const opts = (input.options || []).map((o) => String(o || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim());
    if (opts.length !== 4 || opts.some((o) => !o)) return { error: 'Нужни са верен отговор и три грешни.' };
    if (new Set(opts.map((o) => o.toLowerCase())).size !== 4) return { error: 'Отговорите трябва да са различни.' };
    if (opts.some((o) => o.length > 80)) return { error: 'Отговор е твърде дълъг (най-много 80 знака).' };
    q.options = opts;
  } else {
    const a = Number(String(input.answer).replace(',', '.').trim());
    if (!Number.isInteger(a) || a < 0) return { error: 'Отговорът на числов въпрос трябва да е цяло число ≥ 0.' };
    q.answer = a;
  }
  return { q };
}

// Ред от файл във формата на data/: клас|предмет|въпрос|ВЕРЕН|грешен|грешен|грешен или клас|предмет|въпрос|отговор
function parseLine(line) {
  const p = line.split('|').map((x) => x.trim());
  if (p.length === 7 || p.length === 8) return clean({ grade: p[0], subject: p[1], text: p[2], options: p.slice(3, 7), pic: p[7] }, 'mc');
  if (p.length === 4 || p.length === 5) return clean({ grade: p[0], subject: p[1], text: p[2], answer: p[3], pic: p[4] }, 'num');
  return { error: `Очакват се 7 полета (с избор) или 4 (числов), а има ${p.length}.` };
}
const toLine = (q) => [q.grade, q.subject, q.text, ...(q.kind === 'mc' ? q.options : [q.answer]), ...(q.pic ? [q.pic] : [])].join('|');

class Bank {
  constructor(content, onChange) {
    this.c = content; this.onChange = onChange || (() => {});
    this.c.overrides ||= {}; this.c.added ||= {};
    this.rebuild();
  }

  // Всички въпроси с текущото им състояние
  list() {
    const out = [];
    for (const b of BASE) {
      const o = this.c.overrides[b.key];
      out.push({ ...b, ...(o || {}), key: b.key, kind: b.kind, origin: 'base', edited: !!(o && Object.keys(o).some((k) => k !== 'hidden')), hidden: !!o?.hidden });
    }
    for (const a of Object.values(this.c.added)) out.push({ ...a, origin: 'added', edited: false, hidden: !!a.hidden });
    return out;
  }
  get(key) { return this.list().find((q) => q.key === key) || null; }
  original(key) { return BASE_BY_KEY.get(key) || null; }

  // Прилага промените върху масивите на играта
  rebuild() {
    const off = new Set(this.c.settings?.disabledSubjects || []);
    const active = this.list().filter((q) => !q.hidden && !off.has(q.subject));
    MC.length = 0; NUM.length = 0;
    for (const q of active) {
      const pic = q.pic ? { pic: q.pic } : {};
      if (q.kind === 'mc') MC.push({ id: q.key, kind: 'mc', grade: q.grade, subject: q.subject, text: q.text, correct: q.options[0], options: q.options.slice(), ...pic });
      else NUM.push({ id: q.key, kind: 'num', grade: q.grade, subject: q.subject, text: q.text, answer: q.answer, ...pic });
    }
    this.onChange();
  }

  // Редакция: връща { before, after } или { error }
  update(key, input) {
    const cur = this.get(key);
    if (!cur) return { error: 'Няма такъв въпрос.' };
    const { q, error } = clean({ ...cur, ...input }, cur.kind);
    if (error) return { error };
    const dup = this.duplicateOf(q.text, key, q.pic);
    if (dup) return { error: 'Вече има въпрос със същия текст.' };
    const before = this.snapshot(key);
    if (cur.origin === 'added') this.c.added[key] = { ...this.c.added[key], ...q };
    else {
      const b = BASE_BY_KEY.get(key), o = {};
      for (const f of ['grade', 'subject', 'text', 'options', 'answer', 'pic']) if (q[f] !== undefined && JSON.stringify(q[f]) !== JSON.stringify(b[f])) o[f] = q[f];
      if (cur.hidden) o.hidden = true;
      if (Object.keys(o).length) this.c.overrides[key] = o; else delete this.c.overrides[key];
    }
    this.rebuild();
    return { before, after: this.snapshot(key) };
  }
  setHidden(key, hidden) {
    const cur = this.get(key);
    if (!cur) return { error: 'Няма такъв въпрос.' };
    const before = this.snapshot(key);
    if (cur.origin === 'added') this.c.added[key].hidden = !!hidden || undefined;
    else {
      const o = { ...(this.c.overrides[key] || {}) };
      if (hidden) o.hidden = true; else delete o.hidden;
      if (Object.keys(o).length) this.c.overrides[key] = o; else delete this.c.overrides[key];
    }
    this.rebuild();
    return { before, after: this.snapshot(key) };
  }
  add(input) {
    const { q, error } = clean(input, input.kind);
    if (error) return { error };
    if (this.duplicateOf(q.text, null, q.pic)) return { error: 'Вече има въпрос със същия текст.' };
    const key = 'a' + crypto.randomBytes(6).toString('hex');
    this.c.added[key] = { key, ...q, createdAt: new Date().toISOString() };
    this.rebuild();
    return { key, before: null, after: this.snapshot(key) };
  }
  // Изтриване: добавените изчезват напълно, базовите само се скриват (файловете не се пипат)
  remove(key) {
    const cur = this.get(key);
    if (!cur) return { error: 'Няма такъв въпрос.' };
    if (cur.origin === 'base') return this.setHidden(key, true);
    const before = this.snapshot(key);
    delete this.c.added[key];
    this.rebuild();
    return { before, after: null };
  }
  // Връща базов въпрос към текста от файла
  reset(key) {
    if (!BASE_BY_KEY.has(key)) return { error: 'Само въпросите от файловете могат да се върнат към оригинала.' };
    const before = this.snapshot(key);
    delete this.c.overrides[key];
    this.rebuild();
    return { before, after: this.snapshot(key) };
  }
  // Пълно състояние на въпрос, за дневника и връщане назад
  snapshot(key) {
    if (this.c.added[key]) return { added: JSON.parse(JSON.stringify(this.c.added[key])) };
    if (BASE_BY_KEY.has(key)) return { override: this.c.overrides[key] ? JSON.parse(JSON.stringify(this.c.overrides[key])) : null };
    return null;
  }
  restore(key, snap) {
    if (BASE_BY_KEY.has(key)) { if (snap?.override) this.c.overrides[key] = snap.override; else delete this.c.overrides[key]; }
    else if (snap?.added) this.c.added[key] = snap.added;
    else delete this.c.added[key];
    this.rebuild();
  }

  duplicateOf(text, exceptKey, pic = '') {
    const n = norm(text);
    return this.list().find((q) => q.key !== exceptKey && norm(q.text) === n && (q.pic || '') === (pic || '')) || null;
  }

  // Автоматична проверка за често срещани проблеми
  problems() {
    const out = [];
    const all = this.list().filter((q) => !q.hidden);
    const seen = new Map();
    for (const q of all) {
      const n = norm(q.text) + (q.pic || '');
      if (seen.has(n)) out.push({ key: q.key, kind: 'dup', msg: 'Повтаря друг въпрос', other: seen.get(n) });
      else seen.set(n, q.key);
      if (q.kind === 'mc') {
        const right = q.options[0];
        const word = (w) => new RegExp(`(^|[^а-яa-z0-9])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^а-яa-z0-9]|$)`, 'i');
        if (q.subject !== 'bel' && q.subject !== 'eng' && right.length >= 5 && word(right).test(q.text)) out.push({ key: q.key, kind: 'hint', msg: 'Верният отговор се вижда в самия въпрос' });
        const lens = q.options.map((o) => o.length);
        if (lens[0] > 2 * Math.max(...lens.slice(1)) && lens[0] > 15) out.push({ key: q.key, kind: 'long', msg: 'Верният отговор е много по-дълъг от грешните (лесно се познава)' });
        if (/всички|нито един/i.test(right)) out.push({ key: q.key, kind: 'all', msg: 'Верният отговор е „всички/нито един“' });
      }
      if (!/[?.!:…–-]["“”»]?$/.test(q.text)) out.push({ key: q.key, kind: 'punct', msg: 'Липсва въпросителен знак накрая' });
      if (/\s{2,}|\s[,?!]|\s\.(?!\.)/.test(q.text)) out.push({ key: q.key, kind: 'space', msg: 'Излишен интервал' });
      if (/(^|[^а-я])(лв\.?|лева|лев)([^а-я]|$)/i.test(q.text + ' ' + (q.options || []).join(' '))) out.push({ key: q.key, kind: 'lev', msg: 'Сума в лева (играта е в евро)' });
    }
    return out;
  }

  // Колко въпроса има за всеки предмет и клас (само активните)
  coverage() {
    const out = {};
    for (const s of Object.keys(SUBJECTS)) out[s] = Object.fromEntries(GRADES.map((g) => [g, { mc: 0, num: 0 }]));
    for (const q of this.list()) if (!q.hidden && out[q.subject]) out[q.subject][q.grade][q.kind]++;
    return out;
  }
}

module.exports = { Bank, clean, parseLine, toLine, BASE, SUBJECTS, GRADES, norm };
