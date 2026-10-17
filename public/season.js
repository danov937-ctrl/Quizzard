// Сезонна украса: от 1 декември до 6 януари играта сама минава на коледен дизайн.
// За преглед по всяко време: ?season=xmas (или ?season=off, за да се изключи).
(function () {
  var q = new URLSearchParams(location.search).get('season');
  var d = new Date(), m = d.getMonth(), day = d.getDate();
  var xmas = q ? q === 'xmas' : m === 11 || (m === 0 && day <= 6);
  if (!xmas) return;
  var root = document.documentElement;
  root.dataset.season = 'xmas';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = '#0b1d3a';
  document.addEventListener('DOMContentLoaded', function () {
    var bg = document.querySelector('.bg');
    var deco = document.createElement('div');
    deco.className = 'xmas'; deco.setAttribute('aria-hidden', 'true');
    deco.innerHTML = '<div class="xmas-lights"></div><div class="xmas-snow"></div><div class="xmas-snow far"></div>';
    if (bg) bg.after(deco); else document.body.prepend(deco);
    var logos = document.querySelectorAll('img[src$="logo.svg"]');
    for (var i = 0; i < logos.length; i++) logos[i].src = logos[i].getAttribute('src').replace(/logo\.svg$/, 'logo-xmas.svg');
    var tag = document.querySelector('.tagline');
    if (tag) tag.textContent = '🎄 Весела Коледа! Завладей заснежена България със знания! 🎁';
  });
})();
