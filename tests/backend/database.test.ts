import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asRole, createPgliteStore, createTestDatabase } from './db.ts';

const TABLES = [
  'petition_signatures',
  'volunteer_signups',
  'contact_messages',
  'newsletter_subscribers',
  'event_rsvps',
  'submission_attempts',
];

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
});

describe('access control', () => {
  for (const role of ['anon', 'authenticated']) {
    for (const table of TABLES) {
      it(`${role} cannot read public.${table}`, async () => {
        await expect(asRole(db, role, () => db.query(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
      });
    }

    it(`${role} cannot insert a petition signature directly`, async () => {
      await expect(
        asRole(db, role, () =>
          db.query(
            `insert into public.petition_signatures (petition_slug, full_name, email, consent_version) values ('x', 'Al Smith', 'a@b.co', 'v')`,
          ),
        ),
      ).rejects.toThrow(/permission denied/);
    });

    it(`${role} cannot execute the gi_* functions`, async () => {
      await expect(
        asRole(db, role, () => db.query(`select public.gi_sign_petition('x', 'Al Smith', 'a@b.co', null, false, 'v')`)),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asRole(db, role, () => db.query(`select * from public.gi_petition_counts(array['x'])`)),
      ).rejects.toThrow(/permission denied/);
    });

    it(`${role} cannot read organizer reports`, async () => {
      await expect(asRole(db, role, () => db.query('select * from reports.petition_signatures'))).rejects.toThrow(
        /permission denied/,
      );
    });
  }

  it('row level security is enabled on every table', async () => {
    const res = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    for (const table of TABLES) {
      expect(res.rows.find((r) => r.relname === table)?.relrowsecurity, table).toBe(true);
    }
  });
});

describe('petition signatures', () => {
  it('records one signature per email per petition, case-insensitively', async () => {
    const store = createPgliteStore(db);
    const base = { slug: 'clean-parks', fullName: 'Jo Doe', zip: '75790', newsletterOptIn: false, consentVersion: 'v1' };
    expect(await store.signPetition({ ...base, email: 'jo@example.com' })).toBe('created');
    expect(await store.signPetition({ ...base, email: ' JO@Example.com ' })).toBe('duplicate');
    expect(await store.signPetition({ ...base, slug: 'other-petition', email: 'jo@example.com' })).toBe('created');
    expect(await store.petitionCounts(['clean-parks', 'other-petition', 'unknown'])).toEqual({
      'clean-parks': 1,
      'other-petition': 1,
      unknown: 0,
    });
  });

  it('excludes removed signatures from counts', async () => {
    const store = createPgliteStore(db);
    await store.signPetition({ slug: 'count-check', fullName: 'Ana Ruiz', email: 'ana@example.com', zip: null, newsletterOptIn: false, consentVersion: 'v1' });
    await store.signPetition({ slug: 'count-check', fullName: 'Bo Lee', email: 'bo@example.com', zip: null, newsletterOptIn: false, consentVersion: 'v1' });
    await db.query(`update public.petition_signatures set status = 'removed' where email = 'bo@example.com'`);
    expect(await store.petitionCounts(['count-check'])).toEqual({ 'count-check': 1 });
  });

  it('rejects malformed values at the database level', async () => {
    const store = createPgliteStore(db);
    await expect(
      store.signPetition({ slug: 'Bad Slug!', fullName: 'Jo Doe', email: 'jo@example.com', zip: null, newsletterOptIn: false, consentVersion: 'v1' }),
    ).rejects.toThrow(/check constraint/);
    await expect(
      store.signPetition({ slug: 'ok-slug', fullName: 'Jo Doe', email: 'jo@example.com', zip: '7579', newsletterOptIn: false, consentVersion: 'v1' }),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('newsletter double opt-in', () => {
  it('walks through request, throttle, confirm, unsubscribe and re-subscribe', async () => {
    const store = createPgliteStore(db);
    const first = await store.newsletterRequest('reader@example.com', 'homepage', 'v1');
    expect(first.action).toBe('send');
    expect(first.token).toMatch(/^[0-9a-f-]{36}$/);

    const again = await store.newsletterRequest('Reader@Example.com', 'homepage', 'v1');
    expect(again).toEqual({ action: 'throttled', token: null });

    await store.newsletterSendFailed(first.token!);
    const retry = await store.newsletterRequest('reader@example.com', 'homepage', 'v1');
    expect(retry).toEqual({ action: 'send', token: first.token });

    expect(await store.newsletterConfirm(first.token!)).toBe('confirmed');
    expect(await store.newsletterConfirm(first.token!)).toBe('already_confirmed');
    expect(await store.newsletterRequest('reader@example.com', 'homepage', 'v1')).toEqual({
      action: 'already_subscribed',
      token: null,
    });

    expect(await store.newsletterUnsubscribe(first.token!)).toBe('unsubscribed');
    expect(await store.newsletterUnsubscribe(first.token!)).toBe('unsubscribed');
    expect(await store.newsletterConfirm(first.token!)).toBe('invalid');

    const resubscribe = await store.newsletterRequest('reader@example.com', 'newsletter-page', 'v2');
    expect(resubscribe.action).toBe('send');
    expect(resubscribe.token).not.toBe(first.token);
  });

  it('treats unknown tokens as invalid', async () => {
    const store = createPgliteStore(db);
    expect(await store.newsletterConfirm('00000000-0000-4000-8000-000000000000')).toBe('invalid');
    expect(await store.newsletterUnsubscribe('00000000-0000-4000-8000-000000000000')).toBe('invalid');
  });
});

describe('volunteers, contact messages and RSVPs', () => {
  it('stores volunteer sign-ups and contact messages', async () => {
    const store = createPgliteStore(db);
    await store.addVolunteer({
      fullName: 'Sam Hill',
      email: 'sam@example.com',
      phone: null,
      interests: ['events'],
      availability: ['weekends'],
      comments: null,
      consentVersion: 'v1',
    });
    await store.addContactMessage({ name: 'Sam Hill', email: 'sam@example.com', subject: 'Hello', message: 'A question about meetings.' });
    const volunteers = await db.query('select * from reports.volunteers');
    const inbox = await db.query('select * from reports.contact_inbox');
    expect(volunteers.rows).toHaveLength(1);
    expect(inbox.rows).toHaveLength(1);
  });

  it('keeps one RSVP per email per event', async () => {
    const store = createPgliteStore(db);
    const row = { slug: 'town-hall', fullName: 'Lee Park', email: 'lee@example.com', partySize: 2 };
    expect(await store.addRsvp(row)).toBe('created');
    expect(await store.addRsvp({ ...row, email: 'LEE@example.com' })).toBe('duplicate');
  });
});

describe('rate limiting', () => {
  it('counts attempts per IP hash and form inside the window', async () => {
    const store = createPgliteStore(db);
    expect(await store.rateLimitHit('hash-a', 'contact', 600)).toBe(1);
    expect(await store.rateLimitHit('hash-a', 'contact', 600)).toBe(2);
    expect(await store.rateLimitHit('hash-a', 'petition', 600)).toBe(1);
    expect(await store.rateLimitHit('hash-b', 'contact', 600)).toBe(1);
  });

  it('prunes attempts older than two days', async () => {
    const store = createPgliteStore(db);
    await db.query(`insert into public.submission_attempts (ip_hash, form, created_at) values ('old', 'contact', now() - interval '3 days')`);
    await store.rateLimitHit('hash-c', 'contact', 600);
    const res = await db.query(`select * from public.submission_attempts where ip_hash = 'old'`);
    expect(res.rows).toHaveLength(0);
  });
});
