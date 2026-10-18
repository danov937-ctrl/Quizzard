// Знаменосци: измерване на реклама във Facebook и Instagram (Meta Pixel).
// Файлът не прави нищо, освен ако са верни ВСИЧКИ тези неща:
//   1. в Render е зададена META_PIXEL_ID (идва от /ads-config.js);
//   2. посетителят е дошъл от наша реклама: в адреса има fbclid или utm_source=facebook/instagram/fb/ig/meta;
//   3. не е в приложението (Google Play);
//   4. не е влязъл профил на дете;
//   5. родителят е натиснал „Съгласен съм“ в банера.
// При директно влизане, от Google, или от приложението пикселът не се зарежда и няма заявки към Facebook.
// Пращаме само няколко събития без данни: PlayClick, GameStart, GameFinished, CompleteRegistration (само за възрастен).
(function () {
  'use strict';
  window.qzTrack = function () {};   // докато не е разрешено, събитията се изхвърлят
  const ID = (window.QZ_ADS || {}).pixel;
  if (!/^\d{8,20}$/.test(ID || '')) return;

  const inAppView = (typeof inApp !== 'undefined' && inApp) || document.referrer.startsWith('android-app://') || window.navigator.standalone
    || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  if (inAppView) return;

  const store = (area) => ({
    get(k) { try { return window[area].getItem(k); } catch { return null; } },
    set(k, v) { try { window[area].setItem(k, v); } catch { /* частен режим */ } },
  });
  const ls = store('localStorage'), ss = store('sessionStorage');
  const KEY = 'qz-fb-consent';   // 'yes' | 'no'

  // Само посетители от нашата реклама (родители); адресът се пази за времето на посещението
  try {
    const p = new URLSearchParams(location.search);
    if (p.has('fbclid') || /^(facebook|instagram|fb|ig|meta)$/i.test(p.get('utm_source') || '')) ss.set('qz-from-ad', '1');
  } catch { /* стар браузър */ }
  if (ss.get('qz-from-ad') !== '1' || ls.get(KEY) === 'no') return;

  let known = false, on = false, off = false, banner = null;
  const once = new Set();
  const child = () => !!(window.qzMe && !window.qzMe.adult);

  function boot() {
    /* Стандартният код на Meta Pixel; автоматичното събиране на данни от страницата е изключено */
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = true; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('set', 'autoConfig', false, ID);
    window.fbq('init', ID);
    window.fbq('track', 'PageView');
  }
  const STANDARD = { CompleteRegistration: 1 };
  function enable() {
    if (on || off || !known || child()) return;
    on = true; boot();
    window.qzTrack = (name) => {
      if (!on || once.has(name)) return;   // всяко събитие най-много веднъж за посещение
      once.add(name);
      try { window.fbq(STANDARD[name] ? 'track' : 'trackCustom', name); } catch { /* блокер */ }
    };
  }
  function disable() {
    off = true; on = false; window.qzTrack = function () {};
    try { if (window.fbq) window.fbq('consent', 'revoke'); } catch { /* няма пиксел */ }
    if (banner) { banner.remove(); banner = null; }
  }

  function ask() {
    if (banner || on || off) return;
    banner = document.createElement('div');
    banner.className = 'qz-consent';
    banner.setAttribute('role', 'dialog'); banner.setAttribute('aria-label', 'Съгласие за Facebook пиксел');
    banner.innerHTML = '<p><b>Дошли сте от реклама във Facebook?</b> Може ли да използваме Facebook пиксел, за да виждаме колко реклами водят до игра? '
      + 'Пращаме само „натиснато Играй“, „започната игра“ и „завършена игра“, без имена, имейли и отговори. Не се пуска за влязъл профил на дете. '
      + 'Ако детето е под 14 години, съгласието се дава от родител. <a href="/privacy.html#facebook" target="_blank" rel="noopener">Повече</a></p>'
      + '<div class="qz-consent-btns"><button type="button" class="qx-btn gold" data-c="yes">Съгласен съм</button><button type="button" class="qx-btn" data-c="no">Не, благодаря</button></div>';
    banner.addEventListener('click', (e) => {
      const c = e.target.closest('[data-c]')?.dataset.c; if (!c) return;
      ls.set(KEY, c); banner.remove(); banner = null;
      if (c === 'yes') enable(); else off = true;
    });
    document.body.appendChild(banner);
  }

  // Първо трябва да се разбере дали има влязъл профил (extras.js праща „qz:me“ след отговора на сървъра)
  function onMe() {
    known = true;
    if (child()) return disable();
    if (ls.get(KEY) === 'yes') enable(); else ask();
  }
  window.addEventListener('qz:me', onMe);
  if (window.qzMeKnown) onMe();   // профилът е бил зареден, преди този файл да се изпълни
})();
