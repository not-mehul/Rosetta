// Which reader a file needs, from its first bytes and, failing that, its name.

import { unzipSync } from 'fflate';
import type { Format } from './types';

const EXT: Record<string, Format> = {
  epub: 'epub',
  pdf: 'pdf',
  docx: 'docx',
  md: 'md',
  markdown: 'md',
  mdown: 'md',
  mkd: 'md',
  txt: 'txt',
  text: 'txt',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
};

/** The `accept` list for the file picker. */
export const ACCEPT = [
  '.epub,.pdf,.docx,.md,.markdown,.txt,.html,.htm,.xhtml',
  'application/epub+zip',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
  'text/html',
].join(',');

export function extension(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

const startsWith = (bytes: Uint8Array, ascii: string) => [...ascii].every((c, i) => bytes[i] === c.charCodeAt(0));

/** Null when the file is none of the formats Rosetta reads. */
export function detectFormat(bytes: Uint8Array, name: string): Format | null {
  // PDF may have junk before the header; the spec allows it within 1 KB.
  if (startsWith(bytes, '%PDF') || new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')) return 'pdf';
  if (startsWith(bytes, 'PK\u0003\u0004')) {
    let names: string[];
    try {
      names = Object.keys(unzipSync(bytes, { filter: (f) => f.name === 'mimetype' || f.name === 'word/document.xml' || f.name === 'META-INF/container.xml' }));
    } catch {
      return null;
    }
    if (names.includes('word/document.xml')) return 'docx';
    if (names.includes('mimetype') || names.includes('META-INF/container.xml')) return 'epub';
    return null;
  }
  if (!looksLikeText(bytes)) return null;
  const byName = EXT[extension(name)];
  if (byName && byName !== 'epub' && byName !== 'pdf' && byName !== 'docx') return byName;
  // No useful extension (an Android content:// URI): look at the text itself.
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  if (/^(#{1,6} |---\n)/m.test(head) || /\[[^\]]+\]\([^)]+\)/.test(head)) return 'md';
  return 'txt';
}

/** No NUL bytes and valid UTF-8 in the first 4 KB. */
function looksLikeText(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 4096);
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head.length === bytes.length ? head : trimPartial(head));
    return true;
  } catch {
    return false;
  }
}

/** Drops a multi-byte character cut off at the end of a slice. */
function trimPartial(bytes: Uint8Array): Uint8Array {
  const end = bytes.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const b = bytes[end - i]!;
    if ((b & 0xc0) === 0xc0) return bytes.subarray(0, end - i);
    if ((b & 0x80) === 0) break;
  }
  return bytes;
}

/** A readable title from a file name: "the_art-of.reading.md" → "The art of reading". */
export function titleFromName(name: string): string {
  // "the_art-of-reading" is a slug; "Jean-Paul Sartre" is a name.
  const raw = name.replace(/\.[a-z0-9]+$/i, '');
  const base = (/\s/.test(raw) ? raw.replace(/_+/g, ' ') : raw.replace(/[-_]+/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!base) return 'Untitled';
  return base.charAt(0).toUpperCase() + base.slice(1);
}
