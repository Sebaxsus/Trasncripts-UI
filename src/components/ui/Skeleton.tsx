import type { HTMLAttributes } from 'react';

type Tone = 'neutral' | 'danger';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}

// danger: rojo pálido + glow difuso suave, nunca un rojo sólido/estridente —
// se usa cuando el fetch detrás de este placeholder falló por NetworkError
// (servidor caído), no por un error HTTP normal.
const toneClasses: Record<Tone, string> = {
  neutral: 'bg-slate-200',
  danger: 'bg-danger-100/70 shadow-[0_0_18px_-4px_rgba(239,68,68,0.35)] ring-1 ring-danger-200/60'
};

/** Primitiva de placeholder. El tamaño/forma lo define el caller vía className (h-4 w-32, rounded-full, etc). */
export function Skeleton({ tone = 'neutral', className = '', ...rest }: SkeletonProps) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md ${toneClasses[tone]} ${className}`} {...rest} />;
}
