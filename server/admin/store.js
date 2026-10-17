// Запазване на данните от админ панела.
// Винаги пише локално (ADMIN_DATA_DIR), а ако има GITHUB_TOKEN и DATA_REPO – и в отделно ЧАСТНО
// хранилище в GitHub (напр. danov937-ctrl/quizzard-data). Render не следи това хранилище, така че
// записът не пуска нов deploy, а при всеки старт сървърът зарежда последното състояние оттам.
// Така промените оцеляват рестартите на безплатния план, който няма постоянен диск.
// Публично хранилище се отказва, защото там са акаунтите и сигналите на децата.
//
// По-добре: DATABASE_URL (PostgreSQL – Neon, Supabase, Render Postgres...). Тогава всичко се пази в таблица
// qz_kv (име → JSON), оцелява рестартите и deploy-овете и GitHub вече не се ползва за запис.
// При първо стартиране с база данните от GitHub или от локалните файлове се пренасят в нея сами.
const fs = require('fs');
const path = require('path');

const DIR = process.env.ADMIN_DATA_DIR || path.join(__dirname, '..', '..', 'data', 'admin-local');
const TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = process.env.DATA_REPO || '';
let BRANCH = process.env.DATA_BRANCH || '';
const API = 'https://api.github.com';
const DB_URL = (process.env.DATABASE_URL || '').trim();

class Store {
  constructor(files) {
    this.files = files; // { name: { delay: ms, init: () => обект } }
    this.data = {}; this.sha = {}; this.queue = Promise.resolve(); this.timers = {}; this.dirty = new Set();
    this.useGh = !!(TOKEN && REPO); this.useDb = !!DB_URL; this.pool = null;
    // remote = данните се пазят някъде постоянно (база данни или GitHub); kind казва къде
    this.status = { remote: this.useGh || this.useDb, kind: this.useDb ? 'db' : this.useGh ? 'github' : null, repo: this.useDb ? 'PostgreSQL' : REPO, branch: BRANCH, loadedFrom: null, lastSave: null, lastError: null };
    for (const [name, f] of Object.entries(files)) this.data[name] = f.init();
  }

  async init() {
    try { fs.mkdirSync(DIR, { recursive: true }); } catch {}
    for (const name of Object.keys(this.files)) {
      const local = this.readLocal(name);
      if (local) { this.data[name] = { ...this.files[name].init(), ...local }; this.status.loadedFrom = 'local'; }
    }
    if (this.useGh) {
      try {
        await this.checkRepo();
        for (const name of Object.keys(this.files)) {
          const remote = await this.readRemote(name);
          if (remote) this.data[name] = { ...this.files[name].init(), ...remote };
        }
        this.status.loadedFrom = 'github';
      } catch (e) { this.useGh = false; this.fail('зареждане от GitHub', e); }
    }
    if (this.useDb) await this.initDb();
    this.status.remote = this.useGh || this.useDb;
    this.status.kind = this.useDb ? 'db' : this.useGh ? 'github' : null;
  }

  // ---------- PostgreSQL ----------
  async initDb() {
    try {
      const { Pool } = require('pg');
      let host = ''; try { host = new URL(DB_URL).hostname; } catch {}
      const local = /^(localhost|127\.|::1|\[::1\])/.test(host);
      // Облачните бази изискват TLS; ако адресът има sslmode, оставяме pg да го разчете
      const ssl = process.env.DATABASE_SSL === 'off' || local || /sslmode=/.test(DB_URL) ? undefined : { rejectUnauthorized: false };
      this.pool = new Pool({ connectionString: DB_URL, ssl, max: 3, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000 });
      this.pool.on('error', (e) => this.fail('база данни', e));
      await this.pool.query('create table if not exists qz_kv (name text primary key, data jsonb not null, updated_at timestamptz not null default now())');
      const { rows } = await this.pool.query('select name, data from qz_kv');
      const have = new Map(rows.map((r) => [r.name, r.data]));
      for (const name of Object.keys(this.files)) {
        const empty = JSON.stringify(this.files[name].init());
        if (have.has(name)) this.data[name] = { ...this.files[name].init(), ...have.get(name) };
        else if (JSON.stringify(this.data[name]) !== empty) await this.upsert(name, JSON.stringify(this.data[name])); // пренос от GitHub/локално
      }
      this.status.loadedFrom = 'database';
      this.useGh = false; // оттук нататък само базата; GitHub остава като стар източник за пренос
      this.status.lastError = null;
    } catch (e) { this.useDb = false; this.pool = null; this.fail('свързване с базата данни', e); }
  }
  async upsert(name, body) {
    await this.pool.query('insert into qz_kv (name, data, updated_at) values ($1, $2::jsonb, now()) on conflict (name) do update set data = excluded.data, updated_at = now()', [name, body]);
  }

