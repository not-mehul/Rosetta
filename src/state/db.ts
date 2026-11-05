// Rosetta's IndexedDB (Dexie). A document's bytes live in their own table, so
// listing the library stays light; marks (bookmarks and highlights) are kept
// per document.

import Dexie, { type EntityTable } from 'dexie';
import type { Format } from '../formats/types';
import type { Location } from '../reader/progress';
import type { Settings } from './settings';

export interface StoredDoc {
  /** SHA-256 of the file, so the same file added twice is one document. */
  id: string;
  fileName: string;
  format: Format;
  title: string;
  author: string;
  size: number;
  cover: Uint8Array | null;
  addedAt: number;
  openedAt: number | null;
  /** Where reading stopped. */
  location: Location | null;
  /** 0…1. */
  progress: number;
  finishedAt: number | null;
  /** Free tags, lower case. */
  tags: string[];
  /** Ids of the collections the document is on. */
  collections: string[];
  series: string;
  /** The volume in the series, when known. */
  seriesIndex: number | null;
  /** The file was let go to save space; marks and place are kept. */
  offloaded: boolean;
  /** For a password-protected PDF, so it opens without asking again. Kept on this device only. */
  password?: string;
  /** Last change to place, progress or details, for sync. */
  updatedAt: number;
}

export interface StoredBytes {
  id: string;
  /** Blob since version 2 (IndexedDB keeps it as a file); Uint8Array before. */
  bytes: Blob | Uint8Array;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
}

/** A day's reading of one document, for stats and the reader's own pace. */
export interface ReadingSession {
  /** `${day}|${docId}` */
  id: string;
  /** YYYY-MM-DD, local time. */
  day: string;
  docId: string;
  /** Time spent reading. */
  ms: number;
  /** Characters moved through while reading (flow documents), for the pace. */
  chars: number;
}

/** A deleted mark, so sync can delete it elsewhere too. */
export interface Tombstone {
  id: string;
  deletedAt: number;
}

/** A PDF's extracted page text, so a second search doesn't re-read every page. */
export interface PdfTextCache {
  id: string;
  pages: (string | null)[];
}

export type HighlightColour = 'amber' | 'sage' | 'bright';

export interface Mark {
  id: string;
  docId: string;
  kind: 'bookmark' | 'highlight';
  section: number;
  /** Character offsets in the section (a bookmark has start === end). */
  start: number;
  end: number;
  /** The highlighted words, or the first words after a bookmark. */
  text: string;
  /** The chapter or page it is in, for the lists. */
  where: string;
  colour: HighlightColour;
  note: string;
  createdAt: number;
  /** Last change (colour, note), for sync. Missing on marks from version 1. */
  updatedAt?: number;
}

export interface StoredSettings {
  id: 'settings';
  value: Partial<Settings>;
}

export const db = new Dexie('rosetta') as Dexie & {
  docs: EntityTable<StoredDoc, 'id'>;
  bytes: EntityTable<StoredBytes, 'id'>;
  marks: EntityTable<Mark, 'id'>;
  settings: EntityTable<StoredSettings, 'id'>;
  collections: EntityTable<Collection, 'id'>;
  sessions: EntityTable<ReadingSession, 'id'>;
  tombstones: EntityTable<Tombstone, 'id'>;
  pdfText: EntityTable<PdfTextCache, 'id'>;
};

db.version(1).stores({
  docs: 'id, openedAt, addedAt',
  bytes: 'id',
  marks: 'id, docId, [docId+section]',
  settings: 'id',
});

db.version(2)
  .stores({
    docs: 'id, openedAt, addedAt, *tags, *collections',
    collections: 'id',
    sessions: 'id, day, docId',
    tombstones: 'id',
    pdfText: 'id',
  })
  .upgrade((tx) =>
    tx
      .table('docs')
      .toCollection()
      .modify((d: Partial<StoredDoc>) => {
        d.tags ??= [];
        d.collections ??= [];
        d.series ??= '';
        d.seriesIndex ??= null;
        d.offloaded ??= false;
        d.updatedAt ??= d.openedAt ?? d.addedAt ?? Date.now();
      }),
  );

/** Fills fields added after a document was stored (backups, sync, old rows). */
export function withDefaults(d: Partial<StoredDoc> & Pick<StoredDoc, 'id'>): StoredDoc {
  return {
    fileName: '',
    format: 'txt',
    title: '',
    author: '',
    size: 0,
    cover: null,
    addedAt: Date.now(),
    openedAt: null,
    location: null,
    progress: 0,
    finishedAt: null,
    tags: [],
    collections: [],
    series: '',
    seriesIndex: null,
    offloaded: false,
    updatedAt: d.openedAt ?? d.addedAt ?? Date.now(),
    ...d,
  } as StoredDoc;
}

/** The bytes of a stored file, whichever way it was stored. */
export async function toBytes(stored: Blob | Uint8Array): Promise<Uint8Array> {
  return stored instanceof Uint8Array ? stored : new Uint8Array(await stored.arrayBuffer());
}

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return crypto.randomUUID();
}
