import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(process.argv[2] || 'editor/MI APLICACION WEB.html', 'utf8').replace(/\r\n/g, '\n');
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
x = make({mode: 'region', rates: {'1': {home: 0}}}, {region: 'Región de Los Lagos', comuna: 'Puerto Montt', method: 'home'});
assert.equal(x.shipView(200000).known, false, 'cero no es una tarifa pagada');
x = make({mode: 'region', freeRegions: ['Región de Los Lagos'], rates: {'0': {home: 4200}}}, {region: 'Región Metropolitana', comuna: 'Santiago', method: 'home'});
assert.equal(x.shipView(200000).total, 204200, 'se puede sacar a RM de la promoción');
x = make({mode: 'region', freeRegions: ['Región de Los Lagos'], rmMin: 60000}, {region: 'Región de Los Lagos', comuna: 'Puerto Montt', method: 'home'});
assert.equal(x.shipView(59999).known, false);
assert.equal(x.shipView(60000).sc.mode, 'free', 'la promoción se puede activar para otra región');
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
assert.equal(find({...address, region: ''}), 'comuna');
assert.equal(find({...address, region: 'Región de Los Lagos'}), 'comuna');
for (const text of ['MI PEDIDO #', 'orderId()', 'Pago por transferencia después de la confirmación.', "fbq('track', 'Lead'", 'shipDestMissing() && shipView', 'Punto Blue elegido', 'data-shipfield="region"', "shipComunaOptions(SHIP_REGION_FILTER)", 'Regiones con envío gratis']) assert.ok(html.includes(text), text);
const cut = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a) + a.length));
const settings = {store: {ship: {mode: 'region', quoteByChat: true}}};
let selectDestination;
const picker = new Function('S', 'document', `
  const ADDR={}, T=k=>k, fmt=String, esc=String, lsSet=()=>{}, renderCart=()=>{};
  ${core}
  ${cut('// ADDR-CORE:start','// ADDR-CORE:end')}
  ${cut('const SHIP_REGION_ORDER','function shipDestHTML')}
  ${cut("document.addEventListener('change', e => {\n  const t = e.target;\n  if (t.id === 'ship-region')", '\n\n/* búsqueda: filtra')}
  return {ADDR, shipLocationHTML, shipComunaOptions, shipSearchResults, shipView};
`)(settings, {addEventListener(_, handler) { selectDestination = handler; }, activeElement: null});
const locationHTML = picker.shipLocationHTML();
assert.match(locationHTML, /<select id="ship-comuna"[^>]*>/, 'la comuna usa un selector nativo disponible desde el inicio');
assert.equal((locationHTML.match(/<optgroup/g) || []).length, 16);
const firstGroup = locationHTML.match(/<optgroup label="([^"]+)"><option value="([^"]+)"/);
assert.deepEqual(firstGroup?.slice(1), ['Región Metropolitana', 'Lampa']);
const regionSelect = locationHTML.split('id="ship-region"')[1].split('</select>')[0];
assert.match(regionSelect, /value="">Todo Chile<\/option><option value="Región Metropolitana"/);
assert.match(picker.shipSearchResults('nunoa'), /Ñuñoa/, 'búsqueda sin tildes');
const choose = (id, value) => selectDestination({target: {id, value}});
choose('ship-comuna', 'Antofagasta');
assert.equal(picker.ADDR.region, 'Región de Antofagasta');
const afterAntofagasta = picker.shipLocationHTML();
assert.equal((afterAntofagasta.match(/<optgroup/g) || []).length, 16, 'recordar la dirección no filtra otras regiones');
const options = afterAntofagasta.split('id="ship-comuna"')[1].split('</select>')[0];
assert.equal((options.match(/<option value="[^"]+"/g) || []).length, 346);
assert.match(options, /value="Quilicura"/);
assert.match(options, /value="Punta Arenas"/);
assert.equal(picker.shipView(250000).quote, true);
choose('ship-comuna', 'Quilicura');
assert.equal(picker.ADDR.region, 'Región Metropolitana');
assert.equal(picker.shipView(50000).sc.mode, 'free');
choose('ship-region', 'Región de Valparaíso');
assert.equal(picker.ADDR.comuna, '');
assert.equal(picker.shipView(50000).sc.mode, 'choose');
assert.equal((picker.shipLocationHTML().match(/<optgroup/g) || []).length, 1, 'solo filtra al elegir región');
choose('ship-region', '');
assert.equal((picker.shipLocationHTML().match(/<optgroup/g) || []).length, 16, 'Todo Chile quita el filtro');
console.log('Selector de comuna, envío RM desde $50.000 y validaciones OK');
