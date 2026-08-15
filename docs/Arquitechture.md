# Arquitectura del cliente

Este documento describe cómo está armado el cliente web hoy. Para el "por qué" de las decisiones de seguridad específicas, ver [`SECURITY.md`](SECURITY.md). Para el contrato HTTP real del backend, la fuente de verdad es `api_reference.md` del repo del backend (`SpechToTextRust`), no este archivo — acá solo se documenta cómo el cliente lo consume.

## Decisiones de arquitectura

- **Astro** (`output: 'server'`) + **React** para las islands interactivas (`@astrojs/react`) + **Tailwind CSS v4** vía plugin de Vite (`@tailwindcss/vite`, sin `tailwind.config.js`, tema en `src/styles/global.css` vía `@theme`).
- **Adapter `@astrojs/node` en modo `standalone`** — no puede ser un sitio estático porque el webhook (`src/pages/api/hooks/`) necesita un endpoint servidor propio.
- **Login = gate de token compartido**, sin sistema de cuentas real (ver `SECURITY.md`).
- **Sin polling periódico global** — webhook + SSE para tiempo real, con una única excepción acotada (progreso de un job `Processing`).
- **Repositorio separado del backend**, sin submodule/git — el único acoplamiento es el contrato HTTP, sincronizado a mano.

## Estructura de carpetas

```
src/
├── pages/
│   ├── index.astro              # landing estática
│   ├── login.astro               # LoginForm
│   ├── dashboard.astro           # JobsList
│   ├── upload.astro              # UploadForm
│   ├── audio/[job_id].astro      # JobDetail — valida job_id (UUID) en SSR
│   └── api/
│       ├── hooks/
│       │   ├── job-status.ts     # POST — recibe el webhook del backend
│       │   └── subscribe.ts      # GET (SSE) — reenvía al browser
│       └── backend-proxy/
│           └── [...path].ts      # proxy dev-only al backend real (testing LAN, ver SECURITY.md)
├── layouts/
│   ├── BaseLayout.astro          # shell HTML común
│   └── AuthenticatedLayout.astro # guard de auth + nav + logout
├── components/
│   ├── ui/                       # Button, Pill, Card
│   ├── LoginForm.tsx
│   ├── JobsList.tsx
│   ├── UploadForm.tsx
│   ├── JobDetail.tsx
│   ├── TranscriptView.tsx        # incluye descarga .txt/.jsonl
│   ├── MetricsView.tsx           # tab de métricas por chunk
│   ├── RagChat.tsx               # Buscar / Preguntar
│   ├── SegmentPlayButton.tsx
│   └── VideoTutorial.astro
├── lib/
│   ├── api.ts                    # único punto de contacto con el backend
│   ├── auth.ts                   # token en localStorage
│   ├── backendHostPrefs.ts       # override dev-only del host del backend (localStorage)
│   ├── isUuid.ts
│   ├── download.ts                # utilidad de descarga client-side
│   ├── hooks/useJobEvents.ts      # cliente SSE (EventSource)
│   └── server/jobEventsBus.ts     # pub-sub en memoria (servidor)
└── middleware.ts                  # cabeceras de seguridad HTTP
```

## Flujo de datos

### Autenticación

`LoginForm` hace `GET /health` (confirma que el backend está vivo) y después `GET /api/jobs` con el token ingresado (confirma que es válido) antes de guardarlo en `localStorage`. `AuthenticatedLayout` es un guard síncrono: `main` arranca oculto por CSS y solo se revela si `hasToken()` es true; si no, redirige a `/login`. Se usa este patrón (en vez de un script inline bloqueante) porque la CSP de producción no permite scripts inline — ver `SECURITY.md`.

### Dashboard y tiempo real

`JobsList` hace `GET /api/jobs` una vez al montar y se suscribe al mismo `EventSource` (`useJobEvents`) que `JobDetail`. Cuando llega un evento de `job-status`, actualiza solo el job afectado en el estado local — no hay refetch completo salvo al reconectar tras un corte (`onReconnect`) o al recuperar foco la pestaña (`visibilitychange`, manejado dentro del propio hook).

### Webhook + SSE

