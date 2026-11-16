// Restoring the whole library, and sync between devices: places, details,
// collections and documents this device doesn't have all survive.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeBackup } from '../../src/lib/export';
import { db, type Collection, type StoredDoc } from '../../src/state/db';
import { library } from '../../src/state/library.svelte';
import { makeArchive, merge, restoreArchive, syncFile } from '../../src/state/sync';

const doc = (over: Partial<StoredDoc>): StoredDoc => ({
  id: 'x',
  fileName: 'x.md',
  format: 'md',
  title: 'X',
  author: '',
  size: 1,
  cover: null,
  addedAt: 1,
  openedAt: null,
  location: null,
  progress: 0,
  finishedAt: null,
  tags: [],
  collections: [],
  series: '',
  seriesIndex: null,
  offloaded: false,
  updatedAt: 1,
  ...over,
});
const coll = (over: Partial<Collection>): Collection => ({ id: 'c1', name: 'Poetry', createdAt: 1, ...over });
const none = { docs: [], marks: [], collections: [], deleted: [] };

beforeEach(async () => {
  await db.delete();
  await db.open();
  await library.load();
});

describe('the whole-library archive', () => {
  it('restores places, progress, finished dates, tags and collections on a new device', async () => {
    const garden = new Uint8Array(readFileSync('tests/fixtures/garden.md'));
    const added = await library.add(garden, 'garden.md');
    if (!('doc' in added)) throw new Error(added.error);
    const shelf = await library.createCollection('Garden');
    await library.update(added.doc.id, { location: { section: 0, offset: 40 }, progress: 0.4, finishedAt: 1_700_000_000_000, tags: ['spring'], collections: [shelf.id] });
    const archive = await makeArchive();

    // A new phone.
    await library.clear();
    await db.collections.clear();
    await library.load();
    const { added: count } = await restoreArchive(archive);
    expect(count).toBe(1);
    const back = library.get(added.doc.id)!;
    expect(back).toMatchObject({ progress: 0.4, finishedAt: 1_700_000_000_000, tags: ['spring'], collections: [shelf.id], location: { section: 0, offset: 40 } });
    expect(library.collections.map((c) => c.name)).toEqual(['Garden']);
  });
});

describe('collections in sync', () => {
  it('a collection deleted here stays deleted', () => {
    const remote = makeBackup([], [], new Date(), [coll({})], []);
    const result = merge({ ...none, deleted: [{ id: 'c1', deletedAt: 5 }] }, remote);
    expect(result.collections).toEqual([]);
  });

  it('a collection deleted on the other device is deleted here', () => {
    const remote = makeBackup([], [], new Date(), [], [{ id: 'c1', deletedAt: 5 }]);
    expect(merge({ ...none, collections: [coll({})] }, remote).deleteCollections).toEqual(['c1']);
  });

  it('a rename after the deletion brings it back', () => {
    const remote = makeBackup([], [], new Date(), [coll({ name: 'Verse', updatedAt: 9 })], []);
    expect(merge({ ...none, deleted: [{ id: 'c1', deletedAt: 5 }] }, remote).collections.map((c) => c.name)).toEqual(['Verse']);
  });

  it('the latest rename wins', () => {
    const remote = makeBackup([], [], new Date(), [coll({ name: 'Verse', updatedAt: 9 })], []);
    expect(merge({ ...none, collections: [coll({ updatedAt: 5 })] }, remote).collections.map((c) => c.name)).toEqual(['Verse']);
    expect(merge({ ...none, collections: [coll({ name: 'Poems', updatedAt: 12 })] }, remote).collections).toEqual([]);
  });

  it('deleting a collection leaves a tombstone for sync', async () => {
    const c = await library.createCollection('Essays');
    await library.deleteCollection(c.id);
    expect(await db.tombstones.get(c.id)).toBeDefined();
  });
});

describe('the sync file', () => {
  it('keeps what the other device had on documents this one doesn’t', () => {
    const mine = makeBackup([doc({ id: 'a' })], []);
    const theirs = makeBackup([doc({ id: 'a', progress: 0.1 }), doc({ id: 'b', progress: 0.7 })], []);
    const out = syncFile(mine, theirs);
    expect(out.docs.map((d) => d.id)).toEqual(['a', 'b']);
    expect(out.docs[0]!.progress).toBe(0);
    expect(out.docs[1]!.progress).toBe(0.7);
  });
});

describe('removing an offloaded document', () => {
  it('Undo puts it back with its marks', async () => {
    await db.docs.put(doc({ id: 'off', title: 'Offloaded', offloaded: true }));
    await db.marks.put({ id: 'm1', docId: 'off', kind: 'highlight', section: 0, start: 0, end: 3, text: 'abc', where: '', colour: 'amber', note: 'kept', createdAt: 1 });
    await library.load();
    const undo = await library.remove('off');
    expect(library.get('off')).toBeUndefined();
    await undo();
    expect(library.get('off')?.offloaded).toBe(true);
    expect((await db.marks.get('m1'))?.note).toBe('kept');
  });
});
