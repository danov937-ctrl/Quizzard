// Логика на една игра: столици → разпределяне на областите → битки.
// Не знае нищо за мрежата: получава onChange() и методи answer()/pick() от сървъра.
const MAP = require('../data/map.json');
const { QuestionPicker } = require('./questions');

const REGIONS = Object.fromEntries(MAP.regions.map((r) => [r.id, r]));
const REGION_IDS = Object.keys(REGIONS);
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00'];
const BASE_TIMES = { mc: 20000, num: 25000, pick: 15000, reveal: 4000, info: 2500 };
const VALUES = { capital: 500, region: 200, step: 100 };
const CAPITAL_LIVES = 3;

class Aborted extends Error {}
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

function bfsDistances(from) {
  const dist = { [from]: 0 }; const q = [from];
  while (q.length) { const c = q.shift(); for (const n of REGIONS[c].neighbors) if (!(n in dist)) { dist[n] = dist[c] + 1; q.push(n); } }
  return dist;
}

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
    this.questions = new QuestionPicker(this.grade);
    this.players = players.map((p, i) => ({
      id: p.id, name: p.name, isBot: !!p.isBot, color: COLORS[i % COLORS.length],
      alive: true, capital: null, lives: CAPITAL_LIVES, skill: p.skill ?? rnd(0.55, 0.85),
    }));
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
  score(pid) { return this.regionsOf(pid).reduce((s, r) => s + this.value[r], 0); }
  say(msg) { this.log.push(msg); if (this.log.length > 30) this.log.shift(); }
  emit() { if (!this.aborted) this.onChange(); }

  setTimer(fn, ms) { const h = setTimeout(() => { this.timers.delete(h); fn(); }, ms); this.timers.add(h); return h; }
  sleep(ms) { return new Promise((res) => this.setTimer(res, ms)).then(() => { if (this.aborted) throw new Aborted(); }); }
  abort() { this.aborted = true; for (const h of this.timers) clearTimeout(h); this.timers.clear(); if (this._wake) this._wake(); }

  // Чака до изтичане на времето или докато done() стане true (проверява се при всеки ход на играч)
  waitFor(ms, done) {
    return new Promise((res) => {
      const finish = () => { clearTimeout(h); this.timers.delete(h); this._wake = null; this._check = null; res(); };
      const h = setTimeout(finish, ms); this.timers.add(h);
      this._wake = finish;
      this._check = () => { if (done()) finish(); };
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
    this.current = { type: 'info', title: 'Избор на столици', text: 'Всеки играч по ред избира своята столица на картата.' };
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
      this.emit();
    }
    this.current = { type: 'info', title: 'Столиците са избрани!', text: 'Отговаряйте вярно, за да завземате области.' };
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
      const ans = await this.askQuestion(q, all, { title: `Рунд ${this.round}: завземане на области` });
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
        this.current = { type: 'info', title: 'Никой не позна', text: 'Следва нов въпрос.' }; this.emit();
        await this.sleep(this.t('info'));
      }
      for (const [pid, count] of order) {
        for (let k = 0; k < count; k++) {
          if (!REGION_IDS.some((r) => !this.owner[r])) break;
          const opts = this.freeAdjacent(pid);
          const r = await this.askPick(pid, opts, 'Избери свободна област', 'expand');
          this.owner[r] = pid; this.value[r] = VALUES.region;
          this.say(`${this.player(pid).name} завзе ${REGIONS[r].name}.`);
          this.emit();
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

  async battle() {
    this.phase = 'battle';
    this.current = { type: 'info', title: 'Започва битката!', text: 'Нападай съседни области на противниците. Пази своята столица!' };
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
        await this.duel(att.id, target);
      }
    }
  }

  async duel(attId, region) {
    const defId = this.owner[region];
    const att = this.player(attId), def = this.player(defId);
    const isCapital = def.capital === region;
    this.say(`${att.name} напада ${REGIONS[region].name} (${def.name}).`);
    const ctx = { title: `${att.name} напада ${REGIONS[region].name}${isCapital ? ' (столица!)' : ''}`, attacker: attId, defender: defId, region };
    const q = this.questions.nextMC();
    const ans = await this.askQuestion(q, [attId, defId], ctx);
    const aOk = ans[attId]?.value === q.correct, dOk = ans[defId]?.value === q.correct;
    let winner;
    if (aOk && !dOk) winner = attId;
    else if (!aOk) winner = defId;
    else winner = (await this.askNumeric(this.questions.nextNum(), [attId, defId], { ...ctx, title: 'И двамата познаха! Кой е по-близо?' }))[0];

    if (winner === defId) {
      this.value[region] += VALUES.step;
      this.say(`${def.name} удържа ${REGIONS[region].name}!`);
      this.current = { type: 'info', title: `${def.name} се защити!`, text: `${REGIONS[region].name} остава на ${def.name}.`, region };
    } else if (isCapital) {
      def.lives--;
      if (def.lives > 0) {
        this.say(`${att.name} уцели столицата на ${def.name}! Остават ${def.lives} кули.`);
        this.current = { type: 'info', title: 'Ударена столица!', text: `Столицата на ${def.name} има още ${def.lives} ${def.lives === 1 ? 'кула' : 'кули'}.`, region };
      } else {
        for (const r of this.regionsOf(defId)) this.owner[r] = attId;
        this.value[region] = VALUES.region + VALUES.step;
        def.alive = false;
        this.say(`${att.name} превзе столицата и всички области на ${def.name}!`);
        this.current = { type: 'info', title: 'Столицата падна!', text: `${att.name} взе всички области на ${def.name}.`, region };
      }
    } else {
      this.owner[region] = attId; this.value[region] += VALUES.step;
      this.say(`${att.name} превзе ${REGIONS[region].name}!`);
      this.current = { type: 'info', title: `${att.name} превзе ${REGIONS[region].name}!`, text: '', region };
    }
    this.emit();
    await this.sleep(this.t('info'));
  }

  finish() {
    this.phase = 'ended';
    const ranking = this.players.map((p) => ({ id: p.id, score: this.score(p.id) })).sort((a, b) => b.score - a.score);
    this.winner = ranking[0].id;
    this.current = { type: 'end', ranking };
    this.say(`Победител: ${this.player(this.winner).name}!`);
    this.emit();
  }

  // ---------- въпроси и избор ----------
  async askQuestion(q, participants, ctx) {
    const answers = {};
    const started = Date.now();
    this.current = { type: 'question', kind: 'mc', q, participants, answers, started, endsAt: started + this.t('mc'), ...ctx };
    for (const pid of participants) this.botAnswer(pid, q);
    this.emit();
    await this.waitFor(this.t('mc'), () => participants.every((p) => answers[p]));
    this.current = { ...this.current, type: 'reveal' };
    this.emit();
    await this.sleep(this.t('reveal'));
    return answers;
  }

  // Връща участниците подредени: най-близък отговор, после по-бърз
  async askNumeric(q, participants, ctx) {
    const answers = {};
    const started = Date.now();
    this.current = { type: 'question', kind: 'num', q, participants, answers, started, endsAt: started + this.t('num'), ...ctx };
    for (const pid of participants) this.botAnswer(pid, q);
    this.emit();
    await this.waitFor(this.t('num'), () => participants.every((p) => answers[p]));
    const key = (pid) => answers[pid] ? [Math.abs(answers[pid].value - q.answer), answers[pid].ms] : [Infinity, Infinity];
    const ranked = participants.slice().sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] - kb[0] || ka[1] - kb[1]; });
    this.current = { ...this.current, type: 'reveal', ranked };
    this.emit();
    await this.sleep(this.t('reveal'));
    return ranked;
  }

  async askPick(pid, options, title, mode) {
    const started = Date.now();
    this.current = { type: 'pick', mode, picker: pid, options, title, started, endsAt: started + this.t('pick'), chosen: null };
    const cur = this.current;
    if (this.player(pid).isBot) this.setTimer(() => this.pick(pid, this.botChooseRegion(pid, options, mode)), this.t('pick') * rnd(0.08, 0.2));
    this.emit();
    await this.waitFor(this.t('pick'), () => cur.chosen);
    return cur.chosen || pickOne(options);
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

  // ---------- ботове ----------
  botAnswer(pid, q) {
    const p = this.player(pid);
    if (!p.isBot) return;
    const limit = this.t(q.kind === 'num' ? 'num' : 'mc');
    this.setTimer(() => {
      if (q.kind === 'num') {
        const noise = (Math.random() - 0.5) * 0.4 * (1.2 - p.skill);
        this.answer(pid, Math.max(0, Math.round(q.answer * (1 + noise))));
      } else {
        const right = Math.random() < p.skill;
        this.answer(pid, right ? q.correct : pickOne(q.options.filter((o) => o !== q.correct)));
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
    if (mode === 'attack') {
      const nonCap = options.filter((r) => !this.players.some((p) => p.capital === r));
      const pool = Math.random() < 0.25 || !nonCap.length ? options : nonCap;
      return pool.slice().sort((a, b) => this.value[a] - this.value[b])[0];
    }
    return pickOne(options);
  }

  // ---------- изглед за клиента (без верните отговори преди разкриването) ----------
  view(forPid) {
    const c = this.current;
    let cur = null;
    if (c) {
      cur = { ...c };
      if (c.q) {
        cur.q = { text: c.q.text, subject: c.q.subject, kind: c.q.kind, options: c.q.options };
        if (c.type === 'reveal') { cur.q.correct = c.q.correct; cur.q.answer = c.q.answer; cur.answers = c.answers; }
        else cur.answers = Object.fromEntries(Object.keys(c.answers).map((k) => [k, k === forPid ? c.answers[k] : { hidden: true }]));
      }
      cur.timeLeft = c.endsAt ? Math.max(0, c.endsAt - Date.now()) : null;
      delete cur.started; delete cur.endsAt;
    }
    return {
      phase: this.phase, round: this.round, battleRounds: this.battleRounds, grade: this.grade,
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, isBot: p.isBot, alive: p.alive, capital: p.capital, lives: p.lives, score: this.score(p.id), regions: this.regionsOf(p.id).length })),
      owner: this.owner, value: this.value, current: cur, log: this.log.slice(-8),
    };
  }
}

module.exports = { Game, REGIONS, COLORS };
