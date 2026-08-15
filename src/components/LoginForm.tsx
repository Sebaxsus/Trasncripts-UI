import { useState, type ChangeEvent, type SubmitEvent } from 'react';
import { checkToken, getHealth } from '../lib/api';
import { setToken } from '../lib/auth';
import { getBackendHost, setBackendHost } from '../lib/backendHostPrefs';
import { Button } from './ui/Button';

type Status = 'idle' | 'checking' | 'error';

export function LoginForm() {
  const [token, setTokenInput] = useState('');
  const [backendHost, setBackendHostInput] = useState(() => getBackendHost());
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  function handleBackendHostChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setBackendHostInput(value);
    // Se persiste en cada cambio (no en el submit) para que el getHealth()/checkToken()
    // de handleSubmit, que se disparan enseguida, ya usen el valor recién tipeado.
    setBackendHost(value);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('checking');
    setError('');

    try {
      await getHealth();
    } catch {
      setStatus('error');
      setError('No se pudo contactar al backend. ¿Está corriendo?');
      return;
    }

    try {
      const valid = await checkToken(token);
      if (!valid) {
        setStatus('error');
        setError('Token inválido.');
        return;
      }
    } catch {
      setStatus('error');
      setError('Error validando el token contra el backend.');
      return;
    }

    setToken(token);
    window.location.href = '/dashboard';
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Token de acceso
        <input
          type="password"
          value={token}
          onChange={(event) => setTokenInput(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          autoComplete="off"
          required
        />
      </label>
      {import.meta.env.DEV && (
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Host del backend (opcional)
          <input
            type="text"
            value={backendHost}
            onChange={handleBackendHostChange}
            placeholder="localhost:3000"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            autoComplete="off"
          />
          <span className="text-xs font-normal text-slate-500">
            Solo para probar desde otro dispositivo de la red mientras corres <code>pnpm dev:host</code>.
          </span>
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={status === 'checking'}>
        {status === 'checking' ? 'Verificando…' : 'Entrar'}
      </Button>
    </form>
  );
}
