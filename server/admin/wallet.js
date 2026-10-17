// Парички в режима за възрастни (18+). Всеки започва с 1000. Игра онлайн или с приятели струва залог 100;
// победителят взима залозите на другите. Паричките са само за игра: не се обменят обратно в пари,
// не се теглят и не се прехвърлят между играчи. Децата нямат парички, залози, магазин и реклами с награда.
const crypto = require('crypto');
const { ADULT } = require('../questions');

const START = 1000;
const STAKE = 100;
const AD_REWARD = 100;
const ADS_PER_DAY = 5;
const AD_MIN_MS = 15000; // рекламата трябва да е гледана поне толкова, преди да се даде наградата
// Пакети в магазина. Цените са примерни, докато не са включени плащанията.
const PACKS = [
  { id: 'p1000', coins: 1000, price: '1,99 €' },
  { id: 'p3000', coins: 3000, price: '4,99 €', bonus: '+20%' },
  { id: 'p7000', coins: 7000, price: '9,99 €', bonus: '+40%' },
  { id: 'p16000', coins: 16000, price: '19,99 €', bonus: '+60%' },
];
const dayKey = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Sofia' });

class Wallet {
  constructor(store, accounts) {
    this.store = store; this.acc = accounts;
    this.adStarts = new Map(); // токен → { uid, at }
    for (const u of Object.values(accounts.users)) this.ensure(u);
  }
  // Рекламите с награда работят само с проверка от рекламната мрежа. До тогава: REWARDED_ADS=test за проба.
  get adsMode() { return process.env.REWARDED_ADS === 'test' ? 'test' : 'off'; }
  get shopOn() { return false; } // включва се, когато има плащания (Stripe / Google Play / App Store)

  ensure(u) {
    if (!u.adult || u.coins != null) return;
    u.coins = START; u.coinsBest = START;
    this.log(u, START, 'Начален подарък');
    this.store.touch('players');
  }
  log(u, d, why) {
    (u.coinLog ||= []).push({ at: new Date().toISOString(), d, why, left: u.coins });
    if (u.coinLog.length > 40) u.coinLog.splice(0, u.coinLog.length - 40);
  }
  add(u, d, why) {
    u.coins = Math.max(0, (u.coins || 0) + d);
    u.coinsBest = Math.max(u.coinsBest || 0, u.coins);
    this.log(u, d, why); this.store.touch('players');
  }
  canStake(u) { return !!u && !!u.adult && (u.coins || 0) >= STAKE; }

  // Залогът се взима в началото на игра за възрастни онлайн или с приятели, само от играчи с профил 18+.
  // Ботовете и гостите не залагат.
  onGameStart(room, game) {
    if (game.grade !== ADULT || room.mode === 'bots') return;
    const by = {};
    for (const m of room.members) {
      const u = !m.isBot && m.uid && this.acc.users[m.uid];
      if (!this.canStake(u)) continue;
      this.add(u, -STAKE, 'Залог за игра');
      by[m.id] = u.id;
    }
    if (Object.keys(by).length) game.meta.stakes = { by, pot: STAKE * Object.keys(by).length, settled: false };
  }
  // Победителят (ако е заложил и е доиграл сам) взима всичко. Ако победи бот или гост, всеки, който е
  // доиграл, си получава залога обратно. Който излезе по средата, губи залога си.
  onGameEnd(game) {
    const s = game.meta?.stakes;
    if (!s || s.settled) return false;
    s.settled = true;
    const w = game.player(game.winner);
    const winUid = w && !w.isBot && s.by[w.id];
    if (winUid && this.acc.users[winUid]) {
      const u = this.acc.users[winUid];
      this.add(u, s.pot, s.pot > STAKE ? 'Победа: взе залозите' : 'Победа: залогът се връща');
      s.result = { winner: w.id, pot: s.pot };
      return true;
    }
    for (const [pid, uid] of Object.entries(s.by)) {
      const p = game.player(pid), u = this.acc.users[uid];
      if (u && p && !p.isBot) this.add(u, STAKE, 'Залогът се връща');
    }
    s.result = { winner: null, refund: true };
    return true;
  }
  // Прекъсната игра: всички си получават залога
  onAbort(game) {
    const s = game.meta?.stakes;
    if (!s || s.settled) return;
    s.settled = true;
    for (const uid of Object.values(s.by)) { const u = this.acc.users[uid]; if (u) this.add(u, STAKE, 'Прекъсната игра: залогът се връща'); }
  }

  adsLeft(u) { return u.ads?.day === dayKey() ? Math.max(0, ADS_PER_DAY - u.ads.n) : ADS_PER_DAY; }
  view(u) {
    return { coins: u.coins || 0, stake: STAKE, start: START, packs: PACKS, shop: this.shopOn,
      ads: { mode: this.adsMode, left: this.adsLeft(u), perDay: ADS_PER_DAY, reward: AD_REWARD, minSec: AD_MIN_MS / 1000 },
      log: (u.coinLog || []).slice(-15).reverse() };
  }

  async handle({ p, post, body, me, res, json }) {
    if (!p.startsWith('/api/coins')) return false;
    if (!me) return json(res, 401, { error: 'Първо влез в профила си.' });
    if (!me.adult) return json(res, 403, { error: 'Паричките са само в режима за възрастни.' });
    this.ensure(me);
    if (p === '/api/coins' && !post) return json(res, 200, this.view(me));
    if (p === '/api/coins/buy' && post) {
      if (!this.shopOn) return json(res, 503, { error: 'Плащанията още не са включени. Скоро!' });
      return json(res, 400, { error: 'Непознат пакет.' });
    }
    if (p === '/api/coins/ad/start' && post) {
      if (this.adsMode === 'off') return json(res, 503, { error: 'Рекламите с награда още не са включени. Скоро!' });
      if (!this.adsLeft(me)) return json(res, 429, { error: `Днес вече изгледа ${ADS_PER_DAY} реклами. Ела пак утре!` });
      const token = crypto.randomBytes(12).toString('hex');
      this.adStarts.set(token, { uid: me.id, at: Date.now() });
      for (const [k, v] of this.adStarts) if (Date.now() - v.at > 600000) this.adStarts.delete(k);
      return json(res, 200, { token, minSec: AD_MIN_MS / 1000 });
    }
    if (p === '/api/coins/ad/done' && post) {
      const st = this.adStarts.get(String(body.token || ''));
      if (!st || st.uid !== me.id) return json(res, 400, { error: 'Рекламата не е започната.' });
      if (Date.now() - st.at < AD_MIN_MS) return json(res, 400, { error: 'Рекламата не е изгледана докрай.' });
      this.adStarts.delete(String(body.token));
      if (!this.adsLeft(me)) return json(res, 429, { error: `Днес вече изгледа ${ADS_PER_DAY} реклами. Ела пак утре!` });
      const d = dayKey();
      me.ads = me.ads?.day === d ? { day: d, n: me.ads.n + 1 } : { day: d, n: 1 };
      this.add(me, AD_REWARD, 'Гледана реклама');
      return json(res, 200, this.view(me));
    }
    return json(res, 404, { error: 'Няма такава функция.' });
  }
}

module.exports = { Wallet, START, STAKE, AD_REWARD, ADS_PER_DAY, PACKS };
