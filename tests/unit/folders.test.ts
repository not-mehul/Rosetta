// On a phone, sync and weekly backups go through the folder the reader chose
// with the system picker (the Folders plugin), and fall back to
// Documents/Rosetta until one is chosen.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Folder = { name: string; files: Map<string, string> };
const folders = new Map<string, Folder>();
const documents = new Map<string, string>();

vi.mock('../../src/platform/native', () => ({ isNative: true, platform: 'android' }));
vi.mock('@capacitor/core', async (real) => ({
  ...(await real<typeof import('@capacitor/core')>()),
  registerPlugin: () => ({
    status: async ({ key }: { key: string }) => (folders.has(key) ? { chosen: true, name: folders.get(key)!.name } : { chosen: false }),
    pick: async ({ key }: { key: string }) => {
      folders.set(key, { name: key === 'sync' ? 'Sync' : 'Backups', files: new Map() });
      return { chosen: true, name: folders.get(key)!.name };
    },
    forget: async ({ key }: { key: string }) => void folders.delete(key),
    read: async ({ key, name }: { key: string; name: string }) => ({ data: folders.get(key)?.files.get(name) ?? null }),
    write: async ({ key, name, data }: { key: string; name: string; data: string }) => void folders.get(key)!.files.set(name, data),
    list: async ({ key }: { key: string }) => ({ names: [...(folders.get(key)?.files.keys() ?? [])] }),
    remove: async ({ key, name }: { key: string; name: string }) => void folders.get(key)?.files.delete(name),
  }),
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS' },
  Filesystem: {
    readFile: async ({ path }: { path: string }) => {
      if (!documents.has(path)) throw new Error('missing');
      return { data: Buffer.from(documents.get(path)!).toString('base64') };
    },
    writeFile: async ({ path, data }: { path: string; data: string }) => void documents.set(path, Buffer.from(data, 'base64').toString()),
    readdir: async ({ path }: { path: string }) => ({ files: [...documents.keys()].filter((k) => k.startsWith(`${path}/`)).map((k) => ({ name: k.slice(path.length + 1) })) }),
    deleteFile: async ({ path }: { path: string }) => void documents.delete(path),
  },
}));

const { library } = await import('../../src/state/library.svelte');
const { settings } = await import('../../src/state/settings.svelte');
const { autoBackup, chooseSyncFolder, syncNow } = await import('../../src/state/sync');
const { pickFolder } = await import('../../src/platform/folders');

beforeEach(async () => {
  folders.clear();
  documents.clear();
  await settings.update({ sync: true, autoBackup: true, lastAutoBackup: 0 });
  if (!library.items.length) await library.add(new TextEncoder().encode('# A note\n\nWords.'), 'note.md');
});

describe('sync and backups through a chosen folder', () => {
  it('uses Documents/Rosetta/sync until a folder is chosen', async () => {
    await syncNow();
    expect(documents.has('Rosetta/sync/rosetta-sync.json')).toBe(true);
  });

  it('reads and writes the sync file in the chosen folder, written by another device', async () => {
    await chooseSyncFolder();
    // Another device's file, with a place on a document this device doesn't have.
    const theirs = { app: 'rosetta', version: 2, exportedAt: '2026-01-01', docs: [{ id: 'elsewhere', title: 'Elsewhere', author: '', fileName: 'e.epub', location: null, progress: 0.5, finishedAt: null, openedAt: null, marks: [] }] };
    folders.get('sync')!.files.set('rosetta-sync.json', JSON.stringify(theirs));
    await syncNow();
    const written = JSON.parse(folders.get('sync')!.files.get('rosetta-sync.json')!);
    expect(written.docs.map((d: { id: string }) => d.id)).toContain('elsewhere');
    expect(written.docs.length).toBe(library.items.length + 1);
    expect(written).not.toHaveProperty('settings');
    expect(documents.size).toBe(0);
  });

  it('writes the weekly backup to the chosen folder, with settings, keeping five', async () => {
    await pickFolder('backup');
    for (let i = 1; i <= 6; i++) folders.get('backup')!.files.set(`rosetta-backup-2026-01-0${i}.json`, '{}');
    folders.get('backup')!.files.set('notes.txt', 'mine');
    expect(await autoBackup(Date.parse('2026-02-01T12:00:00Z'))).toBe(true);
    const names = [...folders.get('backup')!.files.keys()].sort();
    expect(names).toContain('rosetta-backup-2026-02-01.json');
    expect(names).toContain('notes.txt');
    expect(names.filter((n) => n.startsWith('rosetta-backup')).length).toBe(5);
    expect(JSON.parse(folders.get('backup')!.files.get('rosetta-backup-2026-02-01.json')!).settings).toBeTruthy();
  });

  it('falls back to Documents/Rosetta/backups without a folder', async () => {
    expect(await autoBackup(Date.parse('2026-03-01T12:00:00Z'))).toBe(true);
    expect(documents.has('Rosetta/backups/rosetta-backup-2026-03-01.json')).toBe(true);
  });
});
