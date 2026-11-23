/* Identificar un producto por su foto (POST /e-commerce-lab/api/identify).
   1. Workers AI lee la foto: tipo, marca, modelo y el sitio oficial de la marca.
   2. Busca referencias en Google: primero en la página oficial de la marca; si no aparece, en tiendas (retail),
      de donde también sale el precio aproximado. Las imágenes de referencia salen de Google Imágenes.
   3. Con los títulos encontrados, la IA deja el nombre final (marca + modelo + atributo clave).
   Búsqueda: SERPAPI_KEY (Google vía SerpApi: web, Imágenes y Shopping) o GOOGLE_API_KEY + GOOGLE_CX
   (Programmable Search Engine). Sin claves responde solo con lo que se ve en la foto (search: null). */

const VISION = '@cf/mistralai/mistral-small-3.1-24b-instruct';
const QUICK = '@cf/meta/llama-4-scout-17b-16e-instruct';
const RETAIL = ['falabella.com', 'paris.cl', 'ripley.cl', 'mercadolibre.cl', 'pcfactory.cl', 'lider.cl', 'hites.com', 'abcdin.cl', 'spdigital.cl', 'sodimac.cl', 'maconline.com', 'amazon.com', 'aliexpress.com'];
const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i;
const T = 8000;

const jsonIn = t => {
  t = String(t || '').replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const m = t.match(/\{[\s\S]*\}/); if (m) try { return JSON.parse(m[0]); } catch (e) {}
  return null;
};
const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
const onSite = (u, site) => { const h = hostOf(u); return !!h && (h === site || h.endsWith('.' + site)); };
const httpsOnly = u => /^https:\/\//i.test(String(u || '')) ? String(u).slice(0, 800) : '';
/* «$12.990», «CLP 12.990», «12.990 pesos» → 12990 */
function priceIn(t) {
  const m = String(t || '').match(/(?:\$|CLP\s?)\s?(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})(?!\d)/i);
  if (!m) return 0;
  const n = +m[1].replace(/[.\s]/g, '');
  return n >= 500 && n <= 50000000 ? n : 0;
}
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

async function getJson(url) {
  const r = await fetch(url, {signal: AbortSignal.timeout(T), headers: {accept: 'application/json'}});
  if (!r.ok) throw new Error('search ' + r.status);
  return r.json();
}

/* proveedores de búsqueda con la misma forma: web(q, site?) → [{title, url, snippet, img, price}], images(q) → [url], shop(q) → [{title, url, site, price, img}] */
function provider(env) {
  if (env.SERPAPI_KEY) {
    const base = (engine, q, extra = '') => `https://serpapi.com/search.json?engine=${engine}&q=${encodeURIComponent(q)}&gl=cl&hl=es&api_key=${encodeURIComponent(env.SERPAPI_KEY)}${extra}`;
    return {
      name: 'serpapi',
      web: async (q, site) => ((await getJson(base('google', site ? `${q} site:${site}` : q, '&num=6'))).organic_results || []).map(x => ({
        title: x.title, url: x.link, snippet: x.snippet, img: x.thumbnail, price: +(((x.rich_snippet || {}).top || {}).detected_extensions || {}).price || priceIn(x.snippet)})),
      images: async q => ((await getJson(base('google_images', q))).images_results || []).slice(0, 6).map(x => x.thumbnail || x.original),
      shop: async q => ((await getJson(base('google_shopping', q))).shopping_results || []).slice(0, 8).map(x => ({
        title: x.title, url: x.product_link || x.link, site: x.source, price: +x.extracted_price || priceIn(x.price), img: x.thumbnail}))
    };
  }
  if (env.GOOGLE_API_KEY && env.GOOGLE_CX) {
    const base = (q, extra = '') => `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(env.GOOGLE_API_KEY)}&cx=${encodeURIComponent(env.GOOGLE_CX)}&q=${encodeURIComponent(q)}&gl=cl&hl=es&num=6${extra}`;
    const priceOf = x => { const pm = x.pagemap || {}, o = (pm.offer || [])[0] || (pm.product || [])[0] || {}; return +String(o.price || o.lowprice || '').replace(/[^\d]/g, '') || priceIn(x.snippet); };
    const web = async (q, site) => ((await getJson(base(q, site ? `&siteSearch=${encodeURIComponent(site)}&siteSearchFilter=i` : ''))).items || []).map(x => ({
      title: x.title, url: x.link, snippet: x.snippet, img: ((x.pagemap || {}).cse_image || [])[0] && x.pagemap.cse_image[0].src, price: priceOf(x)}));
    return {
      name: 'google',
      web,
      images: async q => ((await getJson(base(q, '&searchType=image'))).items || []).slice(0, 6).map(x => (x.image && x.image.thumbnailLink) || x.link),
      shop: async q => (await web(q + ' precio')).map(x => ({title: x.title, url: x.url, site: hostOf(x.url), price: x.price, img: x.img}))
    };
  }
  return null;
}

