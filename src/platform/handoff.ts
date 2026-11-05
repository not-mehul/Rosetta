// Hand-off with the sibling apps, through URL schemes so it works the same on
// Android and iOS:
//
//   bookshelf://log?title=…&author=…&finished=YYYY-MM-DD&progress=0.42
//     logs a book in BookShelf (sent when a book is finished, or on request).
//   rosetta://open?id=<fingerprint>   or   rosetta://open?title=…
//     opens a document in Rosetta, from BookShelf or anywhere else.
//
// Colophon reads EPUB files, so a book goes to it through the system's
// "open with" sheet, which lists Colophon once it is installed.

import { AppLauncher } from '@capacitor/app-launcher';
import { isNative } from './native';
import { shareFile } from './output';

export interface BookShelfEntry {
  title: string;
  author: string;
  finishedAt: number | null;
  progress: number;
}

export function bookShelfUrl(e: BookShelfEntry): string {
  const q = new URLSearchParams({ title: e.title, author: e.author, progress: e.progress.toFixed(2), source: 'rosetta' });
  if (e.finishedAt) q.set('finished', new Date(e.finishedAt).toISOString().slice(0, 10));
  return `bookshelf://log?${q.toString()}`;
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

/** Reads a rosetta:// link. */
export function parseRosettaUrl(url: string): RosettaLink {
  const m = /^rosetta:\/\/([a-z]+)\/?(\?.*)?$/i.exec(url.trim());
  if (!m || m[1]!.toLowerCase() !== 'open') return null;
  const q = new URLSearchParams(m[2] ?? '');
  const id = q.get('id') ?? undefined;
  const title = q.get('title') ?? undefined;
  return id || title ? { kind: 'open', id, title } : null;
}
