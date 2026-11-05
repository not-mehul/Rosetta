// Adding files to the library from the picker, a drop, or "Open with".

import { t } from '../i18n/index.svelte';
import { fileBytes } from '../lib/pick';
import { library } from './library.svelte';
import { reader } from './reader.svelte';
import { ui } from './ui.svelte';

export interface IncomingFile {
  name: string;
  bytes: Uint8Array | (() => Promise<Uint8Array>);
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
  let last: string | null = null;
  for (const f of files) {
    const bytes = f instanceof Blob ? await fileBytes(f) : typeof f.bytes === 'function' ? await f.bytes() : f.bytes;
    const result = await library.add(bytes, f.name);
    if ('error' in result) {
      errors.push(result.error);
      continue;
    }
    last = result.doc.id;
    if (result.added) added++;
    else known++;
  }
  if (openSingle && files.length === 1 && last) {
    await reader.open(last);
    return;
  }
  if (errors.length) {
    ui.notify(errors.length === 1 ? errors[0]! : t('intake.unreadable', { count: errors.length }), 'error');
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