1. El backend Rust hace `POST /api/hooks/job-status` (ruta propia de Astro, no pública) cuando un job llega a `Completed`/`Failed`.
2. Esa ruta valida el payload estrictamente (`Content-Type`, shape) y lo publica a un pub-sub en memoria (`src/lib/server/jobEventsBus.ts`), anclado a `globalThis` para sobrevivir recargas de módulo por HMR en dev.
3. `GET /api/hooks/subscribe` es un endpoint SSE que reenvía cada evento a los tabs abiertos, con un heartbeat cada 15s.
4. `useJobEvents` (cliente) abre el `EventSource`, actualiza estado local, y se desuscribe (`.close()`) al desmontar.

Precondición operativa: el backend Rust y el servidor Node de Astro tienen que correr juntos localmente para que el webhook llegue.

### Proxy dev-only al backend (testing desde la LAN)

`pnpm dev:host` bindea el dev server de Astro a `0.0.0.0`, alcanzable desde otro dispositivo de la red — pero `PUBLIC_API_BASE_URL` (típicamente `http://localhost:3000`) se inlinea en el bundle del navegador, así que desde otro dispositivo `localhost:3000` resuelve a ese mismo dispositivo, no a la máquina host. En vez de bindear el backend Rust a `0.0.0.0` (descartado por seguridad, ver `SECURITY.md`), `src/pages/api/backend-proxy/[...path].ts` reenvía server-side hacia el backend real (siempre en `localhost`, nunca expuesto a la LAN). `lib/api.ts` resuelve la base URL con `resolveApiBaseUrl()`: en dev, todo pasa por `/api/backend-proxy` (same-origin); fuera de dev, sin cambios, pega directo a `PUBLIC_API_BASE_URL`. El host destino es configurable desde un campo opcional en `LoginForm` (persistido en `localStorage` vía `lib/backendHostPrefs.ts`, header `X-Backend-Host`), útil si el backend no corre en la misma máquina que `pnpm dev`; sin configurar nada, usa `localhost:3000` por defecto. Detalle de las mitigaciones de seguridad en `SECURITY.md`.

### Detalle de un job

`audio/[job_id].astro` valida `job_id` como UUID en el frontmatter (SSR) antes de montar nada — si no matchea, redirige a `/dashboard`. `JobDetail` hace una segunda validación (defensa en profundidad) y orquesta:

- **Polling acotado** (~25s) solo mientras el job está `Processing` y el componente está montado — única excepción a "sin polling global".
- **Reconciliación SSE-vs-polling**: un estado terminal (`Completed`/`Failed`) ya aplicado nunca se pisa con uno no-terminal que llegue después por una carrera entre ambos mecanismos.
- **`TranscriptView`**: transcripción con resaltado de `low_confidence` (ya calculado server-side), reproducción de segmentos, y descarga `.txt`/`.jsonl` 100% client-side.
- **`MetricsView`**: tabla de métricas por chunk (`GET /api/jobs/{job_id}/metrics`) — tiempos y señales de calidad de Whisper, uso de debug.
- **`RagChat`**: Buscar (retrieval puro) y Preguntar (retrieval + generación), con toggle explícito de scope (`audio` default / `all_corpus`), gates por `status !== 'Completed'` y por `services.Qdrant`/`services['Ollama Model']` en error, y `AbortController` con timeout + botón cancelar (el endpoint de generación no tiene timeout server-side).

### Reproducción de segmentos

`SegmentPlayButton` no puede usar `<audio src>` directo porque el endpoint requiere header `Authorization`. En su lugar: `fetch` con el header → blob → `URL.createObjectURL` → `<audio>` programático. El object URL se libera (`revokeObjectURL`) al desmontar o al reproducir un segmento distinto.

## `lib/api.ts`

Es el único archivo que construye URLs hacia el backend Rust — ningún componente hace `fetch`/`XMLHttpRequest` directo al backend fuera de acá. Contiene todos los DTOs tipados, la constante `LOW_CONFIDENCE_THRESHOLD` (duplicada a propósito del backend, con comentario apuntando a la fuente real), y `uploadAudio` (implementado con `XMLHttpRequest`, no `fetch`, para tener progreso real de subida). `/mcp` no aparece en ningún lado del cliente — el cliente solo usa los wrappers REST (`/api/*`).

## Subdirectorios con CLAUDE.md

Si el proyecto crece con módulos claramente separados (por ejemplo, si se agrega una sección de administración o un segundo tipo de cliente), se puede agregar un `CLAUDE.md` dentro de esa subcarpeta con instrucciones específicas — Claude Code los carga automáticamente al trabajar ahí. Hoy el proyecto es chico y no hace falta.
