import { useEffect, useState } from 'react';
import { getMetrics, type MetricsEntry } from '../lib/api';

interface MetricsViewProps {
  jobId: string;
  /** El padre lo cambia (status:last_chunk) cuando conviene refetchear. */
  refreshKey: string;
}

export function MetricsView({ jobId, refreshKey }: MetricsViewProps) {
  const [entries, setEntries] = useState<MetricsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getMetrics(jobId)
      .then((response) => {
        if (!cancelled) setEntries(response.entries);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron cargar las métricas.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, refreshKey]);

  if (loading) return <p className="text-sm text-slate-500">Cargando métricas…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
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
