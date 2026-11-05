// Backups, the full archive, and sync.
//
// - Automatic backups: a dated JSON file in Documents/Rosetta/backups once a
//   week (native), keeping the last five.
// - The archive: one .zip with every file plus the backup, for a new phone.
// - Sync: places, marks, details and collections merged with a sync file in a
//   folder the reader chooses (Documents/Rosetta/sync on a phone, which iCloud
//   Drive, Syncthing or Dropbox can carry; any folder in a desktop browser).
//   The files themselves don't sync: each device adds its own copy, and the
//   fingerprint joins them up.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { makeBackup, parseBackup, type Backup } from '../lib/export';
import { base64ToBytes, bytesToBase64 } from '../lib/base64';
import { isNative } from '../platform/native';
import { FOLDER } from '../platform/output';
import { db, toBytes, type Collection, type Mark, type StoredDoc } from './db';
import { library } from './library.svelte';
import { settings } from './settings.svelte';
import { t } from '../i18n/index.svelte';

export const WEEK = 7 * 86_400_000;
export const KEEP_BACKUPS = 5;
const BACKUP_DIR = `${FOLDER}/backups`;
const SYNC_PATH = `${FOLDER}/sync/rosetta-sync.json`;

export async function currentBackup(now = new Date()): Promise<Backup> {
  const [marks, deleted] = await Promise.all([db.marks.toArray(), db.tombstones.toArray()]);
  return makeBackup(library.items, marks, now, library.collections, deleted);
}

// ─── Merge ───────────────────────────────────────────────────

export interface Local {
  docs: StoredDoc[];
  marks: Mark[];
  collections: Collection[];
  deleted: { id: string; deletedAt: number }[];
}

export interface MergeResult {
  /** Document fields to update, by id (only documents in this library). */
  docs: { id: string; patch: Partial<StoredDoc> }[];
  putMarks: Mark[];
  deleteMarks: string[];
  collections: Collection[];
  deleted: { id: string; deletedAt: number }[];
  /** Documents the other side has and this one doesn't, to say so. */
  missing: number;
}

const markTime = (m: Mark) => m.updatedAt ?? m.createdAt;

/**
 * Merges a backup or sync file into this library. Last write wins: per
 * document for its place and details, per mark for its colour and note; a
 * deletion wins over an older edit. Pure, so the tests can drive it.
 */
export function merge(local: Local, remote: Backup): MergeResult {
  const out: MergeResult = {
    docs: [],
    putMarks: [],
    deleteMarks: [],
    collections: [],
    deleted: [],
    missing: 0,
  };
  const localDocs = new Map(local.docs.map((d) => [d.id, d]));
  const localMarks = new Map(local.marks.map((m) => [m.id, m]));
  const deleted = new Map(local.deleted.map((d) => [d.id, d.deletedAt]));
  for (const d of remote.deleted ?? []) if ((deleted.get(d.id) ?? 0) < d.deletedAt) deleted.set(d.id, d.deletedAt);

  for (const r of remote.docs) {
    const mine = localDocs.get(r.id);
    if (!mine) {
      out.missing++;
      continue;
    }
    // Version 1 backups have no updatedAt: they restore over a document never touched since.
    const theirs = r.updatedAt ?? r.openedAt ?? 0;
    if (theirs > mine.updatedAt || (r.updatedAt === undefined && remote.version === 1)) {
      const patch: Partial<StoredDoc> = {
        location: r.location,
        progress: r.progress,
        finishedAt: r.finishedAt,
        openedAt: r.openedAt,
        updatedAt: theirs || Date.now(),
      };
      if (remote.version === 2)
        Object.assign(patch, {
          title: r.title || mine.title,
          author: r.author,
          tags: r.tags ?? mine.tags,
          collections: r.collections ?? mine.collections,
          series: r.series ?? mine.series,
          seriesIndex: r.seriesIndex ?? mine.seriesIndex,
        });
      out.docs.push({ id: r.id, patch });
    }
    for (const m of r.marks) {
      const gone = deleted.get(m.id);
      if (gone !== undefined && gone >= markTime(m)) continue;
      const have = localMarks.get(m.id);
      if (!have || markTime(m) > markTime(have)) out.putMarks.push(m);
    }
  }
  // Marks deleted on the other side.
  for (const [id, at] of deleted) {
    const have = localMarks.get(id);
    if (have && at >= markTime(have)) out.deleteMarks.push(id);
  }
  const byId = new Map(local.collections.map((c) => [c.id, c]));
  for (const c of remote.collections ?? []) if (!byId.has(c.id)) out.collections.push(c);
  out.deleted = [...deleted].map(([id, deletedAt]) => ({ id, deletedAt }));
  return out;
}

