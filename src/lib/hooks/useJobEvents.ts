import { useEffect, useRef } from 'react';

export interface JobStatusEvent {
  jobId: string;
  status: 'Completed' | 'Failed';
}

interface UseJobEventsOptions {
  /** Se dispara con cada evento de job recibido por SSE. */
  onEvent: (event: JobStatusEvent) => void;
  /** Refetch puntual sugerido: al reconectar tras un corte, o al recuperar foco la pestaña. */
  onReconnect?: () => void;
}

/** Se suscribe a /api/hooks/subscribe (SSE) durante todo el ciclo de vida del componente. */
export function useJobEvents({ onEvent, onReconnect }: UseJobEventsOptions): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    const source = new EventSource('/api/hooks/subscribe');
    let hasConnectedBefore = false;

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as JobStatusEvent;
        onEventRef.current(event);
      } catch {
        // payload inesperado del servidor propio — se descarta, no debería pasar
      }
    };

    source.onopen = () => {
      if (hasConnectedBefore) {
        onReconnectRef.current?.();
      }
      hasConnectedBefore = true;
    };

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        onReconnectRef.current?.();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      source.close();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
}
