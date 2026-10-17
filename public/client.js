// Знаменосци клиент: екрани, карта (SVG), въпроси, анимации и звуци.
// Сървърът решава всичко; клиентът само показва състоянието и изпраща ходове.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const SUBJECTS = {
  mat: ['Математика', '🔢'], bel: ['Български език и литература', '📖'], okol: ['Околен свят', '🌳'],
  prir: ['Човекът и природата', '🔬'], obsht: ['Човекът и обществото', '🏛️'], muz: ['Музика', '🎵'],
  izk: ['Изобразително изкуство', '🎨'], tech: ['Технологии и предприемачество', '🛠️'],
  comp: ['Компютърно моделиране', '💻'], eng: ['Английски език', '🇬🇧'], sport: ['Физическо възпитание и спорт', '⚽'],
  arts: ['Изкуства', '🎭'],
  // режим за възрастни (18+)
  hist: ['История', '📜'], geo: ['География', '🌍'], sci: ['Природни науки', '🧪'], film: ['Кино и телевизия', '🎬'], music: ['Музика', '🎸'],
  spt: ['Спорт', '🏅'], lit: ['Литература', '📚'], art: ['Изкуство и архитектура', '🖼️'], tec: ['Наука и технологии', '🚀'], gen: ['Обща култура', '💡'],
};
const ADULT = 9, ADULT_SUBJ = ['hist', 'geo', 'sci', 'film', 'music', 'spt', 'lit', 'art', 'tec', 'gen'];
// Режимът за възрастни се включва от adult.js (клас mode-adult на body)
const isAdultMode = () => document.body.classList.contains('mode-adult');
const gradeLabel = (g) => (g === ADULT ? 'Възрастни 18+' : `${g} клас`);
const SUBJ_COLOR = { hist: '#8a5a2b', geo: '#1f7a8c', sci: '#2b8a3e', film: '#6a3fc0', music: '#b8337a', spt: '#b5302a', lit: '#9a3412', art: '#c7591a', tec: '#2f6fd0', gen: '#7a6a12', mat: '#2f6fd0', bel: '#b8323f', okol: '#2f8f4e', prir: '#2b8a3e', obsht: '#9a5b17', muz: '#b8337a', izk: '#c7591a', tech: '#0e7a8f', comp: '#6a3fc0', eng: '#3c46b8', sport: '#b5302a', arts: '#a33a8a' };
const LABEL_FIX = { SFO: [35, -40], SOF: [0, 4] };
const SAVE_KEY = 'quizzard-session';

let ws, me = null, lobby = null, state = null, mapData = null;
let lastModalKey = '', numInput = '', numKey = '', lastQuestion = null, lastFxId = null;
let deadline = 0, deadlineTotal = 1, afterLeave = null, shownScore = {}, castleKeys = {}, attackArrow = null;

const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const show = (id) => { for (const s of $$('.screen')) s.classList.toggle('hidden', s.id !== id); };
const player = (id) => state?.players.find((p) => p.id === id);
const member = (id) => lobby?.members.find((m) => m.id === id);
const pname = (id) => esc(player(id)?.name || member(id)?.name || '?');
const COLORS = ['#d83b2d', '#2c6fd1', '#2f9d48', '#e08a12'];
const colorOf = (id) => player(id)?.color || COLORS[Math.max(0, lobby?.members.findIndex((m) => m.id === id) ?? 0)] || '#888';
const flagOf = (id) => (!(player(id)?.isBot ?? member(id)?.isBot) && member(id)?.flag) || null;
const shield = (id) => {
  const c = colorOf(id), isBot = player(id)?.isBot ?? member(id)?.isBot;
  const l = isBot ? '🤖' : (player(id)?.name || member(id)?.name || '?')[0].toUpperCase();
  // Играч със свое знаме: щитът е в шарката на знамето, с ръб в цвета на играча
  const fl = flagOf(id);
  if (fl && window.ZFlag) {
    const cid = 'sh-' + String(id).replace(/[^a-z0-9]/gi, '');
    return `<svg class="shield" viewBox="0 0 30 34"><defs><clipPath id="${cid}"><path d="M2 2h26v12c0 9-6 15-13 18C8 29 2 23 2 14z"/></clipPath></defs><g clip-path="url(#${cid})"><g transform="translate(-6 0) scale(1.4 1.7)">${ZFlag.inner(fl, 30, 20)}</g></g><path d="M2 2h26v12c0 9-6 15-13 18C8 29 2 23 2 14z" fill="none" stroke="${c}" stroke-width="3"/></svg>`;
  }
  return `<svg class="shield" viewBox="0 0 30 34"><path d="M2 2h26v12c0 9-6 15-13 18C8 29 2 23 2 14z" fill="${c}" stroke="#ffe08a" stroke-width="2.5"/><path d="M2 2h26v6H2z" fill="rgba(255,255,255,.25)"/><text x="15" y="${isBot ? 20 : 21}" text-anchor="middle" font-size="${isBot ? 11 : 14}" font-weight="900" fill="#fff" font-family="Rubik,sans-serif">${esc(l)}</text></svg>`;
};

// ---------- звуци и музика (Web Audio, без файлове) ----------
const Sound = {
  ctx: null, fx: store.get('quizzard-fx', true), music: store.get('quizzard-music', true), musicTimer: null, step: 0,
  ac() {
    if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; this.ctx = new C(); }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, dur, { type = 'sine', vol = 0.15, at = 0, to = null } = {}) {
    const a = this.ac(); if (!a) return;
    const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, { vol = 0.3, at = 0, freq = 600 } = {}) {
    const a = this.ac(); if (!a) return;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f).connect(g).connect(a.destination); s.start(a.currentTime + at);
  },
  play(name) {
    if (!this.fx) return;
    const T = (f, d, o) => this.tone(f, d, o);
    switch (name) {
      case 'click': T(660, 0.06, { type: 'square', vol: 0.05 }); break;
      case 'tick': T(1100, 0.04, { type: 'square', vol: 0.04 }); break;
      case 'good': [523, 659, 784, 1047].forEach((f, i) => T(f, 0.18, { type: 'triangle', at: i * 0.08 })); break;
      case 'bad': T(220, 0.35, { type: 'sawtooth', vol: 0.08, to: 110 }); break;
      case 'flag': [392, 523, 659].forEach((f, i) => T(f, 0.22, { type: 'triangle', at: i * 0.1, vol: 0.12 })); break;
      case 'conquer': [392, 523, 659, 784].forEach((f, i) => T(f, i === 3 ? 0.5 : 0.15, { type: 'square', at: i * 0.12, vol: 0.07 })); break;
      case 'attack': T(300, 0.12, { type: 'sawtooth', vol: 0.06, to: 600 }); T(900, 0.25, { type: 'triangle', at: 0.12, vol: 0.08, to: 1400 }); break;
      case 'tower': this.noise(0.7, { vol: 0.5, freq: 400 }); T(90, 0.6, { vol: 0.25, to: 40 }); break;
      case 'fall': this.noise(1.4, { vol: 0.6, freq: 300 }); [392, 330, 262, 196].forEach((f, i) => T(f, 0.35, { type: 'sawtooth', at: 0.3 + i * 0.18, vol: 0.06 })); break;
      case 'defend': T(1320, 0.4, { type: 'triangle', vol: 0.1 }); T(1760, 0.5, { type: 'sine', at: 0.05, vol: 0.06 }); break;
      case 'joker': [784, 988, 1175, 1568].forEach((f, i) => T(f, 0.12, { type: 'sine', at: i * 0.05, vol: 0.08 })); break;
      case 'win': [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => T(f, i === 7 ? 0.8 : 0.16, { type: 'square', at: i * 0.15, vol: 0.06 })); break;
    }
  },
  // Кратка средновековна мелодия (ре дорийски), тиха, на кръг; през празниците (season.js) — „Джингъл белс“
  MEL: document.documentElement.dataset.season === 'xmas'
    ? [64, 64, 64, 0, 64, 64, 64, 0, 64, 67, 60, 62, 64, 0, 0, 0, 65, 65, 65, 65, 65, 64, 64, 64, 64, 62, 62, 64, 62, 0, 67, 0,
      64, 64, 64, 0, 64, 64, 64, 0, 64, 67, 60, 62, 64, 0, 0, 0, 65, 65, 65, 65, 65, 64, 64, 64, 67, 67, 65, 62, 60, 0, 0, 0]
    : [62, 65, 69, 67, 65, 64, 62, 0, 60, 64, 67, 65, 64, 62, 60, 0, 62, 65, 69, 72, 71, 69, 67, 0, 69, 67, 65, 64, 62, 64, 62, 0],
  BASS: document.documentElement.dataset.season === 'xmas' ? [36, 41, 43, 36] : [38, 36, 41, 38],
  startMusic() {
    if (!this.music || this.musicTimer || !this.ac()) return;
    const hz = (m) => 440 * 2 ** ((m - 69) / 12);
    this.musicTimer = setInterval(() => {
      const n = this.MEL[this.step % this.MEL.length];
      if (n) this.tone(hz(n), 0.32, { type: 'triangle', vol: 0.035 });
      if (this.step % 8 === 0) this.tone(hz(this.BASS[(this.step / 8) % 4]), 1.6, { type: 'sine', vol: 0.05 });
      this.step++;
    }, 300);
  },
  stopMusic() { clearInterval(this.musicTimer); this.musicTimer = null; },
  toggle(kind) {
    this[kind] = !this[kind]; store.set('quizzard-' + kind, this[kind]);
    if (kind === 'music') this.music ? this.startMusic() : this.stopMusic();
    syncSoundButtons();
  },
};
function syncSoundButtons() { for (const b of $$('[data-sound]')) b.classList.toggle('off', !Sound[b.dataset.sound]); }
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-sound]');
  if (b) { Sound.toggle(b.dataset.sound); return; }
  Sound.startMusic(); // браузърите пускат звук само след първо докосване
  if (e.target.closest('button')) Sound.play('click');
}, true);
syncSoundButtons();

