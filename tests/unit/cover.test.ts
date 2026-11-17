// Covers drawn for books without one.
import { describe, expect, it } from 'vitest';
import { coverInitial, coverTint, TINTS, wrapLines } from '../../src/lib/cover';

describe('drawn covers', () => {
  it('a book keeps its tint, and tints spread across books', () => {
    expect(coverTint('abc123')).toBe(coverTint('abc123'));
    const seen = new Set(Array.from({ length: 40 }, (_, i) => coverTint(`${i}f00d${i * 7}`)));
    expect(seen.size).toBe(TINTS.length);
  });

  it('a small cover shows the first letter that matters', () => {
    expect(coverInitial('The Salt Road')).toBe('S');
    expect(coverInitial('garden diary')).toBe('G');
    expect(coverInitial('“Quoted” title')).toBe('Q');
    expect(coverInitial('Élan')).toBe('É');
    expect(coverInitial('')).toBe('·');
  });

  it('wraps a title into the lines that fit, ending a cut one with an ellipsis', () => {
    const ctx = { measureText: (s: string) => ({ width: s.length * 10 }) as TextMetrics };
    expect(wrapLines(ctx, 'The Salt Road', 100, 3)).toEqual(['The Salt', 'Road']);
    const cut = wrapLines(ctx, 'one two three four five six seven', 100, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1]!.endsWith('…')).toBe(true);
  });
});
