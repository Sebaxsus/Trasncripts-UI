import { useServerHealth, type ServerStatus } from '../lib/hooks/useServerHealth';

const STATUS_CONFIG: Record<ServerStatus, { label: string; dot: string; text: string }> = {
  online: { label: 'En línea', dot: 'bg-green-500', text: 'text-slate-600' },
  processing: { label: 'Procesando', dot: 'bg-amber-500 animate-pulse', text: 'text-slate-600' },
  offline: { label: 'Fuera de línea', dot: 'bg-red-500', text: 'text-red-600' },
  paused: { label: 'Verificación pausada', dot: 'bg-slate-300', text: 'text-slate-400' }
};

export function ServerStatusPill() {
  const { status, resume } = useServerHealth();
  const config = STATUS_CONFIG[status];

  if (status === 'paused') {
    return (
      <button
        type="button"
        onClick={resume}
        title="Reanudar verificación del servidor"
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.text} hover:text-slate-600`}
      >
        <span className={`h-2 w-2 rounded-full ${config.dot}`} />
        {config.label}
      </button>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.text}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
