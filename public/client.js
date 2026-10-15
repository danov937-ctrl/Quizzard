// Quizzard клиент: екрани, карта (SVG), въпроси. Сървърът решава всичко, клиентът само показва и изпраща ходове.
const $ = (s) => document.querySelector(s);
const SUBJECTS = {
  mat: ['Математика', '🔢', '#3b82f6'], bel: ['Български език и литература', '📖', '#e11d48'],
  okol: ['Околен свят', '🌳', '#059669'], prir: ['Човекът и природата', '🔬', '#16a34a'],
  obsht: ['Човекът и обществото', '🏛️', '#b45309'], muz: ['Музика', '🎵', '#db2777'],
  izk: ['Изобразително изкуство', '🎨', '#ea580c'], tech: ['Технологии и предприемачество', '🛠️', '#0891b2'],
  comp: ['Компютърно моделиране', '💻', '#7c3aed'], eng: ['Английски език', '🇬🇧', '#4f46e5'],
  sport: ['Физическо възпитание и спорт', '⚽', '#dc2626'],
};
const LABEL_FIX = { SFO: [35, -40], SOF: [0, 4] };
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00'];
const SAVE_KEY = 'quizzard-session';

let lastQuestion = null;
let ws, me = null, lobby = null, state = null, mapData = null, lastModalKey = '', numInput = '', numKey = '';

function storage(op, val) { try { if (op === 'get') return JSON.parse(localStorage.getItem(SAVE_KEY)); if (op === 'set') localStorage.setItem(SAVE_KEY, JSON.stringify(val)); if (op === 'del') localStorage.removeItem(SAVE_KEY); } catch { return null; } }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id); }
const player = (id) => state?.players.find((p) => p.id === id);
const pname = (id) => esc(player(id)?.name || lobby?.members.find((m) => m.id === id)?.name || '?');
const dot = (id) => `<span class="dot" style="background:${player(id)?.color || '#999'}"></span>`;

// ---------- връзка ----------
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { const s = storage('get'); if (s) send({ t: 'resume', ...s }); };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => setTimeout(connect, 1500);
}
const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

function handle(m) {
  if (m.t === 'joined') { me = m.pid; storage('set', { code: m.code, pid: m.pid, token: m.token }); }
  else if (m.t === 'resumeFailed' || m.t === 'left') { storage('del'); me = null; state = null; closeOverlay(); show('home'); }
  else if (m.t === 'reportOk') { closeReport(); toast('Благодарим! Сигналът е изпратен.'); }
  else if (m.t === 'error') { $('#homeErr').textContent = m.msg; $('#lobbyErr').textContent = m.msg; $('#reportErr').textContent = m.msg; }
  else if (m.t === 'lobby') { lobby = m.lobby; state = null; closeOverlay(); renderLobby(); show('lobby'); }
  else if (m.t === 'game') { lobby = m.lobby; state = m.state; show('game'); renderGame(); }
}

// ---------- начален екран ----------
$('#subjectChips').innerHTML = ['bel', 'mat', 'okol', 'prir', 'obsht', 'muz', 'izk', 'tech', 'comp', 'eng', 'sport']
  .map((k) => `<span class="chip">${SUBJECTS[k][1]} ${SUBJECTS[k][0]}</span>`).join('');
try { $('#name').value = localStorage.getItem('quizzard-name') || ''; } catch {}
const myName = () => { const n = $('#name').value.trim(); try { localStorage.setItem('quizzard-name', n); } catch {} return n; };
const needName = () => { if (myName()) return false; $('#homeErr').textContent = 'Напиши името си.'; $('#name').focus(); return true; };
$('#btnCreate').onclick = () => { if (!needName()) send({ t: 'create', name: myName() }); };
$('#btnJoin').onclick = () => { if (!needName()) send({ t: 'join', name: myName(), code: $('#code').value }); };
$('#code').addEventListener('keydown', (e) => e.key === 'Enter' && $('#btnJoin').click());
$('#btnBot').onclick = () => send({ t: 'addBot' });
$('#btnStart').onclick = () => send({ t: 'start' });
$('#btnLeave').onclick = () => send({ t: 'leave' });
$('#btnRules').onclick = () => {
  openOverlay(`<div class="mhead"><h3>Как се играе Quizzard?</h3></div><div class="mbody rules"><ol>
    <li>🏰 Всеки играч по ред <b>избира своята столица</b> на картата. Тя има 3 кули.</li>
    <li>❓ Всички отговарят на въпрос с 4 отговора, от които само един е верен. Който отговори вярно, <b>сам избира свободна област</b> до своите.</li>
    <li>🎯 Ако вярно отговорят няколко, идва <b>числов въпрос</b>. Най-близкият отговор избира първи и взима 2 области.</li>
    <li>⚔️ Когато картата се запълни, започват <b>битките</b>: нападай съседни области. Ако и двамата познаете, решава най-близкият числов отговор.</li>
    <li>👑 Превземеш ли столица (3 удара), взимаш всички области на противника. Печели този с най-много точки!</li>
    </ol><button class="big primary" id="btnRulesOk">Разбрах!</button></div>`);
  $('#btnRulesOk').onclick = closeOverlay;
};
function openOverlay(html) { $('#overlay').classList.remove('hidden'); $('#modal').innerHTML = html; lastModalKey = '#static'; }
function closeOverlay() { $('#overlay').classList.add('hidden'); lastModalKey = ''; }

