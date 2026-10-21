/**
 * Request handler for the `submit` Edge Function.
 *
 * Runtime-agnostic: it only uses web-standard APIs (Request, Response, URL),
 * so it runs in Supabase's Deno runtime and in Node for automated tests. All
 * side effects (database, email, CAPTCHA verification) are injected.
 */

import {
  CONSENT_VERSION,
  FORM_TYPES,
  type FieldErrors,
  type FormType,
  type ZipRequirement,
  isValidSlug,
  validateContact,
  validateNewsletter,
  validatePetition,
  validateRsvp,
  validateToken,
  validateVolunteer,
} from './forms.ts';
import {
  confirmationEmail,
  contactNotificationEmail,
  type EmailMessage,
  volunteerNotificationEmail,
} from './emails.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Published by the website at /api/forms-manifest.json on every build. */
export interface FormsManifest {
  generatedAt: string;
  petitions: ManifestPetition[];
  events: ManifestEvent[];
}

export interface ManifestPetition {
  slug: string;
  title: string;
  acceptingSignatures: boolean;
  opensAt: string | null;
  closesAt: string | null;
  zip: ZipRequirement;
  showSignatureCount: boolean;
}

export interface ManifestEvent {
  slug: string;
  title: string;
  rsvp: boolean;
  rsvpClosesAt: string | null;
}

export type InsertOutcome = 'created' | 'duplicate';

export interface NewsletterRequestOutcome {
  action: 'send' | 'throttled' | 'already_subscribed';
  token: string | null;
}

/** Database operations. Implemented with supabase-js in production. */
export interface SubmissionStore {
  rateLimitHit(ipHash: string, form: string, windowSeconds: number): Promise<number>;
  signPetition(row: {
    slug: string;
    fullName: string;
    email: string;
    zip: string | null;
    newsletterOptIn: boolean;
    consentVersion: string;
  }): Promise<InsertOutcome>;
  petitionCounts(slugs: string[]): Promise<Record<string, number>>;
  addVolunteer(row: {
    fullName: string;
    email: string;
    phone: string | null;
    interests: string[];
    availability: string[];
    comments: string | null;
    consentVersion: string;
  }): Promise<void>;
  addContactMessage(row: { name: string; email: string; subject: string; message: string }): Promise<void>;
  addRsvp(row: { slug: string; fullName: string; email: string; partySize: number }): Promise<InsertOutcome>;
  newsletterRequest(email: string, source: string, consentVersion: string): Promise<NewsletterRequestOutcome>;
  newsletterSendFailed(token: string): Promise<void>;
  newsletterConfirm(token: string): Promise<'confirmed' | 'already_confirmed' | 'invalid'>;
  newsletterUnsubscribe(token: string): Promise<'unsubscribed' | 'invalid'>;
}

export interface HandlerDeps {
  store: SubmissionStore;
  getManifest: () => Promise<FormsManifest>;
  hashIp: (ip: string) => Promise<string>;
  /** Present only when TURNSTILE_SECRET_KEY is configured. */
  verifyTurnstile?: (token: string, ip: string | null) => Promise<boolean>;
  /** Present only when an email provider is configured. */
  sendEmail?: (message: EmailMessage) => Promise<void>;
  allowedOrigins: string[];
  siteUrl: string;
  organizerEmail?: string;
  now?: () => Date;
  /** Submissions completed faster than this are treated as automated. */
  minFillMs?: number;
  /** Structured logging without personal data. */
  log?: (event: string, detail?: Record<string, unknown>) => void;
}

interface SubmitBody {
  form: FormType;
  data: Record<string, unknown>;
  meta: {
    elapsedMs?: number;
    website?: string; // honeypot
    turnstileToken?: string;
  };
}

/** Maximum attempts per IP hash per form inside RATE_WINDOW_SECONDS. */
export const RATE_LIMITS: Record<FormType, number> = {
  petition: 6,
  volunteer: 4,
  contact: 4,
  newsletter: 5,
  'newsletter-confirm': 15,
  'newsletter-unsubscribe': 15,
  rsvp: 6,
};
export const RATE_WINDOW_SECONDS = 600;
const MAX_BODY_BYTES = 16_384;