/** Applies a merge to the database and the library on screen. */
export async function applyMerge(result: MergeResult): Promise<void> {
  for (const { id, patch } of result.docs) await library.update(id, patch, { touch: false });
  await db.transaction('rw', [db.marks, db.tombstones, db.collections], async () => {
    if (result.putMarks.length) await db.marks.bulkPut(result.putMarks);
    if (result.deleteMarks.length) await db.marks.bulkDelete(result.deleteMarks);
    if (result.collections.length) await db.collections.bulkPut(result.collections);
    await db.tombstones.bulkPut(result.deleted);
  });
  if (result.collections.length) await library.load();
}

export async function restoreBackup(text: string): Promise<MergeResult> {
  const remote = parseBackup(text);
  const local: Local = {
    docs: library.items,
    marks: await db.marks.toArray(),
    collections: library.collections,
    deleted: await db.tombstones.toArray(),
  };
  const result = merge(local, remote);
  await applyMerge(result);
  return result;
}

// ─── Automatic backups (native) ──────────────────────────────

export const backupName = (d: Date) => `rosetta-backup-${d.toISOString().slice(0, 10)}.json`;

/** Which old backups to delete, keeping the newest `keep` (names sort by date). */
export function backupsToPrune(names: string[], keep = KEEP_BACKUPS): string[] {
  return names
    .filter((n) => /^rosetta-backup-\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort()
    .reverse()
    .slice(keep);
}

/** Writes this week's backup if one is due. True when one was written. */
export async function autoBackup(now = Date.now()): Promise<boolean> {
  if (!isNative || !settings.value.autoBackup || !library.items.length) return false;
  if (now - settings.value.lastAutoBackup < WEEK) return false;
  try {
    const backup = await currentBackup(new Date(now));
    await Filesystem.writeFile({
      path: `${BACKUP_DIR}/${backupName(new Date(now))}`,
      directory: Directory.Documents,
      recursive: true,
      data: bytesToBase64(strToU8(JSON.stringify(backup))),
    });
    const { files } = await Filesystem.readdir({
      path: BACKUP_DIR,
      directory: Directory.Documents,
    });
    for (const name of backupsToPrune(files.map((f) => f.name)))
      await Filesystem.deleteFile({
        path: `${BACKUP_DIR}/${name}`,
        directory: Directory.Documents,
      }).catch(() => undefined);
    await settings.update({ lastAutoBackup: now });
    return true;
  } catch (err) {
    console.warn('Automatic backup failed:', err);
    return false;
  }
}

// ─── The archive ─────────────────────────────────────────────

/** Every file and the backup in one zip. Files are stored, not recompressed: EPUB and PDF already are. */
export async function makeArchive(): Promise<Uint8Array> {
  const backup = await currentBackup();
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    'rosetta-backup.json': strToU8(JSON.stringify(backup, null, 2)),
  };
  for (const d of library.items) {
    if (d.offloaded) continue;
    const stored = (await db.bytes.get(d.id))?.bytes;
    if (stored) entries[`files/${d.id.slice(0, 12)}-${d.fileName.replace(/[\\/:*?"<>|]+/g, '_')}`] = [await toBytes(stored), { level: 0 }];
    if (d.cover) entries[`covers/${d.id}.jpg`] = [d.cover, { level: 0 }];
  }
  return zipSync(entries);
}