// ---------- стая ----------
function renderLobby() {
  $('#lobbyErr').textContent = '';
  $('#lobbyCode').textContent = lobby.code;
  const host = lobby.hostId === me;
  $('#members').innerHTML = lobby.members.map((m, i) => `<li><span class="avatar" style="background:${COLORS[i]}">${m.isBot ? '🤖' : esc(m.name[0] || '?').toUpperCase()}</span>${esc(m.name)}
    <span class="tags">${m.id === me ? '<span class="tag">ти</span>' : ''}${m.id === lobby.hostId ? '<span class="tag">👑 домакин</span>' : ''}${!m.connected ? '<span class="tag">няма връзка</span>' : ''}
    ${host && m.id !== me ? `<button data-kick="${m.id}" title="Премахни">✕</button>` : ''}</span></li>`).join('') +
    (lobby.members.length < 2 ? '<li class="sub" style="background:none;justify-content:center">Чакаме още играчи…</li>' : '');
  for (const b of document.querySelectorAll('[data-kick]')) b.onclick = () => send({ t: 'kick', pid: b.dataset.kick });
  $('#hostControls').classList.toggle('hidden', !host);
  $('#guestWait').classList.toggle('hidden', host);
  $('#gradeBtns').innerHTML = [1, 2, 3, 4].map((g) => `<button class="${lobby.grade === g ? 'on' : ''}" data-g="${g}">${g} клас</button>`).join('');
  $('#roundBtns').innerHTML = [2, 3, 4, 5].map((r) => `<button class="${lobby.battleRounds === r ? 'on' : ''}" data-r="${r}">${r}</button>`).join('');
  for (const b of document.querySelectorAll('[data-g]')) b.onclick = () => send({ t: 'setOptions', grade: +b.dataset.g });
  for (const b of document.querySelectorAll('[data-r]')) b.onclick = () => send({ t: 'setOptions', battleRounds: +b.dataset.r });
  $('#btnBot').disabled = lobby.members.length >= 4;
  $('#btnStart').disabled = lobby.members.length < 2;
}

// ---------- карта ----------
async function loadMap() {
  mapData = await (await fetch('/map.json')).json();
  const svg = $('#map');
  svg.setAttribute('viewBox', `0 0 ${mapData.width} ${mapData.height}`);
  const ordered = mapData.regions.slice().sort((a, b) => (a.id === 'SOF') - (b.id === 'SOF')); // София-град отгоре
  svg.innerHTML = ordered.map((r) => `<path class="reg" id="r-${r.id}" data-id="${r.id}" d="${r.path}"/>`).join('') +
    ordered.map((r) => { const [dx, dy] = LABEL_FIX[r.id] || [0, 0]; const x = r.cx + dx, y = r.cy + dy;
      return `<g id="l-${r.id}"><text class="castle" x="${x}" y="${y - 6}" text-anchor="middle"></text><text class="rname" x="${x}" y="${y + 6}" text-anchor="middle">${r.name}</text><text class="rval" x="${x}" y="${y + 19}" text-anchor="middle"></text><text class="lives" x="${x}" y="${y + 31}" text-anchor="middle"></text></g>`; }).join('');
  svg.addEventListener('click', (e) => {
    const id = e.target.dataset?.id;
    const c = state?.current;
    if (id && c?.type === 'pick' && c.picker === me && c.options.includes(id)) send({ t: 'pick', region: id });
  });
  if (state) renderMap();
}

