// Pruebas del motor de eventos (bloque EVT-CORE de MI APLICACION WEB.html).
// Uso: node tests/eventos.test.mjs ["ruta/al/MI APLICACION WEB.html"]
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8');
const core = html.slice(html.indexOf('// EVT-CORE:start'), html.indexOf('// EVT-CORE:end'));
assert.ok(core.length > 200, 'bloque EVT-CORE no encontrado');

// mismas utilidades y precio cobrado que la app (unitOf / hasMay / minQ)
const make = new Function('env', `
  let S = env.S;
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const prod = id => { for (const c of S.cats) { const p = c.products.find(p => p.id === id); if (p) return p; } };
  const catOfProd = pid => S.cats.find(c => c.products.some(p => p.id === pid));
  ${core}
  const hasMay = p => num(p.pm) > 0 && num(p.pm) < num(p.pd);
  const unitOf = (p, q) => { const e = evPrice(p); return hasMay(p) && q >= 6 ? Math.min(num(p.pm), e) : e; };
  return {get S() { return S; }, set S(v) { S = v; EVX = null; }, ownPct, evBase, evCalc, evBefore, evPctOk, isEv, evOf, evPrice, catProds, evAssign, evUnassign, evNorm, unitOf, reset: () => { EVX = null; }};
`);

const seed = () => ({cats: [
  {id: 'c1', name: 'AUDIO', products: [{id: 'a', desc: 'Audífonos', pd: 10000, pm: 0}, {id: 'b', desc: 'Parlante', pd: 19990, pm: 15000}]},
  {id: 'c2', name: 'CABLES', products: [{id: 'c', desc: 'Cable USB-C', pd: 2990, pm: 0}, {id: 'd', desc: 'Cargador', pd: 7, pm: 0}]},
]});
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok -', name); };

t('% válido solo enteros 1–99', () => {
  const E = make({S: seed()});
  for (const [v, r] of [['30', 30], [1, 1], [99, 99], ['0', 0], ['100', 0], ['-5', 0], ['12.5', 0], ['abc', 0], ['', 0], [null, 0], [' 45 ', 45]]) assert.equal(E.evPctOk(v), r, String(v));
});

t('crear evento: referencias, categorías originales intactas, precio original intacto', () => {
  const S = seed(); const E = make({S});
  const ev = {id: 'e1', name: 'Black Friday', products: [], ev: {pct: 30, ids: []}}; S.cats.unshift(ev);
  assert.equal(E.evAssign(ev, ['a', 'b', 'c']), 3);
  assert.deepEqual(E.catProds(ev).map(p => p.id), ['a', 'b', 'c']);
  assert.equal(S.cats[1].products.length, 2); assert.equal(S.cats[2].products.length, 2);
  assert.equal(E.evPrice(E.catProds(ev)[0]), 7000);           // 10000 × 0.70
  assert.equal(E.evPrice(S.cats[1].products[1]), 13993);      // 19990 × 0.70 = 13993
  assert.equal(S.cats[1].products[0].pd, 10000);              // no destructivo
  assert.equal(JSON.stringify(S).split('"Audífonos"').length - 1, 1); // sin duplicar al serializar
});

t('sin duplicados ni productos inexistentes', () => {
  const S = seed(); const E = make({S});
  const ev = {id: 'e1', name: 'X', products: [], ev: {pct: 10, ids: []}}; S.cats.push(ev);
  assert.equal(E.evAssign(ev, ['a', 'a', 'zz', 'a']), 1);
  assert.equal(E.evAssign(ev, ['a']), 0);
  assert.deepEqual(ev.ev.ids, ['a']);
});

t('cambiar % actualiza precios; añadir después recibe % vigente; quitar restaura', () => {
  const S = seed(); const E = make({S});
  const ev = {id: 'e1', name: 'Cyber', products: [], ev: {pct: 30, ids: []}}; S.cats.push(ev);
  E.evAssign(ev, ['a']); const a = S.cats[0].products[0], c = S.cats[1].products[0];
  assert.equal(E.evPrice(a), 7000);
  ev.ev.pct = 40; E.reset(); assert.equal(E.evPrice(a), 6000);
  E.evAssign(ev, ['c']); assert.equal(E.evPrice(c), 1794); // 2990 × 0.60 = 1794
  assert.ok(E.evUnassign(ev, 'c')); assert.equal(E.evPrice(c), 2990); assert.equal(E.evOf(c), null);
});

t('varios eventos: mayor descuento, sin acumular', () => {
  const S = seed(); const E = make({S});
  const e1 = {id: 'e1', name: 'BF', products: [], ev: {pct: 20, ids: []}}, e2 = {id: 'e2', name: 'CD', products: [], ev: {pct: 35, ids: []}};
  S.cats.push(e1, e2); E.evAssign(e1, ['a']); E.evAssign(e2, ['a']);
  const a = S.cats[0].products[0];
  assert.equal(E.evOf(a).pct, 35); assert.equal(E.evOf(a).name, 'CD'); assert.equal(E.evPrice(a), 6500);
  E.evUnassign(e2, 'a'); assert.equal(E.evPrice(a), 8000); // vuelve a la otra promo válida
});

t('carrito: mayorista y evento no se suman (se cobra el menor)', () => {
  const S = seed(); const E = make({S});
  const ev = {id: 'e1', name: 'BF', products: [], ev: {pct: 10, ids: []}}; S.cats.push(ev); E.evAssign(ev, ['b']);
  const b = S.cats[0].products[1];
  assert.equal(E.unitOf(b, 1), 17991);   // 19990 × 0.90
  assert.equal(E.unitOf(b, 6), 15000);   // por mayor menor que evento
  ev.ev.pct = 50; E.reset(); assert.equal(E.unitOf(b, 6), 9995); // evento menor que por mayor
});

