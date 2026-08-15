import type { APIRoute } from 'astro';

export const prerender = false;

// Solo host/IP + puerto opcional, sin esquema ni path — evita que X-Backend-Host
// se use como vector de SSRF hacia una URL arbitraria.
const HOST_PATTERN = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/;
const STRIPPED_RESPONSE_HEADERS = ['content-encoding', 'content-length', 'transfer-encoding'];
const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

type FetchInitWithDuplex = RequestInit & { duplex?: 'half' };

function defaultBackendHost(): string {
  const envUrl = import.meta.env.PUBLIC_API_BASE_URL;
  try {
    return envUrl ? new URL(envUrl).host : 'localhost:3000';
  } catch {
    return 'localhost:3000';
  }
}

function resolveTargetHost(request: Request): string {
  const header = request.headers.get('x-backend-host');
  return header && HOST_PATTERN.test(header) ? header : defaultBackendHost();
}

// Único proxy server-side del proyecto: reenvía al backend Rust real, que sigue
// SIEMPRE en localhost (nunca se expone a la LAN, decisión de seguridad tomada
// aparte). Así un dispositivo externo, alcanzando el Astro dev server vía
// `pnpm dev:host`, le habla al backend sin que este necesite bindear a 0.0.0.0.
// Dev-only a propósito: dejar esto abierto en build/producción sería SSRF de libro.
export const ALL: APIRoute = async ({ request, params, url }) => {
  if (!import.meta.env.DEV) {
    return new Response('Not found', { status: 404 });
  }

  const targetHost = resolveTargetHost(request);
  const targetUrl = `http://${targetHost}/${params.path ?? ''}${url.search}`;

  const outHeaders = new Headers(request.headers);
  outHeaders.delete('host');
  outHeaders.delete('x-backend-host');

  const hasBody = !BODYLESS_METHODS.has(request.method);
  const init: FetchInitWithDuplex = {
    method: request.method,
    headers: outHeaders,
    body: hasBody ? request.body : undefined,
    // Obligatorio en fetch/undici al pasar un ReadableStream como body — necesario
    // para no bufferear en memoria uploads de hasta 1 GiB (ver uploadAudio en api.ts).
    duplex: hasBody ? 'half' : undefined
  };

  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, init);
  } catch {
    return new Response(`No se pudo conectar con el backend en ${targetHost}`, { status: 502 });
  }

  // fetch() ya decodifica el body — reenviar estos headers tal cual rompería
  // la respuesta en el cliente (ej. content-encoding: gzip sobre body sin comprimir).
  const inHeaders = new Headers(backendResponse.headers);
  for (const header of STRIPPED_RESPONSE_HEADERS) inHeaders.delete(header);

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: inHeaders
  });
};
