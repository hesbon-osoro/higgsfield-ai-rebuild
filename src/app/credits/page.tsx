'use client';

import clsx from 'clsx';
import { Coins } from 'lucide-react';
import { ENGINES, TOP_UP_PACKS } from '@/lib/catalog';
import { useLedger, useTopUp, useViewer } from '@/lib/api';
import { useToast } from '@/components/toast';

const REASON_LABEL: Record<string, string> = {
  starter: 'Welcome',
  generation: 'Generation',
  refund: 'Refund',
  top_up: 'Top-up',
};

export default function CreditsPage() {
  const { data: viewer } = useViewer();
  const { data: ledger, isLoading } = useLedger();
  const topUp = useTopUp();
  const toast = useToast();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Credits</h1>
      <p className="text-muted mt-1 text-sm">One balance. Prices are shown before you generate, and failed renders are refunded automatically.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="border-line bg-panel rounded-2xl border p-5">
          <p className="text-muted text-xs font-semibold tracking-wide uppercase">Balance</p>
          <p className="mt-2 flex items-center gap-2 text-4xl font-semibold tabular-nums">
            <Coins className="text-accent size-7" aria-hidden />
            {viewer?.credits ?? '···'}
          </p>
          <div className="mt-6 grid gap-2">
            {TOP_UP_PACKS.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  topUp.mutate(p.id, {
                    onSuccess: () => toast(`Added ${p.credits} credits`, 'success'),
                    onError: (e) => toast(e.message, 'error'),
                  })
                }
                disabled={topUp.isPending}
                className="border-line hover:border-line-strong hover:bg-hover flex items-center justify-between rounded-xl border px-4 py-3 text-left disabled:opacity-60"
              >
                <span>
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="text-muted text-xs">{p.credits} credits</span>
                </span>
                <span className="text-sm">
                  <span className="text-faint mr-2 line-through">{p.price}</span>
                  <span className="text-accent font-semibold">Free in demo</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-faint mt-3 text-xs">Demo mode: top-ups add credits without payment.</p>
        </section>

        <section className="border-line bg-panel rounded-2xl border p-5">
          <p className="text-muted text-xs font-semibold tracking-wide uppercase">What things cost</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint text-left text-xs">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 font-medium">Good for</th>
                  <th className="pb-2 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-line divide-y">
                {ENGINES.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2">{e.name} image</td>
                    <td className="text-muted py-2">{e.bestFor}</td>
                    <td className="py-2 text-right font-mono">{e.cost}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2">5s camera move</td>
                  <td className="text-muted py-2">From your frame; add the keyframe price if generated</td>
                  <td className="py-2 text-right font-mono">6</td>
                </tr>
                <tr>
                  <td className="py-2">10s camera move</td>
                  <td className="text-muted py-2">Longer shots</td>
                  <td className="py-2 text-right font-mono">10</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">History</h2>
        <div className="border-line overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-panel text-faint text-left text-xs">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">What</th>
                <th className="px-4 py-2.5 text-right font-medium">Change</th>
                <th className="px-4 py-2.5 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {isLoading && (
                <tr>
                  <td colSpan={4} className="text-muted px-4 py-6 text-center">
                    Loading…
                  </td>
                </tr>
              )}
              {ledger?.map((e) => (
                <tr key={e.id}>
                  <td className="text-muted px-4 py-2.5 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{REASON_LABEL[e.reason] ?? e.reason}</span>
                    {e.note && <span className="text-muted">: {e.note}</span>}
                  </td>
                  <td className={clsx('px-4 py-2.5 text-right font-mono', e.delta > 0 ? 'text-ok' : 'text-fg')}>
                    {e.delta > 0 ? '+' : ''}
                    {e.delta}
                  </td>
                  <td className="text-muted px-4 py-2.5 text-right font-mono">{e.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
