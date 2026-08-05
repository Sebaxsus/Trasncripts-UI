import { useCallback, useEffect, useState } from 'react';
import { getJob, getHealth, resumeJob, type JobDetailResponse, type HealthResponse } from '../lib/api';
import { useJobEvents } from '../lib/hooks/useJobEvents';
import { isValidJobId } from '../lib/isUuid';
import { Button } from './ui/Button';
import { Pill } from './ui/Pill';
import { TranscriptView } from './TranscriptView';
import { MetricsView } from './MetricsView';
import { RagChat } from './RagChat';

interface JobDetailProps {
  jobId: string;
}

type DetailTab = 'transcript' | 'metrics';

// Único polling permitido del proyecto: acotado, solo mientras esta página
// está montada y el job está Processing.
const POLL_INTERVAL_MS = 25_000;

function isTerminal(status: string): boolean {
  return status === 'Completed' || status === 'Failed';
}

export function JobDetail({ jobId }: JobDetailProps) {
  const [job, setJob] = useState<JobDetailResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState('');
  const [resuming, setResuming] = useState(false);
  const [tab, setTab] = useState<DetailTab>('transcript');

  // Defensa en profundidad: la primera validación de job_id vive en el
  // frontmatter SSR de audio/[job_id].astro; esta es la segunda, por si el
  // componente se reutiliza en otro contexto a futuro.
  const validJobId = isValidJobId(jobId);

  const applyJobUpdate = useCallback((next: JobDetailResponse) => {
    setJob((prev) => {
      // Carrera SSE vs. polling acotado: un estado terminal ya aplicado
      // nunca se pisa con uno no-terminal que llegue después.
      if (prev && isTerminal(prev.status) && !isTerminal(next.status)) {
        return prev;
      }
      return next;
    });
  }, []);

  const refetchJob = useCallback(async () => {
    if (!validJobId) return;
    try {
      const data = await getJob(jobId);
      applyJobUpdate(data);
    } catch {
      setError('No se pudo cargar el job.');
    }
  }, [jobId, validJobId, applyJobUpdate]);

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await getHealth());
    } catch {
      // el banner/gate de RAG simplemente no se actualiza; no es bloqueante
    }
  }, []);

  useEffect(() => {
    refetchJob();
    refreshHealth();
  }, [refetchJob, refreshHealth]);

  useEffect(() => {
    if (!job || job.status !== 'Processing') return;
    const interval = setInterval(refetchJob, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [job?.status, refetchJob]);

  useJobEvents({
    onEvent: (event) => {
      if (event.jobId !== jobId) return;
      // El evento SSE solo trae jobId+status — se refetchea para tener el
      // detalle completo (resumen, last_chunk, etc.), no un objeto parcial.
      refetchJob();
    },
    onReconnect: refetchJob
  });

  if (!validJobId) {
    return <p className="text-sm text-red-600">job_id inválido.</p>;
  }

  if (error && !job) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!job) {
    return <p className="text-sm text-slate-500">Cargando…</p>;
  }

  async function handleResume() {
    setResuming(true);
    try {
      await resumeJob(jobId);
      await refetchJob();
    } catch {
      setError('No se pudo reanudar el job.');
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {job.title ?? job.original_filename ?? job.job_id}
          </h1>
          <Pill tone={job.status === 'Completed' ? 'success' : job.status === 'Failed' ? 'danger' : 'info'}>
            {job.status}
          </Pill>
        </div>
        {job.status === 'Failed' && (
          <Button onClick={handleResume} disabled={resuming}>
            {resuming ? 'Reanudando…' : 'Reanudar'}
          </Button>
        )}
      </div>

      {job.status === 'Processing' && (
        <p className="text-sm text-slate-500">
          Procesando: {job.last_chunk} chunks / {Math.round(job.processed_seconds)}s
        </p>
      )}

      {job.summary_status === 'Ready' && job.summary && (
        <div>
          <h2 className="mb-1 text-lg font-medium text-slate-900">Resumen</h2>
          <p className="text-sm text-slate-700">{job.summary}</p>
        </div>
      )}
      {job.summary_status === 'Generating' && <p className="text-sm text-slate-400">Generando resumen…</p>}

      <div>
        <div className="mb-2 flex items-center gap-4 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setTab('transcript')}
            className={`border-b-2 pb-2 text-sm font-medium ${
              tab === 'transcript' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
            }`}
          >
            Transcripción
          </button>
          <button
            type="button"
            onClick={() => setTab('metrics')}
            className={`border-b-2 pb-2 text-sm font-medium ${
              tab === 'metrics' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'
            }`}
          >
            Métricas
          </button>
        </div>
        {tab === 'transcript' ? (
          <TranscriptView jobId={jobId} refreshKey={`${job.status}:${job.last_chunk}`} />
        ) : (
          <MetricsView jobId={jobId} refreshKey={`${job.status}:${job.last_chunk}`} />
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-medium text-slate-900">Buscar / Preguntar</h2>
        <RagChat jobId={jobId} jobStatus={job.status} health={health} onBeforeAction={refreshHealth} />
      </div>
    </div>
  );
}
