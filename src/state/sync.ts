// Backups, the full archive, and sync.
//
// - Automatic backups: a dated JSON file daily, weekly or monthly, keeping
//   the last five: in the sync folder once one is chosen, otherwise (on a
//   phone) in Documents/Rosetta/backups.
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
import { canPickFolder, folderStatus, forgetFolder, listFolder, pickFolder, readFolderFile, removeFolderFile, writeFolderFile, type FolderKey } from '../platform/folders';
import { db, toBytes, type Collection, type Mark, type StoredDoc } from './db';
import { library } from './library.svelte';
import { settings } from './settings.svelte';
import { BACKUP_DAYS, cleanBookSettings, portableSettings, restoredSettings, type BackupFrequency } from './settings';
import { t } from '../i18n/index.svelte';
import { ui } from './ui.svelte';

export const KEEP_BACKUPS = 5;
const BACKUP_DIR = `${FOLDER}/backups`;
const SYNC_PATH = `${FOLDER}/sync/rosetta-sync.json`;

export async function currentBackup(now = new Date(), withSettings = false): Promise<Backup> {
  const [marks, deleted] = await Promise.all([db.marks.toArray(), db.tombstones.toArray()]);
  return makeBackup(library.items, marks, now, library.collections, deleted, withSettings ? portableSettings(settings.value) : undefined);
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
  /** New and renamed collections. */
  collections: Collection[];
  /** Collections deleted on the other side. */
  deleteCollections: string[];
  deleted: { id: string; deletedAt: number }[];
  /** Documents the other side has and this one doesn't, to say so. */
  missing: number;
}

const markTime = (m: Mark) => m.updatedAt ?? m.createdAt;
const collectionTime = (c: Collection) => c.updatedAt ?? c.createdAt;

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
    deleteCollections: [],
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
          ...(r.reading ? { reading: cleanBookSettings(r.reading) } : {}),
          ...(typeof r.note === 'string' ? { note: r.note } : {}),
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
  // Collections: last rename wins, and a deletion wins over an older rename.
  const byId = new Map(local.collections.map((c) => [c.id, c]));
  for (const c of remote.collections ?? []) {
    const gone = deleted.get(c.id);
    if (gone !== undefined && gone >= collectionTime(c)) continue;
    const have = byId.get(c.id);
    if (!have || (collectionTime(c) > collectionTime(have) && c.name !== have.name)) out.collections.push(c);
  }
  for (const c of local.collections) {
    const gone = deleted.get(c.id);
    if (gone !== undefined && gone >= collectionTime(c)) out.deleteCollections.push(c.id);
  }
  out.deleted = [...deleted].map(([id, deletedAt]) => ({ id, deletedAt }));
  return out;
}

/** Told after every merge, so the open document can follow a newer place (main.ts sets it). */
let onMerged: ((result: MergeResult) => void) | null = null;
export const whenMerged = (fn: (result: MergeResult) => void) => {
  onMerged = fn;
};

/** Applies a merge to the database and the library on screen. */
export async function applyMerge(result: MergeResult): Promise<void> {
  for (const { id, patch } of result.docs) await library.update(id, patch, { touch: false });
  await db.transaction('rw', [db.marks, db.tombstones, db.collections], async () => {
    if (result.putMarks.length) await db.marks.bulkPut(result.putMarks);
    if (result.deleteMarks.length) await db.marks.bulkDelete(result.deleteMarks);
    if (result.collections.length) await db.collections.bulkPut(result.collections);
    if (result.deleteCollections.length) await db.collections.bulkDelete(result.deleteCollections);
    await db.tombstones.bulkPut(result.deleted);
  });
  if (result.deleteCollections.length) {
    // Documents let go of a collection deleted elsewhere, as they do when it's deleted here.
    const gone = new Set(result.deleteCollections);
    for (const d of library.items.filter((x) => x.collections.some((c) => gone.has(c)))) await library.update(d.id, { collections: d.collections.filter((c) => !gone.has(c)) }, { touch: false });
  }
  if (result.collections.length || result.deleteCollections.length) await library.load();
  onMerged?.(result);
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
  await restoreSettings(remote);
  return result;
}

