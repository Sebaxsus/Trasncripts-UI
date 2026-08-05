# SpeechToTextAstro

Cliente web para un pipeline de transcripción de audio y RAG (retrieval-augmented generation) **local-first**. Permite subir audios, ver el estado de cada job en tiempo real, leer la transcripción, escuchar segmentos puntuales, y buscar/preguntar sobre un audio o sobre todo el corpus.

El backend (Rust/Axum, Whisper local + Qdrant + Ollama) es un proyecto aparte, ya terminado, que corre en `http://localhost:3000`. Este repositorio es solo el cliente — no tiene ninguna relación de submodule/git con el backend.

## Stack

- [Astro](https://astro.build) (`output: 'server'`, adapter `@astrojs/node` standalone)
- [React](https://react.dev) para los componentes interactivos (islands)
- [Tailwind CSS v4](https://tailwindcss.com) vía plugin de Vite
- TypeScript estricto
- [pnpm](https://pnpm.io) como gestor de paquetes

## Requisitos

- Node.js 22+ (LTS recomendado)
- pnpm (vía `corepack enable`)
- El backend corriendo en `http://localhost:3000` (o la URL que se configure en `PUBLIC_API_BASE_URL`)

## Setup

```bash
pnpm install
cp .env.example .env   # ajustar PUBLIC_API_BASE_URL si el backend no corre en localhost:3000
pnpm dev
```

La app queda disponible en `http://localhost:4321`.

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo (CSP desactivada — ver `docs/SECURITY.md`) |
| `pnpm build` | Build de producción a `dist/` |
| `pnpm preview` | Sirve el build de producción localmente |
| `pnpm astro check` | Type-check de archivos `.astro` y sus imports |

## Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `PUBLIC_API_BASE_URL` | URL base del backend Rust | `http://localhost:3000` |

## Documentación

- [`docs/Arquitechture.md`](docs/Arquitechture.md) — páginas, componentes, flujo de datos, diseño del webhook/SSE.
- [`docs/SECURITY.md`](docs/SECURITY.md) — modelo de amenazas, CSP, riesgos aceptados, mitigaciones.
- [`docs/TODO.md`](docs/TODO.md) — gaps conocidos y trabajo futuro.

## Login

No hay sistema de cuentas. El acceso es un token compartido (`MCP_BEARER_TOKEN` configurado en el backend) que se guarda en `localStorage` del navegador — es un gate de UX, no un mecanismo de seguridad real (la autorización real la hace el middleware del backend). Si el backend no tiene el token configurado, cualquier valor sirve para entrar.
