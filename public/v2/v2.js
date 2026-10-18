// Знаменосци · нов вид: малки интерактивни детайли. Работи само при data-design="v2" (виж design.js).
(() => {
  'use strict';
  const root = document.documentElement;
  if (root.dataset.design !== 'v2') return;
  const q = (s, el = document) => el.querySelector(s);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Светулки в небето (само украса)
  const sky = q('.bg');
  if (sky && !reduce) for (let i = 0; i < 12; i++) {
    const f = document.createElement('i');
    f.className = 'fly';
    f.style.cssText = `left:${(Math.random() * 96 + 2).toFixed(1)}%;top:${(38 + Math.random() * 58).toFixed(1)}%;--x:${(Math.random() * 90 - 20).toFixed(0)}px;--y:${(-30 - Math.random() * 90).toFixed(0)}px;--d:${(9 + Math.random() * 10).toFixed(1)}s;--w:-${(Math.random() * 10).toFixed(1)}s`;
    sky.append(f);
  }

  // Цвят на лентата на браузъра
  const meta = q('meta[name="theme-color"]');
  if (meta && root.dataset.season !== 'xmas') meta.content = '#5b3d86';

  // Допир: леко „тупване“ на телефон (не при намалено движение)
  document.addEventListener('pointerdown', (e) => {
    if (reduce || !navigator.vibrate || !e.target.closest('.mode, .btn, .opts button, .seg button, .numpad button')) return;
    try { navigator.vibrate(8); } catch { /* не всички устройства го позволяват */ }
  }, { passive: true });

  // Логото „маха“ при докосване
  document.addEventListener('click', (e) => {
    const logo = e.target.closest('.brand-logo');
    if (!logo) return;
    logo.classList.remove('wave'); void logo.offsetWidth; logo.classList.add('wave');
  });

  // Кодът на стаята се копира с докосване
  document.addEventListener('click', async (e) => {
    const box = e.target.closest('.room-code');
    const code = box && box.textContent.replace(/\D/g, '');
    if (!code) return;
    try { await navigator.clipboard.writeText(code); } catch { return; }
    box.classList.add('copied');
    if (window.ZX && window.ZX.flash) window.ZX.flash('Кодът е копиран: ' + code);
    setTimeout(() => box.classList.remove('copied'), 1500);
  });
  // ---------- „Арена“: бързи бутони горе (награда, герой, отбор) и ежедневен сандък ----------
  const home = q('#home');
  const bar = home && q('.qx-account', home);
  let me = null;
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ZX = () => window.ZX || null;
  const clickQx = (name) => q(`[data-qx="${name}"]`, home)?.click();

  let dock = null;
  if (home && bar) {
    const top = document.createElement('div');
    top.className = 'v2-top';
    dock = document.createElement('div');
    dock.className = 'v2-dock';
    dock.innerHTML = `<button type="button" data-d="daily" aria-label="Ежедневен сандък"><i>🎁</i><span>Награда</span><b class="dot hidden"></b></button>
      <button type="button" data-d="hero" aria-label="Моят герой"><i>🧙</i><span>Герой</span></button>
      <button type="button" data-d="team" aria-label="Отбор и турнир"><i>🏫</i><span>Отбор</span><b class="dot live hidden"></b></button>`;
    home.prepend(top); top.append(dock, bar);
    // парички и знаме (adult.js) са в същата лента, за да не се застъпват с бутоните и профила
    const takeWallet = () => { const w = q('.zn-wallet', home); if (w && w.parentNode !== top) top.prepend(w); };
    takeWallet(); new MutationObserver(takeWallet).observe(home, { childList: true });
    dock.addEventListener('click', (e) => {
      const d = e.target.closest('[data-d]')?.dataset.d;
      if (!d) return;
      if (!me) { ZX()?.flash('Влез в профила си — и ще имаш герой, награди и отбор! 🎮'); clickQx('login'); return; }
      if (d === 'daily') openChest();
      else if (d === 'hero') { clickQx('profile'); setTimeout(() => q('.qx-back .qx-tabs [data-t="avatar"]')?.click(), 0); }
      else if (d === 'team') {
        if (me.team) { clickQx('board'); setTimeout(() => q('.qx-back .qx-tabs [data-k="cup"]')?.click(), 0); }
        else { clickQx('profile'); setTimeout(() => q('.qx-back .qx-tabs [data-t="more"]')?.click(), 0); }
      }
    });
  }
  function syncDock() {
    if (!dock) return;
    const adult = !!(me && me.adult) || document.body.classList.contains('mode-adult');
    q('[data-d="daily"] .dot', dock).classList.toggle('hidden', !(me && me.daily && !me.daily.claimedToday));
    q('[data-d="team"]', dock).classList.toggle('hidden', adult);
  }
  window.addEventListener('zn:me', (e) => { me = e.detail; syncDock(); });
  // идва ли турнир? — малка пулсираща точка върху „Отбор“
  fetch('/api/tournament', { credentials: 'same-origin' }).then((r) => r.json()).then((d) => {
    if (dock && d && d.tournament && d.tournament.status === 'live') q('[data-d="team"] .dot', dock).classList.remove('hidden');
  }).catch(() => {});
  new MutationObserver(syncDock).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // сандъкът: седем дни в кръг; всеки подред е по-богат, седмият е най-големият
  function openChest() {
    const z = ZX(), d = me && me.daily;
    if (!z || !d) { z && z.flash('Наградите идват скоро! 🎁'); return; }
    const days = d.rewards.map((xp, i) => {
      const n = i + 1, done = d.claimedToday ? n <= d.day : n < d.day, today = !d.claimedToday && n === d.day;
      return `<div class="v2-day ${done ? 'done' : ''} ${today ? 'today' : ''} ${n === 7 ? 'big' : ''}"><small>Ден ${n}</small><i>${done ? '✅' : n === 7 ? '💎' : '🎁'}</i><b>+${xp}</b></div>`;
    }).join('');
    const tomorrow = d.rewards[d.day % 7];
    const m = z.open('🎁 Ежедневен сандък', `<div class="v2-chest">
      <p class="v2-chest-sub">${d.claimedToday ? `Днешният сандък е отворен ✅ Утре те чака <b>+${tomorrow} ⭐</b>` : `Отвори сандъка и вземи <b>+${d.rewards[d.day - 1]} ⭐ опит</b>!`} ${d.run > 1 ? `<br>🔥 ${d.run} дни подред` : ''}</p>
      <div class="v2-days">${days}</div>
      <button type="button" class="v2-chest-btn" ${d.claimedToday ? 'disabled' : ''}><span class="v2-chest-ic">${d.claimedToday ? '📭' : '🎁'}</span><span>${d.claimedToday ? 'Ела утре' : 'Отвори сандъка'}</span></button>
      <div class="v2-chest-out" aria-live="polite"></div></div>`, 'v2-chest-modal');
    const btn = q('.v2-chest-btn', m), out = q('.v2-chest-out', m);
    btn.onclick = async () => {
      btn.disabled = true; btn.classList.add('shake');
      try {
        const r = await z.call('/api/account/daily', {});
        await new Promise((res) => setTimeout(res, reduce ? 0 : 650));
        btn.classList.remove('shake'); btn.classList.add('open'); q('.v2-chest-ic', btn).textContent = '🎉';
        q('span:last-child', btn).textContent = 'Взето! ✅'; q('.v2-chest-sub', m).textContent = 'Браво! Ела пак утре за по-голяма награда 🎁';
        const w = r.reward;
        out.innerHTML = `<div class="v2-win">+${w.xp} ⭐</div>${w.levelUp ? `<div class="v2-lvl">🎉 Ново ниво: ${w.levelUp}!</div>` : ''}${(w.badges || []).length ? '<div class="v2-lvl">🏅 Нова значка!</div>' : ''}`;
        if (!reduce) confetti(q('.v2-chest', m));
        try { if (navigator.vibrate) navigator.vibrate([12, 40, 18]); } catch { /* не всички устройства */ }
        z.reload();
      } catch (x) { btn.classList.remove('shake'); out.textContent = x.message; btn.disabled = false; }
    };
  }
  function confetti(box) {
    const colors = ['#27e1ff', '#ff3cac', '#ffd34d', '#b6ff3b', '#9b6bff', '#ff6a3d'];
    const wrap = document.createElement('div'); wrap.className = 'v2-confetti'; wrap.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 36; i++) {
      const p = document.createElement('i'), a = Math.random() * Math.PI * 2, r = 80 + Math.random() * 150;
      p.style.cssText = `--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r - 60}px;--rot:${Math.random() * 720 - 360}deg;background:${colors[i % colors.length]};animation-delay:${Math.random() * 120}ms`;
      wrap.append(p);
    }
    box.append(wrap); setTimeout(() => wrap.remove(), 1700);
  }
})();
