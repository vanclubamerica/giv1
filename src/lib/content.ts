/**
 * Content queries with publishing rules applied in one place.
 *
 *   getBuildable()  -> entries that get a page (published + preview; drafts
 *                      too while running `npm run dev`)
 *   getPublished()  -> entries that may appear in listings, feeds, the
 *                      sitemap and search engines (published only)
 */

import { getCollection, type CollectionEntry } from 'astro:content';
import { localToDate } from './dates';

export type CollectionName = 'articles' | 'issues' | 'petitions' | 'events';
export type Article = CollectionEntry<'articles'>;
export type Issue = CollectionEntry<'issues'>;
export type Petition = CollectionEntry<'petitions'>;
export type Event = CollectionEntry<'events'>;

const SHOW_DRAFTS = import.meta.env.DEV;

export async function getBuildable<C extends CollectionName>(collection: C): Promise<CollectionEntry<C>[]> {
  return getCollection(collection, (entry: CollectionEntry<C>) => entry.data.status !== 'draft' || SHOW_DRAFTS);
}

export async function getPublished<C extends CollectionName>(collection: C): Promise<CollectionEntry<C>[]> {
  return getCollection(collection, (entry: CollectionEntry<C>) => entry.data.status === 'published');
}

export function isPublished(entry: { data: { status: string } }): boolean {
  return entry.data.status === 'published';
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export function sortArticles(list: Article[]): Article[] {
  return [...list].sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
}

export const ARTICLE_KIND_LABELS: Record<Article['data']['kind'], string> = {
  update: 'Update',
  explainer: 'Explainer',
  report: 'Report',
  position: 'Our position',
  announcement: 'Announcement',
};

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export const ISSUE_STATE_LABELS: Record<Issue['data']['state'], string> = {
  active: 'Active',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  archived: 'Archived',
};

export function sortIssues(list: Issue[]): Issue[] {
  const order = { active: 0, monitoring: 1, resolved: 2, archived: 3 } as const;
  return [...list].sort(
    (a, b) =>
      order[a.data.state] - order[b.data.state] ||
      b.data.priority - a.data.priority ||
      (b.data.updatedAt ?? b.data.publishedAt).getTime() - (a.data.updatedAt ?? a.data.publishedAt).getTime(),
  );
}

// ---------------------------------------------------------------------------
// Petitions
// ---------------------------------------------------------------------------

export type PetitionDisplayState = 'upcoming' | 'open' | 'closed' | 'archived';

export const PETITION_STATE_LABELS: Record<PetitionDisplayState, string> = {
  upcoming: 'Not open yet',
  open: 'Open for signatures',
  closed: 'Closed',
  archived: 'Archived',
};

/** The state a visitor should see right now, after applying open/close times. */
export function petitionState(p: Petition, now = new Date()): PetitionDisplayState {
  const { state, opensAt, closesAt } = p.data;
  if (state !== 'open') return state;
  if (opensAt && now < localToDate(opensAt)) return 'upcoming';
  if (closesAt && now > localToDate(closesAt)) return 'closed';
  return 'open';
}

/** Signatures are accepted only for published petitions that are open right now. */
export function petitionAcceptsSignatures(p: Petition, now = new Date()): boolean {
  return p.data.status === 'published' && petitionState(p, now) === 'open';
}

export function sortPetitions(list: Petition[], now = new Date()): Petition[] {
  const order: Record<PetitionDisplayState, number> = { open: 0, upcoming: 1, closed: 2, archived: 3 };
  return [...list].sort(
    (a, b) => order[petitionState(a, now)] - order[petitionState(b, now)] || b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface EventTimes {
  start: Date;
  end: Date | null;
  /** When the event is considered over (end, or start + 2h, or end of day). */
  over: Date;
}

export function eventTimes(e: Event): EventTimes {
  const start = localToDate(e.data.allDay ? `${e.data.start.slice(0, 10)}T00:00` : e.data.start);
  const end = e.data.end ? localToDate(e.data.end) : null;
  let over: Date;
  if (end) over = end;
  else if (e.data.allDay) over = localToDate(`${e.data.start.slice(0, 10)}T23:59`);
  else over = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { start, end, over };
}

export function isUpcoming(e: Event, now = new Date()): boolean {
  return eventTimes(e).over.getTime() >= now.getTime();
}

export function rsvpOpen(e: Event, now = new Date()): boolean {
  if (e.data.status !== 'published' || e.data.registration.type !== 'rsvp' || e.data.eventStatus === 'cancelled') return false;
  const closes = e.data.registration.closesAt ? localToDate(e.data.registration.closesAt) : eventTimes(e).start;
  return now < closes;
}

export function sortEventsAscending(list: Event[]): Event[] {
  return [...list].sort((a, b) => eventTimes(a).start.getTime() - eventTimes(b).start.getTime());
}

export function splitEvents(list: Event[], now = new Date()): { upcoming: Event[]; past: Event[] } {
  const sorted = sortEventsAscending(list);
  return {
    upcoming: sorted.filter((e) => isUpcoming(e, now)),
    past: sorted.filter((e) => !isUpcoming(e, now)).reverse(),
  };
}

export const EVENT_STATUS_LABELS: Record<Event['data']['eventStatus'], string> = {
  scheduled: 'Scheduled',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
};
