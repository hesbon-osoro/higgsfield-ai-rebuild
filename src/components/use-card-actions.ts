'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ASPECT_BY_ID } from '@/lib/catalog';
import { useGenerationActions, type Generation } from '@/lib/api';
import { canExportVideo, downloadBlob, exportMotionVideo } from '@/lib/export-video';
import { useToast } from './toast';

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'parallax'
  );
}

export function useCardActions() {
  const router = useRouter();
  const toast = useToast();
  const { favorite, publish, remove } = useGenerationActions();
  const [exporting, setExporting] = useState<{ id: string; progress: number } | null>(null);

  return {
    exporting,
    animate: (g: Generation) => router.push(`/?from=${g.id}&mode=animate`),
    remix: (g: Generation) => router.push(`/?from=${g.id}&mode=remix`),
    toggleFavorite: (g: Generation) => favorite.mutate({ id: g.id, favorite: !g.favorite }),
    togglePublish: (g: Generation) =>
      publish.mutate(
        { id: g.id, published: !g.published },
        {
          onSuccess: () => toast(g.published ? 'Removed from Explore' : 'Shared to Explore', 'success'),
          onError: (e) => toast(e.message, 'error'),
        },
      ),
    remove: (g: Generation, after?: () => void) =>
      remove.mutate(g.id, {
        onSuccess: () => {
          toast('Deleted');
          after?.();
        },
        onError: (e) => toast(e.message, 'error'),
      }),
    download: async (g: Generation) => {
      if (!g.output) return;
      if (g.kind === 'IMAGE') {
        const res = await fetch(g.output.url);
        downloadBlob(await res.blob(), `${slug(g.prompt)}-${g.seed}.${res.headers.get('content-type')?.split('/')[1] ?? 'webp'}`);
        return;
      }
      if (!canExportVideo()) {
        toast('Video export is not supported in this browser', 'error');
        return;
      }
      const src = g.startFrame?.url ?? g.output.url;
      const a = ASPECT_BY_ID[g.aspect];
      setExporting({ id: g.id, progress: 0 });
      try {
        const blob = await exportMotionVideo({
          src,
          preset: g.motionPreset ?? 'static',
          durationSec: g.durationSec ?? 5,
          width: g.startFrame?.width ?? a.width,
          height: g.startFrame?.height ?? a.height,
          onProgress: (p) => setExporting({ id: g.id, progress: p }),
        });
        downloadBlob(blob, `${slug(g.prompt)}-${g.motionPreset}.webm`);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Export failed', 'error');
      } finally {
        setExporting(null);
      }
    },
  };
}

export type CardActions = ReturnType<typeof useCardActions>;
