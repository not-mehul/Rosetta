import { describe, expect, it } from 'vitest';
import { highlightsWithNotes, parseClippings, squashTitle } from '../../src/lib/clippings';
import { booksIn, parseOpf } from '../../src/lib/calibre';
import { sharedDocument } from '../../src/platform/shared';

const CLIPPINGS = `\uFEFFThe Lantern Keeper (Marlow, Ada)
- Your Highlight on page 3 | Location 40-41 | Added on Monday, 3 March 2025 10:00:00

climbed the stair each evening
==========
The Lantern Keeper (Marlow, Ada)
- Your Note on page 3 | Location 41 | Added on Monday, 3 March 2025 10:01:00

Every night, then.
==========
The Lantern Keeper (Marlow, Ada)
- Your Bookmark on page 9 | Location 120 | Added on Monday, 3 March 2025 10:02:00


==========
Moby-Dick: or, The Whale (Herman Melville)
- Tu subrayado en la página 1 | posición 5-6 | Añadido el lunes, 3 de marzo de 2025

Call me Ishmael.
==========
The Lantern Keeper (Marlow, Ada)
- Your Highlight on page 3 | Location 40-41 | Added on Tuesday, 4 March 2025 08:00:00

climbed the stair each evening
==========
`;

describe('Kindle clippings', () => {
  it('reads highlights and notes, in other languages too, and skips bookmarks', () => {
    const c = parseClippings(CLIPPINGS);
    expect(c.map((x) => [x.title, x.author, x.kind, x.location])).toEqual([
      ['The Lantern Keeper', 'Marlow, Ada', 'highlight', 40],
      ['The Lantern Keeper', 'Marlow, Ada', 'note', 41],
      ['Moby-Dick: or, The Whale', 'Herman Melville', 'highlight', 5],
      ['The Lantern Keeper', 'Marlow, Ada', 'highlight', 40],
    ]);
  });

  it('puts each note on its highlight and keeps a highlight made twice once', () => {
    expect(highlightsWithNotes(parseClippings(CLIPPINGS))).toEqual([
      { title: 'The Lantern Keeper', author: 'Marlow, Ada', text: 'climbed the stair each evening', note: 'Every night, then.' },
      { title: 'Moby-Dick: or, The Whale', author: 'Herman Melville', text: 'Call me Ishmael.', note: '' },
    ]);
  });

  it('matches titles loosely', () => {
    expect(squashTitle('Moby-Dick: or, The Whale')).toBe(squashTitle('Moby Dick'));
    expect(squashTitle('The Lantern Keeper')).toBe(squashTitle('Lantern Keeper (Penguin Classics)'));
  });
});

const OPF = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:title>Leviathan Wakes</dc:title><dc:creator opf:role="aut">James S. A. Corey</dc:creator><dc:subject>Science Fiction</dc:subject><dc:subject>Space Opera</dc:subject>
<meta name="calibre:series" content="The Expanse"/><meta name="calibre:series_index" content="1.0"/></metadata></package>`;

describe('Calibre folders', () => {
  it('reads metadata.opf', () => {
    expect(parseOpf(OPF)).toEqual({ title: 'Leviathan Wakes', author: 'James S. A. Corey', series: 'The Expanse', seriesIndex: 1, tags: ['science fiction', 'space opera'] });
    expect(parseOpf('<nope')).toBeNull();
  });

  it('gives each book in its own folder the details and cover beside it', async () => {
    const file = (path: string, text = '') => ({ path, read: async () => new TextEncoder().encode(text) });
    const books = booksIn([
      file('Corey/Leviathan Wakes (1)/Leviathan Wakes - James S. A. Corey.epub'),
      file('Corey/Leviathan Wakes (1)/Leviathan Wakes - James S. A. Corey.pdf'),
      file('Corey/Leviathan Wakes (1)/metadata.opf', OPF),
      file('Corey/Leviathan Wakes (1)/cover.jpg', 'jpeg'),
      file('Loose/one.epub'),
      file('Loose/two.epub'),
      file('Loose/metadata.opf', OPF),
      file('notes.docx'),
      file('picture.png'),
    ]);
    expect(books.map((b) => b.name)).toEqual(['Leviathan Wakes - James S. A. Corey.epub', 'Leviathan Wakes - James S. A. Corey.pdf', 'one.epub', 'two.epub', 'notes.docx']);
    const details = await books[0]!.details(async (b) => b);
    expect(details).toMatchObject({ title: 'Leviathan Wakes', author: 'James S. A. Corey', series: 'The Expanse', seriesIndex: 1, tags: ['science fiction', 'space opera'] });
    expect(new TextDecoder().decode(details.cover!)).toBe('jpeg');
    // A folder of several different books keeps each file's own details.
    expect(await books[2]!.details(async (b) => b)).toEqual({});
  });
});

describe('shared text', () => {
  it('becomes a Markdown document titled by its subject or first line', () => {
    const a = sharedDocument('The lantern was lit at dusk.\nShips came home.', 'Harbour notes')!;
    expect(a.name).toBe('Harbour notes.md');
    expect(new TextDecoder().decode(a.bytes)).toBe('# Harbour notes\n\nThe lantern was lit at dusk.\nShips came home.\n');
    const b = sharedDocument('A short title\n\nThe body of it.', '')!;
    expect(new TextDecoder().decode(b.bytes)).toBe('# A short title\n\nThe body of it.\n');
  });

  it('keeps no bare link and no empty text', () => {
    expect(sharedDocument('  https://example.org/article  ', 'An article')).toBeNull();
    expect(sharedDocument('   ', '')).toBeNull();
  });
});
