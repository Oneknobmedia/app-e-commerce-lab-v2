// Pruebas v2.10.5: envíos configurables + envío gratis automático (bloque SHIP-CORE de MI APLICACION WEB.html).
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8');
const core = html.slice(html.indexOf('// SHIP-CORE:start'), html.indexOf('// SHIP-CORE:end'));
assert.ok(core.length > 300, 'bloque SHIP-CORE no encontrado');
const DEF_T = {sub: 'Subtotal', ship: 'Envío', shipEst: 'Envío estimado', shipFree: 'GRATIS', shipMiss: 'Te faltan {n} para envío gratis', totFin: 'Total', totPend: 'Total final: se confirma con el envío'};
/* fmt idéntico al del editor (moneda S.store.cur, miles con punto) */
const make = store => { const S = {store}; return new Function('S', 'DEF_T', `
  const curOf = () => String((S.store && S.store.cur) || '').replace(/[<>&"'\`\\\\\\d]/g, '').replace(/\\s+/g, ' ').trim().slice(0, 6);
  const fmt = n => { const c = curOf(), v = String(Math.max(0, Math.round(Number(n) || 0))).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.'); return c ? c + ' ' + v : '$' + v; };
  const T = k => { const v = S.store.t && S.store.t[k]; return v != null && String(v).trim() !== '' ? String(v) : DEF_T[k] || ''; };
  ${core}; return {shipCfg, shipCalc, shipView, shipLines, SHIP_DEF, fmt};`)(S, DEF_T); };
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };

t('valores iniciales de Chile sin tocar datos', () => {
  const st = {}, X = make(st), c = X.shipCfg();
  assert.deepEqual([c.on, c.free, c.min, c.lo, c.hi, c.zone], [true, true, 100000, 2600, 10000, 'Todo Chile · entrega a domicilio']);
  assert.equal(st.ship, undefined, 'no escribe datos');
});
t('borde: 99.999 rango, 100.000 y 100.001 gratis', () => {
  const X = make({});
  assert.equal(X.shipCalc(99999).mode, 'range'); assert.equal(X.shipCalc(99999).falta, 1);
  assert.equal(X.shipCalc(100000).mode, 'free'); assert.equal(X.shipCalc(100001).mode, 'free');
  assert.equal(X.shipCalc(100000).falta, 0);
});
t('baja del mínimo: restablece tarifa; sube: gratis ($0, total = subtotal)', () => {
  const X = make({});
  let v = X.shipView(150000); assert.equal(v.amt, 'GRATIS'); assert.equal(v.total, 150000); assert.equal(v.known, true);
  v = X.shipView(40000); assert.equal(v.amt, '$2.600 – $10.000'); assert.equal(v.known, false); assert.equal(v.total, null); assert.equal(v.lbl, 'Envío estimado');
  assert.equal(v.miss, 'Te faltan $60.000 para envío gratis');
});
t('desactivar envío gratis: siempre rango, sin aviso', () => {
  const X = make({ship: {free: false}}); const v = X.shipView(500000);
  assert.equal(v.sc.mode, 'range'); assert.equal(v.miss, ''); assert.equal(v.known, false);
});
t('desactivar envío: modo off, total = subtotal, sin líneas en el pedido', () => {
  const X = make({ship: {on: false}}); const v = X.shipView(1234);
  assert.equal(v.on, false); assert.equal(v.total, 1234); assert.equal(X.shipLines(1234), null);
});
t('mínimo, costos y cobertura editables', () => {
  const X = make({ship: {min: 50000, lo: 1000, hi: 3000, zone: 'Santiago'}}), c = X.shipCfg();
  assert.deepEqual([c.min, c.lo, c.hi, c.zone], [50000, 1000, 3000, 'Santiago']);
  assert.equal(X.shipCalc(49999).mode, 'range'); assert.equal(X.shipCalc(50000).mode, 'free');
  assert.equal(make({ship: {zone: ''}}).shipCfg().zone, '', 'cobertura vacía se respeta');
});
t('mínimo mayor que máximo: se invierten; iguales: tarifa única que sí suma al total', () => {
  let c = make({ship: {lo: 9000, hi: 2000}}).shipCfg(); assert.deepEqual([c.lo, c.hi], [2000, 9000]);
  const v = make({ship: {lo: 3500, hi: 3500}}).shipView(20000);
  assert.equal(v.sc.mode, 'fixed'); assert.equal(v.amt, '$3.500'); assert.equal(v.known, true); assert.equal(v.total, 23500);
});
t('valores inválidos o negativos caen al valor inicial', () => {
  const c = make({ship: {min: -5, lo: 'abc', hi: NaN, zone: undefined}}).shipCfg();
  assert.deepEqual([c.min, c.lo, c.hi], [100000, 2600, 10000]);
  assert.equal(make({ship: {min: 0}}).shipCfg().min, 100000, 'mínimo 0 no es válido (todo sería gratis por error)');
  assert.equal(make({ship: {min: '75.000'}}).shipCfg().min, 75000, 'texto con puntos de miles');
});
t('moneda: hereda S.store.cur; cambiarla actualiza los importes sin convertir', () => {
  const st = {cur: 'BS', ship: {lo: 20, hi: 60, min: 500}}, X = make(st);
  assert.equal(X.shipView(100).amt, 'BS 20 – BS 60');
  st.cur = 'USD'; assert.equal(X.shipView(100).amt, 'USD 20 – USD 60');
  assert.equal(X.shipView(600).amt, 'GRATIS');
  st.cur = ''; assert.equal(X.shipView(100).amt, '$20 – $60');
});
t('pedido: mismas líneas que el carrito (sub, envío, total)', () => {
  const X = make({});
  assert.deepEqual(X.shipLines(120000), ['Subtotal: $120.000', 'Envío: GRATIS', 'Total: $120.000']);
  assert.deepEqual(X.shipLines(30000), ['Subtotal: $30.000', 'Envío estimado: $2.600 – $10.000 (se confirma)', 'Total final: se confirma con el envío']);
});
t('textos editables (T) se respetan', () => {
  const X = make({t: {shipFree: 'SIN COSTO'}}); assert.equal(X.shipView(200000).amt, 'SIN COSTO');
});
t('conectado: carrito, pedido, panel y acciones', () => {
  for (const k of ['const sv = shipView(tot);', 'shipLines(tot)', "sec('Envíos'", "'@store.ship.min'", "'@store.ship.lo'", "'@store.ship.hi'", "'@store.ship.zone'", "case 'ship-on': case 'ship-free':"]) assert.ok(html.includes(k), k);
});
console.log(`\n${pass} pruebas OK`);
