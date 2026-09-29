'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { MOTION_PRESETS, type MotionCategory } from '@/lib/catalog';
import { MotionPlayer } from '../motion-player';

const SAMPLE = '/samples/motion-sample.webp';
const CATEGORIES: ('All' | MotionCategory)[] = ['All', 'Push', 'Pull', 'Pan & tilt', 'Orbit', 'Handheld', 'Stylized'];

// Visual picker: every tile is a live preview of the move, on your own start
// frame when you have one, so you choose by seeing rather than by name.
export function PresetGrid({
  value,
  onChange,
  frameUrl,
}: {
  value: string;
  onChange: (id: string) => void;
  frameUrl?: string;
}) {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('All');
  const presets = MOTION_PRESETS.filter((p) => cat === 'All' || p.category === cat);
  const selected = MOTION_PRESETS.find((p) => p.id === value);

  return (
    <div>
      <div className="scrollbar-thin -mx-1 mb-2 flex gap-1 overflow-x-auto px-1 pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={clsx(
              'shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors',
              cat === c ? 'bg-fg text-ink' : 'text-muted hover:text-fg bg-raised',
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Camera motion" className="grid grid-cols-3 gap-2">
        {presets.map((p) => {
          const active = p.id === value;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={p.description}
              onClick={() => onChange(p.id)}
              className={clsx(
                'group relative overflow-hidden rounded-lg border text-left transition-colors',
                active ? 'border-accent ring-accent/40 ring-2' : 'border-line hover:border-line-strong',
              )}
            >
              <MotionPlayer
                src={frameUrl ?? SAMPLE}
                preset={p.id}
                durationSec={3}
                playWhen={active ? 'always' : 'hover'}
                className="relative aspect-[4/3] w-full"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pt-4 pb-1.5 text-[11px] font-medium">
                {p.name}
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <p className="text-faint mt-2 text-xs">
          <span className="text-fg">{selected.name}</span>: {selected.description}
        </p>
      )}
    </div>
  );
}