// ---------- четене на глас ----------
const canSpeak = 'speechSynthesis' in window;
function speak(text, btn) {
  if (!canSpeak) return;
  const s = window.speechSynthesis;
  if (s.speaking) { s.cancel(); btn?.classList.remove('on'); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'bg-BG'; u.rate = 0.9;
  const v = s.getVoices().find((x) => x.lang?.toLowerCase().startsWith('bg'));
  if (v) u.voice = v;
  u.onend = u.onerror = () => btn?.classList.remove('on');
  btn?.classList.add('on');
  s.speak(u);
}
if (canSpeak) window.speechSynthesis.getVoices();

// ---------- връзка ----------
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { const s = store.get(SAVE_KEY); if (s) send({ t: 'resume', ...s }); };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => setTimeout(connect, 1500);
}
const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

function handle(m) {
  if (m.t === 'joined') { me = m.pid; store.set(SAVE_KEY, { code: m.code, pid: m.pid, token: m.token }); }
  else if (m.t === 'resumeFailed' || m.t === 'left') {
    store.del(SAVE_KEY); me = null; state = null; lastFxId = null; closeOverlay(); show('home');
    if (afterLeave) { const f = afterLeave; afterLeave = null; f(); }
  }
  else if (m.t === 'practiceSet') startPracticeSet(m);
  else if (m.t === 'reportOk') { closeReport(); toast('Благодарим! Сигналът е изпратен.'); }
  else if (m.t === 'error') { for (const s of ['#homeErr', '#lobbyErr', '#reportErr']) $(s).textContent = m.msg; }
  else if (m.t === 'lobby') { lobby = m.lobby; state = null; lastFxId = null; closeOverlay(); renderLobby(); show('lobby'); }
  else if (m.t === 'game') { lobby = m.lobby; state = m.state; show('game'); renderGame(); }
}

// ---------- начален екран ----------
let homeGrade = store.get('quizzard-grade', 2);
function renderHomeGrade() {
  $('#homeGrade').innerHTML = [1, 2, 3, 4].map((g) => `<button class="${homeGrade === g ? 'on' : ''}" data-hg="${g}">${g} клас</button>`).join('');
  for (const b of $$('[data-hg]')) b.onclick = () => { homeGrade = +b.dataset.hg; store.set('quizzard-grade', homeGrade); renderHomeGrade(); };
}
renderHomeGrade();
$('#name').value = store.get('quizzard-name', '') || '';
const myName = () => { const n = $('#name').value.trim(); store.set('quizzard-name', n); return n; };
const needName = () => { if (myName()) return false; $('#homeErr').textContent = 'Напиши името си.'; $('#name').focus(); return true; };
const playGrade = () => (isAdultMode() ? ADULT : homeGrade);
const startQuick = () => send({ t: 'quick', name: myName(), grade: playGrade() });
$('#btnQuick').onclick = () => { if (!needName()) startQuick(); };
$('#btnFriends').onclick = () => { if (!needName()) send({ t: 'create', name: myName(), grade: playGrade() }); };
$('#btnBots').onclick = () => {
  if (needName()) return;
  openOverlay(`<div class="mhead"><h3>🤖 Срещу колко бота?</h3></div><div class="mbody"><div class="seg">${[1, 2, 3].map((n) => `<button data-nb="${n}">${n} ${n === 1 ? 'бот' : 'бота'}</button>`).join('')}</div>
    <button class="link" id="nbCancel" style="display:block;margin:12px auto 0;color:var(--muted)">Отказ</button></div>`);
  for (const b of $$('[data-nb]')) b.onclick = () => { closeOverlay(); send({ t: 'bots', name: myName(), grade: playGrade(), bots: +b.dataset.nb }); };
  $('#nbCancel').onclick = closeOverlay;
};
$('#btnJoin').onclick = () => { if (!needName()) send({ t: 'join', name: myName(), code: $('#code').value.trim() }); };
$('#code').addEventListener('keydown', (e) => e.key === 'Enter' && $('#btnJoin').click());
$('#btnBot').onclick = () => send({ t: 'addBot' });
$('#btnStart').onclick = () => send({ t: 'start' });
$('#btnLeave').onclick = () => send({ t: 'leave' });
// Излизане по време на игра (след края излиза веднага)
$('#btnExit').onclick = () => { if (state?.phase === 'ended') send({ t: 'leave' }); else $('#leaveOverlay').classList.remove('hidden'); };
$('#leaveNo').onclick = () => $('#leaveOverlay').classList.add('hidden');
$('#leaveYes').onclick = () => { $('#leaveOverlay').classList.add('hidden'); send({ t: 'leave' }); };
$('#btnRules').onclick = () => {
  openOverlay(`<div class="mhead"><h3>📜 Как се играе „Знаменосци“?</h3></div><div class="mbody rules"><ol>
    <li>🏰 <b>Столица.</b> Всеки избира своята столица. Тя носи <b>1000 точки</b> и има <b>3 кули</b>.</li>
    <li>🗺️ <b>Рунд 1: Завладяване.</b> Всички отговарят на въпрос с 4 отговора. Който познае, избира свободна област до своите. Всяка област носи <b>300 точки</b>.</li>
    <li>🎯 Ако познаят няколко, идва <b>въпрос с число</b>. Най-близкият взима 2 области, другите по 1. При еднакъв отговор печели по-бързият.</li>
    <li>⚔️ <b>Рунд 2: Война.</b> Когато картата се запълни, нападаш <b>съседни</b> области. Превзета област става <b>400 точки</b> за теб, а противникът губи старата ѝ стойност.</li>
    <li>🛡️ Ако защитникът познае, а нападателят не, областта остава и защитникът получава <b>+100 точки</b>. Ако и двамата познаят, решава въпрос с число.</li>
    <li>🏯 Всяка кула на столицата е един въпрос. Паднат ли и трите, нападателят взима <b>всички области</b> на противника. Ако защитникът познае, нападението спира.</li>
    <li>🃏 <b>Жокери</b> (всеки по веднъж): <b>50/50</b> маха два грешни отговора, <b>🎯 Обхват</b> подсказва между кои числа е отговорът, <b>⏳ +10 сек</b> дава още време.</li>
    <li>👑 Войната има определен брой рундове. Остане ли само един играч, той печели. Иначе печели този с <b>най-много точки</b>.</li>
    </ol><button class="btn gold big" id="btnRulesOk" style="width:100%">Разбрах!</button></div>`);
  $('#btnRulesOk').onclick = closeOverlay;
};
function openOverlay(html) { $('#overlay').classList.remove('hidden', 'dock'); $('#modal').innerHTML = html; lastModalKey = '#static'; }
function closeOverlay() { $('#overlay').classList.add('hidden'); lastModalKey = ''; }

