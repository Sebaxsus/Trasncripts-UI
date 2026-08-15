import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { RADIO_STATIONS } from '../lib/radio';
import { Button } from './ui/Button';

type Status = 'idle' | 'loading' | 'playing' | 'error';

export function RadioPlayer() {
  const [stationIndex, setStationIndex] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [volume, setVolume] = useState(0.4);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Si se cambia de emisora mientras suena, retoma la reproducción en la
  // nueva una vez cargada; si estaba idle/error, solo cambia la selección.
  const resumeOnStationChangeRef = useRef(false);
  const isFirstStationEffectRef = useRef(true);
  const station = RADIO_STATIONS[stationIndex];

  useEffect(() => {
    // Se salta el montaje inicial a propósito: el <audio> ya trae el src
    // correcto vía JSX, y llamar load() acá pisaría el preload="none"
    // (dispararía la carga del stream antes de que el usuario presione play).
    if (isFirstStationEffectRef.current) {
      isFirstStationEffectRef.current = false;
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    if (resumeOnStationChangeRef.current) {
      audio.play().catch(() => setStatus('error'));
    }
  }, [station.streamUrl]);

  function handleToggle() {
    const audio = audioRef.current;
    if (!audio) return;

    if (status === 'playing') {
      audio.pause();
      setStatus('idle');
      return;
    }

    setStatus('loading');
    // Recarga el stream en vivo (no seek): tras un error o pausa larga, el
    // punto en vivo original ya quedó atrás.
    audio.load();
    audio.play().catch(() => setStatus('error'));
  }

  function handleStationChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextIndex = Number(event.target.value);
    if (nextIndex === stationIndex) return;
    const shouldResume = status === 'playing' || status === 'loading';
    resumeOnStationChangeRef.current = shouldResume;
    setStationIndex(nextIndex);
    setStatus(shouldResume ? 'loading' : 'idle');
  }

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const next = Number(event.target.value);
    setVolume(next);
    if (audioRef.current) {
      audioRef.current.volume = next;
    }
  }

  return (
    <div
      // transition:persist necesita que este nodo raíz mantenga su identidad
      // entre navegaciones — se declara en el <RadioPlayer> del layout, no acá.
      className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-4 border-t border-slate-200 bg-white px-4 py-2 shadow-[0_-1px_4px_rgba(0,0,0,0.05)]"
    >
      <audio
        ref={audioRef}
        src={station.streamUrl}
        preload="none"
        onPlaying={() => setStatus('playing')}
        onWaiting={() => setStatus('loading')}
        onPause={() => setStatus((current) => (current === 'error' ? current : 'idle'))}
        onError={() => setStatus('error')}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={handleToggle}
        className="shrink-0"
        aria-label={status === 'playing' ? 'Pausar radio' : 'Reproducir radio'}
      >
        {status === 'loading' ? '…' : status === 'playing' ? '⏸' : status === 'error' ? '⚠' : '▶'}
      </Button>
      <div className="min-w-0 flex-1">
        <select
          value={stationIndex}
          onChange={handleStationChange}
          aria-label="Emisora"
          className="w-full cursor-pointer truncate rounded-sm bg-transparent text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {RADIO_STATIONS.map((option, index) => (
            <option key={option.id} value={index}>
              {option.name}
            </option>
          ))}
        </select>
        <p className="truncate text-xs text-slate-500">
          {station.frequency}
          {status === 'error' && ' · Error de conexión, intenta de nuevo'}
        </p>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={handleVolumeChange}
        className="w-24 shrink-0 accent-brand-600"
        aria-label="Volumen"
      />
    </div>
  );
}
