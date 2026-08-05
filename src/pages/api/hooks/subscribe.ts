import type { APIRoute } from 'astro';
import { subscribe, type JobStatusEvent } from '../../../lib/server/jobEventsBus';

export const prerender = false;

// No solo buenas prácticas genéricas de SSE: no está verificado que cancel()
// del ReadableStream dispare de forma confiable con @astrojs/node ante un
// corte de red abrupto (vs. un EventSource.close() limpio del browser). El
// heartbeat es la red de seguridad — ver Fase 8 para verificación manual.
const HEARTBEAT_INTERVAL_MS = 15_000;

export const GET: APIRoute = () => {
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: JobStatusEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      unsubscribe = subscribe(send);

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
};
