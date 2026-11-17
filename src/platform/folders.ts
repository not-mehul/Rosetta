// Folders the reader chooses, for the sync file ("sync") and the weekly
// backups ("backup"). On a phone or tablet the system picker chooses them
// (the Folders plugin: FolderPlugin.java, FoldersPlugin.swift), so a file
// another app wrote there, such as a sync file Syncthing or iCloud Drive
// brought from another device, can still be read. In a browser that can,
// it's a folder handle (File System Access), kept in IndexedDB.

import { registerPlugin } from '@capacitor/core';
import { db } from '../state/db';
import { isNative } from './native';

export type FolderKey = 'sync' | 'backup';

interface FoldersPlugin {
  status(o: { key: FolderKey }): Promise<{ chosen: boolean; name?: string }>;
  pick(o: { key: FolderKey }): Promise<{ chosen: boolean; name?: string }>;
  forget(o: { key: FolderKey }): Promise<void>;
  read(o: { key: FolderKey; name: string }): Promise<{ data: string | null }>;
  write(o: { key: FolderKey; name: string; data: string }): Promise<void>;
  list(o: { key: FolderKey }): Promise<{ names: string[] }>;
  remove(o: { key: FolderKey; name: string }): Promise<void>;
}

const Native = registerPlugin<FoldersPlugin>('Folders');

type FileHandle = {
  getFile: () => Promise<File>;
  createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>;
};
type DirHandle = {
  name: string;
  getFileHandle: (name: string, o?: { create?: boolean }) => Promise<FileHandle>;
  removeEntry: (name: string) => Promise<void>;
  keys?: () => AsyncIterable<string>;
};

/** A phone or tablet, or a browser with File System Access, can choose a folder. */
export const canPickFolder = isNative || (typeof window !== 'undefined' && 'showDirectoryPicker' in window);

/** The web keeps the sync folder's handle under its old name, so a folder chosen before still works. */
const storeId = (key: FolderKey) => (key === 'sync' ? 'syncFolder' : 'backupFolder') as 'settings';

async function handle(key: FolderKey): Promise<DirHandle | null> {
  const row = await db.settings.get(storeId(key)).catch(() => undefined);
  return ((row?.value as unknown as { handle?: DirHandle })?.handle ?? null) as DirHandle | null;
}

/** Whether a folder is chosen for this use, and its name. */
export async function folderStatus(key: FolderKey): Promise<{ chosen: boolean; name?: string }> {
  if (isNative) return Native.status({ key }).catch(() => ({ chosen: false }));
  const dir = await handle(key);
  return dir ? { chosen: true, name: dir.name } : { chosen: false };
}

/** Opens the folder picker. False when the reader cancels. */
export async function pickFolder(key: FolderKey): Promise<boolean> {
  try {
    if (isNative) return (await Native.pick({ key })).chosen;
    const dir = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite', id: `rosetta-${key}` });
    await db.settings.put({ id: storeId(key), value: { handle: dir } as never });
    return true;
  } catch {
    return false;
  }
}

export async function forgetFolder(key: FolderKey): Promise<void> {
  if (isNative) await Native.forget({ key });
  else await db.settings.delete(storeId(key));
}

/** A file's text, or null when the folder or the file isn't there. Failures to read throw. */
export async function readFolderFile(key: FolderKey, name: string): Promise<string | null> {
  if (isNative) {
    if (!(await folderStatus(key)).chosen) return null;
    return (await Native.read({ key, name })).data;
  }
  const dir = await handle(key);
  if (!dir) return null;
  let file: FileHandle;
  try {
    file = await dir.getFileHandle(name);
  } catch {
    return null;
  }
  return (await file.getFile()).text();
}

export async function writeFolderFile(key: FolderKey, name: string, text: string): Promise<void> {
  if (isNative) return Native.write({ key, name, data: text });
  const dir = await handle(key);
  if (!dir) throw new Error('No folder chosen');
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(text);
  await w.close();
}

export async function listFolder(key: FolderKey): Promise<string[]> {
  if (isNative) return (await Native.list({ key })).names;
  const dir = await handle(key);
  if (!dir?.keys) return [];
  const names: string[] = [];
  for await (const name of dir.keys()) names.push(name);
  return names;
}

export async function removeFolderFile(key: FolderKey, name: string): Promise<void> {
  if (isNative) return Native.remove({ key, name });
  await (await handle(key))?.removeEntry(name);
}
