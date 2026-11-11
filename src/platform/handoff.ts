// Hand-off with the sibling apps, through the URL schemes all five share
// (style.md §14.1, src/platform/links.ts), so it works the same on Android
// and iOS:
//
//   bookshelf://log?title=…&author=…&finished=YYYY-MM-DD&progress=0.42
//     logs a book in BookShelf (sent when a book is finished, or on request).
//   rosetta://open?id=<fingerprint>   or   rosetta://open?title=…
//     opens a document in Rosetta, from BookShelf or anywhere else.
//
// Colophon reads EPUB files, so a book goes to it through the system's
// "open with" sheet, which lists Colophon once it is installed.

import { AppLauncher } from '@capacitor/app-launcher';
import { buildLink, parseLink } from './links';
import { isNative } from './native';
import { shareFile } from './output';

export interface BookShelfEntry {
  title: string;
  author: string;
  finishedAt: number | null;
  progress: number;
}

export function bookShelfUrl(e: BookShelfEntry): string {
  const finished = e.finishedAt ? new Date(e.finishedAt).toISOString().slice(0, 10) : null;
  return buildLink('bookshelf', 'log', { title: e.title, author: e.author, progress: e.progress.toFixed(2), finished }, 'rosetta');
}

/** Opens BookShelf with the entry. False when BookShelf isn't there to take it. */
export async function sendToBookShelf(e: BookShelfEntry): Promise<boolean> {
  const url = bookShelfUrl(e);
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

/** Offers an EPUB to Colophon (and any other app that opens EPUBs). */
export async function openInColophon(name: string, bytes: Uint8Array, title: string): Promise<void> {
  await shareFile({ name, data: bytes, mime: 'application/epub+zip' }, title);
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
