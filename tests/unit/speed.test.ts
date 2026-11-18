// Doing less work for the same result: several books changed in one write,
// and reading time added to the figures already on screen rather than
// summed again from every session.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type StoredDoc } from '../../src/state/db';
import { library } from '../../src/state/library.svelte';
import { stats, summarise } from '../../src/state/stats.svelte';

const doc = (id: string, over: Partial<StoredDoc> = {}): StoredDoc => ({
  id,
  fileName: `${id}.md`,
  format: 'md',
  title: id,
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

beforeEach(async () => {
  await library.clear();
  await db.docs.bulkPut(['a', 'b', 'c', 'd'].map((id) => doc(id)));
  await library.load();
});

describe('several books at once', () => {
  it('changes them in one transaction and one redraw of the shelf', async () => {
    const redraw = vi.spyOn(Object.getPrototypeOf(library), 'items', 'set');
    const writes = vi.spyOn(db.docs, 'update');
    await library.updateMany([
      ['a', { finishedAt: 5 }],
      ['c', { finishedAt: 5 }],
    ]);
    expect(redraw).toHaveBeenCalledTimes(1);
    expect(writes).toHaveBeenCalledTimes(2);
    redraw.mockRestore();
    writes.mockRestore();
    expect(library.items.filter((d) => d.finishedAt === 5).map((d) => d.id)).toEqual(['a', 'c']);
    expect((await db.docs.bulkGet(['a', 'b', 'c'])).map((d) => d?.finishedAt)).toEqual([5, null, 5]);
  });

  it('removes them together, with their highlights, and an Undo brings all of it back', async () => {
    await db.marks.put({ id: 'm1', docId: 'b', kind: 'highlight', section: 0, start: 0, end: 1, text: 'x', where: '', colour: 'amber', note: '', createdAt: 1 });
    const undo = await library.removeMany(['b', 'd']);
    expect(library.items.map((d) => d.id).sort()).toEqual(['a', 'c']);
    expect(await db.marks.count()).toBe(0);
    await undo();
    expect(library.items.map((d) => d.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(await db.marks.get('m1')).toBeTruthy();
  });

  it('renames a tag on every book in one go', async () => {
    await library.updateMany([
      ['a', { tags: ['sea'] }],
      ['b', { tags: ['sea', 'ocean'] }],
    ]);
    expect(await library.renameTag('sea', 'ocean')).toBe(2);
    expect(library.items.find((d) => d.id === 'b')!.tags).toEqual(['ocean']);
    expect((await db.docs.get('a'))!.tags).toEqual(['ocean']);
  });
});

describe('reading time', () => {
  let clock = 0;
  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  it('adds each save to the figures, the same as reading every session again would give', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await db.sessions.put({ id: `${key(yesterday)}|a`, day: key(yesterday), docId: 'a', ms: 20 * 60_000, chars: 18_000 });
    await stats.load();
    const load = vi.spyOn(db.sessions, 'toArray');

    stats.begin('a');
    for (let i = 0; i < 12; i++) {
      clock += 60_000;
      stats.activity('a', 900);
    }
    await stats.flush();
    stats.begin('b');
    clock += 30_000;
    stats.activity('b', 0);
    clock += 30_000;
    stats.activity('b', 0);
    await stats.flush();

    // Nothing read every session back in.
    expect(load).not.toHaveBeenCalled();
    load.mockRestore();
    const whole = summarise(await db.sessions.toArray());
    expect(stats.todayMs).toBe(whole.todayMs);
    expect(stats.pace).toBe(whole.pace);
    expect(stats.streak).toBe(whole.streak);
    expect(stats.streak).toBe(2);
  });
});
