import { useCallback, useEffect, useRef, useState } from 'react';
import { useToastListener, type Toast } from '../lib/hooks/useToasts';

const AUTO_DISMISS_MS = 6000;

const TONE_CLASSES: Record<Toast['tone'], string> = {
  danger: 'border-danger-200 bg-danger-50 text-red-700 shadow-[0_0_18px_-4px_rgba(239,68,68,0.35)]',
  success: 'border-green-200 bg-green-50 text-green-700',
  info: 'border-brand-100 bg-brand-50 text-brand-700'
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const handleToast = useCallback(
    (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
      timers.current.set(
        toast.id,
        setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS)
      );
    },
    [dismiss]
  );

  useToastListener(handleToast);

  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      timersMap.forEach((timer) => clearTimeout(timer));
      timersMap.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm shadow-sm ${TONE_CLASSES[toast.tone]}`}
        >
          <span className="flex-1">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.onClick();
                dismiss(toast.id);
              }}
              className="shrink-0 font-medium underline hover:no-underline"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Cerrar"
            className="shrink-0 text-lg leading-none opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
