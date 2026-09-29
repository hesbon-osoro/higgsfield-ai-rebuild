import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

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
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  await sql.end();
  console.log('migrations applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
