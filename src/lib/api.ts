'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AspectId, Duration, EngineId, Kind } from './catalog';

export type Status = 'PROCESSING' | 'SUCCEEDED' | 'FAILED';

export interface Asset {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface Generation {
  id: string;
  batchId: string;
  kind: Kind;
  status: Status;
  prompt: string;
  engine: EngineId | 'frame';
  engineName: string;
  engineWasAuto: boolean;
  aspect: AspectId;
  seed: number;
  motionPreset: string | null;
  durationSec: Duration | null;
  startFrame: Asset | null;
  output: Asset | null;
  parentId: string | null;
  cost: number;
  queuePosition: number | null;
  etaSec: number | null;
  error: string | null;
  favorite: boolean;
  published: boolean;
  isMine: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface Viewer {
  id: string;
  credits: number;
  isGuest: boolean;
}

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  note: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface GenerateInput {
  kind: Kind;
  prompt: string;
  engine: EngineId | null;
  aspect: AspectId;
  count?: number;
  motionPreset?: string | null;
  durationSec?: Duration | null;
  startFrameAssetId?: string | null;
  parentId?: string | null;
  seed?: number | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    credentials: 'same-origin',
  });
  const body = await res.json().catch(() => null);
  if (!body) throw new ApiError(`Network error (${res.status})`);
  if (body.errors?.length) {
    const e = body.errors[0];
    throw new ApiError(e.message, e.extensions?.code);
  }
  return body.data as T;
}

const ASSET = 'id url width height';
const GENERATION = `
  id batchId kind status prompt engine engineName engineWasAuto aspect seed
  motionPreset durationSec parentId cost queuePosition etaSec error favorite published isMine
  createdAt completedAt
  startFrame { ${ASSET} }
  output { ${ASSET} }
`;

export interface ListFilters {
  kind?: Kind | null;
  favoritesOnly?: boolean;
  search?: string;
}

const keys = {
  viewer: ['viewer'] as const,
  generations: (f: ListFilters = {}) => ['generations', f] as const,
  explore: (f: ListFilters = {}) => ['explore', f] as const,
  generation: (id: string) => ['generation', id] as const,
  ledger: ['ledger'] as const,
};

export function useViewer() {
  return useQuery({
    queryKey: keys.viewer,
    queryFn: () => gql<{ viewer: Viewer }>(`{ viewer { id credits isGuest } }`).then((d) => d.viewer),
  });
}

const hasProcessing = (items?: Generation[]) => items?.some((g) => g.status === 'PROCESSING');

// Lists poll while anything in them is still processing; the server advances
// provider jobs on each read, so polling is what moves work forward.
export function useGenerations(filters: ListFilters = {}, limit = 40) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.generations(filters),
    queryFn: async () => {
      const d = await gql<{ generations: { items: Generation[]; nextCursor: string | null } }>(
        `query($kind: Kind, $fav: Boolean, $search: String, $limit: Int) {
          generations(kind: $kind, favoritesOnly: $fav, search: $search, limit: $limit) { items { ${GENERATION} } nextCursor }
        }`,
        { kind: filters.kind ?? null, fav: filters.favoritesOnly ?? null, search: filters.search || null, limit },
      );
      // A failed job refunds credits, so keep the balance in step.
      if (d.generations.items.some((g) => g.status !== 'PROCESSING')) qc.invalidateQueries({ queryKey: keys.viewer });
      return d.generations;
    },
    refetchInterval: (q) => (hasProcessing(q.state.data?.items) ? 3000 : false),
  });
}

export function useExplore(filters: ListFilters = {}) {
  return useQuery({
    queryKey: keys.explore(filters),
    queryFn: () =>
      gql<{ explore: { items: Generation[]; nextCursor: string | null } }>(
        `query($kind: Kind, $search: String) { explore(kind: $kind, search: $search, limit: 60) { items { ${GENERATION} } nextCursor } }`,
        { kind: filters.kind ?? null, search: filters.search || null },
      ).then((d) => d.explore),
  });
}

export function useGeneration(id: string | null) {
  return useQuery({
    queryKey: keys.generation(id ?? ''),
    enabled: Boolean(id),
    queryFn: () =>
      gql<{ generation: Generation | null }>(`query($id: ID!) { generation(id: $id) { ${GENERATION} } }`, { id }).then(
        (d) => d.generation,
      ),
  });
}

export function useLedger() {
  return useQuery({
    queryKey: keys.ledger,
    queryFn: () =>
      gql<{ ledger: LedgerEntry[] }>(`{ ledger(limit: 100) { id delta reason note balanceAfter createdAt } }`).then(
        (d) => d.ledger,
      ),
  });
}

function refreshAll(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['generations'] });
  qc.invalidateQueries({ queryKey: ['explore'] });
  qc.invalidateQueries({ queryKey: ['generation'] });
  qc.invalidateQueries({ queryKey: keys.viewer });
  qc.invalidateQueries({ queryKey: keys.ledger });
}

export function useGenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateInput) =>
      gql<{ generate: { generations: Generation[]; viewer: Viewer } }>(
        `mutation($input: GenerateInput!) { generate(input: $input) { generations { ${GENERATION} } viewer { id credits isGuest } } }`,
        { input },
      ).then((d) => d.generate),
    onSuccess: (data) => {
      qc.setQueryData(keys.viewer, data.viewer);
      refreshAll(qc);
    },
  });
}

export function useGenerationActions() {
  const qc = useQueryClient();
  const done = () => refreshAll(qc);
  const favorite = useMutation({
    mutationFn: (v: { id: string; favorite: boolean }) =>
      gql(`mutation($id: ID!, $f: Boolean!) { setFavorite(id: $id, favorite: $f) { id favorite } }`, { id: v.id, f: v.favorite }),
    onSuccess: done,
  });
  const publish = useMutation({
    mutationFn: (v: { id: string; published: boolean }) =>
      gql(`mutation($id: ID!, $p: Boolean!) { setPublished(id: $id, published: $p) { id published } }`, {
        id: v.id,
        p: v.published,
      }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (id: string) => gql(`mutation($id: ID!) { deleteGeneration(id: $id) }`, { id }),
    onSuccess: done,
  });
  return { favorite, publish, remove };
}

export function useTopUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pack: string) =>
      gql<{ topUp: Viewer }>(`mutation($pack: String!) { topUp(pack: $pack) { id credits isGuest } }`, { pack }).then(
        (d) => d.topUp,
      ),
    onSuccess: (viewer) => {
      qc.setQueryData(keys.viewer, viewer);
      qc.invalidateQueries({ queryKey: keys.ledger });
    },
  });
}

export function useUploadFrame() {
  return useMutation({
    mutationFn: (dataUrl: string) =>
      gql<{ uploadStartFrame: Asset }>(`mutation($d: String!) { uploadStartFrame(dataUrl: $d) { ${ASSET} } }`, {
        d: dataUrl,
      }).then((d) => d.uploadStartFrame),
  });
}
