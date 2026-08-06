// Único lugar del código que construye URLs hacia el backend Rust.
// Ningún componente debe hacer fetch/XHR directo al backend — todo pasa por acá.
// NUNCA llamar /mcp desde el cliente — usar solo estos wrappers /api/* y /health.
import { authHeaders } from './auth';
import { isValidJobId } from './isUuid';

const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL;

// Duplicado a propósito del umbral del backend (src/rag/mod.rs, LOW_CONFIDENCE_THOLD).
// Los resultados de /api/search no traen low_confidence pre-calculado, a diferencia
// del transcript — hay que aplicarlo acá. Si el backend cambia el valor, actualizar también acá.
export const LOW_CONFIDENCE_THRESHOLD = -0.6;

export type JobStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed';
export type SummaryStatus = 'NotStarted' | 'Generating' | 'Ready' | 'Failed';
export type SearchScope = 'audio' | 'all_corpus';
export type ServiceHealth = 'ok' | 'error';

export interface HealthResponse {
  status: string;
  heavy_compute_busy: boolean;
  services: {
    Qdrant: ServiceHealth;
    'Ollama Embeddings': ServiceHealth;
    'Ollama Model': ServiceHealth;
  };
}

export interface JobSummary {
  job_id: string;
  status: JobStatus;
  transcript_ready: boolean;
  created_at: string;
  processing_started_at: string | null;
  transcript_ready_at: string | null;
  completed_at: string | null;
  summary_status: SummaryStatus;
  summary: string | null;
  original_filename: string | null;
  duration_seconds: number | null;
  title: string | null;
}

export interface JobDetailResponse extends JobSummary {
  last_chunk: number;
  processed_seconds: number;
}

export interface TranscriptEntry {
  chunk: number;
  start: number;
  end: number;
  text: string;
  avg_logprob: number;
  low_confidence: boolean;
}

export interface TranscriptResponse {
  status: JobStatus;
  transcript_ready: boolean;
  entries: TranscriptEntry[];
}

export interface MetricsEntry {
  chunk: number;
  start: number;
  end: number;
  decode_ms: number;
  whisper_ms: number;
  persist_ms: number;
  total_ms: number;
  text_len: number;
  avg_logprob: number;
  score: number;
  no_speech_prob: number;
  entropy: number;
  segment_count: number;
}

export interface MetricsResponse {
  entries: MetricsEntry[];
}

export interface SearchHit {
  audio_id: string;
  chunk_id: number;
  start: number;
  end: number;
  text: string;
  speaker: string;
  avg_logprob: number | null;
  score: number | null;
}

export interface SearchResponse {
  hits: SearchHit[];
}

export interface RagAnswerResponse {
  answer: string;
}

export interface UploadAudioResponse {
  job_id: string;
  status: string;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Distingue "el servidor no respondió" (backend caído, DNS, CORS bloqueado)
 *  de un ApiError (respuesta HTTP recibida pero con status de error). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('No se pudo conectar con el servidor.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

function assertValidJobId(jobId: string): void {
  if (!isValidJobId(jobId)) {
    throw new Error(`job_id inválido: ${jobId}`);
  }
}

/** Único punto que llama fetch() nativo — traduce cualquier rechazo de fetch()
 *  a NetworkError, para que sea distinguible de un ApiError en los catch. */
async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    throw new NetworkError(err);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await safeFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) }
  });
  if (!response.ok) {
    throw new ApiError(`${path} → ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await safeFetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new ApiError(`/health → ${response.status}`, response.status);
  }
  return response.json();
}

/** Usado solo por LoginForm para validar un token antes de guardarlo. */
export async function checkToken(token: string): Promise<boolean> {
  const response = await safeFetch(`${API_BASE_URL}/api/jobs`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 401) return false;
  if (!response.ok) {
    throw new ApiError(`/api/jobs → ${response.status}`, response.status);
  }
  return true;
}

export function getJobs(): Promise<JobSummary[]> {
  return request<JobSummary[]>('/api/jobs');
}

export function getJob(jobId: string): Promise<JobDetailResponse> {
  assertValidJobId(jobId);
  return request<JobDetailResponse>(`/api/jobs/${jobId}`);
}

export function getTranscript(jobId: string): Promise<TranscriptResponse> {
  assertValidJobId(jobId);
  return request<TranscriptResponse>(`/api/jobs/${jobId}/transcript`);
}

export function getMetrics(jobId: string): Promise<MetricsResponse> {
  assertValidJobId(jobId);
  return request<MetricsResponse>(`/api/jobs/${jobId}/metrics`);
}

function validateSegmentRange(start: number, end: number): void {
  if (!(start >= 0 && end > start && end - start <= 120)) {
    throw new Error(`Rango de segmento inválido: start=${start} end=${end}`);
  }
}

/** Descarga un segmento de audio autenticado y lo devuelve como blob reproducible. */
export async function fetchAudioSegmentBlob(jobId: string, start: number, end: number): Promise<Blob> {
  assertValidJobId(jobId);
  validateSegmentRange(start, end);
  const response = await safeFetch(
    `${API_BASE_URL}/api/jobs/${jobId}/audio-segment?start=${start}&end=${end}`,
    { headers: authHeaders() }
  );
  if (!response.ok) {
    throw new ApiError(`/api/jobs/${jobId}/audio-segment → ${response.status}`, response.status);
  }
  return response.blob();
}

export function resumeJob(jobId: string, callbackUrl?: string): Promise<UploadAudioResponse> {
  assertValidJobId(jobId);
  return request<UploadAudioResponse>(`/api/jobs/${jobId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: callbackUrl ? JSON.stringify({ callback_url: callbackUrl }) : undefined
  });
}

interface SearchParams {
  query: string;
  scope: SearchScope;
  audioId?: string;
}

export function search({ query, scope, audioId }: SearchParams): Promise<SearchResponse> {
  const body = scope === 'audio' ? { query, scope, audio_id: audioId } : { query, scope };
  return request<SearchResponse>('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

interface RagAnswerParams {
  question: string;
  scope: SearchScope;
  audioId?: string;
  signal?: AbortSignal;
}

export function ragAnswer({ question, scope, audioId, signal }: RagAnswerParams): Promise<RagAnswerResponse> {
  const body = scope === 'audio' ? { question, scope, audio_id: audioId } : { question, scope };
  return request<RagAnswerResponse>('/api/rag/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
}

const MAX_UPLOAD_BYTES = 1 * 1024 ** 3; // 1 GiB — mismo límite que el backend, para fail-fast client-side.

export function exceedsUploadLimit(fileSizeBytes: number): boolean {
  return fileSizeBytes > MAX_UPLOAD_BYTES;
}

interface UploadAudioParams {
  file: File;
  title: string;
  notify: boolean;
  onProgress?: (percent: number) => void;
}

/**
 * XMLHttpRequest (no fetch) por la barra de progreso real en audios grandes.
 * callback_url siempre se arma acá, fijo al propio origen — nunca es un campo
 * editable por el usuario, para no introducir un vector de SSRF vía el cliente.
 */
export function uploadAudio({ file, title, notify, onProgress }: UploadAudioParams): Promise<UploadAudioResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    if (notify) {
      formData.append('callback_url', `${window.location.origin}/api/hooks/job-status`);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/upload-audio`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 202) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new ApiError(`/api/upload-audio → ${xhr.status}`, xhr.status));
      }
    };

    xhr.onerror = () => reject(new Error('Error de red subiendo el audio'));

    xhr.send(formData);
  });
}
