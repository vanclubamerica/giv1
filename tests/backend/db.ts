/**
 * Test helpers: boots an in-memory Postgres (PGlite), recreates the Supabase
 * roles the migration expects, applies the real migration, and exposes a
 * SubmissionStore backed by the same gi_* SQL functions production uses.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { InsertOutcome, NewsletterRequestOutcome, SubmissionStore } from '../../supabase/functions/_shared/handler.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');

export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite();
  // Supabase's built-in roles.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return db;
}

/** Runs `fn` with the session role switched, always resetting afterwards. */
export async function asRole<T>(db: PGlite, role: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

export function createPgliteStore(db: PGlite): SubmissionStore {
  async function one<T>(sql: string, params: unknown[]): Promise<T> {
    return asRole(db, 'service_role', async () => {
      const res = await db.query<{ result: T }>(sql, params);
      return res.rows[0]!.result;
    });
  }

  return {
    rateLimitHit: (ipHash, form, windowSeconds) =>
      one<number>('select public.gi_rate_limit_hit($1, $2, $3) as result', [ipHash, form, windowSeconds]),
    signPetition: (r) =>
      one<InsertOutcome>('select public.gi_sign_petition($1, $2, $3, $4, $5, $6) as result', [
        r.slug,
        r.fullName,
        r.email,
        r.zip,
        r.newsletterOptIn,
        r.consentVersion,
      ]),
    petitionCounts: (slugs) =>
      asRole(db, 'service_role', async () => {
        const res = await db.query<{ petition_slug: string; signatures: number }>(
          'select * from public.gi_petition_counts($1::text[])',
          [slugs],
        );
        return Object.fromEntries(res.rows.map((r) => [r.petition_slug, Number(r.signatures)]));
      }),
    addVolunteer: async (r) => {
      await one('select public.gi_add_volunteer($1, $2, $3, $4::text[], $5::text[], $6, $7) as result', [
        r.fullName,
        r.email,
        r.phone,
        r.interests,
        r.availability,
        r.comments,
        r.consentVersion,
      ]);
    },
    addContactMessage: async (r) => {
      await one('select public.gi_add_contact_message($1, $2, $3, $4) as result', [r.name, r.email, r.subject, r.message]);
    },
    addRsvp: (r) =>
      one<InsertOutcome>('select public.gi_add_rsvp($1, $2, $3, $4) as result', [r.slug, r.fullName, r.email, r.partySize]),
    newsletterRequest: (email, source, consentVersion) =>
      asRole(db, 'service_role', async () => {
        const res = await db.query<NewsletterRequestOutcome>('select * from public.gi_newsletter_request($1, $2, $3)', [
          email,
          source,
          consentVersion,
        ]);
        return res.rows[0]!;
      }),
    newsletterSendFailed: async (token) => {
      await one('select public.gi_newsletter_send_failed($1::uuid)::text as result', [token]);
    },
    newsletterConfirm: (token) => one('select public.gi_newsletter_confirm($1::uuid) as result', [token]),
    newsletterUnsubscribe: (token) => one('select public.gi_newsletter_unsubscribe($1::uuid) as result', [token]),
  };
}
