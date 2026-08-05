import { useState, type SubmitEvent } from 'react';
import { checkToken, getHealth } from '../lib/api';
import { setToken } from '../lib/auth';
import { Button } from './ui/Button';

type Status = 'idle' | 'checking' | 'error';

export function LoginForm() {
  const [token, setTokenInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={status === 'checking'}>
        {status === 'checking' ? 'Verificando…' : 'Entrar'}
      </Button>
    </form>
  );
}
