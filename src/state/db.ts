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
}

export interface StoredBytes {
  id: string;
  bytes: Uint8Array;
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
};

db.version(1).stores({
  docs: 'id, openedAt, addedAt',
  bytes: 'id',
  marks: 'id, docId, [docId+section]',
  settings: 'id',
});

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return crypto.randomUUID();
}
