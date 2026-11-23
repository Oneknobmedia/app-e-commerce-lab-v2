/* e-commerce-lab: sirve la app (archivos de public/) y la IA propia del sitio en /e-commerce-lab/api/ai.
   La IA corre en Workers AI de esta cuenta de Cloudflare: no usa Claude ni claves externas. */
import {handle, userOf} from './auth.js';
import {data, publicPage, media} from './data.js';
import {identify} from './identify.js';
import {recognize, lensServe, lensSave, imgProxy} from './recognize.js';
const DATA_RX = /^(projects|publish|media)(\/|$)/;
const AI_PATH = '/e-commerce-lab/api/ai';
const ID_PATH = '/e-commerce-lab/api/identify';
const RC_PATH = '/e-commerce-lab/api/recognize';
/* default: fotos (nombres, contorno) y gráficos SVG · quick: textos cortos y diagnóstico de calidad */
const MODELS = {
  default: '@cf/mistralai/mistral-small-3.1-24b-instruct',
  quick: '@cf/meta/llama-4-scout-17b-16e-instruct'
};
const ORIGINS = ['https://oneknobmedia.com', 'https://www.oneknobmedia.com'];
const MAX_BODY = 4000000;
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === AI_PATH) return ai(req, env);
    if (url.pathname === ID_PATH) return identifyApi(req, env);
    if (url.pathname === RC_PATH) return recognizeApi(req, env, url);
    if (url.pathname === RC_PATH + '/img') return recognizeImg(req, env, url);
    if (url.pathname === RC_PATH + '/lens') return recognizeLens(req, env, url);
    /* foto temporal para Google Lens: pública 30 min con id aleatorio (Lens no puede iniciar sesión) */
    if (url.pathname.startsWith('/e-commerce-lab/api/lens/')) return req.method === 'GET' ? lensServe(env, url.pathname.slice('/e-commerce-lab/api/lens/'.length)) : out(405, {code: 'method'});
    if (url.pathname.startsWith('/e-commerce-lab/api/')) {
      const rest = url.pathname.slice('/e-commerce-lab/api/'.length);
      if (DATA_RX.test(rest)) return dataApi(req, env, rest);
      return handle(req, env, url.pathname);
    }
    if (url.pathname.startsWith('/e-commerce-lab/media/')) return media(req, env, url.pathname.slice('/e-commerce-lab/media/'.length));
    if (url.pathname !== '/e-commerce-lab' && !url.pathname.startsWith('/e-commerce-lab/')) {
      /* catálogos publicados; lo demás de oneknobmedia.com sigue a la página normal */
      const pg = await publicPage(req, env, url.pathname);
      if (pg) return pg;
      try { const r = await fetch(req); if (r.status < 500) return r; } catch (e) {}
      return Response.redirect('https://oneknobmedia.com/', 302);
    }
    return env.ASSETS.fetch(req);
  }
};