/** Forms that a person fills in (as opposed to clicking an emailed link). */
const TYPED_FORMS: ReadonlySet<FormType> = new Set(['petition', 'volunteer', 'contact', 'newsletter', 'rsvp']);

const MESSAGES = {
  server: 'Something went wrong on our end and your submission was not saved. Please try again in a few minutes.',
  manifest:
    'We couldn’t check whether this form is open right now, so nothing was saved. Please try again in a few minutes.',
  rateLimited: 'Too many submissions from your connection. Please wait a few minutes and try again.',
  automated: 'Your submission looked automated, so it wasn’t saved. Please try again.',
  tooFast: 'That was very quick! Please take a moment to review the form, then submit it again.',
  turnstileMissing: 'Please complete the “verify you are human” check, then submit again.',
  turnstileFailed: 'The “verify you are human” check didn’t go through. Please try it again.',
  validation: 'Please fix the highlighted fields and try again.',
} as const;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const minFillMs = deps.minFillMs ?? 2500;
  const log = deps.log ?? (() => {});

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get('origin');
    const allowedOrigin = origin && deps.allowedOrigins.includes(origin) ? origin : null;
    const cors = corsHeaders(allowedOrigin);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: allowedOrigin ? 204 : 403, headers: cors });
    }

    if (req.method === 'GET') {
      return handleCounts(req, deps, cors, log);
    }

    if (req.method !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed', message: 'Use POST.' }, 405, { ...cors, Allow: 'GET, POST, OPTIONS' });
    }

    if (!allowedOrigin) {
      return json({ ok: false, error: 'forbidden_origin', message: 'Submissions are only accepted from the Get Involved Van website.' }, 403, cors);
    }

    if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return json({ ok: false, error: 'unsupported_media_type', message: 'Send the form as JSON.' }, 415, cors);
    }

    let body: SubmitBody;
    try {
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) {
        return json({ ok: false, error: 'too_large', message: 'This submission is too long. Please shorten it and try again.' }, 413, cors);
      }
      body = parseBody(JSON.parse(text));
    } catch {
      return json({ ok: false, error: 'bad_request', message: 'The submission could not be read. Please reload the page and try again.' }, 400, cors);
    }

    const ip = clientIp(req);
    try {
      const attempts = await deps.store.rateLimitHit(await deps.hashIp(ip ?? 'unknown'), body.form, RATE_WINDOW_SECONDS);
      if (attempts > RATE_LIMITS[body.form]) {
        log('rate_limited', { form: body.form });
        return json({ ok: false, error: 'rate_limited', message: MESSAGES.rateLimited }, 429, { ...cors, 'Retry-After': String(RATE_WINDOW_SECONDS) });
      }
    } catch (error) {
      log('rate_limit_error', { form: body.form, error: errorMessage(error) });
      return json({ ok: false, error: 'server', message: MESSAGES.server }, 500, cors);
    }

    if (TYPED_FORMS.has(body.form)) {
      if (body.meta.website) {
        log('honeypot', { form: body.form });
        return json({ ok: false, error: 'rejected', message: MESSAGES.automated }, 400, cors);
      }
      if (typeof body.meta.elapsedMs !== 'number' || body.meta.elapsedMs < minFillMs) {
        log('too_fast', { form: body.form });
        return json({ ok: false, error: 'too_fast', message: MESSAGES.tooFast }, 400, cors);
      }
      if (deps.verifyTurnstile) {
        if (!body.meta.turnstileToken) {
          return json({ ok: false, error: 'turnstile_missing', message: MESSAGES.turnstileMissing }, 400, cors);
        }
        let passed = false;
        try {
          passed = await deps.verifyTurnstile(body.meta.turnstileToken, ip);
        } catch (error) {
          log('turnstile_error', { error: errorMessage(error) });
        }
        if (!passed) {
          return json({ ok: false, error: 'turnstile_failed', message: MESSAGES.turnstileFailed }, 400, cors);
        }
      }
    }

    try {
      switch (body.form) {
        case 'petition':
          return await handlePetition(body, deps, now, cors, log);
        case 'volunteer':
          return await handleVolunteer(body, deps, cors, log);
        case 'contact':
          return await handleContact(body, deps, cors, log);
        case 'newsletter':
          return await handleNewsletter(body, deps, cors, log);
        case 'newsletter-confirm':
          return await handleNewsletterConfirm(body, deps, cors);
        case 'newsletter-unsubscribe':
          return await handleNewsletterUnsubscribe(body, deps, cors);
        case 'rsvp':
          return await handleRsvp(body, deps, now, cors);
      }
    } catch (error) {
      if (error instanceof ManifestUnavailableError) {
        log('manifest_unavailable', { error: errorMessage(error.cause) });
        return json({ ok: false, error: 'unavailable', message: MESSAGES.manifest }, 503, cors);
      }
      log('server_error', { form: body.form, error: errorMessage(error) });
      return json({ ok: false, error: 'server', message: MESSAGES.server }, 500, cors);
    }
  };
}

