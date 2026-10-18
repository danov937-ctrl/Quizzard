// Логика на една игра: избор на столици → рунд 1 (завладяване на областите) → рунд 2 (война).
// Не знае нищо за мрежата: получава onChange() и методи answer()/pick() от сървъра.
const MAP = require('../data/map.json');
const { QuestionPicker } = require('./questions');

const REGIONS = Object.fromEntries(MAP.regions.map((r) => [r.id, r]));
const REGION_IDS = Object.keys(REGIONS);
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00'];
// picked: пауза след избрана област (анимация на картата); prep: карта „Въпрос“ с отброяване преди всеки въпрос
const BASE_TIMES = { mc: 20000, num: 20000, pick: 15000, reveal: 3500, info: 2500, picked: 1800, prep: 3000 };
// Точки: столица 1000; област в рунд 1 (завладяване) 300; област, превзета във войната, 400;
// успешна защита (верен отговор на защитника) +100.
const VALUES = { capital: 1000, region: 300, war: 400, defend: 100 };
const CAPITAL_TOWERS = 3;
const JOKERS = { fifty: 1, range: 1, time: 1 };
const TIME_BONUS = 10000;

class Aborted extends Error {}
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffleArr = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function bfsDistances(from) {
  const dist = { [from]: 0 }; const q = [from];
  while (q.length) { const c = q.shift(); for (const n of REGIONS[c].neighbors) if (!(n in dist)) { dist[n] = dist[c] + 1; q.push(n); } }
  return dist;
}

// Бързи реакции между играчите: само емоджита, без свободен текст (за децата)
const REACTIONS = ['👍', '😂', '😮', '🔥', '😎', '👏', '😭', '🤔'];
const CHEER = ['😎', '🔥', '👏', '😂'];

class Game {
  /**
   * players: [{ id, name, isBot }]
   * opts: { grade 1-4, battleRounds, speed (1 = нормално, 0.01 = за тестове), onChange }
   */
  constructor(players, opts = {}) {
    this.grade = opts.grade || 2;
    this.battleRounds = opts.battleRounds || 3;
    this.speed = opts.speed ?? 1;
    this.onChange = opts.onChange || (() => {});
    this.questions = new QuestionPicker(this.grade, opts.subjects);
    this.players = players.map((p, i) => ({
      id: p.id, name: p.name, isBot: !!p.isBot, color: COLORS[i % COLORS.length],
      alive: true, capital: null, towers: CAPITAL_TOWERS, bonus: 0, jokers: { ...JOKERS }, skill: p.skill ?? rnd(0.66, 0.84),
    }));
    this.fx = []; this.fxId = 0;
    this.owner = Object.fromEntries(REGION_IDS.map((id) => [id, null]));
    this.value = Object.fromEntries(REGION_IDS.map((id) => [id, 0]));
    this.phase = 'start';
    this.round = 0;
    this.current = null;
    this.log = [];
    this.timers = new Set();
    this.aborted = false;
    this.winner = null;
  }

