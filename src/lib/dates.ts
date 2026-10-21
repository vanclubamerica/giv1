/**
 * Date helpers. Event times are written as local Van wall-clock time
 * ("2026-11-12T18:30") and converted with the America/Chicago rules, so
 * daylight saving time is always handled correctly.
 */

import { site } from '../config/site';

const TZ = site.timeZone;
const LOCALE = site.locale;

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds (e.g. -5h during CDT). */
export function zoneOffsetMs(date: Date, timeZone = TZ): number {
  const p = partsIn(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts local Van time ("YYYY-MM-DDTHH:MM" or "YYYY-MM-DD") to an exact instant. */
export function localToDate(local: string, timeZone = TZ): Date {
  const [datePart = '', timePart = '00:00'] = local.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid local date: "${local}"`);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh ?? 0, mm ?? 0);
  const firstGuess = wallAsUtc - zoneOffsetMs(new Date(wallAsUtc), timeZone);
  const corrected = wallAsUtc - zoneOffsetMs(new Date(firstGuess), timeZone);
  return new Date(corrected);
}

/** ISO 8601 with the local offset, e.g. 2026-11-12T18:30:00-06:00 (for structured data). */
export function toZonedIso(date: Date, timeZone = TZ): string {
  const p = partsIn(date, timeZone);
  const offsetMin = Math.round(zoneOffsetMs(date, timeZone) / 60000);
  const sign = offsetMin <= 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** "October 21, 2026" for a date-only value (publish dates are stored at UTC midnight). */
export function formatPlainDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

/** YYYY-MM-DD for a date-only value. */
export function plainDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "Thursday, November 12, 2026" in Van time. */
export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

/** "6:30 p.m." in Van time (AP style). */
export function formatTime(date: Date): string {
  const text = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(date);
  return text
    .replace(':00', '')
    .replace(/\s?AM$/i, ' a.m.')
    .replace(/\s?PM$/i, ' p.m.')
    .replace('12 p.m.', 'noon');
}

/** "CST" or "CDT" for the given instant. */
export function zoneAbbreviation(date: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? 'CT';
}

/** Pieces for calendar-style date blocks. */
export function dateBlock(date: Date) {
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, ...o }).format(date);
  return { weekday: fmt({ weekday: 'short' }), month: fmt({ month: 'short' }), day: fmt({ day: 'numeric' }), year: fmt({ year: 'numeric' }) };
}

/** Human-readable time range: "6:30–8 p.m. CST", "All day". */
export function formatTimeRange(start: Date, end: Date | null, allDay: boolean): string {
  if (allDay) return 'All day';
  const zone = zoneAbbreviation(start);
  if (!end) return `${formatTime(start)} ${zone}`;
  const sameDay = formatLongDate(start) === formatLongDate(end);
  if (!sameDay) return `${formatTime(start)} ${zone} until ${formatLongDate(end)}, ${formatTime(end)}`;
  const s = formatTime(start);
  const e = formatTime(end);
  const sMer = s.match(/(a\.m\.|p\.m\.)$/)?.[0];
  const eMer = e.match(/(a\.m\.|p\.m\.)$/)?.[0];
  const startText = sMer && sMer === eMer ? s.replace(` ${sMer}`, '') : s;
  return `${startText}–${e} ${zone}`;
}
