// HTTP сървър за статичните файлове + WebSocket за игра в реално време.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game } = require('./game');
const { MC, SUBJECTS } = require('./questions');

const PORT = process.env.PORT || 3000;
const SPEED = Number(process.env.GAME_SPEED || 1); // 0.3 = по-бърза игра за демонстрация
const PUBLIC = path.join(__dirname, '..', 'public');
const MAP_FILE = path.join(__dirname, '..', 'data', 'map.json');
const MAX_PLAYERS = 4;
const PUBLIC_PLAYERS = 3; // онлайн игра: трима играчи, както в Тривиадор
const REPORTS_FILE = process.env.REPORTS_FILE || path.join(__dirname, '..', 'data', 'reports.jsonl');
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const BOT_NAMES = ['Бот Мечо', 'Бот Зайо', 'Бот Лиса', 'Бот Щърко'];
const QUICK_WAIT_MS = Number(process.env.QUICK_WAIT_MS || 15000); // онлайн игра: колко чакаме хора, преди да добавим ботове
const ALL_SUBJECTS = Object.keys(SUBJECTS);
// Кои предмети имат въпроси за всеки клас (класа и класа под него), за избора на категории в стаята
const SUBJECTS_BY_GRADE = Object.fromEntries([1, 2, 3, 4].map((g) => [g, ALL_SUBJECTS.filter((s) => MC.filter((q) => q.subject === s && q.grade <= g && q.grade >= g - 1).length >= 15)]));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/map.json') return sendFile(res, MAP_FILE);
  if (url === '/admin/reports') return adminReports(req, res);
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(PUBLIC, url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  sendFile(res, file);
});
// Преглед на сигналите: /admin/reports?key=<ADMIN_KEY> (работи само ако ADMIN_KEY е зададен)
function adminReports(req, res) {
  const key = new URL(req.url, 'http://x').searchParams.get('key');
  if (!ADMIN_KEY || key !== ADMIN_KEY) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(REPORTS_FILE, 'utf8', (e, data) => {
    const rows = (data || '').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(rows, null, 2));
  });
}
function sendFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// ---------- стаи ----------
const rooms = new Map();
const newId = () => crypto.randomBytes(6).toString('hex');
function newCode() {
  let c; do { c = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms.has(c));
  return c;
}

