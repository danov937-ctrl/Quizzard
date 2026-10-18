// Страници за Google: области на България, куиз по класове, въпрос на деня и страница за родители и учители.
// Всичко се прави на сървъра (обикновен HTML с текст), за да може Google да го прочете и без JavaScript.
// Данните са от самата игра: map.json (области) и банката въпроси (примерни въпроси, предмети, брой).
const fs = require('fs');
const path = require('path');
const { MC, SUBJECTS, ADULT_SUBJECTS } = require('./questions');

const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'map.json'), 'utf8'));
const SITE = 'Знаменосци';
const START = '2026-10-18'; // от тази дата има архив на „Въпрос на деня“
const MONTHS = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
const LETTERS = ['А', 'Б', 'В', 'Г'];

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- дата (по българско време) ----------
const today = () => process.env.SEO_TODAY || new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' }).format(new Date());
const addDays = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const bgDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${y} г.`; };

// ---------- стабилно „случайно“ ----------
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffled(arr, seed) { const r = rng(seed), a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- въпроси ----------
const GRADES = [1, 2, 3, 4];
const nice = (q) => q.kind === 'mc' && !q.pic && q.options.length === 4 && q.text.length <= 110 && q.options.every((o) => o.length <= 42) && !/[\n|]/.test(q.text);
const NICE = MC.filter((q) => GRADES.includes(q.grade) && nice(q));
// Предметите и броят въпроси за клас: както в играта (клас и класът под него)
function gradeInfo(g) {
  const pool = MC.filter((q) => q.grade <= g && q.grade >= g - 1 && !ADULT_SUBJECTS[q.subject]);
  const by = {};
  for (const q of pool) by[q.subject] = (by[q.subject] || 0) + 1;
  const subjects = Object.keys(by).filter((s) => by[s] >= 15).map((s) => SUBJECTS[s]);
  return { count: pool.length, subjects };
}
// 5 примерни въпроса за клас, от различни предмети
const samples = {};
function gradeSamples(g) {
  if (samples[g]) return samples[g];
  const pool = shuffled(NICE.filter((q) => q.grade === g), g * 7919), used = new Set(), out = [];
  for (const q of pool) { if (out.length >= 5) break; if (!used.has(q.subject)) { used.add(q.subject); out.push(q); } }
  for (const q of pool) { if (out.length >= 5) break; if (!out.includes(q)) out.push(q); }
  return (samples[g] = out.map((q) => ({ ...q, options: shuffled(q.options, hash(q.id)) })));
}
function dailyQuestion(date) {
  const q = NICE[hash('vd|' + date) % NICE.length];
  return { ...q, options: shuffled(q.options, hash('o|' + date)) };
}

// ---------- общ вид на страниците ----------
const NAV = [['/oblasti-na-balgaria', 'Области на България'], ['/kviz-za-1-klas', 'Куиз за 1–4 клас'], ['/vapros-na-denya', 'Въпрос на деня'], ['/za-uchiteli', 'За родители и учители']];
function layout(o, { title, desc, path: p, h1, body, crumbs = [] }) {
  const url = o + p;
  const trail = [['Начало', '/'], ...crumbs, [h1, p]];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': url + '#page', url, name: title, description: desc, inLanguage: 'bg', isPartOf: { '@type': 'WebSite', name: SITE, url: o + '/' } },
      { '@type': 'BreadcrumbList', itemListElement: trail.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: o + href })) },
    ],
  };
  const crumbHtml = trail.map(([name, href], i) => (i === trail.length - 1 ? `<span aria-current="page">${esc(name)}</span>` : `<a href="${href}">${esc(name)}</a>`)).join(' › ');
  return `<!doctype html>
