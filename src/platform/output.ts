// Writing files the reader keeps or sends.
// Native: Documents/Rosetta/ (apps may create files there without storage
// permission on Android 11+; on iOS it is the app's folder in Files). If the
// public write fails, the file goes to the cache and the share sheet.
// Web: a download.

import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { bytesToBase64 } from '../lib/base64';
import { isNative } from './native';

export interface OutputFile {
  name: string;
  data: Uint8Array;
  mime: string;
}

export const FOLDER = 'Rosetta';

function download(file: OutputFile): void {
  const blob = new Blob([file.data as BlobPart], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Saves a file (notes, a backup); the result says where it went. */
export async function saveFile(file: OutputFile): Promise<{ path: string; label: string; uri: string | null }> {
  if (!isNative) {
    download(file);
    return { path: file.name, label: `Downloads/${file.name}`, uri: null };
  }
  const path = `${FOLDER}/${file.name}`;
  try {
    const { uri } = await Filesystem.writeFile({ path, directory: Directory.Documents, recursive: true, data: bytesToBase64(file.data) });
    return { path, label: `Documents/${path}`, uri };
  } catch (err) {
    console.warn('Could not write to Documents, sharing from the cache instead:', err);
    const { uri } = await Filesystem.writeFile({ path: file.name, directory: Directory.Cache, data: bytesToBase64(file.data) });
    await Share.share({ title: file.name, files: [uri] }).catch(() => undefined);
    return { path: '', label: 'the share sheet', uri };
  }
}

/** Opens the share sheet for a file. On the web, downloads it. */
export async function shareFile(file: OutputFile, title: string): Promise<void> {
  if (!isNative) {
    if (navigator.canShare?.({ files: [new File([file.data as BlobPart], file.name, { type: file.mime })] })) {
      try {
        await navigator.share({ title, files: [new File([file.data as BlobPart], file.name, { type: file.mime })] });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
      }
    }
    download(file);
    return;
  }
  const { uri } = await Filesystem.writeFile({ path: file.name, directory: Directory.Cache, data: bytesToBase64(file.data) });
  await Share.share({ title, files: [uri] }).catch(() => undefined);
}

/** Shares text: a note or a quote. */
export async function shareText(title: string, text: string): Promise<boolean> {
  try {
    if (isNative) await Share.share({ title, text });
    else if (navigator.share) await navigator.share({ title, text });
    else {
      await navigator.clipboard.writeText(text);
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Looks a word or phrase up. On a phone the share sheet offers the
 * dictionary and translation apps installed; in a browser a single word
 * opens Wiktionary, and anything longer goes to the share sheet or clipboard.
 */
export async function lookUp(text: string): Promise<void> {
  const q = text.trim();
  if (!q) return;
  if (!isNative && !/\s/.test(q) && navigator.onLine) {
    window.open(`https://en.wiktionary.org/wiki/${encodeURIComponent(q.toLowerCase())}`, '_blank', 'noopener');
    return;
  }
  await shareText(q, q);
}
