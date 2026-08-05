# Seguridad del cliente

Este documento cubre el modelo de amenazas, las mitigaciones implementadas y los riesgos aceptados **del lado del cliente**. La seguridad del backend (autenticación real, bind de red, límites de tamaño, etc.) es responsabilidad de ese repositorio — acá solo se documenta qué hace *este* cliente para no empeorar esa superficie, y qué asume de él.

## Contexto / modelo de amenazas

Proyecto **local-first, de un solo usuario**. El backend no tiene sistema de cuentas real, solo un bearer token compartido opcional. Ninguna de las decisiones de acá está pensada para un escenario multi-tenant o de exposición pública — si el backend alguna vez se expone más allá de `localhost`/LAN confiable, este modelo hay que revisarlo.

## Login: gate de UX, no de seguridad real

El token se guarda en `localStorage` y se manda como `Authorization: Bearer <token>` en cada request protegida. La autorización real la hace el middleware del backend — el cliente no puede hacer cumplir nada por su cuenta, y si `MCP_BEARER_TOKEN` no está seteado en el backend, cualquier valor de token "funciona" (login exitoso sin protección real). Esto es una decisión ya aceptada, no un bug.

## Content-Security-Policy (CSP)

Configurada en `astro.config.mjs` (`security.csp`), **no** a mano en `src/middleware.ts`. Motivo: Astro calcula automáticamente los hashes SHA-256 de los scripts/estilos que él mismo bundlea (incluido el bootstrap de hidratación de cualquier componente `client:*`). Una CSP `script-src 'self'` armada a mano, sin esos hashes, bloquea ese bootstrap **en silencio** — no aparece como error de red ni excepción JS visible, simplemente el componente nunca se hidrata y cualquier `<form>` dentro se comporta como HTML plano (submit nativo, recarga de página). Este bug real se encontró y corrigió durante el build inicial, verificado con Playwright contra el backend real.

Directivas propias (`connect-src`, `img-src`, `media-src`, `frame-ancestors`, `base-uri`, `form-action`) van en `security.csp.directives`, **no** en `src/middleware.ts` — si se declaran en dos policies distintas a la vez (una vía `<meta>`/header nativo de Astro, otra manual), el navegador aplica la intersección de ambas, no la unión, y algo que debería estar permitido puede quedar bloqueado igual.

- `media-src 'self' blob:` es necesaria para `SegmentPlayButton` (reproduce un `blob:` armado en el cliente) — sin ella cae al `default-src`, que no permite `blob:`.
- **La CSP nativa de Astro solo se activa en `build`/`preview`, nunca en `dev`** (limitación documentada de Astro, por cómo funciona el dev server de Vite). Esto es intencional y coincide con la decisión de no pelear con la CSP durante desarrollo — probar cambios de seguridad siempre contra `pnpm build && pnpm preview`, nunca asumir que "andá en dev" significa "la CSP está bien".

Cabeceras que sí van en `src/middleware.ts` (aplican siempre, dev y prod): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. El middleware **suma** cabeceras sin pisar `Content-Type`/`Cache-Control`, que `src/pages/api/hooks/subscribe.ts` (SSE) necesita poner con sus propios valores.

## XSS: nunca HTML crudo de contenido no confiable

`title` (input libre del usuario), el texto de la transcripción, los resultados de búsqueda y la respuesta de RAG (generada por un LLM) son todos contenido no confiable que se renderiza en el DOM. Regla dura en todo el proyecto: **nunca `dangerouslySetInnerHTML` (React) ni `set:html` (Astro)** sobre ninguno de estos campos — siempre como texto plano (`{variable}` de React, que auto-escapa). Si en algún momento se quiere renderizar la respuesta de RAG como markdown, tiene que pasar por un sanitizador (tipo `dompurify`) después de parsear, nunca inyectar el HTML del parser directo.

## Superficie de rutas del backend controlada

`src/lib/api.ts` es el único archivo que construye URLs hacia el backend Rust. Reglas que se mantienen ahí:

