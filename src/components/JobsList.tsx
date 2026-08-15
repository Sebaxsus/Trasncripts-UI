import { useEffect, useState } from 'react';
import { getJobs, NetworkError, type JobSummary } from '../lib/api';
import { useJobEvents } from '../lib/hooks/useJobEvents';
import { Card } from './ui/Card';
import { Pill } from './ui/Pill';
import { Skeleton } from './ui/Skeleton';
import { Button } from './ui/Button';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_TONE: Record<JobSummary['status'], Tone> = {
  Pending: 'neutral',
  Processing: 'info',
  Completed: 'success',
  Failed: 'danger'
};

function formatDate(epochSeconds: string): string {
  return new Date(Number(epochSeconds) * 1000).toLocaleString();
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

type LoadState = 'loading' | 'ready' | 'error' | 'down';

export function JobsList() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  async function refetch() {
    try {
      const data = await getJobs();
      setJobs(data);
      setState('ready');
    } catch (err) {
      if (err instanceof NetworkError) {
        setState('down');
      } else {
        setErrorMessage('No se pudieron cargar los audios.');
        setState('error');
      }
    }
  }

  useEffect(() => {
    refetch();
  }, []);

  useJobEvents({
    onEvent: (event) => {
      setJobs((prev) =>
        prev.map((job) => (job.job_id === event.jobId ? { ...job, status: event.status } : job))
      );
    },
    onReconnect: refetch
  });

  if (state === 'loading' || state === 'down') {
    const tone = state === 'down' ? 'danger' : 'neutral';
    return (
      <div
        role="status"
        aria-label={state === 'down' ? 'No se pudo conectar con el servidor' : 'Cargando'}
        className="flex flex-col gap-3"
      >
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex items-center justify-between">
            <div className="flex flex-col gap-2">
              <Skeleton tone={tone} className="h-4 w-48" />
              <Skeleton tone={tone} className="h-3 w-24" />
            </div>
            <Skeleton tone={tone} className="h-5 w-16 rounded-full" />
          </Card>
        ))}
        {state === 'down' && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-600">No se pudo conectar con el servidor.</p>
            <Button type="button" variant="secondary" onClick={refetch}>
              Reintentar
            </Button>
          </div>
        )}
      </div>
    );
  }
  if (state === 'error') return <p className="text-sm text-red-600">{errorMessage}</p>;
  if (jobs.length === 0) {
    return <p className="text-sm text-slate-500">Todavía no subiste ningún audio.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {jobs.map((job) => (
        <li key={job.job_id}>
          <a href={`/audio/${job.job_id}`}>
            <Card className="flex items-center justify-between hover:border-brand-300">
              <div>
                <p className="font-medium text-slate-900">
                  {job.title ?? job.original_filename ?? job.job_id}
                </p>
                <p className="text-xs text-slate-500">{formatDate(job.created_at)}</p>
                {job.summary_status === 'Ready' && job.summary && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{job.summary}</p>
                )}
                {job.summary_status === 'Generating' && (
                  <p className="mt-1 text-sm text-slate-400">Generando resumen…</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Pill tone={STATUS_TONE[job.status]}>{job.status}</Pill>
                <span className="text-xs text-slate-500">{formatDuration(job.duration_seconds)}</span>
              </div>
            </Card>
          </a>
        </li>
      ))}
    </ul>
  );
}
