// Hand-off with the sibling apps, through the URL schemes they all share
// (style.md §14.1, src/platform/links.ts), so it works the same on Android
// and iOS:
//
//   bookshelf://log?title=…&author=…&finished=YYYY-MM-DD&progress=0.42&note=…
//     logs a book in BookShelf (sent when a book is finished, or on request).
//   bookshelf://quote?text=…&title=…&author=…&where=…&note=…
//     offers a highlight to BookShelf as a quote; it asks before saving it.
//   rosetta://open?id=<fingerprint>   or   rosetta://open?title=…
//     opens a document in Rosetta, from BookShelf or anywhere else.

import { AppLauncher } from '@capacitor/app-launcher';
import { buildLink, parseLink } from './links';
import { isNative } from './native';

export interface BookShelfEntry {
  title: string;
  author: string;
  finishedAt: number | null;
  progress: number;
  /** The note on the whole book, which BookShelf keeps as the entry's notes. */
  note?: string;
}

/** What BookShelf keeps of a note or a quote: longer would make a link no app can open. */
const MAX_NOTE = 2000;
const MAX_QUOTE = 4000;

export function bookShelfUrl(e: BookShelfEntry): string {
  const finished = e.finishedAt ? new Date(e.finishedAt).toISOString().slice(0, 10) : null;
  return buildLink('bookshelf', 'log', { title: e.title, author: e.author, progress: e.progress.toFixed(2), finished, note: e.note?.trim().slice(0, MAX_NOTE) }, 'rosetta');
}

export interface BookShelfQuote {
  /** The highlighted words. */
  text: string;
  title: string;
  author: string;
  /** The chapter or page it is in. */
  where: string;
  note: string;
}

export function bookShelfQuoteUrl(q: BookShelfQuote): string {
  return buildLink(
    'bookshelf',
    'quote',
    { text: q.text.replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE), title: q.title, author: q.author, where: q.where, note: q.note.trim().slice(0, MAX_NOTE) },
    'rosetta',
  );
}

/** Opens BookShelf with the entry. False when BookShelf isn't there to take it. */
export async function sendToBookShelf(e: BookShelfEntry): Promise<boolean> {
  return open(bookShelfUrl(e));
}

/** Offers a highlight to BookShelf as a quote. False when BookShelf isn't there to take it. */
export async function sendQuoteToBookShelf(q: BookShelfQuote): Promise<boolean> {
  return open(bookShelfQuoteUrl(q));
}

async function open(url: string): Promise<boolean> {
  if (!isNative) return false;
  try {
    const { value } = await AppLauncher.canOpenUrl({ url: 'bookshelf://' });
    if (!value) return false;
    await AppLauncher.openUrl({ url });
    return true;
  } catch {
    return false;
  }
}

/** Whether a sibling app is installed to take a link. Always false on the web. */
export async function canOpen(app: 'bookshelf'): Promise<boolean> {
  if (!isNative) return false;
  try {
    return (await AppLauncher.canOpenUrl({ url: `${app}://` })).value;
  } catch {
    return false;
  }
}

export type RosettaLink = { kind: 'open'; id?: string; title?: string } | null;

/** Reads a rosetta:// link: `open` with an id or a title. Other actions are null and just open Rosetta. */
export function parseRosettaUrl(url: string): RosettaLink {
  const link = parseLink(url, 'rosetta');
  if (!link || link.action !== 'open') return null;
  const id = link.params.id || undefined;
  const title = link.params.title || undefined;
  return id || title ? { kind: 'open', id, title } : null;
}
