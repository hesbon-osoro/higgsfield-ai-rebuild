'use client';

import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function FilterBar<T extends string>({
  tabs,
  value,
  onChange,
  search,
  onSearch,
  placeholder = 'Search prompts',
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  search: string;
  onSearch: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="tablist" className="border-line flex gap-1 rounded-full border p-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={clsx(
              'rounded-full px-3 py-1 text-sm transition-colors',
              value === t.value ? 'bg-fg text-ink' : 'text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <label className="border-line focus-within:border-line-strong ml-auto flex w-full items-center gap-2 rounded-full border px-3 py-1.5 sm:w-72">
        <Search className="text-faint size-4 shrink-0" aria-hidden />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="placeholder:text-faint w-full bg-transparent text-sm outline-none"
        />
      </label>
    </div>
  );
}
