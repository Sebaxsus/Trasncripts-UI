import { useCallback, useEffect, useState } from 'react';
import {
  getJob,
  getHealth,
  resumeJob,
  NetworkError,
  type JobDetailResponse,
  type HealthResponse
} from '../lib/api';
import { useJobEvents } from '../lib/hooks/useJobEvents';
import { isValidJobId } from '../lib/isUuid';
import { Button } from './ui/Button';
import { Pill } from './ui/Pill';
import { Skeleton } from './ui/Skeleton';
import { TranscriptView } from './TranscriptView';
import { MetricsView } from './MetricsView';
import { RagChat } from './RagChat';

interface JobDetailProps {
  jobId: string;
}

type DetailTab = 'transcript' | 'metrics';
type LoadState = 'loading' | 'ready' | 'error' | 'down';

// Único polling permitido del proyecto: acotado, solo mientras esta página
// está montada y el job está Processing.
const POLL_INTERVAL_MS = 25_000;

function isTerminal(status: string): boolean {
  return status === 'Completed' || status === 'Failed';
}

export function JobDetail({ jobId }: JobDetailProps) {
  const [job, setJob] = useState<JobDetailResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
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
      setLoadState('ready');
    } catch (err) {
      if (err instanceof NetworkError) {
        setLoadState('down');
      } else {
        setErrorMessage('No se pudo cargar el job.');
        setLoadState('error');
      }
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

  if (!job && (loadState === 'loading' || loadState === 'down')) {
    const tone = loadState === 'down' ? 'danger' : 'neutral';
    return (
      <div
        role="status"
        aria-label={loadState === 'down' ? 'No se pudo conectar con el servidor' : 'Cargando'}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Skeleton tone={tone} className="h-7 w-64" />
          <Skeleton tone={tone} className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex gap-4 border-b border-slate-200 pb-2">
          <Skeleton tone={tone} className="h-5 w-24" />
          <Skeleton tone={tone} className="h-5 w-24" />
        </div>
        <Skeleton tone={tone} className="h-40 w-full" />
        {loadState === 'down' && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-600">No se pudo conectar con el servidor.</p>
            <Button type="button" variant="secondary" onClick={refetchJob}>
              Reintentar
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (!job && loadState === 'error') {
    return <p className="text-sm text-red-600">{errorMessage}</p>;
  }

  if (!job) return null;

  async function handleResume() {
    setResuming(true);
    try {
      await resumeJob(jobId);
      await refetchJob();
    } catch {
      setErrorMessage('No se pudo reanudar el job.');
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {loadState === 'down' && (
        <div className="flex items-center justify-between rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-red-700 shadow-[0_0_18px_-4px_rgba(239,68,68,0.35)]">
          <span>Se perdió la conexión con el servidor. Los datos pueden estar desactualizados.</span>
          <Button type="button" variant="secondary" onClick={refetchJob}>
            Reintentar
          </Button>
        </div>
      )}
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
