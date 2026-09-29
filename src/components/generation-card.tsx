'use client';

import clsx from 'clsx';
import { Clapperboard, Download, Heart, Loader2, RotateCcw, Shuffle } from 'lucide-react';
import { PRESET_BY_ID } from '@/lib/catalog';
import type { Generation } from '@/lib/api';
import { GenerationMedia } from './generation-media';
import type { CardActions } from './use-card-actions';

export function IconButton({
  label,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        'grid size-8 place-items-center rounded-full bg-black/55 backdrop-blur transition-colors hover:bg-black/80 disabled:opacity-50',
        active ? 'text-accent' : 'text-white',
      )}
    >
      {children}
    </button>
  );
}

export function GenerationCard({
  g,
  actions,
  onOpen,
  onRetry,
  showPrompt = false,
}: {
  g: Generation;
  actions?: CardActions;
  onOpen: (g: Generation) => void;
  onRetry?: (g: Generation) => void;
  showPrompt?: boolean;
}) {
  const done = g.status === 'SUCCEEDED';
  const exporting = actions?.exporting?.id === g.id ? actions.exporting.progress : null;

  return (
    <figure className="group animate-fade-in relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => done && onOpen(g)}
        onKeyDown={(e) => e.key === 'Enter' && done && onOpen(g)}
        className={clsx(
          'border-line relative overflow-hidden rounded-xl border',
          done && 'hover:border-line-strong cursor-zoom-in',
        )}
        aria-label={done ? `Open: ${g.prompt}` : undefined}
      >
        <GenerationMedia g={g} />

        {g.kind === 'VIDEO' && done && (
          <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium backdrop-blur">
            {PRESET_BY_ID[g.motionPreset ?? '']?.name ?? 'Motion'} · {g.durationSec}s
          </span>
        )}

        {exporting != null && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm backdrop-blur-sm">
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Exporting {Math.round(exporting * 100)}%
            </span>
          </div>
        )}

        {actions && done && g.isMine && (
          <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
            <IconButton label={g.favorite ? 'Unfavorite' : 'Favorite'} active={g.favorite} onClick={() => actions.toggleFavorite(g)}>
              <Heart className={clsx('size-4', g.favorite && 'fill-current')} />
            </IconButton>
            <IconButton label={g.kind === 'VIDEO' ? 'Download .webm' : 'Download'} onClick={() => actions.download(g)} disabled={exporting != null}>
              <Download className="size-4" />
            </IconButton>
          </div>
        )}

        {actions && done && (
          <div className="absolute inset-x-2 bottom-2 flex gap-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
            {g.kind === 'IMAGE' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  actions.animate(g);
                }}
                className="bg-accent text-accent-ink hover:bg-accent-hover flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
              >
                <Clapperboard className="size-3.5" /> Animate
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                actions.remix(g);
              }}
              className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium backdrop-blur hover:bg-black/80"
            >
              <Shuffle className="size-3.5" /> {g.isMine ? 'Remix' : 'Use recipe'}
            </button>
          </div>
        )}

        {g.status === 'FAILED' && onRetry && (
          <button
            onClick={() => onRetry(g)}
            className="border-line-strong hover:bg-hover absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-black/40 px-3 py-1.5 text-xs font-medium"
          >
            <RotateCcw className="size-3.5" /> Try again
          </button>
        )}
      </div>
      {showPrompt && <figcaption className="text-muted mt-2 line-clamp-2 text-xs leading-relaxed">{g.prompt}</figcaption>}
    </figure>
  );
}