/** A backup's settings, over the ones in use: restoring is asking for them back. */
async function restoreSettings(backup: Backup): Promise<void> {
  if (backup.settings) await settings.update(restoredSettings(settings.value, backup.settings));
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

/** Whether a backup is due: an hour's slack, so "daily" doesn't drift later each day. */
export function backupDue(frequency: BackupFrequency, last: number, now = Date.now()): boolean {
  if (frequency === 'off') return false;
  return !last || now - last >= BACKUP_DAYS[frequency] * 86_400_000 - 3_600_000;
}

/** Where automatic backups go: the sync folder, or Documents/Rosetta/backups on a phone without one. Null when there is nowhere. */
export async function backupPlace(): Promise<'folder' | 'documents' | null> {
  if ((await folderStatus('sync')).chosen) return 'folder';
  return isNative ? 'documents' : null;
}

/** Writes a backup if one is due (or now, when forced). True when one was written. */
export async function autoBackup(now = Date.now(), force = false): Promise<boolean> {
  if (!library.items.length) return false;
  if (!force && !backupDue(settings.value.autoBackup, settings.value.lastAutoBackup, now)) return false;
  const place = await backupPlace();
  if (!place) return false;
  try {
    const backup = await currentBackup(new Date(now), true);
    const name = backupName(new Date(now));
    const text = JSON.stringify(backup);
    if (place === 'documents') {
      await Filesystem.writeFile({
        path: `${BACKUP_DIR}/${name}`,
        directory: Directory.Documents,
        recursive: true,
        data: bytesToBase64(strToU8(text)),
      });
      const { files } = await Filesystem.readdir({
        path: BACKUP_DIR,
        directory: Directory.Documents,
      });
      for (const old of backupsToPrune(files.map((f) => f.name)))
        await Filesystem.deleteFile({
          path: `${BACKUP_DIR}/${old}`,
          directory: Directory.Documents,
        }).catch(() => undefined);
    } else {
      await writeFolderFile('sync', name, text);
      for (const old of backupsToPrune(await listFolder('sync').catch(() => []))) await removeFolderFile('sync', old).catch(() => undefined);
    }
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
  const backup = await currentBackup(new Date(), true);
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
            // Older than anything in the backup, so the merge below restores its place, progress and details.
            updatedAt: 0,
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
  await restoreSettings(backup);
  return { added, result };
}

// ─── Sync ────────────────────────────────────────────────────

/** The sync file's name, in the chosen folder (or the old place in Documents/Rosetta/sync). */
const SYNC_NAME = 'rosetta-sync.json';

/** Phones, tablets and some browsers sync through a folder the reader chooses. */
export const canPickSyncFolder = canPickFolder;

export function chooseSyncFolder(): Promise<boolean> {
  return pickFolder('sync');
}

/** Starts syncing: a folder to sync with, then the first sync. False when no folder was chosen. */
export async function startSync(): Promise<boolean> {
  if (!(await chooseSyncFolder())) return false;
  await settings.update({ sync: true });
  return true;
}

/** Stops syncing and lets go of the folder. The files in it stay. */
export async function stopSync(): Promise<void> {
  await settings.update({ sync: false });
  await forgetFolder('sync').catch(() => undefined);
}

/**
 * Before a folder was chosen, phones kept the sync file in Documents/Rosetta/sync.
 * That still works on one device, so it stays the fallback until a folder is chosen.
 */
async function legacy(key: FolderKey): Promise<boolean> {
  return isNative && !(await folderStatus(key)).chosen;
}

async function readSync(): Promise<string | null> {
  if (await legacy('sync')) {
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
  try {
    return await readFolderFile('sync', SYNC_NAME);
  } catch (err) {
    // A file that is there but can't be read is worth saying so, not a first sync.
    throw new Error(t('sync.cantRead', { reason: err instanceof Error ? err.message : String(err) }), { cause: err });
  }
}

async function writeSync(text: string): Promise<void> {
  if (await legacy('sync')) {
    await Filesystem.writeFile({
      path: SYNC_PATH,
      directory: Directory.Documents,
      recursive: true,
      data: bytesToBase64(strToU8(text)),
    });
    return;
  }
  if (!(await folderStatus('sync')).chosen) throw new Error(t('error.noSyncFolder'));
  await writeFolderFile('sync', SYNC_NAME, text);
}

let syncing: Promise<MergeResult | null> | null = null;

/** The backup to write, with what the other side had on documents this device doesn't, so it isn't lost. */
export function syncFile(mine: Backup, theirs: Backup | null): Backup {
  if (!theirs) return mine;
  const here = new Set(mine.docs.map((d) => d.id));
  return { ...mine, docs: [...mine.docs, ...theirs.docs.filter((d) => !here.has(d.id))] };
}

/** Keeps a copy of a sync file that couldn't be read, beside it, before it is written over. */
async function keepUnreadable(text: string): Promise<string> {
  const name = `rosetta-sync.unreadable-${new Date().toISOString().slice(0, 10)}.json`;
  if (await legacy('sync')) {
    await Filesystem.writeFile({ path: `${FOLDER}/sync/${name}`, directory: Directory.Documents, recursive: true, data: bytesToBase64(strToU8(text)) });
  } else {
    await writeFolderFile('sync', name, text);
  }
  return name;
}

/** Reads the sync file, merges it in, and writes the merged state back. */
export function syncNow(): Promise<MergeResult | null> {
  if (!settings.value.sync) return Promise.resolve(null);
  syncing ??= (async () => {
    try {
      const text = await readSync();
      let result: MergeResult | null = null;
      let remote: Backup | null = null;
      if (text) {
        try {
          remote = parseBackup(text);
        } catch (err) {
          // A half-synced file, a conflict copy or a newer format: keep it, so nothing from the other device is lost.
          console.warn('The sync file couldn’t be read:', err);
          const kept = await keepUnreadable(text).catch(() => null);
          ui.notify(kept ? t('sync.unreadable', { name: kept }) : t('sync.unreadableLost'), 'error');
          if (!kept) return null;
        }
      }
      if (remote) {
        result = merge(
          {
            docs: library.items,
            marks: await db.marks.toArray(),
            collections: library.collections,
            deleted: await db.tombstones.toArray(),
          },
          remote,
        );
        await applyMerge(result);
      }
      await writeSync(JSON.stringify(syncFile(await currentBackup(), remote)));
      await settings.update({ lastSync: Date.now() });
      return result;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}
