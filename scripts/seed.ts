// Loads the curated Explore recipes from seed/ into the database. Idempotent:
// safe to run on every deploy.
//
//   npm run db:seed

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/server/db/schema';
import { ENGINE_BY_ID, quoteCost, type AspectId, type EngineId } from '../src/lib/catalog';
import { imageSize } from '../src/server/image-size';

const CURATOR_ID = '00000000-0000-4000-8000-00000000c0de';

interface Fixture {
  key: string;
  prompt: string;
  engine: EngineId;
  aspect: AspectId;
  seed: number;
  motion?: { preset: string; duration: 5 | 10 };
}

async function main() {
  // Prefer a direct (non-pooled) connection for DDL and bulk writes.
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) {
    // Preview deployments have no database configured on purpose: PR builds
    // must not migrate or seed the production database.
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
      console.log(`${process.env.VERCEL_ENV} build: no DATABASE_URL, skipping`);
      return;
    }
    throw new Error('DATABASE_URL is not set');
  }
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema });

  const dir = path.join(process.cwd(), 'seed');
  const fixturesFile = path.join(dir, 'fixtures.json');
  if (!fs.existsSync(fixturesFile)) {
    console.log('seed: no fixtures yet (run scripts/seed-generate.ts), skipping');
    await sql.end();
    return;
  }
  const fixtures: Fixture[] = JSON.parse(fs.readFileSync(fixturesFile, 'utf8'));

  await db
    .insert(schema.users)
    .values({ id: CURATOR_ID, isGuest: false, displayName: 'Parallax', credits: 0 })
    .onConflictDoNothing();

  // Newest first in Explore: spread published times so images and their
  // animated versions interleave.
  const base = Date.now() - fixtures.length * 2 * 60_000;
  let added = 0;

  for (const [i, f] of fixtures.entries()) {
    const [existing] = await db
      .select({ id: schema.generations.id })
      .from(schema.generations)
      .where(and(eq(schema.generations.userId, CURATOR_ID), eq(schema.generations.seed, f.seed), eq(schema.generations.kind, 'IMAGE')));
    if (existing) continue;

    const bytes = fs.readFileSync(path.join(dir, 'images', `${f.key}.webp`));
    const size = imageSize(bytes);
    await db.transaction(async (tx) => {
      const [asset] = await tx
        .insert(schema.assets)
        .values({ userId: CURATOR_ID, mime: 'image/webp', bytes, width: size?.width, height: size?.height, source: 'generated' })
        .returning({ id: schema.assets.id });
      const at = new Date(base + i * 2 * 60_000);
      const [img] = await tx
        .insert(schema.generations)
        .values({
          userId: CURATOR_ID,
          batchId: randomUUID(),
          kind: 'IMAGE',
          status: 'SUCCEEDED',
          prompt: f.prompt,
          engine: f.engine,
          aspect: f.aspect,
          seed: f.seed,
          outputAssetId: asset.id,
          cost: ENGINE_BY_ID[f.engine].cost,
          createdAt: at,
          completedAt: at,
          publishedAt: at,
        })
        .returning({ id: schema.generations.id });
      if (f.motion) {
        const vat = new Date(at.getTime() + 60_000);
        await tx.insert(schema.generations).values({
          userId: CURATOR_ID,
          batchId: randomUUID(),
          kind: 'VIDEO',
          status: 'SUCCEEDED',
          prompt: f.prompt,
          engine: f.engine,
          aspect: f.aspect,
          seed: f.seed,
          motionPreset: f.motion.preset,
          durationSec: f.motion.duration,
          startFrameAssetId: asset.id,
          outputAssetId: asset.id,
          parentId: img.id,
          cost: quoteCost({ kind: 'VIDEO', engine: f.engine, count: 1, duration: f.motion.duration, hasStartFrame: true }),
          createdAt: vat,
          completedAt: vat,
          publishedAt: vat,
        });
      }
    });
    added++;
  }

  await sql.end();
  console.log(`seed: ${added} new recipes (${fixtures.length} total)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
