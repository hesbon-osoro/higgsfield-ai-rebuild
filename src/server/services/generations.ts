import { randomInt, randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { GraphQLError } from 'graphql';
import { z } from 'zod';
import {
  ASPECT_BY_ID,
  DURATIONS,
  ENGINE_BY_ID,
  MAX_IMAGES_PER_BATCH,
  MAX_PROMPT_LENGTH,
  PRESET_BY_ID,
  quoteCost,
  resolveAutoEngine,
  type AspectId,
  type Duration,
  type EngineId,
  type Kind,
} from '@/lib/catalog';
import { db, schema } from '../db';
import type { Generation, User } from '../db/schema';
import { imageProvider } from '../providers';
import { imageSize } from '../image-size';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// A job that has been PROCESSING this long is assumed lost (e.g. the
// serverless instance died) and is failed and refunded on the next read.
const STALE_AFTER_MS = 20 * 60 * 1000;

export class UserError extends GraphQLError {
  constructor(message: string, code: string) {
    super(message, { extensions: { code } });
  }
}

const generateInput = z
  .object({
    kind: z.enum(['IMAGE', 'VIDEO']),
    prompt: z.string().trim().max(MAX_PROMPT_LENGTH, `Keep the prompt under ${MAX_PROMPT_LENGTH} characters`),
    engine: z
      .enum(['photo', 'cinema', 'illustration', 'draft'])
      .nullish(),
    aspect: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']),
    count: z.number().int().min(1).max(MAX_IMAGES_PER_BATCH).nullish(),
    motionPreset: z.string().nullish(),
    durationSec: z.number().int().nullish(),
    startFrameAssetId: z.string().uuid().nullish(),
    parentId: z.string().uuid().nullish(),
    seed: z.number().int().min(0).max(2_147_483_647).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'IMAGE' && !v.prompt) ctx.addIssue({ code: 'custom', message: 'Describe what you want to see' });
    if (v.kind === 'VIDEO') {
      if (!v.startFrameAssetId && !v.prompt) {
        ctx.addIssue({ code: 'custom', message: 'Add a start frame or describe the shot' });
      }
      if (!v.motionPreset || !PRESET_BY_ID[v.motionPreset]) {
        ctx.addIssue({ code: 'custom', message: 'Pick a camera motion' });
      }
      if (v.durationSec != null && !DURATIONS.includes(v.durationSec as Duration)) {
        ctx.addIssue({ code: 'custom', message: 'Duration must be 5 or 10 seconds' });
      }
    }
  });

export type GenerateInput = z.input<typeof generateInput>;

async function assetUsableBy(userId: string, assetId: string) {
  const [asset] = await db
    .select({ id: schema.assets.id, userId: schema.assets.userId })
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId));
  if (!asset) return false;
  if (asset.userId === userId) return true;
  // Frames from published (Explore) generations can be reused by anyone.
  const [pub] = await db
    .select({ id: schema.generations.id })
    .from(schema.generations)
    .where(and(eq(schema.generations.outputAssetId, assetId), isNotNull(schema.generations.publishedAt)))
    .limit(1);
  return Boolean(pub);
}

async function applyCredits(
  tx: Tx,
  userId: string,
  delta: number,
  reason: string,
  note: string,
  batchId: string | null,
) {
  const [row] = await tx
    .update(schema.users)
    .set({ credits: sql`${schema.users.credits} + ${delta}` })
    .where(and(eq(schema.users.id, userId), delta < 0 ? sql`${schema.users.credits} >= ${-delta}` : sql`true`))
    .returning({ credits: schema.users.credits });
  if (!row) return null;
  await tx.insert(schema.creditLedger).values({ userId, delta, reason, note, batchId, balanceAfter: row.credits });
  return row.credits;
}