// ---------- стая ----------
let lobbyTimer = null;
function renderLobby() {
  $('#lobbyErr').textContent = '';
  const host = lobby.hostId === me && !lobby.isPublic;
  clearInterval(lobbyTimer);
  if (lobby.isPublic) {
    const until = Date.now() + (lobby.autoStartIn ?? 0);
    const tick = () => { const s = Math.ceil(Math.max(0, until - Date.now()) / 1000); const el = $('#lobbyHead .count'); if (el) el.textContent = s; };
    $('#lobbyHead').innerHTML = `<div class="eyebrow">Онлайн игра · ${gradeLabel(lobby.grade)}</div><p class="searching">⚔️ Търсим играчи… <span class="count"></span></p>
      <p class="sub">${lobby.adult ? 'Ако не дойдат още играчи, ще влязат ботове.' : 'Ако не дойдат още деца, ще влязат ботове.'}</p>${stakeNote()}`;
    tick(); lobbyTimer = setInterval(tick, 250);
  } else {
    $('#lobbyHead').innerHTML = `<div class="eyebrow">Код на стаята${lobby.adult ? ' · Възрастни 18+' : ''}</div><div class="room-code">${esc(lobby.code)}</div><p class="sub">Кажи кода на приятелите си, за да влязат.</p>${stakeNote()}`;
  }
  $('#members').innerHTML = lobby.members.map((m) => `<li>${shield(m.id)}${esc(m.name)}
    <span class="tags">${m.coins != null ? `<span class="tag coin">🪙 ${m.coins}</span>` : ''}${m.id === me ? '<span class="tag">ти</span>' : ''}${m.id === lobby.hostId && !lobby.isPublic ? '<span class="tag">👑 домакин</span>' : ''}${!m.connected ? '<span class="tag">няма връзка</span>' : ''}
    ${host && m.id !== me ? `<button data-kick="${m.id}" title="Премахни">✕</button>` : ''}</span></li>`).join('') +
    Array.from({ length: Math.max(0, (lobby.isPublic ? 3 : 2) - lobby.members.length) }, () => '<li class="empty">свободно място</li>').join('');
  for (const b of $$('[data-kick]')) b.onclick = () => send({ t: 'kick', pid: b.dataset.kick });
  $('#hostControls').classList.toggle('hidden', !host);
  $('#guestWait').classList.toggle('hidden', host || lobby.isPublic);
  $('#guestWait').textContent = '⏳ Изчакай домакина да започне играта.';
  if (!host) return;
  // В стая за възрастни класът не се сменя
  $('#gradeBtns').classList.toggle('hidden', !!lobby.adult); $('#gradeBtns').previousElementSibling?.classList.toggle('hidden', !!lobby.adult);
  $('#subjCount').previousSibling.textContent = lobby.adult ? 'Категории ' : 'Предмети ';
  $('#gradeBtns').innerHTML = [1, 2, 3, 4].map((g) => `<button class="${lobby.grade === g ? 'on' : ''}" data-g="${g}">${g} клас</button>`).join('');
  $('#roundBtns').innerHTML = [2, 3, 4, 5].map((r) => `<button class="${lobby.battleRounds === r ? 'on' : ''}" data-r="${r}">${r}</button>`).join('');
  for (const b of $$('[data-g]')) b.onclick = () => send({ t: 'setOptions', grade: +b.dataset.g });
  for (const b of $$('[data-r]')) b.onclick = () => send({ t: 'setOptions', battleRounds: +b.dataset.r });
  const avail = lobby.available || [];
  const on = lobby.allSubjects ? avail : (lobby.subjects || []).filter((s) => avail.includes(s));
  $('#subjCount').textContent = lobby.allSubjects ? '(всички)' : `(${on.length} от ${avail.length})`;
  $('#subjBtns').innerHTML = `<button class="all ${lobby.allSubjects ? 'on' : ''}" data-sub="all">✨ ${lobby.adult ? 'Всички категории' : 'Всички предмети'}</button>` +
    avail.map((s) => `<button class="${on.includes(s) ? 'on' : ''}" data-sub="${s}">${SUBJECTS[s]?.[1] || '❓'} ${SUBJECTS[s]?.[0] || s}</button>`).join('');
  for (const b of $$('[data-sub]')) b.onclick = () => {
    const k = b.dataset.sub;
    if (k === 'all') return send({ t: 'setOptions', subjects: 'all' });
    const next = on.includes(k) ? on.filter((x) => x !== k) : [...on, k];
    if (!next.length) return ($('#lobbyErr').textContent = 'Остави поне един предмет.');
    send({ t: 'setOptions', subjects: next.length === avail.length ? 'all' : next });
  };
  $('#btnBot').disabled = lobby.members.length >= 4;
  $('#btnStart').disabled = lobby.members.length < 2;
}

// Залог в стая за възрастни: кой залага и колко е банката
function stakeNote() {
  if (!lobby?.stake) return '';
  return `<p class="stake-note">🪙 Залог <b>${lobby.stake}</b> на играч. Победителят взима залозите на другите. Ботовете и гостите не залагат, а ако победи бот, всеки си получава залога.</p>`;
}

// ---------- карта ----------
const NS = 'http://www.w3.org/2000/svg';
const regionPos = (id) => { const r = mapData.byId[id]; const [dx, dy] = LABEL_FIX[id] || [0, 0]; return [r.cx + dx, r.cy + dy]; };
async function loadMap() {
  mapData = await (await fetch('/map.json')).json();
  mapData.byId = Object.fromEntries(mapData.regions.map((r) => [r.id, r]));
  const svg = $('#map');
  svg.setAttribute('viewBox', `-6 -6 ${mapData.width + 12} ${mapData.height + 12}`);
  const ordered = mapData.regions.slice().sort((a, b) => (a.id === 'SOF') - (b.id === 'SOF')); // София-град отгоре
  svg.innerHTML = `<g class="shadow" transform="translate(5 7)">${ordered.map((r) => `<path d="${r.path}"/>`).join('')}</g>
    <g class="land">${ordered.map((r) => `<path id="r-${r.id}" data-id="${r.id}" d="${r.path}"/>`).join('')}</g>
    <g class="labels">${ordered.map((r) => { const [x, y] = regionPos(r.id); return `<g id="l-${r.id}"><text class="rname" x="${x}" y="${y}" text-anchor="middle">${r.name}</text><g class="badge"></g></g>`; }).join('')}</g>
    <g id="castles"></g><g id="fxl"></g>`;
  svg.addEventListener('click', (e) => {
    const id = e.target.dataset?.id, c = state?.current;
    if (id && c?.type === 'pick' && c.picker === me && c.options.includes(id)) send({ t: 'pick', region: id });
  });
  if (state) renderGame();
}

