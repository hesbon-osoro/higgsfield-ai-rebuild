import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Serverless-friendly: small pool, and no prepared statements so it works
  // behind poolers such as Neon's or PgBouncer.
  return postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
}

const pg = globalForDb.pg ?? client();
if (process.env.NODE_ENV !== 'production') globalForDb.pg = pg;

export const db = drizzle(pg, { schema });
export { schema };
