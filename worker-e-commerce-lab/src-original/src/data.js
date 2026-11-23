/* Proyectos en la nube, versiones publicadas y videos.
   - Proyectos: cada usuario guarda sus catálogos aquí (el admin los ve al entrar en su cuenta).
   - Versiones: «Exportar para cliente» publica oneknobmedia.com/e-commerce-<empresa>-v<n>; /e-commerce-<empresa> lleva siempre a la última (para el QR).
   - Videos de portada: van a R2 por partes (hasta 500 MB) y se sirven en /e-commerce-lab/media/<archivo>.
   Los textos grandes van a R2 si está activado (binding FILES); si no, a D1 partidos en trozos. */
const SITE = 'https://oneknobmedia.com';
/* en pruebas locales (.dev.vars) los enlaces apuntan al servidor local */
const siteOf = env => env.ECL_DEV_ORIGIN || SITE;
const CHUNK = 500000;
const MAX_TEXT = 60 * 1024 * 1024;
const MAX_MEDIA = 500 * 1024 * 1024;
const PART = 25 * 1024 * 1024;
const VIDEO = {'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v'};
const RESERVED = new Set(['lab']);
const now = () => Math.floor(Date.now() / 1000);
const out = (status, body, headers) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers}});

export const pkeyOf = name => String(name || '').trim().toLowerCase().slice(0, 60);
export const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'catalogo';

/* ---------- textos grandes ---------- */
async function putText(env, key, text) {
  if (env.FILES) {
    await env.FILES.put(key, text, {httpMetadata: {contentType: 'text/plain; charset=utf-8'}});
    await env.DB.prepare('DELETE FROM blobs WHERE bkey = ?').bind(key).run();
    return;
  }
  /* los trozos se escriben en una clave temporal en lotes chicos (~3 MB) y al final se cambia de clave en un solo paso:
     un lote de 17 MB se quedaba colgado; así nunca hay un proyecto a medias */
  const tmp = key + '~new', ins = 'INSERT INTO blobs (bkey, i, data) VALUES (?, ?, ?)';
  await retryD1(() => env.DB.prepare('DELETE FROM blobs WHERE bkey = ?').bind(tmp).run());
  let st = [];
  for (let i = 0, n = 0; i < text.length || n === 0; i += CHUNK, n++) {
    st.push(env.DB.prepare(ins).bind(tmp, n, text.slice(i, i + CHUNK)));
    if (st.length === 6) { const b = st; st = []; await retryD1(() => env.DB.batch(b)); }
  }
  if (st.length) { const b = st; await retryD1(() => env.DB.batch(b)); }
  await retryD1(() => env.DB.batch([env.DB.prepare('DELETE FROM blobs WHERE bkey = ?').bind(key), env.DB.prepare('UPDATE blobs SET bkey = ? WHERE bkey = ?').bind(key, tmp)]));
}
/* D1 a veces responde 503/ocupado: cada lote es una transacción (todo o nada), así que se reintenta hasta 4 veces (espera 0,3 s · 0,9 s · 2,7 s) */
async function retryD1(f, tries = 4) {
  for (let k = 1; ; k++) {
    try { return await f(); }
    catch (e) { if (k >= tries) throw e; await new Promise(r => setTimeout(r, 300 * 3 ** (k - 1))); }
  }
}
async function getText(env, key) {
  if (env.FILES) { const o = await env.FILES.get(key); if (o) return await o.text(); }
  const {results} = await env.DB.prepare('SELECT data FROM blobs WHERE bkey = ? ORDER BY i').bind(key).all();
  return results.length ? results.map(r => r.data).join('') : null;
}
async function delText(env, key) {
  if (env.FILES) await env.FILES.delete(key);
  await env.DB.prepare('DELETE FROM blobs WHERE bkey = ?').bind(key).run();
}
const projKey = (uid, pkey) => `p/${uid}/${encodeURIComponent(pkey)}`;
const pubKey = (slug, v) => `v/${slug}/${v}`;

