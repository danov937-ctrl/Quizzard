// Изиграва много бързи игри само с ботове и проверява правилата и точките.
const assert = require('assert');
const { Game, REGIONS, VALUES } = require('../game');
const IDS = Object.keys(REGIONS);

async function play(n, grade, rounds) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Бот ' + (i + 1), isBot: true }));
  const seen = { num: 0, attack: 0, tower: 0, fall: 0, defend: 0, joker: 0, capitalPick: 0 };
  let prevOwner = null, lastFx = 0;
  const g = new Game(players, { grade, battleRounds: rounds, speed: 0.0003, onChange: () => {
    const c = g.current;
    if (c && c.kind === 'num') seen.num++;
    if (c && c.mode === 'capital') seen.capitalPick++;
    if (c && c.removed && Object.keys(c.removed).length) seen.joker++;
    JSON.stringify(g.view('p0'));
    for (const f of g.fx) if (f.id > lastFx) { lastFx = f.id; if (seen[f.type] !== undefined) seen[f.type]++; }
    // Инварианти след всяка промяна
    for (const p of g.players) {
      assert.strictEqual(g.score(p.id), g.regionsOf(p.id).reduce((s, r) => s + g.value[r], 0) + p.bonus, 'точките = области + бонус');
      assert.ok(p.towers >= 0 && p.towers <= 3);
      if (p.alive && p.capital && g.phase !== 'capitals') assert.strictEqual(g.owner[p.capital], p.id, 'жив играч държи столицата си');
      if (!p.alive) assert.strictEqual(g.regionsOf(p.id).length, 0, 'отпаднал играч няма области');
    }
    // Във войната област сменя собственика си само към съсед на нападателя
    if (prevOwner && g.phase === 'battle') for (const r of IDS) if (prevOwner[r] && prevOwner[r] !== g.owner[r] && g.fx.at(-1)?.type === 'conquer') {
      assert.ok(REGIONS[r].neighbors.some((x) => prevOwner[x] === g.owner[r]), 'нападение само на съседна област');
      assert.strictEqual(g.value[r], VALUES.war, 'превзета във войната област = 400');
    }
    prevOwner = { ...g.owner };
  } });
  await g.run();
  assert.strictEqual(g.phase, 'ended');
  assert.ok(IDS.every((r) => g.owner[r]), 'всички области имат собственик');
  const caps = g.players.map((p) => p.capital);
  assert.strictEqual(new Set(caps).size, caps.length, 'различни столици');
  for (const p of g.players) for (const q of g.players) if (p !== q) assert.ok(!REGIONS[p.capital].neighbors.includes(q.capital), 'столиците не са съседни');
  const alive = g.players.filter((p) => p.alive);
  assert.strictEqual(g.current.ranking[0].id, g.winner);
  if (alive.length === 1) assert.strictEqual(g.winner, alive[0].id, 'последният оцелял печели');
  // Анализът след играта съвпада с отговорите
  for (const p of g.players) {
    const a = g.current.analysis[p.id];
    assert.ok(a && a.correct <= a.total && a.numExact <= a.numTotal, 'анализ');
    assert.strictEqual(Object.values(a.bySubject).reduce((s, b) => s + b.n, 0), a.total + a.numTotal);
  }
  assert.ok(Object.values(g.current.analysis).some((a) => a.total > 0));
  return { seen, log: g.log, alive: alive.length };
}

