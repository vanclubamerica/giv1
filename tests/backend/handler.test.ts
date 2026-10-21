import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createHandler, type FormsManifest, type HandlerDeps } from '../../supabase/functions/_shared/handler.ts';
import type { EmailMessage } from '../../supabase/functions/_shared/emails.ts';
import { createIpHasher } from '../../supabase/functions/_shared/services.ts';
import { createPgliteStore, createTestDatabase } from './db.ts';

const ORIGIN = 'https://getinvolvedvan.com';
const NOW = new Date('2026-11-01T15:00:00Z');

const manifest: FormsManifest = {
  generatedAt: NOW.toISOString(),
  petitions: [
    { slug: 'open-petition', title: 'Open Petition', acceptingSignatures: true, opensAt: null, closesAt: null, zip: 'required', showSignatureCount: true },
    { slug: 'hidden-count', title: 'Hidden Count', acceptingSignatures: true, opensAt: null, closesAt: null, zip: 'off', showSignatureCount: false },
    { slug: 'future-petition', title: 'Future', acceptingSignatures: true, opensAt: '2026-12-01T06:00:00Z', closesAt: null, zip: 'optional', showSignatureCount: false },
    { slug: 'expired-petition', title: 'Expired', acceptingSignatures: true, opensAt: null, closesAt: '2026-10-01T05:00:00Z', zip: 'optional', showSignatureCount: false },
    { slug: 'closed-petition', title: 'Closed', acceptingSignatures: false, opensAt: null, closesAt: null, zip: 'optional', showSignatureCount: true },
  ],
  events: [
    { slug: 'open-event', title: 'Open Event', rsvp: true, rsvpClosesAt: '2026-11-20T00:00:00Z' },
    { slug: 'past-event', title: 'Past Event', rsvp: true, rsvpClosesAt: '2026-10-20T00:00:00Z' },
  ],
};

let db: PGlite;
let sent: EmailMessage[];
let deps: HandlerDeps;

function post(form: string, data: Record<string, unknown>, meta: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request('https://example.supabase.co/functions/v1/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '203.0.113.7', ...headers },
    body: JSON.stringify({ form, data, meta: { elapsedMs: 8000, website: '', ...meta } }),
  });
}

async function call(handler: (r: Request) => Promise<Response>, req: Request) {
  const res = await handler(req);
  return { status: res.status, body: (await res.json()) as Record<string, any>, headers: res.headers };
}

const petitionData = { slug: 'open-petition', fullName: 'Jordan Reyes', email: 'jordan@example.com', zip: '75790', consent: true };

beforeAll(async () => {
  db = await createTestDatabase();
});

beforeEach(async () => {
  await db.exec(
    'truncate public.petition_signatures, public.volunteer_signups, public.contact_messages, public.newsletter_subscribers, public.event_rsvps, public.submission_attempts',
  );
  sent = [];
  deps = {
    store: createPgliteStore(db),
    getManifest: async () => manifest,
    hashIp: createIpHasher('test-salt'),
    sendEmail: async (m) => {
      sent.push(m);
    },
    allowedOrigins: [ORIGIN],
    siteUrl: ORIGIN,
    organizerEmail: 'organizers@example.org',
    now: () => NOW,
  };
});

