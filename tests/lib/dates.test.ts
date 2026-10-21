import { describe, expect, it } from 'vitest';
import { formatTime, formatTimeRange, localToDate, toZonedIso, zoneAbbreviation } from '../../src/lib/dates.ts';

describe('Van (America/Chicago) time handling', () => {
  it('converts local times to the right instant in standard and daylight time', () => {
    expect(localToDate('2026-11-12T18:30').toISOString()).toBe('2026-11-13T00:30:00.000Z'); // CST, UTC-6
    expect(localToDate('2026-07-04T09:00').toISOString()).toBe('2026-07-04T14:00:00.000Z'); // CDT, UTC-5
  });

  it('handles the days daylight saving time changes', () => {
    // 2026-03-08: clocks jump 2:00 -> 3:00. 2026-11-01: clocks fall back 2:00 -> 1:00.
    expect(localToDate('2026-03-08T01:30').toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(localToDate('2026-03-08T03:30').toISOString()).toBe('2026-03-08T08:30:00.000Z');
    expect(localToDate('2026-11-01T12:00').toISOString()).toBe('2026-11-01T18:00:00.000Z');
  });

  it('formats offsets and zone names for structured data and display', () => {
    expect(toZonedIso(localToDate('2026-11-12T18:30'))).toBe('2026-11-12T18:30:00-06:00');
    expect(toZonedIso(localToDate('2026-07-04T09:00'))).toBe('2026-07-04T09:00:00-05:00');
    expect(zoneAbbreviation(localToDate('2026-11-12T18:30'))).toBe('CST');
    expect(zoneAbbreviation(localToDate('2026-07-04T09:00'))).toBe('CDT');
  });

  it('writes times in AP style', () => {
    expect(formatTime(localToDate('2026-11-12T18:30'))).toBe('6:30 p.m.');
    expect(formatTime(localToDate('2026-11-12T12:00'))).toBe('noon');
    expect(formatTimeRange(localToDate('2026-11-12T18:30'), localToDate('2026-11-12T20:00'), false)).toBe('6:30–8 p.m. CST');
    expect(formatTimeRange(localToDate('2026-11-12T10:00'), localToDate('2026-11-12T14:00'), false)).toBe('10 a.m.–2 p.m. CST');
    expect(formatTimeRange(localToDate('2026-11-12T00:00'), null, true)).toBe('All day');
  });
});
