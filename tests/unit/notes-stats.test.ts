import { describe, expect, it } from 'vitest';
import { lineOfTheDay, notesMarkdown } from '../../src/lib/export';
import { weekStart } from '../../src/lib/calendar';
import { lastWeek } from '../../src/state/stats.svelte';
import type { Mark, ReadingSession } from '../../src/state/db';

const mark = (over: Partial<Mark>): Mark => ({ id: 'm', docId: 'a', kind: 'highlight', section: 0, start: 0, end: 4, text: 'Call me Ishmael.', where: 'Loomings', colour: 'amber', note: '', createdAt: 1, ...over });
const s = (day: string, docId: string, ms: number): ReadingSession => ({ id: `${day}|${docId}`, day, docId, ms, chars: 0 });

describe('the weekly recap', () => {
  // Wednesday 14 January 2026; last week ran from Monday the 5th to Sunday the 11th.
  const now = new Date(2026, 0, 14, 9).getTime();

  it('finds the Monday of a week', () => {
    expect(weekStart(now)).toBe('2026-01-12');
    expect(weekStart(new Date(2026, 0, 12, 1))).toBe('2026-01-12');
    expect(weekStart(new Date(2026, 0, 11, 23))).toBe('2026-01-05');
  });

  it('sums last week only, with the book read most and the books finished', () => {
    const r = lastWeek([s('2026-01-04', 'a', 9e6), s('2026-01-05', 'a', 600_000), s('2026-01-06', 'b', 1_200_000), s('2026-01-11', 'a', 900_000), s('2026-01-12', 'b', 9e6)], [new Date(2026, 0, 8).getTime(), new Date(2026, 0, 13).getTime(), null], now);
    expect(r).toEqual({ week: '2026-01-05', ms: 2_700_000, days: 3, finished: 1, topDocId: 'a' });
  });

  it('is nothing when nothing was read', () => {
    expect(lastWeek([s('2026-01-13', 'a', 600_000)], [], now)).toBeNull();
  });
});

describe('notes', () => {
  it('puts the note on the book first in its notes', () => {
    const md = notesMarkdown({ title: 'Moby-Dick', author: 'Herman Melville', note: 'Too many whales.' }, [mark({})]);
    expect(md).toBe('# Moby-Dick\n\n*Herman Melville*\n\nToo many whales.\n\n## Loomings\n\n> Call me Ishmael.\n');
  });

  it('keeps the same line all day, and moves on the next', () => {
    const marks = ['a', 'b', 'c', 'd', 'e'].map((id) => mark({ id }));
    expect(lineOfTheDay(marks, '2026-01-14')).toBe(lineOfTheDay([...marks].reverse(), '2026-01-14'));
    const days = new Set(Array.from({ length: 10 }, (_, i) => lineOfTheDay(marks, `2026-01-${10 + i}`)!.id));
    expect(days.size).toBeGreaterThan(1);
    expect(lineOfTheDay([], '2026-01-14')).toBeNull();
  });
});
