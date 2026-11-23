// Pruebas de los pinceles de «Borrar fondo»: semillas, zoom/mano (BG-PAINT) y el worker (grow + seg con semillas).
// Uso: node tests/bgpaint.test.mjs ["ruta/al/MI APLICACION WEB.html"]
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
const a = html.indexOf('// BG-PAINT:start'), b = html.indexOf('// BG-PAINT:end');
assert.ok(a > 0 && b > a, 'bloque BG-PAINT no encontrado');
const P = new Function(html.slice(a, b) + '\nreturn {stampDisc, stampStroke, seedsFrom, vClamp, vZoomAt, VZ};')();
const w0 = html.indexOf('function workerMain()'), w1 = html.indexOf('\nlet WK = null');
const worker = new Function('self', html.slice(w0, w1) + '\nworkerMain();');
const call = (fn, o) => { let out; const self = {postMessage: m => { out = m; }}; worker(self); self.onmessage({data: Object.assign({fn, id: 1}, o)}); assert.ok(out.ok, out.err); return out.r; };

let pass = 0;
const t = (name, f) => { f(); pass++; console.log('ok -', name); };
const W = 160, H = 120, N = W * H;

t('estampado: disco exacto, trazo continuo sin huecos y recorte a los bordes', () => {
  const s = new Uint8Array(N); P.stampDisc(s, W, H, 20.5, 20.5, 5, 1);
  assert.equal(s[20 * W + 20], 1); assert.equal(s[20 * W + 27], 0);
  const n1 = s.reduce((x, y) => x + y, 0); assert.ok(n1 > 70 && n1 < 90, 'área ' + n1);
  const t2 = new Uint8Array(N); P.stampStroke(t2, W, H, {m: 2, r: 3, p: [[10, 60], [140, 60]]});
  for (let x = 10; x <= 140; x++) assert.equal(t2[60 * W + x], 2, 'hueco en x=' + x);
  const t3 = new Uint8Array(N); P.stampStroke(t3, W, H, {m: 1, r: 8, p: [[-5, -5]]}); assert.equal(t3[0], 1);
  assert.deepEqual([...P.seedsFrom([], W, H)].filter(Boolean), []);
});

t('el trazo posterior pisa al anterior', () => {
  const s = P.seedsFrom([{m: 1, r: 6, p: [[50, 50]]}, {m: 2, r: 3, p: [[50, 50]]}], W, H);
  assert.equal(s[50 * W + 50], 2); assert.equal(s[50 * W + 55], 1);
});

t('zoom: el punto bajo el cursor no se mueve, la escala se limita y la mano no sale del cuadro', () => {
  const box = 400, v = {k: 1, x: 0, y: 0};
  const z = P.vZoomAt(v, box, 300, 200, 3); assert.equal(z.k, 3);
  assert.ok(Math.abs((300 - z.x) / z.k - 300) < 1e-9 && Math.abs((200 - z.y) / z.k - 200) < 1e-9);
  assert.equal(P.vZoomAt(v, box, 0, 0, 99).k, P.VZ.max); assert.equal(P.vZoomAt(v, box, 0, 0, .1).k, 1);
  const c = P.vClamp({k: 2, x: 50, y: -999}, box); assert.deepEqual([c.x, c.y], [0, -400]);
  assert.deepEqual(P.vClamp({k: 1, x: -30, y: 20}, box), {k: 1, x: 0, y: 0});
});

// escena 160×120: fondo claro con ruido; pieza A (oscura), pieza B (oscura, falta en el automático), pieza C (azul) y mancha ajena J (gris, sobra en el automático)
function scene() {
  const px = new Uint8ClampedArray(N * 4), A = new Uint8Array(N), B = new Uint8Array(N), C = new Uint8Array(N), J = new Uint8Array(N); let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, g = 205 + (rnd() - .5) * 14; let r = g, gg = g, bl = g - 4;
    const inA = x >= 14 && x < 54 && y >= 28 && y < 92, inB = x >= 66 && x < 100 && y >= 34 && y < 86, inC = x >= 104 && x < 132 && y >= 40 && y < 80, inJ = x >= 20 && x < 44 && y >= 4 && y < 20;
    if (inA || inB) { r = 34 + rnd() * 14; gg = 32 + rnd() * 14; bl = 44 + rnd() * 14; if (inA) A[i] = 1; else B[i] = 1; }
    if (inC) { r = 30; gg = 70 + rnd() * 10; bl = 190; C[i] = 1; }
    if (inJ) { r = gg = bl = 120 + rnd() * 10; J[i] = 1; }
    px[i * 4] = r; px[i * 4 + 1] = gg; px[i * 4 + 2] = bl; px[i * 4 + 3] = 255;
  }
  return {px, A, B, C, J};
}
const autoAlpha = sc => { const al = new Uint8Array(N); for (let i = 0; i < N; i++) al[i] = sc.A[i] || sc.J[i] ? 255 : 0; return al; }; // B y C faltan, J sobra
const frac = (al, m, hi) => { let n = 0, k = 0; for (let i = 0; i < N; i++) if (m[i]) { k++; if (hi ? al[i] > 200 : al[i] < 40) n++; } return n / k; };
function refine(sc, strokes, snap = true) {
  const seeds = P.seedsFrom(strokes, W, H), base = autoAlpha(sc);
  const pr = snap ? new Float32Array(call('grow', {w: W, h: H, px: sc.px.buffer.slice(0), base: base.buffer.slice(0), seeds: seeds.buffer.slice(0), rmax: Math.max(...strokes.map(s => s.r))}).pr) : Float32Array.from(base, v => v / 255);
  const r = call('seg', {w: W, h: H, px: sc.px.buffer.slice(0), poly: null, flat: false, boxes: [], prior: pr.buffer, seeds: seeds.buffer.slice(0), force: true});
  return new Uint8Array(r.alpha);
}

