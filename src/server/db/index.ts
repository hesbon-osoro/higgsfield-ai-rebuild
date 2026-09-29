import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { db?: Db };

function connect(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Serverless-friendly: small pool, and no prepared statements so it works
  // behind poolers such as Neon's or PgBouncer.
  const client = postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
  return drizzle(client, { schema });
}

function instance(): Db {
  globalForDb.db ??= connect();
  return globalForDb.db;
}

// Connects on first use rather than at import, so `next build` can load the
// API routes without a database (e.g. preview deployments).
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const inst = instance();
    const value = Reflect.get(inst, prop);
    return typeof value === 'function' ? value.bind(inst) : value;
  },
});

export { schema };
