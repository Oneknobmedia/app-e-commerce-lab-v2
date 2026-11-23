# App E-commerce Lab v2

Editor de catálogos «E-commerce Lab» + Worker de Cloudflare que lo sirve.
En vivo: https://oneknobmedia.com/e-commerce-lab/

**Versión de este repositorio: v2.10.7** (Worker `e-commerce-lab`, id `5c626e41-2c8b-4657-b053-02e953f16e02`).

## Estructura
| Carpeta / archivo | Qué es |
|---|---|
| `editor/MI APLICACION WEB.html` | Fuente única del editor (un HTML: `<script id="catdata">` + `<script id="app">`; **CRLF**) |
| `worker-e-commerce-lab/` | Worker de Cloudflare: `wrangler.jsonc`, `src-original/src/*.js` (API, cuentas, proyectos, reconocimiento) y `public/e-commerce-lab/` (index publicado, login, panel) |
| `tests/` | 15 suites (`node tests/<x>.test.mjs [ruta-del-editor]`) |
| `herramientas/merge.py` | Mezcla el editor en el `index.html` publicado (`css`, `edcss`, `edshell`, `shell`, `app`) |
| `CONTINUAR.md` / `CONTINUAR-historial.md` | Estado, versiones y receta de publicación |
| `CLAUDE.md` | Reglas fijas de trabajo con Claude Code |

## Probar
```powershell
$ed = "editor/MI APLICACION WEB.html"
Get-ChildItem tests/*.test.mjs | % { node $_.FullName $ed }
```
Las suites del editor reciben la ruta como argumento; las del Worker (`recog-worker`, `puttext-retry`) leen `worker-e-commerce-lab/src-original/src`.

## Publicar (resumen; detalle en `CONTINUAR.md`)
1. Editar el HTML y correr las suites.
2. `python herramientas/merge.py <index publicado> <editor> <backup anterior> <salida>` y copiar la salida a `worker-e-commerce-lab/public/e-commerce-lab/index.html`.
3. `cd worker-e-commerce-lab && wrangler versions upload --tag vX.Y.Z`.
4. Con OK explícito: `wrangler versions deploy <id>@100% --yes` y verificar con curl **el contenido servido**.

## Qué trae la v2.10.x
Lienzo fijo y centrado con 5 vistas (móvil, tablet, web) · posición libre de «Servicio técnico» · envíos configurables con envío gratis automático · dirección de envío del cliente (346 comunas de Chile) · barra Menú · Inicio · Carrito · reintentos de guardado en D1.

## Secretos
No hay claves en el repositorio. Los secretos (`wrangler`, `.dev.vars`) los carga solo el usuario y están en `.gitignore`.
