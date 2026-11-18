import { describe, expect, it } from 'vitest';
import { addAnchors, anchorLength, anchorRuns } from '../../src/reader/anchors';
import { beatAt, beats, blockBreaks } from '../../src/reader/cadence';
import { mergeSettings } from '../../src/state/settings';

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
    // A font file of one's own is no longer a typeface: back to serif.
    expect(s.typeface).toBe('serif');
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
    expect(e.before + e.match + e.after).toBe('Every ship.\nParagraph one.');
  });

  it('gives large sizes in GB', async () => {
    const { fileSize } = await import('../../src/lib/format');
    expect(fileSize(3072 * 1024 * 1024)).toBe('3.0 GB');
    expect(fileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('note numbers', () => {
  const html = '<p>The keeper kept a log<a epub:type="noteref" href="#n1">1</a> of every ship.</p><p>Paragraph<sup><a href="#n2">2</a></sup> one.</p>';
  const text = 'The keeper kept a log1 of every ship.Paragraph2 one.';

  it('blank the note numbers in the running text, keeping every offset', async () => {
    const { hideNoteRefs, shown } = await import('../../src/reader/notes');
    const hidden = hideNoteRefs(html, text);
    expect(hidden.length).toBe(text.length);
    expect(shown(hidden)).toBe('The keeper kept a log of every ship.Paragraph one.');
    // A link that isn't a note keeps its words.
    expect(hideNoteRefs('<p>See <a href="#c2">chapter 2</a>.</p>', 'See chapter 2.')).toBe('See chapter 2.');
  });

  it('are left out of Flow and search excerpts', async () => {
    const { hideNoteRefs } = await import('../../src/reader/notes');
    const { beats } = await import('../../src/reader/cadence');
    const { excerpt } = await import('../../src/reader/offsets');
    const hidden = hideNoteRefs(html, text);
    expect(beats(html, hidden).map((b) => b.text)).toEqual(['The keeper kept a log of every ship.', 'Paragraph one.']);
    const at = text.indexOf('every');
    const e = excerpt(hidden, at, at + 5, 48, blockBreaks(html));
    expect(e.before + e.match + e.after).toBe('The keeper kept a log of every ship.\nParagraph one.');
  });
});
