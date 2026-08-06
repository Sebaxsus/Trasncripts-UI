import { useEffect } from 'react';

// Pub-sub mínimo en memoria del módulo, mismo espíritu que el bus de eventos
// server-side (lib/server/jobEventsBus.ts) pero client-side — evita prop-drilling
// desde componentes sueltos (ej. useServerHealth) hasta el ToastContainer,
// montado una sola vez en AuthenticatedLayout.
export type ToastTone = 'danger' | 'success' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

type Listener = (toast: Toast) => void;
const listeners = new Set<Listener>();

export function pushToast(message: string, tone: ToastTone = 'info', action?: ToastAction): void {
  const toast: Toast = { id: crypto.randomUUID(), message, tone, action };
  listeners.forEach((listener) => listener(toast));
}

export function useToastListener(onToast: Listener): void {
  useEffect(() => {
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, [onToast]);
}
