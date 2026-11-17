import { describe, expect, it } from 'vitest';
import { keyTurn, linkTarget, swipeCommits, swipeDirection, tapTurn } from '../../src/reader/gestures';

describe('swipes', () => {
  it('waits until a touch is clearly sideways', () => {
    expect(swipeDirection(-8, 0, false, false)).toBe(0);
    expect(swipeDirection(-30, 40, false, false)).toBe(0);
    expect(swipeDirection(-30, 0, false, true)).toBe(0);
    expect(swipeDirection(-30, 5, false, false)).toBe(1);
    expect(swipeDirection(30, 5, false, false)).toBe(-1);
  });

  it('mirrors in a right-to-left book', () => {
    expect(swipeDirection(-30, 0, true, false)).toBe(-1);
    expect(swipeDirection(30, 0, true, false)).toBe(1);
  });

  it('turns when far enough or fast enough, and springs back otherwise', () => {
    expect(swipeCommits(1, -100, 1000, 400, false)).toBe(true);
    expect(swipeCommits(1, -40, 1000, 400, false)).toBe(false);
    expect(swipeCommits(1, -40, 50, 400, false)).toBe(true);
    // Started forward, came back past the start.
    expect(swipeCommits(1, 100, 1000, 400, false)).toBe(false);
    expect(swipeCommits(-1, 100, 1000, 400, false)).toBe(true);
    expect(swipeCommits(1, 100, 1000, 400, true)).toBe(true);
  });
});

describe('taps and keys', () => {
  it('turns from the outer thirds and leaves the middle for the bars', () => {
    expect(tapTurn(0.1, false)).toBe(-1);
    expect(tapTurn(0.5, false)).toBe(0);
    expect(tapTurn(0.9, false)).toBe(1);
    expect(tapTurn(0.9, true)).toBe(-1);
  });

  it('reads the arrow, page and space keys', () => {
    expect(keyTurn('ArrowRight', false, false)).toBe(1);
    expect(keyTurn('PageUp', false, false)).toBe(-1);
    expect(keyTurn(' ', false, false)).toBe(1);
    expect(keyTurn(' ', true, false)).toBe(-1);
    expect(keyTurn(' ', true, true)).toBe(-1);
    expect(keyTurn('ArrowRight', false, true)).toBe(-1);
    expect(keyTurn('a', false, false)).toBe(0);
  });
});

describe('links', () => {
  it('reads a link to this section, another, or a broken one', () => {
    expect(linkTarget('#n1', 3)).toEqual({ section: 3, anchor: 'n1' });
    expect(linkTarget('5#top', 3)).toEqual({ section: 5, anchor: 'top' });
    expect(linkTarget('5', 3)).toEqual({ section: 5, anchor: undefined });
    expect(Number.isNaN(linkTarget('x#y', 3).section)).toBe(true);
  });
});

describe('two pages on a wide screen', () => {
  it('keeps one column on a phone and in portrait', async () => {
    const { screenColumns } = await import('../../src/reader/paging');
    expect(screenColumns(412, 915, 684, 468, 20, false, true)).toMatchObject({ perScreen: 1, pageW: 372, left: 20 });
    expect(screenColumns(820, 1180, 684, 468, 20, false, true).perScreen).toBe(1);
  });

  it('opens like a book on a tablet held sideways, and not when turned off', async () => {
    const { screenColumns } = await import('../../src/reader/paging');
    const c = screenColumns(1180, 820, 684, 468, 20, false, true);
    expect(c.perScreen).toBe(2);
    // Every column starts half a screen after the last, so a turn is still one screen.
    expect(c.pageW + c.gap).toBe(590);
    expect(c.left).toBe(Math.floor(c.gap / 2));
    expect(screenColumns(1180, 820, 684, 468, 20, false, false).perScreen).toBe(1);
    // A right-to-left book starts on the right.
    const r = screenColumns(1180, 820, 684, 468, 20, true, true);
    expect(r.left).toBe(Math.floor(1180 - r.gap / 2 - r.pageW));
  });

  it('pairs a fixed-layout book’s pages after the cover', async () => {
    const { spreadAt } = await import('../../src/reader/paging');
    expect(spreadAt(0, 6)).toEqual([0]);
    expect(spreadAt(1, 6)).toEqual([1, 2]);
    expect(spreadAt(2, 6)).toEqual([1, 2]);
    expect(spreadAt(5, 6)).toEqual([5]);
    expect(spreadAt(4, 5)).toEqual([3, 4]);
  });

  it('reads manga right to left when ComicInfo says so', async () => {
    const { readsRightToLeft } = await import('../../src/formats/cbz');
    expect(readsRightToLeft('YesAndRightToLeft')).toBe(true);
    expect(readsRightToLeft('Yes')).toBe(false);
    expect(readsRightToLeft('')).toBe(false);
  });
});