function renderMap() {
  if (!mapData || !state) return;
  const c = state.current;
  const canPick = c?.type === 'pick' && c.picker === me ? new Set(c.options) : new Set();
  for (const r of mapData.regions) {
    const el = document.getElementById('r-' + r.id);
    const owner = player(state.owner[r.id]);
    el.style.fill = owner ? owner.color : 'var(--free)';
    el.classList.toggle('can', canPick.has(r.id));
    el.classList.toggle('focus', c?.region === r.id);
    const capOf = state.players.find((p) => p.capital === r.id && p.alive);
    const g = document.getElementById('l-' + r.id);
    g.querySelector('.castle').textContent = capOf ? '🏰' : '';
    g.querySelector('.rval').textContent = state.value[r.id] ? state.value[r.id] : '';
    g.querySelector('.lives').textContent = capOf ? '♥'.repeat(capOf.lives) : '';
  }
}

// ---------- игра ----------
function startBar(el, ms) {
  el.style.transition = 'none'; el.style.transform = 'scaleX(1)';
  void el.offsetWidth;
  el.style.transition = `transform ${ms}ms linear`; el.style.transform = 'scaleX(0)';
}

function renderGame() {
  const c = state.current;
  const phases = { capitals: '🏰 Столици', expansion: `🗺️ Завземане · рунд ${state.round}`, battle: `⚔️ Битка · рунд ${state.round} от ${state.battleRounds}`, ended: '🏆 Край на играта' };
  $('#phaseLabel').textContent = phases[state.phase] || '';
  $('#scoreboard').innerHTML = state.players.slice().sort((a, b) => b.score - a.score).map((p) =>
    `<li class="${p.alive ? '' : 'out'}">${dot(p.id)} ${esc(p.name)} ${p.id === me ? '<span class="me">(ти)</span>' : ''}${p.isBot ? ' 🤖' : ''}
     <span class="pts">${p.score}<small>${'♥'.repeat(p.alive ? p.lives : 0)}</small></span></li>`).join('');
  $('#log').innerHTML = state.log.slice().reverse().map((l) => `<li>${esc(l)}</li>`).join('');

  let banner = '';
  const pickBar = $('#pickTimer');
  if (c?.type === 'pick') {
    banner = c.picker === me ? `👉 ${c.title}!` : `${pname(c.picker)} ${{ capital: 'избира столица', attack: 'избира къде да нападне' }[c.mode] || 'избира област'}…`;
    pickBar.classList.remove('hidden');
    const k = 'pick' + c.picker + c.options.join();
    if (pickBar.dataset.k !== k) { pickBar.dataset.k = k; startBar(pickBar.firstElementChild, c.timeLeft); }
  } else pickBar.classList.add('hidden');
  $('#banner').innerHTML = banner;
  renderMap();
  renderModal();
}

