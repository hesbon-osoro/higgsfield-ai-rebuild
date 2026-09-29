'use client';

import clsx from 'clsx';
import { Coins } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useViewer } from '@/lib/api';

const LINKS = [
  { href: '/', label: 'Create' },
  { href: '/explore', label: 'Explore' },
  { href: '/library', label: 'Library' },
];

export function TopNav() {
  const pathname = usePathname();
  const { data: viewer } = useViewer();

  return (
    <header className="border-line bg-ink/85 sticky top-0 z-40 border-b backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="Parallax home">
          <Logo />
          <span className="hidden sm:inline">Parallax</span>
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'rounded-full px-3 py-1.5 text-sm transition-colors',
                  active ? 'bg-raised text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/credits"
            className="border-line hover:border-line-strong hover:bg-raised flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors"
            title="Credits: see balance, history and pricing"
          >
            <Coins className="text-accent size-4" aria-hidden />
            <span className="font-mono tabular-nums">{viewer ? viewer.credits : '···'}</span>
            <span className="text-muted hidden sm:inline">credits</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <rect x="2" y="5" width="14" height="14" rx="3" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
      <rect x="8" y="5" width="14" height="14" rx="3" fill="var(--color-accent)" opacity="0.35" />
    </svg>
  );
}
