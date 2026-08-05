// Pub-sub en memoria de un solo proceso Node (sin Redis — no se justifica
// para un solo usuario local). Anclado a globalThis para sobrevivir recargas
// de módulo por HMR de Vite en dev; en producción es un singleton normal.

export interface JobStatusEvent {
  jobId: string;
  status: 'Completed' | 'Failed';
}

type Listener = (event: JobStatusEvent) => void;

const GLOBAL_KEY = '__sttJobEventsListeners' as const;

type GlobalWithBus = typeof globalThis & {
  [GLOBAL_KEY]?: Set<Listener>;
};

function getListeners(): Set<Listener> {
  const g = globalThis as GlobalWithBus;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Set<Listener>();
  }
  return g[GLOBAL_KEY];
}

export function publish(event: JobStatusEvent): void {
  for (const listener of getListeners()) {
    listener(event);
  }
}

/** Devuelve una función para desuscribirse — llamarla siempre al cortar la conexión. */
export function subscribe(listener: Listener): () => void {
  const listeners = getListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
