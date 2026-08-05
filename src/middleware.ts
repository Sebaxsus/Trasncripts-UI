import { defineMiddleware } from 'astro/middleware';

// La CSP en sí vive en astro.config.mjs (security.csp) — Astro la inyecta
// como <meta> con hashes calculados para sus propios scripts bundleados.
// Acá solo van cabeceras que si o si necesitan ser HTTP headers.
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();

  // Nunca pisar Content-Type/Cache-Control: subscribe.ts (SSE) pone los suyos.
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
});