<html lang="bg">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${esc(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${o}/share.png">
  <meta property="og:locale" content="bg_BG">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/logo.svg" type="image/svg+xml">
  <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">
  <meta name="theme-color" content="#0e2a4a">
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
  <script src="/design.js"></script>
  <link href="/fonts/fonts.css" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/extras.css">
  <link rel="stylesheet" href="/v2/tokens.css">
  <link rel="stylesheet" href="/v2/components.css">
  <link rel="stylesheet" href="/v2/screens.css">
  <link rel="stylesheet" href="/seo.css">
</head>
<body>
  <div class="bg" aria-hidden="true"></div>
  <main class="qx-page seo-page">
    <header class="seo-head">
      <a class="seo-brand" href="/"><img src="/logo.svg" alt="" width="40" height="40"><span>${SITE}</span></a>
      <a class="btn gold seo-play" href="/">Играй ▶</a>
    </header>
    <nav class="seo-crumbs" aria-label="Път">${crumbHtml}</nav>
    <article class="qx-paper seo-paper">
      <h1>${esc(h1)}</h1>
${body}
    </article>
    <section class="seo-cta">
      <p>Безплатна куиз игра с карта на България: отговаряй на въпроси, завладявай областите и играй с приятели или с ботове.</p>
      <a class="btn gold big" href="/">Играй „${SITE}“ ▶</a>
    </section>
    <footer class="seo-foot">
      <nav aria-label="Още от ${SITE}">${NAV.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`).join('')}<a href="/privacy.html">Поверителност</a><a href="/terms.html">Условия</a></nav>
    </footer>
  </main>
</body>
</html>
`;
}

// ---------- „Областите на България“ ----------
const REGIONS = [
  ['Северозападен регион', '#f4a6b8', ['VID', 'MON', 'VRC', 'PVN', 'LOV']],
  ['Северен централен регион', '#f7c873', ['VTR', 'GAB', 'RAZ', 'RSE', 'SLS']],
  ['Североизточен регион', '#9fd4a3', ['VAR', 'DOB', 'TGV', 'SHU']],
  ['Югоизточен регион', '#9cc7ec', ['BGS', 'SLV', 'SZR', 'JAM']],
  ['Югозападен регион', '#c4a9e8', ['SOF', 'SFO', 'BLG', 'PER', 'KNL']],
  ['Южен централен регион', '#f2a98a', ['PDV', 'PAZ', 'SML', 'HKV', 'KRZ']],
];
const CENTER = { SOF: 'София (столицата)', SFO: 'София' };
function oblastiPage(o) {
  const byId = Object.fromEntries(MAP.regions.map((r) => [r.id, r]));
  const order = REGIONS.flatMap(([, , ids]) => ids.slice().sort((a, b) => byId[a].name.localeCompare(byId[b].name, 'bg')));
  const num = Object.fromEntries(order.map((id, i) => [id, i + 1]));
  const color = {}; for (const [, c, ids] of REGIONS) for (const id of ids) color[id] = c;
  const svg = `<svg class="seo-map" viewBox="0 0 ${MAP.width} ${MAP.height}" role="img" aria-label="Карта на България с 28-те области, оцветени по региони и номерирани">
${MAP.regions.map((r) => `<path d="${r.path}" fill="${color[r.id]}" stroke="#fffaf0" stroke-width="2" stroke-linejoin="round"/>`).join('\n')}
${MAP.regions.map((r) => `<g><circle cx="${r.cx}" cy="${r.cy}" r="21" fill="#fffaf0" stroke="#6b4a36" stroke-width="2.5"/><text x="${r.cx}" y="${r.cy + 9}" text-anchor="middle">${num[r.id]}</text></g>`).join('\n')}
</svg>`;
  const blocks = REGIONS.map(([name, c, ids]) => {
    const rows = ids.slice().sort((a, b) => num[a] - num[b]).map((id) => `<tr><td class="n">${num[id]}</td><th scope="row">${esc(byId[id].name)}</th><td>${esc(CENTER[id] || byId[id].name)}</td></tr>`).join('');
    return `<h3><span class="seo-dot" style="background:${c}"></span>${name}</h3>
      <table class="qx-table seo-table"><thead><tr><th class="n">№</th><th>Област</th><th>Областен център</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join('\n');
  const body = `      <p class="qx-lead">България е разделена на 28 области. Всяка област си има главен град, който се нарича областен център и обикновено носи същото име. Тук е картата с всички области, подредени по региони, и няколко съвета как да ги запомниш.</p>
      <div class="seo-mapbox">${svg}</div>
      <p class="seo-hint">Цветовете показват шестте региона, а номерата сочат къде е всяка област в списъка по-долу.</p>

      <h2>Всички области и техните центрове</h2>
${blocks}
      <p>Внимание: <b>София</b> (столицата) и <b>София област</b> са две различни области.</p>

      <h2>Как да ги запомниш</h2>
      <ul>
        <li><b>По региони.</b> Научи шестте региона и по 4–5 области във всеки. Така запомняш по няколко наведнъж.</li>
        <li><b>По Дунав.</b> По течението на Дунав, от запад на изток, са Видин, Монтана, Враца, Плевен, Велико Търново, Русе и Силистра.</li>
        <li><b>По Черно море.</b> На морето са три области: Добрич, Варна и Бургас, от север на юг.</li>
        <li><b>С игра.</b> В „${SITE}“ завладяваш областите на картата и отговаряш на въпроси за тях. Така ги запомняш по-лесно, отколкото със зубрене.</li>
      </ul>

      <h2>Често задавани въпроси</h2>
      <h3>Колко са областите в България?</h3>
      <p>28. Столицата София е отделна област, а Софийска област е друга.</p>
      <h3>Кои са съседите на България?</h3>
      <p>Румъния на север, Сърбия и Северна Македония на запад, Гърция и Турция на юг. На изток е Черно море.</p>
      <h3>Кой е най-високият връх?</h3>
      <p>Мусала в Рила, 2925 м. Той е най-високият на Балканския полуостров.</p>
      <h3>Как да се изпитам?</h3>
      <p>Играй „${SITE}“: на картата избираш област, отговаряш на въпроси и така я завладяваш. Играта е безплатна и работи в браузъра.</p>`;
  return layout(o, {
    title: 'Областите на България — карта, областни центрове и региони',
    desc: 'Карта с 28-те области на България, техните областни центрове и шестте региона. Научи ги лесно и се провери с играта „Знаменосци“.',
    path: '/oblasti-na-balgaria', h1: 'Областите на България', body,
  });
}

// ---------- „Куиз за N клас“ ----------
const gradeNames = { 1: 'първи', 2: 'втори', 3: 'трети', 4: 'четвърти' };
function qCard(q, i) {
  return `      <div class="seo-q">
        <div class="seo-qmeta">${i != null ? `<span class="seo-qn">${i}</span>` : ''}<span class="chip">${esc(SUBJECTS[q.subject] || '')}</span></div>
        <p class="seo-qtext">${esc(q.text)}</p>
        <ul class="seo-opts">${q.options.map((op, k) => `<li><span class="seo-l">${LETTERS[k]}</span>${esc(op)}</li>`).join('')}</ul>
        <details><summary>Покажи отговора</summary><p>Верният отговор: <b>${esc(q.correct)}</b></p></details>
      </div>`;
}
function gradePage(o, g) {
  const { count, subjects } = gradeInfo(g);
  const total = Math.floor(count / 100) * 100;
  const others = GRADES.filter((x) => x !== g).map((x) => `<a href="/kviz-za-${x}-klas">${x} клас</a>`).join(' · ');
  const speak = g <= 2 ? '<li>Има бутон 🔈, който чете въпроса на глас, за да може детето да слуша, ако още не чете бързо.</li>' : '';
  const body = `      <p class="qx-lead">Куизът за ${g} клас в „${SITE}“ е безплатна игра: ученикът отговаря на въпроси и завладява областите на карта на България. За ${gradeNames[g]} клас има над ${total} въпроса по: ${esc(subjects.join(', '))}.</p>

      <h2>Примерни въпроси за ${g} клас</h2>
      <p>Опитай се да отговориш, преди да натиснеш „Покажи отговора“.</p>
${gradeSamples(g).map((q, i) => qCard(q, i + 1)).join('\n')}

      <h2>Как се играе</h2>
      <ul>
        <li>Избираш столица на картата и отговаряш на въпроси.</li>
        <li>С верните отговори завладяваш областите една по една.</li>
        <li>Можеш да играеш срещу ботове, с приятели (с четирицифрен код на стаята) или онлайн с други деца.</li>
        <li>Режимът „Упражнение“ е без противници и без бързане: въпроси по избран предмет.</li>
        ${speak}
      </ul>

      <h2>За родители</h2>
      <p>Играта работи и без профил. Няма чат между децата, а данните, които пазим, са описани на страницата за <a href="/za-uchiteli">родители и учители</a>.</p>

      <h2>Други класове</h2>
      <p>${others}</p>`;
  return layout(o, {
    title: `Куиз за ${g} клас — въпроси и отговори, игра онлайн`,
    desc: `Безплатен куиз за ${g} клас: над ${total} въпроса по ${subjects.slice(0, 3).join(', ').toLowerCase()} и още. Примерни въпроси с отговори и игра онлайн.`,
    path: `/kviz-za-${g}-klas`, h1: `Куиз за ${g} клас`, body,
  });
}

// ---------- „Въпрос на деня“ ----------
function dailyPage(o, date, isToday) {
  const q = dailyQuestion(date), t = today();
  const days = [];
  for (let d = addDays(isToday ? t : date, -1); d >= START && days.length < 14; d = addDays(d, -1)) days.push(d);
  const prev = addDays(date, -1), next = addDays(date, 1);
  const nav = [prev >= START ? `<a href="/vapros-na-denya/${prev}">← ${bgDate(prev)}</a>` : '', !isToday ? (next >= t ? `<a href="/vapros-na-denya">Днес →</a>` : `<a href="/vapros-na-denya/${next}">${bgDate(next)} →</a>`) : ''].filter(Boolean).join(' &nbsp; ');
  const body = `      <p class="qx-lead">${isToday ? `Днес е ${bgDate(date)}` : bgDate(date)} Един въпрос от играта „${SITE}“ за ${q.grade} клас. Нов въпрос се появява всеки ден в полунощ (българско време).</p>
${qCard(q)}
      ${nav ? `<p class="seo-daynav">${nav}</p>` : ''}
      <h2>Още въпроси</h2>
      <p>В „${SITE}“ има над ${Math.floor(MC.filter((x) => GRADES.includes(x.grade)).length / 100) * 100} въпроса за 1–4 клас. <a href="/">Играй безплатно</a> срещу ботове, с приятели или в режим „Упражнение“. Виж и <a href="/kviz-za-${q.grade}-klas">примерни въпроси за ${q.grade} клас</a>.</p>
      ${days.length ? `<h2>Предишни дни</h2>
      <ul class="seo-days">${days.map((d) => `<li><a href="/vapros-na-denya/${d}">${bgDate(d)}</a></li>`).join('')}</ul>` : ''}`;
  return layout(o, {
    title: `Въпрос на деня — ${bgDate(date)} | ${SITE}`,
    desc: `Въпрос на деня за ${bgDate(date)}: опитай се да отговориш и виж верния отговор. Нов въпрос всеки ден от играта „${SITE}“.`,
    path: isToday ? '/vapros-na-denya' : `/vapros-na-denya/${date}`, h1: isToday ? 'Въпрос на деня' : `Въпрос на деня — ${bgDate(date)}`, body,
    crumbs: isToday ? [] : [['Въпрос на деня', '/vapros-na-denya']],
  });
}

// ---------- „За родители и учители“ ----------
function teachersPage(o) {
  const body = `      <p class="qx-lead">„${SITE}“ е образователна куиз игра с карта на България за деца от 1. до 4. клас. Детето отговаря на въпроси по предмети от училище и така завладява областите. Тази страница е за родители и учители: как работи играта и как пазим данните.</p>

      <h2>Безопасност</h2>
      <ul>
        <li><b>Няма чат между децата.</b> Децата се виждат само по измислено потребителско име и аватар.</li>
        <li><b>Играта работи и без профил.</b> Профилът е по желание.</li>
        <li><b>Минимум данни.</b> Не искаме истинско име, телефон, адрес или дата на раждане на детето. За профил е нужен имейл на родителя, който потвърждава съгласието.</li>
        <li><b>Седмичен отчет за родителя:</b> къде детето се справя добре и къде има нужда от помощ. Може да се спре с един клик.</li>
        <li><b>По време на игра няма реклами.</b> Не продаваме данни на децата и не правим рекламен профил.</li>
      </ul>
      <p>Всички подробности са на страницата за <a href="/privacy.html">поверителност</a>.</p>

      <h2>Как се използва вкъщи</h2>
      <ul>
        <li><b>Упражнение:</b> въпроси по избран предмет, без противници и без бързане.</li>
        <li><b>Предизвикателство на деня:</b> 10 въпроса всеки ден.</li>
        <li><b>Игра срещу ботове или с приятели:</b> стая с четирицифрен код, до четирима играчи.</li>
        <li>Бутонът 🔈 чете въпросите на глас, което помага на по-малките деца.</li>
      </ul>

      <h2>Как се използва в клас</h2>
      <ul>
        <li>Всеки ученик може да учи със своето устройство в режим „Упражнение“ по предмета от урока.</li>
        <li>Групи от по четирима могат да играят в обща стая с код.</li>
        <li>За турнир между класове ни пишете от страницата за <a href="/privacy.html">поверителност</a>. Децата влизат в своя клас с код от учителя.</li>
      </ul>

      <h2>Често задавани въпроси</h2>
      <h3>Безплатна ли е играта?</h3>
      <p>Режимът за деца е безплатен.</p>
      <h3>Какво е нужно, за да се играе?</h3>
      <p>Телефон, таблет или компютър с интернет и браузър. Играта може да се добави като приложение на началния екран.</p>
      <h3>Кои предмети има?</h3>
      <p>Български език, математика, околен свят, човекът и природата, човекът и обществото, английски език, музика, изобразително изкуство, технологии, физическо възпитание и компютърно моделиране.</p>
      <h3>Има ли режим за възрастни?</h3>
      <p>Да, отделен режим със собствени въпроси. Той не се смесва с детските.</p>
      <h3>Как да съобщя за грешен въпрос?</h3>
      <p>Във всеки въпрос има бутон „Има проблем с този въпрос“. Екипът преглежда сигналите.</p>

      <h2>Опитай</h2>
      <p>Виж <a href="/kviz-za-1-klas">примерни въпроси за 1 клас</a>, <a href="/kviz-za-2-klas">2 клас</a>, <a href="/kviz-za-3-klas">3 клас</a> и <a href="/kviz-za-4-klas">4 клас</a> или опитай <a href="/vapros-na-denya">въпроса на деня</a>.</p>`;
  return layout(o, {
    title: 'За родители и учители — безопасна образователна игра за 1–4 клас',
    desc: 'Как работи „Знаменосци“ и как пазим данните на децата: без чат, играта работи и без профил, няма реклами по време на игра. Идеи за дома и класа.',
    path: '/za-uchiteli', h1: 'Знаменосци за родители и учители', body,
  });
}

// ---------- маршрути ----------
const DATE = /^\/vapros-na-denya\/(\d{4}-\d{2}-\d{2})$/;
function render(url, o) {
  const clean = url.length > 1 ? url.replace(/\/+$/, '') : url;
  let res = null;
  let m;
  if (clean === '/oblasti-na-balgaria') res = { html: oblastiPage(o) };
  else if ((m = clean.match(/^\/kviz-za-([1-4])-klas$/))) res = { html: gradePage(o, +m[1]) };
  else if (clean === '/vapros-na-denya') res = { html: dailyPage(o, today(), true) };
  else if ((m = clean.match(DATE))) {
    const d = m[1], t = today();
    if (!(d >= START && d <= t) || Number.isNaN(Date.parse(d)) || new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) !== d) return null;
    res = d === t ? { redirect: '/vapros-na-denya' } : { html: dailyPage(o, d, false) };
  } else if (clean === '/za-uchiteli') res = { html: teachersPage(o) };
  if (res && clean !== url && !res.redirect) res = { redirect: clean };
  return res;
}
// Адреси за sitemap.xml: основните страници и последните дни на „Въпрос на деня“
function sitemapPaths() {
  const t = today(), days = [];
  for (let d = addDays(t, -1); d >= START && days.length < 30; d = addDays(d, -1)) days.push('/vapros-na-denya/' + d);
  return ['/oblasti-na-balgaria', ...GRADES.map((g) => `/kviz-za-${g}-klas`), '/vapros-na-denya', '/za-uchiteli', ...days];
}

module.exports = { render, sitemapPaths, today, dailyQuestion, gradeSamples, gradeInfo, NAV, START };