class Room {
  constructor(code, opts = {}) {
    this.code = code; this.members = []; this.grade = opts.grade || 2; this.battleRounds = 3; this.subjects = null; // null = всички предмети
    this.isPublic = !!opts.isPublic; this.game = null; this.hostId = null; this.emptySince = null; this.autoStartAt = null;
  }
  get humans() { return this.members.filter((m) => !m.isBot); }
  lobbyView() {
    return { code: this.code, hostId: this.hostId, grade: this.grade, battleRounds: this.battleRounds, isPublic: this.isPublic,
      subjects: this.subjects || SUBJECTS_BY_GRADE[this.grade], available: SUBJECTS_BY_GRADE[this.grade], allSubjects: !this.subjects,
      autoStartIn: this.autoStartAt ? Math.max(0, this.autoStartAt - Date.now()) : null,
      inGame: !!this.game && this.game.phase !== 'ended',
      members: this.members.map((m) => ({ id: m.id, name: m.name, isBot: m.isBot, connected: m.isBot || !!m.ws })) };
  }
  broadcast() {
    for (const m of this.humans) if (m.ws) send(m.ws, this.game ? { t: 'game', lobby: this.lobbyView(), state: this.game.view(m.id) } : { t: 'lobby', lobby: this.lobbyView() });
  }
  addBot() {
    if (this.members.length >= MAX_PLAYERS) return;
    this.members.push({ id: newId(), name: BOT_NAMES.find((n) => !this.members.some((m) => m.name === n)), isBot: true });
  }
  start() {
    if (this.game) this.game.abort();
    clearTimeout(this.autoTimer); this.autoStartAt = null;
    const subjects = this.subjects ? this.subjects.filter((x) => SUBJECTS_BY_GRADE[this.grade].includes(x)) : null;
    this.game = new Game(this.members, { grade: this.grade, battleRounds: this.battleRounds, subjects: subjects && subjects.length ? subjects : null, speed: SPEED, onChange: () => this.broadcast() });
    this.game.run().catch((e) => console.error('game error', e));
  }
  // Онлайн стая: тръгва, когато се съберат 4 души, или след QUICK_WAIT_MS, като празните места се пълнят с ботове
  scheduleAutoStart() {
    if (this.autoTimer) return;
    this.autoStartAt = Date.now() + QUICK_WAIT_MS;
    this.autoTimer = setTimeout(() => {
      this.autoTimer = null;
      if (this.game || !this.humans.length) return;
      while (this.members.length < PUBLIC_PLAYERS) this.addBot();
      this.start();
    }, QUICK_WAIT_MS);
  }
  destroy() { clearTimeout(this.autoTimer); if (this.game) this.game.abort(); rooms.delete(this.code); }
}

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
const cleanName = (n) => String(n || '').replace(/[<>]/g, '').trim().slice(0, 16) || 'Играч';

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  let room = null, me = null;
  const err = (msg) => send(ws, { t: 'error', msg });
  const attach = (r, m) => {
    room = r; me = m; if (m.ws && m.ws !== ws) m.ws.close(); m.ws = ws; r.emptySince = null;
    send(ws, { t: 'joined', code: r.code, pid: m.id, token: m.token });
    r.broadcast();
  };

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const isHost = room && me && room.hostId === me.id;
    switch (msg.t) {
      case 'create': {
        const r = new Room(newCode(), { grade: [1, 2, 3, 4].includes(msg.grade) ? msg.grade : 2 }); rooms.set(r.code, r);
        const m = { id: newId(), token: newId(), name: cleanName(msg.name), isBot: false };
        r.members.push(m); r.hostId = m.id; attach(r, m); break;
      }
      // Онлайн игра: влиза в отворена публична стая за същия клас или създава нова
      case 'quick': {
        const grade = [1, 2, 3, 4].includes(msg.grade) ? msg.grade : 2;
        let r = [...rooms.values()].find((x) => x.isPublic && !x.game && x.grade === grade && x.members.length < PUBLIC_PLAYERS);
        if (!r) { r = new Room(newCode(), { isPublic: true, grade }); rooms.set(r.code, r); }
        const m = { id: newId(), token: newId(), name: cleanName(msg.name), isBot: false };
        r.members.push(m); attach(r, m);
        if (r.humans.length >= PUBLIC_PLAYERS) r.start(); else r.scheduleAutoStart();
        r.broadcast(); break;
      }
      // Игра с ботове: веднага, без чакане
      case 'bots': {
        const r = new Room(newCode(), { grade: [1, 2, 3, 4].includes(msg.grade) ? msg.grade : 2 }); rooms.set(r.code, r);
        const m = { id: newId(), token: newId(), name: cleanName(msg.name), isBot: false };
        r.members.push(m); r.hostId = m.id;
        const n = Math.min(3, Math.max(1, Number(msg.bots) || 2));
        for (let i = 0; i < n; i++) r.addBot();
        attach(r, m); r.start(); break;
      }
      case 'join': {
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) return err('Няма стая с такъв код.');
        if (r.isPublic) return err('Няма стая с такъв код.');
        if (r.game && r.game.phase !== 'ended') return err('Играта в тази стая вече е започнала.');
        if (r.members.length >= MAX_PLAYERS) return err('Стаята е пълна (най-много 4 играчи).');
        const m = { id: newId(), token: newId(), name: cleanName(msg.name), isBot: false };
        r.members.push(m); attach(r, m); break;
      }
      case 'resume': {
        const r = rooms.get(msg.code);
        const m = r && r.members.find((x) => x.id === msg.pid && x.token === msg.token);
        if (!m) return send(ws, { t: 'resumeFailed' });
        attach(r, m); break;
      }
      case 'leave': {
        if (!room) return;
        if (!room.game || room.game.phase === 'ended') {
          room.members = room.members.filter((x) => x !== me);
          if (room.hostId === me.id) room.hostId = room.humans[0]?.id || null;
          if (!room.humans.length) room.destroy(); else room.broadcast();
        } else {
          // Излизане по средата на игра: бот поема мястото
          me.ws = null; me.isBot = true;
          if (!room.humans.length) room.destroy();
          else { room.game.takeOver(me.id); if (room.hostId === me.id) room.hostId = room.humans[0].id; }
        }
        room = null; me = null; send(ws, { t: 'left' }); break;
      }
      case 'setOptions':
        if (!isHost || (room.game && room.game.phase !== 'ended')) return;
        if ([1, 2, 3, 4].includes(msg.grade)) room.grade = msg.grade;
        if ([2, 3, 4, 5].includes(msg.battleRounds)) room.battleRounds = msg.battleRounds;
        if (msg.subjects === 'all') room.subjects = null;
        else if (Array.isArray(msg.subjects)) {
          const list = [...new Set(msg.subjects.map(String))].filter((x) => ALL_SUBJECTS.includes(x));
          if (list.length) room.subjects = list;
        }
        room.broadcast(); break;
      case 'addBot':
        if (!isHost || room.members.length >= MAX_PLAYERS) return;
        room.addBot(); room.broadcast(); break;
      case 'kick':
        if (!isHost || (room.game && room.game.phase !== 'ended')) return;
        room.members = room.members.filter((m) => m.id !== msg.pid || m.id === me.id);
        room.broadcast(); break;
      case 'start':
        if (!isHost) return;
        if (room.members.length < 2) return err('Нужни са поне 2 играчи (може да добавиш бот).');
        if (room.game && room.game.phase !== 'ended') return;
        room.start(); break;
      case 'backToLobby':
        if (!isHost || !room.game || room.game.phase !== 'ended') return;
        room.game = null; room.broadcast(); break;
      case 'report': {
        // Сигнали от играчите: data/reports.jsonl (един ред JSON на сигнал)
        const now = Date.now();
        if (ws.lastReport && now - ws.lastReport < 5000) return err('Изчакай малко преди следващия сигнал.');
        const reason = String(msg.reason || '').slice(0, 80);
        const text = String(msg.text || '').slice(0, 500).trim();
        if (!reason || (reason === 'Друго' && text.length < 3)) return err('Опиши проблема.');
        const q = msg.question && typeof msg.question === 'object' ? { text: String(msg.question.text || '').slice(0, 300), subject: String(msg.question.subject || '').slice(0, 10), grade: Number(msg.question.grade) || null } : null;
        const entry = { at: new Date(now).toISOString(), reason, text, question: q, name: cleanName(me?.name || msg.name), room: room?.code || null };
        ws.lastReport = now;
        fs.appendFile(REPORTS_FILE, JSON.stringify(entry) + '\n', (e) => { if (e) console.error('report save failed', e); });
        console.log('REPORT', JSON.stringify(entry));
        send(ws, { t: 'reportOk' });
        break;
      }
      case 'answer': if (room?.game) room.game.answer(me.id, msg.value); break;
      case 'pick': if (room?.game) room.game.pick(me.id, msg.region); break;
      case 'joker': if (room?.game) room.game.useJoker(me.id, String(msg.kind)); break;
    }
  });

  ws.on('close', () => {
    if (!room || !me || me.ws !== ws) return;
    me.ws = null;
    if (room.isPublic && !room.game) { // онлайн стая, която още чака: махаме излезлия играч
      room.members = room.members.filter((x) => x !== me);
      if (!room.humans.length) return room.destroy();
    }
    if (!room.humans.some((m) => m.ws)) room.emptySince = Date.now();
    room.broadcast();
  });
});

// Стаи без свързани хора се трият след 10 минути
setInterval(() => { for (const r of rooms.values()) if (r.emptySince && Date.now() - r.emptySince > 10 * 60 * 1000) r.destroy(); }, 60 * 1000).unref();

server.listen(PORT, () => console.log(`Quizzard работи на http://localhost:${PORT}`));
