// Pruebas del texto por categoría (bloque CATTXT-CORE de MI APLICACION WEB.html).
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const FILE = process.argv[2] || path.join(os.homedir(), 'OneDrive - Universidad Privada Domingo Savio', 'Imágenes', 'catalogo GS electtronics', 'MI APLICACION WEB.html');
const html = readFileSync(FILE, 'utf8');
const core = html.slice(html.indexOf('// CATTXT-CORE:start'), html.indexOf('// CATTXT-CORE:end'));
assert.ok(core.length > 200, 'bloque CATTXT-CORE no encontrado');
const getFn = n => { const i = html.indexOf('function ' + n + '('); let d = 0, j = html.indexOf('{', i); const s = i; for (let k = j; ; k++) { if (html[k] === '{') d++; else if (html[k] === '}' && --d === 0) return html.slice(s, k + 1); } };
const make = S => new Function('S', 'const catProds = c => c.products; const freeOf = () => null;\nconst stOf = (l, mk) => { if (!S.styles[l]) { if (!mk) return {}; S.styles[l] = {}; } return S.styles[l]; };\n' + getFn('setP') + '\n' + getFn('prune') + '\n' + core + '; return {catTextApply, catTextReset, ctLids};')(S);
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
const seed = () => ({styles: {}, cats: [{id: 'c1', products: [{id: 'a'}, {id: 'b'}]}, {id: 'c2', products: [{id: 'z'}]}]});

t('nombre: solo los productos de la categoría', () => { const S = seed(), T = make(S); T.catTextApply(S.cats[0], 'desc', 'size', 18); assert.deepEqual(Object.keys(S.styles).sort(), ['prod:a:desc', 'prod:b:desc']); assert.equal(S.styles['prod:a:desc'].size, 18); assert.equal(S.styles['prod:z:desc'], undefined); });
t('precio y ambos', () => { const S = seed(), T = make(S); T.catTextApply(S.cats[0], 'pd', 'transform', 'uppercase'); assert.equal(S.styles['prod:b:pd'].transform, 'uppercase'); assert.equal(S.styles['prod:b:desc'], undefined); T.catTextApply(S.cats[0], 'both', 'font', 'Anton'); assert.equal(S.styles['prod:a:desc'].font, 'Anton'); assert.equal(S.styles['prod:a:pd'].font, 'Anton'); });
t('conserva otras propiedades del producto', () => { const S = seed(); S.styles['prod:a:desc'] = {x: 5}; const T = make(S); T.catTextApply(S.cats[0], 'desc', 'size', 14); assert.deepEqual(S.styles['prod:a:desc'], {x: 5, size: 14}); });
t('valor vacío quita la propiedad y no deja estilos vacíos', () => { const S = seed(), T = make(S); T.catTextApply(S.cats[0], 'desc', 'size', 14); T.catTextApply(S.cats[0], 'desc', 'size', undefined); assert.deepEqual(S.styles, {}); });
t('restablecer limpia solo texto, no la posición', () => { const S = seed(); S.styles['prod:a:desc'] = {x: 5, size: 14, font: 'Anton', italic: true}; S.styles['prod:z:desc'] = {size: 9}; const T = make(S); T.catTextReset(S.cats[0]); assert.deepEqual(S.styles['prod:a:desc'], {x: 5}); assert.deepEqual(S.styles['prod:z:desc'], {size: 9}); });
t('panel y acciones conectados', () => { for (const k of ["ctSec(cat(cm[1]))", "case 'ct-tgt'", "case 'ct-reset'", "path[0] === '%'"]) assert.ok(html.includes(k), k); });
console.log(`\n${pass} pruebas OK`);
