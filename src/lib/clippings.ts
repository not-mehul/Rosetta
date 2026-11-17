// A Kindle's "My Clippings.txt": every highlight and note made on it, one
// after another, each as
//
//   The Title (Author Name)
//   - Your Highlight on page 12 | Location 170-172 | Added on Monday, 3 March 2025 10:00:00
//
//   The words highlighted.
//   ==========
//
// Notes follow the highlight they belong to, at the same location. Bookmarks
// carry no words and are left out.

export interface Clipping {
  title: string;
  author: string;
  kind: 'highlight' | 'note';
  text: string;
  /** The Kindle location (its start), for pairing a note with its highlight. */
  location: number | null;
}

const SEPARATOR = /^={5,}\s*$/m;
// The kind of clipping, in the Kindle's own languages.
const HIGHLIGHT = /highlight|subrayado|surlignement|markierung|evidenziazione|destaque|ハイライト|标注/i;
const NOTE = /\bnote\b|\bnota\b|\bnotiz\b|メモ|笔记/i;
const BOOKMARK = /bookmark|marcador|signet|lesezeichen|segnalibro|ブックマーク|书签/i;

/** "The Title (Author Name)": the author is the last bracketed part. */
function splitTitle(line: string): { title: string; author: string } {
  const clean = line.replace(/^\uFEFF/, '').trim();
  const m = /^(.*)\(([^()]*)\)\s*$/.exec(clean);
  if (!m || !m[1]!.trim()) return { title: clean, author: '' };
  return { title: m[1]!.trim(), author: m[2]!.trim() };
}

export function parseClippings(text: string): Clipping[] {
  const out: Clipping[] = [];
  for (const block of text.replace(/\r\n?/g, '\n').split(SEPARATOR)) {
    const lines = block.split('\n');
    while (lines.length && !lines[0]!.trim()) lines.shift();
    if (lines.length < 2) continue;
    const { title, author } = splitTitle(lines[0]!);
    const info = lines[1]!;
    if (!info.trim().startsWith('-') || BOOKMARK.test(info)) continue;
    const kind = HIGHLIGHT.test(info) ? 'highlight' : NOTE.test(info) ? 'note' : null;
    if (!kind) continue;
    const body = lines.slice(2).join('\n').trim();
    if (!body || !title) continue;
    // "Location 170-172", "Loc. 170", "posición 170-172", "Position 170": the first number after the word.
    const loc = /(?:location|loc\.|posición|position|emplacement|posizione)\s*(\d+)/i.exec(info);
    out.push({ title, author, kind, text: body, location: loc ? Number(loc[1]) : null });
  }
  return out;
}

/** A highlight with the note written on it, if there was one. */
export interface ClippedHighlight {
  title: string;
  author: string;
  text: string;
  note: string;
}

/** Highlights with their notes joined on, the same highlight made twice kept once. */
export function highlightsWithNotes(clippings: readonly Clipping[]): ClippedHighlight[] {
  const out: (ClippedHighlight & { location: number | null })[] = [];
  for (const c of clippings) {
    if (c.kind === 'highlight') {
      const same = out.find((h) => h.title === c.title && h.text === c.text);
      if (!same) out.push({ title: c.title, author: c.author, text: c.text, note: '', location: c.location });
      continue;
    }
    // A note goes on the highlight just before it at the same place, or the last one of that book.
    const owner = [...out].reverse().find((h) => h.title === c.title && (c.location === null || h.location === null || Math.abs(h.location - c.location) <= 2)) ?? null;
    if (owner) owner.note = owner.note ? `${owner.note}\n${c.text}` : c.text;
    else out.push({ title: c.title, author: c.author, text: '', note: c.text, location: c.location });
  }
  return out.map((h) => ({ title: h.title, author: h.author, text: h.text, note: h.note }));
}

/** Titles compared loosely: case, accents, punctuation and a leading article don't matter. */
export const squashTitle = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*[:([].*$/, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