export async function createGenerations(user: User, raw: GenerateInput) {
  const parsed = generateInput.safeParse(raw);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message, 'BAD_INPUT');
  const input = parsed.data;
  const kind = input.kind as Kind;

  if (input.startFrameAssetId && !(await assetUsableBy(user.id, input.startFrameAssetId))) {
    throw new UserError('That start frame is no longer available', 'NOT_FOUND');
  }

  const engineWasAuto = !input.engine;
  const engine: EngineId = input.engine ?? resolveAutoEngine(input.prompt, kind);
  const count = kind === 'IMAGE' ? (input.count ?? 1) : 1;
  const duration = (input.durationSec ?? 5) as Duration;
  const hasStartFrame = Boolean(input.startFrameAssetId);
  const total = quoteCost({ kind, engine, count, duration, hasStartFrame });
  const perItem = total / count;
  const batchId = randomUUID();
  const baseSeed = input.seed ?? randomInt(1, 2_000_000_000);
  // A video from an existing frame needs no model call: the camera move is
  // rendered from the frame, so it is done as soon as it is paid for.
  const instant = kind === 'VIDEO' && hasStartFrame;

  const rows = await db.transaction(async (tx) => {
    const label = kind === 'IMAGE' ? `${count} × ${ENGINE_BY_ID[engine].name} image` : `${duration}s video`;
    const balance = await applyCredits(tx, user.id, -total, 'generation', label, batchId);
    if (balance === null) {
      throw new UserError(`This needs ${total} credits. Top up to keep creating.`, 'INSUFFICIENT_CREDITS');
    }
    return tx
      .insert(schema.generations)
      .values(
        Array.from({ length: count }, (_, i) => ({
          userId: user.id,
          batchId,
          kind,
          status: instant ? ('SUCCEEDED' as const) : ('PROCESSING' as const),
          prompt: input.prompt,
          engine,
          engineWasAuto,
          aspect: input.aspect,
          seed: baseSeed + i,
          motionPreset: kind === 'VIDEO' ? input.motionPreset : null,
          durationSec: kind === 'VIDEO' ? duration : null,
          startFrameAssetId: input.startFrameAssetId ?? null,
          outputAssetId: instant ? input.startFrameAssetId : null,
          completedAt: instant ? new Date() : null,
          parentId: input.parentId ?? null,
          cost: perItem,
        })),
      )
      .returning();
  });

  return Promise.all(rows.map((g) => (g.status === 'PROCESSING' ? submitJob(g) : g)));
}

function styledPrompt(prompt: string, engine: EngineId) {
  const suffix = ENGINE_BY_ID[engine]?.styleSuffix;
  return suffix ? `${prompt}, ${suffix}` : prompt;
}

async function submitJob(g: Generation): Promise<Generation> {
  const { width, height } = ASPECT_BY_ID[g.aspect as AspectId];
  try {
    const { jobId } = await imageProvider().submit({
      prompt: styledPrompt(g.prompt, g.engine as EngineId),
      engine: g.engine as EngineId,
      width,
      height,
      seed: g.seed,
    });
    const [row] = await db
      .update(schema.generations)
      .set({ providerJobId: jobId, checkedAt: new Date() })
      .where(eq(schema.generations.id, g.id))
      .returning();
    return row;
  } catch (err) {
    await failAndRefund(g.id, err instanceof Error ? err.message : 'Could not start the generation');
    const [row] = await db.select().from(schema.generations).where(eq(schema.generations.id, g.id));
    return row;
  }
}

const CHECK_EVERY_MS = 2500;

// Advances in-flight jobs by asking the provider for their state. Called from
// the read paths the client polls, and throttled per job, so no background
// worker is needed and serverless requests stay short.
export async function refreshJobs(items: Generation[]): Promise<Generation[]> {
  const now = Date.now();
  return Promise.all(
    items.map(async (g) => {
      if (g.status !== 'PROCESSING' || !g.providerJobId) return g;
      if (g.checkedAt && now - g.checkedAt.getTime() < CHECK_EVERY_MS) return g;
      try {
        const job = await imageProvider().check(g.providerJobId);
        if (job.state === 'failed') {
          await failAndRefund(g.id, job.reason);
        } else if (job.state === 'done') {
          const size = imageSize(job.image.bytes);
          const [asset] = await db
            .insert(schema.assets)
            .values({
              userId: g.userId,
              mime: job.image.mime,
              bytes: job.image.bytes,
              width: size?.width ?? null,
              height: size?.height ?? null,
              source: 'generated',
            })
            .returning({ id: schema.assets.id });
          await db
            .update(schema.generations)
            .set({
              status: 'SUCCEEDED',
              outputAssetId: asset.id,
              // A text-to-video keyframe becomes the video's start frame.
              startFrameAssetId: g.kind === 'VIDEO' ? asset.id : g.startFrameAssetId,
              completedAt: new Date(),
              queuePosition: null,
              etaSec: null,
            })
            .where(and(eq(schema.generations.id, g.id), eq(schema.generations.status, 'PROCESSING')));
        } else {
          await db
            .update(schema.generations)
            .set({
              // 0 means a worker has picked it up; >0 is the place in line.
              queuePosition: job.state === 'processing' ? 0 : Math.max(1, job.queuePosition ?? 1),
              etaSec: job.waitSec,
              checkedAt: new Date(),
            })
            .where(eq(schema.generations.id, g.id));
        }
      } catch {
        // Provider hiccup: try again on the next poll.
        await db.update(schema.generations).set({ checkedAt: new Date() }).where(eq(schema.generations.id, g.id));
      }
      const [fresh] = await db.select().from(schema.generations).where(eq(schema.generations.id, g.id));
      return fresh ?? g;
    }),
  );
}

