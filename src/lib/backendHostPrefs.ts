// Mismo patrón que lib/auth.ts / lib/healthCheckPrefs.ts (localStorage) — override
// opcional del host:puerto del backend Rust, usado por src/pages/api/backend-proxy/
// [...path].ts para testear desde otro dispositivo de la LAN. Vacío/null = default
// (derivado de PUBLIC_API_BASE_URL, ver ese archivo).
const HOST_KEY = 'stt_backend_host';

export function getBackendHost(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(HOST_KEY) ?? '';
}

export function setBackendHost(host: string): void {
  const trimmed = host.trim();
  if (trimmed) {
    localStorage.setItem(HOST_KEY, trimmed);
  } else {
    localStorage.removeItem(HOST_KEY);
  }
}

/** Headers para lib/api.ts. Vacío fuera de dev: en build el proxy no existe,
 *  así que este header no tendría ningún efecto contra el backend real. */
export function backendHostHeaders(): Record<string, string> {
  if (!import.meta.env.DEV) return {};
  const host = getBackendHost();
  return host ? { 'X-Backend-Host': host } : {};
}
