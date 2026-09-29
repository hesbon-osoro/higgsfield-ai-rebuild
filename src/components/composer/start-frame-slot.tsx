'use client';

import clsx from 'clsx';
import { ImagePlus, Library, Loader2, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useGenerations, useUploadFrame } from '@/lib/api';
import { useToast } from '../toast';
import type { Composer } from './use-composer';

// Downscale on the client before upload: keeps requests small and the DB lean.
async function toDataUrl(file: File, maxSide = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

export function StartFrameSlot({ c }: { c: Composer }) {
  const frame = c.s.startFrame;
  const upload = useUploadFrame();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const library = useGenerations({ kind: 'IMAGE' }, 24);
  const images = library.data?.items.filter((g) => g.status === 'SUCCEEDED' && g.output) ?? [];

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Choose an image file', 'error');
    try {
      const asset = await upload.mutateAsync(await toDataUrl(file));
      c.setStartFrame(asset);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error');
    }
  };

  if (frame) {
    return (
      <div className="border-line relative flex items-center gap-3 rounded-xl border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frame.url} alt="Start frame" className="size-16 rounded-lg object-cover" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Start frame set</p>
          <p className="text-faint text-xs">
            {frame.width}×{frame.height} · the camera moves through this image
          </p>
        </div>
        <button
          type="button"
          onClick={() => c.setStartFrame(null)}
          className="hover:bg-hover text-muted grid size-8 place-items-center rounded-full"
          aria-label="Remove start frame"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={clsx(
          'flex flex-col gap-2 rounded-xl border border-dashed p-3 transition-colors',
          dragging ? 'border-accent bg-accent/5' : 'border-line-strong',
        )}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
            className="border-line bg-ink hover:bg-hover flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload
          </button>
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            aria-expanded={picking}
            className={clsx(
              'border-line bg-ink hover:bg-hover flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm',
              picking && 'bg-raised',
            )}
          >
            <Library className="size-4" /> From library
          </button>
        </div>
        <p className="text-faint flex items-center justify-center gap-1.5 text-center text-xs">
          <ImagePlus className="size-3.5" /> Drop an image here, or skip it to generate a keyframe from your prompt
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {picking && (
        <div className="border-line bg-ink animate-fade-in mt-2 rounded-xl border p-2">
          {images.length ? (
            <div className="scrollbar-thin grid max-h-52 grid-cols-4 gap-1.5 overflow-y-auto">
              {images.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    c.setStartFrame({ ...g.output!, fromGenerationId: g.id });
                    c.set('parentId', g.id);
                    setPicking(false);
                  }}
                  className="hover:ring-accent overflow-hidden rounded-md hover:ring-2"
                  title={g.prompt}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.output!.url} alt={g.prompt} className="aspect-square w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted p-3 text-center text-xs">
              No images yet. Generate one in Image mode, or upload.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