- Ningún componente hace `fetch`/`XMLHttpRequest` directo al backend fuera de `api.ts`.
- `/mcp` no aparece en ningún lado del código del cliente — el cliente solo usa los wrappers REST (`/api/*`), documentados con un comentario explícito al inicio de `api.ts` recordándolo.
- Ninguna función acepta un string libre para construir un *path* — `job_id` se valida como UUID (`isValidJobId`) antes de interpolarse en cualquier URL; `start`/`end` de segmentos se validan contra los límites del backend (`start >= 0`, `end > start`, `end - start <= 120`) antes de construir la URL.
- `callback_url` del upload **no es un parámetro que un componente pueda pasar** — `uploadAudio` lo arma internamente como `${window.location.origin}/api/hooks/job-status`, fijo. Esto hace estructuralmente imposible que un formulario exponga un campo editable por el usuario para esa URL (vector potencial de SSRF del lado del backend si se le pudiera pasar cualquier URL).

## Validación de `job_id` en dos capas

1. **SSR** (`src/pages/audio/[job_id].astro`): valida el param de la URL como UUID en el frontmatter, antes de montar `JobDetail`. Si no matchea, `Astro.redirect('/dashboard')`.
2. **Componente** (`JobDetail`): segunda validación, defensa en profundidad por si el componente se reutiliza en otro contexto a futuro.

## Pre-validación de upload (fail-fast, no autoritativa)

`UploadForm` chequea tamaño (> 1 GiB) y extensión como hint antes de iniciar el XHR. Esto es puramente UX — la validación real (magic bytes, límite de tamaño por streaming) la sigue haciendo el backend, y el cliente nunca debe asumir que su chequeo es suficiente.

## Webhook entrante endurecido (`POST /api/hooks/job-status`)

Esta ruta no tiene autenticación propia (la llama el backend Rust) — cualquier proceso local o request de un tab con JS podría intentar spoofear un evento de "job completado". Mitigaciones:

- Exige `Content-Type: application/json` exacto (`415` si no matchea) — defensa extra contra un `<form>` cross-site, que dispara sin preflight CORS con `application/x-www-form-urlencoded`.
- Valida el body contra un shape estricto (`job_id` UUID válido, `status` en `"Completed" | "Failed"`) antes de republicar — descarta silenciosamente cualquier payload que no matchee.
- Reconstruye un evento mínimo tipado desde los campos ya validados — **nunca reenvía el body crudo** al bus de SSE.

## Limpieza de recursos

- `EventSource.close()` al desmontar en `useJobEvents`.
- Desuscripción de subscribers en el bus SSE del servidor cuando la conexión se corta (`cancel()` del `ReadableStream`), con un heartbeat cada 15s como red de seguridad ante el caso (no verificado 100%) de que `cancel()` no dispare en un corte de red abrupto con `@astrojs/node`.
- `URL.revokeObjectURL` en `SegmentPlayButton` al desmontar o al reproducir un segmento distinto — evita acumular blobs en memoria en sesiones largas.

## Riesgos aceptados (no mitigados, documentados a propósito)

- **Token en `localStorage`**: visible en devtools, sobrevive a recargas, no hay rotación ni expiración. Aceptado porque el propio backend ya trata este token como "gate de UX, no seguridad real" — cambiarlo a un modelo más fuerte (sesiones de servidor, cookies httpOnly) requeriría rediseñar la autenticación en el backend, fuera del alcance de este cliente.
- **Sin CSRF token dedicado en el webhook**: la mitigación es Content-Type + validación de shape (ver arriba), no un secreto compartido. Para un proyecto local-first de un solo usuario es un riesgo aceptado; si el escenario cambia (multi-usuario, expuesto en red no confiable), esto debería reforzarse con un secreto por sesión en `callback_url` (ej. un token de un solo uso generado al subir el audio, verificado al recibir el webhook).
- **`POST /api/rag/answer` sin timeout server-side**: mitigado solo del lado del cliente con `AbortController` (10 min) y botón "Cancelar" — el request real al backend sigue corriendo hasta que termine o el proceso lo mate; el cliente simplemente deja de esperarlo.
