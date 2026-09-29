import { desc, eq, sql } from 'drizzle-orm';
import { TOP_UP_PACKS } from '@/lib/catalog';
import { db, schema } from '../db';
import { UserError } from './generations';
import { imageSize } from '../image-size';

export async function ledger(userId: string, limit = 50) {
  return db
    .select()
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.userId, userId))
    .orderBy(desc(schema.creditLedger.createdAt))
    .limit(Math.min(limit, 200));
}

// Demo top-up: no payment is taken. Stands in for a checkout webhook, which
// would call this same function once payment is confirmed.
export async function topUp(userId: string, packId: string) {
  const pack = TOP_UP_PACKS.find((p) => p.id === packId);
  if (!pack) throw new UserError('Unknown credit pack', 'BAD_INPUT');
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.users)
      .set({ credits: sql`${schema.users.credits} + ${pack.credits}` })
      .where(eq(schema.users.id, userId))
      .returning();
    await tx.insert(schema.creditLedger).values({
      userId,
      delta: pack.credits,
      reason: 'top_up',
      note: `${pack.label} pack (demo, no charge)`,
      balanceAfter: row.credits,
    });
    return row;
  });
}

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function uploadStartFrame(userId: string, dataUrl: string) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!m || !ALLOWED.has(m[1])) throw new UserError('Upload a JPEG, PNG or WebP image', 'BAD_INPUT');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UserError('That image is too large (max 4 MB)', 'BAD_INPUT');
  const size = imageSize(bytes);
  if (!size) throw new UserError('That file does not look like a valid image', 'BAD_INPUT');
  const [asset] = await db
    .insert(schema.assets)
    .values({ userId, mime: m[1], bytes, width: size.width, height: size.height, source: 'upload' })
    .returning({ id: schema.assets.id, width: schema.assets.width, height: schema.assets.height });
  return asset;
}