describe('request gatekeeping', () => {
  it('answers CORS preflight only for allowed origins', async () => {
    const handler = createHandler(deps);
    const ok = await handler(new Request('https://x/submit', { method: 'OPTIONS', headers: { origin: ORIGIN } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const bad = await handler(new Request('https://x/submit', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    expect(bad.status).toBe(403);
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects posts from other origins and without JSON', async () => {
    const handler = createHandler(deps);
    expect((await call(handler, post('contact', {}, {}, { origin: 'https://evil.example' }))).status).toBe(403);
    const notJson = new Request('https://x/submit', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'text/plain' }, body: 'hi' });
    expect((await handler(notJson)).status).toBe(415);
  });

  it('rejects unknown forms and malformed bodies', async () => {
    const handler = createHandler(deps);
    expect((await call(handler, post('admin', {}))).status).toBe(400);
    const broken = new Request('https://x/submit', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{nope' });
    expect((await handler(broken)).status).toBe(400);
  });

  it('rejects honeypot and too-fast submissions without saving anything', async () => {
    const handler = createHandler(deps);
    const honeypot = await call(handler, post('petition', petitionData, { website: 'http://spam.example' }));
    expect(honeypot.status).toBe(400);
    expect(honeypot.body.ok).toBe(false);
    const fast = await call(handler, post('petition', petitionData, { elapsedMs: 300 }));
    expect(fast.status).toBe(400);
    expect(fast.body.error).toBe('too_fast');
    const rows = await db.query('select count(*)::int as n from public.petition_signatures');
    expect(rows.rows[0]).toEqual({ n: 0 });
  });

  it('requires and checks Turnstile when configured', async () => {
    const handler = createHandler({ ...deps, verifyTurnstile: async (token) => token === 'good-token' });
    expect((await call(handler, post('contact', { name: 'Al Moss', email: 'al@example.com', subject: 'Hi', message: 'Hello there, friends.' }))).body.error).toBe(
      'turnstile_missing',
    );
    expect(
      (await call(handler, post('contact', { name: 'Al Moss', email: 'al@example.com', subject: 'Hi', message: 'Hello there, friends.' }, { turnstileToken: 'bad' })))
        .body.error,
    ).toBe('turnstile_failed');
    const ok = await call(
      handler,
      post('contact', { name: 'Al Moss', email: 'al@example.com', subject: 'Hi', message: 'Hello there, friends.' }, { turnstileToken: 'good-token' }),
    );
    expect(ok.status).toBe(200);
  });

  it('rate limits repeated submissions from one address', async () => {
    const handler = createHandler(deps);
    const data = { name: 'Al Moss', email: 'al@example.com', subject: 'Hi', message: 'Hello there, friends.' };
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await call(handler, post('contact', data))).status);
    expect(statuses).toEqual([200, 200, 200, 200, 429]);
    const otherIp = await call(handler, post('contact', data, {}, { 'x-forwarded-for': '198.51.100.2' }));
    expect(otherIp.status).toBe(200);
  });

  it('never stores raw IP addresses', async () => {
    const handler = createHandler(deps);
    await call(handler, post('contact', { name: 'Al Moss', email: 'al@example.com', subject: 'Hi', message: 'Hello there, friends.' }));
    const res = await db.query<{ ip_hash: string }>('select ip_hash from public.submission_attempts');
    expect(res.rows[0]!.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(res.rows)).not.toContain('203.0.113.7');
  });
});

describe('petitions', () => {
  it('stores a valid signature and gives the same answer for a repeat signature', async () => {
    const handler = createHandler(deps);
    const first = await call(handler, post('petition', petitionData));
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    const repeat = await call(handler, post('petition', { ...petitionData, email: 'JORDAN@example.com' }, {}, { 'x-forwarded-for': '198.51.100.9' }));
    expect(repeat.body.message).toBe(first.body.message);
    const rows = await db.query('select petition_slug, zip_code from public.petition_signatures');
    expect(rows.rows).toEqual([{ petition_slug: 'open-petition', zip_code: '75790' }]);
  });

  it('enforces the petition-specific ZIP requirement and consent', async () => {
    const handler = createHandler(deps);
    const noZip = await call(handler, post('petition', { ...petitionData, zip: '' }));
    expect(noZip.status).toBe(400);
    expect(noZip.body.fieldErrors.zip).toBeTruthy();
    const noConsent = await call(handler, post('petition', { ...petitionData, consent: false }));
    expect(noConsent.body.fieldErrors.consent).toBeTruthy();
    const zipOff = await call(handler, post('petition', { ...petitionData, slug: 'hidden-count', zip: 'garbage' }));
    expect(zipOff.status).toBe(200);
    const stored = await db.query(`select zip_code from public.petition_signatures where petition_slug = 'hidden-count'`);
    expect(stored.rows).toEqual([{ zip_code: null }]);
  });

  it('refuses signatures for unknown, closed, not-yet-open and expired petitions', async () => {
    const handler = createHandler(deps);
    for (const slug of ['does-not-exist', 'closed-petition', 'future-petition', 'expired-petition']) {
      const res = await call(handler, post('petition', { ...petitionData, slug }, {}, { 'x-forwarded-for': `10.0.0.${slug.length}` }));
      expect(res.status, slug).toBe(403);
    }
    const rows = await db.query('select count(*)::int as n from public.petition_signatures');
    expect(rows.rows[0]).toEqual({ n: 0 });
  });

  it('fails safely when the forms manifest is unavailable', async () => {
    const handler = createHandler({
      ...deps,
      getManifest: async () => {
        throw new Error('network down');
      },
    });
    const res = await call(handler, post('petition', petitionData));
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });

  it('sends a newsletter confirmation when the signer opts in', async () => {
    const handler = createHandler(deps);
    const res = await call(handler, post('petition', { ...petitionData, newsletterOptIn: true }));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('jordan@example.com');
    expect(sent[0]!.text).toContain('/newsletter/confirm/?token=');
  });

  it('publishes counts only for petitions that opt in', async () => {
    const handler = createHandler(deps);
    await call(handler, post('petition', petitionData));
    await call(handler, post('petition', { ...petitionData, slug: 'hidden-count' }));
    const res = await handler(new Request(`https://x/submit?counts=open-petition,hidden-count,closed-petition`, { headers: { origin: ORIGIN } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, counts: { 'open-petition': 1, 'closed-petition': 0 } });
  });
});

describe('volunteer and contact forms', () => {
  it('stores a volunteer and notifies organizers with escaped content', async () => {
    const handler = createHandler(deps);
    const res = await call(
      handler,
      post('volunteer', {
        fullName: 'Casey <b>Ng</b>',
        email: 'casey@example.com',
        phone: '(903) 555-0142',
        interests: ['events', 'research'],
        availability: ['weekends'],
        comments: 'Happy to help.',
        consent: true,
      }),
    );
    expect(res.status).toBe(200);
    const rows = await db.query<{ interests: string[] }>('select interests from public.volunteer_signups');
    expect(rows.rows[0]!.interests).toEqual(['events', 'research']);
    expect(sent[0]!.to).toBe('organizers@example.org');
    expect(sent[0]!.html).toContain('Casey &lt;b&gt;Ng&lt;/b&gt;');
    expect(sent[0]!.replyTo).toBe('casey@example.com');
  });

  it('rejects unknown volunteer interests', async () => {
    const handler = createHandler(deps);
    const res = await call(handler, post('volunteer', { fullName: 'Casey Ng', email: 'casey@example.com', interests: ['hacking'], consent: true }));
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.interests).toBeTruthy();
  });

  it('still saves a contact message when the notification email fails', async () => {
    const handler = createHandler({
      ...deps,
      sendEmail: async () => {
        throw new Error('smtp down');
      },
    });
    const res = await call(handler, post('contact', { name: 'Al Moss', email: 'al@example.com', subject: 'Hi', message: 'Hello there, friends.' }));
    expect(res.status).toBe(200);
    const rows = await db.query('select count(*)::int as n from public.contact_messages');
    expect(rows.rows[0]).toEqual({ n: 1 });
  });

  it('reports a server error (not success) when the database write fails', async () => {
    const handler = createHandler({
      ...deps,
      store: {
        ...deps.store,
        addContactMessage: async () => {
          throw new Error('db down');
        },
      },
    });
    const res = await call(handler, post('contact', { name: 'Al Moss', email: 'al@example.com', subject: 'Hi', message: 'Hello there, friends.' }));
    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });
});

describe('newsletter', () => {
  it('refuses honestly when email delivery is not configured', async () => {
    const handler = createHandler({ ...deps, sendEmail: undefined });
    const res = await call(handler, post('newsletter', { email: 'new@example.com', consent: true, source: 'homepage' }));
    expect(res.status).toBe(503);
    const rows = await db.query('select count(*)::int as n from public.newsletter_subscribers');
    expect(rows.rows[0]).toEqual({ n: 0 });
  });

  it('runs the full double opt-in through the HTTP interface', async () => {
    const handler = createHandler(deps);
    const signup = await call(handler, post('newsletter', { email: 'new@example.com', consent: true, source: 'homepage' }));
    expect(signup.status).toBe(200);
    const token = /token=([0-9a-f-]{36})/.exec(sent[0]!.text)![1]!;

    const confirm = await call(handler, post('newsletter-confirm', { token }, { elapsedMs: 0 }));
    expect(confirm.body.ok).toBe(true);
    const subscribed = await db.query<{ status: string }>('select status from public.newsletter_subscribers');
    expect(subscribed.rows[0]!.status).toBe('subscribed');

    const unsubscribe = await call(handler, post('newsletter-unsubscribe', { token }, { elapsedMs: 0 }));
    expect(unsubscribe.body.ok).toBe(true);
    const after = await db.query<{ status: string }>('select status from public.newsletter_subscribers');
    expect(after.rows[0]!.status).toBe('unsubscribed');
  });

  it('reports an error and allows an immediate retry when the confirmation email fails', async () => {
    let fail = true;
    const handler = createHandler({
      ...deps,
      sendEmail: async (m) => {
        if (fail) throw new Error('provider down');
        sent.push(m);
      },
    });
    const first = await call(handler, post('newsletter', { email: 'retry@example.com', consent: true }));
    expect(first.status).toBe(502);
    fail = false;
    const second = await call(handler, post('newsletter', { email: 'retry@example.com', consent: true }));
    expect(second.status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('rejects malformed tokens', async () => {
    const handler = createHandler(deps);
    const res = await call(handler, post('newsletter-confirm', { token: 'not-a-token' }));
    expect(res.status).toBe(400);
  });
});

describe('event RSVPs', () => {
  it('accepts RSVPs only for open events', async () => {
    const handler = createHandler(deps);
    const ok = await call(handler, post('rsvp', { slug: 'open-event', fullName: 'Pat Kim', email: 'pat@example.com', partySize: 2 }));
    expect(ok.status).toBe(200);
    const past = await call(handler, post('rsvp', { slug: 'past-event', fullName: 'Pat Kim', email: 'pat@example.com', partySize: 2 }));
    expect(past.status).toBe(403);
  });
});
