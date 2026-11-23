// Pruebas v2.10.6: dirección de envío del cliente (ADDR-CORE) y botones de la barra (carrito derecha / menú izquierda).
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8');
const cut = n => { const a = html.indexOf(`// ${n}:start`), b = html.indexOf(`// ${n}:end`); assert.ok(a > 0 && b > a, n + ' no encontrado'); return html.slice(a, b); };
const make = store => new Function('S', `const T = k => k, fmt = n => String(n); ${cut('SHIP-CORE')}\n${cut('ADDR-CORE')}\n return {COMUNAS_RAW, comunaFind, comunaNames, comunaMap, addrCheck, addrLines, phoneFmt, addrOn, addrStrict, addrKey};`)({store});
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
const X = make({});
const OK = {nombre: 'Juan Pérez', tel: '+56 9 1234 5678', comuna: 'Ñuñoa', calle: 'Av. Irarrázaval 1234', depto: '', ref: ''};

t('346 comunas y conteo por región (sin claves repetidas)', () => {
  const want = {'Región de Arica y Parinacota': 4, 'Región de Tarapacá': 7, 'Región de Antofagasta': 9, 'Región de Atacama': 9, 'Región de Coquimbo': 15, 'Región de Valparaíso': 38, 'Región Metropolitana': 52, "Región de O'Higgins": 33, 'Región del Maule': 30, 'Región de Ñuble': 21, 'Región del Biobío': 33, 'Región de La Araucanía': 32, 'Región de Los Ríos': 12, 'Región de Los Lagos': 30, 'Región de Aysén': 10, 'Región de Magallanes': 11};
  const got = Object.fromEntries(Object.entries(X.COMUNAS_RAW).map(([r, s]) => [r, s.split(',').length]));
  assert.deepEqual(got, want);
  assert.equal(X.comunaMap().size, 346); assert.equal(X.comunaNames().length, 346);
});
t('búsqueda tolerante: tildes, mayúsculas, espacios y apóstrofe', () => {
  for (const s of ['nunoa', 'ÑUÑOA', ' ñuñoa ', 'Ñuñoa']) assert.equal(X.comunaFind(s).name, 'Ñuñoa');
  assert.equal(X.comunaFind('vina del mar').region, 'Región de Valparaíso');
  assert.equal(X.comunaFind('maipu').region, 'Región Metropolitana');
  assert.equal(X.comunaFind('ohiggins').name, "O'Higgins");
  assert.equal(X.comunaFind('comuna inventada'), null); assert.equal(X.comunaFind(''), null);
});
t('datos buenos: ok', () => { const r = X.addrCheck(OK, true); assert.equal(r.ok, true); assert.equal(r.first, null); });
t('cada campo obligatorio vacío marca su error y el primero', () => {
  let r = X.addrCheck({}, true); assert.equal(r.ok, false); assert.equal(r.first, 'nombre'); assert.deepEqual(Object.keys(r.errs), ['nombre', 'tel', 'comuna', 'calle']);
  r = X.addrCheck({...OK, nombre: 'Juan'}, true); assert.equal(r.first, 'nombre');
  r = X.addrCheck({...OK, tel: '12345'}, true); assert.equal(r.first, 'tel');
  r = X.addrCheck({...OK, comuna: 'Narnia'}, true); assert.equal(r.first, 'comuna');
  r = X.addrCheck({...OK, calle: 'Irarrázaval'}, true); assert.equal(r.first, 'calle', 'calle sin número');
});
t('calle: acepta número o «s/n»; teléfono acepta formatos comunes', () => {
  assert.equal(X.addrCheck({...OK, calle: 'Parcela 5, camino El Sol s/n'}, true).ok, true);
  assert.equal(X.addrCheck({...OK, calle: 'Camino Real sin número'}, true).ok, true);
  for (const tel of ['912345678', '+56912345678', '56 9 1234 5678', '(9) 1234-5678']) assert.equal(X.addrCheck({...OK, tel}, true).ok, true, tel);
  assert.equal(X.addrCheck({...OK, tel: 'abc'}, true).ok, false);
});
t('fuera de Chile: ciudad libre (no exige lista)', () => {
  assert.equal(X.addrCheck({...OK, comuna: 'Cochabamba'}, false).ok, true);
  assert.equal(X.addrCheck({...OK, comuna: ''}, false).first, 'comuna');
  assert.equal(make({ship: {zone: 'Bolivia'}}).addrStrict(), false); assert.equal(X.addrStrict(), true);
});
t('líneas del pedido: comuna oficial + región, opcionales solo si existen', () => {
  assert.deepEqual(X.addrLines({...OK, comuna: 'nunoa'}, true), ['Datos de entrega:', 'Nombre: Juan Pérez', 'Teléfono: +56 9 1234 5678', 'Dirección: Av. Irarrázaval 1234', 'Comuna: Ñuñoa (Región Metropolitana)']);
  const l = X.addrLines({...OK, depto: 'Depto 402', ref: 'portón negro', tel: '912345678'}, true);
  assert.ok(l.includes('Dirección: Av. Irarrázaval 1234, Depto 402') && l.includes('Referencia: portón negro') && l.includes('Teléfono: +56 9 1234 5678'));
  assert.ok(X.addrLines({...OK, comuna: 'Cochabamba'}, false).includes('Ciudad: Cochabamba'));
});
t('interruptor: pedir dirección solo con envío visible y addr no apagado', () => {
  assert.equal(X.addrOn(), true);
  assert.equal(make({ship: {addr: false}}).addrOn(), false);
  assert.equal(make({ship: {on: false}}).addrOn(), false);
});
t('teléfono se formatea como celular chileno; otros quedan como los escribió', () => {
  assert.equal(X.phoneFmt('56912345678'), '+56 9 1234 5678'); assert.equal(X.phoneFmt('+591 7123 4567'), '+591 7123 4567');
});
t('barra: Menú · Inicio · Carrito; el carrito sale por la derecha y el menú por la izquierda', () => {
  const n0 = html.indexOf('<nav class="bar mt" data-lid="bar"'); assert.ok(n0 > 0, 'nav no encontrado');
  const nav = html.slice(n0, html.indexOf('</nav>', n0));
  const o = ['data-a="menu"', 'data-a="home"', 'data-a="cart"'].map(k => nav.indexOf(k)); assert.ok(o[0] > 0 && o[0] < o[1] && o[1] < o[2], 'orden ' + o);
  /* solo cambia el BOTÓN de lugar: los dos cajones siguen saliendo por la izquierda */
  assert.ok(html.includes('#menu,#cartp{transform:translateX(-100%)}'));
  for (const k of ['#cartp{left:auto', '#cartp.ed-pin){left:auto', '#cartp{border-right:0']) assert.ok(!html.includes(k), 'el cajón del carrito no debe ir a la derecha: ' + k);
});
t('conectado: carrito, pedido, envío bloqueado sin dirección, tracking, panel', () => {
  for (const k of ['}).join(\'\') + shipDestHTML() + addrHTML()', "case 'ad-open': addrDialog()", 'if (!addrGate()) { e.preventDefault(); break; }', "case 'send': if (!addrGate()) break;", 'addrCheck(ADDR, addrStrict()).ok) trk(', "'ship-addr'", 'addrLines(ADDR, addrStrict())']) assert.ok(html.includes(k), k);
});
console.log(`\n${pass} pruebas OK`);