  // ---------- помощни ----------
  t(kind) { return Math.max(1, BASE_TIMES[kind] * this.speed); }
  player(id) { return this.players.find((p) => p.id === id); }
  alivePlayers() { return this.players.filter((p) => p.alive); }
  regionsOf(pid) { return REGION_IDS.filter((r) => this.owner[r] === pid); }
  score(pid) { return this.regionsOf(pid).reduce((s, r) => s + this.value[r], 0) + this.player(pid).bonus; }
  // Събития за анимации в клиента (завземане, нападение, паднала кула…)
  addFx(fx) {
    this.fx.push({ id: ++this.fxId, ...fx }); if (this.fx.length > 24) this.fx.shift();
    // ботовете понякога се радват на успех
    if (['conquer', 'fall', 'defend', 'tower'].includes(fx.type) && this.player(fx.pid)?.isBot && Math.random() < 0.3) this.botReact(fx.pid, 600);
  }
  // Реакция на играч (само от списъка, най-много една на 1,2 секунди). Ботовете понякога отговарят.
  react(pid, emoji) {
    const p = this.player(pid);
    if (!p || this.aborted || !REACTIONS.includes(emoji)) return;
    const now = Date.now();
    if (p.lastReact && now - p.lastReact < 1200) return;
    p.lastReact = now;
    this.addFx({ type: 'react', pid, emoji });
    this.emit();
    if (!p.isBot && Math.random() < 0.5) {
      const bots = this.players.filter((b) => b.isBot);
      if (bots.length) this.botReact(bots[Math.floor(Math.random() * bots.length)].id, 700 + Math.random() * 900, emoji);
    }
  }
  botReact(pid, delay, like) {
    this.setTimer(() => {
      if (this.aborted) return;
      this.fx.push({ id: ++this.fxId, type: 'react', pid, emoji: like && Math.random() < 0.4 ? like : CHEER[Math.floor(Math.random() * CHEER.length)] });
      this.emit();
    }, delay);
  }
  say(msg) { this.log.push(msg); if (this.log.length > 30) this.log.shift(); }
  emit() { if (!this.aborted) this.onChange(); }

  setTimer(fn, ms) { const h = setTimeout(() => { this.timers.delete(h); fn(); }, ms); this.timers.add(h); return h; }
  sleep(ms) { return new Promise((res) => this.setTimer(res, ms)).then(() => { if (this.aborted) throw new Aborted(); }); }
  abort() { this.aborted = true; for (const h of this.timers) clearTimeout(h); this.timers.clear(); if (this._wake) this._wake(); }

  // Чака до изтичане на времето или докато done() стане true (проверява се при всеки ход на играч).
  // Срокът може да се удължи (жокер „+10 секунди“) с extendWait().
  waitFor(ms, done) {
    return new Promise((res) => {
      const w = { h: null };
      const finish = () => { clearTimeout(w.h); this.timers.delete(w.h); this._wake = null; this._check = null; this._extend = null; res(); };
      const arm = (left) => { clearTimeout(w.h); this.timers.delete(w.h); w.h = setTimeout(finish, left); this.timers.add(w.h); w.end = Date.now() + left; };
      arm(ms);
      this._wake = finish;
      this._check = () => { if (done()) finish(); };
      this._extend = (extra) => arm(Math.max(0, w.end - Date.now()) + extra);
    }).then(() => { if (this.aborted) throw new Aborted(); });
  }

  freeAdjacent(pid) {
    const free = REGION_IDS.filter((r) => !this.owner[r]);
    const near = free.filter((r) => REGIONS[r].neighbors.some((n) => this.owner[n] === pid));
    return near.length ? near : free;
  }
  attackTargets(pid) {
    const mine = new Set(this.regionsOf(pid));
    return REGION_IDS.filter((r) => this.owner[r] && this.owner[r] !== pid && REGIONS[r].neighbors.some((n) => mine.has(n)));
  }

  // ---------- основен цикъл ----------
  async run() {
    try {
      await this.assignCapitals();
      await this.expansion();
      await this.battle();
      this.finish();
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
    }
  }

  // Всеки играч по ред сам избира столицата си (не може до чужда столица)
  async assignCapitals() {
    this.phase = 'capitals';
    this.current = { type: 'info', icon: 'castle', title: 'Избор на столици', text: 'Всеки играч по ред избира своята столица. Тя носи 1000 точки и има 3 кули.' };
    this.emit();
    await this.sleep(this.t('info'));
    const order = this.players.slice().sort(() => Math.random() - 0.5);
    for (const p of order) {
      const taken = this.players.map((x) => x.capital).filter(Boolean);
      let options = REGION_IDS.filter((r) => !this.owner[r] && !taken.some((c) => c === r || REGIONS[c].neighbors.includes(r)));
      if (!options.length) options = REGION_IDS.filter((r) => !this.owner[r]);
      const r = await this.askPick(p.id, options, 'Избери своята столица', 'capital');
      p.capital = r; this.owner[r] = p.id; this.value[r] = VALUES.capital;
      this.say(`${p.name} избра столица ${REGIONS[r].name}.`);
      this.addFx({ type: 'capital', region: r, pid: p.id, points: VALUES.capital });
      this.emit();
      await this.sleep(this.t('picked'));
    }
    this.current = { type: 'info', icon: 'map', title: 'Рунд 1: Завладяване', text: 'Отговаряйте вярно и избирайте свободни области. Всяка област носи 300 точки.' };
    this.emit();
    await this.sleep(this.t('info'));
  }

