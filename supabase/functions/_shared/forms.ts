/**
 * Form definitions shared by the website and the Supabase Edge Function.
 *
 * The website imports this file for field options and client-side checks
 * (a convenience for visitors). The Edge Function imports the same file and
 * runs the same checks again on the server, which is the check that counts.
 *
 * Plain TypeScript only — no Deno-, Node- or browser-specific APIs — so it
 * runs unchanged in all three places.
 */

export const FORM_TYPES = [
  'petition',
  'volunteer',
  'contact',
  'newsletter',
  'newsletter-confirm',
  'newsletter-unsubscribe',
  'rsvp',
] as const;
export type FormType = (typeof FORM_TYPES)[number];

/**
 * Bump this date whenever the wording of a consent statement changes. It is
 * stored with every record so organizers know which wording a person agreed to.
 */
export const CONSENT_VERSION = '2026-10-21';

export const LIMITS = {
  name: { min: 2, max: 120 },
  email: { max: 254 },
  phone: { max: 30, minDigits: 7, maxDigits: 15 },
  subject: { min: 2, max: 150 },
  message: { min: 10, max: 5000 },
  comments: { max: 2000 },
  slug: { max: 120 },
  partySize: { min: 1, max: 10 },
} as const;

export const VOLUNTEER_INTERESTS = [
  { value: 'events', label: 'Helping at community events' },
  { value: 'outreach', label: 'Neighborhood outreach' },
  { value: 'petitions', label: 'Collecting petition signatures in person' },
  { value: 'research', label: 'Researching local issues and public records' },
  { value: 'meetings', label: 'Attending and taking notes at public meetings' },
  { value: 'communications', label: 'Writing, photography or social media' },
  { value: 'other', label: 'Something else (tell us in the comments)' },
] as const;

export const VOLUNTEER_AVAILABILITY = [
  { value: 'weekday-daytime', label: 'Weekday daytime' },
  { value: 'weekday-evenings', label: 'Weekday evenings' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'occasional', label: 'Now and then, for specific events' },
] as const;

export const NEWSLETTER_SOURCES = [
  'newsletter-page',
  'homepage',
  'take-action',
  'petition',
  'other',
] as const;

export type ZipRequirement = 'required' | 'optional' | 'off';

export type FieldErrors = Record<string, string>;
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export interface PetitionSubmission {
  slug: string;
  fullName: string;
  email: string;
  zip: string | null;
  newsletterOptIn: boolean;
}

export interface VolunteerSubmission {
  fullName: string;
  email: string;
  phone: string | null;
  interests: string[];
  availability: string[];
  comments: string | null;
}

export interface ContactSubmission {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface NewsletterSubmission {
  email: string;
  source: (typeof NEWSLETTER_SOURCES)[number];
}

export interface TokenSubmission {
  token: string;
}

export interface RsvpSubmission {
  slug: string;
  fullName: string;
  email: string;
  partySize: number;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

// Control characters other than tab, line feed and carriage return.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// Zero-width and bidirectional-override characters often used to disguise spam.
const INVISIBLE_CHARS = /[​-‏‪-‮⁠-⁤﻿]/g;
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:".]+(?:\.[^\s@<>()[\]\\,;:".]+)*\.[A-Za-z]{2,63}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZIP = /^\d{5}$/;
const PHONE_CHARS = /^[0-9+().\-\s]+$/;
const URL_LIKE = /(https?:\/\/|www\.)/i;
const URL_LIKE_ALL = /(https?:\/\/|www\.)/gi;

/** Normalizes untrusted text: strips control/invisible characters and trims. */
export function cleanText(value: unknown, options: { multiline?: boolean } = {}): string {
  if (typeof value !== 'string') return '';
  let text = value.normalize('NFC').replace(CONTROL_CHARS, '').replace(INVISIBLE_CHARS, '');
  if (options.multiline) {
    text = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
  } else {
    text = text.replace(/\s+/g, ' ');
  }
  return text.trim();
}

export function normalizeEmail(value: unknown): string {
  return cleanText(value).toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length > 0 && email.length <= LIMITS.email.max && EMAIL.test(email);
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= LIMITS.slug.max && SLUG.test(slug);
}

export function isValidToken(token: string): boolean {
  return UUID.test(token);
}

function isTrue(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on' || value === 'yes';
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string' && value) return [value];
  return [];
}

function checkName(raw: unknown, errors: FieldErrors, field: string, label = 'your full name'): string {
  const name = cleanText(raw);
  if (!name) errors[field] = `Enter ${label}.`;
  else if (name.length < LIMITS.name.min) errors[field] = `${capitalize(label)} looks too short.`;
  else if (name.length > LIMITS.name.max) errors[field] = `Keep ${label} under ${LIMITS.name.max} characters.`;
  else if (URL_LIKE.test(name)) errors[field] = `${capitalize(label)} can’t include a web address.`;
  return name;
}

function checkEmail(raw: unknown, errors: FieldErrors, field = 'email'): string {
  const email = cleanText(raw);
  if (!email) errors[field] = 'Enter your email address.';
  else if (!isValidEmail(email)) errors[field] = 'Enter a valid email address, like name@example.com.';
  return email;
}

