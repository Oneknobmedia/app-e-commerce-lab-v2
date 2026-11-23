// Pruebas del backend «Reconocer producto» v2.6 (Google Lens en el navegador): foto temporal, ruta /recognize/lens, IA y proxy.
// Uso: node tests/recog-worker.test.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'worker-e-commerce-lab', 'src-original', 'src');
const R = await import(pathToFileURL(path.join(SRC, 'recognize.js')).href);
const W = (await import(pathToFileURL(path.join(SRC, 'index.js')).href)).default;
let pass = 0;
const t = async (name, f) => { await f(); pass++; console.log('ok -', name); };

/* D1 en memoria: lens_tmp + una sesión válida */
const rows = new Map();
const DB = {prepare(sql) { let args = []; const st = {bind: (...a) => { args = a; return st; },
  run: async () => { if (/^INSERT INTO lens_tmp/.test(sql)) rows.set(args[0], {data: args[1], exp: args[2]}); else if (/^DELETE FROM lens_tmp WHERE exp/.test(sql)) for (const [k, v] of rows) if (v.exp < args[0]) rows.delete(k); return {}; },
  first: async () => { if (/FROM sessions/.test(sql)) return {id: 1, username: 'demo', role: 'user', status: 'active'}; if (/FROM lens_tmp/.test(sql)) { const r = rows.get(args[0]); return r && r.exp > args[1] ? {data: r.data} : null; } return null; }}; return st; }};
const AI = {run: async () => ({response: JSON.stringify({type: 'consola', brand: '', model: 'R36S', name: 'consola de juegos portátil r36s', query: 'consola r36s', conf: .6})})};
const env = {DB, AI, AI_LIMIT: {limit: async () => ({success: true})}, ASSETS: {fetch: async () => new Response('asset')}};
const JPG = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes-123').toString('base64');
const ORIGIN = 'https://oneknobmedia.com';
const post = (p, body, cookie = true) => new Request(ORIGIN + p, {method: 'POST', headers: Object.assign({'content-type': 'application/json', origin: ORIGIN}, cookie ? {cookie: 'okm_s=tok'} : {}), body: JSON.stringify(body)});

await t('/recognize/lens: sin sesión 401, otro origen 403, GET 405, sin foto 400', async () => {
  assert.equal((await W.fetch(post('/e-commerce-lab/api/recognize/lens', {image: JPG}, false), env)).status, 401);
  assert.equal((await W.fetch(new Request(ORIGIN + '/e-commerce-lab/api/recognize/lens', {method: 'POST', headers: {origin: 'https://malo.com', cookie: 'okm_s=tok'}, body: '{}'}), env)).status, 403);
  assert.equal((await W.fetch(new Request(ORIGIN + '/e-commerce-lab/api/recognize/lens'), env)).status, 405);
  assert.equal((await W.fetch(post('/e-commerce-lab/api/recognize/lens', {image: 'data:image/png;base64,AAAA'}), env)).status, 400);
});

await t('/recognize/lens con sesión: guarda la foto 30 min y devuelve la URL de Lens; la foto se puede descargar sin sesión', async () => {
  const r = await W.fetch(post('/e-commerce-lab/api/recognize/lens', {image: JPG}), env), d = await r.json();
  assert.equal(r.status, 200);
  assert.match(d.url, /^https:\/\/oneknobmedia\.com\/e-commerce-lab\/api\/lens\/[a-f0-9]{32}\.jpg$/);
  assert.equal(d.lens, 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(d.url) + '&hl=es-419');
  const id = d.url.match(/([a-f0-9]{32})\.jpg$/)[1];
  assert.ok(rows.get(id).exp - Date.now() / 1000 > 1700, 'vence en ~30 min');
  const img = await W.fetch(new Request(d.url), env);
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/jpeg'); assert.equal((await img.arrayBuffer()).byteLength, 19);
  assert.equal(img.headers.get('x-robots-tag'), 'noindex');
});

await t('foto temporal: id inválido o vencido → 404', async () => {
  assert.equal((await R.lensServe(env, '../x.jpg')).status, 404);
  assert.equal((await R.lensServe(env, 'a'.repeat(32) + '.jpg')).status, 404);
  rows.set('b'.repeat(32), {data: JPG, exp: 1}); assert.equal((await R.lensServe(env, 'b'.repeat(32) + '.jpg')).status, 404);
});

await t('/recognize: solo la IA del sitio sugiere el nombre; no llama a ningún servicio externo', async () => {
  const real = globalThis.fetch, seen = []; globalThis.fetch = async u => { seen.push(String(u)); return new Response('no', {status: 500}); };
  const r = await W.fetch(post('/e-commerce-lab/api/recognize', {image: JPG, hint: 'x'}), env), d = await r.json();
  globalThis.fetch = real;
  assert.equal(r.status, 200); assert.deepEqual(seen, [], 'sin fetch externo');
  assert.equal(d.name, 'CONSOLA DE JUEGOS PORTÁTIL R36S'); assert.equal(d.model, 'R36S'); assert.equal(d.search, 'lens');
  assert.deepEqual([d.images, d.prices, d.price], [[], [], 0], 'nada inventado');
  const bad = await R.recognize({AI: {run: async () => { throw new Error('caída'); }}}, {image: JPG}, x => x.response);
  assert.equal(bad.name, ''); assert.equal(bad.conf, 0);
});

await t('clp y proxy de imagen: rechaza http, vacío y errores', async () => {
  assert.equal(R.clp('$12.990'), 12990); assert.equal(R.clp('CLP 1.299.990'), 1299990); assert.equal(R.clp('1,5'), 0); assert.equal(R.clp(5), 0);
  assert.equal((await R.imgProxy('http://x.com/a.jpg')).status, 400);
  assert.equal((await R.imgProxy('')).status, 400);
  assert.equal((await R.imgProxy('https://127.0.0.1:1/a.jpg')).status, 502);
  assert.equal((await W.fetch(new Request(ORIGIN + '/e-commerce-lab/api/recognize/img?u=https://x.cl/a.jpg'), env)).status, 401, 'proxy pide sesión');
});

await t('recognize.js ya no contiene Vision, SerpApi, MercadoLibre ni scraping de tiendas', async () => {
  for (const k of ['fromVision', 'fromLens', 'storeSearch', 'falabellaList', 'parisList', 'mlSearch', 'scoreMatch', 'ldProduct']) assert.equal(R[k], undefined, k);
});

console.log(`\n${pass} pruebas OK`);
