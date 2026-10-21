/**
 * Small adapters for external services, written against web-standard APIs
 * (fetch, crypto.subtle) so they run in Deno and in Node tests.
 */

import type { EmailMessage } from './emails.ts';
import type { FormsManifest } from './handler.ts';

type Fetch = typeof fetch;

/** Salted SHA-256 of the IP address, so raw IPs are never stored. */
export function createIpHasher(salt: string): (ip: string) => Promise<string> {
  const encoder = new TextEncoder();
  return async (ip: string) => {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${ip}`));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  };
}

/** Cloudflare Turnstile server-side verification. */
export function createTurnstileVerifier(
  secret: string,
  options: { expectedHostnames?: string[]; fetchImpl?: Fetch } = {},
): (token: string, ip: string | null) => Promise<boolean> {
  const doFetch = options.fetchImpl ?? fetch;
  return async (token, ip) => {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set('remoteip', ip);
    const res = await doFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Turnstile HTTP ${res.status}`);
    const data = (await res.json()) as { success?: boolean; hostname?: string };
    if (data.success !== true) return false;
    if (options.expectedHostnames?.length && data.hostname && !options.expectedHostnames.includes(data.hostname)) {
      return false;
    }
    return true;
  };
}

/** Sends email through the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendSender(
  apiKey: string,
  from: string,
  fetchImpl: Fetch = fetch,
): (message: EmailMessage) => Promise<void> {
  return async (message) => {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Resend HTTP ${res.status}`);
    }
  };
}

/**
 * Loads /api/forms-manifest.json from the live website. Cached for `ttlMs`;
 * if the site can't be reached, a cached copy up to `maxStaleMs` old is used.
 */
export function createManifestLoader(
  siteUrl: string,
  options: { ttlMs?: number; maxStaleMs?: number; fetchImpl?: Fetch; now?: () => number } = {},
): () => Promise<FormsManifest> {
  const ttl = options.ttlMs ?? 60_000;
  const maxStale = options.maxStaleMs ?? 60 * 60_000;
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const url = `${siteUrl.replace(/\/+$/, '')}/api/forms-manifest.json`;
  let cached: { at: number; manifest: FormsManifest } | null = null;

  return async () => {
    if (cached && now() - cached.at < ttl) return cached.manifest;
    try {
      const res = await doFetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
      const manifest = (await res.json()) as FormsManifest;
      if (!Array.isArray(manifest.petitions) || !Array.isArray(manifest.events)) throw new Error('Malformed manifest');
      cached = { at: now(), manifest };
      return manifest;
    } catch (error) {
      if (cached && now() - cached.at < maxStale) return cached.manifest;
      throw error;
    }
  };
}