// ---------------------------------------------------------------------------
// Form handlers
// ---------------------------------------------------------------------------

type Cors = Record<string, string>;
type Log = NonNullable<HandlerDeps['log']>;

async function handlePetition(body: SubmitBody, deps: HandlerDeps, now: () => Date, cors: Cors, log: Log) {
  const slug = typeof body.data.slug === 'string' ? body.data.slug : '';
  const manifest = await loadManifest(deps);
  const petition = manifest.petitions.find((p) => p.slug === slug);
  const closed = petitionClosedReason(petition, now());
  if (closed) {
    return json({ ok: false, error: 'closed', message: closed }, 403, cors);
  }

  const parsed = validatePetition(body.data, { zip: petition!.zip });
  if (!parsed.ok) return validationError(parsed.errors, cors);
  const v = parsed.value;

  const outcome = await deps.store.signPetition({
    slug: v.slug,
    fullName: v.fullName,
    email: v.email,
    zip: v.zip,
    newsletterOptIn: v.newsletterOptIn,
    consentVersion: CONSENT_VERSION,
  });
  log('petition_signed', { slug: v.slug, outcome });

  let newsletterNote = '';
  if (v.newsletterOptIn && outcome === 'created' && deps.sendEmail) {
    try {
      const sent = await requestNewsletter(deps, v.email, 'petition');
      if (sent) newsletterNote = ' We’ve also emailed you a link to confirm your newsletter subscription.';
    } catch (error) {
      log('petition_newsletter_error', { error: errorMessage(error) });
    }
  }

  // The same message is used for new and repeat signatures so the form can't
  // be used to discover whether a particular email address has signed.
  return json(
    {
      ok: true,
      message: `Thank you. Your signature is on the petition “${petition!.title}.”${newsletterNote}`,
    },
    200,
    cors,
  );
}

async function handleVolunteer(body: SubmitBody, deps: HandlerDeps, cors: Cors, log: Log) {
  const parsed = validateVolunteer(body.data);
  if (!parsed.ok) return validationError(parsed.errors, cors);
  await deps.store.addVolunteer({ ...parsed.value, consentVersion: CONSENT_VERSION });
  log('volunteer_added');
  if (deps.sendEmail && deps.organizerEmail) {
    try {
      await deps.sendEmail(volunteerNotificationEmail(deps.organizerEmail, parsed.value));
    } catch (error) {
      log('notify_error', { form: 'volunteer', error: errorMessage(error) });
    }
  }
  return json(
    {
      ok: true,
      message: 'Thanks for signing up to volunteer. Your details are saved, and an organizer will be in touch by email.',
    },
    200,
    cors,
  );
}

