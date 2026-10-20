// Facebook пиксел: без META_PIXEL_ID няма нищо; с валиден номер идва от /ads-config.js; файлът track.js пази всички условия.
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const get = (port, url) => new Promise((resolve, reject) => {
  http.get({ host: 'localhost', port, path: url }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(c).toString('utf8') })); }).on('error', reject);
});
async function withServer(env, fn) {
  const port = 4700 + Math.floor(Math.random() * 90), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-track-'));
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: port, ADMIN_DATA_DIR: dir, DATA_DIR: dir, META_PIXEL_ID: '', ...env }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { await get(port, '/robots.txt'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    await fn(port);
  } finally { proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
}

(async () => {
  await withServer({}, async (port) => {
    assert.ok(!/pixel/.test((await get(port, '/ads-config.js')).text), 'без META_PIXEL_ID няма пиксел');
  });
  await withServer({ META_PIXEL_ID: '123"});alert(1);//' }, async (port) => {
    assert.ok(!/pixel|alert/.test((await get(port, '/ads-config.js')).text), 'невалиден номер се отхвърля');
  });
  await withServer({ META_PIXEL_ID: '1234567890123' }, async (port) => {
    assert.ok((await get(port, '/ads-config.js')).text.includes('"pixel":"1234567890123"'), 'валиден номер идва от сървъра');
    const idx = (await get(port, '/')).text;
    assert.ok(idx.includes('src="track.js"') && idx.indexOf('ads-config.js') < idx.indexOf('track.js'), 'track.js се зарежда след настройките');
    const js = (await get(port, '/track.js')).text;
    for (const needle of ['fbclid', 'utm_source', 'qz-fb-consent', 'qz:me', 'autoConfig', 'standalone']) assert.ok(js.includes(needle), 'track.js: ' + needle);
    assert.ok(!/fbq\('init'[^)]*\)[^]*fbq\('init'/.test(js), 'един init');
    const priv = (await get(port, '/privacy.html')).text;
    assert.ok(priv.includes('id="facebook"') && priv.includes('id="fbOff"') && priv.includes('qz-fb-consent'), 'политика: раздел за Facebook и оттегляне');
    assert.ok((await get(port, '/privacy-adult.html')).text.includes('/privacy.html#facebook'), 'политика за възрастни сочи към раздела');
  });
  // Реклами: възрастният профил е с обичайна маркировка, всички останали са „дете“
  const ads = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'ads.js'), 'utf8');
  for (const needle of ['adultViewer', 'qzMe.adult', 'needsConsent', "adult ? '0' : '1'", 'requestNonPersonalizedAds = adult ? 0 : 1', 'qzMeKnown', 'qz:me']) assert.ok(ads.includes(needle), 'ads.js: ' + needle);
  assert.ok(!/tagForAgeTreatment = '1'/.test(ads), 'детската маркировка вече не е безусловна');
  // Google AdSense: мета етикет за проверка на собственика и ads.txt, само при валиден ADSENSE_CLIENT
  await withServer({ ADSENSE_CLIENT: 'ca-pub-1234567890123456' }, async (port) => {
    assert.ok((await get(port, '/')).text.includes('<meta name="google-adsense-account" content="ca-pub-1234567890123456">'), 'AdSense: мета етикет на началната страница');
    assert.match((await get(port, '/ads.txt')).text, /google\.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0/, 'AdSense: ads.txt');
  });
  await withServer({ ADSENSE_CLIENT: 'ca-pub-1"><script>alert(1)</script>' }, async (port) => {
    const t = (await get(port, '/')).text;
    assert.ok(!t.includes('google-adsense-account') && !t.includes('alert(1)'), 'невалиден ADSENSE_CLIENT се отхвърля');
    assert.strictEqual((await get(port, '/ads.txt')).status, 404);
  });
  await withServer({}, async (port) => { assert.ok(!(await get(port, '/')).text.includes('google-adsense-account'), 'без ADSENSE_CLIENT няма етикет'); });
  console.log('track: всички проверки минаха');
})().catch((e) => { console.error(e); process.exit(1); });
