// Картинката, която се вижда, когато някой сподели линка на Знаменосци (public/share.png, 1200×630),
// и квадратна картинка за реклама във Facebook/Instagram.
// Картата се рисува от data/map.json, така че цялата България се вижда, без отрязани краища.
//
// Пускане (от главната папка):
//   NODE_PATH=<път до playwright> node tools/build_share.js                 -> public/share.png
//   NODE_PATH=<път до playwright> node tools/build_share.js --ad обява.png  -> и квадратна картинка за реклама
// Ако Chromium не се намира сам, задай CHROME=/път/до/chrome.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'map.json'), 'utf8'));
const FONTS = 'file://' + path.join(ROOT, 'public', 'fonts', 'fonts.css');
const LOGO = 'file://' + path.join(ROOT, 'public', 'logo.svg');
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];   // същите като в играта: червено, синьо, зелено, оранжево

// Оцветяване с 4 цвята така, че съседните области никога да не са еднакви (търсене с връщане назад)
function colour(regions) {
  const order = [...regions].sort((a, b) => b.neighbors.length - a.neighbors.length).map((r) => r.id);
  const nb = Object.fromEntries(regions.map((r) => [r.id, r.neighbors]));
  const col = {};
  const go = (i) => {
    if (i === order.length) return true;
    const id = order[i];
    for (let c = 0; c < COLORS.length; c++) {
      if (nb[id].some((n) => col[n] === c)) continue;
      col[id] = c;
      if (go(i + 1)) return true;
      delete col[id];
    }
    return false;
  };
  if (!go(0)) throw new Error('Не става с 4 цвята');
  return col;
}
const col = colour(map.regions);

function mapSvg(width, highlight) {
  const h = Math.round(width * map.height / map.width);
  const paths = map.regions.map((r) => {
    const hl = r.id === highlight;
    return `<path d="${r.path}" fill="${hl ? '#fffbe8' : COLORS[col[r.id]]}" stroke="${hl ? '#7c2d12' : '#0b2038'}" stroke-width="${hl ? 3 : 1.4}" stroke-linejoin="round"/>`;
  });
  // областта, която се търси, се рисува последна, за да не я закрива рамката на съседите
  const hlR = map.regions.find((r) => r.id === highlight);
  const mark = hlR ? `<g transform="translate(${hlR.cx} ${hlR.cy})"><circle r="30" fill="#fbbf24" stroke="#7c2d12" stroke-width="4"/><text y="14" text-anchor="middle" font-family="Rubik" font-weight="900" font-size="42" fill="#7c2d12">?</text></g>` : '';
  const ordered = hlR ? [...paths.filter((_, i) => map.regions[i].id !== highlight), paths[map.regions.indexOf(hlR)]] : paths;
  return `<svg width="${width}" height="${h}" viewBox="0 0 ${map.width} ${map.height}" style="filter: drop-shadow(0 10px 18px rgba(0,0,0,.45))">${ordered.join('')}${mark}</svg>`;
}

const BASE = `
  <link rel="stylesheet" href="${FONTS}">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: radial-gradient(circle at 70% 48%, #1d4c80 0%, #14385f 38%, #0b2038 100%); color: #fff; font-family: "Rubik", sans-serif; overflow: hidden; position: relative; }
    .brand { font-family: "Kurale", serif; color: #fbbf24; line-height: 1; text-shadow: 0 4px 0 rgba(0, 0, 0, .28); }
    .pill { display: inline-block; background: #fbbf24; color: #3b1d06; font-weight: 800; border-radius: 999px; }
    .dots { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.07) 1.4px, transparent 1.6px); background-size: 34px 34px; }
  </style>`;

// Картинка за споделяне на линк, 1200×630
const SHARE = `<!doctype html><html><head><meta charset="utf-8">${BASE}
  <style>
    body { width: 1200px; height: 630px; }
    .col { position: absolute; left: 64px; top: 0; bottom: 0; width: 500px; display: flex; flex-direction: column; justify-content: center; }
    .logo { width: 104px; height: 104px; margin: 0 0 6px -8px; }
    .brand { font-size: 92px; }
    .tag { font-weight: 800; font-size: 41px; line-height: 1.2; margin-top: 22px; }
    .pill { font-size: 26px; padding: 10px 24px; margin-top: 30px; align-self: flex-start; }
    .sub { font-weight: 500; font-size: 26px; color: #ffe9a8; margin-top: 16px; }
    .map { position: absolute; left: 585px; top: 112px; }
  </style></head><body><div class="dots"></div>
  <div class="col"><img class="logo" src="${LOGO}">
    <div class="brand">Знаменосци</div>
    <div class="tag">Отговаряй на въпроси и завладей България!</div>
    <div class="pill">Безплатно · за 1–4 клас</div>
    <div class="sub">Играй с приятели или с ботове</div></div>
  <div class="map">${mapSvg(575)}</div></body></html>`;

// Квадратна реклама, 1080×1080: въпросът към родителя е на самата картинка
const AD = `<!doctype html><html><head><meta charset="utf-8">${BASE}
  <style>
    body { width: 1080px; height: 1080px; background: radial-gradient(circle at 50% 62%, #1d4c80 0%, #14385f 42%, #0b2038 100%); }
    .top { position: absolute; left: 60px; top: 42px; display: flex; align-items: center; gap: 14px; }
    .top img { width: 70px; height: 70px; }
    .top .brand { font-size: 48px; }
    h1 { position: absolute; left: 60px; right: 60px; top: 132px; font-family: "Kurale", serif; font-weight: 400; font-size: 118px; line-height: 1; text-shadow: 0 5px 0 rgba(0, 0, 0, .3); }
    .sub { position: absolute; left: 60px; right: 60px; top: 262px; font-weight: 700; font-size: 42px; color: #ffe9a8; }
    .map { position: absolute; left: 60px; top: 340px; }
    .pill { position: absolute; left: 60px; top: 972px; font-size: 38px; padding: 12px 34px; }
  </style></head><body><div class="dots"></div>
  <div class="top"><img src="${LOGO}"><div class="brand">Знаменосци</div></div>
  <h1>Къде е Пловдив?</h1>
  <div class="sub">Игра с карта на България за 1.–4. клас</div>
  <div class="map">${mapSvg(960, 'PDV')}</div>
  <div class="pill">Безплатно · в браузъра · без сваляне</div></body></html>`;

(async () => {
  const adIdx = process.argv.indexOf('--ad');
  const adOut = adIdx > 0 ? path.resolve(process.argv[adIdx + 1]) : null;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const shoot = async (html, w, h, out) => {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const tmp = path.join(require('os').tmpdir(), 'qz-share-' + process.pid + '.html');
    fs.writeFileSync(tmp, html);
    await page.goto('file://' + tmp);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: out });
    fs.unlinkSync(tmp);
    await page.close();
    console.log('записано', out, w + '×' + h);
  };
  await shoot(SHARE, 1200, 630, path.join(ROOT, 'public', 'share.png'));
  if (adOut) await shoot(AD, 1080, 1080, adOut);
  await browser.close();
})();
