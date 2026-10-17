// Натоварване: N играчи влизат в онлайн игра и отговарят като хора.
// Пускане: cd server && GAME_SPEED=0.3 QUICK_WAIT_MS=2000 node server.js, после node tools/load_test.js 150 300 3000
const WebSocket = require('../server/node_modules/ws');
const http = require('http');
const [N, SECS, PORT] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]];
const URL = 'ws://localhost:' + PORT;
let msgs = 0, bytes = 0, errors = 0, games = 0, ended = 0, answered = 0;
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
for (let i = 0; i < N; i++) setTimeout(() => {
  const ws = new WebSocket(URL); let pid = null, lastQ = null, lastP = null, inGame = false, done = false;
  ws.on('open', () => ws.send(JSON.stringify({ t: 'quick', grade: 2, name: 'Т' + i })));
  ws.on('error', () => errors++);
  ws.on('message', (raw) => {
    msgs++; bytes += raw.length; const m = JSON.parse(raw);
    if (m.t === 'joined') pid = m.pid;
    if (m.t === 'error') { errors++; console.log('err', m.msg); }
    if (m.t !== 'game') return;
    if (!inGame) { inGame = true; games++; }
    const s = m.state, c = s.current;
    if (s.phase === 'ended' && !done) { done = true; ended++; }
    if (!c) return;
    if (c.type === 'question' && c.participants?.includes(pid) && !c.answers?.[pid] && lastQ !== c.q.text) {
      lastQ = c.q.text;
      setTimeout(() => { answered++; ws.send(JSON.stringify({ t: 'answer', value: c.q.kind === 'num' ? Math.floor(Math.random() * 100) : rnd(c.q.options) })); }, 800 + Math.random() * 3000);
    }
    if (c.type === 'pick' && c.picker === pid && !c.chosen && lastP !== JSON.stringify(c.options)) {
      lastP = JSON.stringify(c.options);
      setTimeout(() => ws.send(JSON.stringify({ t: 'pick', region: rnd(c.options) })), 500 + Math.random() * 1500);
    }
  });
}, i * 30);
// Колко бързо се отваря страницата, докато тече натоварването
const lat = [];
const probe = setInterval(() => { const t = Date.now(); http.get('http://localhost:' + PORT + '/', (r) => { r.resume(); r.on('end', () => lat.push(Date.now() - t)); }); }, 250);
setTimeout(() => {
  clearInterval(probe); lat.sort((a, b) => a - b);
  console.log(JSON.stringify({ players: N, secs: SECS, gamesStarted: games, playersFinished: ended, answers: answered, msgs, MB: +(bytes / 1e6).toFixed(1), errors, pageMs_p50: lat[lat.length >> 1], pageMs_p95: lat[Math.floor(lat.length * 0.95)], pageMs_max: lat[lat.length - 1] }));
  process.exit(0);
}, SECS * 1000);
