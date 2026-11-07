// Days as YYYY-MM-DD keys in local time, runs of them, and the reading
// calendar's weeks. Pure, for the stats and their tests.

/** A day as YYYY-MM-DD, in local time. */
export const dayKey = (t: number | Date = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The day before a YYYY-MM-DD key, by the calendar (safe across clock changes). */
const dayBefore = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y!, m! - 1, d! - 1, 12));
};

/** The longest run of consecutive days among these. */
export function longestRun(days: Iterable<string>): number {
  const set = new Set(days);
  let best = 0;
  for (const day of set) {
    // Count only from the first day of each run.
    if (set.has(dayBefore(day))) continue;
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    let run = 0;
    while (set.has(dayKey(new Date(y, m - 1, d + run, 12)))) run++;
    best = Math.max(best, run);
  }
  return best;
}

export interface CalendarDay {
  day: string;
  ms: number;
  /** 0 (none) … 4 (an hour or more). */
  level: 0 | 1 | 2 | 3 | 4;
  /** After today: drawn empty. */
  future: boolean;
}

/** How much reading a day's cell shows: a little, a quarter hour, half an hour, an hour. */
export function readingLevel(ms: number): CalendarDay['level'] {
  const min = ms / 60_000;
  return min <= 0 ? 0 : min < 15 ? 1 : min < 30 ? 2 : min < 60 ? 3 : 4;
}

/**
 * The last `weeks` weeks as columns of seven days, Monday first, ending with
 * the week that holds `now`. Pure, for the tests.
 */
export function calendarWeeks(byDay: ReadonlyMap<string, number>, weeks: number, now = Date.now()): CalendarDay[][] {
  const today = new Date(now);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7), 12);
  const todayKey = dayKey(now);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (weeks - 1 - w) * 7 + d, 12);
      const day = dayKey(date);
      const ms = byDay.get(day) ?? 0;
      return { day, ms, level: readingLevel(ms), future: day > todayKey };
    }),
  );
}

