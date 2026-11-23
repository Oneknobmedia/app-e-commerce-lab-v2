/* Cuentas: usuario + clave, sesiones por cookie y panel de admin. Todo en D1 (env.DB); las claves se guardan cifradas (PBKDF2) y no se pueden ver, solo restablecer. */
const enc = new TextEncoder();
const b64 = u => btoa(String.fromCharCode(...u));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ITER = 100000;
const COOKIE = 'okm_s';
const ADMIN_COOKIE = 'okm_a';
const DAY = 86400;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const USER_RE = /^[a-z0-9._-]{2,24}$/;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const now = () => Math.floor(Date.now() / 1000);

const out = (status, body, headers) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers}});

async function derive(pw, salt, iter) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter}, k, 256));
}
async function hashPw(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(pw, salt, ITER))}`;
}
async function checkPw(pw, stored) {
  const [t, it, s, h] = String(stored || '').split('$');
  if (t !== 'pbkdf2') { await derive(pw, new Uint8Array(16), ITER); return false; }
  const d = await derive(pw, unb64(s), +it), e = unb64(h);
  let x = d.length ^ e.length;
  for (let i = 0; i < e.length; i++) x |= d[i] ^ e[i];
  return x === 0;
}
/* llave tipo API: OKM-7F3K-9QXA-M2LD (sin letras que se confunden) */
function genKey(prefix, groups) {
  const r = crypto.getRandomValues(new Uint8Array(groups * 4));
  const g = []; for (let i = 0; i < groups; i++) g.push([...r.slice(i * 4, i * 4 + 4)].map(v => ALPHA[v & 31]).join(''));
  return prefix + '-' + g.join('-');
}
/* las llaves (OKM-...) se aceptan con o sin guiones y en minúsculas; las claves propias, tal cual */
const verifyPw = async (pw, stored) => (await checkPw(pw, stored)) || (/^okm/i.test(pw) && checkPw(normCode(pw), stored));
const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(v => v.toString(16).padStart(2, '0')).join('');
const goodPw = p => typeof p === 'string' && p.length >= 8 && p.length <= 200;
const nameOk = u => typeof u === 'string' && USER_RE.test(u);

const cookieOf = (req, name) => ((req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(name + '=')) || '').slice(name.length + 1);
const setCookie = (val, maxAge, name) => `${name || COOKIE}=${val}; Path=/e-commerce-lab; HttpOnly; Secure; SameSite=Lax${maxAge == null ? '' : '; Max-Age=' + maxAge}`;

async function newSession(env, userId, remember, impBy) {
  const tok = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const life = remember ? 30 * DAY : DAY;
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires, imp_by) VALUES (?, ?, ?, ?)').bind(await sha(tok), userId, now() + life, impBy || null).run();
  if (impBy) return tok;
  await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now()).run();
  return setCookie(tok, remember ? life : null);
}
export async function userOf(req, env) {
  const tok = cookieOf(req, COOKIE);
  if (!tok) return null;
  return await env.DB.prepare('SELECT u.*, s.imp_by AS imp_by FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires > ? AND u.status = ?').bind(await sha(tok), now(), 'active').first();
}
/* con el admin dentro de la cuenta (imp_by), no se pide crear clave: entra directo al editor del usuario */
const pub = u => ({username: u.username, nick: u.nick || '', photo: u.photo || '', role: u.role, mustChange: !!u.must_change && !u.imp_by, hasRecovery: !!u.recovery_hash, ...(u.imp_by ? {impersonated: true} : {})});
/* respuesta con varias cookies (entrar como usuario y volver al admin cambian las dos) */
const outCookies = (status, body, cookies) => { const h = new Headers({'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}); cookies.forEach(c => h.append('set-cookie', c)); return new Response(JSON.stringify(body), {status, headers: h}); };
/* vuelve a la sesión del admin guardada al entrar en la cuenta de otro usuario */
async function backToAdmin(req, env, me) {
  const tok = cookieOf(req, COOKIE), at = cookieOf(req, ADMIN_COOKIE);
  if (tok) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha(tok)).run();
  const adm = at ? await env.DB.prepare("SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires > ? AND u.role = 'admin' AND u.status = 'active'").bind(await sha(at), now()).first() : null;
  if (!adm || adm.user_id !== me.imp_by) return outCookies(200, {ok: true, back: false}, [setCookie('', 0), setCookie('', 0, ADMIN_COOKIE)]);
  return outCookies(200, {ok: true, back: true}, [setCookie(at, null), setCookie('', 0, ADMIN_COOKIE)]);
}

/* 5 fallos seguidos bloquean 10 minutos ese usuario desde esa red */
async function locked(env, key) { const r = await env.DB.prepare('SELECT until FROM attempts WHERE key = ?').bind(key).first(); return !!(r && r.until > now()); }
async function fail(env, key) {
  await env.DB.prepare('INSERT INTO attempts (key, n, until) VALUES (?, 1, 0) ON CONFLICT(key) DO UPDATE SET n = n + 1, until = CASE WHEN n + 1 >= 5 THEN ? ELSE until END').bind(key, now() + 600).run();
}
const clear = (env, key) => env.DB.prepare('DELETE FROM attempts WHERE key = ?').bind(key).run();

async function ownRecovery(env, userId) {
  const code = genKey('REC', 4);
  await env.DB.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?').bind(await hashPw(normCode(code)), userId).run();
  return code;
}
const dropOthers = async (env, req, userId) => {
  const tok = cookieOf(req, COOKIE);
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(userId, tok ? await sha(tok) : '').run();
};

export async function handle(req, env, path) {
  const ip = req.headers.get('cf-connecting-ip') || 'x';
  const rest = path.slice('/e-commerce-lab/api/'.length);
  if (req.method === 'GET' && rest === 'auth/me') {
    const u = await userOf(req, env);
    return u ? out(200, {user: pub(u)}) : out(401, {code: 'no_session'});
  }
  if (req.method !== 'POST') return out(405, {code: 'method'});
  const org = req.headers.get('origin') || '';
  if (!['https://oneknobmedia.com', 'https://www.oneknobmedia.com'].includes(org) && !env.ECL_DEV_ORIGIN) return out(403, {code: 'origin'});
  if (!(await env.AI_LIMIT.limit({key: 'auth:' + ip})).success) return out(429, {code: 'rate_limited'});
  let b; try { b = await req.json(); } catch (e) { b = {}; }
  b = b && typeof b === 'object' ? b : {};

  if (rest === 'auth/login') {
    const un = String(b.username || '').trim().toLowerCase(), key = `login:${un}:${ip}`;
    if (await locked(env, key)) return out(429, {code: 'locked'});
    const u = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(un).first();
    const ok = await verifyPw(String(b.password || ''), u && u.pass_hash);
    if (!u || !ok) { await fail(env, key); return out(401, {code: 'bad_credentials'}); }
    if (u.status !== 'active') return out(403, {code: 'frozen'});
    await clear(env, key);
    return out(200, {user: pub(u)}, {'set-cookie': await newSession(env, u.id, !!b.remember)});
  }
  if (rest === 'auth/forgot') {
    const un = String(b.username || '').trim().toLowerCase(), key = `forgot:${un}:${ip}`;
    if (await locked(env, key)) return out(429, {code: 'locked'});
    if (!goodPw(b.password)) return out(400, {code: 'weak_password'});
    const u = await env.DB.prepare('SELECT * FROM users WHERE username = ? AND status = ?').bind(un, 'active').first();
    const ok = await checkPw(normCode(b.code), u && u.recovery_hash);
    if (!u || !ok) { await fail(env, key); return out(401, {code: 'bad_code'}); }
    await clear(env, key);
    await env.DB.prepare('UPDATE users SET pass_hash = ?, must_change = 0 WHERE id = ?').bind(await hashPw(b.password), u.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id).run();
    return out(200, {recovery: await ownRecovery(env, u.id)}, {'set-cookie': await newSession(env, u.id, false)});
  }
  if (rest === 'auth/help') {
    const un = String(b.username || '').trim().toLowerCase();
    const u = await env.DB.prepare('SELECT id FROM users WHERE username = ? AND status = ?').bind(un, 'active').first();
    if (u && !(await env.DB.prepare('SELECT id FROM help WHERE user_id = ? AND done = 0').bind(u.id).first()))
      await env.DB.prepare('INSERT INTO help (user_id, created_at) VALUES (?, ?)').bind(u.id, now()).run();
    return out(200, {ok: true});
  }

  const me = await userOf(req, env);
  if (!me) return out(401, {code: 'no_session'});

  if (rest === 'auth/return' || (rest === 'auth/logout' && me.imp_by)) {
    if (!me.imp_by) return out(400, {code: 'not_needed'});
    return backToAdmin(req, env, me);
  }
  /* claves y códigos son solo del dueño de la cuenta: el admin dentro de otra cuenta no los cambia */
  if (me.imp_by && /^auth\/(first|password|recovery)$/.test(rest)) return out(403, {code: 'forbidden'});
  if (rest === 'auth/logout') {
    const tok = cookieOf(req, COOKIE);
    if (tok) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha(tok)).run();
    return out(200, {ok: true}, {'set-cookie': setCookie('', 0)});
  }
  if (rest === 'auth/first') {
    if (!me.must_change) return out(400, {code: 'not_needed'});
    if (!goodPw(b.password)) return out(400, {code: 'weak_password'});
    await env.DB.prepare('UPDATE users SET pass_hash = ?, must_change = 0 WHERE id = ?').bind(await hashPw(b.password), me.id).run();
    await dropOthers(env, req, me.id);
    return out(200, {recovery: await ownRecovery(env, me.id)});
  }
  if (rest === 'auth/password' || rest === 'auth/recovery') {
    const key = `pw:${me.id}:${ip}`;
    if (await locked(env, key)) return out(429, {code: 'locked'});
    if (!(await verifyPw(String(b.current || ''), me.pass_hash))) { await fail(env, key); return out(401, {code: 'bad_current'}); }
    await clear(env, key);
    if (rest === 'auth/recovery') return out(200, {recovery: await ownRecovery(env, me.id)});
    if (!goodPw(b.password)) return out(400, {code: 'weak_password'});
    await env.DB.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(await hashPw(b.password), me.id).run();
    await dropOthers(env, req, me.id);
    return out(200, {ok: true});
  }
  if (rest === 'auth/profile') {
    const nick = String(b.nick == null ? me.nick : b.nick).trim().slice(0, 40);
    let photo = me.photo;
    if (typeof b.photo === 'string') {
      if (b.photo && (!PHOTO_RE.test(b.photo) || b.photo.length > 200000)) return out(400, {code: 'bad_photo'});
      photo = b.photo;
    }
    await env.DB.prepare('UPDATE users SET nick = ?, photo = ? WHERE id = ?').bind(nick, photo, me.id).run();
    return out(200, {user: pub({...me, nick, photo})});
  }

  /* panel de admin */
  if (rest.startsWith('admin/')) {
    if (me.role !== 'admin' || me.must_change) return out(403, {code: 'forbidden'});
    if (rest === 'admin/users') {
      const {results} = await env.DB.prepare('SELECT id, username, nick, photo, role, status, must_change, created_at, (SELECT COUNT(*) FROM help h WHERE h.user_id = users.id AND h.done = 0) AS help, (SELECT COUNT(*) FROM projects p WHERE p.user_id = users.id) AS projects FROM users ORDER BY created_at').all();
      return out(200, {users: results});
    }
    if (rest === 'admin/create') {
      const un = String(b.username || '').trim().toLowerCase();
      if (!nameOk(un)) return out(400, {code: 'bad_username'});
      if (await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(un).first()) return out(409, {code: 'exists'});
      const key = genKey('OKM', 3);
      await env.DB.prepare('INSERT INTO users (username, nick, pass_hash, must_change, created_at) VALUES (?, ?, ?, 1, ?)').bind(un, un.charAt(0).toUpperCase() + un.slice(1), await hashPw(normCode(key)), now()).run();
      return out(200, {username: un, key});
    }
    const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(+b.id || 0).first();
    if (!target) return out(404, {code: 'not_found'});
    if (target.id === me.id && rest !== 'admin/reset') return out(400, {code: 'self'});
    /* entrar al panel de otro usuario sin su clave: solo el admin, y no en otra cuenta de admin */
    if (rest === 'admin/impersonate') {
      if (target.role === 'admin') return out(400, {code: 'forbidden'});
      if (target.status !== 'active') return out(400, {code: 'frozen_target'});
      const tok = await newSession(env, target.id, false, me.id);
      return outCookies(200, {ok: true, username: target.username}, [setCookie(tok, null), setCookie(cookieOf(req, COOKIE), DAY, ADMIN_COOKIE)]);
    }
    if (rest === 'admin/freeze' || rest === 'admin/unfreeze') {
      await env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(rest === 'admin/freeze' ? 'frozen' : 'active', target.id).run();
      if (rest === 'admin/freeze') await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
      return out(200, {ok: true});
    }
    if (rest === 'admin/delete') {
      for (const t of ['sessions', 'help']) await env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(target.id).run();
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id).run();
      return out(200, {ok: true});
    }
    if (rest === 'admin/reset') {
      if (target.id === me.id) return out(400, {code: 'self'});
      const key = genKey('OKM', 3);
      await env.DB.prepare('UPDATE users SET pass_hash = ?, must_change = 1, recovery_hash = NULL WHERE id = ?').bind(await hashPw(normCode(key)), target.id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
      await env.DB.prepare('UPDATE help SET done = 1 WHERE user_id = ?').bind(target.id).run();
      return out(200, {username: target.username, key});
    }
  }
  return out(404, {code: 'not_found'});
}