  get(name) { return this.data[name]; }
  // Отбелязва промяна; записът става след малко, за да се събират няколко промени в един
  touch(name) {
    this.dirty.add(name);
    clearTimeout(this.timers[name]);
    this.timers[name] = setTimeout(() => this.save(name), this.files[name].delay ?? 3000);
    this.timers[name].unref?.();
  }
  async flush() { await Promise.all([...this.dirty].map((n) => this.save(n))); }

  async save(name) {
    clearTimeout(this.timers[name]);
    if (!this.dirty.has(name)) return;
    this.dirty.delete(name);
    const body = JSON.stringify(this.data[name]);
    try { fs.writeFileSync(path.join(DIR, name + '.json'), body); } catch (e) { this.fail('локален запис', e); }
    if (this.useDb) {
      try { await this.upsert(name, body); this.status.lastError = null; }
      catch (e) { this.fail('запис в базата данни', e); this.dirty.add(name); const t = setTimeout(() => this.save(name), 10000); t.unref?.(); return; }
    } else if (this.useGh) {
      // Записите в GitHub вървят един след друг, иначе два едновременни commit-а си пречат
      const job = this.queue.then(() => this.writeRemote(name, body)).catch((e) => { this.fail('запис в GitHub', e); this.dirty.add(name); });
      this.queue = job; await job;
    }
    this.status.lastSave = new Date().toISOString();
  }

  fail(what, e) { this.status.lastError = `${what}: ${e.message}`; console.error('admin store', what, e.message); }
  readLocal(name) { try { return JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8')); } catch { return null; } }

  // ---------- GitHub ----------
  async gh(method, url, body, raw) {
    const res = await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'User-Agent': 'quizzard-admin', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (raw && res.ok) return res.text();
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) { const e = new Error(`${res.status} ${json?.message || ''}`.trim()); e.status = res.status; throw e; }
    return json;
  }
  async checkRepo() {
    const repo = await this.gh('GET', `/repos/${REPO}`);
    if (!repo.private) throw new Error(`хранилището ${REPO} е публично – данните се пазят само в частно хранилище`);
    BRANCH ||= repo.default_branch || 'main';
    this.status.branch = BRANCH;
    // Празно хранилище (без нито един файл): първият запис създава клона
    try { await this.gh('GET', `/repos/${REPO}/branches/${encodeURIComponent(BRANCH)}`); } catch (e) { if (e.status === 404 || e.status === 409) this.noBranch = true; else throw e; }
  }
  async readRemote(name) {
    try {
      const f = await this.gh('GET', `/repos/${REPO}/contents/admin/${name}.json?ref=${encodeURIComponent(BRANCH)}`);
      this.sha[name] = f.sha;
      // Файлове над 1 MB идват без съдържание: тогава ги теглим „сурови“
      if (f.encoding === 'none' || !f.content) return JSON.parse(await this.gh('GET', `/repos/${REPO}/contents/admin/${name}.json?ref=${encodeURIComponent(BRANCH)}`, null, true));
      return JSON.parse(Buffer.from(f.content, 'base64').toString('utf8'));
    } catch (e) { if (e.status === 404 || e.status === 409) return null; throw e; }
  }
  async writeRemote(name, body, retry = true) {
    try {
      const r = await this.gh('PUT', `/repos/${REPO}/contents/admin/${name}.json`, { message: `Админ панел: ${name}`, content: Buffer.from(body).toString('base64'), branch: this.noBranch ? undefined : BRANCH, sha: this.sha[name] });
      this.sha[name] = r.content.sha; this.noBranch = false; this.status.lastError = null;
    } catch (e) {
      // Някой друг е променил файла (или няма sha) – взимаме новия sha и пишем отново
      if (retry && (e.status === 409 || e.status === 422)) {
        try { const f = await this.gh('GET', `/repos/${REPO}/contents/admin/${name}.json?ref=${encodeURIComponent(BRANCH)}`); this.sha[name] = f.sha; } catch (x) { if (x.status !== 404) throw x; this.sha[name] = undefined; }
        return this.writeRemote(name, body, false);
      }
      throw e;
    }
  }
}

module.exports = { Store, DIR };