async function handleContact(body: SubmitBody, deps: HandlerDeps, cors: Cors, log: Log) {
  const parsed = validateContact(body.data);
  if (!parsed.ok) return validationError(parsed.errors, cors);
  await deps.store.addContactMessage(parsed.value);
  log('contact_added');
  if (deps.sendEmail && deps.organizerEmail) {
    try {
      await deps.sendEmail(contactNotificationEmail(deps.organizerEmail, parsed.value));
    } catch (error) {
      log('notify_error', { form: 'contact', error: errorMessage(error) });
    }
  }
  return json({ ok: true, message: 'Thanks, your message has been received. We’ll reply to the email address you provided.' }, 200, cors);
}

async function handleNewsletter(body: SubmitBody, deps: HandlerDeps, cors: Cors, log: Log) {
  const parsed = validateNewsletter(body.data);
  if (!parsed.ok) return validationError(parsed.errors, cors);
  if (!deps.sendEmail) {
    log('newsletter_unconfigured');
    return json(
      {
        ok: false,
        error: 'unavailable',
        message: 'Newsletter sign-up isn’t available yet because confirmation emails aren’t set up. Nothing was saved.',
      },
      503,
      cors,
    );
  }
  try {
    await requestNewsletter(deps, parsed.value.email, parsed.value.source);
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      log('newsletter_email_failed', { error: errorMessage(error.cause) });
      return json(
        {
          ok: false,
          error: 'email_failed',
          message: 'We couldn’t send your confirmation email just now. Please check the address and try again in a few minutes.',
        },
        502,
        cors,
      );
    }
    throw error;
  }
  return json(
    {
      ok: true,
      message:
        'Almost done. If this address isn’t already subscribed, we’ve sent it a confirmation link. Open that email and click the link to start receiving updates.',
    },
    200,
    cors,
  );
}

async function handleNewsletterConfirm(body: SubmitBody, deps: HandlerDeps, cors: Cors) {
  const parsed = validateToken(body.data);
  if (!parsed.ok) return validationError(parsed.errors, cors);
  const outcome = await deps.store.newsletterConfirm(parsed.value.token);
  if (outcome === 'invalid') {
    return json(
      { ok: false, error: 'invalid_token', message: 'This confirmation link isn’t valid anymore. You can sign up again on the newsletter page.' },
      404,
      cors,
    );
  }
  return json(
    {
      ok: true,
      message: outcome === 'confirmed' ? 'You’re subscribed. Thanks for staying involved.' : 'This address is already confirmed. You’re all set.',
    },
    200,
    cors,
  );
}

async function handleNewsletterUnsubscribe(body: SubmitBody, deps: HandlerDeps, cors: Cors) {
  const parsed = validateToken(body.data);
  if (!parsed.ok) return validationError(parsed.errors, cors);
  const outcome = await deps.store.newsletterUnsubscribe(parsed.value.token);
  if (outcome === 'invalid') {
    return json(
      { ok: false, error: 'invalid_token', message: 'We couldn’t find a subscription for this link. If you keep getting emails, contact us and we’ll remove you.' },
      404,
      cors,
    );
  }
  return json({ ok: true, message: 'You’ve been unsubscribed and won’t receive further newsletter emails.' }, 200, cors);
}

async function handleRsvp(body: SubmitBody, deps: HandlerDeps, now: () => Date, cors: Cors) {
  const slug = typeof body.data.slug === 'string' ? body.data.slug : '';
  const manifest = await loadManifest(deps);
  const event = manifest.events.find((e) => e.slug === slug);
  if (!event || !event.rsvp || (event.rsvpClosesAt && now() > new Date(event.rsvpClosesAt))) {
    return json({ ok: false, error: 'closed', message: 'RSVPs are closed for this event.' }, 403, cors);
  }
  const parsed = validateRsvp(body.data);
  if (!parsed.ok) return validationError(parsed.errors, cors);
  await deps.store.addRsvp(parsed.value);
  return json({ ok: true, message: `Thanks. You’re on the RSVP list for “${event.title}.”` }, 200, cors);
}

