import { useServerHealth, type ServerStatus } from '../lib/hooks/useServerHealth';
import type { ServiceHealth } from '../lib/api';

const statusStyle = {
  ok_text_style: 'text-emerald-400',
  fail_text_style: 'text-red-600',
}

const STATUS_CONFIG: Record<ServerStatus, { label: string; dot: string; text: string }> = {
  online: { label: 'En línea', dot: 'bg-green-500', text: 'text-slate-600' },
  processing: { label: 'Procesando', dot: 'bg-amber-500 animate-pulse', text: 'text-slate-600' },
  offline: { label: 'Fuera de línea', dot: 'bg-red-500', text: 'text-red-600' },
  paused: { label: 'Verificación pausada', dot: 'bg-slate-300', text: 'text-slate-400' }
};

function serviceLabel(service: ServiceHealth): {label: string, text_style: string} {
  return service === 'ok' ? {label: 'Ok',text_style: statusStyle.ok_text_style} : {label: 'Fail', text_style: statusStyle.fail_text_style};
}

interface StatusDetailsProps {
  status: ServerStatus;
  health: { heavy_compute_busy: boolean; services: Record<string, ServiceHealth> } | null;
}

function StatusDetails({ status, health }: StatusDetailsProps) {
  const generalOk = status === 'online' || status === 'processing';

  const generalStatus = generalOk ? {label: 'OK',text_style: statusStyle.ok_text_style} : {label: 'Fail',text_style: statusStyle.fail_text_style}

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-56 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-300 group-focus-within:opacity-100 group-focus-within:delay-300"
    >
      {health ? (
        <dl className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <dt>Servidor</dt>
            <dd className={`font-medium ${generalStatus.text_style}`}>{generalStatus.label}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt>Cómputo pesado</dt>
            <dd className={`font-medium ${health.heavy_compute_busy ? 'text-amber-500' : 'text-emerald-400'}`}>{health.heavy_compute_busy ? 'Ocupado' : 'Libre'}</dd>
          </div>
          {Object.entries(health.services).map(([name, value]) => {
            const STATUS_DETAILS_CONFIG = serviceLabel(value) 
              return (
                <div key={name} className="flex items-center justify-between gap-2">
                  <dt>{name}</dt>
                  <dd className={`font-medium ${STATUS_DETAILS_CONFIG.text_style}`}>{STATUS_DETAILS_CONFIG.label}</dd>
                </div>
              )
            }
          )}
        </dl>
      ) : (
        <p>Sin datos del servidor todavía.</p>
      )}
    </div>
  );
}

export function ServerStatusPill() {
  const { status, health, resume } = useServerHealth();
  const config = STATUS_CONFIG[status];

  if (status === 'paused') {
    return (
      <button
        type="button"
        onClick={resume}
        title="Reanudar verificación del servidor"
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${config.text} transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500`}
      >
        <span className={`h-2 w-2 rounded-full ${config.dot}`} />
        {config.label}
      </button>
    );
  }

  return (
    <span
      tabIndex={0}
      className={`group relative inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${config.text} transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500`}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
      <StatusDetails status={status} health={health} />
    </span>
  );
}
