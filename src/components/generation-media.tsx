'use client';

import clsx from 'clsx';
import { AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ASPECT_BY_ID } from '@/lib/catalog';
import type { Generation } from '@/lib/api';
import { MotionPlayer } from './motion-player';

export function aspectStyle(g: Pick<Generation, 'aspect'>) {
  const a = ASPECT_BY_ID[g.aspect];
  return { aspectRatio: `${a.width} / ${a.height}` };
}

function useElapsed(since: string, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
}

export function fmtDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function ProcessingState({ g }: { g: Generation }) {
  const elapsed = useElapsed(g.createdAt, true);
  const queued = g.queuePosition != null && g.queuePosition > 0;
  const step =
    g.queuePosition == null
      ? 'Sending to a model'
      : queued
        ? 'Waiting for a free worker'
        : g.kind === 'VIDEO'
          ? 'Rendering keyframe'
          : 'Rendering';
  return (
    <div className="bg-raised absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
      <div className="shimmer-bg animate-shimmer absolute inset-0" />
      <Loader2 className="text-accent relative size-5 animate-spin" aria-hidden />
      <p className="relative text-sm font-medium">{step}</p>
      <p className="text-muted relative text-xs">
        {queued && <>#{g.queuePosition} in line · </>}
        {g.etaSec ? <>~{fmtDuration(g.etaSec)} left · </> : null}
        {fmtDuration(elapsed)} elapsed
      </p>
    </div>
  );
}

export function GenerationMedia({
  g,
  controls = false,
  className,
  playWhen = 'visible',
  fit = 'cover',
}: {
  g: Generation;
  controls?: boolean;
  className?: string;
  playWhen?: 'visible' | 'hover' | 'always';
  fit?: 'cover' | 'contain';
}) {
  const [loaded, setLoaded] = useState(false);

  if (g.status === 'PROCESSING') {
    return (
      <div className={clsx('relative', className)} style={aspectStyle(g)} role="status" aria-label="Generating">
        <ProcessingState g={g} />
      </div>
    );
  }

  if (g.status === 'FAILED' || !g.output) {
    return (
      <div
        className={clsx('bg-raised relative flex flex-col items-center justify-center gap-2 p-4 text-center', className)}
        style={aspectStyle(g)}
      >
        <AlertTriangle className="text-danger size-5" aria-hidden />
        <p className="text-sm font-medium">Didn&apos;t render</p>
        <p className="text-muted line-clamp-2 max-w-[28ch] text-xs">{g.error ?? 'Something went wrong'}</p>
        <p className="text-ok text-xs">{g.cost} credits refunded</p>
      </div>
    );
  }

  if (g.kind === 'VIDEO') {
    return (
      <div className={clsx('relative', className)} style={aspectStyle(g)}>
        <MotionPlayer
          src={(g.startFrame ?? g.output).url}
          preset={g.motionPreset ?? 'static'}
          durationSec={g.durationSec ?? 5}
          controls={controls}
          playWhen={playWhen}
          alt={g.prompt}
          className="absolute inset-0"
        />
      </div>
    );
  }

  return (
    <div className={clsx('bg-raised relative overflow-hidden', className)} style={aspectStyle(g)}>
      {!loaded && <div className="shimmer-bg animate-shimmer absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={g.output.url}
        alt={g.prompt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={clsx(
          'absolute inset-0 h-full w-full transition-opacity duration-300',
          fit === 'cover' ? 'object-cover' : 'object-contain',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}

export function QueueHint() {
  return (
    <span className="text-faint inline-flex items-center gap-1 text-xs">
      <Clock className="size-3" aria-hidden /> Free model network: waits vary from seconds to a few minutes
    </span>
  );
}
