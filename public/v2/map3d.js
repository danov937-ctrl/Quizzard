// Нов вид: 3D карта.
// Картата е плоскост, наклонена към играча (ортографска проекция, направена само със SVG матрица),
// а областите са издигнати блокове: свободните са ниски, завзетите по-високи, избираемите подскачат.
// Всички надписи и замъци стоят „прави“ върху наклонената плоскост. Работи гладко и на слаби телефони.
// Хоризонтално плъзгане върти картата, вертикално я накланя; бутонът 🧭 я връща.
(function () {
  var H0 = 12;                       // дебелина на плочата на България (единици на картата)
  var HS = { '': 0, own: 3, can: 7, target: 15, chosen: 15 };
  var TILT = 44, DY = 10;            // начален наклон и преместване надолу (оставя място за надписа горе)
  var box = { k: 0.4, w: 660, h: 310 }; // как viewBox-ът е вписан в рамката (за мащаба)
  var rad = Math.PI / 180;
  var cfg = { tilt: TILT, yaw: 0 };
  var svg = null, stage = null, land = null, view = null, center = { x: 500, y: 327 };
  var regs = {}, hOf = {}, last = {};
  var api = { on: false, H0: H0 };

  var r3 = function (n) { return Math.round(n * 1000) / 1000; };

  function apply() {
    if (!svg || !stage) return;
    var th = cfg.tilt * rad, ph = cfg.yaw * rad;
    var c = Math.cos(th), sn = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    var S = scaleFor(th);
    var a = S * cp, b = S * c * sp, cc = -S * sp, d = S * c * cp;
    var ox = view.x + view.w / 2, oy = view.y + view.h / 2 + DY;
    var e = ox - (a * center.x + cc * center.y), f = oy - (b * center.x + d * center.y);
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
    var s = Math.min(0.82 * box.w / (bw * box.k), 0.9 * box.h / (bh * box.k));
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
      '<g class="land">' + regions + '</g>' + pieces.above +
      '<g class="labels">' + labels + '</g><g id="castles"></g><g id="fxl"></g></g>';
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
    swoop();
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

  // ---- плъзгане: върти и накланя ----
  var moved = false;
  function gestures() {
    var st = null;
    svg.style.touchAction = 'pinch-zoom';
    svg.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
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

  // ---- бутон „🧭“: назад към началния изглед / плосък изглед ----
  var btn = null;
  function controls() {
    var frame = svg.closest('.map-frame'); if (!frame || frame.querySelector('.m3d-btn')) return;
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'm3d-btn'; btn.setAttribute('aria-label', 'Смени изгледа на картата');
    btn.onclick = function () {
      var flat = cfg.tilt < 6, to = flat ? { tilt: TILT, yaw: 0 } : (Math.abs(cfg.tilt - TILT) < 3 && Math.abs(cfg.yaw) < 3 ? { tilt: 0, yaw: 0 } : { tilt: TILT, yaw: 0 });
      animateTo(to.tilt, to.yaw, 520);
    };
    frame.appendChild(btn); syncBtn();
  }
  function syncBtn() { if (btn) btn.textContent = cfg.tilt < 6 ? '🧊 3D' : (Math.abs(cfg.tilt - TILT) < 3 && Math.abs(cfg.yaw) < 3 ? '🗺️ Плоско' : '🧭 Върни'); }

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
  // при отваряне на картата камерата „каца“ от по-високо и малко встрани
  function swoop() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    cfg.tilt = 14; cfg.yaw = -16; apply();
    animateTo(TILT, 0, 1300);
  }

  api.build = build; api.attach = attach; api.paint = paint; api.castle = castle;
  api.upright = upright; api.plane = plane; api.lift = function (id) { return hOf[id] || 0; };
  api.reset = function () { last = {}; };
  window.Map3D = api;
})();
