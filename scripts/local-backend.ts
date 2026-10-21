/**
 * Local stand-in for the Supabase `submit` Edge Function, for development and
 * testing only. It runs the exact same request handler and SQL migration
 * against an in-memory Postgres (PGlite), and prints emails to the console
 * instead of sending them.
 *
 *   npm run backend:local
 *   PUBLIC_FORMS_ENDPOINT=http://localhost:8787/submit npm run dev
 *
 * Nothing is persisted: stop the process and the data is gone.
 */

import { createServer } from 'node:http';
import type { EmailMessage } from '../supabase/functions/_shared/emails.ts';
import { createHandler } from '../supabase/functions/_shared/handler.ts';
import { createIpHasher, createManifestLoader } from '../supabase/functions/_shared/services.ts';
import { createPgliteStore, createTestDatabase } from '../tests/backend/db.ts';

const PORT = Number(process.env.PORT ?? 8787);
const SITE_URL = process.env.SITE_URL ?? 'http://localhost:4321';
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:4321,http://localhost:4322').split(',');

const db = await createTestDatabase();
const outbox: EmailMessage[] = [];

const handler = createHandler({
  store: createPgliteStore(db),
  getManifest: createManifestLoader(SITE_URL, { ttlMs: 2000 }),
  hashIp: createIpHasher('local-development-salt'),
  sendEmail: async (message) => {
    outbox.push(message);
    console.log(`\n--- email to ${message.to}: ${message.subject}\n${message.text}\n---\n`);
  },
  allowedOrigins: ALLOWED,
  siteUrl: SITE_URL,
  organizerEmail: 'organizers@example.test',
  minFillMs: Number(process.env.MIN_FILL_MS ?? 2500),
  log: (event, detail) => console.log(JSON.stringify({ event, ...detail })),
});

const TABLES = ['petition_signatures', 'volunteer_signups', 'contact_messages', 'newsletter_subscribers', 'event_rsvps'];

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Local-only inspection endpoint (does not exist in production).
  if (url.pathname === '/__local/state') {
    const state: Record<string, unknown> = { emails: outbox };
    for (const table of TABLES) state[table] = (await db.query(`select * from public.${table} order by created_at`)).rows;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(state, null, 2));
    return;
  }

  if (url.pathname !== '/submit') {
    res.writeHead(404).end();
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  headers.set('x-forwarded-for', req.socket.remoteAddress ?? '127.0.0.1');

  const response = await handler(
    new Request(url, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }),
  );
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => {
  console.log(`Local forms backend: http://localhost:${PORT}/submit (manifest from ${SITE_URL})`);
  console.log(`Inspect stored data: http://localhost:${PORT}/__local/state`);
});
