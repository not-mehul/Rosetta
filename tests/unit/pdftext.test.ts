import { describe, expect, it } from 'vitest';
import { pageToHtml, type PdfItem } from '../../src/formats/pdftext';
import { searchJoined, queryPattern } from '../../src/reader/search';
import { sentencesWithJoins, withSpaces } from '../../src/reader/sentences';

// A page: a heading, then two paragraphs of two lines, the second indented.
const item = (str: string, x: number, y: number, h = 10, eol = false): PdfItem => ({ str, x, y, w: str.length * 5, h, eol });
const PAGE: PdfItem[] = [
  item('Chart 2', 72, 700, 22, true),
  item('The keeper climbed the', 72, 660, 10, true),
  item('stair at dusk.', 72, 646, 10, true),
  item('Ships', 90, 620, 10),
  item('passed', 130, 620),
  item(' the point.', 165, 620, 10, true),
];

describe('a PDF page as text', () => {
  it('keeps the page’s text exactly, so places and marks match its pages', () => {
    const { text } = pageToHtml(PAGE);
    expect(text).toBe(PAGE.map((i) => i.str).join(''));
  });

  it('finds the heading, the paragraphs and the spaces a PDF leaves out', () => {
    const { html, joins, text } = pageToHtml(PAGE);
    expect(html).toBe('<h2>Chart 2</h2><p>The keeper climbed the<span class="pdf-eol"></span>stair at dusk.</p><p>Ships<span class="pdf-gap"></span>passed the point.</p>');
    expect(withSpaces(text, joins).text).toBe('Chart 2 The keeper climbed the stair at dusk. Ships passed the point.');
  });

  it('reads aloud and searches with the spaces in, at the text’s own offsets', () => {
    const { text, joins } = pageToHtml(PAGE);
    const said = sentencesWithJoins(text, joins);
    expect(said.map((s) => s.text.trim())).toEqual(['Chart 2 The keeper climbed the stair at dusk.', 'Ships passed the point.']);
    const s = said.find((x) => x.text.includes('keeper'))!;
    expect(text.slice(s.start, s.end)).toContain('climbed thestair');
    const hits: { section: number; start: number; end: number }[] = [];
    searchJoined(text, joins, queryPattern('the stair')!, 0, hits);
    expect(hits).toHaveLength(1);
    expect(text.slice(hits[0]!.start, hits[0]!.end)).toBe('thestair');
  });

  it('leaves a page without words as it is', () => {
    expect(pageToHtml([item(' ', 0, 0)])).toEqual({ html: ' ', text: ' ', joins: [] });
  });
});
