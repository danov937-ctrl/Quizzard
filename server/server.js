// HTTP сървър за статичните файлове + WebSocket за игра в реално време.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game } = require('./game');

const PORT = process.env.PORT || 3000;
const SPEED = Number(process.env.GAME_SPEED || 1); // 0.3 = по-бърза игра за демонстрация
const PUBLIC = path.join(__dirname, '..', 'public');
const MAP_FILE = path.join(__dirname, '..', 'data', 'map.json');
const MAX_PLAYERS = 4;
const REPORTS_FILE = process.env.REPORTS_FILE || path.join(__dirname, '..', 'data', 'reports.jsonl');
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const BOT_NAMES = ['Бот Мечо', 'Бот Зайо', 'Бот Лиса', 'Бот Щърко'];
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
  constructor(code) { this.code = code; this.members = []; this.grade = 2; this.battleRounds = 3; this.game = null; this.hostId = null; this.emptySince = null; }
  get humans() { return this.members.filter((m) => !m.isBot); }
  lobbyView() {
    return { code: this.code, hostId: this.hostId, grade: this.grade, battleRounds: this.battleRounds, inGame: !!this.game && this.game.phase !== 'ended',
      members: this.members.map((m) => ({ id: m.id, name: m.name, isBot: m.isBot, connected: m.isBot || !!m.ws })) };
  }
  broadcast() {
    for (const m of this.humans) if (m.ws) send(m.ws, this.game ? { t: 'game', lobby: this.lobbyView(), state: this.game.view(m.id) } : { t: 'lobby', lobby: this.lobbyView() });
  }
  start() {
    if (this.game) this.game.abort();
    this.game = new Game(this.members, { grade: this.grade, battleRounds: this.battleRounds, speed: SPEED, onChange: () => this.broadcast() });
    this.game.run().catch((e) => console.error('game error', e));
  }
  destroy() { if (this.game) this.game.abort(); rooms.delete(this.code); }
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
        const r = new Room(newCode()); rooms.set(r.code, r);
        const m = { id: newId(), token: newId(), name: cleanName(msg.name), isBot: false };
        r.members.push(m); r.hostId = m.id; attach(r, m); break;
      }
      case 'join': {
        const r = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!r) return err('Няма стая с такъв код.');
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
        } else me.ws = null;
        room = null; me = null; send(ws, { t: 'left' }); break;
      }
      case 'setOptions':
        if (!isHost || (room.game && room.game.phase !== 'ended')) return;
        if ([1, 2, 3, 4].includes(msg.grade)) room.grade = msg.grade;
        if ([2, 3, 4, 5].includes(msg.battleRounds)) room.battleRounds = msg.battleRounds;
        room.broadcast(); break;
      case 'addBot':
        if (!isHost || room.members.length >= MAX_PLAYERS) return;
        room.members.push({ id: newId(), name: BOT_NAMES.find((n) => !room.members.some((m) => m.name === n)), isBot: true });
        room.broadcast(); break;
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
    }
  });

  ws.on('close', () => {
    if (!room || !me || me.ws !== ws) return;
    me.ws = null;
    if (!room.humans.some((m) => m.ws)) room.emptySince = Date.now();
    room.broadcast();
  });
});

// Стаи без свързани хора се трият след 10 минути
setInterval(() => { for (const r of rooms.values()) if (r.emptySince && Date.now() - r.emptySince > 10 * 60 * 1000) r.destroy(); }, 60 * 1000).unref();

server.listen(PORT, () => console.log(`Quizzard работи на http://localhost:${PORT}`));