function castleSvg(p, x, y, prev) {
  const fl = flagOf(p.id);
  const pennant = fl && window.ZFlag ? `<g transform="translate(15 -12)">${ZFlag.inner(fl, 13, 9)}<rect width="13" height="9" fill="none" stroke="#2b1a0c" stroke-width=".7"/></g>` : '<path d="M15 -10l8 3-8 3z" fill="#ffe08a" stroke="#2b1a0c" stroke-width=".8"/>';
  const towers = [[1, 5, 8, 21], [11, 0, 8, 26], [21, 5, 8, 21]];
  const tw = towers.map(([tx, ty, w, h], i) => {
    const down = i >= p.towers, fresh = down && prev != null && i < prev;
    const d = `M${tx} ${ty}h2v-3h1.5v3h1v-3h1.5v3h2v${h}h-${w}z`;
    return `<path class="tw ${fresh ? 'down' : down ? 'gone' : ''}" d="${d}" fill="${p.color}" stroke="#2b1a0c" stroke-width="1.2"/>`;
  }).join('');
  return `<g class="castle" transform="translate(${x - 21} ${y - 58}) scale(1.4)">${tw}<rect x="4" y="13" width="22" height="13" fill="${p.color}" stroke="#2b1a0c" stroke-width="1.2"/>
    <path d="M12 26v-6a3 3 0 0 1 6 0v6z" fill="#2b1a0c"/><path d="M15 0v-12" stroke="#2b1a0c" stroke-width="1.2"/>${pennant}</g>`;
}

function renderMap() {
  if (!mapData || !state) return;
  const c = state.current;
  const canPick = c?.type === 'pick' && c.picker === me ? new Set(c.options) : new Set();
  const target = c?.region && (c.type === 'question' || c.type === 'reveal') ? c.region : null;
  for (const r of mapData.regions) {
    const el = document.getElementById('r-' + r.id);
    const owner = player(state.owner[r.id]);
    el.style.fill = owner ? owner.color : '';
    el.classList.toggle('free', !owner);
    el.classList.toggle('can', canPick.has(r.id));
    el.classList.toggle('target', target === r.id);
    const badge = document.querySelector(`#l-${r.id} .badge`);
    const v = state.value[r.id], isCap = state.players.some((p) => p.capital === r.id && p.alive);
    const key = owner && !isCap ? `${v}|${owner.color}` : '';
    if (badge.dataset.k !== key) {
      badge.dataset.k = key;
      const [x, y] = regionPos(r.id);
      badge.innerHTML = key ? `<rect x="${x - 15}" y="${y + 5}" width="30" height="14" rx="7" fill="${owner.color}" stroke="#fff" stroke-width="1.5"/><text x="${x}" y="${y + 15.5}" text-anchor="middle">${v}</text>` : '';
    }
  }
  // замъци на столиците (3 кули)
  const g = $('#castles');
  for (const p of state.players) {
    const k = p.capital && p.alive ? `${p.capital}|${p.color}|${p.towers}|${JSON.stringify(flagOf(p.id))}` : '';
    if (castleKeys[p.id]?.k === k) continue;
    const prev = castleKeys[p.id]?.towers;
    castleKeys[p.id] = { k, towers: p.towers };
    let el = document.getElementById('c-' + p.id);
    if (!el) { el = document.createElementNS(NS, 'g'); el.id = 'c-' + p.id; g.appendChild(el); }
    if (!k) { el.innerHTML = ''; continue; }
    const [x, y] = regionPos(p.capital);
    el.innerHTML = castleSvg(p, x, y, prev);
  }
  // стрелката остава, докато трае нападението
  if (attackArrow && !(c && c.region === attackArrow.region && state.phase === 'battle' && c.type !== 'pick')) clearArrow();
}

function fxAdd(html, ms) {
  const g = document.createElementNS(NS, 'g'); g.innerHTML = html; $('#fxl').appendChild(g);
  if (ms) setTimeout(() => g.remove(), ms);
  return g;
}
function floatText(region, text) { const [x, y] = regionPos(region); fxAdd(`<text class="float" x="${x}" y="${y - 14}" text-anchor="middle">${text}</text>`, 1700); }
function pop(region, emoji) { const [x, y] = regionPos(region); fxAdd(`<text class="pop" x="${x}" y="${y - 6}" text-anchor="middle">${emoji}</text>`, 1500); }
function flash(region) { const el = document.getElementById('r-' + region); if (!el) return; el.classList.remove('flash'); void el.getBoundingClientRect(); el.classList.add('flash'); }
function flag(region, color) {
  const [x, y] = regionPos(region);
  fxAdd(`<g class="flag"><path d="M${x + 12} ${y - 4}v-26" stroke="#2b1a0c" stroke-width="2"/><path d="M${x + 12} ${y - 30}l16 5-16 5z" fill="${color}" stroke="#fff" stroke-width="1"/></g>`, 1800);
}
function shake() { const f = $('.map-frame'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); }
function clearArrow() { attackArrow?.el.remove(); attackArrow = null; }
function arrow(from, to) {
  clearArrow(); if (!from) return;
  const [x1, y1] = regionPos(from), [x2, y2] = regionPos(to);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.35;
  const el = fxAdd(`<path class="arrow" d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2 - 6}"/><text class="swords" x="${x2}" y="${y2 - 14}" text-anchor="middle">⚔️</text>`);
  attackArrow = { region: to, el };
}

function playFx(f) {
  const col = player(f.pid)?.color || '#fff';
  if (f.type === 'capital') { flash(f.region); flag(f.region, col); floatText(f.region, '+' + f.points); Sound.play('flag'); }
  else if (f.type === 'conquer') { clearArrow(); flash(f.region); flag(f.region, col); floatText(f.region, '+' + f.points); Sound.play('conquer'); }
  else if (f.type === 'attack') { arrow(f.from, f.region); Sound.play('attack'); }
  else if (f.type === 'tower') { shake(); pop(f.region, '💥'); Sound.play('tower'); }
  else if (f.type === 'fall') { clearArrow(); shake(); pop(f.region, '🔥'); for (const r of f.regions || []) flash(r); Sound.play('fall'); }
  else if (f.type === 'defend') { clearArrow(); pop(f.region, '🛡️'); if (f.points) floatText(f.region, '+' + f.points); Sound.play('defend'); }
}

