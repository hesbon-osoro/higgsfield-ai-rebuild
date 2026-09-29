'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ASPECTS,
  quoteCost,
  resolveAutoEngine,
  type AspectId,
  type Duration,
  type EngineId,
  type Kind,
} from '@/lib/catalog';
import type { Asset, GenerateInput, Generation } from '@/lib/api';

export interface StartFrame extends Asset {
  fromGenerationId?: string;
}

export interface ComposerState {
  mode: Kind;
  prompt: string;
  engine: EngineId | 'auto';
  aspect: AspectId;
  count: number;
  preset: string;
  duration: Duration;
  startFrame: StartFrame | null;
  seed: number | null;
  parentId: string | null;
}

const INITIAL: ComposerState = {
  mode: 'IMAGE',
  prompt: '',
  engine: 'auto',
  aspect: '3:4',
  count: 2,
  preset: 'dolly-in',
  duration: 5,
  startFrame: null,
  seed: null,
  parentId: null,
};

export function nearestAspect(width?: number | null, height?: number | null): AspectId | null {
  if (!width || !height) return null;
  const r = width / height;
  return ASPECTS.reduce((best, a) =>
    Math.abs(Math.log(a.width / a.height / r)) < Math.abs(Math.log(best.width / best.height / r)) ? a : best,
  ).id;
}

export function useComposer() {
  const [s, setS] = useState<ComposerState>(INITIAL);
  const set = useCallback(<K extends keyof ComposerState>(key: K, value: ComposerState[K]) => {
    setS((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resolvedEngine: EngineId = s.engine === 'auto' ? resolveAutoEngine(s.prompt, s.mode) : s.engine;

  const cost = useMemo(
    () =>
      quoteCost({
        kind: s.mode,
        engine: resolvedEngine,
        count: s.count,
        duration: s.duration,
        hasStartFrame: Boolean(s.startFrame),
      }),
    [s.mode, resolvedEngine, s.count, s.duration, s.startFrame],
  );

  const setStartFrame = useCallback((frame: StartFrame | null) => {
    setS((prev) => ({
      ...prev,
      startFrame: frame,
      aspect: nearestAspect(frame?.width, frame?.height) ?? prev.aspect,
    }));
  }, []);

  // Animate: an image becomes the start frame of a new video.
  const loadAnimate = useCallback((g: Generation) => {
    if (!g.output) return;
    setS((prev) => ({
      ...prev,
      mode: 'VIDEO',
      prompt: g.prompt,
      startFrame: { ...g.output!, fromGenerationId: g.id },
      aspect: g.aspect,
      parentId: g.id,
      seed: null,
    }));
  }, []);

  // Remix: load the full recipe, seed included, so one tweak changes one thing.
  const loadRecipe = useCallback((g: Generation) => {
    setS((prev) => ({
      ...prev,
      mode: g.kind,
      prompt: g.prompt,
      engine: g.engineWasAuto || g.engine === 'frame' ? 'auto' : g.engine,
      aspect: g.aspect,
      count: g.kind === 'IMAGE' ? 1 : prev.count,
      preset: g.motionPreset ?? prev.preset,
      duration: g.durationSec ?? prev.duration,
      startFrame: g.kind === 'VIDEO' && g.startFrame ? { ...g.startFrame, fromGenerationId: g.parentId ?? undefined } : null,
      seed: g.seed,
      parentId: g.id,
    }));
  }, []);

  const toInput = useCallback(
    (): GenerateInput => ({
      kind: s.mode,
      prompt: s.prompt.trim(),
      engine: s.engine === 'auto' ? null : s.engine,
      aspect: s.aspect,
      count: s.mode === 'IMAGE' ? s.count : 1,
      motionPreset: s.mode === 'VIDEO' ? s.preset : null,
      durationSec: s.mode === 'VIDEO' ? s.duration : null,
      startFrameAssetId: s.mode === 'VIDEO' ? (s.startFrame?.id ?? null) : null,
      parentId: s.parentId,
      seed: s.seed,
    }),
    [s],
  );

  const canSubmit = s.mode === 'IMAGE' ? Boolean(s.prompt.trim()) : Boolean(s.prompt.trim() || s.startFrame);

  return { s, set, setStartFrame, resolvedEngine, cost, loadAnimate, loadRecipe, toInput, canSubmit };
}

export type Composer = ReturnType<typeof useComposer>;