  async expansion() {
    this.phase = 'expansion';
    let safety = 0;
    while (REGION_IDS.some((r) => !this.owner[r])) {
      this.round++;
      if (++safety > 40) { this.autoFill(); break; }
      const all = this.alivePlayers().map((p) => p.id);
      const q = this.questions.nextMC();
      const ans = await this.askQuestion(q, all, { title: `Рунд 1 · въпрос ${this.round}: завладяване` });
      const correct = all.filter((pid) => ans[pid] && ans[pid].value === q.correct);
      let order = [];
      if (correct.length === 1) {
        order = [[correct[0], 2]];
      } else if (correct.length > 1) {
        const nq = this.questions.nextNum();
        const ranked = await this.askNumeric(nq, correct, {
          title: correct.length === all.length ? 'Всички отговориха вярно! Кой е най-близо?' : 'Равенство! Кой е най-близо?',
        });
        order = ranked.map((pid, i) => [pid, i === 0 ? 2 : 1]);
      } else {
        this.current = { type: 'info', icon: 'miss', title: 'Никой не позна', text: 'Следва нов въпрос.' }; this.emit();
        await this.sleep(this.t('info'));
      }
      for (const [pid, count] of order) {
        for (let k = 0; k < count; k++) {
          if (!REGION_IDS.some((r) => !this.owner[r])) break;
          const opts = this.freeAdjacent(pid);
          const r = await this.askPick(pid, opts, 'Избери свободна област', 'expand');
          this.owner[r] = pid; this.value[r] = VALUES.region;
          this.say(`${this.player(pid).name} завзе ${REGIONS[r].name} (+${VALUES.region}).`);
          this.addFx({ type: 'conquer', region: r, pid, points: VALUES.region });
          this.emit();
          await this.sleep(this.t('picked'));
        }
      }
    }
  }

