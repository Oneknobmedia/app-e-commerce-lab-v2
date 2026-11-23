// Pruebas de fotos secundarias (bloque GAL-CORE de MI APLICACION WEB.html).
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8');
const core = html.slice(html.indexOf('// GAL-CORE:start'), html.indexOf('// GAL-CORE:end'));
assert.ok(core.length > 100, 'bloque GAL-CORE no encontrado');
const G = new Function(core + '; return {GAL_MAX, galOf, galSet, galMove, galDel};')();
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
const mk = n => ({id: 'p', gal: Array.from({length: n}, (_, i) => 'img' + i)});

t('máximo 10 fotos secundarias', () => { const p = {id: 'p'}; G.galSet(p, Array.from({length: 14}, (_, i) => 'x' + i)); assert.equal(p.gal.length, 10); assert.equal(G.galOf(mk(12)).length, 10); });
t('sin fotos no deja campo gal', () => { const p = mk(2); G.galSet(p, []); assert.equal('gal' in p, false); assert.deepEqual(G.galOf({id: 'q'}), []); });
t('mover cambia el orden y conserva todas', () => {
  const p = mk(4);
  assert.equal(G.galMove(p, 0, 3), true); assert.deepEqual(p.gal, ['img1', 'img2', 'img3', 'img0']);
  assert.equal(G.galMove(p, 3, 1), true); assert.deepEqual(p.gal, ['img1', 'img0', 'img2', 'img3']);
  assert.equal(G.galMove(p, 2, 2), false); assert.equal(G.galMove(p, -1, 2), false); assert.equal(G.galMove(p, 0, 9), false);
  assert.deepEqual([...p.gal].sort(), ['img0', 'img1', 'img2', 'img3']);
});
t('quitar una foto cierra el hueco; quitar la última borra gal', () => {
  const p = mk(3); assert.equal(G.galDel(p, 1), true); assert.deepEqual(p.gal, ['img0', 'img2']);
  assert.equal(G.galDel(p, 5), false); G.galDel(p, 0); G.galDel(p, 0); assert.equal('gal' in p, false);
});
t('se ignoran huecos vacíos', () => { assert.deepEqual(G.galOf({gal: ['a', '', 'b', null]}), ['a', 'b']); });
t('guardado en la nube: imágenes g0-id…g9-id y contador hg', () => {
  assert.ok(html.includes("m.set('g' + i + '-' + p.id, v)"));
  assert.ok(html.includes("{hg: Math.min(10, p.gal.length)}"));
  assert.ok(html.includes("get('g' + i + '-' + p.id)"));
  assert.ok(html.includes("put('g' + i + '-' + p.id"));
});
t('zoom recorre la galería unificada', () => { assert.ok(html.includes('const lbList = p => slotsOf(p);')); });
// ---- galería unificada (bloque PICS-CORE): principal + colores + secundarias, con nombre, hasta 13
const pic = html.slice(html.indexOf('// PICS-CORE:start'), html.indexOf('// PICS-CORE:end'));
assert.ok(pic.length > 200, 'bloque PICS-CORE no encontrado');
const hdr = ['const PIC_MAX', 'const slotsOf'].map(k => html.split('\n').find(l => l.startsWith(k))).join('\n');
const P = new Function(hdr + '\n' + pic + '; return {PIC_MAX, PIC_COL, slotsOf, picsOf, picsApply, picsMove, picsDel, picsAdd};')();
const full = () => ({id: 'p', img: 'a', vars: ['b', 'c'], gal: ['d', 'e'], vn: ['A', 'B', 'C', 'D', 'E']});
t('posiciones: 0 principal, 1-2 colores, 3+ secundarias', () => { assert.deepEqual(P.slotsOf(full()).map(x => x.c + x.s), ['0a', '1b', '2c', '3d', '4e']); assert.equal(P.PIC_MAX, 13); });
t('mover entre color y secundaria: la foto y su nombre viajan juntos', () => {
  const p = full(); assert.equal(P.picsMove(p, 0, 3), true);
  assert.equal(p.img, 'b'); assert.deepEqual(p.vars, ['c', 'd']); assert.deepEqual(p.gal, ['a', 'e']); assert.deepEqual(p.vn, ['B', 'C', 'D', 'A', 'E']);
  assert.equal(P.picsMove(p, 2, 2), false); assert.equal(P.picsMove(p, 0, 9), false);
});
t('quitar una foto cierra el hueco y quita su nombre', () => { const p = full(); assert.equal(P.picsDel(p, 1), true); assert.equal(p.img, 'a'); assert.deepEqual(p.vars, ['c', 'd']); assert.deepEqual(p.gal, ['e']); assert.deepEqual(p.vn, ['A', 'C', 'D', 'E']); assert.equal(P.picsDel(p, 9), false); });
t('sin fotos no quedan campos huérfanos', () => { const p = {id: 'q', img: 'a', vn: ['A']}; P.picsDel(p, 0); assert.equal(p.img, ''); assert.equal('vars' in p, false); assert.equal('gal' in p, false); assert.equal('vn' in p, false); });
t('máximo 13 y subida múltiple en orden', () => {
  const p = {id: 'q'}; assert.equal(P.picsAdd(p, Array.from({length: 20}, (_, i) => 'u' + i)), 13); assert.equal(p.img, 'u0'); assert.deepEqual(p.vars, ['u1', 'u2']); assert.equal(p.gal.length, 10); assert.equal(P.picsAdd(p, ['x']), 0);
});
t('un hueco en los colores se compacta sin perder fotos', () => { const p = {id: 'q', img: 'a', vars: ['', 'c'], vn: ['A', '', 'C']}; P.picsApply(p, P.picsOf(p)); assert.equal(p.img, 'a'); assert.deepEqual(p.vars, ['c']); assert.deepEqual(p.vn, ['A', 'C']); });
t('dos productos no se mezclan', () => { const a = full(), b = {id: 'z', img: 'k'}; P.picsMove(a, 0, 4); assert.equal(b.img, 'k'); assert.equal('gal' in b, false); assert.equal('vn' in b, false); });
t('nombres hasta 13 viajan a la nube con el producto', () => { assert.ok(html.includes('p.vn.slice(0, 13)')); });
console.log(`\n${pass} pruebas OK`);
