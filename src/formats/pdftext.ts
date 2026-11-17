// A PDF's own words laid out as a book's: each page becomes a section of
// paragraphs and headings, read in Rosetta's type, in any reading mode, and
// read aloud. The section's text is exactly the page's text as search and
// highlights know it (every item's string, in order), so places, marks and
// search results mean the same in both views. The spaces a PDF leaves out
// between lines and words are drawn by CSS (::after), not added to the text.

import type { FlowDoc, PdfDoc, Section } from './types';

/** One run of text on a page, in PDF space (y grows upwards). */
export interface PdfItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  eol: boolean;
}

interface Line {
  items: PdfItem[];
  x: number;
  right: number;
  y: number;
  h: number;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};

function lines(items: readonly PdfItem[]): Line[] {
  const out: Line[] = [];
  let line: Line | null = null;
  let broke = true;
  for (const it of items) {
    const sameRow = line && !broke && Math.abs(it.y - line.y) <= Math.max(1, 0.5 * Math.max(it.h, line.h));
    if (!line || !sameRow) {
      line = { items: [], x: it.x, right: it.x + it.w, y: it.y, h: it.h };
      out.push(line);
    }
    line.items.push(it);
    if (it.str.trim()) {
      line.x = Math.min(line.x, it.x);
      line.right = Math.max(line.right, it.x + it.w);
      line.h = Math.max(line.h, it.h);
    }
    broke = it.eol;
  }
  return out;
}

/** A page's items as HTML paragraphs and headings, and its text (all the strings, joined). */
export function pageToHtml(items: readonly PdfItem[]): { html: string; text: string; joins: number[] } {
  const text = items.map((i) => i.str).join('');
  const rows = lines(items);
  const worded = rows.filter((l) => l.items.some((i) => i.str.trim()));
  if (!worded.length) return { html: rows.map((l) => l.items.map((i) => escape(i.str)).join('')).join(''), text, joins: [] };
  const size = median(worded.map((l) => l.h)) || 10;
  const steps = worded.slice(1).map((l, i) => worded[i]!.y - l.y).filter((d) => d > 0);
  const step = median(steps) || size * 1.3;
  const left = Math.min(...worded.map((l) => l.x));
  const right = Math.max(...worded.map((l) => l.right));

  type Block = { tag: 'p' | 'h2' | 'h3'; lines: Line[] };
  const blocks: Block[] = [];
  let prev: Line | null = null;
  for (const l of rows) {
    const words = l.items.some((i) => i.str.trim());
    const tag: Block['tag'] = words && l.h > size * 1.6 ? 'h2' : words && l.h > size * 1.2 ? 'h3' : 'p';
    const last = blocks.at(-1);
    let fresh = !last || !prev || !words;
    if (!fresh && last && prev) {
      const gap = prev.y - l.y;
      fresh =
        tag !== last.tag ||
        gap > step * 1.45 ||
        gap < 0 ||
        // Indented: a new paragraph. Short: the last one ended.
        l.x > left + size * 1.2 ||
        prev.right < right - size * 4;
    }
    if (fresh || !last) blocks.push({ tag, lines: [l] });
    else last.lines.push(l);
    if (words) prev = l;
  }

  // Where the drawn spaces fall in the text, counted as the HTML is written.
  const joins: number[] = [];
  let at = 0;
  const lineHtml = (l: Line) => {
    let out = '';
    l.items.forEach((it, i) => {
      const before = l.items[i - 1];
      // Words a PDF set apart without a space between them.
      if (before && it.str && before.str && !/\s$/.test(before.str) && !/^\s/.test(it.str) && it.x - (before.x + before.w) > it.h * 0.15) {
        out += '<span class="pdf-gap"></span>';
        joins.push(at);
      }
      out += escape(it.str);
      at += it.str.length;
    });
    return out;
  };
  const html = blocks
    .map((b, n) => {
      // A paragraph or heading ends with a break on screen, and a space when read aloud.
      if (n > 0 && at > 0) joins.push(at);
      const inner = b.lines
        .map((l, i) => {
          const next = b.lines[i + 1];
          const tail = l.items.map((x) => x.str).join('');
          // Between lines, a space, unless the line already ends with one or breaks a word with a hyphen.
          const join = next && !/[\s\u00ad-]$/.test(tail) && !/^\s/.test(next.items[0]?.str ?? '');
          const line = lineHtml(l);
          if (!join) return line;
          joins.push(at);
          return `${line}<span class="pdf-eol"></span>`;
        })
        .join('');
      return `<${b.tag}>${inner}</${b.tag}>`;
    })
    .join('');
  return { html, text, joins };
}

/** A whole PDF as a flow document, page by page. Null when it has no words at all (a scan). */
export async function pdfAsFlow(pdf: PdfDoc, title: (page: number) => string, emptyPage: string): Promise<FlowDoc | null> {
  const sections: Section[] = [];
  let words = 0;
  for (let i = 0; i < pdf.pageCount; i++) {
    const { html, text, joins } = pageToHtml(await pdf.pageItems(i));
    words += text.trim().length;
    sections.push({ title: title(i), html: text.trim() ? html : `${html}<p class="pdf-empty" data-label="${escape(emptyPage)}"></p>`, text, joins });
  }
  if (!words) return null;
  return { kind: 'flow', sections, toc: pdf.toc, fromPdf: true, dispose: () => pdf.dispose() };
}
