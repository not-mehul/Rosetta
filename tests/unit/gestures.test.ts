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
