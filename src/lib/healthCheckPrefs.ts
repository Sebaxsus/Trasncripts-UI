// Mismo patrón que lib/auth.ts (localStorage) — preferencia del usuario para
// cortar el polling de /health por completo (ver useServerHealth), pensado
// para cuando el backend está caído a propósito (ej. testeando algo aparte)
// y no tiene sentido que el pill/toast lo interrumpa en loop.
const PAUSED_KEY = 'stt_health_check_paused';

export function isHealthCheckPaused(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(PAUSED_KEY) === '1';
}

export function setHealthCheckPaused(paused: boolean): void {
  if (paused) {
    localStorage.setItem(PAUSED_KEY, '1');
  } else {
    localStorage.removeItem(PAUSED_KEY);
  }
}