async function handleCounts(req: Request, deps: HandlerDeps, cors: Cors, log: Log) {
  const url = new URL(req.url);
  const requested = (url.searchParams.get('counts') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => isValidSlug(s))
    .slice(0, 20);
  if (!requested.length) {
    return json({ ok: false, error: 'bad_request', message: 'Pass ?counts=petition-slug' }, 400, cors);
  }
  try {
    const manifest = await loadManifest(deps);
    const allowed = new Set(manifest.petitions.filter((p) => p.showSignatureCount).map((p) => p.slug));
    const slugs = requested.filter((s) => allowed.has(s));
    const counts = slugs.length ? await deps.store.petitionCounts(slugs) : {};
    return json({ ok: true, counts }, 200, { ...cors, 'Cache-Control': 'public, max-age=60' });
  } catch (error) {
    log('counts_error', { error: errorMessage(error) });
    return json({ ok: false, error: 'unavailable', message: 'Counts are unavailable right now.' }, 503, cors);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class ManifestUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Forms manifest unavailable');
    this.cause = cause;
  }
}

class EmailDeliveryError extends Error {
  constructor(cause: unknown) {
    super('Email delivery failed');
    this.cause = cause;
  }
}

async function loadManifest(deps: HandlerDeps): Promise<FormsManifest> {
  try {
    const manifest = await deps.getManifest();
    if (!manifest || !Array.isArray(manifest.petitions) || !Array.isArray(manifest.events)) {
      throw new Error('Malformed manifest');
    }
    return manifest;
  } catch (error) {
    throw new ManifestUnavailableError(error);
  }
}

/** Returns a visitor-facing reason when a petition can't be signed, else null. */
export function petitionClosedReason(petition: ManifestPetition | undefined, at: Date): string | null {
  if (!petition || !petition.acceptingSignatures) return 'This petition isn’t accepting signatures.';
  if (petition.opensAt && at < new Date(petition.opensAt)) return 'This petition isn’t open for signatures yet.';
  if (petition.closesAt && at > new Date(petition.closesAt)) return 'This petition has closed and is no longer accepting signatures.';
  return null;
}

/** Returns true when a confirmation email was sent. */
async function requestNewsletter(deps: HandlerDeps, email: string, source: string): Promise<boolean> {
  const outcome = await deps.store.newsletterRequest(email, source, CONSENT_VERSION);
  if (outcome.action !== 'send' || !outcome.token || !deps.sendEmail) return false;
  try {
    await deps.sendEmail(confirmationEmail(email, deps.siteUrl, outcome.token));
    return true;
  } catch (error) {
    await deps.store.newsletterSendFailed(outcome.token).catch(() => {});
    throw new EmailDeliveryError(error);
  }
}

function parseBody(raw: unknown): SubmitBody {
  if (!raw || typeof raw !== 'object') throw new Error('Body must be an object');
  const obj = raw as Record<string, unknown>;
  if (!(FORM_TYPES as readonly unknown[]).includes(obj.form)) throw new Error('Unknown form');
  const data = obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data) ? (obj.data as Record<string, unknown>) : null;
  if (!data) throw new Error('Missing data');
  const metaRaw = obj.meta && typeof obj.meta === 'object' ? (obj.meta as Record<string, unknown>) : {};
  return {
    form: obj.form as FormType,
    data,
    meta: {
      elapsedMs: typeof metaRaw.elapsedMs === 'number' ? metaRaw.elapsedMs : undefined,
      website: typeof metaRaw.website === 'string' ? metaRaw.website : undefined,
      turnstileToken: typeof metaRaw.turnstileToken === 'string' ? metaRaw.turnstileToken.slice(0, 4096) : undefined,
    },
  };
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim() || null;
  return req.headers.get('x-real-ip') ?? req.headers.get('cf-connecting-ip');
}

function corsHeaders(origin: string | null): Cors {
  const headers: Cors = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function validationError(fieldErrors: FieldErrors, cors: Cors): Response {
  return json({ ok: false, error: 'validation', message: MESSAGES.validation, fieldErrors }, 400, cors);
}

function json(payload: unknown, status: number, headers: Cors): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': headers['Cache-Control'] ?? 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
