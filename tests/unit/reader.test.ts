import { describe, expect, it } from 'vitest';
import { excerpt, firstVisibleOffset, paint, rangeAt, selectionOffsets, textOffset, unpaint } from '../../src/reader/offsets';
import { flowLocationAt, flowProgress, pageProgress, timeLeft } from '../../src/reader/progress';
import { search } from '../../src/reader/search';

function section(html: string): HTMLElement {
  const el = document.createElement('article');
  el.innerHTML = html;
  document.body.replaceChildren(el);
  return el;
}

describe('offsets', () => {
  it('maps between DOM points and text offsets', () => {
    const root = section('<p>Hello <em>wide</em> world</p><p>Again</p>');
    const em = root.querySelector('em')!.firstChild!;
    expect(textOffset(root, em, 2)).toBe(8);
    const r = rangeAt(root, 6, 16)!;
    expect(r.toString()).toBe('wide world');
    expect(rangeAt(root, 0, 999)!.toString()).toBe('Hello wide worldAgain');
  });

  it('reads a selection as offsets', () => {
    const root = section('<p>One two three</p>');
    const t = root.querySelector('p')!.firstChild!;
    const r = document.createRange();
    r.setStart(t, 4);
    r.setEnd(t, 7);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
    expect(selectionOffsets(root, getSelection())).toEqual({ start: 4, end: 7, text: 'two' });
  });

  it('paints marks across elements without changing the text, and unpaints them', () => {
    const root = section('<p>Hello <em>wide</em> world</p><p>Again</p>');
    paint(root, [
      { id: 'a', start: 3, end: 19, className: 'hl' },
      { id: 'b', start: 0, end: 2, className: 'hl' },
    ]);
    expect(root.textContent).toBe('Hello wide worldAgain');
    const a = [...root.querySelectorAll('mark[data-mark="a"]')].map((m) => m.textContent);
    expect(a).toEqual(['lo ', 'wide', ' world', 'Aga']);
    expect(root.querySelector('mark[data-mark="b"]')!.textContent).toBe('He');
    unpaint(root);
    expect(root.innerHTML).toBe('<p>Hello <em>wide</em> world</p><p>Again</p>');
  });

  it('gives the end of the text when the section is scrolled past', () => {
    const root = section('<p>abc</p>');
    // jsdom lays nothing out: every box is at 0, so the top line is "past".
    expect(firstVisibleOffset(root, 10)).toBe(3);
  });

  it('makes excerpts around a match', () => {
    const text = 'a'.repeat(100) + 'needle' + 'b'.repeat(100);
    const ex = excerpt(text, 100, 106, 10);
    expect(ex).toEqual({ before: '…aaaaaaaaaa', match: 'needle', after: 'bbbbbbbbbb…' });
  });
});

describe('search', () => {
  it('finds words case-insensitively across sections, with any whitespace between words', () => {
    const hits = search(['The Lantern', 'a lantern\nkeeper; LANTERN keeper'], 'lantern keeper');
    expect(hits).toEqual([
      { section: 1, start: 2, end: 16 },
      { section: 1, start: 18, end: 32 },
    ]);
    expect(search(['x'], 'x')).toEqual([]);
    expect(search(['a.b a+b'], 'a+b')).toEqual([{ section: 0, start: 4, end: 7 }]);
  });
});

describe('progress', () => {
  it('weights sections by length', () => {
    expect(flowProgress([100, 300], { section: 1, offset: 100 })).toBe(0.5);
    expect(flowProgress([100, 300], { section: 0, offset: 0 })).toBe(0);
    expect(flowLocationAt([100, 300], 0.5)).toEqual({ section: 1, offset: 100 });
    expect(pageProgress(4, { section: 2, offset: 5000 })).toBe(0.625);
  });

  it('says how long is left', () => {
    expect(timeLeft(100)).toBe('Under a minute left');
    expect(timeLeft(6 * 250 * 30)).toBe('30 min left');
    expect(timeLeft(6 * 250 * 90)).toBe('1 h 30 min left');
  });
});
