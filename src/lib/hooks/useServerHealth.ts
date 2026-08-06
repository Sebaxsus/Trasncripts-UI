import { useCallback, useEffect, useRef, useState } from 'react';
import { getHealth, type HealthResponse } from '../api';
import { isHealthCheckPaused, setHealthCheckPaused } from '../healthCheckPrefs';
import { pushToast } from './useToasts';

export type ServerStatus = 'online' | 'processing' | 'offline' | 'paused';

// Segunda excepción explícita a "sin polling periódico global" (la primera es
// el polling de progreso de JobDetail) — ver CLAUDE.local.md. Cadencia adaptativa:
// 1 min mientras el servidor responde, backoff a 5 min una vez confirmado caído
// (no tiene sentido insistir cada minuto si ya se sabe que no responde).
const ONLINE_POLL_MS = 60_000;
const OFFLINE_POLL_MS = 300_000;

interface UseServerHealthResult {
  status: ServerStatus;
  health: HealthResponse | null;
  pause: () => void;
  resume: () => void;
}

export function useServerHealth(): UseServerHealthResult {
  const [paused, setPaused] = useState(isHealthCheckPaused);
  const [status, setStatus] = useState<ServerStatus>(paused ? 'paused' : 'online');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const pause = useCallback(() => {
    setHealthCheckPaused(true);
    setPaused(true);
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    setHealthCheckPaused(false);
    setPaused(false);
  }, []);

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function check() {
      try {
        const data = await getHealth();
        if (cancelled) return;
        setHealth(data);
        if (statusRef.current === 'offline') {
          pushToast('Conexión restablecida con el servidor.', 'success');
        }
        setStatus(data.heavy_compute_busy ? 'processing' : 'online');
        timeoutId = setTimeout(check, ONLINE_POLL_MS);
      } catch {
        if (cancelled) return;
        if (statusRef.current !== 'offline') {
          pushToast('El servidor no responde — verifica que el backend esté corriendo.', 'danger', {
            label: 'No verificar más',
            onClick: pause
          });
        }
        setStatus('offline');
        timeoutId = setTimeout(check, OFFLINE_POLL_MS);
      }
    }

    check();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [paused, pause]);

  return { status, health, pause, resume };
}