/* 1. foto → tipo, marca, modelo y sitio oficial (también lo usa recognize.js) */
export async function readPhoto(env, img, hint, textOf) {
  const vPrompt = `Eres experto en productos de tecnología, accesorios y retail en Chile. Mira la foto (lee marca, modelo y todo el texto del empaque).
${hint ? 'Contexto: ' + hint + '\n' : ''}Responde SOLO JSON:
{"type": "tipo de producto en español", "brand": "marca o vacío si no se ve", "model": "modelo o vacío", "name": "nombre comercial en MAYÚSCULAS, máx 70 caracteres: tipo + marca + modelo + atributo clave", "query": "búsqueda corta para Google con marca y modelo", "brandSite": "dominio oficial de la marca (ej. samsung.com) o vacío", "conf": 0.0-1.0}
No inventes marca ni modelo que no se vean o no reconozcas con seguridad.`;
  const vr = await env.AI.run(VISION, {messages: [{role: 'user', content: [{type: 'text', text: vPrompt}, {type: 'image_url', image_url: {url: img}}]}], max_tokens: 400, temperature: 0.1});
  return jsonIn(textOf(vr)) || {};
}

export async function identify(env, b, textOf) {
  const img = b.image, hint = str(b.hint, 400);
  const v = await readPhoto(env, img, hint, textOf);
  const res = {
    type: str(v.type, 60), brand: str(v.brand, 40), model: str(v.model, 60), name: str(v.name, 90).toUpperCase(),
    conf: Math.max(0, Math.min(1, +v.conf || 0)), price: 0, currency: 'CLP', prices: [], ref: null, images: [], search: null
  };
  const q = str(v.query, 120) || [res.brand, res.model, res.type].filter(Boolean).join(' ');
  const pv = provider(env);
  if (!pv || !q) return res;
  res.search = pv.name;
  const site = DOMAIN.test(str(v.brandSite, 80)) ? str(v.brandSite, 80).toLowerCase().replace(/^www\./, '') : '';

  /* 2. página oficial primero; imágenes y tiendas en paralelo */
  const [off, imgs, shop] = await Promise.all([
    site ? pv.web(q, site).catch(() => []) : [],
    pv.images(q).catch(() => []),
    pv.shop(q).catch(() => [])
  ]);
  const official = off.find(x => onSite(x.url, site));
  let retail = shop.filter(x => x.url && x.price > 0);
  if (!retail.length) retail = (await pv.web(q + ' precio chile').catch(() => [])).filter(x => x.price > 0).map(x => ({title: x.title, url: x.url, site: hostOf(x.url), price: x.price, img: x.img}));
  /* tiendas conocidas primero */
  retail.sort((a, c) => (RETAIL.some(s => onSite(c.url, s)) ? 1 : 0) - (RETAIL.some(s => onSite(a.url, s)) ? 1 : 0));
  res.images = imgs.map(httpsOnly).filter(Boolean).slice(0, 4);
  res.prices = retail.slice(0, 5).map(x => ({site: str(x.site || hostOf(x.url), 40), price: Math.round(x.price), url: httpsOnly(x.url), title: str(x.title, 120)}));
  res.price = median(res.prices.map(x => x.price).filter(Boolean));
  const top = official || retail[0];
  if (top) res.ref = {title: str(top.title, 140), url: httpsOnly(top.url), site: official ? site : str(top.site || hostOf(top.url), 40), official: !!official, img: httpsOnly(top.img)};

  /* 3. nombre final con los títulos encontrados (la página oficial manda) */
  const titles = [official && 'OFICIAL: ' + official.title, ...retail.slice(0, 4).map(x => 'TIENDA ' + (x.site || hostOf(x.url)) + ': ' + x.title)].filter(Boolean);
  if (titles.length) {
    try {
      const rp = `Producto visto en una foto: ${JSON.stringify({type: res.type, brand: res.brand, model: res.model, name: res.name})}.
Resultados de Google:\n${titles.join('\n')}
Si los resultados corresponden al mismo producto, corrige marca, modelo y nombre usando primero el título OFICIAL y si no las tiendas. Si no corresponden, deja lo de la foto.
Responde SOLO JSON: {"brand": "", "model": "", "name": "MAYÚSCULAS, español, máx 70 caracteres: tipo + marca + modelo + atributo clave, sin precio", "match": true|false}`;
      const r2 = jsonIn(textOf(await env.AI.run(QUICK, {messages: [{role: 'user', content: rp}], max_tokens: 300, temperature: 0.1}))) || {};
      if (r2.match !== false && r2.name) {
        res.name = str(r2.name, 90).toUpperCase(); res.brand = str(r2.brand, 40) || res.brand; res.model = str(r2.model, 60) || res.model;
        res.conf = Math.max(res.conf, official ? 0.9 : 0.75);
      }
    } catch (e) {}
  }
  return res;
}
