import { useCallback, useEffect, useState } from 'react';
import { getMetrics, NetworkError, type MetricsEntry } from '../lib/api';
import { Skeleton } from './ui/Skeleton';
import { Button } from './ui/Button';

interface MetricsViewProps {
  jobId: string;
  /** El padre lo cambia (status:last_chunk) cuando conviene refetchear. */
  refreshKey: string;
}

type LoadState = 'loading' | 'ready' | 'error' | 'down';

const SKELETON_COLUMNS = 7;

export function MetricsView({ jobId, refreshKey }: MetricsViewProps) {
  const [entries, setEntries] = useState<MetricsEntry[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    let cancelled = false;
    setState('loading');
    getMetrics(jobId)
      .then((response) => {
        if (cancelled) return;
        setEntries(response.entries);
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof NetworkError) {
          setState('down');
        } else {
          setErrorMessage('No se pudieron cargar las métricas.');
          setState('error');
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, refreshKey]);

  useEffect(() => load(), [load]);

  if (state === 'loading' || state === 'down') {
    const tone = state === 'down' ? 'danger' : 'neutral';
    return (
      <div
        role="status"
        aria-label={state === 'down' ? 'No se pudo conectar con el servidor' : 'Cargando'}
        className="flex flex-col gap-2"
      >
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex gap-3 border-b border-slate-100 py-1">
            {Array.from({ length: SKELETON_COLUMNS }).map((_, col) => (
              <Skeleton key={col} tone={tone} className="h-4 w-16" />
            ))}
          </div>
        ))}
        {state === 'down' && (
          <div className="mt-1 flex items-center justify-between">
            <p className="text-sm text-red-600">No se pudo conectar con el servidor.</p>
            <Button type="button" variant="secondary" onClick={load}>
              Reintentar
            </Button>
          </div>
        )}
      </div>
    );
  }
  if (state === 'error') return <p className="text-sm text-red-600">{errorMessage}</p>;
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">Todavía no hay métricas.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <th className="py-1 pr-3">Chunk</th>
            <th className="py-1 pr-3">Rango</th>
            <th className="py-1 pr-3">Whisper (ms)</th>
            <th className="py-1 pr-3">Total (ms)</th>
            <th className="py-1 pr-3">Score</th>
            <th className="py-1 pr-3">Entropía</th>
            <th className="py-1 pr-3">No-speech</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.chunk} className="border-b border-slate-100">
              <td className="py-1 pr-3">{entry.chunk}</td>
              <td className="py-1 pr-3">
                {entry.start.toFixed(0)}s–{entry.end.toFixed(0)}s
              </td>
              <td className="py-1 pr-3">{entry.whisper_ms}</td>
              <td className="py-1 pr-3">{entry.total_ms}</td>
              <td className="py-1 pr-3">{entry.score.toFixed(2)}</td>
              <td className="py-1 pr-3">{entry.entropy.toFixed(2)}</td>
              <td className="py-1 pr-3">{entry.no_speech_prob.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
