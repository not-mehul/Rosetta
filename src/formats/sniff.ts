// Which reader a file needs, from its first bytes and, failing that, its name.

import { strFromU8, unzipSync } from 'fflate';
import { decodeText, isUtf8, looksLikeText } from './text';
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
  fb2: 'fb2',
  cbz: 'cbz',
  rtf: 'rtf',
  odt: 'odt',
  mobi: 'mobi',
  azw3: 'mobi',
  azw: 'mobi',
  prc: 'mobi',
};

/** The `accept` list for the file picker. */
export const ACCEPT = [
  '.epub,.pdf,.docx,.md,.markdown,.txt,.html,.htm,.xhtml,.fb2,.cbz,.rtf,.odt,.mobi,.azw3,.azw,.prc',
  'application/epub+zip',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
  'text/html',
  'application/x-fictionbook+xml',
  'application/vnd.comicbook+zip',
  'application/x-cbz',
  'application/rtf',
  'text/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/x-mobipocket-ebook',
  'application/vnd.amazon.ebook',
].join(',');

/** Whether a file's name is one Rosetta reads, for picking files out of a folder. */
export const isReadableName = (name: string) => extension(name) in EXT;

export function extension(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

/** A page image in a comic archive. */
export const IMAGE = /\.(jpe?g|png|gif|webp|avif)$/i;

/** A zip of page images, with nothing in it but pictures and the odd bit of metadata. */
export function isComicArchive(names: string[]): boolean {
  const files = names.filter((n) => !n.endsWith('/'));
  // Besides the pages: metadata, release notes, and what Windows and macOS leave behind (Thumbs.db, desktop.ini, __MACOSX).
  return files.some((n) => IMAGE.test(n)) && files.every((n) => IMAGE.test(n) || n.startsWith('__MACOSX/') || /(^|\/)\./.test(n) || /\.(xml|json|txt|nfo|sfv|md5|url|ini|db)$/i.test(n));
}

/** A Palm database whose type and creator say MOBI (the KF8 .azw3 too). */
export const isMobi = (bytes: Uint8Array) => bytes.length > 68 && String.fromCharCode(...bytes.subarray(60, 68)) === 'BOOKMOBI';

const startsWith = (bytes: Uint8Array, ascii: string) => [...ascii].every((c, i) => bytes[i] === c.charCodeAt(0));

/** Null when the file is none of the formats Rosetta reads. */
export function detectFormat(bytes: Uint8Array, name: string): Format | null {
  if (startsWith(bytes, '%PDF')) return 'pdf';
  if (startsWith(bytes, 'PK\u0003\u0004')) {
    const all: string[] = [];
    let found: Record<string, Uint8Array>;
    try {
      found = unzipSync(bytes, {
        filter: (f) => {
          all.push(f.name);
          return f.name === 'mimetype' || f.name === 'word/document.xml' || f.name === 'META-INF/container.xml';
        },
      });
    } catch {
      return null;
    }
    if (found['word/document.xml']) return 'docx';
    const mimetype = found.mimetype ? strFromU8(found.mimetype).trim() : '';
    if (mimetype === 'application/vnd.oasis.opendocument.text') return 'odt';
    if (mimetype.startsWith('application/vnd.oasis.opendocument')) return null;
    if (found.mimetype || found['META-INF/container.xml']) return 'epub';
    if (isComicArchive(all)) return 'cbz';
    return null;
  }
  if (startsWith(bytes, '{\\rtf')) return 'rtf';
  if (isMobi(bytes)) return 'mobi';
  // A PDF may have junk before its header (the spec allows 1 KB of it). A text
  // file that only mentions "%PDF-" isn't one: a real PDF's first lines aren't
  // clean text, or it says it's a PDF.
  if (new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-') && (extension(name) === 'pdf' || !isUtf8(bytes.subarray(0, 4096), bytes.length <= 4096))) return 'pdf';
  if (!looksLikeText(bytes)) return null;
  const start = decodeText(bytes.subarray(0, 1024));
  if (/^\s*(<\?xml[^>]*>\s*)?<FictionBook\b/.test(start)) return 'fb2';
  const byName = EXT[extension(name)];
  if (byName && !['epub', 'pdf', 'docx', 'fb2', 'cbz', 'rtf', 'odt', 'mobi'].includes(byName)) return byName;
  // No useful extension (an Android content:// URI): look at the text itself.
  const head = decodeText(bytes.subarray(0, 4096)).trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  if (/^(#{1,6} |---\n)/m.test(head) || /\[[^\]]+\]\([^)]+\)/.test(head)) return 'md';
  return 'txt';
}

/** A readable title from a file name: "the_art-of.reading.md" → "The art of reading". */
export function titleFromName(name: string): string {
  // "the_art-of-reading" is a slug; "Jean-Paul Sartre" is a name.
  const raw = name.replace(/\.[a-z0-9]+$/i, '');
  const base = (/\s/.test(raw) ? raw.replace(/_+/g, ' ') : raw.replace(/[-_]+/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!base) return 'Untitled';
  return base.charAt(0).toUpperCase() + base.slice(1);
}
