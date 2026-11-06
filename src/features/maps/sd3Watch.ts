import { SD3_SOURCE } from './suddenDessaster3Data';

export { SD3_SOURCE };

/** Handbook timeline checked on this date. Not a map-pack version. */
export const SD3_WATCH_CHECKED_AT = '2026-11-06';

/**
 * The public handbook dates the event through November 8 and lists the final at 17:00 UTC that day.
 * The window therefore stays open until the next UTC midnight, then ends.
 * Ending at the final's start would mark the match over when it is scheduled to begin.
 */
export const SD3_WATCH_ENDS_AT = '2026-11-09T00:00:00.000Z';

export const SD3_WATCH_ROWS = [
  {
    id: 'semifinal',
    label: '半决赛',
    utc: '2026-11-07T15:00:00.000Z',
    shanghai: '2026-11-07 23:00',
    utcText: '2026-11-07 15:00',
  },
  {
    id: 'final',
    label: '决赛',
    utc: '2026-11-08T17:00:00.000Z',
    shanghai: '2026-11-09 01:00',
    utcText: '2026-11-08 17:00',
  },
] as const;

export type Sd3WatchPhase = 'open' | 'ended';

/** Client clock compared with the fixed UTC end. An unreadable clock fails closed so the page cannot look current. */
export function sd3WatchPhase(now: Date): Sd3WatchPhase {
  const time = now.getTime();
  const ends = Date.parse(SD3_WATCH_ENDS_AT);
  if (!Number.isFinite(time) || !Number.isFinite(ends)) return 'ended';
  return time < ends ? 'open' : 'ended';
}
