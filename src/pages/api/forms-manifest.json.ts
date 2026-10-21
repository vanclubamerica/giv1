/**
 * Public, machine-readable list of which petitions and event RSVPs are open.
 * The `submit` Edge Function reads this file from the live site before
 * accepting a signature or RSVP, so Git stays the single source of truth:
 * publishing (or closing) a petition and deploying is all it takes.
 *
 * Contains no personal information.
 */
import type { APIRoute } from 'astro';
import type { FormsManifest } from '../../../supabase/functions/_shared/handler.ts';
import { eventTimes, getPublished } from '../../lib/content';
import { localToDate } from '../../lib/dates';

export const GET: APIRoute = async () => {
  const [petitions, events] = await Promise.all([getPublished('petitions'), getPublished('events')]);

  const manifest: FormsManifest = {
    generatedAt: new Date().toISOString(),
    petitions: petitions.map((p) => ({
      slug: p.id,
      title: p.data.title,
      // Time windows are re-checked by the server on every request.
      acceptingSignatures: p.data.state === 'open',
      opensAt: p.data.opensAt ? localToDate(p.data.opensAt).toISOString() : null,
      closesAt: p.data.closesAt ? localToDate(p.data.closesAt).toISOString() : null,
      zip: p.data.zip,
      showSignatureCount: p.data.showSignatureCount,
    })),
    events: events.map((e) => {
      const rsvp = e.data.registration.type === 'rsvp' && e.data.eventStatus !== 'cancelled';
      const closes = e.data.registration.closesAt ? localToDate(e.data.registration.closesAt) : eventTimes(e).start;
      return { slug: e.id, title: e.data.title, rsvp, rsvpClosesAt: rsvp ? closes.toISOString() : null };
    }),
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
