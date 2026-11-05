// The library: every document added, with its cover, place and progress.

import { FormatError, readInfo } from '../formats';
import { db, hashBytes, type Mark, type StoredDoc } from './db';
import type { LibraryShelf, LibrarySort } from './settings';

export type AddResult = { doc: StoredDoc; added: boolean } | { error: string; name: string };

class LibraryState {
  items = $state.raw<StoredDoc[]>([]);
  loaded = $state(false);
  /** Files being read for the library right now. */
  adding = $state(0);

  async load(): Promise<void> {
    this.items = await db.docs.toArray();
    this.loaded = true;
  }

  get(id: string): StoredDoc | undefined {
    return this.items.find((d) => d.id === id);
  }

  async bytes(id: string): Promise<Uint8Array | undefined> {
    return (await db.bytes.get(id))?.bytes;
  }

  /** Adds a file; a file already in the library is returned as it is. */
  async add(bytes: Uint8Array, fileName: string): Promise<AddResult> {
    this.adding++;
    try {
      const id = await hashBytes(bytes);
      const existing = this.get(id) ?? (await db.docs.get(id));
      if (existing) return { doc: existing, added: false };
      const info = await readInfo(bytes, fileName);
      const doc: StoredDoc = {
        id,
        fileName,
        format: info.format,
        title: info.title,
        author: info.author,
        size: bytes.length,
        cover: info.cover,
        addedAt: Date.now(),
        openedAt: null,
        location: null,
        progress: 0,
        finishedAt: null,
      };
      await db.transaction('rw', db.docs, db.bytes, async () => {
        await db.docs.put(doc);
        await db.bytes.put({ id, bytes });
      });
      this.items = [...this.items, doc];
      return { doc, added: true };
    } catch (err) {
      return { name: fileName, error: err instanceof FormatError ? err.message : `Couldn’t read ${fileName} (${err instanceof Error ? err.message : String(err)}).` };
    } finally {
      this.adding--;
    }
  }

  async update(id: string, patch: Partial<Omit<StoredDoc, 'id'>>): Promise<void> {
    this.items = this.items.map((d) => (d.id === id ? { ...d, ...patch } : d));
    await db.docs.update(id, patch);
  }

  /** Removes a document with its marks, returning a function that puts it all back. */
  async remove(id: string): Promise<() => Promise<void>> {
    const [doc, blob, marks] = await Promise.all([db.docs.get(id), db.bytes.get(id), db.marks.where('docId').equals(id).toArray()]);
    await db.transaction('rw', db.docs, db.bytes, db.marks, async () => {
      await db.docs.delete(id);
      await db.bytes.delete(id);
      await db.marks.where('docId').equals(id).delete();
    });
    this.items = this.items.filter((d) => d.id !== id);
    return async () => {
      if (!doc || !blob) return;
      await db.transaction('rw', db.docs, db.bytes, db.marks, async () => {
        await db.docs.put(doc);
        await db.bytes.put(blob);
        await db.marks.bulkPut(marks);
      });
      await this.load();
    };
  }

  async marks(docId: string): Promise<Mark[]> {
    return db.marks.where('docId').equals(docId).toArray();
  }

  async clear(): Promise<void> {
    await db.transaction('rw', db.docs, db.bytes, db.marks, async () => {
      await Promise.all([db.docs.clear(), db.bytes.clear(), db.marks.clear()]);
    });
    this.items = [];
  }
}

export const library = new LibraryState();

export const isFinished = (d: StoredDoc) => d.finishedAt !== null;
export const isReading = (d: StoredDoc) => !isFinished(d) && d.openedAt !== null;

export function shelve(items: readonly StoredDoc[], shelf: LibraryShelf, sort: LibrarySort, filter = ''): StoredDoc[] {
  const q = filter.trim().toLowerCase();
  const out = items.filter((d) => (shelf === 'all' ? true : shelf === 'finished' ? isFinished(d) : isReading(d)) && (!q || `${d.title} ${d.author} ${d.fileName}`.toLowerCase().includes(q)));
  const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  const surname = (author: string) => author.split(',')[0]!.trim().split(/\s+/).pop() ?? '';
  return out.sort((a, b) => {
    if (sort === 'title') return byText(a.title.replace(/^(the|a|an)\s+/i, ''), b.title.replace(/^(the|a|an)\s+/i, ''));
    if (sort === 'author') return byText(surname(a.author) || '￿', surname(b.author) || '￿') || byText(a.title, b.title);
    return (b.openedAt ?? b.addedAt) - (a.openedAt ?? a.addedAt);
  });
}
