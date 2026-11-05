// The logic behind the way back, the footer's figures, chapter ticks, the
// reading calendar, longest streaks, daily goals and the next in a series.
import { describe, expect, it } from 'vitest';
import { calendarWeeks, longestRun, readingLevel } from '../../src/lib/calendar';
import { chapterAt, chapterTicks, globalOffset } from '../../src/reader/progress';
import type { ReadingSession, StoredDoc } from '../../src/state/db';
import { nextInSeries, upNext } from '../../src/state/library.svelte';
import { mergeSettings } from '../../src/state/settings';
import { dayKey, summarise } from '../../src/state/stats.svelte';

const doc = (over: Partial<StoredDoc>): StoredDoc => ({
  id: 'x',
  fileName: 'x.epub',
  format: 'epub',
  title: 'X',
  author: '',
  size: 1,
  cover: null,
  addedAt: 1,
  openedAt: null,
  location: null,
  progress: 0,
  finishedAt: null,
  tags: [],
  collections: [],
  series: '',
  seriesIndex: null,
  offloaded: false,
  updatedAt: 1,
  ...over,
});

describe('chapters in the footer', () => {
  const lengths = [100, 300, 600];
  const starts = [0, 1, 2].map((section) => ({ section, offset: 0 }));

  it('measures places from the start of the document', () => {
    expect(globalOffset(lengths, { section: 1, offset: 50 })).toBe(150);
    expect(globalOffset(lengths, { section: 2, offset: 9999 })).toBe(1000);
  });

  it('puts a tick at each chapter boundary, not at the ends', () => {
    expect(chapterTicks(lengths, starts)).toEqual([0.1, 0.4]);
    // Too many chapters to read as ticks: none.
    const many = Array.from({ length: 100 }, () => 10);
    expect(chapterTicks(many, many.map((_, section) => ({ section, offset: 0 })))).toEqual([]);
  });

  it('knows the chapter, how many there are, and what is left in it', () => {
    expect(chapterAt(lengths, starts, { section: 1, offset: 100 })).toEqual({ index: 2, count: 3, charsLeft: 200 });
    expect(chapterAt(lengths, starts, { section: 2, offset: 600 })).toEqual({ index: 3, count: 3, charsLeft: 0 });
    // One section with headings inside it.
    const one = [{ section: 0, offset: 0 }, { section: 0, offset: 400 }];
    expect(chapterAt([1000], one, { section: 0, offset: 100 })).toEqual({ index: 1, count: 2, charsLeft: 300 });
  });
});

describe('the reading calendar', () => {
  const now = new Date(2026, 10, 5, 9).getTime(); // a Thursday
  const day = (ago: number) => dayKey(now - ago * 86_400_000);

  it('lays out whole weeks, Monday first, ending with this one', () => {
    const weeks = calendarWeeks(new Map([[day(0), 20 * 60_000]]), 4, now);
    expect(weeks).toHaveLength(4);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const last = weeks.at(-1)!;
    expect(new Date(`${last[0]!.day}T12:00`).getDay()).toBe(1);
    expect(last[3]).toMatchObject({ day: day(0), level: 2, future: false });
    expect(last[4]!.future).toBe(true);
    expect(weeks[0]![0]!.day).toBe(dayKey(new Date(2026, 9, 12, 12)));
  });

  it('shades a day by how long it was read', () => {
    expect([0, 1, 15, 30, 60, 240].map((m) => readingLevel(m * 60_000))).toEqual([0, 1, 2, 3, 4, 4]);
  });

  it('finds the longest run of days, across a month', () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-03'])).toBe(3);
    expect(longestRun(['2026-01-01'])).toBe(1);
  });

  it('sums time by document and day, and the longest streak', () => {
    const session = (ago: number, ms: number, docId = 'x'): ReadingSession => ({ id: `${day(ago)}|${docId}`, day: day(ago), docId, ms, chars: 0 });
    const s = summarise([session(10, 1000), session(11, 1000), session(12, 1000, 'y'), session(13, 1000), session(0, 5000, 'y')], now);
    expect(s.longest).toBe(4);
    expect(s.streak).toBe(1);
    expect(s.byDay.get(day(0))).toBe(5000);
    expect(s.byDoc).toEqual([
      { docId: 'y', ms: 6000, days: 2 },
      { docId: 'x', ms: 3000, days: 3 },
    ]);
  });
});

describe('series', () => {
  const one = doc({ id: '1', title: 'One', series: 'The Lanterns', seriesIndex: 1, finishedAt: 100 });
  const two = doc({ id: '2', title: 'Two', series: 'the lanterns ', seriesIndex: 2 });
  const three = doc({ id: '3', title: 'Three', series: 'The Lanterns', seriesIndex: 3 });
  const other = doc({ id: '4', title: 'Elsewhere', series: 'Salt', seriesIndex: 2 });

  it('finds the next unfinished volume', () => {
    expect(nextInSeries([three, one, two, other], one)?.id).toBe('2');
    expect(nextInSeries([three, one, { ...two, finishedAt: 5 }], one)?.id).toBe('3');
    expect(nextInSeries([one, two], three)).toBeUndefined();
    expect(nextInSeries([one, two], doc({ id: '5' }))).toBeUndefined();
  });

  it('offers the next volume after a recent finish only', () => {
    const now = 100 + 86_400_000;
    expect(upNext([one, two], now)).toEqual({ after: one, next: two });
    expect(upNext([one, two], 100 + 90 * 86_400_000)).toBeUndefined();
  });
});

describe('footer and goal settings', () => {
  it('keeps known values and drops the rest', () => {
    expect(mergeSettings({ footerShows: 'chapter', dailyGoal: 30 })).toMatchObject({ footerShows: 'chapter', dailyGoal: 30 });
    expect(mergeSettings({ footerShows: 'everything', dailyGoal: 17 })).toMatchObject({ footerShows: 'book', dailyGoal: 0 });
  });
});
