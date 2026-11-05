import { beforeEach, describe, expect, it } from 'vitest';
import { makeBackup, notesMarkdown, parseBackup, slug } from '../../src/lib/export';
import { db, type Mark, type StoredDoc } from '../../src/state/db';
import { library, shelve } from '../../src/state/library.svelte';
import { DEFAULT_SETTINGS, mergeSettings } from '../../src/state/settings';

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
  ...over,
});

const mark = (over: Partial<Mark>): Mark => ({ id: 'm', docId: 'x', kind: 'highlight', section: 0, start: 0, end: 1, text: 'A line', where: 'One', colour: 'amber', note: '', createdAt: 1, ...over });

describe('settings', () => {
  it('keeps what fits and drops the rest', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    const s = mergeSettings({ theme: 'light', fontSize: 40, typeface: 'comic', justify: true, pdfZoom: 1.5, lastDocId: 'a' } as never);
    expect(s).toMatchObject({ theme: 'light', fontSize: 18, typeface: 'serif', justify: true, pdfZoom: 1.5, lastDocId: 'a' });
  });
});

describe('shelves', () => {
  const items = [
    doc({ id: 'a', title: 'The Waves', author: 'Virginia Woolf', addedAt: 1, openedAt: 5, progress: 0.2 }),
    doc({ id: 'b', title: 'Aurora', author: 'Kim Stanley Robinson', addedAt: 2 }),
    doc({ id: 'c', title: 'Middlemarch', author: 'George Eliot', addedAt: 3, openedAt: 4, finishedAt: 6 }),
  ];
  it('files documents by status and sorts them', () => {
    expect(shelve(items, 'reading', 'recent').map((d) => d.id)).toEqual(['a']);
    expect(shelve(items, 'finished', 'recent').map((d) => d.id)).toEqual(['c']);
    expect(shelve(items, 'all', 'recent').map((d) => d.id)).toEqual(['a', 'c', 'b']);
    expect(shelve(items, 'all', 'title').map((d) => d.id)).toEqual(['b', 'c', 'a']);
    expect(shelve(items, 'all', 'author').map((d) => d.id)).toEqual(['c', 'b', 'a']);
    expect(shelve(items, 'all', 'recent', 'woolf').map((d) => d.id)).toEqual(['a']);
  });
});

describe('notes and backups', () => {
  it('writes highlights and notes as Markdown, grouped by chapter', () => {
    const md = notesMarkdown({ title: 'Book', author: 'Ann' }, [
      mark({ id: '2', section: 1, where: 'Two', text: 'Second', note: 'Why?' }),
      mark({ id: '1', where: 'One', text: 'First' }),
      mark({ id: '3', kind: 'bookmark', section: 1, where: 'Two', text: 'Here' }),
    ]);
    expect(md).toBe('# Book\n\n*Ann*\n\n## One\n\n> First\n\n## Two\n\n> Second\n\nWhy?\n\n## Bookmarks\n\n- Two: Here…\n');
    expect(slug('Café — Notes!')).toBe('cafe-notes');
  });

  it('round-trips a backup and refuses other files', () => {
    const backup = makeBackup([doc({})], [mark({}), mark({ id: 'n', docId: 'other' })], new Date('2026-01-01'));
    expect(backup.docs[0]!.marks).toHaveLength(1);
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
    expect(() => parseBackup('{"app":"ledger"}')).toThrow('isn’t a Rosetta backup');
    expect(() => parseBackup('nope')).toThrow();
  });
});

describe('library', () => {
  beforeEach(async () => {
    await library.clear();
  });

  it('adds a file once, and removes it with an undo', async () => {
    const bytes = new TextEncoder().encode('# Walden\n\nI went to the woods.');
    const first = await library.add(bytes, 'walden.md');
    expect(first).toMatchObject({ added: true, doc: { title: 'Walden', format: 'md' } });
    const again = await library.add(bytes, 'copy.md');
    expect(again).toMatchObject({ added: false });
    expect(library.items).toHaveLength(1);

    const id = library.items[0]!.id;
    await db.marks.put(mark({ docId: id }));
    const undo = await library.remove(id);
    expect(library.items).toHaveLength(0);
    expect(await db.marks.count()).toBe(0);
    await undo();
    expect(library.items).toHaveLength(1);
    expect(await db.marks.count()).toBe(1);
  });

  it('reports files it cannot read', async () => {
    const result = await library.add(new Uint8Array([0, 0, 0, 1]), 'image.bin');
    expect(result).toMatchObject({ error: expect.stringContaining('Rosetta reads EPUB') });
  });
});
