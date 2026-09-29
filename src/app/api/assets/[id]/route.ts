import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Assets are content-addressed by an unguessable id and never change, so
// they can be cached forever by the browser and CDN.
export async function GET(_req: Request, ctx: RouteContext<'/api/assets/[id]'>) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  const [asset] = await db
    .select({ mime: schema.assets.mime, bytes: schema.assets.bytes })
    .from(schema.assets)
    .where(eq(schema.assets.id, id));
  if (!asset) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      'Content-Type': asset.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(asset.bytes.length),
    },
  });
}
