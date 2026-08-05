import { useRef, useState, type SubmitEvent } from 'react';
import {
  search,
  ragAnswer,
  LOW_CONFIDENCE_THRESHOLD,
  type SearchHit,
  type HealthResponse,
  type JobStatus
} from '../lib/api';
import { Button } from './ui/Button';
import { Pill } from './ui/Pill';
import { SegmentPlayButton } from './SegmentPlayButton';

interface RagChatProps {
  jobId: string;
  jobStatus: JobStatus;
  health: HealthResponse | null;
  /** Se llama antes de disparar Buscar/Preguntar para refrescar el estado de health. */
  onBeforeAction: () => void;
}

type Mode = 'search' | 'answer' | null;

// /api/rag/answer no tiene timeout server-side (confirmado en api_reference.md) —
// sin esto, un fetch colgado dejaría el botón "Preguntar" en carga para siempre.
const RAG_ANSWER_TIMEOUT_MS = 10 * 60 * 1000;

export function RagChat({ jobId, jobStatus, health, onBeforeAction }: RagChatProps) {
  const [query, setQuery] = useState('');
  const [allCorpus, setAllCorpus] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState<Mode>(null);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const qdrantDown = health?.services.Qdrant === 'error';
  const modelDown = health?.services['Ollama Model'] === 'error';
  const notCompleted = jobStatus !== 'Completed';

  const disabledReason = notCompleted
    ? 'El job todavía no terminó de procesarse.'
    : qdrantDown
      ? 'Qdrant no está disponible — no se puede buscar.'
      : modelDown
        ? 'El modelo de generación no está disponible.'
        : null;

  async function handleSearch(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabledReason || !query.trim()) return;

    onBeforeAction();
    setLoading('search');
    setError('');
    setAnswer(null);

    try {
      const scope = allCorpus ? 'all_corpus' : 'audio';
      const response = await search({ query, scope, audioId: allCorpus ? undefined : jobId });
      setHits(response.hits);
    } catch {
      setError('Falló la búsqueda.');
    } finally {
      setLoading(null);
    }
  }

  async function handleAsk() {
    if (disabledReason || !query.trim()) return;

    onBeforeAction();
    setLoading('answer');
    setError('');
    setHits(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), RAG_ANSWER_TIMEOUT_MS);

    try {
      const scope = allCorpus ? 'all_corpus' : 'audio';
      const response = await ragAnswer({
        question: query,
        scope,
        audioId: allCorpus ? undefined : jobId,
        signal: controller.signal
      });
      setAnswer(response.answer);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Cancelado.');
      } else {
        setError('Falló la generación de la respuesta.');
      }
    } finally {
      clearTimeout(timeoutId);
      abortRef.current = null;
      setLoading(null);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex flex-col gap-4">
      {health?.heavy_compute_busy && (
        <p className="text-sm text-amber-600">El servidor está ocupado, la respuesta puede tardar.</p>
      )}

      <form onSubmit={handleSearch} className="flex flex-col gap-2">
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Escribe tu pregunta o búsqueda…"
          rows={3}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={allCorpus} onChange={(event) => setAllCorpus(event.target.checked)} />
          Buscar en todo el corpus
        </label>

        {disabledReason && <p className="text-xs text-slate-400">{disabledReason}</p>}

        <div className="flex gap-2">
          <Button type="submit" variant="secondary" disabled={!!disabledReason || loading !== null}>
            {loading === 'search' ? 'Buscando…' : 'Buscar'}
          </Button>
          <Button type="button" disabled={!!disabledReason || loading !== null} onClick={handleAsk}>
            {loading === 'answer' ? 'Generando…' : 'Preguntar'}
          </Button>
          {loading === 'answer' && (
            <Button type="button" variant="danger" onClick={handleCancel}>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {answer && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-800">{answer}</p>}

      {hits && (
        <ul className="flex flex-col gap-2">
          {hits.map((hit, index) => {
            const lowConfidence = hit.avg_logprob !== null && hit.avg_logprob < LOW_CONFIDENCE_THRESHOLD;
            return (
              <li
                key={`${hit.audio_id}-${hit.chunk_id}-${index}`}
                className="flex items-start gap-3 rounded-md border border-slate-200 p-2"
              >
                <SegmentPlayButton jobId={hit.audio_id} start={hit.start} end={hit.end} />
                <div className="flex-1">
                  <p className="text-sm text-slate-800">{hit.text}</p>
                  {lowConfidence && <Pill tone="warning">Baja confianza</Pill>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
