// El nombre del producto admite hasta 100 caracteres en todo el editor.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8');
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
t('DESC_MAX = 100', () => assert.match(html, /const DESC_MAX = 100;/));
t('ningún nombre de producto se corta a 60', () => {
  for (const bad of ["p.desc = v.slice(0, 60)", "'#desc', {wide: 1, max: 60}", "p.desc = String(v || '').slice(0, 60)", 'data-f="name" value="${esc(x.name)}" maxlength="60"', "(m.x.name || '').trim().slice(0, 60)", "x.name = o.r.name.slice(0, 60)"]) assert.equal(html.includes(bad), false, bad);
  for (const ok of ['slice(0, DESC_MAX)', 'max: DESC_MAX', 'maxlength="${DESC_MAX}"']) assert.ok(html.includes(ok), ok);
});
t('el título del zoom muestra el nombre en varias líneas', () => {
  const css = html.match(/\.lb-t\{[^}]*\}/)[0];
  assert.ok(!css.includes('white-space:nowrap') && css.includes('-webkit-line-clamp:5'), css);
});
console.log(`\n${pass} pruebas OK`);
