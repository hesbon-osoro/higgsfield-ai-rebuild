import { createYoga } from 'graphql-yoga';
import { assetLoader, schema, type Context } from '@/server/graphql/schema';
import {
  SESSION_COOKIE,
  createGuest,
  decodeSession,
  findUser,
  readCookie,
  sessionCookieHeader,
} from '@/server/session';
import type { User } from '@/server/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const yoga = createYoga<{ viewer: User }, Context>({
  schema,
  graphqlEndpoint: '/api/graphql',
  graphiql: process.env.NODE_ENV !== 'production',
  fetchAPI: { Response },
  context: ({ viewer }) => ({
    viewer,
    loadAsset: assetLoader(),
  }),
});

async function handle(request: Request) {
  const userId = decodeSession(readCookie(request.headers.get('cookie'), SESSION_COOKIE));
  let viewer = await findUser(userId);
  const isNew = !viewer;
  if (!viewer) viewer = await createGuest();

  const response = await yoga.handleRequest(request, { viewer });
  if (isNew) response.headers.append('Set-Cookie', sessionCookieHeader(viewer.id));
  return response;
}

export { handle as GET, handle as POST };
