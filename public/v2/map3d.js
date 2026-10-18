// Нов вид: карта.
// По подразбиране картата е плоска и спокойна, като рисувана географска карта: върху нея са сенките на
// истинските планини (Стара планина, Рила, Пирин, Родопите…). Бутонът „🧊 3D“ я наклонява към играча
// (ортографска проекция само със SVG матрица): областите стават издигнати блокове, завзетите са по-високи,
// избираемите подскачат. Надписите и замъците стоят „прави“ върху наклонената плоскост.
// В 3D изглед хоризонтално плъзгане върти картата, вертикално я накланя.
(function () {
  var H0 = 12;                       // дебелина на плочата на България (единици на картата)
  var HS = { '': 0, own: 3, can: 7, target: 15, chosen: 15 };
  var TILT = 44, DY = 10;            // начален наклон и преместване надолу (оставя място за надписа горе)
  var box = { k: 0.4, w: 660, h: 310 }; // как viewBox-ът е вписан в рамката (за мащаба)
  var rad = Math.PI / 180;
  var cfg = { tilt: 0, yaw: 0 };   // плоска по подразбиране; TILT е изгледът „3D“
  var svg = null, stage = null, land = null, view = null, center = { x: 500, y: 327 };
  var regs = {}, hOf = {}, last = {};
  var api = { on: false, H0: H0 };
  // приказни обитатели на съседните земи: [x, y, емоджи, клас, закъснение] (координати на картата)
  var DECOR = [[-55, 95, '🌲', '', 0], [-95, 280, '🌳', '', 1.2], [-32, 455, '🦄', ' big', .6], [110, 702, '🌳', '', 2], [470, 698, '🏛️', ' big', .3], [880, 640, '🐉', ' dragon big', 0],
    [110, -20, '🌲', '', .8], [250, -40, '🏰', ' big', 0], [760, -45, '🌳', '', 1.6], [960, 690, '🌲', '', 2.4]];
  // истинските планини, като линии върху картата (проекцията е същата като на data/map.json) и дебелина на хребета
  var RANGES = [
    ['M79,114L111,193L189,232L268,264L377,296L471,319L581,315L675,298L785,306L887,328', 36],   // Стара планина
    ['M221,375L315,357L424,357L534,347', 22],                                                   // Средна гора
    ['M127,439L189,449L221,460', 44],                                                           // Рила
    ['M145,357L166,364', 22],                                                                   // Витоша
    ['M189,486L177,541L170,588', 28],                                                           // Пирин
    ['M260,492L330,541L424,575L526,609', 60],                                                   // Родопите
    ['M32,428L72,456', 22],                                                                     // Осогово
    ['M722,460L816,471L887,492', 28],                                                           // Странджа
    ['M127,605L174,609', 18]                                                                    // Беласица
  ];
  var FAIRIES = [[-110, 30, '🧚', ''], [1050, 240, '🧚', ' b']];

  var r3 = function (n) { return Math.round(n * 1000) / 1000; };

  function apply() {
    if (!svg || !stage) return;
    var th = cfg.tilt * rad, ph = cfg.yaw * rad;
    var c = Math.cos(th), sn = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    var S = scaleFor(th);
    var a = S * cp, b = S * c * sp, cc = -S * sp, d = S * c * cp;
    var ox = view.x + view.w / 2, oy = view.y + view.h / 2 + DY;
    var e = ox - (a * center.x + cc * center.y), f = oy - (b * center.x + d * center.y);
    svg.setAttribute('data-tilt', cfg.tilt >= 6 ? '1' : '0');
    stage.setAttribute('transform', 'matrix(' + [a, b, cc, d, e, f].map(r3).join(' ') + ')');
    var st = svg.style, tn = Math.tan(th);
    st.setProperty('--ux', r3(-tn * sp) + 'px');     // „нагоре“ на екрана, записано в координати на плоскостта
    st.setProperty('--uy', r3(-tn * cp) + 'px');
    st.setProperty('--ia', r3(cp)); st.setProperty('--ib', r3(-sp));    // обратната матрица: надписите стоят прави
    st.setProperty('--ic', r3(sp / c)); st.setProperty('--id', r3(cp / c));
    st.setProperty('--sy', r3(-sn) + 'px');
    sortRegs(sp, cp);
  }

  // мащабът следи рамката: България винаги се събира, при всякакъв размер и наклон
  function scaleFor(th) {
    var bw = 1000, bh = 654 * Math.cos(th) + (H0 + 8) * Math.sin(th);
    var s = Math.min(0.82 * box.w / (bw * box.k), 0.84 * box.h / (bh * box.k));
    return Math.max(0.7, Math.min(1.9, s));
  }
  function measure() {
    var r = svg.getBoundingClientRect(); if (!r.width || !r.height || !view) return;
    box = { w: r.width, h: r.height, k: Math.min(r.width / view.w, r.height / view.h) };
  }

  // по-далечните области се рисуват първи, за да ги закриват по-близките
  function sortRegs(sp, cp) {
    if (!land) return;
    var list = Object.keys(regs).map(function (id) { var r = regs[id]; return { g: r.g, z: (r.cx - center.x) * sp + (r.cy - center.y) * cp }; });
    list.sort(function (p, q) { return p.z - q.z; });
    for (var i = 0; i < list.length; i++) if (land.children[i] !== list[i].g) land.appendChild(list[i].g);
  }

  // „права“ рисунка върху наклонената плоскост (надпис, замък, емоджи); h е височината над земята
  function upright(x, y, html, h) {
    return '<g class="up"' + ' style="' + (h == null ? '' : '--h:' + h + ';') + 'transform:translate(' + x + 'px,' + y + 'px) matrix(var(--ia),var(--ib),var(--ic),var(--id),0,0) translate(' + (-x) + 'px,' + (-y) + 'px)"><g class="lift">' + html + '</g></g>';
  }
  // плоска рисунка (стрелка), вдигната на нивото на плочата
  function plane(html) { return '<g class="plane">' + html + '</g>'; }

  function build(world, ordered, regionPos, pieces) {
    view = world.view; api.on = true;
    var grid = [];
    for (var x = -900; x <= 1900; x += 100) grid.push('M' + x + ' -700V1500');
    for (var y = -700; y <= 1500; y += 100) grid.push('M-900 ' + y + 'H1900');
    var walls = [0, .34, .67].map(function (k) { return '<path class="wall" style="--k:' + k + '" d="@D@"/>'; }).join('');
    var regions = ordered.map(function (r) {
      return '<g class="reg" id="g-' + r.id + '" style="--h:0">' + walls.replace(/@D@/g, r.path) + '<path class="top" id="r-' + r.id + '" data-id="' + r.id + '" d="' + r.path + '"/></g>';
    }).join('');
    var labels = ordered.map(function (r) {
      var p = regionPos(r.id);
      return '<g id="l-' + r.id + '" style="--h:0;transform:translate(' + p[0] + 'px,' + p[1] + 'px) matrix(var(--ia),var(--ib),var(--ic),var(--id),0,0) translate(' + (-p[0]) + 'px,' + (-p[1]) + 'px)" class="up"><g class="lift"><text class="rname" x="' + p[0] + '" y="' + p[1] + '" text-anchor="middle">' + r.name + '</text><g class="badge"></g></g></g>';
    }).join('');
    return '<g id="stage"><path class="grid" d="' + grid.join('') + '"/>' + pieces.below +
      '<g class="shadow"><g transform="translate(14 20)">' + ordered.map(function (r) { return '<path d="' + r.path + '"/>'; }).join('') + '</g></g>' +
      '<g class="land">' + regions + '</g>' + relief(ordered) + pieces.above + decor(upright) +
      '<g class="labels">' + labels + '</g><g id="castles"></g><g id="fxl"></g></g>';
  }

  // планини, нарисувани като върхове по хребетите (като на печатна географска карта); режат се по границата
  function relief(ordered) {
    var clip = ordered.map(function (r) { return '<path d="' + r.path + '"/>'; }).join('');
    var body = RANGES.map(function (r) { return '<path d="' + r[0] + '" style="stroke-width:' + r[1] + 'px"/>'; }).join('');
    var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var peaks = [];
    RANGES.forEach(function (r) {
      var n = r[0].match(/-?\d+(\.\d+)?/g).map(Number), P = [], w = r[1], step = Math.max(11, w * .4), need = 0;
      for (var i = 0; i < n.length; i += 2) P.push([n[i], n[i + 1]]);
      for (var s = 0; s < P.length - 1; s++) {
        var ax = P[s][0], ay = P[s][1], bx = P[s + 1][0], by = P[s + 1][1], L = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / L, ny = (bx - ax) / L, d = need;
        for (; d < L; d += step * (.8 + rnd() * .5)) {
          var o = (rnd() - .5) * w * .6;
          peaks.push([ax + (bx - ax) * d / L + nx * o, ay + (by - ay) * d / L + ny * o, 6.5 + rnd() * 3.5 + w * .04]);
        }
        need = d - L;
      }
    });
    peaks.sort(function (p, q) { return p[1] - q[1]; });
    var tri = peaks.map(function (p) {
      var x = p[0], y = p[1], s = p[2], h = s * 1.55, f = function (n) { return Math.round(n * 10) / 10; };
      var cap = s > 8.5 ? '<path class="pcap" d="M' + f(x) + ' ' + f(y - h) + 'L' + f(x + s * .36) + ' ' + f(y - h * .62) + 'L' + f(x + s * .1) + ' ' + f(y - h * .7) + 'L' + f(x - s * .12) + ' ' + f(y - h * .6) + 'L' + f(x - s * .36) + ' ' + f(y - h * .64) + 'Z"/>' : '';
      return '<path class="pl" d="M' + f(x - s) + ' ' + f(y) + 'L' + f(x) + ' ' + f(y - h) + 'L' + f(x + s * .15) + ' ' + f(y) + 'Z"/><path class="pr" d="M' + f(x) + ' ' + f(y - h) + 'L' + f(x + s) + ' ' + f(y) + 'L' + f(x + s * .15) + ' ' + f(y) + 'Z"/>' + cap;
    }).join('');
    return '<defs><clipPath id="bgclip">' + clip + '</clipPath>' +
      '<filter id="rb1" filterUnits="userSpaceOnUse" x="-100" y="-100" width="1200" height="900"><feGaussianBlur stdDeviation="12"/></filter></defs>' +
      '<g class="relief" clip-path="url(#bgclip)"><g class="rcore" filter="url(#rb1)">' + body + '</g><g class="peaks">' + tri + '</g></g>';
  }

  function decor(up) {
    var d = DECOR.map(function (o) { return up(o[0], o[1], '<text class="decor' + o[3] + '" x="' + o[0] + '" y="' + o[1] + '" text-anchor="middle" style="--dl:' + o[4] + 's">' + o[2] + '</text>', -H0); }).join('');
    var f = FAIRIES.map(function (o) { return up(o[0], o[1], '<text class="fairy' + o[3] + '" x="' + o[0] + '" y="' + o[1] + '" text-anchor="middle">' + o[2] + '</text>', -H0 - 24); }).join('');
    return d + f;
  }

  function attach(el, mapData) {
    svg = el; stage = svg.querySelector('#stage'); land = svg.querySelector('.land');
    var xs = mapData.regions;
    center = { x: mapData.width / 2, y: mapData.height / 2 };
    regs = {};
    xs.forEach(function (r) { regs[r.id] = { g: svg.querySelector('#g-' + r.id), label: svg.querySelector('#l-' + r.id), cx: r.cx, cy: r.cy }; });
    svg.style.setProperty('--H0', H0);
    measure(); apply();
    if (window.ResizeObserver) new ResizeObserver(function () { measure(); apply(); }).observe(svg.closest('.map-frame') || svg);
    else window.addEventListener('resize', function () { measure(); apply(); });
    gestures();
    controls();
  }

  // ---- цвят и височина на областта ----
  function paint(id, color, state) {
    var r = regs[id]; if (!r || !r.g) return;
    var key = (color || '') + '|' + state;
    if (last[id] === key) return;
    last[id] = key;
    var h = HS[state] != null ? HS[state] : 0;
    hOf[id] = h;
    r.g.setAttribute('class', 'reg' + (state ? ' ' + state : ''));
    r.g.style.setProperty('--c', color || '');
    r.g.style.setProperty('--h', h);
    r.label.style.setProperty('--h', h);
    var cs = svg.querySelectorAll('[data-r="' + id + '"]');
    for (var i = 0; i < cs.length; i++) cs[i].style.setProperty('--h', h);
  }
  function castle(el, region) { el.dataset.r = region; el.style.setProperty('--h', hOf[region] || 0); }

  // ---- плъзгане (само в 3D): върти и накланя ----
  var moved = false;
  function gestures() {
    var st = null;
    svg.style.touchAction = 'pinch-zoom';
    svg.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (cfg.tilt < 6) return;                       // плоската карта не се върти: плъзгането е само в 3D
      st = { x: e.clientX, y: e.clientY, yaw: cfg.yaw, tilt: cfg.tilt, id: e.pointerId, drag: false };
    });
    svg.addEventListener('pointermove', function (e) {
      if (!st || e.pointerId !== st.id) return;
      var dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.drag) {
        if (Math.hypot(dx, dy) < 12) return;
        st.drag = true; moved = true;
        try { svg.setPointerCapture(e.pointerId); } catch (x) { /* стари браузъри */ }
      }
      cfg.yaw = Math.max(-32, Math.min(32, st.yaw + dx * 0.22));
      cfg.tilt = Math.max(0, Math.min(62, st.tilt - dy * 0.25));
      schedule();
    });
    var end = function (e) {
      if (!st || e.pointerId !== st.id) return;
      if (st.drag) setTimeout(function () { moved = false; }, 0);
      st = null;
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    // плъзгането не е избор на област
    svg.addEventListener('click', function (e) { if (moved) { e.stopImmediatePropagation(); e.preventDefault(); moved = false; } }, true);
  }
  var raf = 0;
  function schedule() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; apply(); syncBtn(); }); }

  // ---- бутон „3D / Плоско“ ----
  var btn = null;
  function controls() {
    var frame = svg.closest('.map-frame'); if (!frame || frame.querySelector('.m3d-btn')) return;
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'm3d-btn'; btn.setAttribute('aria-label', 'Смени изгледа на картата');
    btn.onclick = function () {
      if (cfg.tilt < 6) animateTo(TILT, 0, 520); else animateTo(0, 0, 520);
    };
    frame.appendChild(btn); syncBtn();
  }
  function syncBtn() { if (btn) btn.textContent = cfg.tilt < 6 ? '🧊 3D' : '🗺️ Плоско'; }

  var anim = 0;
  function animateTo(tilt, yaw, ms) {
    var t0 = performance.now(), t1 = cfg.tilt, y1 = cfg.yaw;
    cancelAnimationFrame(anim);
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { cfg.tilt = tilt; cfg.yaw = yaw; apply(); syncBtn(); return; }
    (function step(t) {
      var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      cfg.tilt = t1 + (tilt - t1) * e; cfg.yaw = y1 + (yaw - y1) * e; apply();
      if (k < 1) anim = requestAnimationFrame(step); else syncBtn();
    })(t0);
  }
  api.build = build; api.attach = attach; api.paint = paint; api.castle = castle;
  api.upright = upright; api.plane = plane; api.lift = function (id) { return hOf[id] || 0; };
  api.reset = function () { last = {}; };
  window.Map3D = api;
})();
