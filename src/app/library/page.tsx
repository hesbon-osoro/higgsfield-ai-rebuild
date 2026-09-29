'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FilterBar, useDebounced } from '@/components/filter-bar';
import { GenerationGrid } from '@/components/generation-grid';
import { useGenerations } from '@/lib/api';

type Tab = 'all' | 'images' | 'videos' | 'favorites';

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const { data, isLoading } = useGenerations(
    {
      kind: tab === 'images' ? 'IMAGE' : tab === 'videos' ? 'VIDEO' : null,
      favoritesOnly: tab === 'favorites',
      search: q,
    },
    60,
  );
  const items = data?.items ?? [];
  const filtered = tab !== 'all' || q;

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="text-muted mt-1 text-sm">Everything you have made. Each item keeps its recipe for remixing.</p>
      </div>
      <FilterBar
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'images', label: 'Images' },
          { value: 'videos', label: 'Videos' },
          { value: 'favorites', label: 'Favorites' },
        ]}
        value={tab}
        onChange={setTab}
        search={search}
        onSearch={setSearch}
      />
      <div className="mt-6">
        {isLoading ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : items.length ? (
          <GenerationGrid items={items} showPrompt />
        ) : (
          <div className="border-line rounded-2xl border border-dashed px-6 py-16 text-center">
            <p className="font-medium">{filtered ? 'Nothing matches' : 'Nothing here yet'}</p>
            <p className="text-muted mt-1 text-sm">
              {filtered ? 'Try another filter or search.' : 'Your images and videos will collect here.'}
            </p>
            {!filtered && (
              <Link href="/" className="bg-accent text-accent-ink mt-5 inline-block rounded-full px-4 py-2 text-sm font-semibold">
                Start creating
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
