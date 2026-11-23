// Pruebas de «Borrar fondo»: ayudas del modelo local (BG-NET) y máscara guiada del worker (seg con prior + cajas).
// Uso: node tests/bgmask.test.mjs ["ruta/al/MI APLICACION WEB.html"]
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
const a = html.indexOf('// BG-NET:start'), b = html.indexOf('// BG-NET:end');
assert.ok(a > 0 && b > a, 'bloque BG-NET no encontrado');
const H = new Function(html.slice(a, b) + '\nreturn {NET, netInput, netNorm, netUp, bgBoxes, bgPrompt};')();

const w0 = html.indexOf('function workerMain()'), w1 = html.indexOf('\nlet WK = null');
assert.ok(w0 > 0 && w1 > w0, 'workerMain no encontrado');
const worker = new Function('self', html.slice(w0, w1) + '\nworkerMain();');
const seg = o => { let out; const self = {postMessage: m => { out = m; }}; worker(self); self.onmessage({data: Object.assign({fn: 'seg', id: 1}, o)}); assert.ok(out.ok, out.err); return out.r; };

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok -', name); };

t('modelo: huella y tamaño configurados', () => {
  assert.equal(H.NET.size, 4574861); assert.match(H.NET.sha, /^[0-9a-f]{64}$/); assert.match(H.NET.model, /^https:\/\/huggingface\.co\/.+u2netp\.onnx$/);
});

t('netNorm lleva el mapa a 0–1 y netUp conserva forma y rango', () => {
  const m = H.netNorm(Float32Array.from([-3, 0, 5, 1]));
  assert.equal(Math.min(...m), 0); assert.equal(Math.max(...m), 1);
  const S = 4, mm = new Float32Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) mm[y * S + x] = x >= 2 ? 1 : 0;
  const up = H.netUp(mm, S, 40, 20);
  assert.equal(up.length, 800); assert.ok(up[10] < .05 && up[39] > .95 && up[20 * 20 + 20] > .3 && up[20 * 20 + 20] < .7);
});

t('netInput: tensor NCHW normalizado por el máximo', () => {
  const S = 2, d = new Uint8ClampedArray(S * S * 4).fill(255); const f = H.netInput(d, S);
  assert.equal(f.length, 12); assert.ok(Math.abs(f[0] - (1 - .485) / .229) < 1e-4);
});

t('cajas de la IA: píxeles, orden, descarte de vacías y de «toda la foto»', () => {
  const v = {piezas: [[100, 100, 400, 500], [900, 600, 700, 900], [10, 10, 15, 15], 'x', [1, 2]]};
  assert.deepEqual(H.bgBoxes(v, 1000, 1000), [[100, 100, 400, 500], [700, 600, 900, 900]]);
  assert.deepEqual(H.bgBoxes({piezas: [[0, 0, 1000, 1000]]}, 800, 800), []);
  assert.deepEqual(H.bgBoxes({bbox: [200, 200, 600, 600]}, 100, 100), [[20, 20, 60, 60]]);
  assert.deepEqual(H.bgBoxes(null, 100, 100), []); assert.deepEqual(H.bgBoxes({piezas: 'nada'}, 100, 100), []);
});

t('el prompt de la IA incluye nombre, categoría y pide piezas', () => {
  const p = H.bgPrompt('CARCASA MAGNETICA IPHONE 15 PRO', 'ACCESORIOS DE CELULAR', 'SEROS');
  assert.match(p, /CARCASA MAGNETICA IPHONE 15 PRO/); assert.match(p, /ACCESORIOS DE CELULAR/); assert.match(p, /"piezas"/);
  assert.match(H.bgPrompt('', '', ''), /identifica qué producto/);
});

// foto sintética 120×90: fondo con degradado y ruido, dos piezas oscuras y una mancha ajena
const W = 120, Hh = 90, N = W * Hh;
function scene() {
  const px = new Uint8ClampedArray(N * 4), obj = new Uint8Array(N), junk = new Uint8Array(N); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, g = 170 + x * .25 + (rnd() - .5) * 18; let r = g, gg = g - 6, bl = g - 14;
    const p1 = x >= 20 && x < 55 && y >= 20 && y < 70, p2 = x >= 65 && x < 90 && y >= 30 && y < 60, jk = x >= 100 && x < 116 && y >= 6 && y < 22;
    if (p1 || p2) { r = 28 + rnd() * 20; gg = 26 + rnd() * 20; bl = 40 + rnd() * 20; obj[i] = 1; }
    if (jk) { r = 40; gg = 70; bl = 50; junk[i] = 1; }
    px[i * 4] = r; px[i * 4 + 1] = gg; px[i * 4 + 2] = bl; px[i * 4 + 3] = 255;
  }
  return {px, obj, junk};
}
function prior(obj, junk, shift) { // mapa «del modelo»: producto desplazado unos píxeles + mancha ajena
  const pr = new Float32Array(N);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const i = y * W + x, j = y * W + Math.min(W - 1, Math.max(0, x - shift)); pr[i] = obj[j] || junk[i] ? .9 : .05; }
  return pr;
}
const run = (pr, boxes, px) => { const r = seg({w: W, h: Hh, px: px.buffer.slice(0), poly: null, flat: false, boxes, prior: pr ? pr.buffer : null}); return new Uint8Array(r.alpha); };
const frac = (al, m, hi) => { let n = 0, k = 0; for (let i = 0; i < N; i++) if (m[i]) { k++; if (hi ? al[i] > 200 : al[i] < 40) n++; } return n / k; };

t('con el modelo local: producto (2 piezas) opaco, fondo transparente, borde afinado aunque el mapa venga corrido', () => {
  const {px, obj, junk} = scene(), al = run(prior(obj, junk, 2), [], px);
  assert.ok(frac(al, obj, true) > .9, 'producto ' + frac(al, obj, true));
  const bg = new Uint8Array(N); for (let i = 0; i < N; i++) bg[i] = !obj[i] && !junk[i] ? 1 : 0;
  assert.ok(frac(al, bg, false) > .93, 'fondo ' + frac(al, bg, false));
});

t('con cajas de la IA se quita la mancha ajena y se conservan las dos piezas', () => {
  const {px, obj, junk} = scene(), pr = prior(obj, junk, 0);
  const sin = run(pr, [], px), con = run(pr, [[18, 18, 57, 72], [63, 28, 92, 62]], px);
  assert.ok(frac(sin, junk, true) > .5, 'sin cajas la mancha permanece');
  assert.ok(frac(con, junk, false) > .9, 'con cajas se quita ' + frac(con, junk, false));
  assert.ok(frac(con, obj, true) > .9, 'producto ' + frac(con, obj, true));
});

t('el contorno del modelo corrido 3 px (2,5 % del ancho) no borra el producto', () => {
  const {px, obj, junk} = scene(), al = run(prior(obj, junk, 3), [], px);
  assert.ok(frac(al, obj, true) > .8, 'producto ' + frac(al, obj, true));
});

t('si la IA se equivoca (cajas que no tocan el producto) se confía en el modelo', () => {
  const {px, obj, junk} = scene(), al = run(prior(obj, junk, 0), [[0, 0, 12, 12]], px);
  assert.ok(frac(al, obj, true) > .9);
});

t('mapa del modelo vacío o que cubre toda la foto: cae al recorte por color sin romperse', () => {
  const {px, obj} = scene();
  for (const v of [0, 1]) { const al = run(new Float32Array(N).fill(v), [], px); assert.ok(frac(al, obj, true) > .85, 'prior ' + v); }
});

console.log(`\n${pass} pruebas OK`);
