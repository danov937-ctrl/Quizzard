// Изиграва много бързи игри само с ботове и проверява основните правила.
const assert = require('assert');
const { Game, REGIONS } = require('../game');

async function play(n, grade) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Бот ' + (i + 1), isBot: true }));
  let changes = 0, sawNumeric = false, sawAttack = false;
  const g = new Game(players, { grade, speed: 0.0003, onChange: () => {
    changes++;
    const c = g.current;
    if (c && c.kind === 'num') sawNumeric = true;
    if (c && c.mode === 'attack') sawAttack = true;
    JSON.stringify(g.view('p0'));
  } });
  await g.run();
  assert.strictEqual(g.phase, 'ended');
  assert.ok(Object.values(g.owner).every(Boolean), 'всички области имат собственик');
  const caps = g.players.filter((p) => p.alive).map((p) => p.capital);
  for (const p of g.players.filter((p) => p.alive)) assert.strictEqual(g.owner[p.capital], p.id, 'жив играч държи столицата си');
  assert.strictEqual(new Set(caps).size, caps.length);
  const total = g.players.reduce((s, p) => s + g.score(p.id), 0);
  assert.ok(total > 0);
  return { changes, sawNumeric, sawAttack, winner: g.player(g.winner).name, log: g.log };
}

(async () => {
  let numeric = 0, attack = 0;
  for (let i = 0; i < 40; i++) {
    const r = await play(2 + (i % 3), 1 + (i % 4));
    numeric += r.sawNumeric; attack += r.sawAttack;
    if (i === 0) console.log(r.log.join('\n'));
  }
  assert.ok(numeric > 30 && attack > 30);
  console.log(`OK: 40 игри, числов въпрос в ${numeric}, нападения в ${attack}. Области: ${Object.keys(REGIONS).length}`);
})().catch((e) => { console.error(e); process.exit(1); });
