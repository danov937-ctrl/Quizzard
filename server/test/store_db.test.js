// Проверка на Postgres слоя в store.js с подменен модул "pg" (без истинска база).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// ---- фалшив pg: таблица qz_kv в паметта ----
const db = { rows: new Map(), failQuery: false, failConnect: false, queries: [] };
class FakePool {
  constructor(opts) { this.opts = opts; db.lastOpts = opts; }
  on() {}
  async query(sql, params = []) {
    db.queries.push(sql);
    if (db.failConnect) throw new Error('connect ECONNREFUSED');
    if (/^create table/i.test(sql)) return { rows: [] };
    if (/^select name, data/i.test(sql)) return { rows: [...db.rows].map(([name, data]) => ({ name, data })) };
    if (/^insert into qz_kv/i.test(sql)) {
      if (db.failQuery) throw new Error('db down');
      db.rows.set(params[0], JSON.parse(params[1]));
      return { rows: [] };
    }
    throw new Error('неочаквана заявка: ' + sql);
  }
}
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'pg' ? { Pool: FakePool } : origLoad.call(this, req, ...rest); };

const FILES = { players: { delay: 0, init: () => ({ list: [] }) }, settings: { delay: 0, init: () => ({ rounds: 3 }) } };

function freshStore(dir, env = {}) {
  process.env.ADMIN_DATA_DIR = dir;
  process.env.DATABASE_URL = 'postgres://u:p@db.example.com/app';
  delete process.env.GITHUB_TOKEN; delete process.env.DATA_REPO;
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../admin/store.js')];
  const { Store } = require('../admin/store.js');
  return new Store(FILES);
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qz-store-'));

(async () => {
  // 1) Първо стартиране: локалните данни се пренасят в базата
  const dir1 = tmp();
  fs.writeFileSync(path.join(dir1, 'players.json'), JSON.stringify({ list: [{ id: 1, name: 'Мими' }] }));
  const s1 = freshStore(dir1);
  await s1.init();
  assert.strictEqual(s1.status.kind, 'db');
  assert.strictEqual(s1.status.remote, true);
  assert.strictEqual(s1.status.loadedFrom, 'database');
  assert.deepStrictEqual(db.rows.get('players'), { list: [{ id: 1, name: 'Мими' }] }, 'локалните данни трябва да се пренесат');
  assert.ok(!db.rows.has('settings'), 'празните настройки не се пишат излишно');
  assert.deepStrictEqual(db.lastOpts.ssl, { rejectUnauthorized: false }, 'облачна база без sslmode получава TLS');

  // 2) Нова регистрация се записва в базата
  s1.get('players').list.push({ id: 2, name: 'Иван' });
  s1.touch('players');
  await s1.flush();
  assert.strictEqual(db.rows.get('players').list.length, 2);
  assert.strictEqual(s1.status.lastError, null);

  // 3) „Рестарт“ на Render: празна локална папка, данните идват от базата
  const s2 = freshStore(tmp());
  await s2.init();
  assert.deepStrictEqual(s2.get('players').list.map((p) => p.name), ['Мими', 'Иван'], 'профилите оцеляват рестарт');
  assert.deepStrictEqual(s2.get('settings'), { rounds: 3 }, 'липсващите файлове получават стойности по подразбиране');

  // 4) Грешка при запис: не се губи, пази се за повторен опит
  s2.get('players').list.push({ id: 3, name: 'Мария' });
  s2.touch('players');
  db.failQuery = true;
  await s2.flush().catch(() => {});
  assert.ok(/запис в базата/.test(s2.status.lastError), 'грешката се вижда в панела');
  assert.ok(s2.dirty.has('players'), 'промяната остава за нов опит');
  db.failQuery = false;
  await s2.save('players');
  assert.strictEqual(db.rows.get('players').list.length, 3);
  assert.strictEqual(s2.status.lastError, null);

  // 5) Локална база: без TLS
  const s3 = freshStore(tmp(), { DATABASE_URL: 'postgres://u:p@localhost:5432/app' });
  await s3.init();
  assert.strictEqual(db.lastOpts.ssl, undefined);

  // 6) Базата не отговаря при старт: сървърът не пада, пази локално и показва грешка
  db.failConnect = true;
  const s4 = freshStore(tmp());
  await s4.init();
  assert.strictEqual(s4.status.remote, false);
  assert.ok(/свързване с базата/.test(s4.status.lastError));
  s4.get('players').list.push({ id: 9 });
  s4.touch('players');
  await s4.flush();
  assert.ok(fs.readdirSync(process.env.ADMIN_DATA_DIR).includes('players.json'), 'резервен локален запис');
  db.failConnect = false;

  console.log('store_db: всички проверки минаха');
  Module._load = origLoad;
})().catch((e) => { console.error(e); process.exit(1); });
