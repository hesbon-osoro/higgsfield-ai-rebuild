'use client';

import { ArrowRight, Clapperboard, Image as ImageIcon, Library, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ApiError, gql, useGenerate, useGenerations, type Generation } from '@/lib/api';
import { ComposerPanel } from './composer/composer';
import { useComposer } from './composer/use-composer';
import { GenerationGrid } from './generation-grid';
import { QueueHint } from './generation-media';
import { useToast } from './toast';

const GENERATION_FIELDS = `id batchId kind status prompt engine engineName engineWasAuto aspect seed
  motionPreset durationSec parentId cost queuePosition etaSec error favorite published isMine createdAt completedAt
  startFrame { id url width height } output { id url width height }`;

export function Studio() {
  const c = useComposer();
  const generate = useGenerate();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { data, isLoading } = useGenerations({}, 40);
  const items = data?.items ?? [];
  const processing = items.filter((g) => g.status === 'PROCESSING').length;
  const applied = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Deep links from Library/Explore: /?from=<id>&mode=animate|remix
  const from = params.get('from');
  const mode = params.get('mode');
  useEffect(() => {
    const key = `${from}:${mode}`;
    if (!from || applied.current === key) return;
    applied.current = key;
    gql<{ generation: Generation | null }>(`query($id: ID!) { generation(id: $id) { ${GENERATION_FIELDS} } }`, { id: from })
      .then(({ generation }) => {
        if (!generation) return toast('That recipe is no longer available', 'error');
        if (mode === 'animate') c.loadAnimate(generation);
        else c.loadRecipe(generation);
        toast(mode === 'animate' ? 'Image loaded as the start frame. Pick a camera move.' : 'Recipe loaded. Tweak and generate.', 'success');
        panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => router.replace('/', { scroll: false }));
  }, [from, mode, c, router, toast]);

  const submit = (input = c.toInput()) =>
    generate.mutate(input, {
      onSuccess: (res) => {
        const failed = res.generations.filter((g) => g.status === 'FAILED');
        if (failed.length) toast(`${failed[0].error ?? 'Could not start'}. Credits refunded.`, 'error');
      },
      onError: (e) => {
        const code = e instanceof ApiError ? e.code : undefined;
        toast(e.message, 'error', code === 'INSUFFICIENT_CREDITS' ? { label: 'Top up', onClick: () => router.push('/credits') } : undefined);
      },
    });

  const retry = (g: Generation) =>
    submit({
      kind: g.kind,
      prompt: g.prompt,
      engine: g.engineWasAuto ? null : g.engine,
      aspect: g.aspect,
      count: 1,
      motionPreset: g.motionPreset,
      durationSec: g.durationSec,
      startFrameAssetId: g.kind === 'VIDEO' ? (g.startFrame?.id ?? null) : null,
      parentId: g.parentId,
      seed: g.seed,
    });

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
      <aside
        ref={panelRef}
        className="border-line bg-panel scrollbar-thin flex flex-col border-b px-4 pt-5 sm:px-5 lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:w-[420px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
      >
        <ComposerPanel c={c} onSubmit={() => submit()} submitting={generate.isPending} />
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Your generations</h1>
          <div className="flex items-center gap-3">
            {processing > 0 && <QueueHint />}
            {items.length > 0 && (
              <Link href="/library" className="text-muted hover:text-fg flex items-center gap-1 text-sm">
                <Library className="size-4" /> Library
              </Link>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="columns-2 gap-3 md:columns-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="bg-raised shimmer-bg animate-shimmer mb-3 rounded-xl" style={{ aspectRatio: i % 2 ? '3/4' : '1/1' }} />
            ))}
          </div>
        ) : items.length ? (
          <GenerationGrid items={items} onRetry={retry} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  const steps = [
    { icon: Sparkles, title: 'Describe it', body: 'Write a prompt. Auto picks the right engine, and the cost is on the button before you click.' },
    { icon: ImageIcon, title: 'Pick the best frame', body: 'Generate up to four takes. Every result keeps its recipe, so you can remix one thing at a time.' },
    { icon: Clapperboard, title: 'Move the camera', body: 'Hit Animate on any image and choose a move (dolly, orbit, crash zoom), previewed live on your frame.' },
  ];
  return (
    <div className="border-line flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
      <p className="text-accent text-xs font-semibold tracking-widest uppercase">Prompt → image → motion</p>
      <h2 className="mt-3 max-w-lg text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        One studio for stills and camera moves.
      </h2>
      <p className="text-muted mt-3 max-w-md text-sm leading-relaxed">
        You have free credits to start, no sign-up needed. Or begin from something that already works.
      </p>
      <div className="mt-10 grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="bg-panel border-line rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <span className="text-faint font-mono text-xs">0{i + 1}</span>
              <s.icon className="text-accent size-4" aria-hidden />
            </div>
            <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
            <p className="text-muted mt-1 text-xs leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
      <Link
        href="/explore"
        className="border-line-strong hover:bg-hover mt-8 flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
      >
        Browse recipes in Explore <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
