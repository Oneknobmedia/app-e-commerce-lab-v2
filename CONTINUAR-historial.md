# CONTINUAR — E-commerce Lab: depurar «✦ Reconocer producto»

## Tarea
Depurar la función **Reconocer producto** (foto individual y subida en lote) del editor de catálogos «E-commerce Lab». Meta del usuario: dada una foto de producto, traer **foto de catálogo con fondo blanco + nombre + precio** (CLP) de Google/tiendas chilenas, **sin gastar créditos por búsqueda**, todo alojado en Cloudflare.

## Estado (2026-11-15)
- **En vivo: v2.5.1** = versión Worker `4ee3061d-db4b-4de7-9925-505477733c32` en https://oneknobmedia.com/e-commerce-lab/ (cuenta Cloudflare admin@oneknobmedia.com, `wrangler` ya logueado en este PC).
- Rollbacks: v2.5.0 `f0d84151-aa07-4457-b855-e6f3b5661178` · v2.4.0 `eb5d42d0-40b5-4c35-baef-ed272838548b` · v2.3.0 `159b38b6-ceb2-4f0c-9643-d7f1fe280735` · v2.2.0 `c1acfbd7-fc1f-4551-b513-4c093f065e7a`.
- **Último problema reportado** (v2.5.0): solo encontraba el nombre, sin fotos ni precios (caja genérica «Game Console R36S»). Causa: errores de Google Vision tragados en silencio + sin plan B por texto. v2.5.1 agregó búsqueda por nombre en **Falabella** (`__NEXT_DATA__`) y **Paris** (JSON-LD ItemList) con `fetch` simple, filtro `scoreMatch` (modelo obligatorio, descarta accesorios) y `diag` visible en el diálogo.
- **PENDIENTE:** el usuario debe probar la misma foto R36S en vivo y pasar la línea «Google: … / Tiendas: … / Busqué: …» del diálogo. En PC propio dio precio ≈ $52.990 y 8 fotos; **no verificado desde servidores de Cloudflare** (podrían bloquearlos → `diag.tiendas` dirá «no respondió»).

## Cómo funciona
- Editor → `POST /e-commerce-lab/api/recognize` (foto jpeg 768px + hint) → `recognize.js`:
  1. Workers AI lee la foto (`readPhoto` en `identify.js`): tipo, marca, modelo, query.
  2. Google Cloud Vision **Web Detection** (secreto `GOOGLE_VISION_KEY`, 1.000 gratis/mes, tope `VISION_MONTHLY_MAX` vía D1 `recog_usage`).
  3. Fichas de tiendas que Vision encontró (`pageInfo` + JSON-LD `ldProduct`) + búsqueda por texto Falabella/Paris (`storeSearch`, `buildQueries`) + Mercado Libre solo si hay `ML_CLIENT_ID/SECRET` (sin claves: API 403, web bloquea).
  4. Respaldo SerpApi (`SERPAPI_KEY`) si Vision da error y no hay tiendas.
  5. Respuesta `{name, brand, model, conf, price, prices[], images[], ref, matches, search, diag}`.
- `GET /api/recognize/img?u=` = proxy de imágenes (el editor lee píxeles); `/api/lens/<id>.jpg` = foto temporal para SerpApi/Lens.
- Editor (bloque `// RECOG-CORE`): `whiteScore`, `pickCatalog`, `recogPlan`, `recogDialog`, `recogPhotos`, `bulkRecog`; elige la foto con fondo blanco, la recorta 1:1 (`autoFrame`/`cropTo`), guarda original en `p.og` (Restaurar original / Ctrl+Z). Casillas: foto, nombre, precio (precio marcado solo si el producto no tiene precio real).

