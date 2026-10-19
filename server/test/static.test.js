// Статични файлове: компресия, ETag/304, кеш и страницата за Google (заглавие, структурирани данни).
const assert = require('assert');
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4500 + Math.floor(Math.random() * 90);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qz-static-'));
const get = (url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: 'localhost', port: PORT, path: url, method, headers }, (res) => {
    const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  });
  req.on('error', reject); req.end();
});

(async () => {
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, PUBLIC_URL: 'https://znamenosci.com', ADMIN_DATA_DIR: DIR, DATA_DIR: DIR }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { await get('/robots.txt'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const pub = path.join(__dirname, '..', '..', 'public');

    // gzip и brotli връщат същото съдържание
    const raw = fs.readFileSync(path.join(pub, 'client.js'));
    const gz = await get('/client.js', { 'Accept-Encoding': 'gzip' });
    assert.strictEqual(gz.headers['content-encoding'], 'gzip');
    assert.ok(gz.body.length < raw.length / 2, 'gzip трябва да смали файла поне наполовина');
    assert.ok(zlib.gunzipSync(gz.body).equals(raw), 'gzip: съдържанието е същото');
    const br = await get('/client.js', { 'Accept-Encoding': 'br, gzip' });
    assert.strictEqual(br.headers['content-encoding'], 'br');
    assert.ok(zlib.brotliDecompressSync(br.body).equals(raw), 'brotli: съдържанието е същото');
    const plain = await get('/client.js');
    assert.ok(!plain.headers['content-encoding'] && plain.body.equals(raw), 'без Accept-Encoding файлът е непокътнат');
    assert.strictEqual(plain.headers.vary, 'Accept-Encoding');

    // ETag и 304
    const et = plain.headers.etag; assert.ok(et);
    assert.strictEqual((await get('/client.js', { 'If-None-Match': et })).status, 304);
    assert.strictEqual((await get('/client.js', { 'If-None-Match': '"other"' })).status, 200);

    // кеш: шрифтовете се пазят дълго, кодът се проверява
    assert.match(plain.headers['cache-control'], /no-cache/);
    const font = fs.readdirSync(path.join(pub, 'fonts')).find((f) => f.endsWith('.woff2'));
    const f = await get('/fonts/' + font, { 'Accept-Encoding': 'br' });
    assert.match(f.headers['cache-control'], /max-age=31536000/);
    assert.ok(!f.headers['content-encoding'], 'шрифтът (woff2) вече е компресиран');

    // HEAD, липсващ файл и папка
    const h = await get('/client.js', { 'Accept-Encoding': 'gzip' }, 'HEAD'); assert.strictEqual(h.status, 200); assert.strictEqual(h.body.length, 0);
    assert.strictEqual((await get('/missing-file.js')).status, 404);
    assert.strictEqual((await get('/v2')).status, 404);

    // началната страница: адрес от PUBLIC_URL, заглавие с ключови думи, структурирани данни, един h1
    const idx = await get('/', { 'Accept-Encoding': 'br' });
    assert.strictEqual(idx.headers['content-encoding'], 'br');
    const html = zlib.brotliDecompressSync(idx.body).toString('utf8');
    assert.ok(!html.includes('__ORIGIN__'), 'всички __ORIGIN__ са заменени');
    assert.match(html, /<link rel="canonical" href="https:\/\/znamenosci\.com\/">/);
    assert.match(html, /<title>[^<]*куиз игра[^<]*1–4 клас<\/title>/);
    assert.strictEqual((html.match(/<h1\b/g) || []).length, 1, 'само един h1');
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.deepStrictEqual(ld['@graph'].map((x) => x['@type']), ['WebSite', 'WebApplication']);
    assert.strictEqual(ld['@graph'][1].url, 'https://znamenosci.com/');
    const desc = html.match(/<meta name="description" content="([^"]*)"/)[1];
    assert.ok(desc.length >= 100 && desc.length <= 170, 'описанието е с подходяща дължина: ' + desc.length);

    // Два различни файла с еднаква големина и час на запис не трябва да си разменят съдържанието
    // (така /admin/ показваше кода на flag.js: и двата бяха по 2398 байта и записани в един и същи миг)
    const tmpA = path.join(pub, 'zz-test-a.js'), tmpB = path.join(pub, 'zz-test-b.js');
    try {
      fs.writeFileSync(tmpA, '// A\n' + 'a'.repeat(2000)); fs.writeFileSync(tmpB, '// B\n' + 'b'.repeat(2000));
      const when = new Date('2026-10-19T12:00:00.123Z'); fs.utimesSync(tmpA, when, when); fs.utimesSync(tmpB, when, when);
      const ra = await get('/zz-test-a.js', { 'Accept-Encoding': 'gzip' }), rb = await get('/zz-test-b.js', { 'Accept-Encoding': 'gzip' });
      assert.notStrictEqual(ra.headers.etag, rb.headers.etag, 'различни файлове, различни ETag');
      assert.ok(zlib.gunzipSync(ra.body).toString().startsWith('// A'), 'файл A е със своето съдържание');
      assert.ok(zlib.gunzipSync(rb.body).toString().startsWith('// B'), 'файл B е със своето съдържание, не с това на A');
    } finally { fs.rmSync(tmpA, { force: true }); fs.rmSync(tmpB, { force: true }); }

    // robots.txt и sitemap.xml
    assert.match((await get('/robots.txt')).body.toString(), /Sitemap: https:\/\/znamenosci\.com\/sitemap\.xml/);
    assert.match((await get('/sitemap.xml')).body.toString(), /<loc>https:\/\/znamenosci\.com\/<\/loc>/);
    console.log('static: всички проверки минаха');
  } finally { proc.kill(); fs.rmSync(DIR, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
