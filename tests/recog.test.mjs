// Pruebas de «Reconocer producto» en el editor: fondo blanco, mejor foto y casillas por defecto (bloque RECOG-CORE).
// Uso: node tests/recog.test.mjs ["ruta/al/MI APLICACION WEB.html"]
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
const a = html.indexOf('// RECOG-CORE:start'), b = html.indexOf('// RECOG-CORE:end');
assert.ok(a > 0 && b > a, 'bloque RECOG-CORE no encontrado');
const R = new Function(html.slice(a, b) + '\nreturn {whiteScore, pickCatalog, recogPlan};')();
let pass = 0;
const t = (name, f) => { f(); pass++; console.log('ok -', name); };

/* imagen sintética w×h: fondo de color bg (o transparente) y un producto oscuro al centro */
function img(w, h, bg, opts = {}) {
  const d = new Uint8ClampedArray(w * h * 4); let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, inP = x > w * .25 && x < w * .75 && y > h * .2 && y < h * .8, n = opts.noise ? (rnd() - .5) * opts.noise : 0;
    const c = inP ? [30, 30, 40] : bg.map(v => v + n);
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = inP ? 255 : (opts.alpha != null ? opts.alpha : 255);
  }
  return d;
}

t('fondo blanco de catálogo puntúa alto; foto real, gris o de color puntúan bajo', () => {
  const W = 120, H = 120;
  assert.ok(R.whiteScore(img(W, H, [255, 255, 255]), W, H) > .9);
  assert.ok(R.whiteScore(img(W, H, [250, 249, 247], {noise: 4}), W, H) > .8, 'blanco casi puro con ruido leve');
  assert.ok(R.whiteScore(img(W, H, [0, 0, 0], {alpha: 0}), W, H) > .9, 'PNG transparente cuenta como blanco');
  assert.ok(R.whiteScore(img(W, H, [200, 200, 200]), W, H) < .1, 'gris');
  assert.ok(R.whiteScore(img(W, H, [250, 230, 200]), W, H) < .1, 'crema/color');
  assert.ok(R.whiteScore(img(W, H, [140, 120, 100], {noise: 120}), W, H) < .1, 'foto con fondo cargado');
  assert.equal(R.whiteScore(new Uint8ClampedArray(0), 0, 0), 0);
});

t('foto que toca el borde (producto cortado) no pasa como catálogo', () => {
  const W = 100, H = 100, d = img(W, H, [255, 255, 255]);
  for (let y = 0; y < H; y++) for (let x = 0; x < 30; x++) { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 40; }
  assert.ok(R.whiteScore(d, W, H) < .6);
});

t('pickCatalog: primero fondo blanco, después la más grande; vacío → null', () => {
  const c = [{url: 'a', score: .3, w: 2000, h: 2000}, {url: 'b', score: .92, w: 600, h: 600}, {url: 'c', score: .95, w: 1200, h: 1200}, {url: 'd', score: .7, w: 300, h: 300}];
  assert.equal(R.pickCatalog(c).url, 'c');
  assert.equal(R.pickCatalog([{url: 'x', score: .2, w: 100, h: 100}, {url: 'y', score: .25, w: 900, h: 900}]).url, 'y');
  assert.equal(R.pickCatalog([]), null);
});

t('casillas por defecto: foto si hay fondo blanco; nombre si es seguro o el actual es de relleno; precio solo si no hay precio real', () => {
  const r = {name: 'AUDÍFONOS JBL TUNE 520BT', conf: .9, price: 37990};
  assert.deepEqual(R.recogPlan({name: 'Descripción del producto', pd: 1000}, r, {score: .9}), {photo: true, name: true, price: true});
  assert.deepEqual(R.recogPlan({name: 'AUDIFONO', pd: 15990}, r, {score: .4}), {photo: false, name: true, price: false});
  assert.deepEqual(R.recogPlan({name: 'AUDIFONO', pd: 0}, {name: 'X', conf: .3, price: 0}, null), {photo: false, name: false, price: false});
  assert.equal(R.recogPlan({name: '', pd: ''}, {name: 'X', conf: .1, price: 5000}, null).name, true, 'sin nombre: se propone');
});

/* lensItems: lo que llega al pegar o arrastrar desde la ventana de Google Lens */
const li = html.indexOf('function lensItems(dt) {'), le = html.indexOf('\n}\n', li);
assert.ok(li > 0 && le > li, 'lensItems no encontrado');
const lensItems = new Function(html.slice(li, le + 2) + '\nreturn lensItems;')();
const DT = (o, files = []) => ({files, getData: k => o[k] || ''});
t('lensItems: archivo de imagen, <img> copiada, data:, dirección https; texto suelto o http → nada', () => {
  const f = {type: 'image/png', name: 'x.png'};
  assert.deepEqual(lensItems(DT({}, [{type: 'text/plain'}, f])), [f]);
  assert.deepEqual(lensItems(DT({'text/html': '<meta><img alt="" src="https://encrypted-tbn0.gstatic.com/images?q=1&amp;s=2">'})), ['https://encrypted-tbn0.gstatic.com/images?q=1&s=2']);
  assert.deepEqual(lensItems(DT({'text/html': '<img src="data:image/jpeg;base64,AAAA">'})), ['data:image/jpeg;base64,AAAA']);
  assert.deepEqual(lensItems(DT({'text/uri-list': 'https://media.falabella.com/a.jpg'})), ['https://media.falabella.com/a.jpg']);
  assert.deepEqual(lensItems(DT({'text/plain': 'Consola R36S $52.990'})), []);
  assert.deepEqual(lensItems(DT({'text/plain': 'http://inseguro.com/a.jpg'})), []);
  assert.deepEqual(lensItems(null), []);
});

t('editor: ya no muestra diagnóstico de Vision/SerpApi y abre Lens por uploadbyurl', () => {
  assert.ok(!/res\.diag|GOOGLE_VISION|serpapi/i.test(html.slice(html.indexOf('function recogDialog'), html.indexOf('function bulkRecog'))));
  assert.ok(/lens\\\.google\\\.com/.test(html), 'valida la dirección de Lens');
});

console.log(`\n${pass} pruebas OK`);