## Archivos (todo en este PC)
- **Editor (fuente única):** `C:\Users\Usuario\OneDrive - Universidad Privada Domingo Savio\Imágenes\catalogo GS electtronics\MI APLICACION WEB.html` (un solo HTML: `<script id="catdata">` + `<script id="app">`). Backups `…backup-antes-*.html` en la misma carpeta.
- **Proyecto Worker** (carpeta de esta sesión): `worker-e-commerce-lab/` → `wrangler.jsonc` (main `src-original/src/index.js`), `src-original/src/{index,auth,data,identify,recognize}.js`, `public/e-commerce-lab/` (index.html, login/, panel/, cuenta.js/css, gs-electronics.json, logos). Backups `src-v2.x-backup/`.
- **Tests (7 suites, todas pasan):** `tests/*.test.mjs` (`node tests/recog-worker.test.mjs`, `recog.test.mjs`, `eventos`, `bulk-modelos`, `bgmask`, `bgpaint`, `modelos-scan`), fixtures reales en `tests/fixtures/`.
- `publicar/` = copias de index.html por versión.
- Memoria de Claude: `C:\Users\Usuario\.claude\projects\C--Users-Usuario-OneDrive---Universidad-Privada-Domingo-Savio-Documentos-CLAUDE-ONE-KNOB-SESIONES-CODE-ECOMMERCE-LAB-3\memory\` (`ecommerce-lab-source.md`, `ecommerce-lab-deploy.md`).

## Receta segura de publicar (no saltarse)
1. Editar `MI APLICACION WEB.html` y/o `src-original/src/*.js`; correr todas las suites; `node --check`.
2. El index publicado = shell de login/proyectos (en `public/e-commerce-lab/index.html`: authgate, gatejs, gatecss) **+ solo los bloques del editor** (`css`, `edcss`, `edshell`, `app`) tomados del HTML local. Reemplazar solo esos bloques; **nunca tocar login, panel ni administración**.
3. `cd worker-e-commerce-lab && wrangler versions upload --message "vX" --tag vX` (comprobar «7 already uploaded» = nada más cambió y que los bindings incluyan DB, AI, AI_LIMIT, ASSETS y secretos).
4. **Pedir OK explícito al usuario** → `wrangler versions deploy <id>@100% --yes` → verificar con `curl` (index idéntico, `/login/` y `/panel/` 200, `/api/recognize` sin sesión 401).
5. Secretos solo los carga el usuario: `wrangler versions secret put NOMBRE --name e-commerce-lab` (crea versión nueva; hay que desplegar esa). Claude nunca lee ni escribe claves.
6. Probar en navegador local: servidor mock con sesión simulada (ver `.claude/launch.json` config `mock-api`; usa un `server.mjs` en el scratchpad de la sesión anterior, recrear si no existe) — el panel del navegador a veces está oculto y los clics reales fallan; usar JS para probar.

## Reglas del usuario
- Responder en **español, ultra conciso** (modo Caveman/RTK). Código, comandos y rutas sin comprimir.
- **Nunca** publicar/modificar producción (oneknobmedia.com) sin autorización explícita; no cambios destructivos; no inventar resultados de pruebas; el email del usuario es privado.
- Hacer solo lo pedido (el usuario pidió: «repara solo el panel de edición, nada de la estructura de admin»).

## v2.6.0 (2026-11-15) — Google Lens
- **EN VIVO desde 2026-11-15**: versión `ea331774-50e7-4d0d-a0ef-2ab15ae8cddf` (tag v2.6.0), verificada con curl. Rollback: v2.5.1 `4ee3061d-db4b-4de7-9925-505477733c32`. Pendiente: prueba real del usuario con Lens.
- Motor: botón abre popup `lens.google.com/uploadbyurl?url=<foto pública 30 min>` (nueva ruta `POST /api/recognize/lens`). `/api/recognize` = solo Workers AI (nombre sugerido). Vision/SerpApi/ML/Falabella/Paris eliminados de recognize.js (identify.js intacto). Secretos GOOGLE_VISION_KEY/SERPAPI_KEY/ML_* ya sin uso.
- Diálogo: pegar (Ctrl+V)/arrastrar/archivo foto desde Lens → miniatura → Aplicar de siempre; nombre/precio a mano; enlace Google Shopping. Lote: botones «Lens» y «Pegar foto» por fila.
- Backups: `src-v2.5.1-backup/`, `MI APLICACION WEB.backup-antes-v2.6.0.html`, `publicar/index.v2.5.1.html`.

## Siguiente paso (antiguo, v2.5.1)
1. Pedir al usuario el resultado de la prueba R36S (línea de diagnóstico del diálogo).
2. Según `diag`: tienda «no respondió» → alternativa para Cloudflare (otra tienda: Ripley/PC Factory/SP Digital, o cabeceras); error de Google → arreglar facturación/clave Cloud Vision; resultados malos → ajustar `scoreMatch`/`buildQueries`.
3. Revisar también el flujo en lote (`bulkRecog`) con varias fotos reales.

## v2.6.1 (2026-11-15)
- EN VIVO: `0d0b4b10-331e-4746-85c5-b947a223585a`. Rollback v2.6.0 `ea331774-50e7-4d0d-a0ef-2ab15ae8cddf`. Panel «Destacar categoría» (borde animado + etiqueta Destacado/Ofertas) tambien al seleccionar pastilla o titulo.

## v2.6.2
- EN VIVO: `540fb379-8e6f-45a2-a5dd-813db2454245`. Rollback v2.6.1 `0d0b4b10-331e-4746-85c5-b947a223585a`. Eventos: % por producto (ev.pp).

## v2.7.0
- EN VIVO: `cd81349d-0cc4-40c5-9195-b40683779475`. Rollback v2.6.2 `540fb379-8e6f-45a2-a5dd-813db2454245`. Fotos secundarias (p.gal, max 10).

## v2.7.1
- EN VIVO: `66b31cd8-4767-48c8-93d1-043a94e30296`. Rollback v2.7.0 `cd81349d-0cc4-40c5-9195-b40683779475`. Eventos respetan oferta propia (sin apilar).

## v2.7.2
- EN VIVO: `b4982980-3315-4301-9c1d-993b18c8bcaa`. Rollback v2.7.1 `66b31cd8-4767-48c8-93d1-043a94e30296`. Nombre de producto hasta 100 (DESC_MAX).

## v2.7.3
- EN VIVO: `12e1fb69-d0ff-4c2c-ba6d-e32fbac6e336`. Rollback v2.7.2 `b4982980-3315-4301-9c1d-993b18c8bcaa`. Quiero mi modelo; limite 100 en tarjeta.
