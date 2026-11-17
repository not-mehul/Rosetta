// The library: every document added, with its cover, place and progress.

import { FormatError, PasswordError, readInfo, type DocInfo } from '../formats';
import { titleFromName } from '../formats/sniff';
import { db, hashBytes, toBytes, withDefaults, type Collection, type Mark, type StoredDoc } from './db';
import type { LibraryShelf, LibrarySort } from './settings';
import { t } from '../i18n/index.svelte';

export type AddResult = { doc: StoredDoc; added: boolean } | { error: string; name: string };

class LibraryState {
  items = $state.raw<StoredDoc[]>([]);
  collections = $state.raw<Collection[]>([]);
  loaded = $state(false);
  /** Files being read for the library right now. */
  adding = $state(0);
  /** Several files on their way in: how many, and how many are in. Null for one at a time. */
  batch = $state<{ done: number; total: number } | null>(null);

  async load(): Promise<void> {
    const [docs, collections] = await Promise.all([db.docs.toArray(), db.collections.toArray()]);
    this.items = docs.map(withDefaults);
    this.collections = collections.sort((a, b) => a.name.localeCompare(b.name));
    this.loaded = true;
  }

  get(id: string): StoredDoc | undefined {
    return this.items.find((d) => d.id === id);
  }

  async bytes(id: string): Promise<Uint8Array | undefined> {
    const stored = (await db.bytes.get(id))?.bytes;
    return stored ? toBytes(stored) : undefined;
  }

