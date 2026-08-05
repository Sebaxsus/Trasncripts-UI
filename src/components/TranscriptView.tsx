import { useEffect, useState } from 'react';
import { getTranscript, type TranscriptEntry } from '../lib/api';
import { downloadTextFile } from '../lib/download';
import { Button } from './ui/Button';
import { Pill } from './ui/Pill';
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

export function TranscriptView({ jobId, refreshKey }: TranscriptViewProps) {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getTranscript(jobId)
      .then((response) => {
        if (!cancelled) setEntries(response.entries);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar la transcripción.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, refreshKey]);

  if (loading) return <p className="text-sm text-slate-500">Cargando transcripción…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
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