// Marks a job failed and refunds it exactly once: the status guard means a
// second caller (retry, stale sweep) finds nothing to update.
export async function failAndRefund(id: string, reason: string) {
  await db.transaction(async (tx) => {
    const [g] = await tx
      .update(schema.generations)
      .set({ status: 'FAILED', error: reason.slice(0, 300), completedAt: new Date() })
      .where(and(eq(schema.generations.id, id), eq(schema.generations.status, 'PROCESSING')))
      .returning();
    if (!g) return;
    await applyCredits(tx, g.userId, g.cost, 'refund', 'Refund: generation failed', g.batchId);
  });
}

export async function sweepStale(userId: string) {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await db
    .select({ id: schema.generations.id })
    .from(schema.generations)
    .where(
      and(
        eq(schema.generations.userId, userId),
        eq(schema.generations.status, 'PROCESSING'),
        lt(schema.generations.createdAt, cutoff),
      ),
    );
  for (const s of stale) await failAndRefund(s.id, 'Timed out waiting for a model worker');
}

export interface ListOptions {
  kind?: Kind | null;
  favoritesOnly?: boolean | null;
  search?: string | null;
  cursor?: string | null;
  limit?: number | null;
}

function pageLimit(limit?: number | null) {
  return Math.min(Math.max(limit ?? 30, 1), 60);
}

export async function listForUser(userId: string, opts: ListOptions) {
  await sweepStale(userId);
  const limit = pageLimit(opts.limit);
  const where = [eq(schema.generations.userId, userId)];
  if (opts.kind) where.push(eq(schema.generations.kind, opts.kind));
  if (opts.favoritesOnly) where.push(eq(schema.generations.favorite, true));
  if (opts.search?.trim()) where.push(ilike(schema.generations.prompt, `%${opts.search.trim()}%`));
  if (opts.cursor) where.push(lt(schema.generations.createdAt, new Date(opts.cursor)));
  const items = await db
    .select()
    .from(schema.generations)
    .where(and(...where))
    .orderBy(desc(schema.generations.createdAt), desc(schema.generations.seed))
    .limit(limit + 1);
  const result = page(items, limit, (g) => g.createdAt);
  return { ...result, items: await refreshJobs(result.items) };
}

export async function listExplore(opts: ListOptions) {
  const limit = pageLimit(opts.limit);
  const where = [isNotNull(schema.generations.publishedAt), eq(schema.generations.status, 'SUCCEEDED')];
  if (opts.kind) where.push(eq(schema.generations.kind, opts.kind));
  if (opts.search?.trim()) where.push(ilike(schema.generations.prompt, `%${opts.search.trim()}%`));
  if (opts.cursor) where.push(lt(schema.generations.publishedAt, new Date(opts.cursor)));
  const items = await db
    .select()
    .from(schema.generations)
    .where(and(...where))
    .orderBy(desc(schema.generations.publishedAt))
    .limit(limit + 1);
  return page(items, limit, (g) => g.publishedAt!);
}

function page(items: Generation[], limit: number, key: (g: Generation) => Date) {
  const hasMore = items.length > limit;
  const slice = hasMore ? items.slice(0, limit) : items;
  return { items: slice, nextCursor: hasMore ? key(slice[slice.length - 1]).toISOString() : null };
}

export async function getVisible(userId: string, id: string) {
  const [g] = await db.select().from(schema.generations).where(eq(schema.generations.id, id));
  if (!g) return null;
  if (g.userId !== userId && !g.publishedAt) return null;
  return g.userId === userId ? (await refreshJobs([g]))[0] : g;
}

async function getOwned(userId: string, id: string) {
  const [g] = await db
    .select()
    .from(schema.generations)
    .where(and(eq(schema.generations.id, id), eq(schema.generations.userId, userId)));
  if (!g) throw new UserError('Generation not found', 'NOT_FOUND');
  return g;
}

export async function setFavorite(userId: string, id: string, favorite: boolean) {
  await getOwned(userId, id);
  const [g] = await db.update(schema.generations).set({ favorite }).where(eq(schema.generations.id, id)).returning();
  return g;
}

export async function setPublished(userId: string, id: string, published: boolean) {
  const g = await getOwned(userId, id);
  if (published && g.status !== 'SUCCEEDED') throw new UserError('Only finished generations can be shared', 'BAD_INPUT');
  const [row] = await db
    .update(schema.generations)
    .set({ publishedAt: published ? (g.publishedAt ?? new Date()) : null })
    .where(eq(schema.generations.id, id))
    .returning();
  return row;
}

export async function deleteGeneration(userId: string, id: string) {
  const g = await getOwned(userId, id);
  if (g.status === 'PROCESSING') throw new UserError('Wait for it to finish before deleting', 'BAD_INPUT');
  await db.delete(schema.generations).where(eq(schema.generations.id, id));
  return true;
}

export async function loadAssets(ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; width: number | null; height: number | null }>();
  const rows = await db
    .select({ id: schema.assets.id, width: schema.assets.width, height: schema.assets.height })
    .from(schema.assets)
    .where(inArray(schema.assets.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}
