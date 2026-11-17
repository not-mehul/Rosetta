// A Calibre library folder, added as it is: each book sits in its own folder
// with a metadata.opf (title, authors, series, tags) and a cover.jpg beside
// it, so books arrive with the details Calibre already has, not just what the
// file says. Any folder works; Calibre's files are only used when they're there.

import type { StoredDoc } from '../state/db';
import { isReadableName } from '../formats/sniff';

/** A file found in a folder: where it sits, and how to read it. */
export interface FolderEntry {
  /** Path inside the folder, with forward slashes ("Author/Title (12)/Title.epub"). */
  path: string;
  read: () => Promise<Uint8Array>;
}

export interface OpfDetails {
  title: string;
  author: string;
  series: string;
  seriesIndex: number | null;
  tags: string[];
}

/** Calibre's metadata.opf, read. Null when it isn't one. */
export function parseOpf(xml: string): OpfDetails | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  const all = (name: string) => [...doc.getElementsByTagNameNS('*', name)].map((e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? '').filter(Boolean);
  const metas = [...doc.getElementsByTagNameNS('*', 'meta')];
  const meta = (name: string) => metas.find((m) => m.getAttribute('name') === name)?.getAttribute('content') ?? '';
  const title = all('title')[0] ?? '';
  if (!title) return null;
  const index = Number.parseFloat(meta('calibre:series_index'));
  return {
    title,
    author: all('creator').join(', '),
    series: (meta('calibre:series') || '').trim(),
    seriesIndex: Number.isFinite(index) ? index : null,
    tags: [...new Set(all('subject').map((s) => s.toLowerCase()))],
  };
}

const dir = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const base = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export interface FolderBook {
  name: string;
  bytes: () => Promise<Uint8Array>;
  /** Details from Calibre's files beside it, over what the book itself says. */
  details: (cover: (bytes: Uint8Array) => Promise<Uint8Array | null>) => Promise<Partial<StoredDoc>>;
}

/**
 * The books in a folder, each with the Calibre details beside it. A folder
 * holding one book (in one or more formats) shares its metadata.opf and cover.
 */
export function booksIn(entries: readonly FolderEntry[]): FolderBook[] {
  const byDir = new Map<string, FolderEntry[]>();
  for (const e of entries) byDir.set(dir(e.path), [...(byDir.get(dir(e.path)) ?? []), e]);
  const out: FolderBook[] = [];
  for (const files of byDir.values()) {
    const books = files.filter((f) => isReadableName(base(f.path)) && !/^(metadata\.opf|cover\.(jpe?g|png))$/i.test(base(f.path)));
    const opf = files.find((f) => base(f.path).toLowerCase() === 'metadata.opf');
    const cover = files.find((f) => /^cover\.(jpe?g|png)$/i.test(base(f.path)));
    // Calibre's details describe the one book its folder holds; a folder of many books keeps each file's own.
    const own = books.length > 0 && !!(opf || cover) && new Set(books.map((b) => base(b.path).replace(/\.[^.]+$/, ''))).size === 1;
    for (const b of books) {
      out.push({
        name: base(b.path),
        bytes: b.read,
        details: async (makeCover) => {
          if (!own) return {};
          const found: Partial<StoredDoc> = {};
          const meta = opf ? parseOpf(new TextDecoder().decode(await opf.read())) : null;
          if (meta) {
            Object.assign(found, { title: meta.title, author: meta.author, tags: meta.tags });
            if (meta.series) Object.assign(found, { series: meta.series, seriesIndex: meta.seriesIndex });
          }
          if (cover) {
            const picture = await makeCover(await cover.read()).catch(() => null);
            if (picture) found.cover = picture;
          }
          return found;
        },
      });
    }
  }
  return out;
}
