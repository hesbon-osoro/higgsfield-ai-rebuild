import { createSchema } from 'graphql-yoga';
import { ENGINE_BY_ID, type EngineId } from '@/lib/catalog';
import type { Generation, User } from '../db/schema';
import * as credits from '../services/credits';
import * as gens from '../services/generations';
import { findUser } from '../session';

export interface Context {
  viewer: User;
  loadAsset: (id: string) => Promise<AssetRow | null>;
}

type AssetRow = { id: string; width: number | null; height: number | null };

// Per-request batching: every asset field resolved in the same tick becomes
// one query instead of one per generation.
export function assetLoader() {
  let pending: { id: string; resolve: (a: AssetRow | null) => void; reject: (e: unknown) => void }[] = [];
  return (id: string) =>
    new Promise<AssetRow | null>((resolve, reject) => {
      if (!pending.length) {
        queueMicrotask(async () => {
          const batch = pending;
          pending = [];
          try {
            const map = await gens.loadAssets([...new Set(batch.map((b) => b.id))]);
            for (const b of batch) b.resolve(map.get(b.id) ?? null);
          } catch (err) {
            for (const b of batch) b.reject(err);
          }
        });
      }
      pending.push({ id, resolve, reject });
    });
}

const typeDefs = /* GraphQL */ `
  enum Kind {
    IMAGE
    VIDEO
  }

  enum Status {
    PROCESSING
    SUCCEEDED
    FAILED
  }

  type Viewer {
    id: ID!
    credits: Int!
    isGuest: Boolean!
  }

  type Asset {
    id: ID!
    url: String!
    width: Int
    height: Int
  }

  type Generation {
    id: ID!
    batchId: ID!
    kind: Kind!
    status: Status!
    prompt: String!
    engine: String!
    engineName: String!
    engineWasAuto: Boolean!
    aspect: String!
    seed: Int!
    motionPreset: String
    durationSec: Int
    startFrame: Asset
    output: Asset
    parentId: ID
    cost: Int!
    "Position in the model provider's queue while PROCESSING."
    queuePosition: Int
    "Provider's estimated seconds until done while PROCESSING."
    etaSec: Int
    error: String
    favorite: Boolean!
    published: Boolean!
    isMine: Boolean!
    createdAt: String!
    completedAt: String
  }

  type GenerationPage {
    items: [Generation!]!
    nextCursor: String
  }

  type LedgerEntry {
    id: ID!
    delta: Int!
    reason: String!
    note: String
    balanceAfter: Int!
    createdAt: String!
  }

  input GenerateInput {
    kind: Kind!
    prompt: String!
    "Omit for Auto: the engine is picked from the prompt."
    engine: String
    aspect: String!
    count: Int
    motionPreset: String
    durationSec: Int
    startFrameAssetId: ID
    parentId: ID
    seed: Int
  }

  type GeneratePayload {
    generations: [Generation!]!
    viewer: Viewer!
  }

  type Query {
    viewer: Viewer!
    generations(kind: Kind, favoritesOnly: Boolean, search: String, cursor: String, limit: Int): GenerationPage!
    "Generations by id that the viewer can see (their own, or published). Used to poll jobs."
    generationsByIds(ids: [ID!]!): [Generation!]!
    generation(id: ID!): Generation
    explore(kind: Kind, search: String, cursor: String, limit: Int): GenerationPage!
    ledger(limit: Int): [LedgerEntry!]!
  }

  type Mutation {
    generate(input: GenerateInput!): GeneratePayload!
    setFavorite(id: ID!, favorite: Boolean!): Generation!
    setPublished(id: ID!, published: Boolean!): Generation!
    deleteGeneration(id: ID!): Boolean!
    uploadStartFrame(dataUrl: String!): Asset!
    topUp(pack: String!): Viewer!
  }
`;

const assetUrl = (id: string) => `/api/assets/${id}`;

async function assetOf(ctx: Context, id: string | null) {
  if (!id) return null;
  const a = await ctx.loadAsset(id);
  return a ? { ...a, url: assetUrl(a.id) } : null;
}

const viewerOf = (u: User) => ({ id: u.id, credits: u.credits, isGuest: u.isGuest });

export const schema = createSchema<Context>({
  typeDefs,
  resolvers: {
    Query: {
      viewer: async (_: unknown, __: unknown, ctx: Context) => viewerOf((await findUser(ctx.viewer.id)) ?? ctx.viewer),
      generations: (_: unknown, args: gens.ListOptions, ctx: Context) => gens.listForUser(ctx.viewer.id, args),
      generationsByIds: async (_: unknown, { ids }: { ids: string[] }, ctx: Context) => {
        await gens.sweepStale(ctx.viewer.id);
        const rows = await Promise.all(ids.slice(0, 50).map((id) => gens.getVisible(ctx.viewer.id, id)));
        return rows.filter(Boolean);
      },
      generation: (_: unknown, { id }: { id: string }, ctx: Context) => gens.getVisible(ctx.viewer.id, id),
      explore: (_: unknown, args: gens.ListOptions) => gens.listExplore(args),
      ledger: (_: unknown, { limit }: { limit?: number }, ctx: Context) => credits.ledger(ctx.viewer.id, limit ?? 50),
    },
    Mutation: {
      generate: async (_: unknown, { input }: { input: gens.GenerateInput }, ctx: Context) => {
        const generations = await gens.createGenerations(ctx.viewer, input);
        const viewer = (await findUser(ctx.viewer.id))!;
        return { generations, viewer: viewerOf(viewer) };
      },
      setFavorite: (_: unknown, a: { id: string; favorite: boolean }, ctx: Context) =>
        gens.setFavorite(ctx.viewer.id, a.id, a.favorite),
      setPublished: (_: unknown, a: { id: string; published: boolean }, ctx: Context) =>
        gens.setPublished(ctx.viewer.id, a.id, a.published),
      deleteGeneration: (_: unknown, { id }: { id: string }, ctx: Context) => gens.deleteGeneration(ctx.viewer.id, id),
      uploadStartFrame: async (_: unknown, { dataUrl }: { dataUrl: string }, ctx: Context) => {
        const a = await credits.uploadStartFrame(ctx.viewer.id, dataUrl);
        return { ...a, url: assetUrl(a.id) };
      },
      topUp: async (_: unknown, { pack }: { pack: string }, ctx: Context) => viewerOf(await credits.topUp(ctx.viewer.id, pack)),
    },
    Generation: {
      engineName: (g: Generation) => (g.engine === 'frame' ? 'Your frame' : (ENGINE_BY_ID[g.engine as EngineId]?.name ?? g.engine)),
      startFrame: (g: Generation, _: unknown, ctx: Context) => assetOf(ctx, g.startFrameAssetId),
      output: (g: Generation, _: unknown, ctx: Context) => assetOf(ctx, g.outputAssetId),
      published: (g: Generation) => Boolean(g.publishedAt),
      isMine: (g: Generation, _: unknown, ctx: Context) => g.userId === ctx.viewer.id,
      createdAt: (g: Generation) => g.createdAt.toISOString(),
      completedAt: (g: Generation) => g.completedAt?.toISOString() ?? null,
    },
    LedgerEntry: {
      createdAt: (e: { createdAt: Date }) => e.createdAt.toISOString(),
    },
  },
});
