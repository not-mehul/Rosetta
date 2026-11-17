import { describe, expect, it } from 'vitest';
import { readingDone, reminderTimes } from '../../src/lib/reminders';

const at = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('reading reminders', () => {
  it('reminds each day at the time, today included while it is still ahead', () => {
    const times = reminderTimes(new Date(2026, 10, 17, 9, 0), '20:30', false);
    expect(times.map(at)).toEqual(['11/17 20:30', '11/18 20:30', '11/19 20:30', '11/20 20:30', '11/21 20:30', '11/22 20:30', '11/23 20:30']);
  });

  it('leaves today out once it is read, or once the time has gone', () => {
    expect(reminderTimes(new Date(2026, 10, 17, 9, 0), '20:30', true).map(at)[0]).toBe('11/18 20:30');
    expect(reminderTimes(new Date(2026, 10, 17, 21, 0), '20:30', false).map(at)[0]).toBe('11/18 20:30');
    expect(reminderTimes(new Date(2026, 10, 17, 21, 0), '20:30', false)).toHaveLength(7);
  });

  it('runs over the end of a month', () => {
    expect(reminderTimes(new Date(2026, 10, 30, 22, 0), '07:00', false).map(at).slice(0, 2)).toEqual(['12/1 07:00', '12/2 07:00']);
  });

  it('counts the day as read at the goal, or after a minute without one', () => {
    expect(readingDone(29 * 60_000, 30)).toBe(false);
    expect(readingDone(30 * 60_000, 30)).toBe(true);
    expect(readingDone(30_000, 0)).toBe(false);
    expect(readingDone(90_000, 0)).toBe(true);
  });
});
