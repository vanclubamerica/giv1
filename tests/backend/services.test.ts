import { describe, expect, it } from 'vitest';
import { createIpHasher, createManifestLoader, createResendSender, createTurnstileVerifier } from '../../supabase/functions/_shared/services.ts';

const manifest = { generatedAt: 'now', petitions: [], events: [] };

describe('service adapters', () => {
  it('hashes IPs with the salt and never returns the raw IP', async () => {
    const a = await createIpHasher('salt-a')('203.0.113.7');
    const b = await createIpHasher('salt-b')('203.0.113.7');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('203');
  });

  it('caches the forms manifest and falls back to a recent copy when the site is unreachable', async () => {
    let calls = 0;
    let fail = false;
    let clock = 0;
    const fetchImpl = (async () => {
      calls++;
      if (fail) throw new Error('offline');
      return new Response(JSON.stringify(manifest));
    }) as typeof fetch;
    const load = createManifestLoader('https://getinvolvedvan.com/', { ttlMs: 1000, maxStaleMs: 5000, fetchImpl, now: () => clock });
    await load();
    await load();
    expect(calls).toBe(1);
    clock = 2000;
    fail = true;
    await expect(load()).resolves.toEqual(manifest);
    clock = 10_000;
    await expect(load()).rejects.toThrow('offline');
  });

  it('rejects a malformed manifest', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ petitions: 'nope' }))) as typeof fetch;
    await expect(createManifestLoader('https://x.test', { fetchImpl })()).rejects.toThrow('Malformed');
  });

  it('verifies Turnstile tokens, including the hostname', async () => {
    const reply = (body: object) => (async () => new Response(JSON.stringify(body))) as typeof fetch;
    const opts = { expectedHostnames: ['getinvolvedvan.com'] };
    expect(await createTurnstileVerifier('s', { ...opts, fetchImpl: reply({ success: true, hostname: 'getinvolvedvan.com' }) })('t', null)).toBe(true);
    expect(await createTurnstileVerifier('s', { ...opts, fetchImpl: reply({ success: true, hostname: 'evil.example' }) })('t', null)).toBe(false);
    expect(await createTurnstileVerifier('s', { ...opts, fetchImpl: reply({ success: false }) })('t', null)).toBe(false);
  });

  it('sends email through Resend and surfaces failures', async () => {
    let sent: { url: string; body: Record<string, unknown> } | null = null;
    const ok = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await createResendSender('key', 'GIV <updates@getinvolvedvan.com>', ok)({ to: 'a@b.co', subject: 'Hi', text: 't', html: 'h', replyTo: 'c@d.co' });
    expect(sent!.url).toBe('https://api.resend.com/emails');
    expect(sent!.body).toMatchObject({ to: ['a@b.co'], reply_to: 'c@d.co' });
    const bad = (async () => new Response('{}', { status: 422 })) as typeof fetch;
    await expect(createResendSender('key', 'from', bad)({ to: 'a@b.co', subject: 'Hi', text: 't', html: 'h' })).rejects.toThrow('422');
  });
});
