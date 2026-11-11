import { describe, expect, it } from 'vitest';
import { addAnchors, anchorLength, anchorRuns } from '../../src/reader/anchors';
import { beatAt, beats } from '../../src/reader/cadence';
import { mergeSettings } from '../../src/state/settings';
import { fontName } from '../../src/platform/fonts';

describe('visual anchors', () => {
  it('bolds about the first two fifths of a word', () => {
    expect([1, 2, 3, 4, 5, 8, 10].map(anchorLength)).toEqual([1, 1, 1, 2, 2, 4, 4]);
  });

  it('cuts text into runs without changing it', () => {
    const text = 'The keeper — at 9 o’clock — climbed.';
    const runs = anchorRuns(text);
    expect(runs.map((r) => r.text).join('')).toBe(text);
    expect(runs.filter((r) => r.anchor).map((r) => r.text)).toEqual(['T', 'kee', 'a', 'o’c', 'cli']);
  });

  it('adds anchors to a page and leaves its text, and code, as they were', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Lantern <em>keeper</em></p><pre>keep code</pre>';
    const before = root.textContent;
    addAnchors(root);
    expect(root.textContent).toBe(before);
    expect([...root.querySelectorAll('b.anchor')].map((b) => b.textContent)).toEqual(['Lan', 'kee']);
    expect(root.querySelector('pre')!.innerHTML).toBe('keep code');
  });
});

describe('flow mode', () => {
  const html = '<h1>The stair</h1><p>He climbed. He counted ships.</p><ul><li>One</li><li>Two</li></ul>';
  const text = 'The stairHe climbed. He counted ships.OneTwo';

  it('cuts a section into sentences that never cross a block', () => {
    const list = beats(html, text, 'en');
    expect(list.map((b) => b.text)).toEqual(['The stair', 'He climbed.', 'He counted ships.', 'One', 'Two']);
    expect(list[0]!.heading).toBe(true);
    for (const b of list) expect(text.slice(b.start, b.end)).toBe(b.text);
  });

  it('finds the sentence that holds a place', () => {
    const list = beats(html, text, 'en');
    expect(beatAt(list, 0)).toBe(0);
    expect(beatAt(list, text.indexOf('counted'))).toBe(2);
    expect(beatAt(list, text.length)).toBe(4);
  });

  it('keeps the new settings within range', () => {
    const s = mergeSettings({ readingMode: 'flow', flowSpeed: 500, anchors: true, typeface: 'custom' } as never);
    expect(s.readingMode).toBe('flow');
    expect(s.flowSpeed).toBe(40);
    expect(s.anchors).toBe(true);
    expect(s.typeface).toBe('custom');
  });

  it('names a font after its file', () => {
    expect(fontName('Atkinson_Hyperlegible-Regular.woff2')).toBe('Atkinson Hyperlegible Regular');
  });
});

describe('audit fixes', () => {
  it('keeps paragraphs apart in search excerpts', async () => {
    const { excerpt } = await import('../../src/reader/offsets');
    const { blockBreaks } = await import('../../src/reader/cadence');
    const html = '<p>Every ship.</p><p>Paragraph one.</p>';
    const text = 'Every ship.Paragraph one.';
    const at = text.indexOf('Paragraph');
    const e = excerpt(text, at, at + 9, 48, blockBreaks(html));
    expect(e.before + e.match + e.after).toBe('Every ship. Paragraph one.');
  });

  it('gives large sizes in GB', async () => {
    const { fileSize } = await import('../../src/lib/format');
    expect(fileSize(3072 * 1024 * 1024)).toBe('3.0 GB');
    expect(fileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
