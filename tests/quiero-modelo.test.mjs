// «Quiero mi modelo»: marca + modelo + color en vez de la lista de modelos. Y el límite de 100 en la tarjeta.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8');
const core = html.slice(html.indexOf('// MD-CORE:start'), html.indexOf('// MD-CORE:end'));
assert.ok(core.length > 100, 'bloque MD-CORE no encontrado');
const M = new Function(core + '; return {mdClean, mdJoin, mdParts, mdShort, mdText, mdWa};')();
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };

t('marca / modelo / color van y vuelven por la clave del carrito', () => {
  const sz = M.mdJoin('Apple', 'iPhone 13 Pro', 'Negro');
  assert.equal(sz, 'Apple / iPhone 13 Pro / Negro');
  assert.deepEqual(M.mdParts(sz), {marca: 'Apple', modelo: 'iPhone 13 Pro', color: 'Negro'});
  assert.equal(M.mdShort(sz), 'Apple iPhone 13 Pro · Negro');
  assert.equal(M.mdText(sz), 'marca Apple, modelo iPhone 13 Pro, color Negro');
  assert.equal(M.mdWa(sz), 'Marca: Apple\nModelo: iPhone 13 Pro\nColor: Negro');
});
t('color opcional', () => { const sz = M.mdJoin('Samsung', 'Galaxy S23', ''); assert.equal(sz, 'Samsung / Galaxy S23'); assert.equal(M.mdParts(sz).color, ''); });
t('no rompe la clave: quita | y /, espacios y largo', () => {
  assert.equal(M.mdClean('  A|B/C   D '), 'A-B-C D');
  assert.ok(!M.mdJoin('a|b', 'c/d', 'e').includes('|'));
  assert.equal(M.mdParts(M.mdJoin('Mar/ca', 'Mo|delo', 'x')).modelo, 'Mo-delo');
  assert.ok(M.mdClean('x'.repeat(80)).length <= 40);
});
t('carritos viejos (solo el modelo) se siguen leyendo', () => { assert.deepEqual(M.mdParts('iPhone 12'), {marca: '', modelo: 'iPhone 12', color: ''}); assert.equal(M.mdShort('iPhone 12'), 'iPhone 12'); });
t('el botón dice «Quiero mi modelo» y existe el formulario', () => {
  assert.ok(html.includes("mdl: 'Quiero mi modelo'"));
  assert.ok(html.includes('function mdForm(pid, c0)') && html.includes('data-a="md-ask"') && html.includes("case 'lb-md'"));
});
t('ya no existen la lista de modelos ni «Identificar modelos»', () => {
  for (const bad of ['modsScanDialog', 'function modDialog', 'const MD_TPL', 'modelsScan', 'mods-scan', "case 'p-mods'", 'class="bk-md"', 'Identificar modelos', 'Ver modelos disponibles'])
    assert.equal(html.includes(bad), false, bad);
});
t('el interruptor por producto existe y se guarda', () => {
  assert.ok(html.includes("'p-mq'") && html.includes("case 'p-mq'"));
  assert.ok(html.includes('p.mq === 1 ? {mq: 1} : {}'));
});
t('editar el nombre sobre la tarjeta admite 100 (no 60)', () => {
  assert.ok(html.includes("t.dataset.max = String(DESC_MAX);"));
  assert.equal(html.includes("t.dataset.max = '60'"), false);
});
console.log(`\n${pass} pruebas OK`);
