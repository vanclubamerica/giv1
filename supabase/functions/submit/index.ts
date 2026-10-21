/**
 * Supabase Edge Function: receives every public form on getinvolvedvan.com.
 *
 * Deploy:  npx supabase functions deploy submit
 * JWT verification is turned off for this function in supabase/config.toml
 * because the website calls it without a Supabase key. Abuse protection comes
 * from the origin check, Turnstile, a honeypot, a timing check and rate limits.
 */

import { createClient } from '@supabase/supabase-js';
import { createHandler } from '../_shared/handler.ts';
import { createIpHasher, createManifestLoader, createResendSender, createTurnstileVerifier } from '../_shared/services.ts';
import { createSupabaseStore } from '../_shared/store-supabase.ts';

function env(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  return value ? value : undefined;
}

function required(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

const siteUrl = env('SITE_URL') ?? 'https://getinvolvedvan.com';
const allowedOrigins = (env('ALLOWED_ORIGINS') ?? siteUrl)
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const turnstileSecret = env('TURNSTILE_SECRET_KEY');
const resendKey = env('RESEND_API_KEY');
const emailFrom = env('EMAIL_FROM');

const handler = createHandler({
  store: createSupabaseStore(client),
  getManifest: createManifestLoader(siteUrl),
  hashIp: createIpHasher(required('RATE_LIMIT_SALT')),
  verifyTurnstile: turnstileSecret
    ? createTurnstileVerifier(turnstileSecret, {
        expectedHostnames: allowedOrigins.map((o) => new URL(o).hostname),
      })
    : undefined,
  sendEmail: resendKey && emailFrom ? createResendSender(resendKey, emailFrom) : undefined,
  allowedOrigins,
  siteUrl,
  organizerEmail: env('ORGANIZER_EMAIL'),
  // Logs event names and form types only, never names, emails or message bodies.
  log: (event, detail) => console.log(JSON.stringify({ event, ...detail })),
});

Deno.serve(handler);
