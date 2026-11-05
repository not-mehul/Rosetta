// Adding files to the library from the picker, a drop, or "Open with".

import { plural } from '../lib/format';
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
    ui.notify(errors.length === 1 ? errors[0]! : `${plural(errors.length, 'file')} couldn’t be read. Rosetta reads EPUB, PDF, Word, Markdown, HTML and text.`, 'error');
  } else if (added) {
    ui.notify(`Added ${plural(added, 'document')}${known ? `; ${known} already here` : ''}.`, 'success');
  } else if (known) {
    ui.notify(known === 1 ? 'That one is already in the library.' : 'Those are already in the library.', 'info');
  }
}
