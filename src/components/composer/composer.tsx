'use client';

import clsx from 'clsx';
import { Check, ChevronDown, Clapperboard, Image as ImageIcon, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ASPECTS, DURATIONS, ENGINES, ENGINE_BY_ID, MAX_IMAGES_PER_BATCH, MAX_PROMPT_LENGTH } from '@/lib/catalog';
import { useViewer } from '@/lib/api';
import type { Composer } from './use-composer';
import { PresetGrid } from './preset-grid';
import { StartFrameSlot } from './start-frame-slot';

function Label({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <span className="text-muted text-xs font-semibold tracking-wide uppercase">{children}</span>
      {hint && <span className="text-faint text-xs">{hint}</span>}
    </div>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="border-line bg-ink flex gap-1 rounded-xl border p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
            value === o.value ? 'bg-raised text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AspectIcon({ w, h }: { w: number; h: number }) {
  const max = 14;
  const k = max / Math.max(w, h);
  return (
    <span className="grid size-4 place-items-center" aria-hidden>
      <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: w * k, height: h * k }} />
    </span>
  );
}

function EngineSelect({ c }: { c: Composer }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const resolved = ENGINE_BY_ID[c.resolvedEngine];
  const isAuto = c.s.engine === 'auto';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="border-line bg-ink hover:border-line-strong flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left"
      >
        <span className="bg-accent/15 text-accent grid size-8 shrink-0 place-items-center rounded-lg">
          <Sparkles className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {isAuto ? (
              <>
                Auto <span className="text-muted font-normal">→ {resolved.name}</span>
              </>
            ) : (
              resolved.name
            )}
          </span>
          <span className="text-faint block truncate text-xs">
            {isAuto ? 'Picked from your prompt as you type' : resolved.blurb}
          </span>
        </span>
        <ChevronDown className="text-muted size-4 shrink-0" />
      </button>
      {open && (
        <div
          role="listbox"
          className="border-line-strong bg-panel animate-pop absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border shadow-2xl"
        >
          {[{ id: 'auto' as const }, ...ENGINES].map((e) => {
            const engine = e.id === 'auto' ? null : ENGINE_BY_ID[e.id];
            const selected = c.s.engine === e.id;
            return (
              <button
                key={e.id}
                role="option"
                aria-selected={selected}
                type="button"
                onClick={() => {
                  c.set('engine', e.id);
                  setOpen(false);
                }}
                className={clsx('hover:bg-hover flex w-full items-start gap-3 px-3 py-2.5 text-left', selected && 'bg-raised')}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {engine ? engine.name : 'Auto'}
                    {!engine && <span className="bg-accent/15 text-accent rounded-full px-1.5 text-[10px] font-semibold">RECOMMENDED</span>}
                  </span>
                  <span className="text-muted block text-xs">
                    {engine ? `${engine.bestFor}` : 'Chooses the best engine for what you describe'}
                  </span>
                  {engine && <span className="text-faint block text-[11px]">{engine.models}</span>}
                </span>
                <span className="text-muted shrink-0 text-right text-xs">
                  {engine ? (
                    <>
                      {engine.cost} cr
                      <span className="text-faint block text-[11px]">{engine.speed}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                {selected && <Check className="text-accent mt-0.5 size-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const EXAMPLES = [
  'A lone astronaut in a sunflower field at golden hour',
  'Portrait of an old fisherman, weathered face, soft window light',
  'Neon-lit ramen stall in the rain, Tokyo alley at night',
  'Anime girl on a rooftop, wind in her hair, sunset clouds',
];

export function ComposerPanel({
  c,
  onSubmit,
  submitting,
}: {
  c: Composer;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const { data: viewer } = useViewer();
  const { s, set } = c;
  const affordable = viewer ? viewer.credits >= c.cost : true;
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (!c.canSubmit || submitting || !affordable) return;
    onSubmit();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      <Segmented
        ariaLabel="What to create"
        value={s.mode}
        onChange={(v) => set('mode', v)}
        options={[
          { value: 'IMAGE', label: <><ImageIcon className="size-4" /> Image</> },
          { value: 'VIDEO', label: <><Clapperboard className="size-4" /> Video</> },
        ]}
      />

      {s.mode === 'VIDEO' && (
        <div>
          <Label hint="Optional">Start frame</Label>
          <StartFrameSlot c={c} />
        </div>
      )}

      <div>
        <Label hint={s.prompt.length > MAX_PROMPT_LENGTH * 0.8 ? `${s.prompt.length}/${MAX_PROMPT_LENGTH}` : '⌘/Ctrl + Enter'}>
          {s.mode === 'VIDEO' && s.startFrame ? 'Describe the shot (optional)' : 'Prompt'}
        </Label>
        <textarea
          ref={promptRef}
          value={s.prompt}
          maxLength={MAX_PROMPT_LENGTH}
          onChange={(e) => set('prompt', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={4}
          placeholder={
            s.mode === 'VIDEO'
              ? s.startFrame
                ? 'The frame drives the shot. Notes here are saved with the recipe.'
                : 'Describe the scene. We generate a keyframe, then move the camera through it.'
              : 'Describe what you want to see…'
          }
          className="border-line bg-ink placeholder:text-faint focus:border-line-strong w-full resize-none rounded-xl border px-3 py-2.5 text-sm leading-relaxed outline-none"
        />
        {!s.prompt && s.mode === 'IMAGE' && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  set('prompt', ex);
                  promptRef.current?.focus();
                }}
                className="border-line text-muted hover:border-line-strong hover:text-fg rounded-full border px-2.5 py-1 text-xs"
              >
                {ex.length > 34 ? ex.slice(0, 34) + '…' : ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {s.mode === 'VIDEO' && (
        <div>
          <Label hint="Hover to preview">Camera motion</Label>
          <PresetGrid value={s.preset} onChange={(p) => set('preset', p)} frameUrl={s.startFrame?.url} />
        </div>
      )}

      {!(s.mode === 'VIDEO' && s.startFrame) && (
        <div>
          <Label>{s.mode === 'VIDEO' ? 'Keyframe engine' : 'Engine'}</Label>
          <EngineSelect c={c} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5">
        {!(s.mode === 'VIDEO' && s.startFrame) && (
          <div>
            <Label hint={ASPECTS.find((a) => a.id === s.aspect)?.label}>Aspect ratio</Label>
            <Segmented
              ariaLabel="Aspect ratio"
              value={s.aspect}
              onChange={(v) => set('aspect', v)}
              options={ASPECTS.map((a) => ({
                value: a.id,
                title: a.label,
                label: (
                  <>
                    <AspectIcon w={a.width} h={a.height} />
                    <span className="text-xs">{a.id}</span>
                  </>
                ),
              }))}
            />
          </div>
        )}
        {s.mode === 'IMAGE' ? (
          <div>
            <Label hint={`${ENGINE_BY_ID[c.resolvedEngine].cost} credits each`}>Images</Label>
            <Segmented
              ariaLabel="Number of images"
              value={s.count}
              onChange={(v) => set('count', v)}
              options={Array.from({ length: MAX_IMAGES_PER_BATCH }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
            />
          </div>
        ) : (
          <div>
            <Label>Duration</Label>
            <Segmented
              ariaLabel="Duration"
              value={s.duration}
              onChange={(v) => set('duration', v)}
              options={DURATIONS.map((d) => ({ value: d, label: `${d}s` }))}
            />
          </div>
        )}
      </div>

      {s.seed != null && (
        <div className="border-line bg-ink flex items-center justify-between rounded-xl border px-3 py-2 text-xs">
          <span className="text-muted">
            Remixing with seed <span className="text-fg font-mono">{s.seed}</span>: same composition, your changes
          </span>
          <button type="button" onClick={() => set('seed', null)} className="text-muted hover:text-fg flex items-center gap-1">
            <X className="size-3.5" /> New seed
          </button>
        </div>
      )}

      <div className="bg-panel sticky bottom-0 -mx-4 mt-auto border-t border-transparent px-4 pt-1 pb-4 sm:-mx-5 sm:px-5">
        {affordable ? (
          <button
            type="submit"
            disabled={!c.canSubmit || submitting}
            className="bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-raised disabled:text-faint flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors"
          >
            {submitting ? 'Starting…' : 'Generate'}
            <span className="bg-accent-ink/10 rounded-full px-2 py-0.5 font-mono text-xs tabular-nums">
              {c.cost} credits
            </span>
          </button>
        ) : (
          <Link
            href="/credits"
            className="border-accent/50 text-accent hover:bg-accent/10 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"
          >
            Needs {c.cost} credits, you have {viewer?.credits}. Top up
          </Link>
        )}
        <p className="text-faint mt-2 text-center text-[11px]">
          {s.mode === 'VIDEO'
            ? s.startFrame
              ? 'Motion renders instantly from your frame.'
              : 'Keyframe renders on a free model network. The move is added in your browser.'
            : 'Failed renders are refunded automatically.'}
        </p>
      </div>
    </form>
  );
}
