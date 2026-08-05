import { useEffect, useRef, useState } from 'react';
import { fetchAudioSegmentBlob } from '../lib/api';
import { Button } from './ui/Button';

interface SegmentPlayButtonProps {
  jobId: string;
  start: number;
  end: number;
}

type Status = 'idle' | 'loading' | 'playing' | 'error';

export function SegmentPlayButton({ jobId, start, end }: SegmentPlayButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  function releaseObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      releaseObjectUrl();
    };
  }, []);

  async function handleClick() {
    if (status === 'playing') {
      audioRef.current?.pause();
      setStatus('idle');
      return;
    }

    setStatus('loading');
    releaseObjectUrl();

    try {
      const blob = await fetchAudioSegmentBlob(jobId, start, end);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.onended = () => setStatus('idle');
      await audio.play();
      setStatus('playing');
    } catch {
      setStatus('error');
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={handleClick} className="shrink-0">
      {status === 'loading' ? '…' : status === 'playing' ? '⏸' : status === 'error' ? '⚠' : '▶'}
    </Button>
  );
}
