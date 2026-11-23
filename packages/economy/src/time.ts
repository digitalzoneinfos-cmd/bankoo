// All economy calendars run on Algeria local time, never on the child's device clock.
export const TZ = 'Africa/Algiers';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
});
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(d: Date) {
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: WD[p.weekday as string] };
}

/**
 * Economy week key. Bankoo weeks start on Saturday (Algerian school week), so the Saturday salary
 * and the following Sunday bill share one key, e.g. "2026-11-28".
 */
export function isoWeekKey(d: Date): string {
  const { date, weekday } = localParts(d);
  const back = (weekday - 6 + 7) % 7; // days since last Saturday
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - back);
  return `W${t.toISOString().slice(0, 10)}`;
}

/** Next scheduled run (for "expected date" display in the teacher dashboard). */
export function nextRun(from: Date, weekday: number, hour: number): string {
  for (let i = 0; i < 8 * 24; i++) {
    const c = new Date(from.getTime() + i * 3600_000);
    const lp = localParts(c);
    if (lp.weekday === weekday && lp.hour === hour) return `${lp.date} ${String(hour).padStart(2, '0')}:00 (${TZ})`;
  }
  throw new Error('unreachable');
}