t('redondeo entero y precios pequeños', () => {
  const S = seed(); const E = make({S});
  const ev = {id: 'e1', name: 'BF', products: [], ev: {pct: 33, ids: []}}; S.cats.push(ev); E.evAssign(ev, ['d']);
  assert.equal(E.evPrice(S.cats[1].products[1]), 5); // 7 × 0.67 = 4.69 → 5
});

t('evNorm sanea datos guardados (migración compatible)', () => {
  const d = {cats: [...seed().cats, {id: 'e1', name: 'BF', ev: {pct: '250', ids: ['a', 'a', 'gone', 3]}}, {id: 'e2', name: 'Raro', products: [], ev: 'x'}]};
  const E = make({S: d}); E.evNorm(d);
  assert.deepEqual(d.cats[2].ev, {pct: 99, ids: ['a']}); assert.deepEqual(d.cats[2].products, []);
  assert.equal(d.cats[3].ev, undefined);
  const old = seed(); E.evNorm(old); assert.deepEqual(old, seed()); // catálogos sin eventos no cambian
});

t('borrar producto original lo saca del evento (removeProd)', () => {
  assert.match(html, /function removeProd\(pid\) \{[^\n]*if \(isEv\(c\)\) c\.ev\.ids = c\.ev\.ids\.filter\(x => x !== pid\)/);
});

t('ev se conserva en guardado de nube (slim) y en su carga', () => {
  assert.equal(html.split("CTAGS[c.tag] ? {tag: c.tag} : {}, ").length - 1, 2);
  assert.equal(html.split("c.ev ? {ev: c.ev} : {}))").length - 1, 2);
});

t('% propio por producto (ev.pp): sobrescribe el general; sin él sigue al general', () => {
  const S = seed(); const E = make({S});
  const ev = {id: 'e1', name: 'Cyber', products: [], ev: {pct: 30, ids: [], pp: {b: 50}}}; S.cats.push(ev);
  E.evAssign(ev, ['a', 'b']);
  assert.equal(E.evPrice(S.cats[0].products[0]), 7000);
  assert.equal(E.evPrice(S.cats[0].products[1]), 9995);
  ev.ev.pct = 20; E.reset();
  assert.equal(E.evPrice(S.cats[0].products[0]), 8000);
  assert.equal(E.evPrice(S.cats[0].products[1]), 9995);
  ev.ev.pp.b = 10; E.reset();
  assert.equal(E.evPrice(S.cats[0].products[1]), 17991);
  assert.equal(E.evOf(S.cats[0].products[1]).pct, 10);
});

t('pp: quitar producto lo limpia; evNorm descarta % inválidos y ids inexistentes', () => {
  const S = seed(); const E = make({S});
  const ev = {id: 'e1', name: 'X', products: [], ev: {pct: 30, ids: ['a', 'b'], pp: {a: 40, b: 150, zz: 20, c: 'x'}}}; S.cats.push(ev);
  E.evNorm(S);
  assert.deepEqual(ev.ev.pp, {a: 40});
  E.evUnassign(ev, 'a'); assert.equal(ev.ev.pp, undefined);
});

t('diálogo de evento: fila con % por producto', () => {
  assert.ok(html.includes('data-pp="${esc(id)}"'));
  assert.ok(html.includes('evSave(c0, name, k, sel, keep)'));
});

t('oferta propia: el evento descuenta sobre el «antes», no sobre el precio ya rebajado', () => {
  const S = seed(); const E = make({S});
  const p = S.cats[0].products[1]; p.old = 19990; p.pd = 14990;          // ya en oferta (-25%)
  assert.equal(E.ownPct(p), 25); assert.equal(E.evBase(p), 19990);
  const ev = {id: 'e1', name: 'BF', products: [], ev: {pct: 30, ids: []}}; S.cats.push(ev);
  E.evAssign(ev, ['b']);
  assert.deepEqual(ev.ev.pp, {b: 25});                                    // entra con su oferta propia
  assert.equal(E.evPrice(p), 14990);                                      // exacto, sin ±1 por redondeo
  assert.equal(E.evOf(p).pct, 25);
  ev.ev.pp.b = 40; E.reset(); assert.equal(E.evPrice(p), 11994);          // 19990 × 0.60, no 14990 × 0.60
  ev.ev.pp.b = 10; E.reset(); assert.equal(E.evPrice(p), 17991);          // puede ser menos que la oferta propia
  assert.equal(E.evBefore(p), 19990);
});

t('sin oferta propia todo igual que antes; sin evento el precio es pd', () => {
  const S = seed(); const E = make({S});
  const a = S.cats[0].products[0];
  assert.equal(E.ownPct(a), 0); assert.equal(E.evBase(a), 10000); assert.equal(E.evPrice(a), 10000);
  const ev = {id: 'e1', name: 'BF', products: [], ev: {pct: 30, ids: []}}; S.cats.push(ev);
  E.evAssign(ev, ['a']); assert.equal(ev.ev.pp, undefined); assert.equal(E.evPrice(a), 7000);
  const q = S.cats[0].products[1]; q.old = 19990; q.pd = 14990; E.reset();
  assert.equal(E.evBefore(q), 14990 && E.evBase(q) === 19990 ? 14990 : -1);   // fuera de evento: precio actual
});

console.log(`\n${pass} pruebas OK`);