/* ---------- API con sesión (/e-commerce-lab/api/projects…, publish…, media…) ---------- */
export async function data(req, env, rest, me) {
  const url = new URL(req.url), site = siteOf(env);
  if (rest === 'projects' && req.method === 'GET') {
    const {results} = await env.DB.prepare('SELECT name, updated, size FROM projects WHERE user_id = ? ORDER BY updated DESC').bind(me.id).all();
    return out(200, {projects: results});
  }
  if (rest === 'projects/get' && req.method === 'GET') {
    const k = pkeyOf(url.searchParams.get('name'));
    const row = await env.DB.prepare('SELECT name, updated FROM projects WHERE user_id = ? AND pkey = ?').bind(me.id, k).first();
    if (!row) return out(404, {code: 'not_found'});
    const text = await getText(env, projKey(me.id, k));
    if (text == null) return out(404, {code: 'not_found'});
    return new Response(text, {headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-updated': String(row.updated), 'x-name': encodeURIComponent(row.name)}});
  }
  if (req.method !== 'POST') return out(405, {code: 'method'});

  if (rest === 'projects/put') {
    const name = String(url.searchParams.get('name') || '').trim().slice(0, 60), k = pkeyOf(name);
    if (!k) return out(400, {code: 'bad_name'});
    if (+(req.headers.get('content-length') || 0) > MAX_TEXT) return out(413, {code: 'too_big'});
    const text = await req.text();
    if (!text || text.length > MAX_TEXT || text[0] !== '{') return out(400, {code: 'bad_request'});
    const ts = Date.now();
    await putText(env, projKey(me.id, k), text);
    await env.DB.prepare('INSERT INTO projects (user_id, pkey, name, updated, size) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, pkey) DO UPDATE SET name = excluded.name, updated = excluded.updated, size = excluded.size').bind(me.id, k, name, ts, text.length).run();
    return out(200, {updated: ts});
  }
  if (rest === 'projects/delete') {
    let b = {}; try { b = await req.json(); } catch (e) {}
    const k = pkeyOf(b.name);
    await delText(env, projKey(me.id, k));
    await env.DB.prepare('DELETE FROM projects WHERE user_id = ? AND pkey = ?').bind(me.id, k).run();
    return out(200, {ok: true});
  }

  /* versiones publicadas de un proyecto: enlace, fecha y número */
  if (rest === 'publish/list') {
    let b = {}; try { b = await req.json(); } catch (e) {}
    const k = pkeyOf(b.name), slug = await slugOf(env, me.id, k);
    const {results} = slug ? await env.DB.prepare('SELECT v, created FROM pubs WHERE slug = ? ORDER BY v').bind(slug).all() : {results: []};
    const want = slug || await freeSlug(env, me.id, k, slugify(b.company));
    return out(200, {slug: want, assigned: !!slug, stable: `${site}/e-commerce-${want}`, next: (results.length ? results[results.length - 1].v : 0) + 1,
      versions: results.map(r => ({v: r.v, created: r.created, url: `${site}/e-commerce-${want}-v${r.v}`}))});
  }
  if (rest === 'publish') {
    const name = String(url.searchParams.get('name') || '').trim().slice(0, 60), k = pkeyOf(name);
    if (!k) return out(400, {code: 'bad_name'});
    if (+(req.headers.get('content-length') || 0) > MAX_TEXT) return out(413, {code: 'too_big'});
    const html = await req.text();
    if (!/^<!doctype html>/i.test(html) || !html.includes('id="catdata"')) return out(400, {code: 'bad_request'});
    let slug = await slugOf(env, me.id, k);
    if (!slug) {
      slug = await freeSlug(env, me.id, k, slugify(url.searchParams.get('company')));
      await env.DB.prepare('INSERT OR IGNORE INTO slugs (slug, user_id, pkey) VALUES (?, ?, ?)').bind(slug, me.id, k).run();
      const own = await env.DB.prepare('SELECT user_id, pkey FROM slugs WHERE slug = ?').bind(slug).first();
      if (!own || own.user_id !== me.id || own.pkey !== k) return out(409, {code: 'busy'});
    }
    for (let tries = 0; tries < 3; tries++) {
      const last = await env.DB.prepare('SELECT MAX(v) AS v FROM pubs WHERE slug = ?').bind(slug).first();
      const v = ((last && last.v) || 0) + 1;
      const ins = await env.DB.prepare('INSERT OR IGNORE INTO pubs (slug, v, user_id, pkey, name, created, size) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(slug, v, me.id, k, name, now(), html.length).run();
      if (!ins.meta || !ins.meta.changes) continue;
      await putText(env, pubKey(slug, v), html);
      return out(200, {slug, v, url: `${site}/e-commerce-${slug}-v${v}`, stable: `${site}/e-commerce-${slug}`});
    }
    return out(409, {code: 'busy'});
  }

  /* videos: inicio, partes de 25 MB y cierre */
  if (rest.startsWith('media/')) {
    if (!env.FILES) return out(501, {code: 'no_media'});
    if (rest === 'media/start') {
      let b = {}; try { b = await req.json(); } catch (e) {}
      const ext = VIDEO[String(b.type || '').toLowerCase()];
      if (!ext) return out(400, {code: 'bad_type'});
      const size = +b.size || 0;
      if (size <= 0 || size > MAX_MEDIA) return out(413, {code: 'too_big'});
      const id = [...crypto.getRandomValues(new Uint8Array(12))].map(v => v.toString(16).padStart(2, '0')).join('');
      const key = `m/${id}.${ext}`;
      const up = await env.FILES.createMultipartUpload(key, {httpMetadata: {contentType: b.type === 'video/quicktime' ? 'video/quicktime' : b.type, cacheControl: 'public, max-age=31536000, immutable'}});
      await env.DB.prepare('INSERT INTO media (mkey, user_id, type, size, created) VALUES (?, ?, ?, ?, ?)').bind(key, me.id, b.type, size, now()).run();
      return out(200, {key, uploadId: up.uploadId, part: PART});
    }
    const key = String(url.searchParams.get('key') || ''), uploadId = String(url.searchParams.get('uploadId') || '');
    const row = await env.DB.prepare('SELECT * FROM media WHERE mkey = ? AND user_id = ?').bind(key, me.id).first();
    if (!row || row.done) return out(404, {code: 'not_found'});
    const up = env.FILES.resumeMultipartUpload(key, uploadId);
    if (rest === 'media/part') {
      const n = Math.round(+url.searchParams.get('n') || 0);
      if (n < 1 || n > 1000 || !req.body) return out(400, {code: 'bad_request'});
      const p = await up.uploadPart(n, req.body);
      return out(200, {partNumber: p.partNumber, etag: p.etag});
    }
    if (rest === 'media/finish') {
      let b = {}; try { b = await req.json(); } catch (e) {}
      const parts = (Array.isArray(b.parts) ? b.parts : []).map(p => ({partNumber: +p.partNumber, etag: String(p.etag)})).sort((a, c) => a.partNumber - c.partNumber);
      if (!parts.length) return out(400, {code: 'bad_request'});
      await up.complete(parts);
      await env.DB.prepare('UPDATE media SET done = 1 WHERE mkey = ?').bind(key).run();
      return out(200, {url: `${site}/e-commerce-lab/media/${key.slice(2)}`});
    }
    if (rest === 'media/abort') { try { await up.abort(); } catch (e) {} await env.DB.prepare('DELETE FROM media WHERE mkey = ?').bind(key).run(); return out(200, {ok: true}); }
  }
  return null;
}

async function slugOf(env, uid, k) {
  const r = await env.DB.prepare('SELECT slug FROM slugs WHERE user_id = ? AND pkey = ?').bind(uid, k).first();
  return r ? r.slug : null;
}
/* la dirección es de un solo proyecto: si ya la usa otro, se agrega -2, -3… */
async function freeSlug(env, uid, k, base) {
  for (let i = 1; i < 50; i++) {
    const s = i === 1 && !RESERVED.has(base) ? base : `${base}-${i}`;
    const r = await env.DB.prepare('SELECT user_id, pkey FROM slugs WHERE slug = ?').bind(s).first();
    if (!r || (r.user_id === uid && r.pkey === k)) return s;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/* ---------- páginas públicas ---------- */
/* /e-commerce-<slug>-v<n> (versión) y /e-commerce-<slug> (siempre la última). Devuelve null si no es nuestra */
export async function publicPage(req, env, path) {
  const site = siteOf(env);
  const m = path.match(/^\/e-commerce-([a-z0-9-]+?)\/?$/);
  if (!m || req.method !== 'GET' && req.method !== 'HEAD') return null;
  const full = m[1], vm = full.match(/^(.+)-v(\d+)$/);
  if (vm) {
    const row = await env.DB.prepare('SELECT slug, v FROM pubs WHERE slug = ? AND v = ?').bind(vm[1], +vm[2]).first();
    if (row) {
      const html = await getText(env, pubKey(row.slug, row.v));
      if (html != null) return new Response(req.method === 'HEAD' ? null : html, {headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-robots-tag': 'noindex'}});
    }
  }
  if (RESERVED.has(full)) return null;
  const last = await env.DB.prepare('SELECT MAX(v) AS v FROM pubs WHERE slug = ?').bind(full).first();
  if (last && last.v) return new Response(null, {status: 302, headers: {location: `${site}/e-commerce-${full}-v${last.v}`, 'cache-control': 'no-store'}});
  return null;
}

/* /e-commerce-lab/media/<archivo>: videos con soporte de rangos (los navegadores piden el video por partes) */
export async function media(req, env, name) {
  if (!env.FILES || !/^[a-f0-9]{24}\.(mp4|mov|webm|m4v)$/.test(name)) return new Response('No encontrado', {status: 404});
  const key = 'm/' + name, rh = req.headers.get('range') || '';
  const head = await env.FILES.head(key);
  if (!head) return new Response('No encontrado', {status: 404});
  const size = head.size, h = new Headers();
  head.writeHttpMetadata(h);
  h.set('etag', head.httpEtag); h.set('accept-ranges', 'bytes'); h.set('access-control-allow-origin', '*');
  if (req.headers.get('if-none-match') === head.httpEtag) return new Response(null, {status: 304, headers: h});
  /* rangos «bytes=inicio-fin», «bytes=inicio-» y «bytes=-últimos» */
  const m = rh.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let off, end;
    if (m[1]) { off = +m[1]; end = m[2] ? Math.min(+m[2], size - 1) : size - 1; } else { off = Math.max(0, size - +m[2]); end = size - 1; }
    if (off >= size || end < off) { h.set('content-range', `bytes */${size}`); return new Response(null, {status: 416, headers: h}); }
    const obj = await env.FILES.get(key, {range: {offset: off, length: end - off + 1}});
    if (!obj) return new Response('No encontrado', {status: 404});
    h.set('content-range', `bytes ${off}-${end}/${size}`); h.set('content-length', String(end - off + 1));
    return new Response(req.method === 'HEAD' ? null : obj.body, {status: 206, headers: h});
  }
  const obj = await env.FILES.get(key);
  if (!obj) return new Response('No encontrado', {status: 404});
  h.set('content-length', String(size));
  return new Response(req.method === 'HEAD' ? null : obj.body, {headers: h});
}
