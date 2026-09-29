'use client';

import clsx from 'clsx';
import { useCallback, useState } from 'react';
import type { Generation } from '@/lib/api';
import { GenerationCard } from './generation-card';
import { GenerationViewer } from './generation-viewer';
import { useCardActions } from './use-card-actions';

// Masonry grid plus the full-screen viewer, shared by Studio, Library and
// Explore so a result behaves the same wherever you meet it.
export function GenerationGrid({
  items,
  onRetry,
  showPrompt,
  className,
}: {
  items: Generation[];
  onRetry?: (g: Generation) => void;
  showPrompt?: boolean;
  className?: string;
}) {
  const actions = useCardActions();
  const [openId, setOpenId] = useState<string | null>(null);
  const viewable = items.filter((g) => g.status === 'SUCCEEDED');
  const index = openId ? viewable.findIndex((g) => g.id === openId) : -1;
  const close = useCallback(() => setOpenId(null), []);
  const onIndex = useCallback((i: number) => setOpenId(viewable[i]?.id ?? null), [viewable]);

  return (
    <>
      <div className={clsx('columns-2 gap-3 md:columns-3 2xl:columns-4 [&>*]:mb-3 [&>*]:break-inside-avoid', className)}>
        {items.map((g) => (
          <GenerationCard
            key={g.id}
            g={g}
            actions={actions}
            onOpen={(x) => setOpenId(x.id)}
            onRetry={onRetry}
            showPrompt={showPrompt}
          />
        ))}
      </div>
      {index >= 0 && (
        <GenerationViewer items={viewable} index={index} onIndex={onIndex} onClose={close} actions={actions} />
      )}
    </>
  );
}
