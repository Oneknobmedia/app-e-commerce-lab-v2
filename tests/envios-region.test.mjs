import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(process.argv[2] || 'editor/MI APLICACION WEB.html', 'utf8');
const core = html.slice(html.indexOf('// SHIP-CORE:start'), html.indexOf('// SHIP-CORE:end'));
assert.ok(core.length > 1000);
const regions = {'Santiago': 'Región Metropolitana', 'Lampa': 'Región Metropolitana', 'Puerto Montt': 'Región de Los Lagos', 'Punta Arenas': 'Región de Magallanes'};
const COMUNAS_RAW = {'Región Metropolitana': 'Santiago,Lampa', 'Región de Los Lagos': 'Puerto Montt', 'Región de Magallanes': 'Punta Arenas'};
const make = (ship, ADDR) => new Function('ship', 'ADDR', 'COMUNAS_RAW', 'regions', `
  const S = {store: {ship}}, fmt = n => '$' + Number(n).toLocaleString('es-CL');
  const T = k => ({ship: 'Envío', shipFree: 'GRATIS', shipMiss: 'Te faltan {n} para envío gratis', sub: 'Subtotal', totFin: 'Total', totPend: 'Total pendiente'}[k] || k);
  const comunaFind = s => regions[s] ? {name: s, region: regions[s]} : null;
  ${core}
  return {shipCalc, shipView, shipLines};
`)(ship, ADDR, COMUNAS_RAW, regions);

let x = make({mode: 'region', rates: {'0': {home: 4200, point: 3700}, '1': {home: 5500, point: 3900}, '2': {home: 17000}}}, {region: 'Región Metropolitana', comuna: 'Santiago', method: 'home'});
assert.equal(x.shipView(30485).total, 34685, 'bajo $50.000 en RM se cobra el envío');
assert.equal(x.shipView(30485).miss, 'Te faltan $19.515 para envío gratis', 'indica cuánto falta');
assert.equal(x.shipView(49999).total, 54199, 'en $49.999 todavía se cobra');
assert.equal(x.shipView(50000).total, 50000, 'desde $50.000 en RM es gratis');
assert.deepEqual(x.shipLines(50000), ['Subtotal: $50.000', 'Envío: GRATIS', 'Total: $50.000']);
x = make({mode: 'region', rmMin: 60000, rates: {'0': {home: 4200}}}, {region: 'Región Metropolitana', comuna: 'Santiago', method: 'home'});
assert.equal(x.shipView(50000).total, 54200, 'mínimo editable por tienda');
x = make({mode: 'region', rates: {'1': {home: 5500, point: 3900}}}, {region: 'Región de Los Lagos', comuna: 'Puerto Montt', method: 'home'});
assert.equal(x.shipView(30485).total, 35985);
x = make({mode: 'region', rates: {'1': {home: 5500, point: 3900}}}, {region: 'Región de Los Lagos', comuna: 'Puerto Montt', method: 'point'});
assert.equal(x.shipView(30485).total, 34385, 'la modalidad cambia el total');
x = make({mode: 'region', rates: {}}, {region: 'Región de Los Lagos', comuna: 'Puerto Montt', method: 'home'});
assert.equal(x.shipView(30485).known, false, 'sin precio configurado no inventa importe');
x = make({mode: 'region', rates: {}}, {comuna: '', method: 'home'});
assert.equal(x.shipView(30485).amt, 'Elige tu comuna');
x = make({mode: 'region', rmFree: false, rates: {}}, {region: 'Región Metropolitana', comuna: 'Lampa', method: 'home'});
assert.equal(x.shipView(30485).known, false, 'RM gratis se puede desactivar');
x = make({mode: 'region', rates: {}}, {region: 'Región de Los Lagos', comuna: 'Santiago', method: 'home'});
assert.equal(x.shipView(30485).known, false, 'no cotiza una comuna de otra región');
for (const text of ['shipDestHTML() + addrHTML()', 'data-shipfield="comuna"', 'data-a="ship-method"', "case 'ship-region'", 'if (!addrGate())']) assert.ok(html.includes(text), text);
const find = (addr) => new Function('ADDR', 'phoneDigits', 'comunaFind', `
  ${html.slice(html.indexOf('const shipDestMissing ='), html.indexOf('/* en el carrito (angosto)', html.indexOf('const shipDestMissing =')))}
  return shipDestMissing();
`)(addr, s => String(s || '').replace(/\D/g, ''), s => regions[s] ? {name: s, region: regions[s]} : null);
const address = {region: 'Región Metropolitana', comuna: 'Santiago', nombre: 'Ana Pérez', tel: '912345678', method: 'home', calle: 'Av. Siempreviva 123'};
assert.equal(find(address), '');
assert.equal(find({...address, calle: 'sin número'}), '');
assert.equal(find({...address, calle: 'Av. Siempreviva'}), 'calle');
assert.equal(find({...address, method: 'point', point: ''}), 'point');
assert.equal(find({...address, method: 'point', point: 'Punto Blue Centro'}), '');
assert.equal(find({...address, tel: '12'}), 'tel');
assert.equal(find({...address, comuna: 'Narnia'}), 'comuna');
assert.equal(find({...address, region: ''}), 'region');
assert.equal(find({...address, region: 'Región de Los Lagos'}), 'comuna');
for (const text of ['MI PEDIDO #', 'orderId()', 'Pago por transferencia después de la confirmación.', "fbq('track', 'Lead'", 'shipDestMissing() && shipView', 'Punto Blue elegido', 'data-shipfield="region"', "COMUNAS_RAW[ADDR.region].split(',')", 'Compra mínima para envío gratis RM']) assert.ok(html.includes(text), text);
console.log('Envío RM desde $50.000 y validaciones OK');