function renderModal() {
  const c = state.current;
  const overlay = $('#overlay');
  if (!c || c.type === 'pick') { overlay.classList.add('hidden'); lastModalKey = ''; return; }
  const key = JSON.stringify({ ...c, timeLeft: 0 });
  if (key === lastModalKey) return;
  const prev = lastModalKey && lastModalKey !== '#static' ? JSON.parse(lastModalKey) : null;
  const fresh = !prev || prev.type !== c.type || prev.q?.text !== c.q?.text;
  lastModalKey = key;
  overlay.classList.remove('hidden');
  const modal = $('#modal');
  if (fresh) { modal.style.animation = 'none'; void modal.offsetWidth; modal.style.animation = ''; }

  if (c.type === 'info') { modal.innerHTML = `<div class="center"><div class="big-emoji">${c.title.includes('битка') ? '⚔️' : c.title.includes('Столиц') ? '🏰' : '📣'}</div><h2>${esc(c.title)}</h2><p class="sub">${esc(c.text || '')}</p></div>`; return; }
  if (c.type === 'end') {
    const w = player(c.ranking[0].id);
    modal.innerHTML = `<div class="center"><div class="big-emoji">🏆</div><h2>Победител: ${esc(w.name)}!</h2>
      <ul class="results end-list">${c.ranking.map((r, i) => `<li>${['🥇', '🥈', '🥉', '4.'][i]} ${dot(r.id)} ${pname(r.id)}<span class="r">${r.score} т.</span></li>`).join('')}</ul>
      ${lobby.hostId === me ? '<button id="btnAgain" class="big primary">Нова игра</button>' : '<p class="status">Домакинът може да започне нова игра.</p>'}</div>`;
    const b = $('#btnAgain'); if (b) b.onclick = () => send({ t: 'backToLobby' });
    return;
  }

  const q = c.q;
  lastQuestion = { text: q.text, subject: q.subject, options: q.options, grade: state.grade };
  const [subjName, subjIcon, subjColor] = SUBJECTS[q.subject] || ['Въпрос', '❓', '#7c3aed'];
  const mine = c.participants.includes(me);
  const myAns = c.answers[me];
  const reveal = c.type === 'reveal';
  const duel = c.attacker ? `<div class="duel">${dot(c.attacker)} ${pname(c.attacker)} ⚔️ ${dot(c.defender)} ${pname(c.defender)}</div>` : '';
  let body = '';
  if (q.kind === 'mc') {
    body = `<div class="opts ${reveal ? 'reveal' : ''}">${q.options.map((o, i) => {
      const who = Object.entries(c.answers).filter(([, a]) => a.value === o).map(([pid]) => dot(pid)).join('');
      return `<button data-o="${esc(o)}" class="${myAns?.value === o ? 'chosen' : ''} ${reveal && o === q.correct ? 'right' : ''}" ${!mine || myAns || reveal ? 'disabled' : ''}><span class="letter">${'АБВГ'[i]}</span>${esc(o)}${reveal ? `<div class="who">${who}</div>` : ''}</button>`;
    }).join('')}</div>`;
  } else if (!reveal) {
    const k = q.text + c.participants.join();
    if (numKey !== k) { numKey = k; numInput = ''; }
    body = mine && !myAns
      ? `<div class="numbox" id="numbox">${numInput || '&nbsp;'}</div><div class="numpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button data-d="${d}">${d}</button>`).join('')}<button data-d="back">⌫</button><button data-d="0">0</button><button data-d="ok" class="ok">OK</button></div>`
      : `<div class="numbox">${myAns ? esc(myAns.value) : '?'}</div>`;
  } else {
    const rows = c.ranked.map((pid, i) => { const a = c.answers[pid]; return `<li>${i + 1}. ${dot(pid)} ${pname(pid)}<span class="r">${a ? `${a.value} (разлика ${Math.abs(a.value - q.answer)})` : 'без отговор'}</span></li>`; }).join('');
    body = `<div class="numbox">Верен отговор: ${q.answer}</div><ul class="results">${rows}</ul>`;
  }
  let status = '';
  if (!reveal) {
    const waiting = c.participants.filter((p) => !c.answers[p]);
    status = !mine ? `👀 Гледаш: отговарят ${c.participants.map(pname).join(', ')}` : myAns ? `⏳ Изчакай: ${waiting.map(pname).join(', ') || 'всички отговориха'}` : (q.kind === 'num' ? 'Напиши число. Печели най-близкият отговор!' : 'Избери верния отговор!');
  } else if (q.kind === 'mc') {
    const ok = c.participants.filter((p) => c.answers[p]?.value === q.correct);
    status = ok.length ? `✅ Вярно отговориха: ${ok.map(pname).join(', ')}` : '❌ Никой не отговори вярно.';
  }
  modal.innerHTML = `<div class="mhead" style="background:linear-gradient(135deg, ${subjColor}, ${subjColor}cc)"><h3>${esc(c.title || '')}</h3>${duel}<span class="subject">${subjIcon} ${subjName}</span></div>
    <div class="mbody"><div class="qtext">${esc(q.text)}</div>${reveal ? '' : '<div class="qtimer"><div id="qbar"></div></div>'}${body}<p class="status">${status}</p><button class="qreport" data-report="q">🚩 Има проблем с този въпрос</button></div>`;
  if (!reveal) startBar($('#qbar'), c.timeLeft);
  for (const b of modal.querySelectorAll('[data-o]')) b.onclick = () => send({ t: 'answer', value: b.dataset.o });
  for (const b of modal.querySelectorAll('[data-d]')) b.onclick = () => numPress(b.dataset.d);
}

function numPress(d) {
  if (d === 'ok') { if (numInput) send({ t: 'answer', value: Number(numInput) }); return; }
  numInput = d === 'back' ? numInput.slice(0, -1) : (numInput + d).replace(/^0+(?=\d)/, '').slice(0, 6);
  const box = $('#numbox'); if (box) box.innerHTML = numInput || '&nbsp;';
}
document.addEventListener('keydown', (e) => {
  if (!$('#numbox') || !$('[data-d]')) return;
  if (/^\d$/.test(e.key)) numPress(e.key); else if (e.key === 'Backspace') numPress('back'); else if (e.key === 'Enter') numPress('ok');
});

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
  for (const i of document.querySelectorAll('[name=reason]')) i.onchange = () => {
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
