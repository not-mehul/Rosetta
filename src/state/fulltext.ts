// Searching inside every book. A document's words are kept in IndexedDB the
// first time it is opened (or searched, if it never was), so later searches
// only read text. Pictures (comics) have no words to keep.

import { openDocument, type OpenDoc } from '../formats';
import { excerpt } from '../reader/offsets';
import { queryPattern, searchJoined, type Hit } from '../reader/search';
import { pageToHtml } from '../formats/pdftext';
import { t } from '../i18n/index.svelte';
import { db, type StoredDoc, type TextIndex } from './db';
import { library } from './library.svelte';

/** Excerpts shown per book; the count says how many more. */
export const SHOWN_PER_BOOK = 3;

export interface LibraryHit extends Hit {
  where: string;
  before: string;
  match: string;
  after: string;
}

export interface BookHits {
  doc: StoredDoc;
  count: number;
  hits: LibraryHit[];
}

/** The words of an open document, as the reader's offsets count them. */
export async function textsOf(content: OpenDoc): Promise<TextIndex['sections']> {
  if (content.kind === 'flow') return content.pictures ? [] : content.sections.map((s) => ({ title: s.title, text: s.text, ...(s.joins?.length ? { joins: s.joins } : {}) }));
  const pages: TextIndex['sections'] = [];
  for (let i = 0; i < content.pageCount; i++) {
    // The page's text as search knows it, with where its lines meet, so a phrase across a line is found.
    const { text, joins } = pageToHtml(await content.pageItems(i));
    pages.push({ title: t('reader.pageOf', { page: i + 1, pages: content.pageCount }), text, ...(joins.length ? { joins } : {}) });
  }
  return pages;
}

/** Keeps an opened document's words, if they aren't kept already. */
export async function rememberText(id: string, content: OpenDoc): Promise<void> {
  if (await db.texts.get(id).catch(() => undefined)) return;
  const sections = await textsOf(content);
  await db.texts.put({ id, sections }).catch(() => undefined);
}

/** A document's words: kept, or read from its file now (and kept). Null when there's no file or it won't open. */
export async function wordsOf(doc: StoredDoc): Promise<TextIndex | null> {
  const kept = await db.texts.get(doc.id).catch(() => undefined);
  if (kept) return kept;
  if (doc.offloaded) return null;
  const bytes = await library.bytes(doc.id).catch(() => null);
  if (!bytes) return null;
  let content: OpenDoc;
  try {
    content = await openDocument(bytes, doc.format, doc.password);
  } catch {
    // A locked PDF without its password, or a file that no longer opens.
    return null;
  }
  try {
    const row = { id: doc.id, sections: await textsOf(content) };
    await db.texts.put(row).catch(() => undefined);
    return row;
  } finally {
    content.dispose();
  }
}

/** The places a pattern matches in one document's words, with a few excerpts. */
export function hitsIn(words: TextIndex, pattern: RegExp): { count: number; hits: LibraryHit[] } {
  const found: Hit[] = [];
  words.sections.forEach((s, i) => searchJoined(s.text, s.joins ?? [], pattern, i, found));
  return {
    count: found.length,
    hits: found.slice(0, SHOWN_PER_BOOK).map((h) => ({ ...h, where: words.sections[h.section]!.title, ...excerpt(words.sections[h.section]!.text, h.start, h.end, 40) })),
  };
}

/**
 * Searches every document's words, calling `onResults` as books are done
 * (reading the ones never opened takes a moment the first time). Returns a
 * function that stops the search.
 */
export function searchLibrary(query: string, docs: readonly StoredDoc[], onResults: (books: BookHits[], done: number, total: number) => void): () => void {
  const pattern = queryPattern(query);
  let stopped = false;
  const books: BookHits[] = [];
  if (!pattern) {
    onResults([], 0, 0);
    return () => undefined;
  }
  void (async () => {
    for (let i = 0; i < docs.length && !stopped; i++) {
      const doc = docs[i]!;
      const words = await wordsOf(doc);
      if (stopped) return;
      if (words) {
        const { count, hits } = hitsIn(words, pattern);
        if (count) books.push({ doc, count, hits });
      }
      onResults([...books], i + 1, docs.length);
    }
  })();
  return () => {
    stopped = true;
  };
}
