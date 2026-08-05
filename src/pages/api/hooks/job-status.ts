import type { APIRoute } from 'astro';
import { isValidJobId } from '../../../lib/isUuid';
import { publish } from '../../../lib/server/jobEventsBus';

export const prerender = false;

interface WebhookPayload {
  job_id: string;
  status: 'Completed' | 'Failed';
}

function isValidWebhookPayload(value: unknown): value is WebhookPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.job_id === 'string' &&
    isValidJobId(v.job_id) &&
    (v.status === 'Completed' || v.status === 'Failed')
  );
}

// Ruta no pública: la llama el backend Rust vía callback_url. No tiene auth propia
// (mismo criterio de riesgo aceptado que el resto del proyecto local-first), así que
// se endurece con: Content-Type estricto (defensa extra contra un <form> cross-site,
// que dispara sin preflight CORS) + validación de shape antes de republicar.
export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.split(';')[0].trim() !== 'application/json') {
    return new Response('Content-Type debe ser application/json', { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }

  if (!isValidWebhookPayload(body)) {
    return new Response('Payload no matchea el shape esperado', { status: 400 });
  }

  // Evento mínimo reconstruido desde los campos ya validados — nunca se
  // reenvía el body crudo al bus.
  publish({ jobId: body.job_id, status: body.status });

  return new Response(null, { status: 204 });
};
