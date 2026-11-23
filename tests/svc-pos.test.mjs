// Pruebas v2.10.4: posición libre de «Servicio técnico» (bloque SVC-POS de MI APLICACION WEB.html).
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8');
const core = html.slice(html.indexOf('// SVC-POS:start'), html.indexOf('// SVC-POS:end'));
assert.ok(core.length > 100, 'bloque SVC-POS no encontrado');
const make = S => new Function('S', core + '; return {svcAt, svcIns};')(S);
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
const cats = ['A', 'B', 'C', 'D'];
const run = (pos, arr = cats) => { const S = {store: pos === undefined ? {} : {svcPos: pos}}; return make(S).svcIns(arr, 'SVC'); };

t('sin dato: al final (null = lo decide el orden de siempre)', () => { assert.equal(run(undefined), null); assert.equal(run(''), null); assert.equal(run(null), null); });
t('0 = al principio', () => assert.deepEqual(run(0), ['SVC', 'A', 'B', 'C', 'D']));
t('2 (y "2" del selector) = después de la 2.ª', () => { assert.deepEqual(run(2), ['A', 'B', 'SVC', 'C', 'D']); assert.deepEqual(run('2'), ['A', 'B', 'SVC', 'C', 'D']); });
t('3 = antes de la última; ≥ n = al final', () => { assert.deepEqual(run(3), ['A', 'B', 'C', 'SVC', 'D']); assert.equal(run(4), null); assert.equal(run(99), null); });
t('valores raros o negativos = al final, no rompe', () => { assert.equal(run(-1), null); assert.equal(run('x'), null); assert.equal(run(NaN), null); });
t('sin categorías: al final', () => { assert.equal(run(0, []), null); });
t('conectado en chips(), nav() y panel', () => { for (const k of ['svcIns(chipsCat, svcB)', 'svcIns(mlCats, mlSvc)', "F.sel('Posición en pastillas y menú', '@store.svcPos'"]) assert.ok(html.includes(k), k); });
console.log(`\n${pass} pruebas OK`);