  autoFill() {
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of REGION_IDS.filter((x) => !this.owner[x])) {
        const n = REGIONS[r].neighbors.find((x) => this.owner[x]);
        if (n) { this.owner[r] = this.owner[n]; this.value[r] = VALUES.region; changed = true; }
      }
    }
  }

  // Рунд 2: война. Всеки жив играч по ред напада съседна чужда област; играта свършва след
  // избрания брой кръгове или когато остане само един играч.
  async battle() {
    this.phase = 'battle';
    this.round = 0;
    this.current = { type: 'info', icon: 'war', title: 'Рунд 2: Война!', text: 'Нападай съседни области. Превзета област носи 400 точки. Пази столицата си!' };
    this.emit();
    await this.sleep(this.t('info') * 1.5);
    for (let br = 1; br <= this.battleRounds; br++) {
      this.round = br;
      const order = this.players.slice(br - 1).concat(this.players.slice(0, br - 1));
      for (const att of order) {
        if (this.alivePlayers().length < 2) return;
        if (!att.alive) continue;
        const targets = this.attackTargets(att.id);
        if (!targets.length) continue;
        const target = await this.askPick(att.id, targets, 'Избери област за нападение', 'attack');
        await this.attack(att.id, target);
      }
    }
  }

  // Един двубой: въпрос с 4 отговора; ако и двамата познаят, решава числов въпрос
  // (най-близкият отговор, при равенство – по-бързият). Връща { winner, defCorrect }.
  async duelQuestion(attId, defId, ctx) {
    const q = this.questions.nextMC();
    const ans = await this.askQuestion(q, [attId, defId], ctx);
    const aOk = ans[attId]?.value === q.correct, dOk = ans[defId]?.value === q.correct;
    if (aOk && !dOk) return { winner: attId, defCorrect: false };
    if (!aOk) return { winner: defId, defCorrect: dOk };
    const ranked = await this.askNumeric(this.questions.nextNum(), [attId, defId], { ...ctx, title: 'И двамата познахте! Кой е по-близо?' });
    return { winner: ranked[0], defCorrect: ranked[0] === defId };
  }

  async attack(attId, region) {
    const defId = this.owner[region];
    const att = this.player(attId), def = this.player(defId);
    const isCapital = def.capital === region;
    const from = REGIONS[region].neighbors.find((n) => this.owner[n] === attId);
    this.say(`${att.name} напада ${REGIONS[region].name} (${def.name}).`);
    this.addFx({ type: 'attack', from, region, pid: attId });
    const ctx = { attacker: attId, defender: defId, region };
    this.emit();
    await this.sleep(this.t('picked'));

    if (!isCapital) {
      const { winner, defCorrect } = await this.duelQuestion(attId, defId, { ...ctx, title: `${att.name} напада ${REGIONS[region].name}` });
      if (winner === attId) {
        this.owner[region] = attId; this.value[region] = VALUES.war;
        this.say(`${att.name} превзе ${REGIONS[region].name} (+${VALUES.war}).`);
        this.addFx({ type: 'conquer', region, pid: attId, points: VALUES.war });
        this.current = { type: 'info', icon: 'win', title: `${att.name} превзе ${REGIONS[region].name}!`, text: `+${VALUES.war} точки за ${att.name}.`, region };
      } else this.defended(def, region, defCorrect);
      this.emit();
      await this.sleep(this.t('info'));
      return;
    }

    // Столица: всяка кула е един въпрос. Нападението продължава, докато защитникът не отговори вярно.
    while (def.towers > 0) {
      const { winner, defCorrect } = await this.duelQuestion(attId, defId, { ...ctx, title: `${att.name} напада столицата ${REGIONS[region].name} · кули: ${def.towers}` });
      if (winner !== attId) { this.defended(def, region, defCorrect); this.emit(); await this.sleep(this.t('info')); return; }
      def.towers--;
      this.addFx({ type: 'tower', region, pid: attId, left: def.towers });
      if (def.towers > 0) {
        this.say(`${att.name} събори кула на ${def.name}! Остават ${def.towers}.`);
        this.current = { type: 'info', icon: 'tower', title: 'Кулата падна!', text: `Столицата на ${def.name} има още ${def.towers} ${def.towers === 1 ? 'кула' : 'кули'}. Следва нов въпрос!`, region };
        this.emit();
        await this.sleep(this.t('info'));
      }
    }
    const taken = this.regionsOf(defId);
    for (const r of taken) this.owner[r] = attId;
    att.bonus += def.bonus; def.bonus = 0;
    def.alive = false;
    this.say(`${att.name} превзе столицата на ${def.name} и всички ${taken.length} области!`);
    this.addFx({ type: 'fall', region, pid: attId, regions: taken });
    this.current = { type: 'info', icon: 'fall', title: 'Столицата падна!', text: `${att.name} взе всички области на ${def.name}.`, region };
    this.emit();
    await this.sleep(this.t('info') * 1.4);
  }

  defended(def, region, correct) {
    if (correct) {
      def.bonus += VALUES.defend;
      this.addFx({ type: 'defend', region, pid: def.id, points: VALUES.defend });
      this.say(`${def.name} удържа ${REGIONS[region].name} (+${VALUES.defend}).`);
      this.current = { type: 'info', icon: 'shield', title: `${def.name} се защити!`, text: `+${VALUES.defend} точки за верния отговор. ${REGIONS[region].name} остава на ${def.name}.`, region };
    } else {
      this.addFx({ type: 'defend', region, pid: def.id, points: 0 });
      this.say(`${def.name} удържа ${REGIONS[region].name}.`);
      this.current = { type: 'info', icon: 'shield', title: 'Нападението не успя', text: `Никой не позна. ${REGIONS[region].name} остава на ${def.name}.`, region };
    }
  }

  finish() {
    this.phase = 'ended';
    const ranking = this.players.map((p) => ({ id: p.id, score: this.score(p.id), alive: p.alive }))
      .sort((a, b) => (b.alive - a.alive) || (b.score - a.score));
    this.winner = ranking[0].id;
    this.current = { type: 'end', ranking, analysis: this.analysis() };
    this.say(`Победител: ${this.player(this.winner).name}!`);
    this.emit();
  }

  // ---------- въпроси и избор ----------
  async askQuestion(q, participants, ctx) {
    await this.prep(q, participants, ctx);
    const answers = {};
    const started = Date.now();
    this.current = { type: 'question', kind: 'mc', q, participants, answers, started, endsAt: started + this.t('mc'), removed: {}, hints: {}, extended: 0, ...ctx };
    for (const pid of participants) this.botAnswer(pid, q);
    this.emit();
    await this.waitFor(this.t('mc'), () => participants.every((p) => answers[p]));
    this.record(q, participants, (pid) => answers[pid]?.value ?? null, (pid) => answers[pid]?.value === q.correct);
    this.current = { ...this.current, type: 'reveal' };
    this.emit();
    await this.sleep(this.t('reveal'));
    return answers;
  }

  // Връща участниците подредени: най-близък отговор, после по-бърз
  async askNumeric(q, participants, ctx) {
    await this.prep(q, participants, ctx);
    const answers = {};
    const started = Date.now();
    this.current = { type: 'question', kind: 'num', q, participants, answers, started, endsAt: started + this.t('num'), removed: {}, hints: {}, extended: 0, ...ctx };
    for (const pid of participants) this.botAnswer(pid, q);
    this.emit();
    await this.waitFor(this.t('num'), () => participants.every((p) => answers[p]));
    const key = (pid) => answers[pid] ? [Math.abs(answers[pid].value - q.answer), answers[pid].ms] : [Infinity, Infinity];
    const ranked = participants.slice().sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1]; });
    this.record(q, participants, (pid) => answers[pid]?.value ?? null, (pid) => answers[pid]?.value === q.answer, ranked[0]);
    this.current = { ...this.current, type: 'reveal', ranked };
    this.emit();
    await this.sleep(this.t('reveal'));
    return ranked;
  }

  // История за анализа след играта
  record(q, participants, given, ok, best) {
    this.history ||= [];
    for (const pid of participants) {
      if (!this.player(pid)) continue;
      this.history.push({ pid, subject: q.subject, kind: q.kind, text: q.text, right: q.kind === 'num' ? q.answer : q.correct, given: given(pid), ok: ok(pid), best: best === pid });
    }
  }

  analysis() {
    const out = {};
    for (const p of this.players) {
      const h = (this.history || []).filter((x) => x.pid === p.id);
      const bySubject = {};
      for (const x of h) { const b = (bySubject[x.subject] ||= { n: 0, ok: 0 }); b.n++; if (x.ok) b.ok++; }
      const mc = h.filter((x) => x.kind === 'mc'), num = h.filter((x) => x.kind === 'num');
      out[p.id] = {
        total: mc.length, correct: mc.filter((x) => x.ok).length,
        numTotal: num.length, numExact: num.filter((x) => x.ok).length, numBest: num.filter((x) => x.best).length,
        bySubject,
        mistakes: p.isBot ? [] : h.filter((x) => !x.ok).slice(-12).map(({ subject, kind, text, right, given }) => ({ subject, kind, text, right, given })),
      };
    }
    return out;
  }

  async askPick(pid, options, title, mode) {
    const started = Date.now();
    this.current = { type: 'pick', mode, picker: pid, options, title, started, endsAt: started + this.t('pick'), chosen: null };
    const cur = this.current;
    if (this.player(pid).isBot) this.setTimer(() => this.pick(pid, this.botChooseRegion(pid, options, mode)), this.t('pick') * rnd(0.08, 0.2));
    this.emit();
    await this.waitFor(this.t('pick'), () => cur.chosen);
    const region = cur.chosen || pickOne(options);
    this.current = { type: 'picked', mode, picker: pid, region };
    return region;
  }

  // Преди всеки въпрос: карта „Въпрос“ с предмета и отброяване, за да се види какво стана на картата
  async prep(q, participants, ctx) {
    const started = Date.now();
    this.current = { type: 'prep', kind: q.kind, subject: q.subject, participants, started, endsAt: started + this.t('prep'), ...ctx };
    this.emit();
    await this.sleep(this.t('prep'));
  }

  // Извиква се от сървъра при отговор на играч
  answer(pid, value) {
    const c = this.current;
    if (!c || c.type !== 'question' || !c.participants.includes(pid) || c.answers[pid]) return false;
    if (c.kind === 'num') { value = Number(value); if (!Number.isFinite(value)) return false; }
    else if (!c.q.options.includes(value)) return false;
    c.answers[pid] = { value, ms: Date.now() - c.started };
    this.emit();
    if (this._check) this._check();
    return true;
  }

  pick(pid, region) {
    const c = this.current;
    if (!c || c.type !== 'pick' || c.picker !== pid || c.chosen || !c.options.includes(region)) return false;
    c.chosen = region;
    if (this._check) this._check();
    return true;
  }

  // Жокери (всеки по веднъж на игра): fifty – маха 2 грешни отговора; range – показва обхват
  // за числов въпрос; time – +10 секунди за всички на този въпрос.
  useJoker(pid, kind) {
    const c = this.current, p = this.player(pid);
    if (!c || c.type !== 'question' || !c.participants.includes(pid) || c.answers[pid] || !p?.jokers[kind]) return false;
    if (kind === 'fifty') {
      if (c.kind !== 'mc' || c.removed[pid]) return false;
      c.removed[pid] = shuffleArr(c.q.options.filter((o) => o !== c.q.correct)).slice(0, 2);
    } else if (kind === 'range') {
      if (c.kind !== 'num' || c.hints[pid]) return false;
      const a = c.q.answer, spread = Math.max(4, Math.round(Math.abs(a) * 0.2)), shift = Math.floor(Math.random() * (spread + 1));
      c.hints[pid] = `между ${Math.max(0, a - shift)} и ${a - shift + spread}`;
    } else if (kind === 'time') {
      c.endsAt += TIME_BONUS; c.extended++;
      if (this._extend) this._extend(TIME_BONUS);
    } else return false;
    p.jokers[kind]--;
    this.emit();
    return true;
  }

  // Играч излезе по време на игра: бот поема мястото му, за да не чакат другите
  takeOver(pid) {
    const p = this.player(pid);
    if (!p || p.isBot) return;
    p.isBot = true;
    const c = this.current;
    if (c?.type === 'question' && c.participants.includes(pid) && !c.answers[pid]) this.botAnswer(pid, c.q);
    if (c?.type === 'pick' && c.picker === pid && !c.chosen) this.setTimer(() => this.pick(pid, this.botChooseRegion(pid, c.options, c.mode)), 300);
    this.say(`${p.name} излезе, бот играе вместо него.`);
    this.emit();
  }

  // ---------- ботове ----------
  botAnswer(pid, q) {
    const p = this.player(pid);
    if (!p.isBot) return;
    const limit = this.t(q.kind === 'num' ? 'num' : 'mc');
    this.setTimer(() => {
      if (q.kind === 'num') {
        // по-умен, но не безгрешен: понякога ползва жокера „обхват“ и тогава е по-точен
        let spread = 0.32;
        if (p.jokers.range && Math.random() < 0.2 && this.useJoker(pid, 'range')) spread = 0.15;
        const noise = (Math.random() - 0.5) * spread * (1.2 - p.skill);
        this.answer(pid, Math.max(0, Math.round(q.answer * (1 + noise))));
      } else {
        let skill = p.skill;
        if (p.jokers.fifty && Math.random() < 0.2 && this.useJoker(pid, 'fifty')) skill = Math.min(0.92, skill + 0.2);
        const removed = this.current?.removed?.[pid] || [];
        const right = Math.random() < skill;
        this.answer(pid, right ? q.correct : pickOne(q.options.filter((o) => o !== q.correct && !removed.includes(o))));
      }
    }, limit * rnd(0.15, 0.6));
  }

  botChooseRegion(pid, options, mode) {
    if (mode === 'capital') {
      const caps = this.players.map((p) => p.capital).filter(Boolean);
      if (!caps.length) return pickOne(options.filter((r) => r !== 'SOF')) || pickOne(options);
      const dists = caps.map(bfsDistances);
      const score = (r) => Math.min(...dists.map((d) => d[r] ?? 99));
      const best = Math.max(...options.map(score));
      return pickOne(options.filter((r) => score(r) === best));
    }
    // Понякога (около 1 на 4) ботът избира наслуки, за да може да бъде победен
    if (Math.random() < 0.25) return pickOne(options);
    const mine = (r) => REGIONS[r].neighbors.filter((n) => this.owner[n] === pid).length;
    if (mode === 'attack') {
      const capOf = (r) => this.players.find((p) => p.alive && p.capital === r);
      const caps = options.filter(capOf);
      // слаба столица (1 кула) е голяма награда; иначе столица само понякога
      const weak = caps.filter((r) => capOf(r).towers <= 1);
      if (weak.length) return pickOne(weak);
      if (caps.length && (Math.random() < 0.3 || caps.length === options.length)) return pickOne(caps);
      // иначе: евтина област на водещия противник, по-добре обградена от нашите (по-лесно се пази после)
      const lead = this.alivePlayers().filter((p) => p.id !== pid).sort((a, b) => this.score(b.id) - this.score(a.id))[0]?.id;
      const score = (r) => mine(r) * 2 + (this.owner[r] === lead ? 2 : 0) - this.value[r] / 200 + Math.random();
      return options.filter((r) => !caps.includes(r)).sort((a, b) => score(b) - score(a))[0];
    }
    // завладяване: области, които свързват нашите земи и имат още свободни съседи за следващ ход
    const free = (r) => REGIONS[r].neighbors.filter((n) => !this.owner[n]).length;
    const score = (r) => mine(r) * 2 + free(r) * 0.5 + Math.random();
    return options.slice().sort((a, b) => score(b) - score(a))[0];
  }

  // ---------- изглед за клиента (без верните отговори преди разкриването) ----------
  view(forPid) {
    const c = this.current;
    let cur = null;
    if (c) {
      cur = { ...c };
      if (c.q) {
        cur.q = { text: c.q.text, subject: c.q.subject, kind: c.q.kind, options: c.q.options, pic: c.q.pic };
        cur.removed = c.removed?.[forPid] || []; cur.hint = c.hints?.[forPid] || null;
        delete cur.hints;
        if (c.type === 'reveal') { cur.q.correct = c.q.correct; cur.q.answer = c.q.answer; cur.answers = c.answers; }
        else cur.answers = Object.fromEntries(Object.keys(c.answers).map((k) => [k, k === forPid ? c.answers[k] : { hidden: true }]));
      }
      cur.timeLeft = c.endsAt ? Math.max(0, c.endsAt - Date.now()) : null;
      delete cur.started; delete cur.endsAt;
    }
    return {
      phase: this.phase, round: this.round, battleRounds: this.battleRounds, grade: this.grade,
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, isBot: p.isBot, alive: p.alive, capital: p.capital, towers: p.towers, bonus: p.bonus, jokers: p.jokers, score: this.score(p.id), regions: this.regionsOf(p.id).length })),
      owner: this.owner, value: this.value, current: cur, log: this.log.slice(-8), fx: this.fx.slice(-10),
    };
  }
}

module.exports = { Game, REGIONS, COLORS, VALUES };
