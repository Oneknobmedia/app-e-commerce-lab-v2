// Pruebas v2.10.2: putText reintenta cada lote D1 ante 503/fallos transitorios; si falla siempre, el proyecto anterior queda intacto.
// Uso: node tests/puttext-retry.test.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'worker-e-commerce-lab', 'src-original', 'src');
const W = (await import(pathToFileURL(path.join(SRC, 'index.js')).href)).default;
let pass = 0;
const t = async (name, f) => { await f(); pass++; console.log('ok -', name); };

/* D1 en memoria: blobs + projects + sesión; batch transaccional (todo o nada) que falla `fail` veces */
const blobs = [], projects = new Map();
let fail = 0, batches = 0;
const exec = (sql, a) => {
  if (/^INSERT INTO blobs/.test(sql)) blobs.push({bkey: a[0], i: a[1], data: a[2]});
  else if (/^DELETE FROM blobs/.test(sql)) { for (let i = blobs.length - 1; i >= 0; i--) if (blobs[i].bkey === a[0]) blobs.splice(i, 1); }
  else if (/^UPDATE blobs SET bkey/.test(sql)) blobs.forEach(b => { if (b.bkey === a[1]) b.bkey = a[0]; });
  else if (/^INSERT INTO projects/.test(sql)) projects.set(a[0] + '|' + a[1], {name: a[2], updated: a[3], size: a[4]});
};
const DB = {
  prepare(sql) { let a = []; const st = {sql, get args() { return a; }, bind: (...x) => { a = x; return st; },
    run: async () => { exec(sql, a); return {}; },
    first: async () => { if (/FROM sessions/.test(sql)) return {id: 5, username: 'demo', role: 'user', status: 'active'};
      if (/FROM projects/.test(sql)) { const r = projects.get(a[0] + '|' + a[1]); return r ? {name: r.name, updated: r.updated} : null; } return null; },
    all: async () => ({results: /FROM blobs/.test(sql) ? blobs.filter(b => b.bkey === a[0]).sort((x, y) => x.i - y.i).map(b => ({data: b.data})) : []})}; return st; },
  async batch(sts) { batches++; if (fail > 0) { fail--; throw new Error('D1_ERROR: 503 Service Unavailable'); } sts.forEach(s => exec(s.sql, s.args)); return []; }
};
const env = {DB, ASSETS: {fetch: async () => new Response('asset')}};
const ORIGIN = 'https://oneknobmedia.com';
const put = (name, text) => W.fetch(new Request(ORIGIN + '/e-commerce-lab/api/projects/put?name=' + encodeURIComponent(name), {method: 'POST', headers: {origin: ORIGIN, cookie: 'okm_s=tok', 'content-type': 'application/json'}, body: text}), env);
const get = name => W.fetch(new Request(ORIGIN + '/e-commerce-lab/api/projects/get?name=' + encodeURIComponent(name), {headers: {cookie: 'okm_s=tok'}}), env);
const big = n => '{"x":"' + 'abcdefghij'.repeat(n / 10) + '"}';

await t('2 fallos 503 transitorios: guarda 200 y el texto (≈3,5 MB, 8 trozos, 2 lotes) vuelve idéntico', async () => {
  const text = big(3500000);
  fail = 2; batches = 0;
  const r = await put('punto case', text);
  assert.equal(r.status, 200);
  assert.equal(await (await get('punto case')).text(), text);
  assert.equal(batches, 3 + 2, 'lotes: 2 de trozos + 1 cambio de clave + 2 reintentos');
  assert.equal(blobs.filter(b => b.bkey.endsWith('~new')).length, 0);
});

await t('fallo permanente: no 200 y el proyecto anterior queda intacto', async () => {
  const before = await (await get('punto case')).text();
  fail = 99;
  const r = await put('punto case', '{"vacio":1}');
  fail = 0;
  assert.notEqual(r.status, 200);
  assert.equal(await (await get('punto case')).text(), before);
});

console.log(`\n${pass} ok`);