// Детерминиран тест на точките при защита и превземане на столица
async function capitalScenario() {
  const g = new Game([{ id: 'a', name: 'A', skill: 1 }, { id: 'b', name: 'B', skill: 1 }], { speed: 0.0003 });
  for (const r of IDS) { g.owner[r] = 'b'; g.value[r] = VALUES.region; }
  g.players[0].capital = 'VAR'; g.owner.VAR = 'a'; g.value.VAR = VALUES.capital;
  g.players[1].capital = 'SHU'; g.value.SHU = VALUES.capital;
  const before = g.score('b');
  // A винаги отговаря вярно, B – грешно: 3 кули падат една след друга
  const realAsk = g.askQuestion.bind(g);
  g.askQuestion = async (q, parts, ctx) => ({ a: { value: q.correct, ms: 1 }, b: { value: q.options.find((o) => o !== q.correct), ms: 1 } });
  await g.attack('a', 'SHU');
  assert.strictEqual(g.players[1].alive, false);
  assert.strictEqual(g.players[1].towers, 0);
  assert.strictEqual(g.score('b'), 0);
  assert.strictEqual(g.score('a'), before + VALUES.capital);
  // Защита: B отговаря вярно, A – грешно → +100 за B и нападението свършва
  const h = new Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { speed: 0.0003 });
  for (const r of IDS) { h.owner[r] = 'b'; h.value[r] = VALUES.region; }
  h.owner.VAR = 'a'; h.players[0].capital = 'VAR'; h.players[1].capital = 'SHU';
  let asked = 0;
  h.askQuestion = async (q) => { asked++; return { a: { value: q.options.find((o) => o !== q.correct), ms: 1 }, b: { value: q.correct, ms: 1 } }; };
  await h.attack('a', 'SHU');
  assert.strictEqual(asked, 1, 'атаката срещу столица свършва при верен отговор на защитника');
  assert.strictEqual(h.players[1].bonus, VALUES.defend);
  assert.strictEqual(h.players[1].towers, 3);
  // Обикновена област: B губи 300, A получава 400
  const bBefore = h.score('b'), aBefore = h.score('a');
  h.askQuestion = async (q) => ({ a: { value: q.correct, ms: 1 }, b: { value: q.options.find((o) => o !== q.correct), ms: 1 } });
  await h.attack('a', 'DOB');
  assert.strictEqual(h.score('b'), bBefore - VALUES.region);
  assert.strictEqual(h.score('a'), aBefore + VALUES.war);
  // Равенство при числов въпрос: печели по-бързият
  h.askQuestion = async (q) => ({ a: { value: q.correct, ms: 5 }, b: { value: q.correct, ms: 9 } });
  h.askNumeric = async (q, parts) => parts.slice().sort((x, y) => ({ a: 5, b: 9 }[x] - { a: 5, b: 9 }[y]));
  await h.attack('a', 'SHU');
  assert.strictEqual(h.players[1].towers, 0);
  void realAsk;
}

const untilQuestion = async (g) => { while (g.current?.type !== 'question') await new Promise((r) => setTimeout(r, 2)); };

// Жокери: 50/50 маха 2 грешни, обхват съдържа отговора, +10 сек удължава срока, по веднъж
async function jokerScenario() {
  const g = new Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { speed: 0.01 });
  const q = g.questions.nextMC();
  const p = g.askQuestion(q, ['a', 'b'], { title: 't' });
  assert.strictEqual(g.current.type, 'prep', 'преди въпроса има карта „Въпрос“');
  assert.ok(!g.view('a').current.q, 'по време на отброяването въпросът не се вижда');
  assert.ok(!g.useJoker('a', 'fifty'), 'жокер не се ползва преди въпроса');
  await untilQuestion(g);
  assert.ok(g.useJoker('a', 'fifty'));
  const rem = g.current.removed.a;
  assert.strictEqual(rem.length, 2); assert.ok(!rem.includes(q.correct));
  assert.ok(!g.useJoker('a', 'fifty'), 'само веднъж');
  assert.ok(!g.useJoker('a', 'range'), 'обхват само за числов въпрос');
  const end = g.current.endsAt; assert.ok(g.useJoker('b', 'time')); assert.strictEqual(g.current.endsAt, end + 10000);
  assert.ok(!g.view('b').current.q.correct, 'верният отговор не се вижда преди края');
  assert.deepStrictEqual(g.view('b').current.removed, [], 'жокерът на A не се вижда от B');
  g.answer('a', q.correct); g.answer('b', q.correct);
  await p;
  const nq = g.questions.nextNum();
  const pn = g.askNumeric(nq, ['a', 'b'], { title: 't' });
  await untilQuestion(g);
  assert.ok(g.useJoker('a', 'range'));
  const [lo, hi] = g.current.hints.a.match(/\d+/g).map(Number);
  assert.ok(lo <= nq.answer && nq.answer <= hi, 'обхватът съдържа отговора');
  g.answer('a', nq.answer); g.answer('b', nq.answer + 1);
  assert.deepStrictEqual(await pn, ['a', 'b']);
  g.abort();
}

(async () => {
  await capitalScenario();
  await jokerScenario();
  const tot = { num: 0, attack: 0, tower: 0, fall: 0, defend: 0, joker: 0, capitalPick: 0, ended1: 0 };
  const N = 120;
  for (let i = 0; i < N; i++) {
    const r = await play(2 + (i % 3), 1 + (i % 4), 2 + (i % 4));
    for (const k in r.seen) tot[k] += r.seen[k] > 0;
    tot.ended1 += r.alive === 1;
    if (i === 0) console.log(r.log.slice(-12).join('\n'));
  }
  assert.ok(tot.num > N * 0.8 && tot.attack > N * 0.8 && tot.capitalPick === N && tot.defend > N * 0.5 && tot.tower > N * 0.2 && tot.fall > 0); // по-умните ботове се защитават по-често, затова кулите падат по-рядко
  console.log(`OK: ${N} игри. Числов въпрос: ${tot.num}, нападения: ${tot.attack}, паднали кули: ${tot.tower}, паднали столици: ${tot.fall}, защити: ${tot.defend}, жокери: ${tot.joker}, победа с унищожение: ${tot.ended1}`);
})().catch((e) => { console.error(e); process.exit(1); });
