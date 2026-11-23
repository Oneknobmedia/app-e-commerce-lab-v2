/* Piezas comunes de login y panel: llamadas a la API, avisos, campo de clave con ojo, ventanas. */
(function () {
  var API = '/e-commerce-lab/api/';
  var ERR = {
    bad_credentials: 'Usuario o clave incorrectos.', locked: 'Demasiados intentos. Espera 10 minutos e inténtalo de nuevo.',
    frozen: 'Tu cuenta está congelada. Habla con el administrador.', bad_code: 'Usuario o código de recuperación incorrectos.',
    weak_password: 'La clave debe tener al menos 8 caracteres.', bad_current: 'La clave actual no es correcta.',
    bad_username: 'Usa 2 a 24 letras minúsculas, números, punto, guion o guion bajo.', exists: 'Ese usuario ya existe.',
    rate_limited: 'Demasiados intentos seguidos. Espera un momento.', no_session: 'Tu sesión terminó. Entra de nuevo.',
    bad_photo: 'La foto no es válida.', forbidden: 'No tienes permiso para eso.', self: 'No puedes hacer eso con tu propia cuenta.', frozen_target: 'Ese usuario está congelado: reactívalo para entrar.'
  };
  var C = window.Cuenta = {};
  C.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
  C.api = function (path, body) {
    return fetch(API + path, body === undefined ? {credentials: 'same-origin'} : {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)})
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.ok_ = r.ok; d.status_ = r.status; return d; }); })
      .catch(function () { return {code: 'offline', ok_: false}; });
  };
  C.msg = function (d) { return ERR[d.code] || (d.code === 'offline' ? 'Sin conexión. Revisa tu internet.' : 'Algo falló. Inténtalo otra vez.'); };
  C.toast = function (t) { var e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.appendChild(e); setTimeout(function () { e.remove(); }, 2600); };
  var OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var SHUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.1-5.9M9.9 4.2A9.7 9.7 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2M1 1l22 22"/></svg>';
  /* campo de clave con ojo. visible: abierto por defecto; nopaste: no deja pegar (para repetir la clave a mano) */
  C.pw = function (id, opts) {
    opts = opts || {};
    return '<div class="pw"><input class="in" id="' + id + '" type="' + (opts.visible ? 'text' : 'password') + '" autocomplete="' + (opts.auto || 'off') + '" ' + (opts.nopaste ? 'data-nopaste="1" ' : '') + 'spellcheck="false" autocapitalize="off">'
      + '<button type="button" class="eye" data-eye="' + id + '" aria-label="Mostrar u ocultar">' + (opts.visible ? OPEN : SHUT) + '</button></div>';
  };
  C.wire = function (root) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-eye]'); if (!b) return;
      var i = root.querySelector('#' + b.dataset.eye), show = i.type === 'password';
      i.type = show ? 'text' : 'password'; b.innerHTML = show ? OPEN : SHUT;
    });
    ['paste', 'drop'].forEach(function (ev) { root.addEventListener(ev, function (e) { if (e.target.dataset && e.target.dataset.nopaste) e.preventDefault(); }); });
  };
  C.copy = function (t) {
    var box = document.querySelector('.keybox code');
    var pick = function () { if (box) { var r = document.createRange(); r.selectNodeContents(box); var g = getSelection(); g.removeAllRanges(); g.addRange(r); } };
    var ok = function () { C.toast('Copiado'); }, fail = function () { pick(); C.toast('Seleccionado: pulsa Cmd+C (Ctrl+C en Windows)'); };
    var legacy = function () {
      var a = document.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
      (document.querySelector('.ov') || document.body).appendChild(a); a.focus(); a.select(); a.setSelectionRange(0, t.length);
      var r = false; try { r = document.execCommand('copy'); } catch (e) {} a.remove(); return r;
    };
    if (legacy()) return ok();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fail); else fail();
  };
  C.keybox = function (key) { return '<div class="keybox"><code>' + C.esc(key) + '</code><button type="button" class="btn sm" data-copy="' + C.esc(key) + '" style="width:auto;margin:0">Copiar</button></div>'; };
  C.initials = function (u) { return C.esc((u.nick || u.username || '?').trim().charAt(0).toUpperCase()); };
  C.avatar = function (u, cls) { return '<span class="avatar ' + (cls || '') + '"' + (u.photo ? ' style="background-image:url(' + C.esc(u.photo) + ')"' : '') + '>' + (u.photo ? '' : C.initials(u)) + '</span>'; };
  /* ventana: html del cuerpo; devuelve {el, close} */
  C.modal = function (html, onclose) {
    var ov = document.createElement('div'); ov.className = 'ov'; ov.innerHTML = '<div class="md" role="dialog">' + html + '</div>';
    document.body.appendChild(ov); C.wire(ov);
    var close = function () { ov.remove(); if (onclose) onclose(); };
    ov.addEventListener('mousedown', function (e) { if (e.target === ov && !ov.dataset.lock) close(); });
    ov.addEventListener('click', function (e) { var c = e.target.closest('[data-copy]'); if (c) C.copy(c.dataset.copy); var x = e.target.closest('[data-close]'); if (x) close(); });
    return {el: ov, close: close, $: function (s) { return ov.querySelector(s); }};
  };
  /* el código de recuperación se muestra una sola vez y no se cierra sin confirmar que se guardó */
  C.showRecovery = function (code, done) {
    var m = C.modal('<h3 class="grad">Tu código de recuperación</h3><p class="hint">Guárdalo en un lugar seguro. Si olvidas tu clave, con este código y tu usuario puedes crear una nueva. Solo se muestra ahora.</p>' + C.keybox(code)
      + '<label class="chk"><input type="checkbox" id="rc-ok"> Ya lo guardé</label><button class="btn" id="rc-go" disabled>Continuar</button>');
    m.el.dataset.lock = '1';
    m.$('#rc-ok').onchange = function () { m.$('#rc-go').disabled = !this.checked; };
    m.$('#rc-go').onclick = function () { m.close(); if (done) done(); };
  };
  /* el panel y el editor comparten esta barra de errores y ayudas pequeñas */
  /* proyectos hechos en este navegador antes de las cuentas (o sin abrir el editor): se suben a la cuenta del dueño del navegador */
  C.syncLocal = function (u) {
    if (!u || u.impersonated) return Promise.resolve(0);
    var ls; try { ls = window.localStorage; ls.length; } catch (e) { return Promise.resolve(0); }
    var ow = ls.getItem('ecl:owner');
    if (ow && ow.toLowerCase() !== u.username.toLowerCase()) return Promise.resolve(0);
    if (!ow) try { ls.setItem('ecl:owner', u.username); } catch (e) {}
    var names = {}; try { (JSON.parse(ls.getItem('ecl:projects')) || []).forEach(function (n) { names[String(n).toLowerCase()] = n; }); } catch (e) {}
    var keys = [];
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && k.indexOf('catgen:p:') === 0 && !/:cart$/.test(k) && !/^catgen:p:(as|u):/.test(k)) keys.push(k); }
    if (!keys.length) return Promise.resolve(0);
    return C.api('projects').then(function (d) {
      if (!d.ok_) return 0;
      var have = {}; (d.projects || []).forEach(function (p) { have[p.name.toLowerCase()] = 1; });
      var up = keys.filter(function (k) { return !have[k.slice(9)]; }), n = 0;
      return up.reduce(function (p, k) {
        return p.then(function () {
          var name = names[k.slice(9)] || k.slice(9), txt = ls.getItem(k);
          if (!txt) return;
          return fetch(API + 'projects/put?name=' + encodeURIComponent(name), {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'text/plain;charset=utf-8'}, body: txt}).then(function (r) { if (r.ok) n++; }, function () {});
        });
      }, Promise.resolve()).then(function () { return n; });
    });
  };
  C.goLogin = function () { location.replace('/e-commerce-lab/login/?next=' + encodeURIComponent(location.pathname + location.search)); };
})();
