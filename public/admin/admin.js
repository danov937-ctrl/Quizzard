// Quizzard · админ панел (без рамки, само браузърен JS)
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n ?? 0).toLocaleString('bg-BG');
const ago = (iso) => {
  if (!iso) return '—';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'току-що'; if (s < 3600) return `преди ${Math.round(s / 60)} мин`;
  if (s < 86400) return `преди ${Math.round(s / 3600)} ч`; if (s < 86400 * 30) return `преди ${Math.round(s / 86400)} дни`;
  return new Date(iso).toLocaleDateString('bg-BG');
};
const dur = (sec) => sec < 60 ? `${sec} сек` : sec < 3600 ? `${Math.floor(sec / 60)} мин ${sec % 60} сек` : `${Math.floor(sec / 3600)} ч ${Math.floor((sec % 3600) / 60)} мин`;
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const SUBJ = { bel: 'Български език', mat: 'Математика', okol: 'Околен свят', prir: 'Човекът и природата', obsht: 'Човекът и обществото', eng: 'Английски език', muz: 'Музика', izk: 'Изобразително изкуство', tech: 'Технологии', sport: 'Физическо възпитание', comp: 'Компютърно моделиране' };
const SUBJ_ICON = { bel: '📖', mat: '➗', okol: '🌳', prir: '🔬', obsht: '🏛️', eng: '🇬🇧', muz: '🎵', izk: '🎨', tech: '🛠️', sport: '⚽', comp: '💻' };
const MODE = { online: 'Онлайн', friends: 'С приятели', bots: 'С ботове' };
const MODE_COLOR = { online: '#1e88e5', friends: '#43a047', bots: '#fb8c00' };
const PHASE = { lobby: 'Чака в стаята', start: 'Започва', capitals: 'Избор на столици', expansion: 'Рунд 1: завладяване', battle: 'Рунд 2: война', ended: 'Свършила' };
const ACTION = { add: 'Добавен въпрос', edit: 'Редакция', hide: 'Скрит', show: 'Показан отново', delete: 'Изтрит', reset: 'Върнат към оригинала', import: 'Внесен', revert: 'Върната промяна', settings: 'Настройки', restore: 'Възстановен архив', 'room-close': 'Затворена стая', kick: 'Изваден играч', 'bulk-hide': 'Скрит (група)', 'bulk-show': 'Показан (група)', 'bulk-delete': 'Изтрит (група)', 'bulk-grade': 'Сменен клас (група)', 'bulk-subject': 'Сменен предмет (група)', 'player-rename': 'Преименуван играч', 'player-ban': 'Спрян акаунт', 'player-unban': 'Пуснат акаунт', 'player-password': 'Нова парола на играч', 'player-delete': 'Изтрит акаунт', 'photo-approve': 'Одобрена снимка', 'photo-reject': 'Отхвърлена снимка' };
const IDEA_STATUS = { new: ['Нова', 'info'], published: ['Публикувана', 'ok'], planned: ['Ще я направим', 'warn'], done: ['Направена', 'ok'], rejected: ['Отхвърлена', 'bad'] };
const subjOptions = (sel, any) => (any ? `<option value="">${any}</option>` : '') + Object.entries(SUBJ).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${SUBJ_ICON[k]} ${v}</option>`).join('');
const pctColor = (p) => p == null ? 'var(--line)' : p < 40 ? 'var(--bad)' : p < 65 ? 'var(--warn)' : 'var(--ok)';
const pctCell = (s) => s.n ? `<span class="pct" title="${s.ok} от ${s.n} верни"><span class="bar"><i style="width:${s.pct}%;background:${pctColor(s.pct)}"></i></span>${s.pct}%</span><div class="hint">${fmt(s.n)} отг.</div>` : '<span class="hint">още не е задаван</span>';

// ---------- връзка със сървъра ----------
async function api(method, path, body) {
  const res = await fetch('/api/admin/' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Quizzard-Admin': '1' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { showLogin(); throw new Error(data.error || 'Нужен е вход.'); }
  if (!res.ok || data.error) { const e = new Error(data.error || `Грешка ${res.status}`); e.data = data; throw e; }
  return data;
}
const GET = (p) => api('GET', p);
async function run(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, { bad: true }); return null; }
}

// ---------- известия и прозорци ----------
function toast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (opts.bad ? ' bad' : '');
  el.innerHTML = `<span>${h(msg)}</span>` + (opts.undo ? '<button>Отмени</button>' : '');
  if (opts.undo) el.querySelector('button').onclick = () => { el.remove(); opts.undo(); };
  $('#toasts').append(el);
  setTimeout(() => el.remove(), opts.undo ? 7000 : 3500);
}
let modalStack = [];
function modal({ title, body, foot = '', size = '', onClose }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true"><div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Затвори">✕</button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const close = () => { back.remove(); modalStack = modalStack.filter((m) => m !== api); onClose && onClose(); };
  const api = { el: back, close };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-close]').onclick = close;
  $('#modalRoot').append(back);
  modalStack.push(api);
  setTimeout(() => back.querySelector('input:not([type=checkbox]), textarea, select')?.focus(), 30);
  return api;
}
function confirmBox(text, { ok = 'Да', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal({ title: 'Сигурен ли си?', size: 'narrow', body: `<p>${text}</p>`, foot: `<button class="btn" data-no>Отказ</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-yes>${ok}</button>`, onClose: () => { if (!answered) resolve(false); } });
    $('[data-no]', m.el).onclick = () => m.close();
    $('[data-yes]', m.el).onclick = () => { answered = true; m.close(); resolve(true); };
    setTimeout(() => $('[data-yes]', m.el).focus(), 40);
  });
}

// ---------- вход ----------
function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); clearInterval(timers.live); setTimeout(() => $('#password').focus(), 50); }
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#password').value }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { $('#loginErr').textContent = data.error || 'Неуспешен вход.'; return; }
  $('#password').value = '';
  start();
};
$('#btnLogout').onclick = async () => { await fetch('/api/admin/logout', { method: 'POST' }); showLogin(); };

// ---------- навигация ----------
const PAGES = [
  { group: 'Преглед' },
  { id: 'dashboard', icon: '🏠', title: 'Табло' },
  { id: 'rooms', icon: '🟢', title: 'На живо' },
  { id: 'stats', icon: '📊', title: 'Статистика' },
  { group: 'Съдържание' },
  { id: 'questions', icon: '❓', title: 'Въпроси' },
  { id: 'check', icon: '🔎', title: 'Проверка', count: 'problems', soft: true },
  { id: 'coverage', icon: '🧩', title: 'Покритие' },
  { group: 'Общност' },
  { id: 'reports', icon: '🚩', title: 'Сигнали', count: 'reports' },
  { id: 'ideas', icon: '💡', title: 'Идеи', count: 'ideas' },
  { id: 'players', icon: '👤', title: 'Играчи' },
  { id: 'photos', icon: '🖼️', title: 'Снимки', count: 'photos' },
  { group: 'Управление' },
  { id: 'announce', icon: '📣', title: 'Съобщения' },
  { id: 'settings', icon: '⚙️', title: 'Настройки' },
  { id: 'log', icon: '🕘', title: 'Дневник' },
  { id: 'backup', icon: '💾', title: 'Архив и данни' },
];
let counts = {};
function renderNav() {
  const cur = page();
  $('#nav').innerHTML = PAGES.map((p) => p.group ? `<div class="group">${p.group}</div>`
    : `<a href="#${p.id}" class="${p.id === cur ? 'on' : ''}"><span class="ic">${p.icon}</span>${p.title}${p.count && counts[p.count] ? `<span class="count ${p.soft ? 'soft' : ''}">${counts[p.count]}</span>` : ''}</a>`).join('');
}
const page = () => (location.hash.slice(1).split('?')[0] || 'dashboard');
const hashParams = () => new URLSearchParams(location.hash.split('?')[1] || '');
const timers = {};
async function route() {
  clearInterval(timers.live);
  const id = page();
  const p = PAGES.find((x) => x.id === id) || PAGES[1];
  $('#pageTitle').textContent = p.title;
  document.title = `${p.title} · Quizzard админ`;
  $('#side').classList.remove('open');
  renderNav();
  const view = $('#view');
  view.innerHTML = '<div class="empty">Зареждане…</div>';
  try { await VIEWS[p.id](view, hashParams()); } catch (e) { view.innerHTML = `<div class="banner bad">⚠️ ${h(e.message)}</div>`; }
}
window.addEventListener('hashchange', route);
$('#btnMenu').onclick = () => $('#side').classList.toggle('open');

async function refreshCounts() {
  try {
    const o = await GET('overview');
    counts = { reports: o.reports.open, ideas: o.ideas.open, problems: o.problems, photos: o.photos };
    renderNav(); storageBadge(o.storage);
    return o;
  } catch { return null; }
}
function storageBadge(s) {
  const b = $('#storageBadge');
  if (s.remote && !s.lastError) { b.className = 'badge ok'; b.textContent = '☁️ Запазва се в GitHub'; b.title = `${s.repo} · последно: ${s.lastSave ? ago(s.lastSave) : '—'}`; }
  else if (s.remote) { b.className = 'badge bad'; b.textContent = '⚠️ Грешка при запис'; b.title = s.lastError; }
  else { b.className = 'badge warn'; b.textContent = '⚠️ Само временен запис'; b.title = 'Промените ще изчезнат при рестарт. Виж „Архив и данни“.'; }
  b.style.cursor = 'pointer'; b.onclick = () => (location.hash = 'backup');
}

// ---------- графики ----------
function barChart(days, series) {
  const W = 700, H = 190, P = { l: 30, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...days.map((d) => series.reduce((s, x) => s + (d[x.key] || 0), 0)));
  const bw = (W - P.l - P.r) / days.length;
  const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  let bars = '';
  days.forEach((d, i) => {
    let acc = 0;
    for (const s of series) {
      const v = d[s.key] || 0; if (!v) continue;
      bars += `<rect x="${P.l + i * bw + bw * 0.15}" y="${y(acc + v)}" width="${bw * 0.7}" height="${y(acc) - y(acc + v)}" fill="${s.color}" rx="2"><title>${d.date}: ${s.label} ${v}</title></rect>`;
      acc += v;
    }
  });
  const step = Math.ceil(days.length / 7);
  const labels = days.map((d, i) => i % step === 0 || i === days.length - 1 ? `<text x="${P.l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${d.date.slice(8)}.${d.date.slice(5, 7)}</text>` : '').join('');
  const ticks = [0, Math.round(max / 2), max].map((v) => `<text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text><line class="axis" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke-dasharray="${v ? '3 4' : ''}"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${ticks}${bars}${labels}</svg><div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>`;
}
function lineChart(days, key, { color = '#b07a12', max: fixedMax, suffix = '' } = {}) {
  const W = 700, H = 160, P = { l: 34, r: 8, t: 10, b: 24 };
  const vals = days.map((d) => (typeof key === 'function' ? key(d) : d[key]));
  const max = fixedMax || Math.max(4, ...vals.filter((v) => v != null));
  const x = (i) => P.l + (i / Math.max(1, days.length - 1)) * (W - P.l - P.r);
  const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  const pts = vals.map((v, i) => (v == null ? null : [x(i), y(v), v, days[i].date])).filter(Boolean);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const step = Math.ceil(days.length / 7);
  const labels = days.map((d, i) => i % step === 0 || i === days.length - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${d.date.slice(8)}.${d.date.slice(5, 7)}</text>` : '').join('');
  const ticks = [0, max / 2, max].map((v) => `<text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}${suffix}</text><line class="axis" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke-dasharray="${v ? '3 4' : ''}"/>`).join('');
  const dots = pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${color}"><title>${p[3]}: ${p[2]}${suffix}</title></circle>`).join('');
  return `<svg class="chart" style="height:160px" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${ticks}<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>${dots}${labels}</svg>`;
}

