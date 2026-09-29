'use client';

import clsx from 'clsx';
import { Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cameraAt, frameToCss } from '@/lib/motion';

interface Props {
  src: string;
  preset: string;
  durationSec: number;
  alt?: string;
  /** Show play/pause and scrubber. */
  controls?: boolean;
  /** 'visible' plays while on screen; 'hover' only while hovered. */
  playWhen?: 'visible' | 'hover' | 'always';
  className?: string;
  imgClassName?: string;
}

// Renders a camera move over a still frame. Every frame is computed by
// cameraAt(), shared with the video exporter.
export function MotionPlayer({
  src,
  preset,
  durationSec,
  alt = '',
  controls = false,
  playWhen = 'visible',
  className,
  imgClassName,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [playing, setPlaying] = useState(playWhen === 'always');
  const [userPaused, setUserPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const lastRef = useRef<number | null>(null);

  const paint = useCallback(
    (t: number) => {
      if (imgRef.current) imgRef.current.style.transform = frameToCss(cameraAt(preset, t, durationSec));
    },
    [preset, durationSec],
  );

  useEffect(() => {
    paint(progressRef.current);
  }, [paint]);

  // Visibility / hover gating so a grid of players doesn't burn the CPU.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || playWhen === 'always') return;
    if (playWhen === 'visible') {
      const io = new IntersectionObserver(([entry]) => setPlaying(entry.isIntersecting), { threshold: 0.35 });
      io.observe(el);
      return () => io.disconnect();
    }
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    el.addEventListener('pointerenter', on);
    el.addEventListener('pointerleave', off);
    return () => {
      el.removeEventListener('pointerenter', on);
      el.removeEventListener('pointerleave', off);
    };
  }, [playWhen]);

  const active = playing && !userPaused;

  useEffect(() => {
    if (!active) {
      lastRef.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (lastRef.current != null) {
        const dt = (now - lastRef.current) / 1000;
        progressRef.current = (progressRef.current + dt / durationSec) % 1;
        paint(progressRef.current);
        if (controls) setProgress(progressRef.current);
      }
      lastRef.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, durationSec, paint, controls]);

  const seek = (t: number) => {
    progressRef.current = t;
    setProgress(t);
    paint(t);
  };

  return (
    <div ref={wrapRef} className={clsx('overflow-hidden bg-black', className ?? 'relative')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        className={clsx('absolute inset-0 h-full w-full object-cover will-change-transform', imgClassName)}
      />
      {controls && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-3 pt-8 pb-3">
          <button
            onClick={() => setUserPaused((p) => !p)}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-white/15 backdrop-blur transition-colors hover:bg-white/25"
            aria-label={active ? 'Pause' : 'Play'}
          >
            {active ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </button>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 1000)}
            onChange={(e) => {
              setUserPaused(true);
              seek(Number(e.target.value) / 1000);
            }}
            aria-label="Scrub"
            className="accent-accent h-1 flex-1 cursor-pointer"
          />
          <span className="shrink-0 text-right font-mono text-xs whitespace-nowrap text-white/80 tabular-nums">
            {(progress * durationSec).toFixed(1)}s / {durationSec}s
          </span>
        </div>
      )}
    </div>
  );
}
