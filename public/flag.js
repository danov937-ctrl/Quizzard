// Знамената на играчите: шарка, три цвята и емблема (емоджи). Ползва се от играта, профила и стаята.
(() => {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Вътрешността на знаме с размер w×h (в координати от 0,0), за вграждане в друг SVG
  function inner(flag, w = 30, h = 20) {
    const [a, b, c] = (flag?.colors || ['#ffffff', '#00966e', '#d62828']).map(esc);
    const R = (x, y, ww, hh, f) => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${f}"/>`;
    let s;
    switch (flag?.pattern) {
      case 'v3': s = R(0, 0, w / 3, h, a) + R(w / 3, 0, w / 3, h, b) + R((2 * w) / 3, 0, w / 3 + 0.2, h, c); break;
      case 'h2': s = R(0, 0, w, h / 2, a) + R(0, h / 2, w, h / 2, b); break;
      case 'v2': s = R(0, 0, w / 2, h, a) + R(w / 2, 0, w / 2, h, b); break;
      case 'diag': s = R(0, 0, w, h, a) + `<path d="M${w} 0V${h}H0z" fill="${b}"/><path d="M${w * 0.82} 0H${w}V${h * 0.18}L${w * 0.18} ${h}H0V${h * 0.82}z" fill="${c}"/>`; break;
      case 'cross': s = R(0, 0, w, h, a) + R(w * 0.42, 0, w * 0.16, h, b) + R(0, h * 0.38, w, h * 0.24, b); break;
      case 'nordic': s = R(0, 0, w, h, a) + R(w * 0.27, 0, w * 0.2, h, b) + R(0, h * 0.35, w, h * 0.3, b) + R(w * 0.32, 0, w * 0.1, h, c) + R(0, h * 0.43, w, h * 0.14, c); break;
      case 'chevron': s = R(0, 0, w, h / 2, a) + R(0, h / 2, w, h / 2, b) + `<path d="M0 0L${w * 0.45} ${h / 2}L0 ${h}z" fill="${c}"/>`; break;
      case 'solid': s = R(0, 0, w, h, a); break;
      default: s = R(0, 0, w, h / 3, a) + R(0, h / 3, w, h / 3, b) + R(0, (2 * h) / 3, w, h / 3 + 0.2, c);
    }
    if (flag?.emblem) s += `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${h * 0.62}">${esc(flag.emblem)}</text>`;
    return s;
  }
  // Самостоятелно знаме (за списъци и профила)
  const svg = (flag, w = 36, cls = 'zflag') => {
    const h = Math.round((w * 2) / 3);
    return `<svg class="${cls}" viewBox="0 0 30 20" width="${w}" height="${h}" aria-hidden="true">${inner(flag, 30, 20)}<rect x=".5" y=".5" width="29" height="19" fill="none" stroke="rgba(0,0,0,.35)"/></svg>`;
  };
  window.ZFlag = { inner, svg };
})();
