// Pruebas v2.10.3: lienzo fijo (bloque VIEW-CORE de MI APLICACION WEB.html) y vistas responsive conectadas.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8');
const core = html.slice(html.indexOf('// VIEW-CORE:start'), html.indexOf('// VIEW-CORE:end'));
assert.ok(core.length > 100, 'bloque VIEW-CORE no encontrado');
const {viewClamp} = new Function(core + '; return {viewClamp};')();
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
const VW = 900, VH = 700;
/* misma fórmula que fit(): ancho ajustado, centrado, arriba 24 */
const fitV = w => { const z = Math.min(1.5, Math.max(.1, (VW - 64) / w)); return {z, x: (VW - w * z) / 2, y: 24}; };

t('si cabe a lo ancho, X siempre centrado aunque se arrastre/ruede de lado', () => {
  for (const dx of [-500, -3, 0, 7, 800]) assert.equal(viewClamp({x: 100 + dx, y: 24}, VW, VH, 390, 5000).x, (VW - 390) / 2);
});
t('Y acotada: no se pasa del inicio ni del final del catálogo', () => {
  assert.equal(viewClamp({x: 0, y: 400}, VW, VH, 390, 5000).y, 24);
  assert.equal(viewClamp({x: 0, y: -99999}, VW, VH, 390, 5000).y, VH - 5000 - 24);
  assert.equal(viewClamp({x: 0, y: -1000}, VW, VH, 390, 5000).y, -1000);
});
t('catálogo corto: queda arriba fijo', () => { assert.equal(viewClamp({x: 0, y: -300}, VW, VH, 390, 400).y, 24); });
t('con zoom mayor que la vista: se puede recorrer de lado pero nunca sale de pantalla', () => {
  assert.equal(viewClamp({x: 300, y: 24}, VW, VH, 2000, 9000).x, 24);
  assert.equal(viewClamp({x: -5000, y: 24}, VW, VH, 2000, 9000).x, VW - 2000 - 24);
  assert.equal(viewClamp({x: -500, y: 24}, VW, VH, 2000, 9000).x, -500);
});
t('5 vistas + Ajustar: centradas y sin desborde', () => {
  for (const w of [390, 844, 768, 1024, 1440]) {
    const f = fitV(w), r = viewClamp(f, VW, VH, w * f.z, 6000 * f.z);
    assert.ok(Math.abs(r.x - f.x) < 1e-9 && r.x >= 0 && r.x + w * f.z <= VW, 'vista ' + w);
    assert.equal(r.y, 24);
  }
});
t('zoom +/− al centro: el tablero sigue centrado', () => {
  for (const z of [.5, .75, 1.25]) { const x = 450 - (450 - 255) * z; assert.equal(viewClamp({x, y: 24}, VW, VH, 390 * z, 5000 * z).x, (VW - 390 * z) / 2); }
});
t('conectado: applyView usa viewClamp; zoom, Ajustar y 5 vistas siguen', () => {
  for (const k of ['Object.assign(V, viewClamp(V,', "zoomIn: () => zoomStep(1)", "zoomOut: () => zoomStep(-1), fit,", "const VKW = {m: 390, ml: 844, t: 768, tl: 1024, w: 1440}", 'requestAnimationFrame(fit)', 'data-cmd="vkML"', 'data-cmd="vkTL"']) assert.ok(html.includes(k), k);
});
console.log(`\n${pass} pruebas OK`);
