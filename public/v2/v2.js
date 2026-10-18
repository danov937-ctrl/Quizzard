// Знаменосци · нов вид: малки интерактивни детайли. Работи само при data-design="v2" (виж design.js).
(() => {
  'use strict';
  const root = document.documentElement;
  if (root.dataset.design !== 'v2') return;
  const q = (s, el = document) => el.querySelector(s);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Цвят на лентата на браузъра
  const meta = q('meta[name="theme-color"]');
  if (meta && root.dataset.season !== 'xmas') meta.content = '#1f5a8f';

  // Връзка за връщане към стария вид (докато новият е в преглед)
  const links = q('.home-links');
  if (links && !q('.v2-back', links)) links.insertAdjacentHTML('beforeend', '<a class="link v2-back" href="/?design=old">🎨 Върни стария вид</a>');

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
})();
