/**
 * Content schemas. Every Markdown file in src/content/<collection>/ is checked
 * against these rules at build time; a typo or missing field stops the build
 * with a clear message instead of publishing a broken page.
 *
 * Publication status (all collections):
 *   draft     – not built at all (visible only with `npm run dev`)
 *   preview   – page is built so links work, but it is labelled "Preview",
 *               hidden from listings, the sitemap and search engines, and any
 *               form on it stays closed
 *   published – public, listed, indexed
 *
 * Templates for new files are in docs/content-templates/.
 */

import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const status = z.enum(['draft', 'preview', 'published']).default('draft');

/** Local wall-clock time in Van (America/Chicago), e.g. "2026-11-12T18:30". */
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use local Van time in the form YYYY-MM-DDTHH:MM, e.g. 2026-11-12T18:30');

/**
 * Images live in src/assets/images/. Reference them by their path inside that
 * folder, e.g. `src: articles/library-hours.jpg`. They are resized and
 * converted to modern formats automatically.
 */
const image = z.object({
  src: z.string().min(1),
  alt: z.string(),
  /** CSS object-position focal point, e.g. "50% 30%". */
  position: z.string().optional(),
  caption: z.string().optional(),
  credit: z.string().optional(),
});

const sourceLink = z.object({
  title: z.string(),
  url: z.url(),
  publisher: z.string().optional(),
  /** Date the source was checked. */
  accessed: z.coerce.date().optional(),
});

const actionLink = z.object({
  label: z.string(),
  href: z.string(),
  description: z.string().optional(),
});

const articles = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string().max(160),
    /** One or two sentences used in listings and search results. */
    excerpt: z.string().max(320),
    status,
    /**
     * What kind of piece this is. Shown to readers so facts and opinion are
     * never confused. `position` = the organization's own advocacy.
     */
    kind: z.enum(['update', 'explainer', 'report', 'position', 'announcement']).default('update'),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    author: z.string().optional(),
    image: image.optional(),
    tags: z.array(z.string()).default([]),
    issue: reference('issues').optional(),
    petition: reference('petitions').optional(),
    sources: z.array(sourceLink).default([]),
  }),
});

const issues = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/issues' }),
  schema: z.object({
    title: z.string().max(140),
    summary: z.string().max(320),
    status,
    /** Where the issue stands right now. */
    state: z.enum(['active', 'monitoring', 'resolved', 'archived']).default('active'),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    image: image.optional(),
    /** Higher numbers are listed first. */
    priority: z.number().int().default(0),
    sources: z.array(sourceLink).default([]),
    participate: z.array(actionLink).default([]),
  }),
});

const petitions = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/petitions' }),
  schema: z.object({
    title: z.string().max(160),
    summary: z.string().max(320),
    /** The specific action the petition asks for. */
    ask: z.string().max(600),
    /** Who the petition will be delivered to, if anyone yet. */
    recipient: z.string().optional(),
    status,
    /**
     * Signature window: upcoming (not open yet), open, closed (no longer
     * collecting, still shown) or archived (kept for the record).
     */
    state: z.enum(['upcoming', 'open', 'closed', 'archived']).default('upcoming'),
    publishedAt: z.coerce.date(),
    /** Optional automatic open/close times in local Van time. */
    opensAt: localDateTime.optional(),
    closesAt: localDateTime.optional(),
    issue: reference('issues').optional(),
    article: reference('articles').optional(),
    image: image.optional(),
    /** Show the live signature count (only real, stored signatures). */
    showSignatureCount: z.boolean().default(false),
    /** Whether to ask signers for a ZIP code. */
    zip: z.enum(['required', 'optional', 'off']).default('optional'),
    /** Tells signers exactly what will be shared when the petition is delivered. */
    deliveryNote: z
      .string()
      .default(
        'If this petition is delivered, the recipient will receive signers’ names and ZIP codes. Email addresses are never shared.',
      ),
    /** For closed petitions: what happened. */
    outcome: z.string().optional(),
    sources: z.array(sourceLink).default([]),
  }),
});

const events = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/events' }),
  schema: z
    .object({
      title: z.string().max(140),
      summary: z.string().max(320),
      status,
      /** Local Van time, e.g. 2026-11-12T18:30. Daylight saving is handled automatically. */
      start: localDateTime,
      end: localDateTime.optional(),
      allDay: z.boolean().default(false),
      location: z.object({
        name: z.string(),
        address: z.string().optional(),
        online: z.boolean().default(false),
        /** Map link for in-person events, or the join link for online events. */
        url: z.url().optional(),
      }),
      organizer: z.string().optional(),
      image: image.optional(),
      eventStatus: z.enum(['scheduled', 'postponed', 'cancelled']).default('scheduled'),
      registration: z
        .object({
          type: z.enum(['none', 'external', 'rsvp']).default('none'),
          /** Required when type is "external". */
          url: z.url().optional(),
          label: z.string().optional(),
          /** RSVPs close at this local time (defaults to the event start). */
          closesAt: localDateTime.optional(),
        })
        .default({ type: 'none' }),
      issue: reference('issues').optional(),
    })
    .refine((e) => e.registration.type !== 'external' || Boolean(e.registration.url), {
      message: 'registration.url is required when registration.type is "external"',
      path: ['registration', 'url'],
    })
    .refine((e) => !e.end || e.end >= e.start, {
      message: '`end` must be after `start`',
      path: ['end'],
    }),
});

export const collections = { articles, issues, petitions, events };
