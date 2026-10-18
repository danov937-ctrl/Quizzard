// Страници за Google: области, куиз по класове, въпрос на деня, за родители и учители.
const assert = require('assert');
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4600 + Math.floor(Math.random() * 90);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-seo-'));
const TODAY = '2026-10-25';
process.env.SEO_TODAY = TODAY;
const seo = require('../seo_pages');
const get = (url, headers = {}) => new Promise((resolve, reject) => {
  http.get({ host: 'localhost', port: PORT, path: url, headers }, (res) => {
    const chunks = []; res.on('data', (c) => chunks.push(c));
    res.on('end', () => { let body = Buffer.concat(chunks); if (res.headers['content-encoding'] === 'br') body = zlib.brotliDecompressSync(body); resolve({ status: res.statusCode, headers: res.headers, text: body.toString('utf8') }); });
  }).on('error', reject);
});
const count = (s, re) => (s.match(re) || []).length;

(async () => {
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, PUBLIC_URL: 'https://znamenosci.com', ADMIN_DATA_DIR: DIR, DATA_DIR: DIR, SEO_TODAY: TODAY }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { await get('/robots.txt'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const paths = ['/oblasti-na-balgaria', '/kviz-za-1-klas', '/kviz-za-2-klas', '/kviz-za-3-klas', '/kviz-za-4-klas', '/vapros-na-denya', '/za-uchiteli', '/vapros-na-denya/2026-10-20'];
    const titles = new Set(), descs = new Set(), pages = {};
    for (const p of paths) {
      const r = await get(p, { 'Accept-Encoding': 'br' });
      assert.strictEqual(r.status, 200, p);
      assert.strictEqual(r.headers['content-encoding'], 'br', p + ': компресия');
      const h = pages[p] = r.text;
      assert.strictEqual(count(h, /<h1\b/g), 1, p + ': един h1');
      const title = h.match(/<title>([^<]+)<\/title>/)[1], desc = h.match(/<meta name="description" content="([^"]+)"/)[1];
      assert.ok(title.length >= 20 && title.length <= 80, p + ': заглавие ' + title.length);
      assert.ok(desc.length >= 70 && desc.length <= 165, p + ': описание ' + desc.length);
      assert.ok(!titles.has(title) && !descs.has(desc), p + ': уникално заглавие и описание'); titles.add(title); descs.add(desc);
      assert.ok(h.includes(`<link rel="canonical" href="https://znamenosci.com${p}">`), p + ': canonical');
      const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      assert.deepStrictEqual(ld['@graph'].map((x) => x['@type']), ['WebPage', 'BreadcrumbList'], p);
      assert.ok(h.includes('href="/"'), p + ': връзка към играта');
      assert.ok(!/undefined|NaN|\[object/.test(h), p + ': няма undefined/NaN');
    }

    // области: 28 реда в 6 региона, номера 1–28, 28 пътя на картата
    const ob = pages['/oblasti-na-balgaria'];
    assert.strictEqual(count(ob, /<th scope="row">/g), 28);
    assert.strictEqual(count(ob, /<h3><span class="seo-dot"/g), 6);
    assert.strictEqual(count(ob, /<path d=/g), 28);
    for (let n = 1; n <= 28; n++) assert.ok(ob.includes(`>${n}</text>`) && ob.includes(`<td class="n">${n}</td>`), 'номер ' + n);

    // клас: 5 примерни въпроса с 4 отговора, а верният е между тях и в „Покажи отговора“
    for (const g of [1, 2, 3, 4]) {
      const h = pages[`/kviz-za-${g}-klas`];
      assert.strictEqual(count(h, /<div class="seo-q">/g), 5, 'клас ' + g);
      assert.strictEqual(count(h, /<li><span class="seo-l">/g), 20);
      for (const q of seo.gradeSamples(g)) {
        assert.ok(q.options.includes(q.correct) && q.options.length === 4 && q.grade === g);
        assert.ok(h.includes(`Верният отговор: <b>${q.correct.replace(/&/g, '&amp;')}</b>`) || /["'<>&]/.test(q.correct), 'отговор в страницата');
      }
      assert.match(h, /над \d+00 въпроса/);
    }

    // въпрос на деня: днес, архив, пренасочване, граници
    const today = pages['/vapros-na-denya'];
    assert.ok(today.includes('25 октомври 2026 г.'));
    assert.strictEqual(count(today, /<div class="seo-q">/g), 1);
    assert.ok((await get('/vapros-na-denya')).text === today, 'един и същ въпрос през деня');
    const r301 = await get('/vapros-na-denya/' + TODAY); assert.strictEqual(r301.status, 301); assert.strictEqual(r301.headers.location, '/vapros-na-denya');
    for (const bad of ['/vapros-na-denya/2026-10-17', '/vapros-na-denya/2026-10-26', '/vapros-na-denya/2026-02-31', '/vapros-na-denya/abc']) assert.strictEqual((await get(bad)).status, 404, bad);
    const days = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', TODAY];
    const qs = new Set(days.map((d) => seo.dailyQuestion(d).id)); assert.ok(qs.size >= 6, 'въпросите през различните дни се различават');
    assert.strictEqual((await get('/oblasti-na-balgaria/')).status, 301);

    // 28 страници на области: по една за всяка област от картата
    const MAP = require('../../data/map.json'), { SLUG, FACTS } = require('../seo_data');
    assert.deepStrictEqual(Object.keys(SLUG).sort(), MAP.regions.map((r) => r.id).sort(), 'адрес за всяка област');
    assert.deepStrictEqual(Object.keys(FACTS).sort(), Object.keys(SLUG).sort(), 'известни места за всяка област');
    assert.strictEqual(new Set(Object.values(SLUG)).size, 28, 'адресите са различни');
    assert.strictEqual(count(ob, /<th scope="row"><a href="\/oblasti-na-balgaria\/[a-z-]+">/g), 28, 'връзки от общата страница');
    const byId = Object.fromEntries(MAP.regions.map((r) => [r.id, r]));
    const smAll = (await get('/sitemap.xml')).text;
    for (const r of MAP.regions) {
      const p = '/oblasti-na-balgaria/' + SLUG[r.id];
      const res = await get(p, { 'Accept-Encoding': 'br' });
      assert.strictEqual(res.status, 200, p);
      const h = res.text;
      assert.strictEqual(count(h, /<h1\b/g), 1, p + ': един h1');
      const title = h.match(/<title>([^<]+)<\/title>/)[1], desc = h.match(/<meta name="description" content="([^"]+)"/)[1];
      assert.ok(title.length >= 30 && title.length <= 70, p + ': заглавие ' + title.length);
      assert.ok(desc.length >= 100 && desc.length <= 165, p + ': описание ' + desc.length);
      assert.ok(!titles.has(title) && !descs.has(desc), p + ': уникално заглавие и описание'); titles.add(title); descs.add(desc);
      assert.ok(h.includes(`<link rel="canonical" href="https://znamenosci.com${p}">`), p + ': canonical');
      const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      assert.deepStrictEqual(ld['@graph'].map((x) => x['@type']), ['WebPage', 'BreadcrumbList'], p);
      assert.strictEqual(ld['@graph'][1].itemListElement.length, 3, p + ': Начало › Областите на България › област');
      assert.strictEqual(count(h, /<tr><td class="n">\d+<\/td><th scope="row"><a href=/g), r.neighbors.length, p + ': съседи в таблицата');
      assert.strictEqual(count(h, /<circle /g), r.neighbors.length, p + ': номера на картата');
      assert.strictEqual(count(h, /<path d=/g), 28, p + ': картата има 28 области');
      for (const nb of r.neighbors) {
        assert.ok(h.includes(`href="/oblasti-na-balgaria/${SLUG[nb]}"`), p + ': връзка към съседа ' + nb);
        assert.ok(byId[nb].neighbors.includes(r.id), p + ': съседството е взаимно ' + nb);
      }
      assert.strictEqual(count(h, /<div class="seo-q">/g) >= 3, true, p + ': въпроси за проверка');
      assert.strictEqual(count(h, /<li><b>/g), FACTS[r.id].length, p + ': известни места');
      assert.ok(h.includes('<nav class="seo-daynav"'), p + ': предишна и следваща област');
      assert.ok(!/undefined|NaN|\[object/.test(h), p + ': няма undefined/NaN');
      assert.ok(smAll.includes(`<loc>https://znamenosci.com${p}</loc>`), 'sitemap: ' + p);
      // въпросите за проверка: верният отговор е между отговорите
      const quiz = seo.areaQuiz ? seo.areaQuiz(r.id) : [];
      for (const q of quiz) assert.ok(q.options.length === 4 && q.options.includes(q.correct), p + ': въпрос ' + q.text);
    }
    assert.strictEqual((await get('/oblasti-na-balgaria/nyama')).status, 404);
    assert.strictEqual((await get('/oblasti-na-balgaria/plovdiv/')).status, 301);

    // sitemap и начален екран
    const sm = (await get('/sitemap.xml')).text;
    for (const p of paths.filter((x) => x !== '/vapros-na-denya/2026-10-20')) assert.ok(sm.includes(`<loc>https://znamenosci.com${p}</loc>`), 'sitemap: ' + p);
    assert.strictEqual(count(sm, /vapros-na-denya\/2026-/g), 7, 'архив: 18–24 октомври');
    const home = (await get('/')).text;
    for (const p of ['/oblasti-na-balgaria', '/kviz-za-1-klas', '/kviz-za-4-klas', '/vapros-na-denya', '/za-uchiteli']) assert.ok(home.includes(`href="${p}"`), 'връзка от началния екран: ' + p);
    assert.ok(!/Disallow: \/(oblasti|kviz|vapros|za-uchiteli)/.test((await get('/robots.txt')).text));
    console.log('seo_pages: всички проверки минаха');
  } finally { proc.kill(); fs.rmSync(DIR, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
