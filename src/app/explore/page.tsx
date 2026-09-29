'use client';

import { useState } from 'react';
import { FilterBar, useDebounced } from '@/components/filter-bar';
import { GenerationGrid } from '@/components/generation-grid';
import { useExplore } from '@/lib/api';

type Tab = 'all' | 'images' | 'videos';

export default function ExplorePage() {
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const { data, isLoading } = useExplore({
    kind: tab === 'images' ? 'IMAGE' : tab === 'videos' ? 'VIDEO' : null,
    search: q,
  });
  const items = data?.items ?? [];

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
        <p className="text-muted mt-1 text-sm">
          Every piece shows its full recipe: prompt, engine, camera move, seed. Open one and choose{' '}
          <span className="text-fg">Use this recipe</span> to load it into the studio, or animate any image.
        </p>
      </div>
      <FilterBar
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'images', label: 'Images' },
          { value: 'videos', label: 'Videos' },
        ]}
        value={tab}
        onChange={setTab}
        search={search}
        onSearch={setSearch}
      />
      <div className="mt-6">
        {isLoading ? (
          <div className="columns-2 gap-3 md:columns-3 2xl:columns-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="bg-raised shimmer-bg animate-shimmer mb-3 rounded-xl" style={{ aspectRatio: i % 3 ? '3/4' : '16/9' }} />
            ))}
          </div>
        ) : items.length ? (
          <GenerationGrid items={items} showPrompt />
        ) : (
          <p className="text-muted border-line rounded-2xl border border-dashed py-16 text-center text-sm">
            {q ? 'No recipes match that search.' : 'Nothing shared yet.'}
          </p>
        )}
      </div>
    </main>
  );
}