// ---------- изгледи ----------
const VIEWS = {};

VIEWS.dashboard = async (view) => {
  const o = await refreshCounts();
  if (!o) throw new Error('Неуспешно зареждане.');
  const cov = await GET('coverage');
  const t = o.today;
  const warn = [];
  if (!o.storage.remote) warn.push(`<div class="banner warn">⚠️ <div>Промените от панела, акаунтите и идеите се пазят само временно и ще изчезнат при следващия рестарт на Render. <a href="#backup">Виж как да включиш постоянното запазване →</a></div></div>`);
  if (o.maintenance) warn.push(`<div class="banner bad">🛠️ <div>Режимът „Поддръжка“ е включен: нови игри не могат да започнат. <a href="#announce">Изключи го →</a></div></div>`);
  view.innerHTML = `${warn.join('')}
    <div class="kpis" ${warn.length ? 'style="margin-top:16px"' : ''}>
      <a class="kpi good" href="#rooms"><div class="lbl"><span class="live-dot"></span>Онлайн сега</div><div class="val">${o.live.players}</div><div class="sub">${o.live.rooms} стаи · ${o.live.playing} игри вървят</div></a>
      <a class="kpi" href="#stats"><div class="lbl">Игри днес</div><div class="val">${fmt(t.games)}</div><div class="sub">${fmt(t.completed)} завършени · общо ${fmt(o.totals.games)}</div></a>
      <a class="kpi" href="#stats"><div class="lbl">Верни отговори днес</div><div class="val">${t.answers ? Math.round((100 * t.correct) / t.answers) + '%' : '—'}</div><div class="sub">${fmt(t.answers)} отговора</div></a>
      <a class="kpi" href="#players"><div class="lbl">Регистрирани играчи</div><div class="val">${fmt(o.players.total)}</div><div class="sub">+${o.players.today} днес · ${o.players.active7} активни за 7 дни</div></a>
      <a class="kpi" href="#questions"><div class="lbl">Въпроси в играта</div><div class="val">${fmt(o.questions.total)}</div><div class="sub">${o.questions.added} нови · ${o.questions.edited} редактирани · ${o.questions.hidden} скрити</div></a>
      <a class="kpi ${o.reports.open ? 'alert' : ''}" href="#reports"><div class="lbl">Нови сигнали</div><div class="val">${o.reports.open}</div><div class="sub">общо ${o.reports.total}</div></a>
      <a class="kpi ${o.ideas.open ? 'alert' : ''}" href="#ideas"><div class="lbl">Нови идеи</div><div class="val">${o.ideas.open}</div><div class="sub">общо ${o.ideas.total}</div></a>
      <a class="kpi" href="#check"><div class="lbl">За проверка</div><div class="val">${o.problems}</div><div class="sub">възможни проблеми във въпросите</div></a>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><div class="row between"><h3>Игри за 14 дни</h3><a href="#stats" class="small">Още →</a></div>${barChart(o.days, [{ key: 'online', label: 'Онлайн', color: MODE_COLOR.online }, { key: 'friends', label: 'С приятели', color: MODE_COLOR.friends }, { key: 'bots', label: 'С ботове', color: MODE_COLOR.bots }])}</div>
      <div class="card"><h3>Бързи действия</h3>
        <div class="grid g2" style="gap:8px">
          <button class="btn" data-act="add">➕ Нов въпрос</button>
          <button class="btn" data-act="import">📥 Внеси въпроси</button>
          <a class="btn" href="#announce">📣 Съобщение до всички</a>
          <button class="btn ${o.maintenance ? 'ok' : 'danger'}" data-act="maint">${o.maintenance ? '✅ Изключи поддръжката' : '🛠️ Режим поддръжка'}</button>
          <a class="btn" href="#questions?status=hard">🤔 Най-трудни въпроси</a>
          <a class="btn" href="#backup">💾 Изтегли архив</a>
        </div>
        <div class="side-box"><h4>Сървър</h4><div class="small">Работи от ${dur(o.uptime)} · памет ${o.memoryMb} MB · рекорд днес: ${t.peakPlayers} души онлайн</div></div>
      </div>
    </div>
    <div class="card"><div class="row between"><h3>Покритие на въпросите</h3><a href="#coverage" class="small">Подробно →</a></div>${heatTable(cov)}</div>
    <div class="grid g2">
      <div class="card"><h3>Последни игри</h3>${o.recentGames.length ? `<div class="table-wrap"><table><tbody>${o.recentGames.map((g) => `<tr><td><span class="badge" style="color:${MODE_COLOR[g.mode]}">${MODE[g.mode]}</span></td><td>${g.grade} клас</td><td>${g.humans} 👤 ${g.bots ? `+ ${g.bots} 🤖` : ''}</td><td>${g.completed ? dur(g.sec) : '<span class="badge warn">прекъсната</span>'}</td><td class="hint">${ago(g.at)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Още няма изиграни игри.</div>'}</div>
      <div class="card"><div class="row between"><h3>Последни промени</h3><a href="#log" class="small">Дневник →</a></div>${o.recentAudit.length ? o.recentAudit.map((x) => `<div class="hist"><span><b>${ACTION[x.action] || x.action}</b> ${h(x.label)}</span><span class="hint">${ago(x.at)}</span></div>`).join('') : '<div class="empty">Още няма промени.</div>'}</div>
    </div>`;
  view.onclick = async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'add') editQuestion(null);
    if (a === 'import') importDialog();
    if (a === 'maint') {
      const s = (await GET('settings')).settings;
      s.maintenance.on = !s.maintenance.on;
      if (await run(() => api('PUT', 'settings', s), s.maintenance.on ? 'Поддръжката е включена.' : 'Играта е отворена отново.')) route();
    }
  };
};

