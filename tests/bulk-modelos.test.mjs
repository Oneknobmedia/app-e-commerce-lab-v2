// Pruebas de lectura de modelos desde el nombre de la foto (bloque BULK-MODELS de MI APLICACION WEB.html).
// Uso: node tests/bulk-modelos.test.mjs ["ruta/al/MI APLICACION WEB.html"]
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8');
const a = html.indexOf('// BULK-MODELS:start'), b = html.indexOf('// BULK-MODELS:end');
assert.ok(a > 0 && b > a, 'bloque BULK-MODELS no encontrado');
const {parseName} = new Function('const DESC_MAX = ' + html.match(/const DESC_MAX = (\d+);/)[1] + ';\n' + html.slice(a, b) +'\nreturn {parseName};')();

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok -', name); };
const IP = n => 'iPhone ' + n;

t('ejemplo del usuario: nombre, precio y 7 modelos', () => {
  const r = parseName('carcasa 360, 8.990, iPhone 11, 12, 13, 14, 14 Pro Max, 15 Pro Max, 16 Pro Max.jpg', true);
  assert.equal(r.name, 'Carcasa 360'); assert.equal(r.pd, 8990); assert.equal(r.pm, 0);
  assert.deepEqual(r.mods, ['11', '12', '13', '14', '14 Pro Max', '15 Pro Max', '16 Pro Max'].map(IP));
});

t('con modelos apagados el nombre se lee como antes', () => {
  const r = parseName('carcasa 360, 8.990, iPhone 11, 12, 13.jpg', false);
  assert.deepEqual(r.mods, []);
  assert.equal(r.name, parseName('carcasa 360, 8.990, iPhone 11, 12, 13.jpg').name);
  assert.deepEqual(parseName('Polera negra 9990.jpg', true), {name: 'Polera negra', pd: 9990, pm: 0, mods: []});
});

t('guiones bajos, espacios y mayúsculas', () => {
  const r = parseName('CARCASA_MAGSAFE_12990_IPHONE_11_12_13_PRO_MAX.png', true);
  assert.equal(r.name, 'CARCASA MAGSAFE'); assert.equal(r.pd, 12990);
  assert.deepEqual(r.mods, ['iPhone 11', 'iPhone 12', 'iPhone 13 Pro Max'].map(x => x));
});

t('iPhone con números seguidos y sufijos', () => {
  const r = parseName('Funda 6990 iPhone 12 mini 13 Plus 14 Pro 16e SE 2022 X XR.jpg', true);
  assert.deepEqual(r.mods, ['iPhone 12 mini', 'iPhone 13 Plus', 'iPhone 14 Pro', 'iPhone 16e', 'iPhone SE (2022)', 'iPhone X', 'iPhone XR']);
  assert.equal(r.pd, 6990);
});

t('precio después de los modelos, y dos precios (por mayor)', () => {
  let r = parseName('Carcasa iPhone 11, 12, 13 Pro Max 8990.jpg', true);
  assert.equal(r.pd, 8990); assert.equal(r.name, 'Carcasa'); assert.deepEqual(r.mods, ['iPhone 11', 'iPhone 12', 'iPhone 13 Pro Max']);
  r = parseName('Carcasa 360, 8990, 6990, iPhone 11, 12.jpg', true);
  assert.equal(r.pd, 8990); assert.equal(r.pm, 6990); assert.equal(r.mods.length, 2);
  r = parseName('Carcasa iPhone 11, 12 8,990.jpg', true);
  assert.equal(r.pd, 8990); assert.equal(r.mods.length, 2);
});

t('Samsung, Redmi y Poco con los nombres de las plantillas', () => {
  assert.deepEqual(parseName('Carcasa 7990 Samsung S24, S24 Ultra, A15, S23 Plus.jpg', true).mods, ['Galaxy S24', 'Galaxy S24 Ultra', 'Galaxy A15', 'Galaxy S23+']);
  assert.deepEqual(parseName('Mica 3990 Redmi Note 13, Note 13 Pro, Note 14 Pro Plus, 13C.jpg', true).mods, ['Redmi Note 13', 'Redmi Note 13 Pro', 'Redmi Note 14 Pro+', 'Redmi 13C']);
  assert.deepEqual(parseName('Mica 3990 Poco X7, X7 Pro, F7.jpg', true).mods, ['Poco X7', 'Poco X7 Pro', 'Poco F7']);
  assert.deepEqual(parseName('Carcasa 4990 iPhone 15, Samsung S24, Xiaomi 14T Pro.jpg', true).mods, ['iPhone 15', 'Galaxy S24', 'Xiaomi 14T Pro']);
});

t('sin duplicados y sin marca', () => {
  assert.deepEqual(parseName('Carcasa 8990 iPhone 11, 11, 12, 11.jpg', true).mods, ['iPhone 11', 'iPhone 12']);
  const r = parseName('Cable USB-C 1 metro 4990.jpg', true);
  assert.deepEqual(r, {name: 'Cable USB C 1 metro', pd: 4990, pm: 0, mods: []});
});

t('palabras de marca que no son modelos se quedan en el nombre', () => {
  let r = parseName('Cargador iPhone 20W 12990.jpg', true);
  assert.deepEqual(r, {name: 'Cargador iPhone 20W', pd: 12990, pm: 0, mods: []});
  r = parseName('Vidrio templado para iPhone 9990.jpg', true);
  assert.equal(r.name, 'Vidrio templado para iPhone'); assert.deepEqual(r.mods, []);
  r = parseName('Vidrio 9H iPhone 11 Pro Max 3990.jpg', true);
  assert.deepEqual(r.mods, ['iPhone 11 Pro Max']); assert.equal(r.pd, 3990); assert.equal(r.name, 'Vidrio 9H');
});

t('rangos con guion y separador «y»', () => {
  assert.deepEqual(parseName('Carcasa 5990 iPhone 11-12-13.jpg', true).mods, ['iPhone 11', 'iPhone 12', 'iPhone 13']);
  assert.deepEqual(parseName('Carcasa 5990 iPhone 11 y 12.jpg', true).mods, ['iPhone 11', 'iPhone 12']);
});

console.log(`\n${pass} pruebas OK`);
