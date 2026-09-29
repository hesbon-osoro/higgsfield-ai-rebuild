import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { STARTER_CREDITS } from '@/lib/catalog';

export const SESSION_COOKIE = 'parallax_session';
const ONE_YEAR = 60 * 60 * 24 * 365;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET is not set');
  return s ?? 'dev-only-secret';
}

function sign(userId: string) {
  return createHmac('sha256', secret()).update(userId).digest('base64url');
}

export function encodeSession(userId: string) {
  return `${userId}.${sign(userId)}`;
}

export function decodeSession(value: string | undefined): string | null {
  if (!value) return null;
  const [userId, mac] = value.split('.');
  if (!userId || !mac) return null;
  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return userId;
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function sessionCookieHeader(userId: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(encodeSession(userId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ONE_YEAR}${secure}`;
}

export async function findUser(userId: string | null) {
  if (!userId) return null;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return user ?? null;
}

// A guest gets an account and starter credits on first visit: value before
// any sign-up wall.
export async function createGuest() {
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ credits: STARTER_CREDITS }).returning();
    await tx.insert(schema.creditLedger).values({
      userId: user.id,
      delta: STARTER_CREDITS,
      reason: 'starter',
      note: 'Welcome credits',
      balanceAfter: STARTER_CREDITS,
    });
    return user;
  });
}
