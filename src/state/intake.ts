// Adding files to the library from the picker, a drop, or "Open with".

import { t } from '../i18n/index.svelte';
import { booksIn, type FolderEntry } from '../lib/calibre';
import { coverFrom, fileBytes, pickFolder } from '../lib/pick';
import { pickFolder as pickNativeFolder, readFolderBytes, walkFolder } from '../platform/folders';
import { isNative } from '../platform/native';
import { library } from './library.svelte';
import type { StoredDoc } from './db';
import { reader } from './reader.svelte';
import { ui } from './ui.svelte';

export interface IncomingFile {
  name: string;
  bytes: Uint8Array | (() => Promise<Uint8Array>);
  /** Details known from elsewhere (a Calibre folder's metadata.opf and cover), over what the file says. */
  details?: () => Promise<Partial<StoredDoc>>;
}

/**
 * Adds files and reports in one toast. With `openSingle`, a single file
 * (added now or already there) opens straight away.
 */
export async function addFiles(files: (File | IncomingFile)[], { openSingle = false } = {}): Promise<void> {
  if (!files.length) return;
  let added = 0;
  let known = 0;
  const errors: string[] = [];
  const failed: string[] = [];
  let last: string | null = null;
  // Several files show their progress as they come in (LibraryView's wavy bar).
  if (files.length > 1) library.batch = { done: 0, total: files.length };
  try {
    for (const f of files) {
      const bytes = f instanceof Blob ? await fileBytes(f) : typeof f.bytes === 'function' ? await f.bytes() : f.bytes;
      const details = f instanceof Blob || !f.details ? {} : await f.details().catch(() => ({}));
      const result = await library.add(bytes, f.name, details);
      if (library.batch) library.batch = { ...library.batch, done: library.batch.done + 1 };
      if ('error' in result) {
        errors.push(result.error);
        failed.push(f.name);
        continue;
      }
      last = result.doc.id;
      if (result.added) added++;
      else known++;
    }
  } finally {
    library.batch = null;
  }
  if (openSingle && files.length === 1 && last) {
    await reader.open(last);
    return;
  }
  if (errors.length) {
    // One file: why. Several: which ones.
    const names = failed.length > 3 ? `${failed.slice(0, 3).join(', ')}, …` : failed.join(', ');
    ui.notify(errors.length === 1 ? errors[0]! : t('intake.unreadable', { count: errors.length, names }), 'error');
  } else if (added) {
    ui.notify(known ? t('intake.addedSome', { count: added, known }) : t('intake.added', { count: added }), 'success');
  } else if (known) {
    ui.notify(known === 1 ? t('intake.knownOne') : t('intake.knownMany'), 'info');
  }
}

/** Brings back the file of an offloaded document: it must be the same file. */
export async function restoreFile(id: string): Promise<void> {
  const { pickFiles } = await import('../lib/pick');
  const { ACCEPT } = await import('../formats/sniff');
  const { hashBytes } = await import('./db');
  const [file] = await pickFiles(ACCEPT, false);
  if (!file) return;
  const bytes = await fileBytes(file);
  if ((await hashBytes(bytes)) !== id) {
    ui.notify(t('intake.differentFile'), 'error');
    return;
  }
  await library.add(bytes, file.name);
  await reader.open(id);
}

/**
 * Adds every book in a folder the person picks: on a phone or tablet through
 * the system's folder picker, in a browser through its folder input. A
 * Calibre library brings its titles, authors, series, tags and covers.
 */
export async function addFolder(): Promise<void> {
  // The picker opens first, while the tap still counts as the person's: a browser refuses it after a wait.
  const entries = await folderEntries();
  if (!entries) return;
  const books = booksIn(entries);
  if (!books.length) {
    ui.notify(t('intake.folderEmpty'), 'info');
    return;
  }
  await addFiles(books.map((b) => ({ name: b.name, bytes: b.bytes, details: () => b.details((bytes) => coverFrom(new Blob([bytes.slice().buffer]))) })));
}

/** The folder's files, or null when the picker was cancelled. */
async function folderEntries(): Promise<FolderEntry[] | null> {
  if (isNative) {
    if (!(await pickNativeFolder('import'))) return null;
    const paths = await walkFolder('import');
    return paths.map((path) => ({ path, read: () => readFolderBytes('import', path) }));
  }
  const files = await pickFolder();
  if (!files.length) return null;
  return files.map((f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, read: () => fileBytes(f) }));
}
