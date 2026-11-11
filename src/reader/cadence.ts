// Flow mode's pieces: a section cut into sentences, one block (paragraph,
// heading, list item) at a time so a sentence never runs across two of them.
// Each keeps its place as offsets into the section's text, like every other
// place in the reader, so the resume point, contents and search all work.

import { sentences } from './sentences';

export interface Beat {
  start: number;
  end: number;
  text: string;
  /** From a heading: shown larger, revealed at once. */
  heading: boolean;
}

const BLOCK = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, figcaption, pre, td, th, caption, div, section, article, aside, header, footer, body';
const HEADING = /^H[1-6]$/;

/** The beats of a section, from its HTML and its text (the HTML's textContent). */
export function beats(html: string, text: string, lang?: string): Beat[] {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const root = tpl.content;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  /** Text ranges that belong to the same block. */
  const runs: { start: number; end: number; block: Element | null }[] = [];
  let at = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.nodeValue?.length ?? 0;
    const block = n.parentElement?.closest(BLOCK) ?? null;
    const last = runs[runs.length - 1];
    if (last && last.block === block) last.end = at + len;
    else runs.push({ start: at, end: at + len, block });
    at += len;
  }
  const out: Beat[] = [];
  for (const run of runs) {
    const heading = !!run.block && HEADING.test(run.block.tagName);
    const piece = text.slice(run.start, run.end);
    if (!piece.trim()) continue;
    if (heading) {
      const lead = piece.length - piece.trimStart().length;
      const trimmed = piece.trim();
      out.push({ start: run.start + lead, end: run.start + lead + trimmed.length, text: trimmed.replace(/\s+/g, ' '), heading });
      continue;
    }
    for (const s of sentences(piece, 0, lang)) out.push({ start: run.start + s.start, end: run.start + s.end, text: s.text, heading: false });
  }
  return out;
}

/** The beat that holds `offset`, or the next one after it. */
export function beatAt(list: Beat[], offset: number): number {
  if (!list.length) return 0;
  for (let i = 0; i < list.length; i++) if (list[i]!.end > offset) return i;
  return list.length - 1;
}
