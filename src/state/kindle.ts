// Kindle highlights, brought over from "My Clippings.txt": each one becomes a
// highlight in the same book here, found by its words, with the note made on
// it. A highlight whose words can't be found (a different edition, a book
// that won't open) is kept in the book's own note instead, so nothing is lost.

import { highlightsWithNotes, parseClippings, squashTitle, type ClippedHighlight } from '../lib/clippings';
import { queryPattern, searchJoined, type Hit } from '../reader/search';
import { db, type Mark, type StoredDoc } from './db';
import { wordsOf } from './fulltext';
import { library } from './library.svelte';

export interface KindleImport {
  /** Highlights placed on their words. */
  placed: number;
  /** Highlights and notes kept in a book's note, their words not found. */
  kept: number;
  /** Books in the file that aren't in the library. */
  missing: string[];
}

/** The library's document for a Kindle title: the same title, give or take a subtitle and punctuation. */
function docFor(title: string, author: string, docs: readonly StoredDoc[]): StoredDoc | undefined {
  const key = squashTitle(title);
  if (!key) return undefined;
  const same = docs.filter((d) => squashTitle(d.title) === key);
  if (same.length <= 1) return same[0];
  // Two editions of one title: the one whose author matches.
  const a = squashTitle(author);
  return same.find((d) => a && squashTitle(d.author).includes(a.slice(0, 6))) ?? same[0];
}

/** Where a highlight's words are in a document, as the reader counts them. */
function find(words: NonNullable<Awaited<ReturnType<typeof wordsOf>>>, text: string): Hit | null {
  const pattern = queryPattern(text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
  if (!pattern) return null;
  // Typographic quotes may differ between editions: either kind matches.
  const loose = new RegExp(pattern.source.replace(/"/g, '["“”]').replace(/'/g, "['‘’]"), pattern.flags);
  for (let i = 0; i < words.sections.length; i++) {
    const hits: Hit[] = [];
    searchJoined(words.sections[i]!.text, words.sections[i]!.joins ?? [], loose, i, hits);
    if (hits[0]) return hits[0];
  }
  return null;
}

export async function importKindle(text: string, now = Date.now()): Promise<KindleImport> {
  const result: KindleImport = { placed: 0, kept: 0, missing: [] };
  const byBook = new Map<string, ClippedHighlight[]>();
  for (const h of highlightsWithNotes(parseClippings(text))) byBook.set(h.title, [...(byBook.get(h.title) ?? []), h]);
  for (const [title, highlights] of byBook) {
    const doc = docFor(title, highlights[0]!.author, library.items);
    if (!doc) {
      result.missing.push(title);
      continue;
    }
    const words = await wordsOf(doc).catch(() => null);
    const existing = await library.marks(doc.id);
    const fresh: Mark[] = [];
    const unplaced: ClippedHighlight[] = [];
    for (const h of highlights) {
      const at = h.text && words ? find(words, h.text) : null;
      if (!at) {
        unplaced.push(h);
        continue;
      }
      // Brought over before: the same words already highlighted.
      if ([...existing, ...fresh].some((m) => m.kind === 'highlight' && m.section === at.section && m.start === at.start && m.end === at.end)) continue;
      const section = words!.sections[at.section]!;
      fresh.push({
        id: crypto.randomUUID(),
        docId: doc.id,
        kind: 'highlight',
        section: at.section,
        start: at.start,
        end: at.end,
        text: section.text.slice(at.start, at.end).replace(/\s+/g, ' ').trim(),
        where: section.title,
        colour: 'amber',
        note: h.note,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (fresh.length) await db.marks.bulkPut(fresh);
    result.placed += fresh.length;
    if (unplaced.length) {
      const note = doc.note ?? '';
      const lines = unplaced
        .map((h) => [h.text ? `> ${h.text.replace(/\s+/g, ' ')}` : '', h.note].filter(Boolean).join('\n\n'))
        // Already kept by an earlier import.
        .filter((block) => !note.includes(block));
      if (lines.length) await library.update(doc.id, { note: [note.trim(), ...lines].filter(Boolean).join('\n\n') });
      result.kept += lines.length;
    }
  }
  return result;
}
