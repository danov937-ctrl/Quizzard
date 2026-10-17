// Знаменосци · режим за възрастни: превключвател деца/възрастни, парички, магазин,
// реклами с награда и редактор на знамето. Зарежда се след client.js и extras.js.
(() => {
  'use strict';
  const q = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const home = q('#home');
  if (!home || !window.ZX) return;
  const { open, close, flash, call } = window.ZX;
  const MODE_KEY = 'zn-mode';
  let me = null;

  // ---------- текстове за двата режима ----------
  const TEXTS = [
    ['#home .tagline', 'Отговаряй на въпроси от история, география, кино и още, завладей България и прибери залога!'],
    ['.qx-gate .tagline', 'Отговаряй на въпроси от история, география, кино и още, завладей България и прибери залога!'],
    ['#btnQuick .mode-sub', 'Срещу играчи от цяла България. Залог 🪙100, победителят взима всичко.'],
    ['#btnFriends .mode-sub', 'Създай стая и кажи кода на приятелите си. Залогът е 🪙100.'],
    ['#btnBots .mode-sub', 'Тренирай срещу компютъра, без залог.'],
    ['#btnPractice .mode-sub', 'Въпроси по категория, без противници и без бързане.'],
  ];
  const kidText = TEXTS.map(([sel]) => q(sel)?.textContent || '');
  const nameInput = q('#name'), kidPlaceholder = nameInput?.placeholder || '';

  // Превключвател „Деца / Възрастни“ (крие се, когато си влязъл: режимът идва от профила)
  const switchHtml = () => `<div class="zn-mode" role="tablist" aria-label="Режим"><button type="button" data-mode="kids">👧 Деца · 1–4 клас</button><button type="button" data-mode="adult">🧑 Възрастни</button></div>`;
  const setup = q('.panel.setup', home);
  setup?.insertAdjacentHTML('afterbegin', switchHtml());
  const gateBox = q('.qx-gate-box');
  q('.qx-gate-btns', gateBox || document)?.insertAdjacentHTML('beforebegin', switchHtml());
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.zn-mode [data-mode]');
    if (!b || (me && !me.adult === (b.dataset.mode === 'kids'))) return;
    ls.set(MODE_KEY, b.dataset.mode); apply();
  });

  // Монетите и знамето на началния екран
  const wallet = document.createElement('div');
  wallet.className = 'zn-wallet hidden';
  home.append(wallet);
  wallet.addEventListener('click', (e) => { if (e.target.closest('[data-shop]')) openShop(); if (e.target.closest('[data-flag]')) openFlag(); });
  q('.home-links', home)?.insertAdjacentHTML('afterbegin', '<button class="link hidden" data-flagl>🚩 Моето знаме</button>');
  q('[data-flagl]', home)?.addEventListener('click', () => openFlag());

  const isAdult = () => (me ? !!me.adult : ls.get(MODE_KEY) === 'adult');
  function apply() {
    const adult = isAdult();
    document.body.classList.toggle('mode-adult', adult);
    for (const el of document.querySelectorAll('.zn-mode')) {
      el.classList.toggle('hidden', !!me);
      for (const b of el.querySelectorAll('[data-mode]')) b.classList.toggle('on', (b.dataset.mode === 'adult') === adult);
    }
    TEXTS.forEach(([sel, txt], i) => { const el = q(sel); if (el && !(sel.includes('tagline') && document.documentElement.dataset.season === 'xmas')) el.textContent = adult ? txt : kidText[i]; });
    if (nameInput && !nameInput.readOnly) nameInput.placeholder = adult ? 'напр. Знаменосец' : kidPlaceholder;
    const gradeRow = q('#homeGrade')?.closest('.setup-row'); if (gradeRow) gradeRow.classList.toggle('hidden', adult);
    for (const a of document.querySelectorAll('a[href="/privacy.html"]')) { a.dataset.kid ||= a.textContent; a.href = adult ? '/privacy-adult.html' : '/privacy.html'; a.textContent = adult ? '🔒 Поверителност' : a.dataset.kid; }
    for (const a of document.querySelectorAll('a[href="/privacy-adult.html"]')) if (!adult) { a.href = '/privacy.html'; if (a.dataset.kid) a.textContent = a.dataset.kid; }
    const note = q('.qx-gate-note'); if (note) { note.dataset.kid ||= note.textContent; note.textContent = adult ? 'Като гост играеш с ботове и с приятели без залог. За онлайн игри със залог и парички трябва профил за възрастни.' : note.dataset.kid; }
    // Предизвикателството на деня се брои отделно за всеки режим (client.js)
    try { DAILY_KEY = adult ? 'zn-daily-adult' : 'quizzard-daily'; renderDailyTile(); } catch {}
    const meta = q('meta[name="theme-color"]'); if (meta && document.documentElement.dataset.season !== 'xmas') meta.content = adult ? '#10151f' : '#0e2a4a';
    renderWallet();
  }
  function renderWallet() {
    const show = !!me?.adult;
    wallet.classList.toggle('hidden', !me);
    q('[data-flagl]', home)?.classList.toggle('hidden', !me);
    if (!me) { wallet.innerHTML = ''; return; }
    wallet.innerHTML = (show ? `<button class="zn-coin-chip" data-shop title="Парички и магазин">🪙 <b>${me.coins}</b><span>＋</span></button>` : '') +
      `<button class="zn-flag-chip" data-flag title="Моето знаме">${window.ZFlag ? ZFlag.svg(me.flag || null, 34) : '🚩'}</button>`;
  }
  window.addEventListener('zn:me', (e) => { me = e.detail; apply(); });
  apply();

  // ---------- магазин и реклами с награда ----------
  async function openShop() {
    let w;
    try { w = await call('/api/coins'); } catch (x) { return flash(x.message); }
    const when = (t) => new Date(t).toLocaleString('bg-BG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const m = open('🪙 Парички', `<div class="zn-bal"><span>Имаш</span><b>🪙 ${w.coins}</b><small>Залогът за игра е ${w.stake}. Победителят взима залозите на другите.</small></div>
      <h3>📺 Гледай реклама</h3>
      <div class="zn-ad"><div><b>+${w.ads.reward} парички</b> за всяка реклама<small>Остават ${w.ads.left} от ${w.ads.perDay} за днес</small></div>
        <button class="qx-btn gold" data-ad ${w.ads.mode === 'off' || !w.ads.left ? 'disabled' : ''}>${w.ads.mode === 'off' ? 'Скоро' : w.ads.left ? '▶ Гледай' : 'Утре пак'}</button></div>
      <h3>🛒 Магазин</h3>
      <div class="zn-packs">${w.packs.map((p) => `<div class="zn-pack"><span class="zn-pack-coins">🪙 ${p.coins.toLocaleString('bg-BG')}</span>${p.bonus ? `<span class="zn-bonus">${p.bonus}</span>` : ''}<button class="qx-btn ${w.shop ? 'gold' : ''}" data-buy="${p.id}" ${w.shop ? '' : 'disabled'}>${w.shop ? p.price : 'Скоро'}</button></div>`).join('')}</div>
      ${w.shop ? '' : '<p class="qx-note">Плащанията ще бъдат включени скоро. Дотогава печели парички с победи и реклами.</p>'}
      <p class="qx-note">Паричките са само за игра: не се обменят обратно в пари, не се теглят и не се прехвърлят на други играчи.</p>
      ${w.log.length ? `<details class="qx-more"><summary>История</summary><div class="zn-log">${w.log.map((l) => `<div><span>${esc(l.why)}<small>${when(l.at)}</small></span><b class="${l.d < 0 ? 'neg' : ''}">${l.d > 0 ? '+' : ''}${l.d}</b></div>`).join('')}</div></details>` : ''}`, 'narrow');
    q('[data-ad]', m)?.addEventListener('click', () => watchAd(w));
  }
  // Пробна реклама (REWARDED_ADS=test): брояч, после наградата. С истинска мрежа тук идва нейният плейър.
  async function watchAd(w) {
    let start;
    try { start = await call('/api/coins/ad/start', {}); } catch (x) { return flash(x.message); }
    let left = Math.ceil(start.minSec);
    const m = open('📺 Реклама', `<div class="zn-adplay"><div class="zn-adbox">Пробна реклама<br><small>Тук ще се показва реклама от рекламната мрежа.</small></div><p class="zn-adleft">Наградата идва след <b>${left}</b> сек.</p><button class="qx-btn gold" data-claim disabled>Вземи +${w.ads.reward} 🪙</button></div>`, 'narrow');
    const t = setInterval(() => {
      left--;
      const el = q('.zn-adleft b', m); if (el) el.textContent = Math.max(0, left);
      if (left <= 0) { clearInterval(t); const b = q('[data-claim]', m); if (b) b.disabled = false; }
      if (!document.body.contains(m)) clearInterval(t);
    }, 1000);
    q('[data-claim]', m).onclick = async () => {
      try { const r = await call('/api/coins/ad/done', { token: start.token }); flash(`+${w.ads.reward} парички! Имаш 🪙 ${r.coins}.`); window.ZX.reload(); openShop(); } catch (x) { flash(x.message); }
    };
  }

  // ---------- знаме ----------
  const NAMES = { h3: 'Три ленти', v3: 'Три колони', h2: 'Две ленти', v2: 'Две колони', diag: 'Диагонал', cross: 'Кръст', nordic: 'Скандинавски', chevron: 'Клин', solid: 'Едноцветно' };
  async function openFlag(user) {
    if (!me && !user) return;
    const u = user || me;
    const o = u.flagOptions;
    const f = { pattern: u.flag?.pattern || 'h3', colors: (u.flag?.colors || ['#ffffff', '#00966e', '#d62828']).slice(), emblem: u.flag?.emblem ?? '' };
    let slot = 0;
    const m = open('🚩 Моето знаме', '<div class="zn-flagedit"></div>', 'narrow');
    const box = q('.zn-flagedit', m);
    const render = () => {
      box.innerHTML = `<div class="zn-flag-preview">${ZFlag.svg(f, 180)}</div>
        <p class="qx-note">Знамето ти се вижда на замъка в столицата ти, в стаята и в класацията.</p>
        <h3>Шарка</h3><div class="zn-patterns">${o.patterns.map((p) => `<button type="button" class="${f.pattern === p ? 'on' : ''}" data-p="${p}" title="${NAMES[p] || p}">${ZFlag.svg({ pattern: p, colors: f.colors }, 44)}</button>`).join('')}</div>
        <h3>Цветове</h3><div class="zn-slots">${[0, 1, 2].map((i) => `<button type="button" class="${slot === i ? 'on' : ''}" data-slot="${i}"><i style="background:${f.colors[i]}"></i>${i + 1}</button>`).join('')}</div>
        <div class="qx-colors zn-colors">${o.colors.map((c) => `<button type="button" class="qx-color ${f.colors[slot] === c ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="цвят"></button>`).join('')}</div>
        <h3>Емблема</h3><div class="zn-emblems">${o.emblems.map((e) => `<button type="button" class="${f.emblem === e.icon ? 'on' : ''}" data-e="${esc(e.icon)}" ${e.level > u.level ? `disabled title="Отключва се на ниво ${e.level}"` : ''}>${e.icon || '∅'}${e.level > u.level ? `<small>🔒${e.level}</small>` : ''}</button>`).join('')}</div>
        <p class="qx-err"></p><button class="qx-btn gold" data-save style="width:100%">Запази знамето</button>`;
    };
    render();
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.p) f.pattern = b.dataset.p;
      else if (b.dataset.slot) slot = +b.dataset.slot;
      else if (b.dataset.c) f.colors[slot] = b.dataset.c;
      else if (b.dataset.e !== undefined) f.emblem = b.dataset.e;
      else if (b.hasAttribute('data-save')) {
        try { await call('/api/account/flag', f); flash('Знамето е запазено! 🚩'); close(); window.ZX.reload(); } catch (x) { q('.qx-err', box).textContent = x.message; }
        return;
      } else return;
      render();
    });
  }
  window.ZAdult = { openFlag, openShop };
})();
