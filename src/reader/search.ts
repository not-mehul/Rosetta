// Finding words in a document: every section's text, case-insensitively,
// with whitespace in the query matching any run of whitespace.

import { withSpaces } from './sentences';

export interface Hit {
  section: number;
  start: number;
  end: number;
}

export const MAX_HITS = 500;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function queryPattern(query: string): RegExp | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length || query.trim().length < 2) return null;
  return new RegExp(words.map(escapeRe).join('\\s+'), 'giu');
}

export function searchText(text: string, pattern: RegExp, section: number, out: Hit[]): void {
  pattern.lastIndex = 0;
  for (let m = pattern.exec(text); m && out.length < MAX_HITS; m = pattern.exec(text)) {
    out.push({ section, start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) pattern.lastIndex++;
  }
}

/**
 * As searchText, for text whose spaces are only implied at `joins` (a PDF's
 * line ends): words across a line break are found, and hits keep the text's
 * own offsets.
 */
export function searchJoined(text: string, joins: readonly number[], pattern: RegExp, section: number, out: Hit[]): void {
  if (!joins.length) return searchText(text, pattern, section, out);
  const spaced = withSpaces(text, joins);
  const found: Hit[] = [];
  searchText(spaced.text, pattern, section, found);
  for (const h of found) out.push({ section, start: spaced.from[h.start] ?? text.length, end: spaced.from[h.end] ?? text.length });
}

export function search(texts: readonly string[], query: string): Hit[] {
  const pattern = queryPattern(query);
  const out: Hit[] = [];
  if (!pattern) return out;
  texts.forEach((text, i) => searchText(text, pattern, i, out));
  return out;
}
