/**
 * "Add to calendar" file for each published event (iCalendar, RFC 5545).
 */
import type { APIRoute } from 'astro';
import { site } from '../../config/site';
import { type Event, eventTimes, getPublished } from '../../lib/content';
import { absoluteUrl, paths } from '../../lib/urls';

export async function getStaticPaths() {
  const events = await getPublished('events');
  return events.map((event) => ({ params: { slug: event.id }, props: { event } }));
}

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets are folded, as the spec requires. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
}

export const GET: APIRoute = ({ props }) => {
  const event = props.event as Event;
  const d = event.data;
  const t = eventTimes(event);
  const url = absoluteUrl(paths.event(event.id));
  const location = [d.location.name, d.location.address].filter(Boolean).join(', ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${site.name}//Events//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@getinvolvedvan.com`,
    `DTSTAMP:${icsDate(new Date())}`,
    d.allDay ? `DTSTART;VALUE=DATE:${d.start.slice(0, 10).replace(/-/g, '')}` : `DTSTART:${icsDate(t.start)}`,
    ...(d.allDay ? [] : [`DTEND:${icsDate(t.end ?? t.over)}`]),
    `SUMMARY:${escape(d.title)}`,
    `DESCRIPTION:${escape(`${d.summary}\n\n${url}`)}`,
    `LOCATION:${escape(location)}`,
    `URL:${url}`,
    `STATUS:${d.eventStatus === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
