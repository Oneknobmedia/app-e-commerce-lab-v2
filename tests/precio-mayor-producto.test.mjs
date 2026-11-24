// Pruebas v2.10.14: precio por mayor por producto (bloque MAY-CORE) sin activar los de toda la tienda.
// Uso: node tests/precio-mayor-producto.test.mjs [ruta-del-editor]
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const html = readFileSync(process.argv[2] || 'editor/MI APLICACION WEB.html', 'utf8').replace(/\r\n/g, '\n');
const a = html.indexOf('// MAY-CORE:start'), b = html.indexOf('// MAY-CORE:end');
assert.ok(a > 0 && b > a, 'bloque MAY-CORE no encontrado');
const core = html.slice(a, b);
/* mismas utilidades que la app: mayOn global, minQ (6) y precio de evento (sin evento = precio) */
const make = store => new Function('S', `const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const mayOn = () => !S.store.hideMay, minQ = () => 6, evPrice = p => num(p.pd);
  ${core}
  const unitOf = (p, q) => { const e = evPrice(p); return hasMay(p) && q >= minQ() ? Math.min(num(p.pm), e) : e; };
  return {mayOf, hasMay, mayToggle, unitOf};`)({store});
const P = extra => ({id: 'p1', pd: 10000, pm: 8000, ...extra});
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };

t('sin ajuste propio el producto sigue a la tienda (encendida / apagada)', () => {
  assert.equal(make({}).mayOf(P()), true); assert.equal(make({hideMay: true}).mayOf(P()), false);
  assert.equal(make({}).unitOf(P(), 6), 8000); assert.equal(make({hideMay: true}).unitOf(P(), 6), 10000);
});
t('tienda APAGADA + p.may=true: solo ese producto cobra por mayor', () => {
  const X = make({hideMay: true}), on = P({may: true}), off = P({id: 'p2'});
  assert.equal(X.hasMay(on), true); assert.equal(X.unitOf(on, 6), 8000); assert.equal(X.unitOf(on, 5), 10000, 'bajo el mínimo paga unitario');
  assert.equal(X.hasMay(off), false); assert.equal(X.unitOf(off, 99), 10000, 'los demás no');
});
t('tienda ENCENDIDA + p.may=false: solo ese producto lo pierde', () => {
  const X = make({}), no = P({may: false}), si = P({id: 'p2'});
  assert.equal(X.hasMay(no), false); assert.equal(X.unitOf(no, 99), 10000);
  assert.equal(X.hasMay(si), true); assert.equal(X.unitOf(si, 6), 8000);
});
t('sin precio por mayor válido nunca aplica (aunque esté activado)', () => {
  const X = make({hideMay: true});
  for (const pm of [0, undefined, 10000, 12000]) assert.equal(X.hasMay(P({may: true, pm})), false, 'pm=' + pm);
});
t('botón del producto: invierte solo ese producto y limpia p.may si coincide con la tienda', () => {
  let X = make({hideMay: true}), p = P();
  assert.equal(X.mayToggle(p), true); assert.equal(p.may, true, 'tienda apagada → queda ajuste propio');
  assert.equal(X.mayToggle(p), false); assert.equal('may' in p, false, 'vuelve a seguir a la tienda');
  X = make({}); p = P();
  assert.equal(X.mayToggle(p), false); assert.equal(p.may, false, 'tienda encendida → ajuste propio apagado');
  assert.equal(X.mayToggle(p), true); assert.equal('may' in p, false);
});
t('el botón de un producto no toca la tienda ni a otros productos', () => {
  const st = {hideMay: true}, X = make(st), a1 = P(), a2 = P({id: 'p2'});
  X.mayToggle(a1);
  assert.deepEqual(st, {hideMay: true}); assert.equal('may' in a2, false);
});
t('null en p.may cuenta como sin ajuste', () => { assert.equal(make({hideMay: true}).mayOf(P({may: null})), false); assert.equal(make({}).mayOf(P({may: null})), true); });
t('conectado: tarjeta, panel del producto (singular), acción p-may y botón general intacto', () => {
  for (const k of ['${mayOf(p) && (edit ||', "tgl('Mostrar precio por mayor', mayOf(pp), 'p-may')", "case 'p-may': if (p) { const on = mayToggle(p);", "tgl('Mostrar precios por mayor', mayOn(), 'may')", "case 'may': if (mayOn()) S.store.hideMay = true;"]) assert.ok(html.includes(k), k);
  assert.ok(!html.includes("tgl('Mostrar precios por mayor', mayOn(), 'may')}${pp"), 'el botón del producto ya no mueve el interruptor general');
});
console.log(`\n${pass} pruebas OK`);
