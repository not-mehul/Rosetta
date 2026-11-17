// Highlights and book notes handed to BookShelf (platform/handoff.ts).
import { describe, expect, it } from 'vitest';

describe('quotes and notes to BookShelf', () => {
  it('sends a highlight as a quote BookShelf reads back', async () => {
    const { bookShelfQuoteUrl } = await import('../../src/platform/handoff');
    const { parseLink, isKnownAction } = await import('../../src/platform/links');
    const url = bookShelfQuoteUrl({ text: 'Call me\n  Ishmael.', title: 'Moby-Dick', author: 'Herman Melville', where: 'Loomings', note: ' The opening. ' });
    const link = parseLink(url, 'bookshelf')!;
    expect(link.action).toBe('quote');
    expect(isKnownAction(link)).toBe(true);
    expect(link.params).toEqual({ text: 'Call me Ishmael.', title: 'Moby-Dick', author: 'Herman Melville', where: 'Loomings', note: 'The opening.' });
    expect(link.source).toBe('rosetta');
    expect(parseLink(bookShelfQuoteUrl({ text: 'x'.repeat(9000), title: '', author: '', where: '', note: '' }))!.params.text).toHaveLength(4000);
  });

  it('carries the note on the book with a log, and leaves it out when there is none', async () => {
    const { bookShelfUrl } = await import('../../src/platform/handoff');
    const { parseLink } = await import('../../src/platform/links');
    expect(parseLink(bookShelfUrl({ title: 'Dune', author: '', finishedAt: null, progress: 0.5, note: 'Spice.' }))!.params.note).toBe('Spice.');
    expect(parseLink(bookShelfUrl({ title: 'Dune', author: '', finishedAt: null, progress: 0.5 }))!.params).not.toHaveProperty('note');
  });
});
