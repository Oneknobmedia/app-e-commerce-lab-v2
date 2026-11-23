/* «Reconocer producto» (v2.6): la búsqueda visual la hace Google Lens en una ventana del navegador del usuario.
   Google no ofrece una API gratis para leer los resultados de Lens, así que el backend solo:
   1. publica la foto 30 minutos en /e-commerce-lab/api/lens/<id>.jpg (id aleatorio) para que Lens la descargue
      (lens.google.com/uploadbyurl?url=…);
   2. sugiere nombre, marca y modelo con Workers AI (gratis, misma IA del sitio);
   3. hace de proxy de imágenes para que el editor lea los píxeles de la foto que el usuario trae desde Lens. */
import {readPhoto} from './identify.js';

const TTL = 1800;
const LENS_RX = /^[a-f0-9]{32}\.jpg$/;
const JPG_RX = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
export const LENS_PATH = '/e-commerce-lab/api/lens/';

const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

/* «$12.990», «CLP 12.990», 12990 → 12990 (solo pesos chilenos razonables) */
export function clp(v) {
  if (typeof v === 'number') return v >= 300 && v <= 50000000 ? Math.round(v) : 0;
  const m = String(v || '').match(/(\d{1,3}(?:[.\s]\d{3})+|\d{3,8})(?![\d,])/);
  if (!m) return 0;
  const n = +m[1].replace(/[.\s]/g, '');
  return n >= 300 && n <= 50000000 ? n : 0;
}

/* ---------- foto temporal para Google Lens (D1) ---------- */
async function lensTable(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS lens_tmp (id TEXT PRIMARY KEY, data TEXT NOT NULL, exp INTEGER NOT NULL)').run();
}
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');

/* guarda la foto (jpeg en base64) y devuelve la URL pública que se le pasa a Lens */
export async function lensSave(env, img, origin) {
  if (!JPG_RX.test(img || '') || img.length > 3000000) { const e = new Error('no_image'); e.code = 'no_image'; throw e; }
  await lensTable(env);
  const t = Math.floor(Date.now() / 1000), id = hex(16);
  await env.DB.prepare('DELETE FROM lens_tmp WHERE exp < ?').bind(t).run();
  await env.DB.prepare('INSERT INTO lens_tmp (id, data, exp) VALUES (?, ?, ?)').bind(id, img, t + TTL).run();
  const url = `${origin}${LENS_PATH}${id}.jpg`;
  return {url, lens: lensUrl(url), exp: TTL};
}
export const lensUrl = u => 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(u) + '&hl=es-419';

export async function lensServe(env, name) {
  if (!LENS_RX.test(name) || !env.DB) return new Response('No encontrado', {status: 404});
  try {
    await lensTable(env);
    const row = await env.DB.prepare('SELECT data FROM lens_tmp WHERE id = ? AND exp > ?').bind(name.slice(0, 32), Math.floor(Date.now() / 1000)).first();
    if (!row) return new Response('No encontrado', {status: 404});
    const b64 = String(row.data).replace(/^data:image\/jpeg;base64,/, ''), bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new Response(bin, {headers: {'content-type': 'image/jpeg', 'cache-control': 'no-store', 'x-robots-tag': 'noindex'}});
  } catch (e) { return new Response('No encontrado', {status: 404}); }
}

/* sugerencia de nombre: solo lo que la IA ve en la foto (la búsqueda real la hace Lens) */
export async function recognize(env, b, textOf) {
  const v = await readPhoto(env, b.image, str(b.hint, 400), textOf).catch(() => ({}));
  return {
    name: str(v.name, 90).toUpperCase(), brand: str(v.brand, 40), model: str(v.model, 60), query: str(v.query, 120),
    conf: Math.max(0, Math.min(1, +v.conf || 0)), price: 0, currency: 'CLP', prices: [], images: [], ref: null, matches: 0, search: 'lens'
  };
}

/* proxy de imágenes: el editor necesita leer los píxeles (fondo blanco) y las tiendas no permiten CORS */
export async function imgProxy(u) {
  if (!/^https:\/\//i.test(u || '') || u.length > 2000) return new Response('bad', {status: 400});
  let r;
  try { r = await fetch(u, {signal: AbortSignal.timeout(8000), headers: {accept: 'image/*', 'user-agent': 'Mozilla/5.0 (compatible; e-commerce-lab)'}, redirect: 'follow'}); }
  catch (e) { return new Response('fetch', {status: 502}); }
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !/^image\/(jpeg|png|webp|gif|avif)/i.test(ct)) return new Response('not_image', {status: 415});
  if (+(r.headers.get('content-length') || 0) > 6e6) return new Response('too_big', {status: 413});
  const buf = await r.arrayBuffer();
  if (buf.byteLength > 6e6) return new Response('too_big', {status: 413});
  return new Response(buf, {headers: {'content-type': ct, 'cache-control': 'private, max-age=600'}});
}
