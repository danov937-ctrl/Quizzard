// Знаменосци: реклами само извън играта (начален екран и стая), никога по време на въпрос или на картата.
// Настройките идват от сървъра (/ads-config.js), за да се сменят в Render без промяна на кода:
//   ADSENSE_CLIENT=ca-pub-…  + ADSENSE_SLOT_HOME / ADSENSE_SLOT_LOBBY  → Google AdSense. Гост, дете и всеки неразпознат получават маркировка „дете“
//     (без персонализирани реклами). Само профил на възрастен (пълнолетие и имейл са потвърдени) получава обичайни реклами, които
//     Google персонализира само със съгласие (в ЕС Google показва собствен прозорец за съгласие).
//   SPONSOR_IMG + SPONSOR_URL (+ SPONSOR_ALT)                         → банер на спонсор, без бисквитки и без чужди скриптове
// Без настройки не се показва нищо.
(function () {
  const cfg = window.QZ_ADS || {};
  const slots = document.querySelectorAll('.ad-slot');
  // В приложението (Google Play / App Store) реклами няма: правилата за детски приложения не позволяват реклами от уеб мрежи.
  // Същата проверка като `inApp` в client.js; повтаря се тук, за да работи и без нея.
  const inAppView = (typeof inApp !== 'undefined' && inApp) || document.referrer.startsWith('android-app://') || window.navigator.standalone
    || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  if (!slots.length || inAppView) return;

  if (cfg.sponsor && cfg.sponsor.img) {
    for (const el of slots) {
      const a = document.createElement('a');
      a.href = cfg.sponsor.url || '#'; a.target = '_blank'; a.rel = 'noopener sponsored';
      const img = document.createElement('img');
      img.src = cfg.sponsor.img; img.alt = cfg.sponsor.alt || 'Спонсор'; img.loading = 'lazy';
      a.appendChild(img); el.appendChild(a); el.classList.add('on');
    }
    return;
  }

  if (!cfg.client) return;
  // Профил на възрастен: пълнолетие и имейл са потвърдени. Гост в раздела „Възрастни“ не се брои: възрастта му не е проверена.
  const adultViewer = () => !!(window.qzMe && window.qzMe.adult && !window.qzMe.needsConsent);
  let loaded = false;
  function loadScript() {
    if (loaded) return; loaded = true;
    // По подразбиране реклами без персонализация: играчите са деца (до 14 г. в България е нужно съгласие на родител).
    // За възрастен профил флагът се сменя в fill(), преди всяка заявка.
    (window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = 1;
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.client);
    document.head.appendChild(s);
  }
  // Рекламата се зарежда чак когато мястото ѝ се покаже (началният екран е видим веднага, стаята по-късно).
  function fill(el) {
    const slot = cfg.slots && cfg.slots[el.dataset.ad];
    if (!slot || el.dataset.filled) return;
    const adult = adultViewer();
    el.dataset.filled = adult ? 'adult' : 'kid';
    loadScript();
    (window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = adult ? 0 : 1;
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.dataset.adClient = cfg.client;
    ins.dataset.adSlot = slot;
    ins.dataset.adFormat = 'horizontal';
    ins.dataset.fullWidthResponsive = 'true';
    ins.dataset.tagForAgeTreatment = adult ? '0' : '1'; // TFAT: 1 = „дете“ (без персонализация и ремаркетинг), 0 = без специално третиране (възрастен профил)
    el.appendChild(ins); el.classList.add('on');
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* блокер на реклами */ }
  }
  const visible = (el) => !el.closest('.screen.hidden');
  // Първо трябва да се разбере кой играе (extras.js праща „qz:me“); ако отговорът се бави, се пуска детска реклама
  let waited = false;
  const check = () => { if (!waited && !window.qzMeKnown) return; for (const el of slots) if (visible(el)) fill(el); };
  setTimeout(() => { waited = true; check(); }, 3000);
  // Влизане или излизане от профил: реклама, показана за другия вид зрител, се маха и се зарежда наново със своята маркировка
  window.addEventListener('qz:me', () => {
    const now = adultViewer() ? 'adult' : 'kid';
    for (const el of slots) if (el.dataset.filled && el.dataset.filled !== now) { el.textContent = ''; el.classList.remove('on'); delete el.dataset.filled; }
    check();
  });
  check();
  new MutationObserver(check).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
})();