  /** Adds a file; a file already in the library is returned as it is. */
  async add(bytes: Uint8Array, fileName: string, extra: Partial<StoredDoc> = {}): Promise<AddResult> {
    this.adding++;
    try {
      const id = await hashBytes(bytes);
      const existing = this.get(id) ?? (await db.docs.get(id));
      if (existing?.offloaded) {
        // The file of an offloaded document comes back to it.
        await db.bytes.put({ id, bytes: storable(bytes) });
        await this.update(id, { offloaded: false });
        return { doc: this.get(id)!, added: false };
      }
      if (existing) return { doc: withDefaults(existing), added: false };
      let info: DocInfo;
      try {
        info = await readInfo(bytes, fileName, extra.password);
      } catch (err) {
        // A locked PDF goes in as it is: the reader asks for its password when
        // it's opened, then fills in its title and cover (reader.svelte.ts).
        if (!(err instanceof PasswordError) || extra.password) throw err;
        info = { format: 'pdf', title: titleFromName(fileName), author: '', cover: null };
      }
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
        tags: [],
        collections: this.collectionFilter ? [this.collectionFilter] : [],
        series: info.series ?? '',
        seriesIndex: info.seriesIndex ?? null,
        offloaded: false,
        updatedAt: Date.now(),
        ...extra,
      };
      await db.transaction('rw', db.docs, db.bytes, async () => {
        await db.docs.put(doc);
        await db.bytes.put({ id, bytes: storable(bytes) });
      });
      this.items = [...this.items, doc];
      return { doc, added: true };
    } catch (err) {
      return {
        name: fileName,
        error: err instanceof FormatError ? err.message : t('error.couldntRead', { name: fileName, reason: err instanceof Error ? err.message : String(err) }),
      };
    } finally {
      this.adding--;
    }
  }

  /** New documents go on the collection being shown. Set by the library view. */
  collectionFilter = '';

  async update(id: string, patch: Partial<Omit<StoredDoc, 'id'>>, { touch = true } = {}): Promise<void> {
    // Plain values: IndexedDB can't store the proxies $state hands out.
    const plain = $state.snapshot(patch) as Partial<Omit<StoredDoc, 'id'>>;
    const full = touch ? { ...plain, updatedAt: Date.now() } : plain;
    this.items = this.items.map((d) => (d.id === id ? { ...d, ...full } : d));
    await db.docs.update(id, full);
  }

  /** Lets go of a document's file to save space, keeping its marks, place and details. */
  async offload(id: string): Promise<void> {
    await db.bytes.delete(id);
    await this.update(id, { offloaded: true }, { touch: false });
  }

  /** Every tag in use, most used first. */
  get tags(): string[] {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const count = new Map<string, number>();
    for (const d of this.items) for (const t of d.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }

  // ─── Collections ───────────────────────────────────────────

  async createCollection(name: string): Promise<Collection> {
    const trimmed = name.replace(/\s+/g, ' ').trim();
    const existing = this.collections.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const c: Collection = {
      id: crypto.randomUUID(),
      name: trimmed,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.collections.put(c);
    this.collections = [...this.collections, c].sort((a, b) => a.name.localeCompare(b.name));
    return c;
  }

  async renameCollection(id: string, name: string): Promise<void> {
    const patch = { name: name.trim(), updatedAt: Date.now() };
    await db.collections.update(id, patch);
    this.collections = this.collections.map((c) => (c.id === id ? { ...c, ...patch } : c)).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Deletes a collection; its documents stay in the library. */
  async deleteCollection(id: string): Promise<void> {
    // The tombstone tells sync to delete it on the other devices too.
    await db.transaction('rw', db.collections, db.tombstones, async () => {
      await db.collections.delete(id);
      await db.tombstones.put({ id, deletedAt: Date.now() });
    });
    this.collections = this.collections.filter((c) => c.id !== id);
    for (const d of this.items.filter((x) => x.collections.includes(id)))
      await this.update(d.id, {
        collections: d.collections.filter((c) => c !== id),
      });
  }

  async toggleCollection(docId: string, collectionId: string): Promise<void> {
    const d = this.get(docId);
    if (!d) return;
    const on = d.collections.includes(collectionId);
    await this.update(docId, {
      collections: on ? d.collections.filter((c) => c !== collectionId) : [...d.collections, collectionId],
    });
  }

  /** Removes a document with its marks, returning a function that puts it all back. */
  async remove(id: string): Promise<() => Promise<void>> {
    const [doc, blob, marks] = await Promise.all([db.docs.get(id), db.bytes.get(id), db.marks.where('docId').equals(id).toArray()]);
    await db.transaction('rw', [db.docs, db.bytes, db.marks, db.pdfText, db.texts], async () => {
      await db.docs.delete(id);
      await db.bytes.delete(id);
      await db.marks.where('docId').equals(id).delete();
      await db.pdfText.delete(id);
      await db.texts.delete(id);
    });
    this.items = this.items.filter((d) => d.id !== id);
    return async () => {
      // An offloaded document has no file to put back, but its details and marks come back all the same.
      if (!doc) return;
      await db.transaction('rw', db.docs, db.bytes, db.marks, async () => {
        await db.docs.put(doc);
        if (blob) await db.bytes.put(blob);
        await db.marks.bulkPut(marks);
      });
      await this.load();
    };
  }

  async marks(docId: string): Promise<Mark[]> {
    return db.marks.where('docId').equals(docId).toArray();
  }

  async clear(): Promise<void> {
    await db.transaction('rw', [db.docs, db.bytes, db.marks, db.collections, db.sessions, db.pdfText, db.texts], async () => {
      await Promise.all([db.docs.clear(), db.bytes.clear(), db.marks.clear(), db.collections.clear(), db.sessions.clear(), db.pdfText.clear(), db.texts.clear()]);
    });
    this.items = [];
    this.collections = [];
  }

  /** Bytes per document as stored, largest first, for the storage view. */
  async storage(): Promise<{ doc: StoredDoc; bytes: number }[]> {
    return this.items
      .map((doc) => ({
        doc,
        bytes: doc.offloaded ? 0 : doc.size + (doc.cover?.length ?? 0),
      }))
      .sort((a, b) => b.bytes - a.bytes);
  }
}

export const library = new LibraryState();

export const isFinished = (d: StoredDoc) => d.finishedAt !== null;
export const isReading = (d: StoredDoc) => !isFinished(d) && d.openedAt !== null;

/** IndexedDB keeps a Blob as a file rather than inside the database row. */
function storable(bytes: Uint8Array): Blob | Uint8Array {
  return typeof Blob !== 'undefined' && !import.meta.env?.VITEST ? new Blob([bytes as BlobPart]) : bytes;
}

/** Library search: every word must match the title, author, series, file name or a tag ("#tag" matches tags only). */
export function matches(d: StoredDoc, filter: string): boolean {
  const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${d.title} ${d.author} ${d.series} ${d.fileName}`.toLowerCase();
  return words.every((w) => (w.startsWith('#') ? d.tags.some((t) => t.startsWith(w.slice(1))) : hay.includes(w) || d.tags.some((t) => t.startsWith(w))));
}

export function shelve(items: readonly StoredDoc[], shelf: LibraryShelf, sort: LibrarySort, filter = '', collection = ''): StoredDoc[] {
  const out = items.filter(
    (d) => (shelf === 'all' ? true : shelf === 'finished' ? isFinished(d) : isReading(d)) && (!collection || d.collections?.includes(collection)) && matches(withDefaults(d), filter),
  );
  const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  const surname = (author: string) => author.split(',')[0]!.trim().split(/\s+/).pop() ?? '';
  return out.sort((a, b) => {
    if (sort === 'title') return byText(a.title.replace(/^(the|a|an)\s+/i, ''), b.title.replace(/^(the|a|an)\s+/i, ''));
    if (sort === 'author')
      return byText(surname(a.author) || '￿', surname(b.author) || '￿') || byText(a.series ?? '', b.series ?? '') || (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0) || byText(a.title, b.title);
    if (sort === 'series') return byText(a.series || '￿', b.series || '￿') || (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0) || byText(a.title, b.title);
    return (b.openedAt ?? b.addedAt) - (a.openedAt ?? a.addedAt);
  });
}

/** Tags as typed: commas or #s separate them, lower case, no repeats. */
export function parseTags(input: string): string[] {
  return [
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    ...new Set(
      input
        .split(/[,#\n]/)
        .map((s) => s.trim().toLowerCase().replace(/\s+/g, ' '))
        .filter(Boolean),
    ),
  ];
}

/** The next volume of a document's series that is in the library and not finished, if there is one. */
export function nextInSeries(items: readonly StoredDoc[], doc: StoredDoc): StoredDoc | undefined {
  const series = doc.series?.trim().toLowerCase();
  if (!series || doc.seriesIndex === null) return undefined;
  return items
    .filter((d) => d.id !== doc.id && !isFinished(d) && d.seriesIndex !== null && d.seriesIndex > doc.seriesIndex! && d.series?.trim().toLowerCase() === series)
    .sort((a, b) => a.seriesIndex! - b.seriesIndex!)[0];
}

/** Within this long of finishing a volume, the library offers the next one. */
export const UP_NEXT_DAYS = 60;

/** What to read next when nothing is in progress: the next volume after the latest finished one. */
export function upNext(items: readonly StoredDoc[], now = Date.now()): { after: StoredDoc; next: StoredDoc } | undefined {
  const finished = items
    .filter((d) => d.finishedAt !== null && now - d.finishedAt < UP_NEXT_DAYS * 86_400_000)
    .sort((a, b) => b.finishedAt! - a.finishedAt!);
  for (const after of finished) {
    const next = nextInSeries(items, after);
    if (next) return { after, next };
  }
  return undefined;
}