t('Mantener sobre una pieza ausente la recupera entera, sin invadir el fondo ni la pieza vecina', () => {
  const sc = scene(), al = refine(sc, [{m: 1, r: 4, p: [[75, 50], [90, 70]]}]);
  assert.ok(frac(al, sc.B, true) > .9, 'pieza B ' + frac(al, sc.B, true));
  assert.ok(frac(al, sc.C, false) > .9, 'vecina C ' + frac(al, sc.C, false));
  const bg = new Uint8Array(N); for (let i = 0; i < N; i++) bg[i] = !sc.A[i] && !sc.B[i] && !sc.C[i] && !sc.J[i] ? 1 : 0;
  assert.ok(frac(al, bg, false) > .97, 'fondo ' + frac(al, bg, false));
  assert.ok(frac(al, sc.A, true) > .9, 'pieza A ' + frac(al, sc.A, true));
});

t('Borrar sobre la mancha ajena la quita y deja intacto el producto', () => {
  const sc = scene(), al = refine(sc, [{m: 2, r: 4, p: [[28, 10], [38, 14]]}]);
  assert.ok(frac(al, sc.J, false) > .9, 'mancha ' + frac(al, sc.J, false));
  assert.ok(frac(al, sc.A, true) > .9);
});

t('Mantener y Borrar a la vez (varios trazos) corrigen todo de una vez', () => {
  const sc = scene(), al = refine(sc, [{m: 1, r: 6, p: [[75, 45], [85, 60], [92, 78]]}, {m: 2, r: 6, p: [[28, 10], [38, 14]]}, {m: 1, r: 6, p: [[112, 48], [120, 70]]}]);
  assert.ok(frac(al, sc.B, true) > .9 && frac(al, sc.J, false) > .9 && frac(al, sc.C, true) > .9);
});

t('lo pintado manda: un agujero chico dentro del producto y una mota en el fondo se respetan (pintura exacta)', () => {
  const sc = scene(), hole = {m: 2, r: 3, p: [[34, 60]]}, dot = {m: 1, r: 2, p: [[150, 100]]}, al = refine(sc, [hole, dot], false);
  assert.equal(al[60 * W + 34], 0); assert.equal(al[100 * W + 150], 255);
  assert.ok(frac(al, sc.A, true) > .9);
});

t('con «ajustar al borde» un trazo chico no arrasa lo lejano: el alcance depende del tamaño del pincel', () => {
  const sc = scene(), al = refine(sc, [{m: 2, r: 3, p: [[20, 34]]}]), far = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sc.A[y * W + x] && Math.hypot(x - 20, y - 34) > 45) far[y * W + x] = 1;
  assert.ok(frac(al, far, true) > .9, 'zona lejana de A ' + frac(al, far, true));
  assert.equal(al[34 * W + 20], 0);
  const keepDot = refine(sc, [{m: 1, r: 3, p: [[150, 100]]}]); let bo = 0, bn = 0;
  for (let i = 0; i < N; i++) if (!sc.A[i] && !sc.B[i] && !sc.C[i] && !sc.J[i]) { bn++; if (keepDot[i] > 200) bo++; }
  assert.ok(bo / bn < .1, 'fondo invadido ' + bo / bn);
});

t('sin «ajustar al borde» la pintura es exacta y no se expande', () => {
  const sc = scene(), al = refine(sc, [{m: 1, r: 4, p: [[80, 60]]}], false);
  assert.equal(al[60 * W + 80], 255);
  assert.ok(frac(al, sc.B, true) < .3, 'no debe crecer: ' + frac(al, sc.B, true));
});

t('sin trazos efectivos el mapa de grow reproduce el recorte automático', () => {
  const sc = scene(), base = autoAlpha(sc), r = call('grow', {w: W, h: H, px: sc.px.buffer.slice(0), base: base.buffer.slice(0), seeds: new Uint8Array(N).buffer, rmax: 10}), pr = new Float32Array(r.pr);
  let ok = 0, tot = 0; for (let i = 0; i < N; i++) { tot++; if ((pr[i] >= .5) === (base[i] > 127)) ok++; }
  assert.ok(ok / tot > .97, 'coincidencia ' + ok / tot);
});

t('borrarlo todo o mantenerlo todo no rompe (resultado vacío o completo)', () => {
  const sc = scene(), all = new Uint8Array(N).fill(2), z = call('seg', {w: W, h: H, px: sc.px.buffer.slice(0), poly: null, flat: false, boxes: [], prior: new Float32Array(N).buffer, seeds: all.buffer, force: true});
  assert.equal(new Uint8Array(z.alpha).reduce((x, y) => x + y, 0), 0);
  const keep = new Uint8Array(N).fill(1), f = call('seg', {w: W, h: H, px: sc.px.buffer.slice(0), poly: null, flat: false, boxes: [], prior: new Float32Array(N).fill(1).buffer, seeds: keep.buffer, force: true});
  assert.ok(new Uint8Array(f.alpha).every(v => v === 255));
});

console.log(`\n${pass} pruebas OK`);
