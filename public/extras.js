// Знаменосци · профил, нива и значки, класация, идеи и съобщения от администратора.
// Отделно от client.js: само добавя бутони на началния екран и собствени прозорци.
(() => {
  'use strict';
  const q = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const SUBJ = { hist: 'История', geo: 'География', sci: 'Природни науки', film: 'Кино и телевизия', music: 'Музика', spt: 'Спорт', lit: 'Литература', art: 'Изкуство и архитектура', tec: 'Наука и технологии', gen: 'Обща култура', bel: 'Български език', mat: 'Математика', okol: 'Околен свят', prir: 'Човекът и природата', obsht: 'Човекът и обществото', eng: 'Английски език', muz: 'Музика', izk: 'Изобразително изкуство', tech: 'Технологии', sport: 'Физическо възпитание', comp: 'Компютърно моделиране' };
  // Грешките в браузъра отиват в админ панела (Състояние → Грешки). Най-много 5 на зареждане.
  let sentErrors = 0;
  const reportError = (message, where) => {
    if (sentErrors++ >= 5 || !message) return;
    try { fetch('/api/client-error', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Quizzard': '1' }, body: JSON.stringify({ message: String(message).slice(0, 400), where: String(where || '').slice(0, 200), page: location.pathname }) }).catch(() => {}); } catch {}
  };
  window.addEventListener('error', (e) => { if (e.message) reportError(e.message, e.filename ? `${e.filename.replace(location.origin, '')}:${e.lineno}:${e.colno}` : ''); });
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; reportError(r?.message || String(r), (r?.stack || '').split('\n')[1]?.trim()); });
  const home = q('#home');
  if (!home) return;
  let me = null;
  let mailOn = false; // сървърът праща имейли (потвърждение, нова парола)
  // Режим за възрастни (adult.js): от профила или от избора на началния екран
  const adultMode = () => document.body.classList.contains('mode-adult');

  async function call(path, body) {
    const res = await fetch(path, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Quizzard': '1' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Нещо се обърка. Опитай пак.');
    return data;
  }
  const avatar = (a, size = 44) => a?.photo ? `<img class="qx-av" src="${esc(a.photo)}" alt="" style="width:${size}px;height:${size}px">`
    : `<span class="qx-av" style="width:${size}px;height:${size}px;background:${esc(a?.color || '#7a4a22')};font-size:${Math.round(size * 0.58)}px">${esc(a?.icon || '👤')}</span>`;

  // ---------- прозорци ----------
  function open(title, html, cls = '') {
    close();
    const back = document.createElement('div');
    back.className = 'qx-back';
    back.innerHTML = `<div class="qx-modal ${cls}" role="dialog" aria-modal="true"><div class="qx-head"><h2>${title}</h2><button class="qx-x" aria-label="Затвори">✕</button></div><div class="qx-body">${html}</div></div>`;
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    q('.qx-x', back).onclick = close;
    document.body.append(back);
    fitViewport();
    return back;
  }
  function close() { q('.qx-back')?.remove(); }
  // Отворена клавиатура на телефон (особено хоризонтално): прозорецът се побира във видимата част
  // над клавиатурата, а полето, в което се пише, се превърта така, че да се вижда.
  // Полето се центрира само при фокус и докато клавиатурата се отваря, не при по-късно превъртане:
  // иначе прозорецът „скача“ обратно и не можеш да стигнеш до другите полета и бутона.
  let focusedAt = 0;
  function fitViewport() {
    const back = q('.qx-back'), vv = window.visualViewport;
    if (!back) return;
    if (vv) { back.style.top = vv.offsetTop + 'px'; back.style.left = vv.offsetLeft + 'px'; back.style.height = vv.height + 'px'; back.style.width = vv.width + 'px'; back.style.bottom = back.style.right = 'auto'; }
    back.classList.toggle('qx-short', (vv ? vv.height : innerHeight) < 460);
    const a = document.activeElement;
    if (Date.now() - focusedAt < 800 && a && back.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) a.scrollIntoView({ block: 'center' });
  }
  if (window.visualViewport) { visualViewport.addEventListener('resize', fitViewport); visualViewport.addEventListener('scroll', fitViewport); }
  document.addEventListener('focusin', (e) => { if (e.target.closest?.('.qx-back')) { focusedAt = Date.now(); fitViewport(); setTimeout(fitViewport, 350); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // Enter / „Напред“ на клавиатурата на телефона: към следващото поле, а на последното изпраща формата
  const fields = (form) => [...form.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea')].filter((el) => !el.disabled && el.offsetParent);
  document.addEventListener('focusin', (e) => {
    const el = e.target, form = el.form;
    if (!form || !el.closest?.('.qx-back, .qx-gate') || el.tagName === 'TEXTAREA') return;
    const list = fields(form);
    el.setAttribute('enterkeyhint', list.indexOf(el) < list.length - 1 ? 'next' : 'go');
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key !== 'Enter' || e.isComposing || !el.form || el.tagName === 'TEXTAREA' || !el.closest?.('.qx-back, .qx-gate')) return;
    const list = fields(el.form), i = list.indexOf(el);
    if (i >= 0 && i < list.length - 1) { e.preventDefault(); list[i + 1].focus(); }
  });
  function flash(msg) {
    const t = document.createElement('div'); t.className = 'qx-toast'; t.textContent = msg;
    document.body.append(t); setTimeout(() => t.remove(), 3200);
  }
  // за adult.js (магазин, знаме): същите прозорци и обновяване на профила
  window.ZX = { open, close, flash, call, reload: () => loadMe() };

  // ---------- лента горе и бутони на началния екран ----------
  const bar = document.createElement('div');
  bar.className = 'qx-account';
  home.append(bar);
  const links = q('.home-links', home);
  if (links) links.insertAdjacentHTML('afterbegin', '<button class="link" data-qx="board">🏆 Класация</button><button class="link" data-qx="ideas">💡 Идеи</button>');
  if (links) links.insertAdjacentHTML('beforeend', '<a class="link" href="/privacy.html">🔒 За родители</a>');
  home.addEventListener('click', (e) => {
    const a = e.target.closest('[data-qx]')?.dataset.qx;
    if (a === 'board') showBoard(); if (a === 'ideas') showIdeas(); if (a === 'login') showAuth('login'); if (a === 'register') showAuth('register'); if (a === 'profile') showProfile();
  });

  function renderBar() {
    window.dispatchEvent(new CustomEvent('zn:me', { detail: me })); // adult.js: режим, парички, знаме
    const name = q('#name');
    if (me) {
      bar.innerHTML = `<button class="qx-chip" data-qx="profile" title="Моят профил">${avatar(me.avatar, 38)}<span class="qx-chip-txt"><b>${esc(me.name)}</b><small>Ниво ${me.level} · ${esc(me.title)}</small><span class="qx-mini-bar"><i style="width:${me.progress}%"></i></span></span>${me.streak > 1 ? `<span class="qx-fire" title="Дни подред">🔥${me.streak}</span>` : ''}</button>`;
      if (name) { name.value = me.name; name.readOnly = true; name.title = 'Играеш с потребителското име от профила си'; }
    } else {
      bar.innerHTML = `<button class="qx-chip guest" data-qx="login">👤 <span class="qx-chip-txt"><b>Вход</b></span></button>`;
      if (name && name.readOnly) { name.readOnly = false; name.title = ''; name.value = ls.get('quizzard-name') || ''; }
    }
  }
  // След вход/изход връзката с играта се отваря наново, за да я свърже с профила
  function reconnect() { try { if (typeof ws !== 'undefined' && ws) ws.close(); } catch {} }
  async function loadMe() { try { me = (await call('/api/account/me')).user; } catch { me = null; } renderBar(); gateUpdate(); celebrate(); }

  // ---------- начален екран: вход, регистрация или „Играй като гост“ ----------
  // Без профил се играе само след „Играй като гост“ (помни се до затваряне на браузъра).
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch {} } };
  const gate = document.createElement('div');
  gate.className = 'qx-gate qx-wait';
  const brand = q('.brand', home)?.cloneNode(true);
  brand?.querySelectorAll('h1').forEach((h) => { const d = document.createElement('div'); d.className = h.className; d.innerHTML = h.innerHTML; h.replaceWith(d); });   // само един h1 на страницата (за Google)
  gate.innerHTML = `<div class="qx-gate-box"><div class="qx-gate-brand"></div><p class="tagline">${esc(q('.tagline', home)?.textContent || '')}</p>
    <div class="qx-gate-btns"><button class="qx-btn gold qx-big-btn" data-g="login">🔑 Вход</button><button class="qx-btn gold qx-big-btn" data-g="register">✨ Регистрация</button>
    <button class="qx-btn qx-guest-btn" data-g="guest">🎮 Играй като гост</button></div>
    <p class="qx-gate-note">Като гост играеш веднага, но точките и победите ти не се пазят.</p>
    <a class="link" href="/privacy.html">🔒 За родители</a></div>`;
  if (brand) q('.qx-gate-brand', gate).append(brand);
  document.body.append(gate);
  gate.addEventListener('click', (e) => {
    const g = e.target.closest('[data-g]')?.dataset.g;
    if (g === 'guest') { ss.set('quizzard-guest', '1'); gateUpdate(); }
    else if (g) showAuth(g);
  });
  function gateUpdate() {
    gate.classList.remove('qx-wait');
    const show = !me && ss.get('quizzard-guest') !== '1' && !home.classList.contains('hidden');
    gate.classList.toggle('qx-hide', !show);
    document.body.classList.toggle('qx-gated', show);
  }

  // ---------- вход и регистрация ----------
  // Регистрация: потребителско име + имейл на родител + парола. Вход: с потребителско име или имейл + парола.
  // Регистрация на възрастен: собствен имейл, рождена дата, по-дълга парола, без родител.
  let regWho = null;
  function showAuth(tab, who) {
    if (tab === 'forgot') return showForgot();
    const reg = tab === 'register';
    regWho = who || regWho || (adultMode() ? 'adult' : 'kid');
    if (reg && regWho === 'adult') return showAdultRegister();
    const m = open('👤 Профил', `<div class="qx-tabs"><button data-t="login" class="${!reg ? 'on' : ''}">Вход</button><button data-t="register" class="${reg ? 'on' : ''}">Регистрация</button></div>
      ${reg ? whoSwitch() : ''}
      <form class="qx-form" autocomplete="on">
        ${reg ? `<label>Потребителско име<input name="name" maxlength="16" autocomplete="username" required placeholder="напр. Звездичка7"></label>
          <label>Имейл на мама или татко<input name="email" type="email" maxlength="120" autocomplete="email" required placeholder="roditel@primer.bg"></label>`
        : `<label>Потребителско име или имейл<input name="login" maxlength="120" autocomplete="username" required></label>`}
        <label>Парола<input name="password" type="password" maxlength="64" autocomplete="${reg ? 'new-password' : 'current-password'}" required></label>
        ${reg ? `<label>Повтори паролата<input name="password2" type="password" maxlength="64" autocomplete="new-password" required></label>
          <label>Клас<select name="grade"><option value="">—</option><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
          <p class="qx-note">🔒 Не пиши истинското си име. Измисли си потребителско име!</p>
          <label class="qx-check"><input type="checkbox" name="consent" required><span><b>За родителя:</b> аз съм родител на детето (или родителят знае и е съгласен) и прочетох <a href="/privacy.html" target="_blank">как пазим данните</a>.${mailOn ? ' Ще получите писмо, за да потвърдите профила.' : ''}</span></label>` : ''}
        <p class="qx-err"></p>
        <button class="qx-btn gold" type="submit">${reg ? 'Създай профил' : 'Влез'}</button>
        ${reg ? '' : `<button class="qx-linkbtn" type="button" data-forgot>Забравена парола?</button>`}
      </form>`, 'narrow');
    q('.qx-tabs', m).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) showAuth(b.dataset.t); };
    q('.qx-who', m)?.addEventListener('click', (e) => { const b = e.target.closest('[data-who]'); if (b) showAuth('register', b.dataset.who); });
    q('[data-forgot]', m)?.addEventListener('click', showForgot);
    q('form', m).onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const err = q('.qx-err', m); err.textContent = '';
      if (reg && f.password !== f.password2) { err.textContent = 'Паролите не съвпадат.'; return; }
      try {
        const r = reg ? await call('/api/account/register', { name: f.name, email: f.email, password: f.password, grade: Number(f.grade) || null, consent: !!f.consent })
          : await call('/api/account/login', { login: f.login, password: f.password });
        me = r.user; renderBar(); close(); reconnect(); gateUpdate();
        if (reg && me.needsConsent) open('📧 Почти готово!', `<p>Изпратихме писмо на <b>${esc(me.email)}</b>. Помоли мама или татко да го отворят и да потвърдят профила.</p><p class="qx-note">Дотогава можеш да играеш и да трупаш точки, но не се показваш в класацията и не можеш да качиш снимка. Ако няма писмо, нека проверят папката „Спам“.</p><button class="qx-btn gold" data-ok>Разбрах</button>`, 'narrow').querySelector('[data-ok]').onclick = close;
        else flash(reg ? `Добре дошъл, ${me.name}! 🎉` : `Здравей, ${me.name}!`);
      } catch (x) { err.textContent = x.message; }
    };
  }
  const whoSwitch = () => `<div class="qx-who"><button type="button" data-who="kid" class="${regWho === 'kid' ? 'on' : ''}">👧 За дете · 1–4 клас</button><button type="button" data-who="adult" class="${regWho === 'adult' ? 'on' : ''}">🧑 Аз съм възрастен</button></div>`;
  function showAdultRegister() {
    const max = new Date(); max.setFullYear(max.getFullYear() - 18);
    const m = open('👤 Профил', `<div class="qx-tabs"><button data-t="login">Вход</button><button data-t="register" class="on">Регистрация</button></div>
      ${whoSwitch()}
      <form class="qx-form" autocomplete="on">
        <label>Потребителско име<input name="name" maxlength="16" autocomplete="username" required placeholder="напр. Знаменосец"></label>
        <label>Имейл<input name="email" type="email" maxlength="120" autocomplete="email" required placeholder="ime@primer.bg"></label>
        <label>Рождена дата<input name="birthDate" type="date" required max="${max.toISOString().slice(0, 10)}" min="1900-01-01"></label>
        <label>Парола (поне 8 знака)<input name="password" type="password" minlength="8" maxlength="64" autocomplete="new-password" required></label>
        <label>Повтори паролата<input name="password2" type="password" maxlength="64" autocomplete="new-password" required></label>
        <p class="qx-note">🎁 Започваш с <b>1000 парички</b>. Паричките са само за игра: не се обменят в пари и не се прехвърлят.</p>
        <label class="qx-check"><input type="checkbox" name="consent" required><span>Пълнолетен съм и приемам <a href="/terms.html" target="_blank">условията</a> и <a href="/privacy-adult.html" target="_blank">политиката за поверителност</a>.</span></label>
        <p class="qx-err"></p>
        <button class="qx-btn gold" type="submit">Създай профил</button>
      </form>`, 'narrow');
    q('.qx-tabs', m).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) showAuth(b.dataset.t); };
    q('.qx-who', m).onclick = (e) => { const b = e.target.closest('[data-who]'); if (b) showAuth('register', b.dataset.who); };
    q('form', m).onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const err = q('.qx-err', m); err.textContent = '';
      if (f.password !== f.password2) { err.textContent = 'Паролите не съвпадат.'; return; }
      try {
        const r = await call('/api/account/register', { adult: true, name: f.name, email: f.email, birthDate: f.birthDate, password: f.password, consent: !!f.consent });
        me = r.user; renderBar(); close(); reconnect(); gateUpdate();
        if (me.needsConsent) open('📧 Почти готово!', `<p>Изпратихме писмо на <b>${esc(me.email)}</b>. Отвори го и натисни <b>„Потвърди имейла“</b>.</p><p class="qx-note">Дотогава можеш да играеш, но не се показваш в класациите, а профили на деца ще можеш да добавяш след потвърждението. Не намираш писмото? Виж и папката „Спам“.</p><div class="qx-row"><button class="qx-btn gold" data-ok>Разбрах</button></div>`, 'narrow').querySelector('[data-ok]').onclick = close;
        else flash(`Добре дошъл, ${me.name}! 🪙 1000 парички за начало.`);
      } catch (x) { err.textContent = x.message; }
    };
  }
  function showForgot() {
    const m = open('🔑 Забравена парола', `<form class="qx-form">
      ${mailOn ? `<p class="qx-note">${adultMode() ? 'Напиши потребителското име или имейла си. Ще ти изпратим писмо с линк за нова парола.' : 'Напиши потребителското име или имейла на родителя. Ще изпратим писмо с линк за нова парола на имейла на родителя.'}</p>
        <label>Потребителско име или имейл<input name="login" maxlength="120" required></label><p class="qx-err"></p><button class="qx-btn gold">Изпрати писмо</button>`
      : '<p>Помоли родител или учител да ни пише от <a href="/privacy.html">страницата за поверителност</a> и ще ти помогнем.</p>'}
      <button class="qx-linkbtn" type="button" data-back>← Назад към входа</button></form>`, 'narrow');
    q('[data-back]', m).onclick = () => showAuth('login');
    q('form', m).onsubmit = async (e) => {
      e.preventDefault(); const err = q('.qx-err', m);
      try { await call('/api/account/forgot', { login: e.target.login.value }); q('form', m).innerHTML = '<p>📧 Ако има профил с това име или имейл, родителят ще получи писмо до минута. Линкът важи 1 час.</p><button class="qx-btn gold" type="button" data-ok>Добре</button>'; q('[data-ok]', m).onclick = () => showAuth('login'); } catch (x) { err.textContent = x.message; }
    };
  }

  // ---------- профил ----------
  function showProfile(tab = 'stats') {
    if (!me) return showAuth('login');
    const pct = me.answers ? Math.round((100 * me.correct) / me.answers) : 0;
    const earned = me.badges.filter((b) => b.at).length;
    const m = open('Моят профил', `
      <div class="qx-hero">${avatar(me.avatar, 84)}<div><div class="qx-name">${esc(me.name)}</div><div class="qx-title">Ниво ${me.level} · ${esc(me.title)}</div>
        <div class="qx-level"><i style="width:${me.progress}%"></i></div><small>${me.xp - me.from} / ${me.to - me.from} точки опит до ниво ${me.level + 1}</small></div></div>
      <div class="qx-tabs"><button data-t="stats" class="${tab === 'stats' ? 'on' : ''}">📊 Успехи</button><button data-t="badges" class="${tab === 'badges' ? 'on' : ''}">🏅 Значки ${earned}/${me.badges.length}</button><button data-t="avatar" class="${tab === 'avatar' ? 'on' : ''}">🎨 Аватар</button><button data-t="flag">🚩 Знаме</button><button data-t="more" class="${tab === 'more' ? 'on' : ''}">⚙️</button></div>
      <div class="qx-pane" data-p="stats">
        <div class="qx-stats">${me.adult ? `<div><b>🪙 ${me.coins}</b>парички</div>` : ''}<div><b>${me.games}</b>игри</div><div><b>${me.wins}</b>победи</div><div><b>${pct}%</b>верни</div><div><b>🔥 ${me.streak}</b>дни подред</div><div><b>${me.week.xp}</b>опит тази седмица</div><div><b>${me.ranks.week ? '#' + me.ranks.week : '—'}</b>в класацията</div></div>
        ${Object.keys(me.subjects).length ? `<h3>По предмети</h3>${Object.entries(me.subjects).sort((a, b) => b[1].n - a[1].n).map(([s, v]) => `<div class="qx-sub"><span>${esc(SUBJ[s] || s)}</span><span class="qx-track"><i style="width:${Math.round((100 * v.ok) / v.n)}%"></i></span><b>${Math.round((100 * v.ok) / v.n)}%</b></div>`).join('')}` : '<p class="qx-note">Изиграй игра, за да видиш успехите си по предмети.</p>'}
        <p class="qx-note">Точки опит: ✅ верен отговор +10 · опит +2 · завършена игра +30 · победа +70 · първа игра за деня +20</p></div>
      <div class="qx-pane qx-hide" data-p="badges"><div class="qx-badges">${me.badges.map((b) => `<div class="qx-badge ${b.at ? '' : 'locked'}" title="${esc(b.desc)}"><span>${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join('')}</div></div>
      <div class="qx-pane qx-hide" data-p="avatar">
        <h3>Избери животно</h3><div class="qx-avs">${me.avatars.map((a) => `<button class="qx-pick ${me.avatarChoice.icon === a.icon && !me.avatar.photo ? 'on' : ''}" data-icon="${a.icon}" ${a.level > me.level ? `disabled title="Отключва се на ниво ${a.level}"` : ''}>${a.icon}${a.level > me.level ? `<small>🔒${a.level}</small>` : ''}</button>`).join('')}</div>
        <h3>Цвят</h3><div class="qx-colors">${me.colors.map((c) => `<button class="qx-color ${me.avatar.color === c ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="цвят"></button>`).join('')}</div>
        <h3>Или своя снимка</h3>
        <p class="qx-note">📷 Другите ще я видят, след като възрастен от екипа я одобри. Не слагай снимка на лицето си: по-добре рисунка, любима играчка или домашен любимец.</p>
        ${me.photoStatus === 'pending' ? '<p class="qx-note"><b>⏳ Снимката ти чака одобрение.</b></p>' : ''}${me.photoStatus === 'rejected' ? '<p class="qx-note"><b>Снимката не беше одобрена. Опитай с друга.</b></p>' : ''}
        <div class="qx-row"><label class="qx-btn">📁 Качи снимка<input type="file" accept="image/*" hidden data-photo></label>${me.photoStatus === 'off' || me.photoStatus === 'approved' ? `<button class="qx-btn" data-use-photo ${me.avatar.photo ? 'disabled' : ''}>${me.avatar.photo ? '✓ Ползваш снимката' : '🖼️ Ползвай одобрената снимка'}</button>` : ''}</div></div>
      <div class="qx-pane qx-hide" data-p="more">
        ${me.needsConsent ? `<div class="qx-tip">📧 ${me.adult ? 'Още не си потвърдил имейла си' : 'Родителят още не е потвърдил профила'} (писмо до ${esc(me.email)}). Дотогава не се показваш в класацията. <button class="qx-linkbtn" data-resend>Изпрати писмото пак</button></div>` : ''}
        ${me.adult ? '' : `<h3>🏫 Моят клас</h3>
        ${me.team ? `<p><b>${esc(me.team.name)}</b> · ${esc(me.team.school)}${me.team.town ? ', ' + esc(me.team.town) : ''}</p><button class="qx-btn" data-leave>Напусни класа</button>`
          : `<form class="qx-form qx-inline" data-team><input name="code" maxlength="8" placeholder="Код от учителя" required style="text-transform:uppercase"><button class="qx-btn gold">Влез в класа</button></form><p class="qx-note">С кода точките ти отиват и за класа в турнирите между училища.</p>`}`}
        ${me.adult ? `<p class="qx-note">Имейл: <b>${esc(me.email || '')}</b></p>
        <details class="qx-more"><summary>Смени имейла</summary><form class="qx-form" data-email><label>Нов имейл<input name="email" type="email" maxlength="120" required></label><label>Твоята парола<input name="password" type="password" autocomplete="current-password" required></label><p class="qx-err"></p><button class="qx-btn gold">Запази</button></form></details>` : `<h3>👪 За родителя</h3>
        ${me.email ? `<p class="qx-note">Имейл на родителя: <b>${esc(me.email)}</b>${me.consentAt ? ' ✅ потвърден' : ''}</p>` : ''}
        <div class="qx-row"><button class="qx-btn" data-parent>🔗 ${me.hasParentLink ? 'Копирай' : 'Направи'} линк за родител</button>${me.hasParentLink ? '<button class="qx-btn" data-parent-renew>🔄 Нов линк</button>' : ''}</div>
        ${me.email && me.mail ? `<label class="qx-check"><input type="checkbox" data-weekly ${me.weeklyMail ? 'checked' : ''}><span>Седмичен отчет на имейла всеки понеделник</span></label>` : ''}
        <details class="qx-more"><summary>Смени имейла на родителя</summary><form class="qx-form" data-email><label>Нов имейл<input name="email" type="email" maxlength="120" required></label><label>Твоята парола<input name="password" type="password" autocomplete="current-password" required></label><p class="qx-err"></p><button class="qx-btn gold">Запази</button></form></details>`}
        <form class="qx-form" data-pw><h3>Смени паролата</h3><label>Стара парола<input name="old" type="password" autocomplete="current-password" required></label><label>Нова парола<input name="password" type="password" autocomplete="new-password" required></label><p class="qx-err"></p><button class="qx-btn gold">Запази</button></form>
        ${me.adult ? `<h3>👨‍👧 Детски профили</h3>
        ${(me.children || []).length ? `<ul class="qx-kids">${me.children.map((c) => `<li><b>${esc(c.name)}</b>${c.grade ? ` · ${c.grade} клас` : ''} · ${c.games} игри <button class="qx-linkbtn" data-kid-del="${esc(c.id)}">Изтрий</button></li>`).join('')}</ul>` : '<p class="qx-note">Още няма добавени деца.</p>'}
        ${me.needsConsent ? '<p class="qx-note">Първо потвърди имейла си от писмото, за да добавяш деца.</p>' : `<details class="qx-more"><summary>➕ Добави детски профил</summary><form class="qx-form" data-kid><label>Потребителско име на детето<input name="name" maxlength="16" required placeholder="напр. Звездичка7"></label><label>Парола на детето<input name="password" type="password" maxlength="64" autocomplete="new-password" required></label><label>Клас<select name="grade"><option value="">—</option><option>1</option><option>2</option><option>3</option><option>4</option></select></label><p class="qx-note">Не е нужно ново потвърждение: твоят имейл вече е потвърден и важи и за децата. Детето влиза със своето име и парола, а седмичният отчет идва на твоя имейл. Без истинско име на детето!</p><p class="qx-err"></p><button class="qx-btn gold" type="submit">Добави</button></form></details>`}` : ''}
        <h3>🔒 Моите данни</h3>
        <div class="qx-row"><a class="qx-btn" href="/api/account/export" download>⬇️ Изтегли данните</a><a class="qx-btn" href="${me.adult ? '/privacy-adult.html' : '/privacy.html'}" target="_blank">Поверителност</a></div>
        <details class="qx-more"><summary>Изтрий профила завинаги</summary><form class="qx-form" data-del><p class="qx-note">Нивата, значките и резултатите ще изчезнат завинаги. Можеш да продължиш да играеш като гост.</p><label>Паролата ти<input name="password" type="password" autocomplete="current-password" required></label><p class="qx-err"></p><button class="qx-btn" style="color:var(--bad)">🗑 Изтрий профила</button></form></details>
        <button class="qx-btn" data-logout style="margin-top:14px">🚪 Изход от профила</button></div>`);
    const show = (t) => { if (t === 'flag') { if (window.ZAdult) window.ZAdult.openFlag(me); return; } m.querySelectorAll('.qx-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); m.querySelectorAll('.qx-pane').forEach((p) => p.classList.toggle('qx-hide', p.dataset.p !== t)); };
    show(tab);
    q('.qx-tabs', m).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) show(b.dataset.t); };
    let color = me.avatar.color || me.colors[0];
    const setAvatar = async (body) => { try { me = (await call('/api/account/avatar', body)).user; renderBar(); showProfile('avatar'); } catch (x) { flash(x.message); } };
    m.addEventListener('click', async (e) => {
      const ic = e.target.closest('[data-icon]'); if (ic) return setAvatar({ icon: ic.dataset.icon, color });
      const c = e.target.closest('[data-color]'); if (c) { color = c.dataset.color; return setAvatar({ icon: me.avatarChoice.icon || me.avatar.icon || me.avatars[0].icon, color }); }
      if (e.target.closest('[data-use-photo]')) return setAvatar({ photo: true });
      if (e.target.closest('[data-leave]')) { try { me = (await call('/api/account/team', { leave: true })).user; showProfile('more'); } catch (x) { flash(x.message); } return; }
      if (e.target.closest('[data-resend]')) { try { await call('/api/account/consent-resend', {}); flash('Изпратихме писмото пак. 📧'); } catch (x) { flash(x.message); } return; }
      const par = e.target.closest('[data-parent],[data-parent-renew]');
      if (par) {
        try {
          const { token } = await call('/api/account/parent-link', { renew: par.hasAttribute('data-parent-renew') });
          const link = location.origin + '/parent.html#' + token;
          me.hasParentLink = true;
          try { await navigator.clipboard.writeText(link); flash('Линкът е копиран. Изпрати го на мама или татко. 👪'); } catch { prompt('Копирай този линк и го дай на родител:', link); }
          showProfile('more');
        } catch (x) { flash(x.message); }
        return;
      }
      const kd = e.target.closest('[data-kid-del]');
      if (kd) {
        const pw = prompt('Въведи твоята парола, за да изтриеш профила на детето (не може да се върне):'); if (!pw) return;
        try { me = (await call('/api/account/child/delete', { id: kd.dataset.kidDel, password: pw })).user; flash('Детският профил е изтрит.'); showProfile('more'); } catch (x) { flash(x.message); }
        return;
      }
      if (e.target.closest('[data-logout]')) { await call('/api/account/logout', {}).catch(() => {}); me = null; ss.set('quizzard-guest', null); renderBar(); close(); reconnect(); gateUpdate(); }
    });
    q('[data-photo]', m).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const data = await shrink(f); me = (await call('/api/account/photo', { data })).user; flash('Снимката е изпратена за одобрение. 👍'); showProfile('avatar'); } catch (x) { flash(x.message || 'Снимката не става. Опитай с друга.'); }
    };
    q('[data-team]', m)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const r = await call('/api/account/team', { code: e.target.code.value }); me = r.user; flash(`Добре дошъл в ${r.team.name}! 🏫`); showProfile('more'); } catch (x) { flash(x.message); }
    });
    q('[data-weekly]', m)?.addEventListener('change', async (e) => { try { me = (await call('/api/account/weekly', { on: e.target.checked })).user; flash(e.target.checked ? 'Седмичният отчет е включен.' : 'Седмичният отчет е спрян.'); } catch (x) { flash(x.message); } });
    q('[data-kid]', m)?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const err = q('[data-kid] .qx-err', m);
      try { const r = await call('/api/account/child', { name: f.name, password: f.password, grade: Number(f.grade) || null }); me = r.user; flash(`Профилът „${r.child.name}“ е добавен. 🎉`); showProfile('more'); } catch (x) { err.textContent = x.message; }
    });
    q('[data-email]', m).onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const err = q('[data-email] .qx-err', m);
      try { me = (await call('/api/account/email', f)).user; flash(me.needsConsent ? 'Имейлът е сменен. Изпратихме писмо за потвърждение.' : 'Имейлът е сменен.'); showProfile('more'); } catch (x) { err.textContent = x.message; }
    };
    q('[data-del]', m).onsubmit = async (e) => {
      e.preventDefault(); const err = q('[data-del] .qx-err', m);
      if (!confirm('Сигурен ли си? Това не може да се върне.')) return;
      try { await call('/api/account/delete', { password: e.target.password.value }); me = null; ss.set('quizzard-guest', null); renderBar(); close(); reconnect(); gateUpdate(); flash('Профилът е изтрит.'); } catch (x) { err.textContent = x.message; }
    };
    q('[data-pw]', m).onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const err = q('[data-pw] .qx-err', m);
      try { await call('/api/account/password', f); flash('Паролата е сменена.'); e.target.reset(); err.textContent = ''; } catch (x) { err.textContent = x.message; }
    };
  }
  // Смалява снимката до 128×128 (и маха скритите данни в нея, напр. къде е снимана)
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = 128, c = document.createElement('canvas'); c.width = s; c.height = s;
        const k = Math.min(img.width, img.height), x = (img.width - k) / 2, y = (img.height - k) / 2;
        c.getContext('2d').drawImage(img, x, y, k, k, 0, 0, s, s);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Това не е снимка.'));
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- класация ----------
  const BOARDS = { week: ['🔥 Седмица', 'опит'], xp: ['⭐ Ниво', 'опит'], wins: ['🏆 Победи', 'победи'], accuracy: ['🎯 Точност', '%'], cup: ['🏫 Турнир', ''] };
  const ADULT_BOARDS = { week: BOARDS.week, xp: BOARDS.xp, wins: BOARDS.wins, accuracy: BOARDS.accuracy, coins: ['🪙 Парички', 'парички'] };
  async function showBoard(kind = 'week') {
    const adult = adultMode();
    const m = open(adult ? '🏆 Класация · Възрастни' : '🏆 Класация', `<div class="qx-tabs">${Object.entries(adult ? ADULT_BOARDS : BOARDS).map(([k, v]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${v[0]}</button>`).join('')}</div><div class="qx-list">Зареждане…</div>`);
    q('.qx-tabs', m).onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) showBoard(b.dataset.k); };
    if (kind === 'cup') return showCup(m);
    try {
      const d = await call('/api/leaderboard?kind=' + kind + (adult ? '&aud=adult' : ''));
      const medal = (p) => ['🥇', '🥈', '🥉'][p - 1] || p;
      const sub = { week: 'Най-активните тази седмица (започва отначало всеки понеделник)', xp: 'Най-високо ниво', wins: 'Най-много победи', accuracy: 'Най-точни (поне 50 отговора)', coins: 'Най-много парички' }[kind];
      q('.qx-list', m).innerHTML = `<p class="qx-note">${sub}</p>` + (d.top.length ? d.top.map((r) => `<div class="qx-rank ${me && r.name === me.name ? 'me' : ''}"><span class="qx-place">${medal(r.place)}</span>${avatar(r.avatar, 36)}<span class="qx-rname">${esc(r.name)}<small>ниво ${r.level} · ${r.badges} 🏅</small></span>${r.flag && window.ZFlag ? ZFlag.svg(r.flag, 30) : ''}<b>${r.value}${kind === 'accuracy' ? '%' : ''}</b></div>`).join('')
        : '<p class="qx-note">Още никой не е в класацията. Бъди първият! 🚀</p>') +
        (d.me ? `<p class="qx-note"><b>${d.me.place ? `Ти си на ${d.me.place} място.` : 'Изиграй игра, за да влезеш в класацията.'}</b></p>` : '<p class="qx-note">Влез в профила си, за да участваш в класацията. Без профил играеш като гост.</p>');
    } catch (x) { q('.qx-list', m).textContent = x.message; }
  }

  // Турнир между класове и училища
  async function showCup(m) {
    const box = q('.qx-list', m);
    try {
      const { tournament: t } = await call('/api/tournament');
      if (!t) { box.innerHTML = '<p class="qx-note">В момента няма турнир. Помоли учителя да запише класа ви! Когато започне турнир, тук ще видиш класирането на класовете и училищата.</p>'; return; }
      const d = (x) => new Date(x).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long' });
      const unit = t.scoring === 'avg' ? 'опит на дете' : 'опит';
      const medal = (p) => ['🥇', '🥈', '🥉'][p - 1] || p;
      let tab = 'teams';
      const draw = () => {
        const rows = tab === 'teams' ? t.teams.map((x) => `<div class="qx-rank ${t.myTeam && x.id === t.myTeam.id ? 'me' : ''}"><span class="qx-place">${medal(x.place)}</span><span class="qx-rname">${esc(x.name)}<small>${esc(x.school)}${x.town ? ', ' + esc(x.town) : ''} · ${x.players} деца</small></span><b>${x.value}</b></div>`)
          : t.schools.map((x) => `<div class="qx-rank ${t.myTeam && x.school === t.myTeam.school ? 'me' : ''}"><span class="qx-place">${medal(x.place)}</span><span class="qx-rname">${esc(x.school)}<small>${x.town ? esc(x.town) + ' · ' : ''}${x.classes} класа · ${x.players} деца</small></span><b>${x.value}</b></div>`);
        box.innerHTML = `<h3 style="margin-top:0">${esc(t.name)}</h3>
          <p class="qx-note">${{ live: '🟢 Тече сега', soon: '⏳ Предстои', over: '🏁 Завърши' }[t.status]} · ${d(t.start)} – ${d(t.end)}${t.grades.length ? ' · ' + t.grades.join(', ') + ' клас' : ''} · класиране по ${unit}</p>
          ${t.mine ? `<div class="qx-tip">🏫 Твоят клас ${esc(t.myTeam.name)} е на <b>${t.mine.place} място</b>. Ти си донесъл <b>${t.myPoints}</b> точки.</div>` : t.myTeam ? (t.eligible ? `<div class="qx-tip">🏫 Играй, за да донесеш първите точки за ${esc(t.myTeam.name)}!</div>` : '<div class="qx-tip">Този турнир е за други класове.</div>') : `<div class="qx-tip">${me ? 'Въведи кода на класа си в Профил → ⚙️, за да играеш за класа си.' : 'Влез в профила си и въведи кода на класа от учителя, за да играеш за класа си.'}</div>`}
          <div class="qx-cats"><button data-v="teams" class="${tab === 'teams' ? 'on' : ''}">Класове</button><button data-v="schools" class="${tab === 'schools' ? 'on' : ''}">Училища</button></div>
          ${rows.length ? rows.join('') : '<p class="qx-note">Още няма точки. Първият верен отговор слага класа ти в класацията!</p>'}`;
      };
      box.onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { tab = b.dataset.v; draw(); } };
      draw();
    } catch (x) { box.textContent = x.message; }
  }

  // ---------- идеи ----------
  const voter = ls.get('quizzard-voter') || (() => { const v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); ls.set('quizzard-voter', v); return v; })();
  const STATUS = { new: '⏳ Чака преглед', published: '📢 Публикувана', planned: '🛠️ Ще я направим!', done: '✅ Направена!', rejected: '🙏 Този път не' };
  async function showIdeas() {
    const m = open('💡 Идеи за играта', `<form class="qx-form" data-idea>
        <p class="qx-note">Какво да добавим или подобрим? Всяка идея се чете! Най-хубавите показваме тук, за да гласуват и другите.</p>
        <div class="qx-cats"></div>
        <textarea name="text" rows="3" maxlength="600" required placeholder="Моята идея е…"></textarea>
        <p class="qx-err"></p><button class="qx-btn gold">Изпрати идеята</button></form>
      <div class="qx-mine"></div><h3>Идеи на други деца</h3><div class="qx-ideas">Зареждане…</div>`);
    let cat = 'feature';
    const load = async () => {
      const d = await call('/api/ideas?voter=' + voter);
      q('.qx-cats', m).innerHTML = Object.entries(d.categories).map(([k, v]) => `<button type="button" data-cat="${k}" class="${k === cat ? 'on' : ''}">${v}</button>`).join('');
      const card = (i, mine) => `<div class="qx-idea"><div>${esc(i.text)}</div>${i.reply ? `<div class="qx-reply">💬 ${esc(i.reply)}</div>` : ''}<div class="qx-idea-foot"><small>${STATUS[i.status] || ''}${i.by && !mine ? ' · ' + esc(i.by) : ''}</small>${mine ? '' : `<button class="qx-like ${i.liked ? 'on' : ''}" data-like="${i.id}">👍 ${i.likes}</button>`}</div></div>`;
      q('.qx-mine', m).innerHTML = d.mine.length ? `<h3>Моите идеи</h3>${d.mine.map((i) => card(i, true)).join('')}` : '';
      q('.qx-ideas', m).innerHTML = d.items.length ? d.items.map((i) => card(i)).join('') : '<p class="qx-note">Още няма публикувани идеи. Твоята може да е първата!</p>';
    };
    m.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; m.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('on', b === c)); }
      const l = e.target.closest('[data-like]');
      if (l) { try { const r = await call(`/api/ideas/${l.dataset.like}/like`, { voter }); l.classList.toggle('on', r.liked); l.textContent = `👍 ${r.likes}`; } catch (x) { flash(x.message); } }
    });
    q('[data-idea]', m).onsubmit = async (e) => {
      e.preventDefault(); const err = q('.qx-err', m); err.textContent = '';
      try { await call('/api/ideas', { text: e.target.text.value, category: cat }); e.target.reset(); flash('Благодарим за идеята! 💡'); load(); } catch (x) { err.textContent = x.message; }
    };
    load().catch((x) => { q('.qx-ideas', m).textContent = x.message; });
  }

  // ---------- нови значки и ново ниво ----------
  let shownLevel = null;
  async function celebrate() {
    if (!me) return;
    const lvlUp = shownLevel != null && me.level > shownLevel;
    shownLevel = me.level;
    if (!me.newBadges.length && !lvlUp) return;
    if (q('.qx-back')) return; // не прекъсваме отворен прозорец
    const m = open('🎉 Браво!', `<div class="qx-celebrate">${lvlUp ? `<div class="qx-big">⭐</div><h3>Ниво ${me.level}: ${esc(me.title)}!</h3>` : ''}
      ${me.newBadges.map((b) => `<div class="qx-badge"><span>${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join('')}
      <button class="qx-btn gold" data-ok>Супер!</button></div>`, 'narrow');
    q('[data-ok]', m).onclick = close;
    call('/api/account/seen', {}).catch(() => {});
    me.newBadges = [];
  }
  // Проверка за нови значки след игра: когато се върнеш на началния екран или в стаята
  let wasHidden = home.classList.contains('hidden');
  new MutationObserver(() => {
    const hidden = home.classList.contains('hidden');
    if (wasHidden && !hidden) { loadMe(); status(); }
    if (hidden) note.classList.add('qx-hide');
    gateUpdate();
    wasHidden = hidden;
  }).observe(home, { attributes: true, attributeFilter: ['class'] });
  const inGame = () => q('#game') && !q('#game').classList.contains('hidden');
  setInterval(() => { if (me && !document.hidden && !inGame()) loadMe(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadMe(); });

  // ---------- съобщение от администратора ----------
  const note = document.createElement('div');
  note.className = 'qx-notice qx-hide';
  document.body.append(note);
  async function status() {
    try {
      const s = await call('/api/status');
      mailOn = !!s.mail;
      const msg = s.maintenance ? { text: s.maintenance, kind: 'warn' } : s.announcement;
      const key = msg ? msg.kind + ':' + msg.text : '';
      if (!msg || inGame() || ls.get('quizzard-notice-closed') === key) { note.classList.add('qx-hide'); return; }
      note.className = 'qx-notice ' + msg.kind;
      note.innerHTML = `<span>${{ info: 'ℹ️', party: '🎉', warn: '⚠️' }[msg.kind] || 'ℹ️'} ${esc(msg.text)}</span>${s.maintenance ? '' : '<button aria-label="Затвори">✕</button>'}`;
      const b = q('button', note); if (b) b.onclick = () => { ls.set('quizzard-notice-closed', key); note.classList.add('qx-hide'); };
    } catch {}
  }
  status(); setInterval(status, 60000);
  loadMe();
})();