// ---------- игра ----------
const PHASES = { capitals: '🏰 Избор на столици', expansion: '🗺️ Рунд 1 · Завладяване', ended: '🏆 Край на играта' };
function renderPlayers() {
  const c = state.current;
  const active = c?.type === 'pick' ? [c.picker] : c?.participants || [];
  const wrap = $('#players'), ids = state.players.map((p) => p.id).join();
  if (wrap.dataset.ids !== ids) {
    wrap.dataset.ids = ids; shownScore = {};
    wrap.innerHTML = state.players.map((p) => `<div class="pcard" id="pc-${p.id}" style="--pc:${p.color}">${shield(p.id)}<div class="pinfo"><div class="pname"></div><div class="towers"></div></div><span class="pts">0</span></div>`).join('');
  }
  for (const p of state.players) {
    const el = $('#pc-' + p.id);
    el.classList.toggle('out', !p.alive);
    el.classList.toggle('turn', active.includes(p.id));
    el.querySelector('.pname').innerHTML = `${esc(p.name)} ${p.id === me ? '<small>(ти)</small>' : ''}`;
    el.querySelector('.towers').innerHTML = p.alive
      ? [0, 1, 2].map((i) => `<span class="${i < p.towers ? '' : 'down'}">🏯</span>`).join('') + ` <small>${p.regions} обл.</small>`
      : '<small>☠️ отпадна</small>';
    tweenScore(p.id, p.score, el.querySelector('.pts'));
  }
}
function tweenScore(id, to, el) {
  const from = shownScore[id] ?? to;
  shownScore[id] = to;
  if (from === to) { el.textContent = to; return; }
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  const t0 = performance.now();
  const step = (t) => { if (shownScore[id] !== to) return; const k = Math.min(1, (t - t0) / 900); el.textContent = Math.round(from + (to - from) * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function renderGame() {
  if (!mapData) return;
  const c = state.current;
  $('#phaseLabel').textContent = state.phase === 'battle' ? `⚔️ Война · рунд ${Math.max(1, Math.min(state.round, state.battleRounds))} от ${state.battleRounds}` : (PHASES[state.phase] || '');
  renderPlayers();
  $('#log').innerHTML = state.log.slice().reverse().map((l) => `<li>${esc(l)}</li>`).join('');
  renderMap();
  // нови анимации (при първо състояние не повтаряме старите)
  const fx = state.fx || [];
  if (lastFxId === null) lastFxId = fx.length ? fx[fx.length - 1].id : 0;
  for (const f of fx) if (f.id > lastFxId) { lastFxId = f.id; playFx(f); }

  const banner = $('#banner'), bar = $('#pickTimer');
  if (c?.type === 'pick') {
    const mine = c.picker === me;
    banner.className = 'map-banner' + (mine ? ' me' : '');
    banner.innerHTML = mine ? `👉 ${esc(c.title)}!` : `${pname(c.picker)} ${{ capital: 'избира столица', attack: 'избира къде да нападне' }[c.mode] || 'избира област'}…`;
    const k = 'pick' + c.picker + c.options.join();
    if (bar.dataset.k !== k) { bar.dataset.k = k; startBar(bar.firstElementChild, c.timeLeft); }
    bar.classList.remove('hidden');
  } else { banner.className = 'map-banner hidden'; bar.classList.add('hidden'); bar.dataset.k = ''; }
  renderCard(c);
  renderModal();
}

function startBar(el, ms) {
  el.style.transition = 'none'; el.style.transform = 'scaleX(1)'; void el.offsetWidth;
  el.style.transition = `transform ${ms}ms linear`; el.style.transform = 'scaleX(0)';
}

// Съобщенията по време на играта се показват върху картата, за да се виждат анимациите
const INTRO = ['castle', 'map', 'war'];
const ICONS = { castle: '🏰', map: '🗺️', war: '⚔️', miss: '🤷', win: '🚩', tower: '💥', fall: '🔥', shield: '🛡️' };
function renderCard(c) {
  const card = $('#mapCard');
  if (c?.type !== 'info' || INTRO.includes(c.icon)) { card.classList.add('hidden'); card.dataset.k = ''; return; }
  const k = c.title + c.text;
  if (card.dataset.k === k) return;
  card.dataset.k = k;
  card.className = `map-card ${c.icon}`;
  card.innerHTML = `<span class="ic">${ICONS[c.icon] || '📣'}</span><b>${esc(c.title)}</b><span>${esc(c.text || '')}</span>`;
}

let clockTimer = null;
function runClock() {
  clearInterval(clockTimer);
  let lastSec = null;
  const tick = () => {
    const el = $('#clock'); if (!el) return clearInterval(clockTimer);
    const left = Math.max(0, deadline - performance.now()), s = Math.ceil(left / 1000);
    el.style.setProperty('--p', Math.min(1, left / deadlineTotal));
    el.querySelector('span').textContent = s;
    el.classList.toggle('low', s <= 5);
    if (s !== lastSec && s <= 5 && s > 0 && !el.dataset.done) Sound.play('tick');
    lastSec = s;
  };
  tick(); clockTimer = setInterval(tick, 100);
}

function renderModal() {
  const c = state.current, overlay = $('#overlay');
  const isModal = c && (c.type === 'question' || c.type === 'reveal' || c.type === 'end' || (c.type === 'info' && INTRO.includes(c.icon)));
  if (!isModal) { if (lastModalKey !== '#static') { overlay.classList.add('hidden'); lastModalKey = ''; } return; }
  // Докато не съм отговорил, чуждите отговори не прерисуват въпроса (иначе докосване може да се изгуби)
  const keyObj = { ...c, timeLeft: 0, stakes: c.type === 'end' ? lobby?.stakes?.result || null : undefined };
  if (c.type === 'question' && c.participants.includes(me) && !c.answers[me]) keyObj.answers = {};
  const key = JSON.stringify(keyObj);
  if (key === lastModalKey) return;
  const prev = lastModalKey && lastModalKey !== '#static' ? JSON.parse(lastModalKey) : null;
  const fresh = !prev || prev.type !== c.type || prev.q?.text !== c.q?.text;
  lastModalKey = key;
  overlay.classList.remove('hidden');
  const modal = $('#modal');
  if (fresh) { modal.style.animation = 'none'; void modal.offsetWidth; modal.style.animation = ''; }
  overlay.classList.toggle('dock', (c.type === 'question' || c.type === 'reveal') && !c.participants.includes(me));

  if (c.type === 'info') {
    modal.innerHTML = `<div class="announce ${c.icon}"><span class="big">${ICONS[c.icon]}</span><h2>${esc(c.title)}</h2><p class="sub">${esc(c.text || '')}</p></div>`;
    if (fresh && c.icon === 'war') { Sound.play('attack'); shake(); }
    return;
  }
  if (c.type === 'end') return renderEnd(c, modal, fresh);

  const q = c.q, reveal = c.type === 'reveal';
  lastQuestion = { text: q.text, subject: q.subject, options: q.options, grade: state.grade };
  const [subjName, subjIcon] = SUBJECTS[q.subject] || ['Въпрос', '❓'];
  const mine = c.participants.includes(me), myAns = c.answers[me], meP = player(me);
  const duel = c.attacker ? `<div class="duel">${shield(c.attacker)} ${pname(c.attacker)} <span class="vs">⚔️</span> ${pname(c.defender)} ${shield(c.defender)}</div>` : '';
  let body = '';
  if (q.kind === 'mc') {
    body = `<div class="opts ${reveal ? 'reveal' : ''}">${q.options.map((o, i) => {
      const who = reveal ? Object.entries(c.answers).filter(([, a]) => a.value === o).map(([pid]) => shield(pid)).join('') : '';
      const gone = !reveal && (c.removed || []).includes(o);
      return `<button data-o="${esc(o)}" class="${myAns?.value === o ? 'chosen' : ''} ${reveal && o === q.correct ? 'right' : ''} ${gone ? 'gone' : ''}" ${!mine || myAns || reveal || gone ? 'disabled' : ''}><span class="letter">${'АБВГ'[i]}</span>${esc(o)}${who ? `<div class="who">${who}</div>` : ''}</button>`;
    }).join('')}</div>`;
  } else if (!reveal) {
    const k = q.text + c.participants.join();
    if (numKey !== k) { numKey = k; numInput = ''; }
    body = (c.hint ? `<div class="hint">🎯 Отговорът е ${esc(c.hint)}</div>` : '') + (mine && !myAns
      ? `<div class="numbox" id="numbox">${numInput || '&nbsp;'}</div><div class="numpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button data-d="${d}">${d}</button>`).join('')}<button data-d="back">⌫</button><button data-d="0">0</button><button data-d="ok" class="ok">OK</button></div>`
      : `<div class="numbox">${myAns ? esc(myAns.value) : '?'}</div>`);
  } else {
    const rows = c.ranked.map((pid, i) => { const a = c.answers[pid]; return `<li>${i === 0 ? '🥇' : '🥈'} ${shield(pid)} ${pname(pid)}<span class="r">${a ? `${a.value} <small>(разлика ${Math.abs(a.value - q.answer)}, ${(a.ms / 1000).toFixed(1)} сек)</small>` : 'без отговор'}</span></li>`; }).join('');
    body = `<div class="numbox">Верен отговор: ${q.answer}</div><ul class="results">${rows}</ul>`;
  }
  let jokers = '';
  if (mine && !myAns && !reveal && meP) {
    const J = meP.jokers || {};
    const list = [q.kind === 'mc' ? ['fifty', '½ 50/50'] : ['range', '🎯 Обхват'], ['time', '⏳ +10 сек']];
    jokers = `<div class="jokers">${list.map(([k, label]) => `<button class="joker" data-j="${k}" ${J[k] ? '' : 'disabled'}>${label} <b>×${J[k] || 0}</b></button>`).join('')}</div>`;
  }
  let status = '';
  if (!reveal) {
    const waiting = c.participants.filter((p) => !c.answers[p]);
    status = !mine ? `👀 Гледаш: отговарят ${c.participants.map(pname).join(' и ')}` : myAns ? `⏳ Изчакай: ${waiting.map(pname).join(', ') || 'всички отговориха'}` : (q.kind === 'num' ? 'Напиши число. Печели най-близкият отговор!' : 'Избери верния отговор!');
  } else if (q.kind === 'mc') {
    const ok = c.participants.filter((p) => c.answers[p]?.value === q.correct);
    status = ok.length ? `✅ Вярно: ${ok.map(pname).join(', ')}` : '❌ Никой не отговори вярно.';
  }
  modal.innerHTML = `<div class="mhead" style="--sc:${SUBJ_COLOR[q.subject] || '#7a4a22'}"><h3>${esc(c.title || '')}</h3>${duel}
      <div class="meta"><span class="chip">${subjIcon} ${subjName}</span><span class="chip">${q.kind === 'num' ? '🔢 Отговор с число' : '🅰️ Избери отговор'}</span></div></div>
    <div class="mbody">${picHtml(q.pic)}<div class="qtop"><div class="qtext">${esc(q.text)}</div>
      ${canSpeak ? '<button class="speak" id="btnSpeak" title="Прочети на глас">🔈</button>' : ''}
      ${reveal ? '' : '<div class="clock" id="clock"><span></span></div>'}</div>
      ${body}${jokers}<p class="status">${status}</p><button class="qreport" data-report="q">🚩 Има проблем с този въпрос</button></div>`;
  if (!reveal) {
    deadline = performance.now() + c.timeLeft;
    if (fresh || prev?.extended !== c.extended) deadlineTotal = Math.max(1, c.timeLeft);
    runClock();
    if (myAns || !mine) $('#clock').dataset.done = 1;
  }
  if (reveal && prev?.type === 'question' && prev.q?.text === q.text && mine) Sound.play(q.kind === 'mc' ? (myAns?.value === q.correct ? 'good' : 'bad') : (c.ranked[0] === me ? 'good' : 'bad'));
  const sp = $('#btnSpeak');
  if (sp) sp.onclick = () => speak(q.text + (q.kind === 'mc' ? '. ' + q.options.map((o, i) => `${'АБВГ'[i]}: ${o}`).join('. ') : ''), sp);
  for (const b of modal.querySelectorAll('[data-o]')) b.onclick = () => send({ t: 'answer', value: b.dataset.o });
  for (const b of modal.querySelectorAll('[data-d]')) b.onclick = () => numPress(b.dataset.d);
  for (const b of modal.querySelectorAll('[data-j]')) b.onclick = () => { Sound.play('joker'); send({ t: 'joker', kind: b.dataset.j }); };
}

function numPress(d) {
  if (d === 'ok') { if (numInput) send({ t: 'answer', value: Number(numInput) }); return; }
  numInput = d === 'back' ? numInput.slice(0, -1) : (numInput + d).replace(/^0+(?=\d)/, '').slice(0, 6);
  const box = $('#numbox'); if (box) box.innerHTML = numInput || '&nbsp;';
}
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if ($('#numbox') && $('[data-d]')) {
    if (/^\d$/.test(e.key)) numPress(e.key); else if (e.key === 'Backspace') numPress('back'); else if (e.key === 'Enter') numPress('ok');
  } else if (/^[1-4]$/.test(e.key)) { const b = $$('[data-o]')[+e.key - 1]; if (b && !b.disabled) b.click(); }
});

// ---------- край и анализ на играта ----------
function renderEnd(c, modal, fresh) {
  // Места с равни точки (и еднакъв статус) делят медала
  const places = []; c.ranking.forEach((r, i) => { const p = c.ranking[i - 1]; places.push(i && p.score === r.score && p.alive === r.alive ? places[i - 1] : i + 1); });
  const winners = c.ranking.filter((r, i) => places[i] === 1);
  const w = player(c.ranking[0].id), iWon = winners.some((r) => r.id === me);
  const title = winners.length > 1 ? `Равенство! Печелят ${winners.map((r) => esc(player(r.id)?.name)).join(' и ')}` : iWon ? 'Ти печелиш!' : `Победител: ${esc(w.name)}!`;
  const a = c.analysis?.[me];
  const pct = (x, n) => (n ? Math.round((x / n) * 100) : 0);
  let analysis = '';
  if (a && a.total + a.numTotal > 0) {
    const subj = Object.entries(a.bySubject).sort((x, y) => y[1].n - x[1].n);
    analysis = `<details class="an" open><summary>📊 Твоят анализ</summary>
      <div class="an-head"><div class="stat"><b>${a.correct}/${a.total}</b><small>верни отговори (${pct(a.correct, a.total)}%)</small></div>
      ${a.numTotal ? `<div class="stat"><b>${a.numBest}/${a.numTotal}</b><small>най-близо при числата</small></div>` : ''}</div>
      <div class="bars">${subj.map(([s, b]) => { const p = pct(b.ok, b.n); return `<div class="bar"><span>${SUBJECTS[s]?.[1] || ''} ${SUBJECTS[s]?.[0] || s}</span><span class="track"><i class="${p >= 70 ? '' : p >= 40 ? 'mid' : 'low'}" style="width:${Math.max(p, 4)}%"></i></span><span>${b.ok}/${b.n}</span></div>`; }).join('')}</div>
      ${weakest(subj)}
      ${a.mistakes.length ? `<details class="an"><summary>📝 Къде сгреши (${a.mistakes.length})</summary><ul class="mistakes">${a.mistakes.map((m) => `<li>${SUBJECTS[m.subject]?.[1] || ''} ${esc(m.text)}<span class="ans">${m.given !== null && m.given !== undefined ? `<s>${esc(m.given)}</s>` : '<s>без отговор</s>'} ✔ ${esc(m.right)}</span></li>`).join('')}</ul></details>` : '<p class="sub">🌟 Нито една грешка!</p>'}
    </details>`;
  }
  const others = c.ranking.map((r) => { const x = c.analysis?.[r.id]; return x && x.total ? `${pname(r.id)} ${pct(x.correct, x.total)}%` : ''; }).filter(Boolean).join(' · ');
  let actions;
  if (lobby.isPublic) actions = `<button id="btnAgainOnline" class="btn gold big">⚔️ Нова онлайн игра</button><button id="btnHome" class="btn wood">🏠 Към началото</button>`;
  else if (lobby.hostId === me) actions = `<button id="btnAgain" class="btn gold big">🔁 Нова игра</button><button id="btnHome" class="btn wood">🏠 Към началото</button>`;
  else actions = `<p class="status">Домакинът може да започне нова игра.</p><button id="btnHome" class="btn wood">🏠 Към началото</button>`;
  modal.innerHTML = `<div class="announce"><div class="ribbon">Край на войната</div><br><span class="big">${iWon ? '👑' : '🏆'}</span>
    <h2>${title}</h2>
    <ul class="results podium">${c.ranking.map((r, i) => `<li>${['🥇', '🥈', '🥉', '4.'][places[i] - 1]} ${shield(r.id)} ${pname(r.id)} ${r.alive ? '' : '<small>☠️</small>'}<span class="r">${r.score} т.</span></li>`).join('')}</ul>
    ${stakeResult()}${analysis}${others ? `<p class="sub">Точност: ${others}</p>` : ''}
    <div class="end-actions">${actions}</div></div>`;
  if (fresh) { Sound.play(iWon ? 'win' : 'flag'); if (iWon) confetti(); }
  const again = $('#btnAgain'); if (again) again.onclick = () => send({ t: 'backToLobby' });
  const weakSubj = a ? Object.entries(a.bySubject).filter(([, b]) => b.ok < b.n).sort((x, y) => (x[1].ok / x[1].n) - (y[1].ok / y[1].n)).slice(0, 3).map(([s]) => s) : [];
  if (weakSubj.length) {
    const box = modal.querySelector('.end-actions');
    box.insertAdjacentHTML('afterbegin', `<button id="btnPracticeWeak" class="btn wood">📚 Упражнявай: ${esc(weakSubj.map((s) => SUBJECTS[s]?.[0] || s).join(', '))}</button>`);
    $('#btnPracticeWeak').onclick = () => { const g = state.grade; afterLeave = () => requestPractice({ grade: g, subjects: weakSubj }); send({ t: 'leave' }); };
  }
  const online = $('#btnAgainOnline'); if (online) online.onclick = () => { afterLeave = startQuick; send({ t: 'leave' }); };
  $('#btnHome').onclick = () => send({ t: 'leave' });
}
function stakeResult() {
  const s = lobby?.stakes;
  if (!s || !s.result) return '';
  const mine = s.by.includes(me);
  if (s.result.refund) return `<p class="stake-res">🪙 Залогът се върна${mine ? ' и при теб' : ''}.</p>`;
  if (s.result.winner === me) return `<p class="stake-res win">🪙 Спечели банката: <b>+${s.result.pot}</b> парички!</p>`;
  return mine ? `<p class="stake-res">🪙 Загуби залога си (${lobby.stake}). Следващия път!</p>` : `<p class="stake-res">🪙 ${pname(s.result.winner)} взе банката (${s.result.pot}).</p>`;
}
function weakest(subj) {
  const weak = subj.filter(([, b]) => b.n >= 2 && b.ok / b.n < 0.5).map(([s]) => SUBJECTS[s]?.[0] || s);
  return weak.length ? `<p class="sub">💡 Можеш да поупражняваш: <b>${esc(weak.join(', '))}</b>.</p>` : '';
}
function confetti() {
  const box = $('#confetti'); box.innerHTML = '';
  const cols = ['#ffe08a', '#f2b632', '#d83b2d', '#2c6fd1', '#2f9d48', '#fff'];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw'; p.style.background = cols[i % cols.length];
    p.style.animationDuration = 2 + Math.random() * 2.5 + 's'; p.style.animationDelay = Math.random() * 0.8 + 's';
    box.appendChild(p);
  }
  setTimeout(() => (box.innerHTML = ''), 5500);
}

// Картинка към въпроса (емоджи); много на брой (за броене) се показват по-малки
const picHtml = (pic) => pic ? `<div class="qpic ${pic.length > 6 ? 'many' : ''}">${esc(pic)}</div>` : '';

// ---------- упражнение и предизвикателство на деня ----------
// Предметите по класове според учебната програма
const SUBJ_GRADES = { okol: [1, 2], prir: [3, 4], obsht: [3, 4], comp: [3, 4], eng: [2, 3, 4] };
const subjectsFor = (g) => g === ADULT ? ADULT_SUBJ : ['bel', 'mat', 'okol', 'prir', 'obsht', 'eng', 'muz', 'izk', 'tech', 'sport', 'comp'].filter((s) => !SUBJ_GRADES[s] || SUBJ_GRADES[s].includes(g));
let pr = null, prTimer = null, prLast = null;
let DAILY_KEY = 'quizzard-daily'; // в режима за възрастни: 'zn-daily-adult' (adult.js)
const dayShift = (day, d) => { const t = new Date(day + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Sofia' });
function dailyInfo() {
  const d = store.get(DAILY_KEY, {}) || {};
  const alive = d.last === today() || d.last === dayShift(today(), -1);
  return { ...d, streak: alive ? d.streak || 0 : 0, doneToday: d.last === today() };
}
function renderDailyTile() {
  const d = dailyInfo();
  $('#dailySub').textContent = d.doneToday ? `✅ Днес: ${d.todayScore}/10 · 🔥 ${d.streak} ${d.streak === 1 ? 'ден' : 'дни'} подред` : d.streak ? `🔥 ${d.streak} ${d.streak === 1 ? 'ден' : 'дни'} подред. Не прекъсвай серията!` : '10 въпроса всеки ден. Започни серия!';
}
renderDailyTile();
function requestPractice(opts) { prLast = opts; send({ t: 'practice', ...opts }); }
$('#btnDaily').onclick = () => requestPractice({ grade: playGrade(), daily: true });
$('#btnPractice').onclick = () => {
  const g = playGrade(), subs = subjectsFor(g);
  openOverlay(`<div class="mhead"><h3>📚 Упражнение · ${gradeLabel(g)}</h3></div><div class="mbody"><p class="sub">${g === ADULT ? 'Избери категория:' : 'Избери предмет:'}</p>
    <div class="subj-grid practice-subj"><button class="all on" data-ps="all">✨ ${g === ADULT ? 'Всички категории' : 'Всички предмети'}</button>${subs.map((s) => `<button class="on" data-ps="${s}">${SUBJECTS[s][1]} ${SUBJECTS[s][0]}</button>`).join('')}</div>
    <button class="link" id="psCancel" style="display:block;margin:12px auto 0;color:var(--muted)">Отказ</button></div>`);
  for (const b of $$('[data-ps]')) b.onclick = () => { closeOverlay(); requestPractice({ grade: g, subjects: b.dataset.ps === 'all' ? null : [b.dataset.ps] }); };
  $('#psCancel').onclick = closeOverlay;
};
function startPracticeSet(m) {
  if (!m.items?.length) return toast('Няма въпроси за този избор.');
  closeOverlay();
  pr = { ...m, i: 0, score: 0, results: [], input: '' };
  show('practice'); renderPractice();
}
function practiceAnswer(value) {
  const q = pr.items[pr.i];
  if (pr.answered) return;
  clearInterval(prTimer);
  const ok = q.kind === 'num' ? Number(value) === q.answer : value === q.correct;
  pr.answered = { value, ok };
  if (ok) pr.score++;
  pr.results.push({ q, value, ok });
  Sound.play(ok ? 'good' : 'bad');
  renderPractice();
}
function renderPractice() {
  const card = $('#practiceCard');
  if (pr.i >= pr.items.length) return renderPracticeEnd();
  const q = pr.items[pr.i], a = pr.answered;
  const [subjName, subjIcon] = SUBJECTS[q.subject] || ['Въпрос', '❓'];
  const dots = pr.items.map((_, k) => `<i class="${k < pr.i ? (pr.results[k]?.ok ? 'ok' : 'bad') : k === pr.i ? 'now' : ''}"></i>`).join('');
  let body;
  if (q.kind === 'mc') {
    body = `<div class="opts ${a ? 'reveal' : ''}">${q.options.map((o, i) => `<button data-po="${esc(o)}" class="${a?.value === o ? 'chosen' : ''} ${a && o === q.correct ? 'right' : ''}" ${a ? 'disabled' : ''}><span class="letter">${'АБВГ'[i]}</span>${esc(o)}</button>`).join('')}</div>`;
  } else if (!a) {
    body = `<div class="numbox" id="pnum">${pr.input || '&nbsp;'}</div><div class="numpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button data-pd="${d}">${d}</button>`).join('')}<button data-pd="back">⌫</button><button data-pd="0">0</button><button data-pd="ok" class="ok">OK</button></div>`;
  } else body = `<div class="numbox">${esc(a.value ?? '—')}</div>`;
  const fb = a ? `<div class="feedback ${a.ok ? 'ok' : 'bad'}">${a.ok ? '✅ Браво, вярно!' : `❌ Верният отговор е: <b>${esc(q.kind === 'num' ? q.answer : q.correct)}</b>`}</div>
    <button id="pNext" class="btn gold big" style="width:100%">${pr.i === pr.items.length - 1 ? 'Виж резултата ▶' : 'Напред ▶'}</button>` : '';
  card.innerHTML = `<div class="pr-head"><span class="eyebrow">${pr.daily ? `🌞 Предизвикателство на деня · ${gradeLabel(pr.grade)}` : `📚 Упражнение · ${gradeLabel(pr.grade)}`}</span>
      <span class="pr-score">⭐ ${pr.score}</span></div><div class="pr-dots">${dots}</div>
    <div class="meta"><span class="chip light">${subjIcon} ${subjName}</span><span class="chip light">Въпрос ${pr.i + 1} от ${pr.items.length}</span></div>
    ${picHtml(q.pic)}
    <div class="qtop"><div class="qtext">${esc(q.text)}</div>${canSpeak ? '<button class="speak" id="pSpeak" title="Прочети на глас">🔈</button>' : ''}${pr.daily && !a ? '<div class="clock" id="clock"><span></span></div>' : ''}</div>
    ${body}${fb}
    <div class="pr-foot"><button class="link" id="pQuit">← Към началото</button><button class="qreport" data-report="q">🚩 Проблем с въпроса</button></div>`;
  lastQuestion = { text: q.text, subject: q.subject, options: q.options, grade: pr.grade };
  for (const b of card.querySelectorAll('[data-po]')) b.onclick = () => practiceAnswer(b.dataset.po);
  for (const b of card.querySelectorAll('[data-pd]')) b.onclick = () => prNum(b.dataset.pd);
  const sp = $('#pSpeak'); if (sp) sp.onclick = () => speak(q.text + (q.kind === 'mc' ? '. ' + q.options.map((o, i) => `${'АБВГ'[i]}: ${o}`).join('. ') : ''), sp);
  const nx = $('#pNext'); if (nx) nx.onclick = () => { pr.i++; pr.answered = null; pr.input = ''; renderPractice(); };
  $('#pQuit').onclick = () => { clearInterval(prTimer); pr = null; show('home'); renderDailyTile(); };
  if (pr.daily && !a) { deadline = performance.now() + 20000; deadlineTotal = 20000; runClock(); clearInterval(prTimer); prTimer = setInterval(() => { if (performance.now() >= deadline) practiceAnswer(null); }, 200); }
}
function prNum(d) {
  if (d === 'ok') { if (pr.input) practiceAnswer(Number(pr.input)); return; }
  pr.input = d === 'back' ? pr.input.slice(0, -1) : (pr.input + d).replace(/^0+(?=\d)/, '').slice(0, 6);
  const box = $('#pnum'); if (box) box.innerHTML = pr.input || '&nbsp;';
}
function renderPracticeEnd() {
  const n = pr.items.length, s = pr.score, stars = s >= n ? 3 : s >= n * 0.7 ? 2 : s >= n * 0.4 ? 1 : 0;
  let streakLine = '';
  if (pr.daily) {
    const d = store.get(DAILY_KEY, {}) || {};
    if (d.last !== pr.day) {
      const streak = d.last === dayShift(pr.day, -1) ? (d.streak || 0) + 1 : 1;
      store.set(DAILY_KEY, { last: pr.day, streak, best: Math.max(streak, d.best || 0), todayScore: s });
    }
    const now = store.get(DAILY_KEY, {});
    streakLine = `<p class="streak">🔥 ${now.streak} ${now.streak === 1 ? 'ден' : 'дни'} подред${now.best > now.streak ? ` · рекорд ${now.best}` : ''}</p><p class="sub">Ела пак утре за нови 10 въпроса!</p>`;
  }
  const wrong = pr.results.filter((r) => !r.ok);
  $('#practiceCard').innerHTML = `<div class="announce"><div class="ribbon">${pr.daily ? 'Предизвикателство на деня' : 'Упражнение'}</div><br>
    <span class="big">${['💪', '⭐', '⭐⭐', '⭐⭐⭐'][stars]}</span><h2>${s} от ${n} верни</h2>
    <p class="sub">${['Не се отказвай, следващия път ще е по-добре!', 'Добро начало!', 'Много добре!', 'Отлично! Без нито една грешка!'][stars]}</p>${streakLine}
    ${wrong.length ? `<details class="an" open><summary>📝 Къде сгреши (${wrong.length})</summary><ul class="mistakes">${wrong.map((r) => `<li>${SUBJECTS[r.q.subject]?.[1] || ''} ${esc(r.q.text)} ${r.q.pic ? esc(r.q.pic) : ''}<span class="ans">${r.value != null ? `<s>${esc(r.value)}</s>` : '<s>без отговор</s>'} ✔ ${esc(r.q.kind === 'num' ? r.q.answer : r.q.correct)}</span></li>`).join('')}</ul></details>` : ''}
    <div class="end-actions">${pr.daily ? '' : '<button id="pAgain" class="btn gold big">🔁 Още 10 въпроса</button>'}<button id="pHome" class="btn wood">🏠 Към началото</button></div></div>`;
  if (stars >= 2) { Sound.play('win'); if (stars === 3) confetti(); }
  const ag = $('#pAgain'); if (ag) ag.onclick = () => requestPractice(prLast);
  $('#pHome').onclick = () => { pr = null; show('home'); renderDailyTile(); };
}

// ---------- инсталиране като приложение ----------
let installEvt = null;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#btnInstall').classList.remove('hidden'); });
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
if (isIOS) $('#btnInstall').classList.remove('hidden');
$('#btnInstall').onclick = async () => {
  if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $('#btnInstall').classList.add('hidden'); }
  else openOverlay(`<div class="mhead"><h3>📲 Инсталирай „Знаменосци“</h3></div><div class="mbody"><ol class="rules"><li>Натисни бутона <b>Сподели</b> (квадрат със стрелка) долу в Safari.</li><li>Избери <b>„Добави към началния екран“</b>.</li><li>Натисни <b>„Добави“</b>. Иконката с шапката ще се появи на екрана.</li></ol><button class="btn gold big" id="instOk" style="width:100%">Разбрах!</button></div>`), ($('#instOk').onclick = closeOverlay);
};

// ---------- докладване на проблем ----------
const REASONS_Q = ['Грешен верен отговор', 'Правописна грешка', 'Въпросът е неясен', 'Твърде труден за класа'];
const REASONS_GEN = ['Играта забива или спира', 'Не мога да вляза в стая', 'Картата не се вижда добре', 'Проблем с въпрос'];
let reportCtx = null;
function openReport(aboutQuestion) {
  reportCtx = aboutQuestion && lastQuestion ? { question: lastQuestion } : {};
  const reasons = [...(reportCtx.question ? REASONS_Q : REASONS_GEN), 'Друго'];
  $('#reportAbout').innerHTML = reportCtx.question ? `Въпрос: <b>${esc(reportCtx.question.text)}</b>` : 'Какво не е наред?';
  $('#reportReasons').innerHTML = reasons.map((r) => `<label><input type="radio" name="reason" value="${esc(r)}">${esc(r)}</label>`).join('');
  $('#reportText').value = ''; $('#reportText').classList.add('hidden'); $('#reportErr').textContent = '';
  for (const i of $$('[name=reason]')) i.onchange = () => {
    const other = i.value === 'Друго';
    $('#reportText').classList.toggle('hidden', !other);
    $('#reportText').placeholder = other ? 'Опиши проблема (задължително)…' : '';
    if (other) $('#reportText').focus();
  };
  $('#reportOverlay').classList.remove('hidden');
}
function closeReport() { $('#reportOverlay').classList.add('hidden'); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), 3000); }
document.addEventListener('click', (e) => { const b = e.target.closest('[data-report]'); if (b) { e.preventDefault(); openReport(b.dataset.report === 'q'); } });
$('#reportCancel').onclick = closeReport;
$('#reportForm').onsubmit = (e) => {
  e.preventDefault();
  const reason = document.querySelector('[name=reason]:checked')?.value;
  const text = $('#reportText').value.trim();
  if (!reason) return ($('#reportErr').textContent = 'Избери какъв е проблемът.');
  if (reason === 'Друго' && text.length < 3) return ($('#reportErr').textContent = 'Напиши какъв е проблемът.');
  if (!ws || ws.readyState !== 1) return ($('#reportErr').textContent = 'Няма връзка със сървъра. Опитай пак.');
  send({ t: 'report', reason, text: reason === 'Друго' ? text : '', question: reportCtx?.question || null, name: myName() });
};

loadMap();
connect();

// ---------- хоризонтален режим на телефони и таблети ----------
document.body.classList.add('has-rotate');
const coarse = matchMedia('(pointer: coarse)').matches;
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || window.navigator.standalone;
const canLock = !!(screen.orientation && screen.orientation.lock && document.fullscreenEnabled);
async function goLandscape() {
  if (!canLock) return;
  try { if (!document.fullscreenElement && !standalone) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch {}
  try { await screen.orientation.lock('landscape'); } catch {}
}
if (coarse && canLock) {
  $('#btnRotate').classList.remove('hidden');
  $('#btnRotate').onclick = goLandscape;
  // при влизане в игра на телефон: цял екран и заключено хоризонтално (където браузърът позволява)
  for (const b of $$('.mode, #btnJoin')) b.addEventListener('click', goLandscape);
}
