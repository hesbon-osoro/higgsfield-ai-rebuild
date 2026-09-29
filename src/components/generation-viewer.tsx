'use client';

import clsx from 'clsx';
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  Globe,
  Heart,
  Loader2,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ASPECT_BY_ID, PRESET_BY_ID } from '@/lib/catalog';
import type { Generation } from '@/lib/api';
import { GenerationMedia } from './generation-media';
import { useToast } from './toast';
import type { CardActions } from './use-card-actions';

function Chip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-line bg-raised rounded-lg border px-3 py-2">
      <dt className="text-faint text-[11px] tracking-wide uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

export function GenerationViewer({
  items,
  index,
  onIndex,
  onClose,
  actions,
}: {
  items: Generation[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  actions: CardActions;
}) {
  const g = items[index];
  const toast = useToast();
  // Keyed by id so moving to another item implicitly cancels the confirm.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [index, items.length, onClose, onIndex]);

  if (!g) return null;
  const confirmDelete = confirmId === g.id;
  const exporting = actions.exporting?.id === g.id ? actions.exporting.progress : null;
  const aspect = ASPECT_BY_ID[g.aspect];
  const preset = g.motionPreset ? PRESET_BY_ID[g.motionPreset] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Generation details"
      onClick={onClose}
    >
      <div className="flex min-h-0 w-full flex-col lg:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 lg:p-10">
          <div
            className="max-h-full w-full"
            style={{ maxWidth: `min(100%, calc((100dvh - 8rem) * ${aspect.width / aspect.height}))` }}
          >
            <GenerationMedia g={g} controls playWhen="always" fit="contain" className="overflow-hidden rounded-xl" />
          </div>
          {index > 0 && (
            <button
              onClick={() => onIndex(index - 1)}
              className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 hover:bg-white/20"
              aria-label="Previous"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          {index < items.length - 1 && (
            <button
              onClick={() => onIndex(index + 1)}
              className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 hover:bg-white/20"
              aria-label="Next"
            >
              <ChevronRight className="size-5" />
            </button>
          )}
        </div>

        <aside className="border-line bg-panel scrollbar-thin flex max-h-[45dvh] w-full shrink-0 flex-col gap-5 overflow-y-auto border-t p-5 lg:max-h-none lg:w-[380px] lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between">
            <span className="text-muted text-xs">
              {g.kind === 'VIDEO' ? 'Video' : 'Image'} · {new Date(g.createdAt).toLocaleString()}
            </span>
            <button onClick={onClose} className="hover:bg-hover -mr-2 grid size-8 place-items-center rounded-full" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Prompt</h2>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(g.prompt);
                  toast('Prompt copied');
                }}
                className="text-muted hover:text-fg flex items-center gap-1 text-xs"
              >
                <Copy className="size-3.5" /> Copy
              </button>
            </div>
            <p className="text-fg/90 text-sm leading-relaxed whitespace-pre-wrap">{g.prompt || <em className="text-muted">No prompt: animated from a frame</em>}</p>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Recipe</h2>
            <dl className="grid grid-cols-2 gap-2">
              <Chip label="Engine" value={<>{g.engineName}{g.engineWasAuto && <span className="text-faint"> (auto)</span>}</>} />
              <Chip label="Aspect" value={`${g.aspect} ${aspect.label}`} />
              {preset && <Chip label="Camera" value={preset.name} />}
              {g.durationSec && <Chip label="Duration" value={`${g.durationSec}s`} />}
              <Chip label="Seed" value={<span className="font-mono">{g.seed}</span>} />
              <Chip label="Cost" value={`${g.cost} credits`} />
            </dl>
          </section>

          <section className="mt-auto flex flex-col gap-2">
            {g.kind === 'IMAGE' && (
              <button
                onClick={() => actions.animate(g)}
                className="bg-accent text-accent-ink hover:bg-accent-hover flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
              >
                <Clapperboard className="size-4" /> Animate this image
              </button>
            )}
            <button
              onClick={() => actions.remix(g)}
              className="border-line-strong hover:bg-hover flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium"
            >
              <Shuffle className="size-4" /> {g.isMine ? 'Remix: load this recipe' : 'Use this recipe'}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => actions.download(g)}
                disabled={exporting != null}
                className="border-line hover:bg-hover flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
              >
                {exporting != null ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> {Math.round(exporting * 100)}%
                  </>
                ) : (
                  <>
                    <Download className="size-4" /> {g.kind === 'VIDEO' ? '.webm' : 'Download'}
                  </>
                )}
              </button>
              {g.isMine && (
                <>
                  <button
                    onClick={() => actions.toggleFavorite(g)}
                    className={clsx(
                      'border-line hover:bg-hover grid size-10 place-items-center rounded-xl border',
                      g.favorite && 'text-accent',
                    )}
                    aria-label={g.favorite ? 'Unfavorite' : 'Favorite'}
                    title={g.favorite ? 'Unfavorite' : 'Favorite'}
                  >
                    <Heart className={clsx('size-4', g.favorite && 'fill-current')} />
                  </button>
                  <button
                    onClick={() => actions.togglePublish(g)}
                    className={clsx(
                      'border-line hover:bg-hover grid size-10 place-items-center rounded-xl border',
                      g.published && 'text-accent',
                    )}
                    aria-label={g.published ? 'Remove from Explore' : 'Share to Explore'}
                    title={g.published ? 'Remove from Explore' : 'Share to Explore'}
                  >
                    <Globe className="size-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (!confirmDelete) return setConfirmId(g.id);
                      actions.remove(g, () => (items.length > 1 ? onIndex(Math.max(0, index - 1)) : onClose()));
                    }}
                    className={clsx(
                      'border-line hover:bg-hover flex h-10 items-center justify-center gap-1 rounded-xl border px-3 text-sm',
                      confirmDelete && 'border-danger/50 text-danger',
                    )}
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 className="size-4" /> {confirmDelete && 'Confirm'}
                  </button>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
