/**
 * Production implementation of SubmissionStore. Every operation is a call to
 * one of the gi_* SQL functions defined in supabase/migrations, which only the
 * service role may execute.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { InsertOutcome, NewsletterRequestOutcome, SubmissionStore } from './handler.ts';

export function createSupabaseStore(client: SupabaseClient): SubmissionStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args);
    // Log only the code and message: PostgREST "details" can echo row values.
    if (error) throw new Error(`${fn} failed: ${error.code ?? 'unknown'} ${error.message}`);
    return data as T;
  }

  return {
    rateLimitHit: (ipHash, form, windowSeconds) =>
      rpc<number>('gi_rate_limit_hit', { p_ip_hash: ipHash, p_form: form, p_window_seconds: windowSeconds }),

    signPetition: (row) =>
      rpc<InsertOutcome>('gi_sign_petition', {
        p_slug: row.slug,
        p_full_name: row.fullName,
        p_email: row.email,
        p_zip: row.zip,
        p_newsletter_opt_in: row.newsletterOptIn,
        p_consent_version: row.consentVersion,
      }),

    petitionCounts: async (slugs) => {
      const rows = await rpc<Array<{ petition_slug: string; signatures: number | string }>>('gi_petition_counts', {
        p_slugs: slugs,
      });
      return Object.fromEntries(rows.map((r) => [r.petition_slug, Number(r.signatures)]));
    },

    addVolunteer: async (row) => {
      await rpc('gi_add_volunteer', {
        p_full_name: row.fullName,
        p_email: row.email,
        p_phone: row.phone,
        p_interests: row.interests,
        p_availability: row.availability,
        p_comments: row.comments,
        p_consent_version: row.consentVersion,
      });
    },

    addContactMessage: async (row) => {
      await rpc('gi_add_contact_message', {
        p_name: row.name,
        p_email: row.email,
        p_subject: row.subject,
        p_message: row.message,
      });
    },

    addRsvp: (row) =>
      rpc<InsertOutcome>('gi_add_rsvp', {
        p_slug: row.slug,
        p_full_name: row.fullName,
        p_email: row.email,
        p_party_size: row.partySize,
      }),

    newsletterRequest: async (email, source, consentVersion) => {
      const rows = await rpc<NewsletterRequestOutcome[]>('gi_newsletter_request', {
        p_email: email,
        p_source: source,
        p_consent_version: consentVersion,
      });
      const row = rows[0];
      if (!row) throw new Error('gi_newsletter_request returned no row');
      return { action: row.action, token: row.token };
    },

    newsletterSendFailed: async (token) => {
      await rpc('gi_newsletter_send_failed', { p_token: token });
    },

    newsletterConfirm: (token) => rpc('gi_newsletter_confirm', { p_token: token }),

    newsletterUnsubscribe: (token) => rpc('gi_newsletter_unsubscribe', { p_token: token }),
  };
}