/** Adds an archive's files to the library, then merges its places and marks. */
export async function restoreArchive(bytes: Uint8Array): Promise<{ added: number; result: MergeResult }> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error(t('error.notArchive'));
  }
  const json = files['rosetta-backup.json'];
  if (!json) throw new Error(t('error.notArchive'));
  const backup = parseBackup(strFromU8(json));
  let added = 0;
  for (const [path, data] of Object.entries(files)) {
    if (!path.startsWith('files/') || path.endsWith('/')) continue;
    const name = path.slice('files/'.length).replace(/^[0-9a-f]{12}-/, '');
    const meta = backup.docs.find((d) => path.includes(d.id.slice(0, 12)));
    const cover = meta ? files[`covers/${meta.id}.jpg`] : undefined;
    const result = await library.add(
      data,
      name,
      meta
        ? {
            title: meta.title,
            author: meta.author,
            ...(cover ? { cover } : {}),
          }
        : {},
    );
    if ('doc' in result && result.added) added++;
  }
  const result = merge(
    {
      docs: library.items,
      marks: await db.marks.toArray(),
      collections: library.collections,
      deleted: await db.tombstones.toArray(),
    },
    backup,
  );
  await applyMerge(result);
  return { added, result };
}

// ─── Sync ────────────────────────────────────────────────────

type DirHandle = {
  getFileHandle: (
    name: string,
    o?: { create?: boolean },
  ) => Promise<{
    getFile: () => Promise<File>;
    createWritable: () => Promise<{
      write: (d: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

/** Desktop browsers can sync with a folder the person picks (File System Access). */
export const canPickSyncFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window && !isNative;

async function folderHandle(): Promise<DirHandle | null> {
  const row = await db.settings.get('syncFolder' as 'settings').catch(() => undefined);
  return ((row?.value as unknown as { handle?: DirHandle })?.handle ?? null) as DirHandle | null;
}

export async function chooseSyncFolder(): Promise<boolean> {
  try {
    const handle = await (
      window as unknown as {
        showDirectoryPicker: (o: object) => Promise<DirHandle>;
      }
    ).showDirectoryPicker({ mode: 'readwrite', id: 'rosetta-sync' });
    await db.settings.put({
      id: 'syncFolder' as 'settings',
      value: { handle } as never,
    });
    return true;
  } catch {
    return false;
  }
}

async function readSync(): Promise<string | null> {
  if (isNative) {
    try {
      const { data } = await Filesystem.readFile({
        path: SYNC_PATH,
        directory: Directory.Documents,
      });
      return typeof data === 'string' ? strFromU8(base64ToBytes(data)) : await data.text();
    } catch {
      return null;
    }
  }
  const dir = await folderHandle();
  if (!dir) return null;
  try {
    return await (await (await dir.getFileHandle('rosetta-sync.json')).getFile()).text();
  } catch {
    return null;
  }
}

async function writeSync(text: string): Promise<void> {
  if (isNative) {
    await Filesystem.writeFile({
      path: SYNC_PATH,
      directory: Directory.Documents,
      recursive: true,
      data: bytesToBase64(strToU8(text)),
    });
    return;
  }
  const dir = await folderHandle();
  if (!dir) throw new Error(t('error.noSyncFolder'));
  const w = await (await dir.getFileHandle('rosetta-sync.json', { create: true })).createWritable();
  await w.write(text);
  await w.close();
}

let syncing: Promise<MergeResult | null> | null = null;

/** Reads the sync file, merges it in, and writes the merged state back. */
export function syncNow(): Promise<MergeResult | null> {
  if (!settings.value.sync) return Promise.resolve(null);
  syncing ??= (async () => {
    try {
      const text = await readSync();
      let result: MergeResult | null = null;
      if (text) {
        try {
          result = merge(
            {
              docs: library.items,
              marks: await db.marks.toArray(),
              collections: library.collections,
              deleted: await db.tombstones.toArray(),
            },
            parseBackup(text),
          );
          await applyMerge(result);
        } catch (err) {
          console.warn('The sync file couldn’t be read; it will be rewritten:', err);
        }
      }
      await writeSync(JSON.stringify(await currentBackup()));
      return result;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}
