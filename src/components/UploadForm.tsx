import { useState, type ChangeEvent, type SubmitEvent } from 'react';
import { uploadAudio, exceedsUploadLimit } from '../lib/api';
import { Button } from './ui/Button';

const ACCEPTED_HINT = '.mp3,.mp4,.m4a,.wav';
const MAX_TITLE_BYTES = 200;

// Validación real por bytes UTF-8, coherente con el límite del backend
// (máx. 200 bytes en POST /api/upload-audio) — más estricto que contar caracteres.
function titleByteLength(title: string): number {
  return new TextEncoder().encode(title).length;
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [notify, setNotify] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    // Fail-fast de UX — la validación real (magic bytes, límite de tamaño
    // por streaming) sigue siendo server-side.
    if (selected && exceedsUploadLimit(selected.size)) {
      setError('El archivo supera el límite de 1 GiB.');
      setFile(null);
      return;
    }
    setFile(selected);
  }

  async function handleNotifyChange(event: ChangeEvent<HTMLInputElement>) {
    const checked = event.target.checked;
    if (checked && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    setNotify(checked);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError('Selecciona un archivo de audio.');
      return;
    }
    const titleBytes = titleByteLength(title);
    if (titleBytes === 0) {
      setError('El título es obligatorio.');
      return;
    }
    if (titleBytes > MAX_TITLE_BYTES) {
      setError(`El título no puede superar ${MAX_TITLE_BYTES} bytes.`);
      return;
    }

    setSubmitting(true);
    setError('');
    setProgress(0);

    try {
      const { job_id } = await uploadAudio({ file, title, notify, onProgress: setProgress });
      window.location.href = `/audio/${job_id}`;
    } catch {
      setError('Falló la subida. Intenta de nuevo.');
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Archivo de audio
        <input
          type="file"
          accept={ACCEPTED_HINT}
          onChange={handleFileChange}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <span className="text-xs text-slate-400">Formatos: mp3, mp4/m4a, wav. Máximo 1 GiB.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Título
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          maxLength={200}
          required
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={notify} onChange={handleNotifyChange} />
        Notificarme cuando termine
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {progress !== null && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Subiendo…' : 'Subir'}
      </Button>
    </form>
  );
}