function capitalize(text: string): string {
  const stripped = text.replace(/^your /, 'Your ');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function result<T>(errors: FieldErrors, value: T): ValidationResult<T> {
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

// ---------------------------------------------------------------------------
// Form validators
// ---------------------------------------------------------------------------

export function validatePetition(
  data: Record<string, unknown>,
  options: { zip: ZipRequirement },
): ValidationResult<PetitionSubmission> {
  const errors: FieldErrors = {};
  const slug = cleanText(data.slug);
  if (!isValidSlug(slug)) errors.slug = 'This petition could not be identified.';

  const fullName = checkName(data.fullName, errors, 'fullName');
  const email = checkEmail(data.email, errors);

  let zip: string | null = null;
  if (options.zip !== 'off') {
    const rawZip = cleanText(data.zip);
    if (rawZip) {
      if (!ZIP.test(rawZip)) errors.zip = 'Enter a 5-digit ZIP code.';
      else zip = rawZip;
    } else if (options.zip === 'required') {
      errors.zip = 'Enter your 5-digit ZIP code.';
    }
  }

  if (!isTrue(data.consent)) {
    errors.consent = 'Please confirm that you agree to the statement above.';
  }

  return result(errors, { slug, fullName, email, zip, newsletterOptIn: isTrue(data.newsletterOptIn) });
}

export function validateVolunteer(data: Record<string, unknown>): ValidationResult<VolunteerSubmission> {
  const errors: FieldErrors = {};
  const fullName = checkName(data.fullName, errors, 'fullName');
  const email = checkEmail(data.email, errors);

  let phone: string | null = null;
  const rawPhone = cleanText(data.phone);
  if (rawPhone) {
    const digits = rawPhone.replace(/\D/g, '');
    if (
      rawPhone.length > LIMITS.phone.max ||
      !PHONE_CHARS.test(rawPhone) ||
      digits.length < LIMITS.phone.minDigits ||
      digits.length > LIMITS.phone.maxDigits
    ) {
      errors.phone = 'Enter a valid phone number, or leave this blank.';
    } else {
      phone = rawPhone;
    }
  }

  const allowedInterests = new Set<string>(VOLUNTEER_INTERESTS.map((o) => o.value));
  const interests = [...new Set(asStringArray(data.interests).map((v) => cleanText(v)))];
  if (!interests.length) errors.interests = 'Choose at least one way you’d like to help.';
  else if (interests.some((v) => !allowedInterests.has(v))) errors.interests = 'One of the selected interests isn’t recognized.';

  const allowedAvailability = new Set<string>(VOLUNTEER_AVAILABILITY.map((o) => o.value));
  const availability = [...new Set(asStringArray(data.availability).map((v) => cleanText(v)))];
  if (availability.some((v) => !allowedAvailability.has(v))) errors.availability = 'One of the selected options isn’t recognized.';

  const rawComments = cleanText(data.comments, { multiline: true });
  if (rawComments.length > LIMITS.comments.max) {
    errors.comments = `Keep comments under ${LIMITS.comments.max.toLocaleString('en-US')} characters.`;
  }

  if (!isTrue(data.consent)) {
    errors.consent = 'Please confirm that we may store your details and contact you about volunteering.';
  }

  return result(errors, {
    fullName,
    email,
    phone,
    interests,
    availability,
    comments: rawComments || null,
  });
}

export function validateContact(data: Record<string, unknown>): ValidationResult<ContactSubmission> {
  const errors: FieldErrors = {};
  const name = checkName(data.name, errors, 'name', 'your name');
  const email = checkEmail(data.email, errors);

  const subject = cleanText(data.subject);
  if (!subject) errors.subject = 'Enter a subject.';
  else if (subject.length < LIMITS.subject.min) errors.subject = 'The subject looks too short.';
  else if (subject.length > LIMITS.subject.max) errors.subject = `Keep the subject under ${LIMITS.subject.max} characters.`;

  const message = cleanText(data.message, { multiline: true });
  if (!message) errors.message = 'Enter a message.';
  else if (message.length < LIMITS.message.min) errors.message = `Add a little more detail (at least ${LIMITS.message.min} characters).`;
  else if (message.length > LIMITS.message.max) {
    errors.message = `Keep the message under ${LIMITS.message.max.toLocaleString('en-US')} characters.`;
  } else if ((message.match(URL_LIKE_ALL) ?? []).length > 3) {
    errors.message = 'Please include no more than three links.';
  }

  return result(errors, { name, email, subject, message });
}

export function validateNewsletter(data: Record<string, unknown>): ValidationResult<NewsletterSubmission> {
  const errors: FieldErrors = {};
  const email = checkEmail(data.email, errors);
  const rawSource = cleanText(data.source);
  const source = (NEWSLETTER_SOURCES as readonly string[]).includes(rawSource)
    ? (rawSource as NewsletterSubmission['source'])
    : 'other';
  if (!isTrue(data.consent)) errors.consent = 'Please confirm that you want to receive email updates.';
  return result(errors, { email, source });
}

export function validateToken(data: Record<string, unknown>): ValidationResult<TokenSubmission> {
  const token = cleanText(data.token);
  return isValidToken(token)
    ? { ok: true, value: { token: token.toLowerCase() } }
    : { ok: false, errors: { token: 'This link is incomplete or has expired.' } };
}

export function validateRsvp(data: Record<string, unknown>): ValidationResult<RsvpSubmission> {
  const errors: FieldErrors = {};
  const slug = cleanText(data.slug);
  if (!isValidSlug(slug)) errors.slug = 'This event could not be identified.';
  const fullName = checkName(data.fullName, errors, 'fullName');
  const email = checkEmail(data.email, errors);
  const rawSize = typeof data.partySize === 'number' ? data.partySize : Number.parseInt(cleanText(data.partySize) || '1', 10);
  const partySize = Number.isInteger(rawSize) ? rawSize : Number.NaN;
  if (!(partySize >= LIMITS.partySize.min && partySize <= LIMITS.partySize.max)) {
    errors.partySize = `Enter a number from ${LIMITS.partySize.min} to ${LIMITS.partySize.max}.`;
  }
  return result(errors, { slug, fullName, email, partySize });
}