function heatTable(cov, linkable = true) {
  const grades = [1, 2, 3, 4];
  const cls = (n) => (n < 15 ? 'c0' : n < 40 ? 'c1' : 'c2');
  const off = new Set(cov.disabled || []);
  const rows = Object.entries(cov.coverage).map(([s, g]) => {
    const total = grades.reduce((t, x) => t + g[x].mc + g[x].num, 0);
    return `<tr class="${off.has(s) ? 'off' : ''}"><td>${SUBJ_ICON[s]} ${SUBJ[s]}${off.has(s) ? ' <span class="badge">изключен</span>' : ''}</td>${grades.map((x) => {
      const n = g[x].mc;
      const inner = `${n}${g[x].num ? `<small class="hint"> +${g[x].num}</small>` : ''}`;
      return `<td>${linkable ? `<a class="cell ${cls(n)}" href="#questions?subject=${s}&grade=${x}" title="${n} с избор, ${g[x].num} числови">${inner}</a>` : `<span class="cell ${cls(n)}">${inner}</span>`}</td>`;
    }).join('')}<td class="num"><b>${total}</b></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="heat"><thead><tr><th>Предмет</th>${grades.map((g) => `<th>${g} клас</th>`).join('')}<th class="num">Общо</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="legend"><span><i style="background:var(--bad-bg)"></i>под 15 (предметът не се показва за класа)</span><span><i style="background:var(--warn-bg)"></i>15–39</span><span><i style="background:var(--ok-bg)"></i>40+</span><span>+N = числови въпроси</span></div>`;
}

VIEWS.coverage = async (view) => {
  const cov = await GET('coverage');
  view.innerHTML = `<div class="banner info">ℹ️ <div>Играта взима въпроси от избрания клас и класа под него. Предмет се показва в стаята, ако има поне 15 въпроса с избор за тези два класа. Натисни клетка, за да видиш въпросите.</div></div>
    <div class="card">${heatTable(cov)}</div>`;
};

// ----- въпроси -----
const qState = { q: '', subject: '', grade: '', kind: '', status: 'all', sort: '', page: 1, size: 50, selected: new Set(), last: [] };
const STATUS_CHIPS = [['all', 'Всички'], ['active', 'Активни'], ['added', 'Нови'], ['edited', 'Редактирани'], ['hidden', 'Скрити'], ['reported', '🚩 Със сигнал'], ['hard', '🤔 Трудни (<40%)'], ['unseen', 'Незадавани'], ['problems', '🔎 За проверка']];
VIEWS.questions = async (view, params) => {
  for (const k of ['subject', 'grade', 'status', 'q', 'kind']) if (params.has(k)) qState[k] = params.get(k);
  if ([...params.keys()].length) qState.page = 1;
  view.innerHTML = `
    <div class="filters">
      <input class="search" id="qSearch" placeholder="🔍 Търси във въпроси и отговори…  ( / )" value="${h(qState.q)}">
      <select id="qSubject">${subjOptions(qState.subject, 'Всички предмети')}</select>
      <select id="qGrade"><option value="">Всички класове</option>${[1, 2, 3, 4].map((g) => `<option value="${g}" ${String(g) === String(qState.grade) ? 'selected' : ''}>${g} клас</option>`).join('')}</select>
      <select id="qKind"><option value="">С избор и числови</option><option value="mc" ${qState.kind === 'mc' ? 'selected' : ''}>С избор (4 отговора)</option><option value="num" ${qState.kind === 'num' ? 'selected' : ''}>Числови</option></select>
      <select id="qSort"><option value="">Подредба: по файл</option><option value="grade">По клас</option><option value="hard">Най-трудни</option><option value="easy">Най-лесни</option><option value="played">Най-често задавани</option><option value="newest">Най-нови</option><option value="text">По азбучен ред</option></select>
    </div>
    <div class="chips" id="qChips">${STATUS_CHIPS.map(([k, v]) => `<button class="chip ${qState.status === k ? 'on' : ''}" data-st="${k}">${v}</button>`).join('')}</div>
    <div class="row between" style="margin-bottom:10px"><span id="qTotal" class="muted"></span>
      <div class="row"><button class="btn" id="qImport">📥 Внеси</button><button class="btn" id="qExport">📤 Изнеси</button><button class="btn primary" id="qAdd">➕ Нов въпрос <kbd>N</kbd></button></div></div>
    <div id="qBulk"></div>
    <div class="card" style="padding-top:4px"><div class="table-wrap"><table><thead><tr><th style="width:30px"><input type="checkbox" id="qAll" title="Избери всички на страницата"></th><th>Въпрос</th><th>Предмет</th><th>Клас</th><th>Успеваемост</th></tr></thead><tbody id="qRows"></tbody></table></div>
    <div class="pager" id="qPager"></div></div>`;
  $('#qSort').value = qState.sort;
  const reload = () => { qState.page = 1; loadQuestions(); };
  $('#qSearch').oninput = debounce((e) => { qState.q = e.target.value; reload(); });
  $('#qSubject').onchange = (e) => { qState.subject = e.target.value; reload(); };
  $('#qGrade').onchange = (e) => { qState.grade = e.target.value; reload(); };
  $('#qKind').onchange = (e) => { qState.kind = e.target.value; reload(); };
  $('#qSort').onchange = (e) => { qState.sort = e.target.value; reload(); };
  $('#qChips').onclick = (e) => { const b = e.target.closest('[data-st]'); if (!b) return; qState.status = b.dataset.st; $$('.chip', $('#qChips')).forEach((c) => c.classList.toggle('on', c === b)); reload(); };
  $('#qAdd').onclick = () => editQuestion(null);
  $('#qImport').onclick = () => importDialog();
  $('#qExport').onclick = () => exportDialog();
  $('#qAll').onchange = (e) => { for (const q of qState.last) e.target.checked ? qState.selected.add(q.key) : qState.selected.delete(q.key); renderRows(); };
  await loadQuestions();
};
async function loadQuestions() {
  const p = new URLSearchParams({ q: qState.q, subject: qState.subject, grade: qState.grade, kind: qState.kind, status: qState.status, sort: qState.sort, page: qState.page, size: qState.size });
  const data = await GET('questions?' + p);
  qState.last = data.items; qState.total = data.total;
  $('#qTotal') && ($('#qTotal').textContent = `${fmt(data.total)} въпроса`);
  renderRows();
  const pages = Math.max(1, Math.ceil(data.total / data.size));
  $('#qPager').innerHTML = pages > 1 ? `<button class="btn sm" ${qState.page <= 1 ? 'disabled' : ''} data-pg="-1">← Предишна</button><span class="muted small">Страница ${qState.page} от ${pages}</span><button class="btn sm" ${qState.page >= pages ? 'disabled' : ''} data-pg="1">Следваща →</button>` : '';
  $('#qPager').onclick = (e) => { const b = e.target.closest('[data-pg]'); if (!b) return; qState.page += Number(b.dataset.pg); loadQuestions(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
}
function qFlags(q) {
  const f = [];
  if (q.hidden) f.push('<span class="badge">🙈 скрит</span>');
  if (q.origin === 'added') f.push('<span class="badge info">нов</span>');
  if (q.edited) f.push('<span class="badge warn">редактиран</span>');
  if (q.kind === 'num') f.push('<span class="badge">числов</span>');
  if (q.reports) f.push(`<span class="badge bad">🚩 ${q.reports}</span>`);
  for (const p of q.problems || []) f.push(`<span class="badge warn" title="${h(p)}">🔎 ${h(p.length > 30 ? p.slice(0, 30) + '…' : p)}</span>`);
  return f.join('');
}
function renderRows() {
  const rows = $('#qRows'); if (!rows) return;
  rows.innerHTML = qState.last.length ? qState.last.map((q, i) => `<tr class="click ${q.hidden ? 'dim' : ''} ${qState.selected.has(q.key) ? 'sel' : ''}" data-i="${i}">
      <td><input type="checkbox" data-sel="${q.key}" ${qState.selected.has(q.key) ? 'checked' : ''}></td>
      <td><div class="qtext">${h(q.text)}</div><div class="qans">✓ ${h(q.kind === 'mc' ? q.options[0] : q.answer)}${q.kind === 'mc' ? `<span class="hint"> · ${q.options.slice(1).map(h).join(' · ')}</span>` : ''}</div><div class="flags">${qFlags(q)}</div></td>
      <td style="white-space:nowrap">${SUBJ_ICON[q.subject] || ''} ${h(SUBJ[q.subject] || q.subject)}</td><td>${q.grade}</td><td>${pctCell(q.stats)}</td></tr>`).join('')
    : '<tr><td colspan="5"><div class="empty"><div class="big">🔍</div>Няма въпроси с тези филтри.</div></td></tr>';
  rows.onclick = (e) => {
    const cb = e.target.closest('[data-sel]');
    if (cb) { cb.checked ? qState.selected.add(cb.dataset.sel) : qState.selected.delete(cb.dataset.sel); cb.closest('tr').classList.toggle('sel', cb.checked); renderBulk(); return; }
    const tr = e.target.closest('tr[data-i]');
    if (tr) editQuestion(qState.last[Number(tr.dataset.i)].key, Number(tr.dataset.i));
  };
  $('#qAll') && ($('#qAll').checked = qState.last.length > 0 && qState.last.every((q) => qState.selected.has(q.key)));
  renderBulk();
}
function renderBulk() {
  const el = $('#qBulk'); if (!el) return;
  const n = qState.selected.size;
  if (!n) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="bulk"><b>Избрани: ${n}</b>
    <button class="btn sm" data-b="hide">🙈 Скрий</button><button class="btn sm" data-b="show">👁 Покажи</button>
    <select data-b="grade"><option value="">Смени клас…</option>${[1, 2, 3, 4].map((g) => `<option value="${g}">${g} клас</option>`).join('')}</select>
    <select data-b="subject">${subjOptions('', 'Смени предмет…')}</select>
    <button class="btn sm" data-b="delete">🗑 Изтрий</button>
    <span class="grow"></span><button class="btn sm" data-b="clear">✕ Откажи избора</button></div>`;
  const go = async (action, value) => {
    if (action === 'delete' && !(await confirmBox(`Да изтрия ли ${n} въпроса? Въпросите от файловете само се скриват, а новите се изтриват.`, { ok: 'Изтрий', danger: true }))) return;
    const r = await run(() => api('POST', 'questions/bulk', { keys: [...qState.selected], action, value }));
    if (!r) return;
    toast(`Готово: ${r.done}${r.errors.length ? ` · ${r.errors.join(' ')}` : ''}`, { bad: !!r.errors.length && !r.done });
    qState.selected.clear(); loadQuestions(); refreshCounts();
  };
  el.onclick = (e) => { const b = e.target.closest('button[data-b]'); if (!b) return; if (b.dataset.b === 'clear') { qState.selected.clear(); renderRows(); } else go(b.dataset.b); };
  el.onchange = (e) => { const s = e.target.closest('select[data-b]'); if (s && s.value) go(s.dataset.b, s.dataset.b === 'grade' ? Number(s.value) : s.value); };
}

// Редактор на въпрос (нов или съществуващ). idx = мястото в текущия списък (за ← →)
async function editQuestion(key, idx) {
  let data = { q: { kind: 'mc', grade: Number(qState.grade) || 2, subject: qState.subject || 'mat', text: '', options: ['', '', '', ''], answer: '' }, stats: { n: 0 }, reports: [], history: [], problems: [] };
  if (key) { const d = await run(() => GET('questions/' + encodeURIComponent(key))); if (!d) return; data = d; }
  const q = data.q;
  const isNew = !key;
  const m = modal({
    title: isNew ? '➕ Нов въпрос' : `✏️ Въпрос${q.hidden ? ' <span class="badge">🙈 скрит</span>' : ''}`, size: 'wide',
    body: `<div class="editor"><form id="qf" autocomplete="off">
      ${isNew ? `<div class="field"><span>Вид</span><div class="seg" id="fKind"><button type="button" data-k="mc" class="on">С 4 отговора</button><button type="button" data-k="num">Числов (за равенства)</button></div></div>` : ''}
      <div class="row" style="gap:12px;align-items:flex-start">
        <div class="field"><span>Клас</span><div class="seg" id="fGrade">${[1, 2, 3, 4].map((g) => `<button type="button" data-g="${g}" class="${q.grade === g ? 'on' : ''}">${g}</button>`).join('')}</div></div>
        <label class="field grow"><span>Предмет</span><select id="fSubject">${subjOptions(q.subject)}</select></label>
      </div>
      <label class="field"><span>Въпрос <span class="hint" id="fLen"></span></span><textarea id="fText" rows="3" maxlength="300" placeholder="напр. Колко крака има паякът?">${h(q.text)}</textarea></label>
      <div id="fMc" class="${q.kind === 'mc' ? '' : 'hidden'}"><div class="field"><span>Отговори</span></div>
        ${[0, 1, 2, 3].map((i) => `<div class="opt-row"><span class="tag ${i ? 'wrong' : 'right'}">${i ? 'грешен' : '✓ верен'}</span><input data-o="${i}" maxlength="80" value="${h(q.options?.[i] || '')}" placeholder="${i ? 'грешен отговор' : 'верният отговор'}"></div>`).join('')}
        <div class="hint">Грешните отговори трябва да са правдоподобни и с подобна дължина, за да не се познава верният.</div></div>
      <div id="fNum" class="${q.kind === 'num' ? '' : 'hidden'}"><label class="field"><span>Точен отговор (цяло число)</span><input id="fAnswer" inputmode="numeric" value="${h(q.answer ?? '')}"></label>
        <div class="hint">Числовите въпроси решават равенства: печели най-близкият отговор.</div></div>
      <p class="err" id="fErr"></p>
    </form>
    <div>
      <div class="field"><span>Така изглежда в играта</span></div><div class="preview" id="fPreview"></div>
      ${isNew ? '' : `<div class="side-box"><h4>Статистика</h4>${data.stats.n ? `${pctCell(data.stats)} <span class="small muted">· ${data.stats.ok} от ${data.stats.n} деца са отговорили вярно${data.stats.n >= 5 && data.stats.pct < 30 ? '<br><b style="color:var(--bad)">Много нисък процент: провери дали верният отговор е правилен.</b>' : ''}</span>` : '<span class="hint">Още не е задаван на деца.</span>'}</div>
      ${data.problems.length ? `<div class="side-box"><h4>🔎 Автоматична проверка</h4>${data.problems.map((p) => `<div class="small">• ${h(p.msg)}</div>`).join('')}</div>` : ''}
      ${data.reports.length ? `<div class="side-box"><h4>🚩 Сигнали (${data.reports.length})</h4>${data.reports.slice(-5).reverse().map((r) => `<div class="hist"><span><b>${h(r.reason)}</b> ${h(r.text)}</span><span class="badge ${r.status === 'new' ? 'bad' : ''}">${r.status === 'new' ? 'нов' : 'решен'}</span></div>`).join('')}</div>` : ''}
      ${data.original && q.edited ? `<div class="side-box"><h4>Оригинал от файла</h4><div class="small"><b>${h(data.original.text)}</b><br>✓ ${h(data.original.kind === 'mc' ? data.original.options.join(' · ') : data.original.answer)} · ${data.original.grade} клас · ${SUBJ[data.original.subject]}</div></div>` : ''}
      ${data.history.length ? `<div class="side-box"><h4>История</h4>${data.history.slice(0, 6).map((x) => `<div class="hist"><span>${ACTION[x.action] || x.action}</span><span class="hint">${ago(x.at)}</span></div>`).join('')}</div>` : ''}`}
    </div></div>`,
    foot: `${!isNew && idx != null ? `<button class="btn ghost" data-nav="-1" title="Предишен (Alt+←)">←</button><button class="btn ghost" data-nav="1" title="Следващ (Alt+→)">→</button>` : ''}
      ${isNew ? '' : `<button class="btn" data-a="${q.hidden ? 'show' : 'hide'}">${q.hidden ? '👁 Покажи в играта' : '🙈 Скрий от играта'}</button>`}
      ${!isNew && q.origin === 'base' && q.edited ? '<button class="btn" data-a="reset">↩︎ Върни оригинала</button>' : ''}
      ${!isNew && q.origin === 'added' ? '<button class="btn danger" data-a="delete">🗑 Изтрий</button>' : ''}
      ${!isNew && q.origin === 'added' ? '<button class="btn" data-a="dup">⧉ Копие</button>' : ''}
      <span class="grow"></span><button class="btn" data-close2>Затвори</button><button class="btn primary" data-a="save">💾 Запази <kbd>Ctrl+Enter</kbd></button>`,
  });
  const el = m.el;
  let kind = q.kind, grade = q.grade;
  const form = () => ({ kind, grade, subject: $('#fSubject', el).value, text: $('#fText', el).value, options: $$('[data-o]', el).map((i) => i.value), answer: $('#fAnswer', el).value });
  const preview = () => {
    const f = form();
    $('#fLen', el).textContent = `${f.text.length}/300`;
    $('#fPreview', el).innerHTML = `<div class="pq"><small>${SUBJ_ICON[f.subject]} ${SUBJ[f.subject]} · ${f.grade} клас</small>${h(f.text) || '<span style="opacity:.5">Текстът на въпроса</span>'}</div>` +
      (kind === 'mc' ? `<div class="po">${f.options.map((o, i) => `<div class="${i === 0 ? 'right' : ''}">${h(o) || '…'}</div>`).join('')}</div>` : `<div class="pnum">${h(f.answer) || '?'}</div>`);
  };
  preview();
  el.addEventListener('input', preview);
  $('#fSubject', el).onchange = preview;
  $('#fGrade', el).onclick = (e) => { const b = e.target.closest('[data-g]'); if (!b) return; grade = Number(b.dataset.g); $$('[data-g]', el).forEach((x) => x.classList.toggle('on', x === b)); preview(); };
  if (isNew) $('#fKind', el).onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; $$('[data-k]', el).forEach((x) => x.classList.toggle('on', x === b)); $('#fMc', el).classList.toggle('hidden', kind !== 'mc'); $('#fNum', el).classList.toggle('hidden', kind !== 'num'); preview(); };
  const after = () => { if ($('#qRows')) loadQuestions(); refreshCounts(); };
  const save = async (andNew) => {
    $('#fErr', el).textContent = '';
    try {
      if (isNew) { const r = await api('POST', 'questions', form()); toast('Въпросът е добавен и вече е в играта.'); m.close(); after(); if (andNew) editQuestion(null); else return r; }
      else { await api('PUT', 'questions/' + encodeURIComponent(key), form()); toast('Запазено. Промяната е в играта веднага.'); m.close(); after(); }
    } catch (e) { $('#fErr', el).textContent = e.message; }
  };
  $('[data-close2]', el).onclick = () => m.close();
  el.querySelector('.modal-foot').onclick = async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    const nav = e.target.closest('[data-nav]')?.dataset.nav;
    if (nav) { const j = idx + Number(nav); if (j >= 0 && j < qState.last.length) { m.close(); editQuestion(qState.last[j].key, j); } return; }
    if (!a) return;
    if (a === 'save') return save();
    if (a === 'dup') { m.close(); const c = form(); c.text += ' (копие)'; const d = await run(() => api('POST', 'questions', c), 'Направено е копие.'); if (d) { after(); editQuestion(d.key); } return; }
    if (a === 'delete' && !(await confirmBox('Да изтрия ли този въпрос завинаги?', { ok: 'Изтрий', danger: true }))) return;
    const path = 'questions/' + encodeURIComponent(key) + (a === 'delete' ? '' : '/' + a);
    const ok = await run(() => api(a === 'delete' ? 'DELETE' : 'POST', path), { hide: 'Въпросът е скрит от играта.', show: 'Въпросът е отново в играта.', reset: 'Върнат е текстът от файла.', delete: 'Изтрит.' }[a]);
    if (ok) { m.close(); after(); }
  };
  el.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(e.shiftKey && isNew); }
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); el.querySelector(`[data-nav="${e.key === 'ArrowLeft' ? -1 : 1}"]`)?.click(); }
  });
}

function importDialog() {
  const m = modal({
    title: '📥 Внасяне на въпроси', size: 'wide',
    body: `<p class="muted">Постави редове във формата на файловете на играта или избери .txt файл. Всеки ред е един въпрос:</p>
      <pre class="side-box small" style="white-space:pre-wrap;margin:0 0 12px">клас|предмет|въпрос|ВЕРЕН|грешен|грешен|грешен      ← с 4 отговора
клас|предмет|въпрос|отговор                          ← числов
напр.  2|okol|Кой сезон идва след зимата?|Пролет|Лято|Есен|Зима</pre>
      <div class="small muted" style="margin-bottom:8px">Предмети: ${Object.entries(SUBJ).map(([k, v]) => `<b>${k}</b> ${v}`).join(' · ')}</div>
      <textarea id="impText" rows="8" placeholder="Постави въпросите тук…"></textarea>
      <div class="row" style="margin-top:8px"><label class="btn">📄 Избери файл<input type="file" id="impFile" accept=".txt,.csv,text/plain" hidden></label><span class="hint" id="impInfo"></span></div>
      <div id="impPrev"></div>`,
    foot: '<button class="btn" data-check>🔎 Провери</button><button class="btn primary" data-go disabled>📥 Внеси</button>',
  });
  const el = m.el;
  $('#impFile', el).onchange = async (e) => { const f = e.target.files[0]; if (f) { $('#impText', el).value = await f.text(); check(); } };
  $('#impText', el).oninput = debounce(() => check(), 600);
  const check = async () => {
    const text = $('#impText', el).value;
    if (!text.trim()) { $('#impPrev', el).innerHTML = ''; $('[data-go]', el).disabled = true; return; }
    const r = await run(() => api('POST', 'import', { text, dryRun: true }));
    if (!r) return;
    const bad = r.rows.filter((x) => x.error);
    $('#impInfo', el).textContent = `${r.rows.length} реда · ${r.ok} за внасяне · ${bad.length} с грешка`;
    $('#impPrev', el).innerHTML = `<div class="import-table"><table><tbody>${r.rows.map((x) => `<tr><td class="hint">${x.n}</td><td>${x.error ? '❌' : '✅'}</td><td>${x.q ? `<b>${h(x.q.text)}</b> <span class="hint">${x.q.grade} кл. · ${SUBJ[x.q.subject]}</span>` : `<code>${h(x.line.slice(0, 120))}</code>`}${x.error ? `<div style="color:var(--bad);font-weight:800">${h(x.error)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    $('[data-go]', el).disabled = !r.ok;
    $('[data-go]', el).textContent = `📥 Внеси ${r.ok} въпроса`;
  };
  $('[data-check]', el).onclick = check;
  $('[data-go]', el).onclick = async () => {
    const r = await run(() => api('POST', 'import', { text: $('#impText', el).value }));
    if (!r) return;
    toast(`Внесени са ${r.added} въпроса. Вече са в играта.`);
    m.close(); if ($('#qRows')) loadQuestions(); refreshCounts();
  };
}
function exportDialog() {
  const link = (kind, scope, label) => `<a class="btn" href="/api/admin/export?kind=${kind}&scope=${scope}${qState.subject ? `&subject=${qState.subject}` : ''}" download>${label}</a>`;
  modal({
    title: '📤 Изнасяне на въпроси',
    body: `<p class="muted">Файловете са в същия формат като <code>data/q/*.txt</code>, така че могат да се сложат обратно в хранилището.${qState.subject ? ` Само за <b>${SUBJ[qState.subject]}</b> (избраният филтър).` : ''}</p>
      <div class="grid g2" style="gap:8px">
        ${link('mc', 'active', '📄 С избор: активните')}${link('num', 'active', '🔢 Числови: активните')}
        ${link('mc', 'changed', '✏️ С избор: само новите и редактираните')}${link('num', 'changed', '✏️ Числови: само новите и редактираните')}
        ${link('mc', 'all', '📚 С избор: всички (и скритите)')}${link('num', 'all', '📚 Числови: всички (и скритите)')}
      </div>`,
  });
}

// ----- проверка -----
VIEWS.check = async (view) => {
  const { groups } = await GET('problems');
  const keys = Object.keys(groups);
  view.innerHTML = `<div class="banner info">🔎 <div>Автоматична проверка за често срещани грешки. Не всичко тук е грешка: това са места, които е добре да прегледа човек. Натисни въпрос, за да го редактираш или скриеш.</div></div>` +
    (keys.length ? keys.map((k) => `<div class="card"><details ${keys.length <= 3 ? 'open' : ''}><summary class="row between" style="cursor:pointer"><h3 style="margin:0">${h(groups[k].msg)}</h3><span class="badge warn">${groups[k].items.length}</span></summary>
      <div class="table-wrap" style="margin-top:8px"><table><tbody>${groups[k].items.map((x) => `<tr class="click" data-key="${x.key}"><td><div class="qtext">${h(x.text)}</div>${x.other ? `<div class="hint">повтаря: ${h(x.other)}</div>` : ''}</td><td style="white-space:nowrap">${SUBJ_ICON[x.subject]} ${x.grade} кл.</td></tr>`).join('')}</tbody></table></div></details></div>`).join('')
      : '<div class="card empty"><div class="big">🎉</div>Не са открити проблеми.</div>');
  view.onclick = (e) => { const tr = e.target.closest('[data-key]'); if (tr) editQuestion(tr.dataset.key); };
};

// ----- сигнали -----
let repStatus = 'new';
VIEWS.reports = async (view) => {
  const d = await GET('reports?status=' + repStatus);
  const chip = (k, v) => `<button class="chip ${repStatus === k ? 'on' : ''}" data-st="${k}">${v}<span class="n">${k === 'all' ? Object.values(d.counts).reduce((a, b) => a + b, 0) : d.counts[k] || 0}</span></button>`;
  view.innerHTML = `<div class="row between"><div class="chips">${chip('new', 'Нови')}${chip('done', 'Решени')}${chip('dismissed', 'Отхвърлени')}${chip('all', 'Всички')}</div>
    ${repStatus === 'new' && d.items.length ? '<button class="btn sm" id="repAll">✓ Маркирай всички като решени</button>' : ''}</div>
    ${Object.keys(d.reasons).length ? `<div class="card" style="margin-bottom:12px"><h3>Причини</h3>${Object.entries(d.reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => `<div class="hbar"><span>${h(r)}</span><span class="track"><i style="width:${(100 * n) / Math.max(...Object.values(d.reasons))}%;background:var(--accent2)"></i></span><b>${n}</b></div>`).join('')}</div>` : ''}
    <div class="items">${d.items.length ? d.items.map((r) => `<div class="item" data-id="${r.id}">
      <div class="head"><span class="badge ${r.status === 'new' ? 'bad' : r.status === 'done' ? 'ok' : ''}">${{ new: 'нов', done: 'решен', dismissed: 'отхвърлен' }[r.status]}</span><b style="color:var(--text)">${h(r.reason)}</b><span>· ${h(r.name || 'гост')}</span>${r.room ? `<span>· стая ${h(r.room)}</span>` : ''}<span class="grow"></span><span>${ago(r.at)}</span></div>
      ${r.text ? `<div class="body">${h(r.text)}</div>` : ''}
      ${r.question ? `<div class="quote">❓ ${h(r.question.text)} <span class="hint">${r.question.grade ? r.question.grade + ' кл. · ' : ''}${SUBJ[r.question.subject] || ''}</span></div>` : ''}
      <div class="actions">${r.key ? `<button class="btn sm primary" data-q="${r.key}">✏️ Отвори въпроса</button>` : ''}
        ${r.status !== 'done' ? '<button class="btn sm ok" data-s="done">✓ Решен</button>' : ''}${r.status !== 'dismissed' ? '<button class="btn sm" data-s="dismissed">✕ Отхвърли</button>' : ''}${r.status !== 'new' ? '<button class="btn sm" data-s="new">↺ Върни като нов</button>' : ''}
        <input class="grow" data-note placeholder="Бележка (само за теб)…" value="${h(r.note)}" style="min-width:160px"></div></div>`).join('')
      : '<div class="card empty"><div class="big">📭</div>Няма сигнали тук.</div>'}</div>`;
  view.onclick = async (e) => {
    const st = e.target.closest('[data-st]'); if (st) { repStatus = st.dataset.st; return route(); }
    const q = e.target.closest('[data-q]'); if (q) return editQuestion(q.dataset.q);
    const s = e.target.closest('[data-s]');
    if (s) { const id = s.closest('[data-id]').dataset.id; if (await run(() => api('PUT', 'reports/' + id, { status: s.dataset.s }))) { route(); refreshCounts(); } }
    if (e.target.id === 'repAll') { if (await run(() => api('POST', 'reports/bulk', { ids: d.items.map((x) => x.id), status: 'done' }), 'Всички са маркирани като решени.')) { route(); refreshCounts(); } }
  };
  view.onchange = (e) => { const n = e.target.closest('[data-note]'); if (n) run(() => api('PUT', 'reports/' + n.closest('[data-id]').dataset.id, { note: n.value }), 'Бележката е запазена.'); };
};

// ----- идеи от играчите -----
let ideaStatus = 'new', ideaSort = '';
VIEWS.ideas = async (view) => {
  const d = await GET(`ideas?status=${ideaStatus}&sort=${ideaSort}`);
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
  const chip = (k, v) => `<button class="chip ${ideaStatus === k ? 'on' : ''}" data-st="${k}">${v}<span class="n">${k === 'all' ? total : d.counts[k] || 0}</span></button>`;
  view.innerHTML = `<div class="banner info">💡 <div>Идеите от децата не се виждат от другите, докато не ги публикуваш. Публикуваните идеи другите могат да харесват 👍, а отговорът ти се показва под идеята в играта.</div></div>
    <div class="row between" style="margin-top:12px"><div class="chips">${chip('new', 'Нови')}${chip('published', 'Публикувани')}${chip('planned', 'Ще ги направим')}${chip('done', 'Направени')}${chip('rejected', 'Отхвърлени')}${chip('all', 'Всички')}</div>
      <select id="ideaSort"><option value="">Най-нови</option><option value="likes" ${ideaSort === 'likes' ? 'selected' : ''}>Най-харесвани</option></select></div>
    <div class="items">${d.items.length ? d.items.map((i) => `<div class="item" data-id="${i.id}">
      <div class="head"><span class="badge ${IDEA_STATUS[i.status][1]}">${IDEA_STATUS[i.status][0]}</span><b style="color:var(--text)">${h(d.categories[i.category] || i.category)}</b><span>· ${i.by ? '👤 ' + h(i.by) : 'гост'}</span><span>· 👍 ${i.likes}</span><span class="grow"></span><span>${ago(i.at)}</span></div>
      <div class="body">${h(i.text)}</div>
      <div class="actions">
        ${i.status !== 'published' ? '<button class="btn sm ok" data-s="published">📢 Публикувай</button>' : ''}
        ${i.status !== 'planned' ? '<button class="btn sm" data-s="planned">🛠 Ще я направим</button>' : ''}
        ${i.status !== 'done' ? '<button class="btn sm" data-s="done">✅ Направена</button>' : ''}
        ${i.status !== 'rejected' ? '<button class="btn sm" data-s="rejected">✕ Отхвърли</button>' : ''}
        <button class="btn sm danger" data-del>🗑</button>
        <input class="grow" data-reply placeholder="Отговор към децата (вижда се в играта)…" value="${h(i.reply)}" maxlength="400" style="min-width:200px"></div></div>`).join('')
      : '<div class="card empty"><div class="big">💡</div>Няма идеи тук.</div>'}</div>`;
  $('#ideaSort').onchange = (e) => { ideaSort = e.target.value; route(); };
  view.onclick = async (e) => {
    const st = e.target.closest('[data-st]'); if (st) { ideaStatus = st.dataset.st; return route(); }
    const id = e.target.closest('[data-id]')?.dataset.id;
    const s = e.target.closest('[data-s]');
    if (s && id) { if (await run(() => api('PUT', 'ideas/' + id, { status: s.dataset.s }), 'Готово.')) { route(); refreshCounts(); } }
    if (e.target.closest('[data-del]') && id && (await confirmBox('Да изтрия ли тази идея?', { ok: 'Изтрий', danger: true }))) { if (await run(() => api('DELETE', 'ideas/' + id), 'Изтрита.')) { route(); refreshCounts(); } }
  };
  view.onchange = (e) => { const r = e.target.closest('[data-reply]'); if (r) run(() => api('PUT', 'ideas/' + r.closest('[data-id]').dataset.id, { reply: r.value }), 'Отговорът е запазен.'); };
};

// ----- играчи -----
let plQ = '', plSort = 'recent';
VIEWS.players = async (view) => {
  view.innerHTML = `<div class="banner info">🔒 <div>Пазим само прякор и парола (без имейл и истинско име), защото играчите са деца. Ако дете забрави паролата си, тук можеш да му дадеш нова.</div></div>
    <div class="filters" style="margin-top:12px"><input class="search" id="plSearch" placeholder="🔍 Търси по прякор…" value="${h(plQ)}">
      <select id="plSort"><option value="recent">Последно влизане</option><option value="new">Най-нови</option><option value="wins">Най-много победи</option><option value="games">Най-много игри</option><option value="name">По азбучен ред</option></select></div>
    <div class="card" style="padding-top:4px"><div class="table-wrap"><table><thead><tr><th>Прякор</th><th class="num">Ниво</th><th class="num">Значки</th><th>Клас</th><th class="num">Игри</th><th class="num">Победи</th><th class="num">Верни</th><th>Последно</th><th></th></tr></thead><tbody id="plRows"></tbody></table></div><div class="hint" id="plTotal" style="margin-top:8px"></div></div>`;
  $('#plSort').value = plSort;
  const load = async () => {
    const d = await GET(`players?q=${encodeURIComponent(plQ)}&sort=${plSort}`);
    $('#plTotal').textContent = `${fmt(d.total)} акаунта`;
    $('#plRows').innerHTML = d.items.length ? d.items.map((u) => `<tr class="${u.banned ? 'dim' : ''}" data-id="${u.id}" data-name="${h(u.name)}" data-banned="${u.banned ? 1 : ''}">
      <td><div class="row" style="flex-wrap:nowrap">${avatarHtml(u.avatar, 34)}<div><b>${h(u.name)}</b> ${u.banned ? '<span class="badge bad">спрян</span>' : ''}<div class="hint">от ${new Date(u.createdAt).toLocaleDateString('bg-BG')}</div></div></div></td>
      <td class="num"><b>${u.level}</b><div class="hint">${fmt(u.xp)} XP</div></td><td class="num">${u.badges}</td><td>${u.grade || '—'}</td><td class="num">${u.games}</td><td class="num">${u.wins}</td><td class="num">${u.pct == null ? '—' : u.pct + '%'}</td><td class="hint">${ago(u.lastSeen)}</td>
      <td class="num"><button class="btn sm" data-a="rename" title="Преименувай">✏️</button> <button class="btn sm" data-a="pass" title="Нова парола">🔑</button> <button class="btn sm" data-a="ban" title="${u.banned ? 'Пусни' : 'Спри'}">${u.banned ? '✅' : '⛔'}</button> <button class="btn sm danger" data-a="del" title="Изтрий">🗑</button></td></tr>`).join('')
      : '<tr><td colspan="9"><div class="empty"><div class="big">👤</div>Още няма регистрирани играчи.</div></td></tr>';
  };
  $('#plSearch').oninput = debounce((e) => { plQ = e.target.value; load(); });
  $('#plSort').onchange = (e) => { plSort = e.target.value; load(); };
  $('#plRows').onclick = async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const tr = b.closest('tr'), id = tr.dataset.id, name = tr.dataset.name;
    if (b.dataset.a === 'rename') {
      const m = modal({ title: 'Преименувай играч', size: 'narrow', body: `<label class="field"><span>Нов прякор</span><input id="newName" value="${h(name)}" maxlength="16"></label><p class="err" id="rnErr"></p>`, foot: '<button class="btn primary" data-ok>Запази</button>' });
      $('[data-ok]', m.el).onclick = async () => { try { await api('PUT', 'players/' + id, { name: $('#newName', m.el).value }); m.close(); toast('Прякорът е сменен.'); load(); } catch (x) { $('#rnErr', m.el).textContent = x.message; } };
    }
    if (b.dataset.a === 'pass' && (await confirmBox(`Да дам ли нова парола на <b>${h(name)}</b>? Старата спира да работи.`, { ok: 'Нова парола' }))) {
      const r = await run(() => api('POST', `players/${id}/reset-password`));
      if (r) modal({ title: '🔑 Новата парола', size: 'narrow', body: `<p>Кажи на <b>${h(name)}</b> новата парола:</p><div class="pass">${h(r.password)}</div><p class="hint">Детето може да я смени от профила си в играта.</p>` });
    }
    if (b.dataset.a === 'ban') { const ban = !tr.dataset.banned; if (!ban || (await confirmBox(`Да спра ли акаунта на <b>${h(name)}</b>? Няма да може да влиза, но ще може да играе като гост.`, { ok: 'Спри', danger: true }))) { if (await run(() => api('PUT', 'players/' + id, { banned: ban }), ban ? 'Акаунтът е спрян.' : 'Акаунтът е пуснат.')) load(); } }
    if (b.dataset.a === 'del' && (await confirmBox(`Да изтрия ли акаунта на <b>${h(name)}</b> завинаги, заедно с победите му?`, { ok: 'Изтрий', danger: true }))) { if (await run(() => api('DELETE', 'players/' + id), 'Акаунтът е изтрит.')) load(); }
  };
  await load();
};

const avatarHtml = (a, size = 40) => a?.photo ? `<img src="${h(a.photo)}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex:none">`
  : `<span style="width:${size}px;height:${size}px;border-radius:50%;background:${h(a?.color || '#ccc')};display:inline-grid;place-items:center;font-size:${size * 0.55}px;flex:none">${h(a?.icon || '👤')}</span>`;

// ----- снимки за профила -----
VIEWS.photos = async (view) => {
  const d = await GET('photos');
  const card = (x, pending) => `<div class="item" data-uid="${x.uid}" style="text-align:center"><img src="${h(x.data)}" alt="" style="width:120px;height:120px;border-radius:50%;object-fit:cover"><div class="body">${h(x.name)}</div>${x.at ? `<div class="hint">${ago(x.at)}</div>` : ''}
    <div class="actions" style="justify-content:center;margin-top:8px">${pending ? '<button class="btn sm ok" data-a="approve">✓ Одобри</button>' : ''}<button class="btn sm danger" data-a="reject">${pending ? '✕ Отхвърли' : '🗑 Махни'}</button></div></div>`;
  view.innerHTML = `<div class="banner info">🛡️ <div>Децата могат да качат своя снимка за профила, но другите я виждат едва след като я одобриш. Отхвърляй снимки с лице на дете, с лични данни или с нещо неподходящо: детето продължава с вграден аватар.</div></div>
    <div class="card"><h3>Чакат одобрение (${d.pending.length})</h3>${d.pending.length ? `<div class="rooms" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${d.pending.map((x) => card(x, true)).join('')}</div>` : '<div class="empty">Няма нови снимки.</div>'}</div>
    <div class="card"><h3>Одобрени (${d.approved.length})</h3>${d.approved.length ? `<div class="rooms" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${d.approved.map((x) => card(x, false)).join('')}</div>` : '<div class="empty">Още няма одобрени снимки.</div>'}</div>`;
  view.onclick = async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const uid = b.closest('[data-uid]').dataset.uid;
    if (await run(() => api('POST', `photos/${uid}/${b.dataset.a}`), b.dataset.a === 'approve' ? 'Снимката е одобрена.' : 'Снимката е махната.')) { route(); refreshCounts(); }
  };
};

// ----- на живо -----
VIEWS.rooms = async (view) => {
  const draw = async () => {
    if (page() !== 'rooms') return clearInterval(timers.live);
    const d = await GET('rooms');
    const playing = d.rooms.filter((r) => r.phase !== 'lobby' && r.phase !== 'ended');
    view.innerHTML = `<div class="row between" style="margin-bottom:12px"><span class="muted"><span class="live-dot"></span>Обновява се сам на всеки 3 секунди · ${d.rooms.length} стаи · ${playing.length} игри вървят</span></div>
      ${d.rooms.length ? `<div class="rooms">${d.rooms.map((r) => `<div class="item" data-code="${r.code}">
        <div class="head"><b style="color:var(--text);font-size:1.1rem">Стая ${r.code}</b><span class="badge" style="color:${MODE_COLOR[r.mode]}">${MODE[r.mode]}</span><span class="badge">${r.grade} клас</span><span class="grow"></span><span class="badge ${r.phase === 'lobby' ? '' : r.phase === 'ended' ? '' : 'ok'}">${PHASE[r.phase] || r.phase}${r.round && r.phase === 'battle' ? ` ${r.round}/${r.battleRounds}` : ''}</span></div>
        <div style="margin:8px 0">${r.members.map((m) => `<div class="member"><span class="dot ${m.connected ? 'on' : 'off'}" title="${m.connected ? 'свързан' : 'изгубена връзка'}"></span>${m.isBot ? '🤖' : '👤'} ${h(m.name)}${m.host ? ' <span class="badge">домакин</span>' : ''}${m.alive === false ? ' <span class="badge bad">отпаднал</span>' : ''}<span class="grow"></span>${m.score != null ? `<b>${fmt(m.score)}</b>` : ''}${!m.isBot ? ` <button class="btn sm ghost" data-kick="${m.id}" title="Извади от стаята">✕</button>` : ''}</div>`).join('')}</div>
        ${r.question ? `<div class="quote">❓ ${h(r.question.text)}</div>` : ''}
        <div class="actions"><span class="hint">${r.startedAt ? 'играят от ' + dur(Math.round((Date.now() - r.startedAt) / 1000)) : r.emptySince ? 'празна от ' + ago(new Date(r.emptySince).toISOString()) : ''}</span><span class="grow"></span><button class="btn sm danger" data-close>Затвори стаята</button></div></div>`).join('')}</div>`
        : '<div class="card empty"><div class="big">🌙</div>В момента никой не играе.</div>'}`;
  };
  view.onclick = async (e) => {
    const code = e.target.closest('[data-code]')?.dataset.code;
    if (e.target.closest('[data-close]') && (await confirmBox(`Да затворя ли стая ${code}? Играчите ще се върнат на началния екран.`, { ok: 'Затвори', danger: true }))) { await run(() => api('POST', `rooms/${code}/close`), 'Стаята е затворена.'); draw(); }
    const k = e.target.closest('[data-kick]');
    if (k && (await confirmBox('Да извадя ли този играч? Ако играта върви, бот ще играе вместо него.', { ok: 'Извади', danger: true }))) { await run(() => api('POST', `rooms/${code}/kick`, { pid: k.dataset.kick }), 'Играчът е изваден.'); draw(); }
  };
  await draw();
  timers.live = setInterval(() => { if (!modalStack.length) draw().catch(() => {}); }, 3000);
};

// ----- статистика -----
VIEWS.stats = async (view) => {
  const d = await GET('analytics');
  const modes = Object.entries(d.modes);
  view.innerHTML = `<div class="kpis">
      <div class="kpi"><div class="lbl">Игри общо</div><div class="val">${fmt(d.totals.games)}</div><div class="sub">${fmt(d.totals.completed)} завършени (${d.totals.games ? Math.round((100 * d.totals.completed) / d.totals.games) : 0}%)</div></div>
      <div class="kpi"><div class="lbl">Отговори на деца</div><div class="val">${fmt(d.totals.answers)}</div><div class="sub">${d.totals.answers ? Math.round((100 * d.totals.correct) / d.totals.answers) : 0}% верни</div></div>
      <div class="kpi"><div class="lbl">Задавани въпроси</div><div class="val">${fmt(d.seen)}</div><div class="sub">${fmt(d.unseen)} още не са се паднали</div></div>
      ${modes.map(([k, v]) => `<div class="kpi"><div class="lbl">${MODE[k]}</div><div class="val">${v.n}</div><div class="sub">средно ${v.completed ? dur(Math.round(v.sec / v.completed)) : '—'} на игра</div></div>`).join('')}
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>Игри за 30 дни</h3>${barChart(d.days, [{ key: 'online', label: 'Онлайн', color: MODE_COLOR.online }, { key: 'friends', label: 'С приятели', color: MODE_COLOR.friends }, { key: 'bots', label: 'С ботове', color: MODE_COLOR.bots }])}</div>
      <div class="card"><h3>Верни отговори по дни</h3>${lineChart(d.days, (x) => (x.answers ? Math.round((100 * x.correct) / x.answers) : null), { max: 100, suffix: '%', color: '#2e8b4a' })}</div>
      <div class="card"><h3>Деца в игра по дни</h3>${lineChart(d.days, 'humans', { color: '#1e88e5' })}</div>
      <div class="card"><h3>Рекорд онлайн по дни</h3>${lineChart(d.days, 'peakPlayers', { color: '#b07a12' })}</div>
    </div>
    <div class="card"><h3>Успеваемост по предмети и класове</h3><div class="table-wrap"><table class="heat"><thead><tr><th>Предмет</th><th>Общо</th>${[1, 2, 3, 4].map((g) => `<th>${g} клас</th>`).join('')}</tr></thead><tbody>
      ${d.bySubject.map((s) => `<tr><td>${SUBJ_ICON[s.subject]} ${s.name}</td><td>${s.pct == null ? '—' : `<b style="color:${pctColor(s.pct)}">${s.pct}%</b> <span class="hint">(${fmt(s.n)})</span>`}</td>${[1, 2, 3, 4].map((g) => `<td>${s.grades[g] ? `<span style="color:${pctColor(s.grades[g].pct)};font-weight:900">${s.grades[g].pct}%</span> <span class="hint">${s.grades[g].n}</span>` : '<span class="hint">—</span>'}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div><div class="hint">Много нисък процент значи, че въпросите може да са твърде трудни за този клас.</div></div>
    <div class="grid g2">
      <div class="card"><h3>🤔 Най-трудни въпроси</h3><p class="hint" style="margin-top:-6px">Под 30% често значи грешен „верен“ отговор: провери ги първо.</p>${qList(d.hardest)}</div>
      <div class="card"><h3>😊 Най-лесни въпроси</h3><p class="hint" style="margin-top:-6px">Близо 100% може да значи, че са твърде лесни за класа.</p>${qList(d.easiest)}</div>
    </div>
    <div class="card"><h3>Последни игри</h3>${d.games.length ? `<div class="table-wrap"><table><thead><tr><th>Кога</th><th>Режим</th><th>Клас</th><th>Играчи</th><th>Рундове</th><th>Продължителност</th><th>Победител</th></tr></thead><tbody>${d.games.map((g) => `<tr><td class="hint">${ago(g.at)}</td><td><span style="color:${MODE_COLOR[g.mode]};font-weight:800">${MODE[g.mode]}</span></td><td>${g.grade}</td><td>${g.humans} 👤${g.bots ? ` + ${g.bots} 🤖` : ''}</td><td>${g.rounds}</td><td>${g.completed ? dur(g.sec) : '<span class="badge warn">прекъсната</span>'}</td><td>${g.completed ? (g.humanWon ? '👤 дете' : '🤖 бот') : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Още няма изиграни игри.</div>'}</div>`;
  view.onclick = (e) => { const tr = e.target.closest('[data-key]'); if (tr) editQuestion(tr.dataset.key); };
};
const qList = (items) => items.length ? `<div class="table-wrap"><table><tbody>${items.map((q) => `<tr class="click" data-key="${q.key}"><td><div class="qtext">${h(q.text)}</div><div class="qans">✓ ${h(q.correct)}</div></td><td style="white-space:nowrap">${SUBJ_ICON[q.subject]} ${q.grade} кл.</td><td>${pctCell(q.stats)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Нужни са поне 5 отговора на въпрос, за да има данни.</div>';

// ----- съобщения и поддръжка -----
VIEWS.announce = async (view) => {
  const { settings: s } = await GET('settings');
  view.innerHTML = `<div class="grid g2">
    <div class="card"><h3>📣 Съобщение до всички играчи</h3><p class="muted">Показва се като лента най-горе в играта, на всички устройства (до минута след запазване).</p>
      <label class="switch"><input type="checkbox" id="anOn" ${s.announcement.on ? 'checked' : ''}> Покажи съобщението</label>
      <label class="field" style="margin-top:12px"><span>Текст</span><textarea id="anText" rows="3" maxlength="300" placeholder="напр. В петък ще има състезание между класовете! 🏆">${h(s.announcement.text)}</textarea></label>
      <div class="field"><span>Вид</span><div class="seg" id="anKind">${[['info', 'ℹ️ Информация'], ['party', '🎉 Празник'], ['warn', '⚠️ Внимание']].map(([k, v]) => `<button data-k="${k}" class="${s.announcement.kind === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
      <div class="field"><span>Преглед</span><div id="anPrev"></div></div>
      <div class="row end"><button class="btn primary" id="anSave">💾 Запази</button></div></div>
    <div class="card"><h3>🛠️ Режим „Поддръжка“</h3><p class="muted">Докато е включен, нови игри не могат да започнат и децата виждат съобщението. Започналите игри продължават.</p>
      <label class="switch"><input type="checkbox" id="mOn" ${s.maintenance.on ? 'checked' : ''}> Включи поддръжката</label>
      <label class="field" style="margin-top:12px"><span>Какво виждат децата</span><textarea id="mText" rows="2" maxlength="200">${h(s.maintenance.message)}</textarea></label>
      <div class="row end"><button class="btn primary" id="mSave">💾 Запази</button></div></div></div>`;
  let kind = s.announcement.kind;
  const COLORS = { info: '#1e6fb8', party: '#8e24aa', warn: '#c8352c' };
  const prev = () => { $('#anPrev').innerHTML = `<div style="background:${COLORS[kind]};color:#fff;border-radius:10px;padding:10px 14px;font-weight:800">${{ info: 'ℹ️', party: '🎉', warn: '⚠️' }[kind]} ${h($('#anText').value) || '…'}</div>`; };
  prev();
  $('#anText').oninput = prev;
  $('#anKind').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; $$('#anKind button').forEach((x) => x.classList.toggle('on', x === b)); prev(); };
  $('#anSave').onclick = () => run(() => api('PUT', 'settings', { ...s, announcement: { on: $('#anOn').checked, text: $('#anText').value, kind } }), 'Съобщението е запазено.');
  $('#mSave').onclick = async () => { if (await run(() => api('PUT', 'settings', { ...s, maintenance: { on: $('#mOn').checked, message: $('#mText').value } }), $('#mOn').checked ? 'Поддръжката е включена.' : 'Играта е отворена.')) refreshCounts(); };
};

// ----- настройки -----
VIEWS.settings = async (view) => {
  const { settings: s, defaults } = await GET('settings');
  const num = (id, label, val, min, max, unit, hint) => `<label class="field"><span>${label}</span><div class="row"><input type="number" id="${id}" value="${val}" min="${min}" max="${max}" style="width:110px"><span class="muted">${unit}</span></div>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
  view.innerHTML = `<div class="grid g2">
    <div class="card"><h3>⏱ Време</h3>
      ${num('tMc', 'Въпрос с 4 отговора', s.times.mc, 5, 120, 'секунди', `по подразбиране ${defaults.times.mc}`)}
      ${num('tNum', 'Числов въпрос', s.times.num, 5, 120, 'секунди', `по подразбиране ${defaults.times.num}`)}
      ${num('tPick', 'Избор на област', s.times.pick, 5, 120, 'секунди', `по подразбиране ${defaults.times.pick}`)}
      <div class="hint">По-малките деца четат по-бавно: за 1–2 клас може да е добре повече време.</div></div>
    <div class="card"><h3>⚔️ Онлайн игра</h3>
      ${num('oPlayers', 'Играчи в онлайн стая', s.onlinePlayers, 2, 4, 'играчи', 'празните места се пълнят с ботове')}
      ${num('oWait', 'Чакане за други деца', s.onlineWait, 3, 120, 'секунди', 'после влизат ботове')}
      ${num('oRounds', 'Рундове във войната (онлайн)', s.onlineBattleRounds, 2, 5, 'рунда')}
      ${num('dRounds', 'Рундове по подразбиране (с приятели и ботове)', s.defaultBattleRounds, 2, 5, 'рунда', 'домакинът може да ги смени в стаята')}</div>
    <div class="card"><h3>🤖 Имена на ботовете</h3>
      ${s.botNames.map((n, i) => `<input class="botName" value="${h(n)}" maxlength="16" style="width:100%;margin-bottom:8px" placeholder="Бот ${i + 1}">`).join('')}
      <div class="hint">Поне 4 имена; празните се попълват с имената по подразбиране.</div></div>
    <div class="card"><h3>📚 Предмети в играта</h3><p class="muted" style="margin-top:-4px">Изключеният предмет не се задава в никоя игра (въпросите му остават запазени).</p>
      ${Object.entries(SUBJ).map(([k, v]) => `<label class="switch" style="display:flex;margin:8px 0"><input type="checkbox" class="subjOn" value="${k}" ${s.disabledSubjects.includes(k) ? '' : 'checked'}> ${SUBJ_ICON[k]} ${v}</label>`).join('')}</div>
  </div>
  <div class="row end" style="margin-top:16px"><button class="btn" id="sDefaults">↺ Стойности по подразбиране</button><button class="btn primary" id="sSave">💾 Запази настройките</button></div>`;
  const collect = () => ({ ...s,
    times: { mc: +$('#tMc').value, num: +$('#tNum').value, pick: +$('#tPick').value },
    onlinePlayers: +$('#oPlayers').value, onlineWait: +$('#oWait').value, onlineBattleRounds: +$('#oRounds').value, defaultBattleRounds: +$('#dRounds').value,
    botNames: $$('.botName').map((i) => i.value), disabledSubjects: $$('.subjOn').filter((c) => !c.checked).map((c) => c.value) });
  $('#sSave').onclick = async () => { if (await run(() => api('PUT', 'settings', collect()), 'Настройките са запазени. Важат за следващите игри.')) route(); };
  $('#sDefaults').onclick = async () => { if (await confirmBox('Да върна ли всички настройки по подразбиране? Съобщението и поддръжката не се пипат.')) { if (await run(() => api('PUT', 'settings', { ...defaults, announcement: s.announcement, maintenance: s.maintenance }), 'Върнати са стойностите по подразбиране.')) route(); } };
};

// ----- дневник -----
VIEWS.log = async (view) => {
  const { items } = await GET('audit');
  view.innerHTML = `<div class="card" style="padding-top:4px">${items.length ? `<div class="table-wrap"><table><thead><tr><th>Кога</th><th>Действие</th><th>Какво</th><th></th></tr></thead><tbody>${items.map((x) => `<tr class="${x.reverted ? 'dim' : ''}"><td class="hint" style="white-space:nowrap" title="${new Date(x.at).toLocaleString('bg-BG')}">${ago(x.at)}</td><td><b>${ACTION[x.action] || x.action}</b></td><td>${x.key ? `<a href="#" data-key="${x.key}">${h(x.label)}</a>` : h(x.label)}</td>
    <td class="num">${(x.key || x.action === 'settings') && x.action !== 'revert' && !x.reverted ? `<button class="btn sm" data-rev="${x.id}">↩︎ Върни</button>` : x.reverted ? '<span class="hint">върнато</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><div class="big">🕘</div>Още няма промени.</div>'}</div>`;
  view.onclick = async (e) => {
    const k = e.target.closest('[data-key]'); if (k) { e.preventDefault(); editQuestion(k.dataset.key); }
    const r = e.target.closest('[data-rev]');
    if (r && (await confirmBox('Да върна ли състоянието отпреди тази промяна?', { ok: 'Върни' }))) { if (await run(() => api('POST', `audit/${r.dataset.rev}/revert`), 'Промяната е върната.')) route(); }
  };
};

// ----- архив и данни -----
VIEWS.backup = async (view) => {
  const o = await GET('overview');
  const s = o.storage;
  view.innerHTML = `<div class="card"><h3>☁️ Постоянно запазване</h3>
    ${s.remote ? `<div class="banner ${s.lastError ? 'bad' : 'ok'}">${s.lastError ? '⚠️' : '✅'} <div>Данните се пазят в частното хранилище <b>${h(s.repo)}</b> (клон ${h(s.branch)}). Последен запис: ${s.lastSave ? ago(s.lastSave) : 'още няма'}.${s.lastError ? `<br>Грешка: ${h(s.lastError)}` : ''}</div></div>`
      : `<div class="banner warn">⚠️ <div>Постоянното запазване не е включено${s.lastError ? ` (${h(s.lastError)})` : ''}. Безплатният Render изтрива файловете при всеки рестарт, така че въпросите от панела, акаунтите и идеите ще изчезнат.</div></div>
      <ol class="small" style="line-height:1.7"><li>В GitHub създай <b>частно (Private)</b> хранилище, напр. <code>quizzard-data</code>.</li>
      <li>GitHub → Settings → Developer settings → Fine-grained tokens → Generate: достъп само до това хранилище, право <b>Contents: Read and write</b>.</li>
      <li>В Render → quizzard → Environment добави <code>GITHUB_TOKEN</code> (токена) и <code>DATA_REPO</code> (напр. <code>danov937-ctrl/quizzard-data</code>) и запази.</li></ol>`}
    <div class="row"><button class="btn" id="bSave">💾 Запиши сега</button></div></div>
    <div class="grid g2">
      <div class="card"><h3>📦 Архив</h3><p class="muted">Всичко от панела в един файл: въпроси, настройки, дневник, сигнали, статистика, акаунти и идеи.</p>
        <a class="btn primary" href="/api/admin/backup" download>⬇️ Изтегли архив</a>
        <div class="side-box"><h4>Възстановяване</h4><p class="small muted">Заменя текущите промени по въпросите и настройките с тези от архива.</p>
          <label class="switch small"><input type="checkbox" id="rAct"> и статистиката, сигналите, акаунтите и идеите</label>
          <div class="row" style="margin-top:10px"><label class="btn danger">📂 Избери архив<input type="file" id="rFile" accept=".json,application/json" hidden></label></div></div></div>
      <div class="card"><h3>📤 Въпроси като файлове</h3><p class="muted">За да влязат промените от панела и в хранилището на играта.</p><button class="btn" id="bExport">Изнеси въпроси…</button>
        <div class="side-box"><h4>Внасяне</h4><button class="btn" id="bImport">📥 Внеси въпроси от файл…</button></div></div>
    </div>`;
  $('#bSave').onclick = async () => { const r = await run(() => api('POST', 'storage/save')); if (r) { toast(r.storage.lastError ? 'Грешка: ' + r.storage.lastError : 'Записано.', { bad: !!r.storage.lastError }); route(); } };
  $('#bExport').onclick = exportDialog;
  $('#bImport').onclick = () => importDialog();
  $('#rFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    let data; try { data = JSON.parse(await f.text()); } catch { return toast('Файлът не е валиден архив.', { bad: true }); }
    if (!(await confirmBox(`Да възстановя ли архива от <b>${h(data.at ? new Date(data.at).toLocaleString('bg-BG') : '?')}</b>? Текущите промени ще бъдат заменени.`, { ok: 'Възстанови', danger: true }))) return;
    if (await run(() => api('POST', 'restore', { ...data, withActivity: $('#rAct').checked }), 'Архивът е възстановен.')) { refreshCounts(); route(); }
  };
};

// ---------- клавиши ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalStack.length) { modalStack.at(-1).close(); return; }
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (typing || modalStack.length || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); if (page() !== 'questions') location.hash = 'questions'; setTimeout(() => $('#qSearch')?.focus(), 150); }
  if (e.key === 'n' || e.key === 'N' || e.key === 'н' || e.key === 'Н') { e.preventDefault(); editQuestion(null); }
  if (e.key === '?') showHelp();
  const nums = { 1: 'dashboard', 2: 'questions', 3: 'reports', 4: 'ideas', 5: 'rooms', 6: 'stats', 7: 'settings' };
  if (nums[e.key]) location.hash = nums[e.key];
});
function showHelp() {
  modal({ title: '⌨️ Клавишни комбинации', size: 'narrow', body: `<div class="kbd-list">
    <kbd>/</kbd><span>Търсене във въпросите</span><kbd>N</kbd><span>Нов въпрос</span>
    <kbd>Ctrl+Enter</kbd><span>Запази въпроса</span><kbd>Ctrl+Shift+Enter</kbd><span>Запази и започни нов</span>
    <kbd>Alt+← / →</kbd><span>Предишен / следващ въпрос</span><kbd>Esc</kbd><span>Затвори прозореца</span>
    <kbd>1–7</kbd><span>Табло, Въпроси, Сигнали, Идеи, На живо, Статистика, Настройки</span><kbd>?</kbd><span>Тази помощ</span></div>` });
}
$('#btnHelp').onclick = showHelp;

// ---------- тема ----------
const THEME_KEY = 'quizzard-admin-theme';
function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
try { applyTheme(localStorage.getItem(THEME_KEY)); } catch {}
$('#btnTheme').onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  applyTheme(next); try { localStorage.setItem(THEME_KEY, next); } catch {}
};

// ---------- старт ----------
async function start() {
  try {
    const me = await fetch('/api/admin/me', { credentials: 'same-origin' });
    if (me.status === 503) { showLogin(); $('#loginErr').textContent = 'На сървъра не е зададена парола (ADMIN_KEY).'; return; }
    if (!me.ok) return showLogin();
  } catch { return showLogin(); }
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  await refreshCounts();
  route();
  clearInterval(timers.counts);
  timers.counts = setInterval(refreshCounts, 60000);
}
start();
