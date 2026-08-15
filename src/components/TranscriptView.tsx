import { useCallback, useEffect, useState } from 'react';
import { getTranscript, NetworkError, type TranscriptEntry } from '../lib/api';
import { downloadTextFile } from '../lib/download';
import { Button } from './ui/Button';
import { Pill } from './ui/Pill';
import { Skeleton } from './ui/Skeleton';
import { SegmentPlayButton } from './SegmentPlayButton';

interface TranscriptViewProps {
  jobId: string;
  /** El padre lo cambia (status:last_chunk) cuando conviene refetchear. */
  refreshKey: string;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function toTxt(entries: TranscriptEntry[]): string {
  return entries.map((e) => `[${formatTimestamp(e.start)} - ${formatTimestamp(e.end)}] ${e.text}`).join('\n\n');
}

function toJsonl(entries: TranscriptEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join('\n');
}

type LoadState = 'loading' | 'ready' | 'error' | 'down';

export function TranscriptView({ jobId, refreshKey }: TranscriptViewProps) {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(() => {
    let cancelled = false;
    setState('loading');
    getTranscript(jobId)
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
          setErrorMessage('No se pudo cargar la transcripción.');
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
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3 p-2">
            <Skeleton tone={tone} className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton tone={tone} className="h-4 w-full" />
              <Skeleton tone={tone} className="h-4 w-2/3" />
            </div>
          </div>
        ))}
        {state === 'down' && (
          <div className="flex items-center justify-between">
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
    return <p className="text-sm text-slate-500">Todavía no hay transcripción.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => downloadTextFile(`transcript-${jobId}.txt`, toTxt(entries))}
        >
          Descargar .txt
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => downloadTextFile(`transcript-${jobId}.jsonl`, toJsonl(entries), 'application/jsonl')}
        >
          Descargar .jsonl
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li
            key={entry.chunk}
            className={`flex items-start gap-3 rounded-md p-2 ${entry.low_confidence ? 'bg-amber-50' : ''}`}
          >
            <SegmentPlayButton jobId={jobId} start={entry.start} end={entry.end} />
            <div className="flex-1">
              <p className="text-sm text-slate-800">{entry.text}</p>
              {entry.low_confidence && <Pill tone="warning">Baja confianza</Pill>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
