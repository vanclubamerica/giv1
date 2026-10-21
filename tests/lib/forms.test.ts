import { describe, expect, it } from 'vitest';
import {
  cleanText,
  isValidEmail,
  validateContact,
  validateNewsletter,
  validatePetition,
  validateRsvp,
  validateToken,
  validateVolunteer,
} from '../../supabase/functions/_shared/forms.ts';

describe('shared form validation', () => {
  it('cleans control and invisible characters', () => {
    expect(cleanText('  Jo​  Doe\u0007 ')).toBe('Jo Doe');
    expect(cleanText('line one\r\n\r\n\r\n\r\n\r\nline two', { multiline: true })).toBe('line one\n\n\nline two');
    expect(cleanText(42)).toBe('');
  });

  it('accepts real email addresses and rejects malformed ones', () => {
    for (const ok of ['a@b.co', 'first.last+tag@sub.example.org']) expect(isValidEmail(ok), ok).toBe(true);
    for (const bad of ['', 'plain', 'a@b', 'a b@c.com', 'a@b..com', '<x>@y.com']) expect(isValidEmail(bad), bad).toBe(false);
  });

  it('validates petitions according to the ZIP setting', () => {
    const base = { slug: 'parks', fullName: 'Jo Doe', email: 'jo@example.com', consent: true };
    expect(validatePetition({ ...base }, { zip: 'required' }).ok).toBe(false);
    expect(validatePetition({ ...base, zip: '75790' }, { zip: 'required' })).toMatchObject({ ok: true, value: { zip: '75790' } });
    expect(validatePetition({ ...base, zip: 'abc' }, { zip: 'optional' }).ok).toBe(false);
    expect(validatePetition({ ...base, zip: 'abc' }, { zip: 'off' })).toMatchObject({ ok: true, value: { zip: null } });
    expect(validatePetition({ ...base, consent: false }, { zip: 'off' }).ok).toBe(false);
    expect(validatePetition({ ...base, slug: '../etc' }, { zip: 'off' }).ok).toBe(false);
    expect(validatePetition({ ...base, fullName: 'Visit https://spam.example' }, { zip: 'off' }).ok).toBe(false);
  });

  it('validates volunteer sign-ups against the allowed options', () => {
    const base = { fullName: 'Sam Hill', email: 'sam@example.com', interests: ['events'], consent: true };
    expect(validateVolunteer(base).ok).toBe(true);
    expect(validateVolunteer({ ...base, interests: [] }).ok).toBe(false);
    expect(validateVolunteer({ ...base, interests: ['events', 'admin'] }).ok).toBe(false);
    expect(validateVolunteer({ ...base, phone: '12' }).ok).toBe(false);
    expect(validateVolunteer({ ...base, phone: '+1 (903) 555-0142' }).ok).toBe(true);
    expect(validateVolunteer({ ...base, comments: 'x'.repeat(2001) }).ok).toBe(false);
  });

  it('validates contact messages, newsletter sign-ups, tokens and RSVPs', () => {
    expect(validateContact({ name: 'Al', email: 'al@example.com', subject: 'Hi', message: 'Hello there!' }).ok).toBe(true);
    expect(validateContact({ name: 'Al', email: 'al@example.com', subject: 'Hi', message: 'short' }).ok).toBe(false);
    expect(
      validateContact({ name: 'Al', email: 'al@example.com', subject: 'Hi', message: 'http://a.co http://b.co http://c.co http://d.co' }).ok,
    ).toBe(false);
    expect(validateNewsletter({ email: 'a@b.co', consent: true, source: 'weird' })).toMatchObject({ ok: true, value: { source: 'other' } });
    expect(validateNewsletter({ email: 'a@b.co' }).ok).toBe(false);
    expect(validateToken({ token: '6f1c2e9a-3b4d-4c5e-8f60-718293a4b5c6' }).ok).toBe(true);
    expect(validateToken({ token: "' or 1=1 --" }).ok).toBe(false);
    expect(validateRsvp({ slug: 'meet', fullName: 'Pat Kim', email: 'p@k.co', partySize: '11' }).ok).toBe(false);
    expect(validateRsvp({ slug: 'meet', fullName: 'Pat Kim', email: 'p@k.co', partySize: '3' })).toMatchObject({ ok: true, value: { partySize: 3 } });
  });
});
