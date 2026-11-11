// Reading time: while a document is open and the reader is scrolling or
// turning pages, the time is counted per day and document. It gives the
// stats sheet its figures and "time left" the reader's own pace.

import { DEFAULT_PACE } from '../reader/progress';
import { dayKey, longestRun } from '../lib/calendar';
import { db, type ReadingSession } from './db';
import { settings } from './settings.svelte';

/** A pause longer than this isn't reading. */
export const IDLE_MS = 2 * 60_000;
/** A jump (contents, search) moves a long way without being read. */
const MAX_CHARS_PER_STEP = 4000;


export { calendarWeeks, dayKey, longestRun, readingLevel, type CalendarDay } from '../lib/calendar';

export interface Summary {
  todayMs: number;
  /** The last seven days, oldest first. */
  week: { day: string; ms: number }[];
  /** Days in a row with some reading, up to today (or yesterday). */
  streak: number;
  /** The longest run of days in a row with some reading, ever. */
  longest: number;
  totalMs: number;
  /** Characters a minute, from the reader's own sessions. */
  pace: number;
  /** Time read on each day, by YYYY-MM-DD. */
  byDay: ReadonlyMap<string, number>;
  /** Time read in each document, most first. */
  byDoc: { docId: string; ms: number; days: number }[];
}

/** Figures from stored sessions; pure, for the tests. */
export function summarise(sessions: readonly ReadingSession[], now = Date.now()): Summary {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const byDay = new Map<string, number>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const docs = new Map<string, { ms: number; days: number }>();
  let totalMs = 0;
  let paceMs = 0;
  let paceChars = 0;
  for (const s of sessions) {
    byDay.set(s.day, (byDay.get(s.day) ?? 0) + s.ms);
    const doc = docs.get(s.docId) ?? { ms: 0, days: 0 };
    docs.set(s.docId, { ms: doc.ms + s.ms, days: doc.days + 1 });
    totalMs += s.ms;
    if (s.chars > 0) {
      paceMs += s.ms;
      paceChars += s.chars;
    }
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = dayKey(now - (6 - i) * 86_400_000);
    return { day, ms: byDay.get(day) ?? 0 };
  });
  let streak = 0;
  // A streak still counts this morning if yesterday was read.
  let t = byDay.get(dayKey(now)) ? now : now - 86_400_000;
  while (byDay.get(dayKey(t))) {
    streak++;
    t -= 86_400_000;
  }
  const pace = paceMs >= 10 * 60_000 ? Math.round(paceChars / (paceMs / 60_000)) : DEFAULT_PACE;
  return {
    todayMs: byDay.get(dayKey(now)) ?? 0,
    week,
    streak,
    longest: longestRun([...byDay].filter(([, ms]) => ms > 0).map(([day]) => day)),
    totalMs,
    pace: Math.max(300, Math.min(6000, pace)),
    byDay,
    byDoc: [...docs].map(([docId, d]) => ({ docId, ...d })).sort((a, b) => b.ms - a.ms),
  };
}

class StatsState {
  /** Characters a minute; loaded at start and refreshed as sessions are saved. */
  pace = $state(DEFAULT_PACE);
  /** Time read today, as saved; for the daily goal. */
  todayMs = $state(0);
  /** Called once when today's reading reaches the daily goal (main.ts shows a toast). */
  onGoal: ((minutes: number) => void) | null = null;

  private docId: string | null = null;
  private last = 0;
  private pending = { ms: 0, chars: 0 };
  private sessionTime = 0;

  /** Time read since the document was opened, saved or not. */
  get sessionMs(): number {
    return this.sessionTime;
  }

  async load(): Promise<void> {
    const before = this.todayMs;
    const summary = summarise(await db.sessions.toArray().catch(() => []));
    this.pace = summary.pace;
    this.todayMs = summary.todayMs;
    // Only a crossing made while reading: not on start, and not when the goal is moved below today's time.
    const goal = settings.value.dailyGoal;
    if (goal && before > 0 && before < goal * 60_000 && summary.todayMs >= goal * 60_000) this.onGoal?.(goal);
  }

  begin(docId: string): void {
    void this.flush();
    this.docId = docId;
    this.last = performance.now();
    this.sessionTime = 0;
  }

  /** The reader moved: count the time since the last move, if it wasn't a pause. */
  activity(docId: string, chars: number): void {
    if (docId !== this.docId) this.begin(docId);
    const now = performance.now();
    const gap = now - this.last;
    if (gap < IDLE_MS) {
      this.pending.ms += gap;
      this.sessionTime += gap;
      if (chars <= MAX_CHARS_PER_STEP) this.pending.chars += chars;
    }
    this.last = now;
  }

  end(): void {
    void this.flush();
    this.docId = null;
  }

  async flush(): Promise<void> {
    const docId = this.docId;
    const { ms, chars } = this.pending;
    if (!docId || ms < 1000) return;
    this.pending = { ms: 0, chars: 0 };
    const day = dayKey();
    const id = `${day}|${docId}`;
    try {
      await db.transaction('rw', db.sessions, async () => {
        const row = await db.sessions.get(id);
        await db.sessions.put({
          id,
          day,
          docId,
          ms: (row?.ms ?? 0) + Math.round(ms),
          chars: (row?.chars ?? 0) + chars,
        });
      });
      await this.load();
    } catch (err) {
      console.warn('Saving reading time failed:', err);
    }
  }

  async summary(): Promise<Summary> {
    await this.flush();
    return summarise(await db.sessions.toArray());
  }
}

export const stats = new StatsState();