const out = (status, body) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}});
const clamp = (v, lo, hi, d) => { v = Math.round(+v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

/* ECL_DEV_ORIGIN solo existe en pruebas locales (.dev.vars): permite el origen http://localhost */
const okOrigin = (req, env) => { const o = req.headers.get('origin') || ''; return ORIGINS.includes(o) || !!env.ECL_DEV_ORIGIN; };
async function dataApi(req, env, rest) {
  if (req.method !== 'GET' && !okOrigin(req, env)) return out(403, {code: 'origin'});
  const me = await userOf(req, env);
  if (!me) return out(401, {code: 'no_session'});
  try {
    return (await data(req, env, rest, me)) || out(404, {code: 'not_found'});
  } catch (e) {
    console.error('data', rest, String((e && e.message) || e));
    return out(500, {code: 'error'});
  }
}

async function ai(req, env) {
  if (req.method !== 'POST') return out(405, {code: 'method'});
  if (!okOrigin(req, env)) return out(403, {code: 'origin'});
  if (!(await userOf(req, env))) return out(401, {code: 'no_session'});
  const {success} = await env.AI_LIMIT.limit({key: req.headers.get('cf-connecting-ip') || 'x'});
  if (!success) return out(429, {code: 'rate_limited'});
  if (+(req.headers.get('content-length') || 0) > MAX_BODY) return out(413, {code: 'too_big'});
  let b; try { b = await req.json(); } catch (e) { return out(400, {code: 'bad_request'}); }
  const prompt = String((b && b.prompt) || '').slice(0, 12000);
  if (!prompt) return out(400, {code: 'empty'});
  const images = (Array.isArray(b.images) ? b.images : []).filter(u => typeof u === 'string' && IMG.test(u)).slice(0, 2);
  const content = [{type: 'text', text: prompt}, ...images.map(u => ({type: 'image_url', image_url: {url: u}}))];
  const model = MODELS[b.tier] || MODELS.default;
  try {
    const r = await env.AI.run(model, {messages: [{role: 'user', content}], max_tokens: clamp(b.maxTokens, 64, 4096, 2048), temperature: 0.2});
    return out(200, {text: textOf(r)});
  } catch (e) {
    const msg = String((e && e.message) || e), busy = /capacity|rate|429|too many/i.test(msg);
    console.error('ai', model, msg);
    return out(busy ? 429 : 502, {code: busy ? 'rate_limited' : 'error'});
  }
}

/* identificar producto por foto + búsqueda en Google (ver identify.js) */
async function identifyApi(req, env) {
  if (req.method !== 'POST') return out(405, {code: 'method'});
  if (!okOrigin(req, env)) return out(403, {code: 'origin'});
  if (!(await userOf(req, env))) return out(401, {code: 'no_session'});
  if (!env.AI) return out(503, {code: 'unavailable'});
  const {success} = await env.AI_LIMIT.limit({key: req.headers.get('cf-connecting-ip') || 'x'});
  if (!success) return out(429, {code: 'rate_limited'});
  if (+(req.headers.get('content-length') || 0) > MAX_BODY) return out(413, {code: 'too_big'});
  let b; try { b = await req.json(); } catch (e) { return out(400, {code: 'bad_request'}); }
  if (!b || typeof b.image !== 'string' || !IMG.test(b.image)) return out(400, {code: 'no_image'});
  try { return out(200, await identify(env, b, textOf)); }
  catch (e) {
    const msg = String((e && e.message) || e), busy = /capacity|rate|429|too many/i.test(msg);
    console.error('identify', msg);
    return out(busy ? 429 : 502, {code: busy ? 'rate_limited' : 'error'});
  }
}

/* reconocer producto: la IA sugiere nombre; la búsqueda visual la hace Google Lens en el navegador (ver recognize.js) */
async function recognizeApi(req, env, url) {
  if (req.method !== 'POST') return out(405, {code: 'method'});
  if (!okOrigin(req, env)) return out(403, {code: 'origin'});
  if (!(await userOf(req, env))) return out(401, {code: 'no_session'});
  if (!env.AI) return out(503, {code: 'unavailable'});
  const {success} = await env.AI_LIMIT.limit({key: req.headers.get('cf-connecting-ip') || 'x'});
  if (!success) return out(429, {code: 'rate_limited'});
  if (+(req.headers.get('content-length') || 0) > MAX_BODY) return out(413, {code: 'too_big'});
  let b; try { b = await req.json(); } catch (e) { return out(400, {code: 'bad_request'}); }
  if (!b || typeof b.image !== 'string' || !IMG.test(b.image)) return out(400, {code: 'no_image'});
  try { return out(200, await recognize(env, b, textOf)); }
  catch (e) {
    const msg = String((e && e.message) || e), busy = /capacity|rate|429|too many/i.test(msg);
    console.error('recognize', msg);
    return out(busy ? 429 : 502, {code: busy ? 'rate_limited' : 'error'});
  }
}
/* foto del producto → URL pública temporal para abrir Google Lens desde el navegador */
async function recognizeLens(req, env, url) {
  if (req.method !== 'POST') return out(405, {code: 'method'});
  if (!okOrigin(req, env)) return out(403, {code: 'origin'});
  if (!(await userOf(req, env))) return out(401, {code: 'no_session'});
  if (!env.DB) return out(503, {code: 'unavailable'});
  const {success} = await env.AI_LIMIT.limit({key: req.headers.get('cf-connecting-ip') || 'x'});
  if (!success) return out(429, {code: 'rate_limited'});
  if (+(req.headers.get('content-length') || 0) > MAX_BODY) return out(413, {code: 'too_big'});
  let b; try { b = await req.json(); } catch (e) { return out(400, {code: 'bad_request'}); }
  try { return out(200, await lensSave(env, b && b.image, env.LENS_ORIGIN || url.origin)); }
  catch (e) {
    if (e && e.code === 'no_image') return out(400, {code: 'no_image'});
    console.error('lens', String((e && e.message) || e));
    return out(502, {code: 'error'});
  }
}
async function recognizeImg(req, env, url) {
  if (req.method !== 'GET') return out(405, {code: 'method'});
  if (!(await userOf(req, env))) return out(401, {code: 'no_session'});
  return imgProxy(url.searchParams.get('u') || '');
}

/* los modelos responden en formatos distintos: texto, objeto ya parseado o estilo chat completions */
function textOf(r) {
  if (!r) return '';
  if (typeof r.response === 'string') return r.response;
  if (r.response && typeof r.response === 'object') return JSON.stringify(r.response);
  const m = r.choices && r.choices[0] && r.choices[0].message;
  return m && typeof m.content === 'string' ? m.content : '';
}
