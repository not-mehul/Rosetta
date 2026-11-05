// The pure logic behind the reading, library, format and sync features.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readInfo, openDocument, FormatError } from '../../src/formats';
import { isComicArchive } from '../../src/formats/cbz';
import { rtfToHtml } from '../../src/formats/rtf';
import { scopeCss } from '../../src/formats/styles';
import type { FlowDoc } from '../../src/formats/types';
import { fillSearch, parseFeed, searchTemplate } from '../../src/lib/opds';
import type { Backup } from '../../src/lib/export';
import { bookShelfUrl, parseRosettaUrl } from '../../src/platform/handoff';
import { clipHalfPlane, constrain, fold, reflect, type Pt } from '../../src/reader/curl-geometry';
import { isNoteRef, noteHtml } from '../../src/reader/notes';
import { pageCount, pageOfRect } from '../../src/reader/paging';
import { sentences } from '../../src/reader/sentences';
import type { Mark, ReadingSession, StoredDoc } from '../../src/state/db';
import { matches, parseTags, shelve } from '../../src/state/library.svelte';
import { dayKey, summarise } from '../../src/state/stats.svelte';
import { backupsToPrune, merge } from '../../src/state/sync';

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));

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
const mark = (over: Partial<Mark>): Mark => ({ id: 'm', docId: 'x', kind: 'highlight', section: 0, start: 0, end: 1, text: 'A line', where: 'One', colour: 'amber', note: '', createdAt: 1, ...over });

// ─── Page curl ───────────────────────────────────────────────

describe('page curl geometry', () => {
  const area = (poly: Pt[]) => Math.abs(poly.reduce((s, p, i) => s + p.x * poly[(i + 1) % poly.length]!.y - poly[(i + 1) % poly.length]!.x * p.y, 0)) / 2;

  it('lies flat when the corner has not moved', () => {
    const f = fold(400, 600, 600, { x: 400, y: 600 });
    expect(f.turned).toBe(0);
    expect(f.removed).toEqual([]);
    expect(area(f.kept)).toBe(400 * 600);
  });

  it('folds along the bisector: kept and lifted parts make the page, the flap mirrors the lifted part', () => {
    const f = fold(400, 600, 600, { x: 250, y: 520 });
    expect(area(f.kept) + area(f.removed)).toBeCloseTo(400 * 600, 3);
    expect(area(f.flap)).toBeCloseTo(area(f.removed), 3);
    // The lifted corner lands on the finger.
    expect(f.flap.some((p) => Math.hypot(p.x - 250, p.y - 520) < 1e-6)).toBe(true);
    expect(f.turned).toBeGreaterThan(0);
    expect(f.turned).toBeLessThan(1);
  });

  it('reflects across a line, and twice comes back', () => {
    const m = { x: 0, y: 0 };
    const n = { x: 1, y: 0 };
    expect(reflect({ x: 3, y: 2 }, m, n)).toEqual({ x: -3, y: 2 });
    const p = { x: 7, y: -4 };
    const n2 = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const back = reflect(reflect(p, { x: 1, y: 1 }, n2), { x: 1, y: 1 }, n2);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('clips to a half-plane', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(area(clipHalfPlane(square, { x: 1, y: 0 }, { x: 1, y: 0 }))).toBeCloseTo(2);
  });

  it('keeps the finger where paper held at the spine can reach', () => {
    const p = constrain({ x: -900, y: 600 }, 400, 600, 600);
    expect(Math.hypot(p.x, p.y - 600)).toBeLessThanOrEqual(400 + 1e-9);
    expect(constrain({ x: 200, y: 500 }, 400, 600, 600)).toEqual({ x: 200, y: 500 });
  });
});

// ─── Paged reading ───────────────────────────────────────────

describe('pages', () => {
  const rect = (left: number, right = left + 5) => ({ left, right }) as DOMRect;

  it('finds the column a box sits in, either way round', () => {
    const ltr = { origin: 20, stride: 412, rtl: false };
    expect(pageOfRect(rect(20), ltr)).toBe(0);
    expect(pageOfRect(rect(391), ltr)).toBe(0);
    expect(pageOfRect(rect(432), ltr)).toBe(1);
    expect(pageOfRect(rect(1827), ltr)).toBe(4);
    const rtl = { origin: 392, stride: 412, rtl: true };
    expect(pageOfRect(rect(300, 392), rtl)).toBe(0);
    expect(pageOfRect(rect(-100, -20), rtl)).toBe(1);
  });

  it('counts pages from the column box', () => {
    expect(pageCount(412, 412)).toBe(1);
    expect(pageCount(2060, 412)).toBe(5);
    expect(pageCount(0, 412)).toBe(1);
  });
});

// ─── Footnotes and reading aloud ─────────────────────────────

describe('footnotes', () => {
  const html = (s: string) => {
    const root = document.createElement('div');
    root.innerHTML = s;
    return root;
  };

  it('knows a note reference from a cross-reference', () => {
    const root = html(
      '<p>A<a epub:type="noteref" href="#r-n1" data-link="#r-n1">1</a> B<sup><a id="x" href="#r-fn2" data-link="#r-fn2">2</a></sup> <a id="c" href="#r-ch2" data-link="#r-ch2">Chapter 2</a></p><aside id="r-n1">One.</aside><p id="r-fn2"><a href="#x" data-link="#x">2</a> Two.</p><h2 id="r-ch2">Chapter 2</h2>',
    );
    const [a, b, c] = root.querySelectorAll('a');
    expect(isNoteRef(a!, root.querySelector('#r-n1'))).toBe(true);
    expect(isNoteRef(b!, root.querySelector('#r-fn2'))).toBe(true);
    expect(isNoteRef(c!, root.querySelector('#r-ch2'))).toBe(false);
  });

  it('shows the note without its way back', () => {
    const root = html('<p id="r-fn2"><a href="#x" data-link="#x">2</a> The log is in the museum. <a href="#x" data-link="#x">↩</a></p>');
    const note = noteHtml(root.querySelector('#r-fn2')!);
    expect(note).toContain('The log is in the museum.');
    expect(note).not.toContain('↩');
    expect(note).not.toContain('<a');
  });
});

describe('sentences', () => {
  const text = 'The ship came in. Was it late? No!  It was early.';

  it('splits text into sentences with their offsets', () => {
    const s = sentences(text);
    expect(s.map((x) => x.text)).toEqual(['The ship came in.', 'Was it late?', 'No!', 'It was early.']);
    for (const x of s) expect(text.slice(x.start, x.end)).toBe(x.text);
  });

  it('starts from a place, and breaks long runs on a space', () => {
    expect(sentences(text, 20)[0]!.start).toBe(20);
    const long = sentences(`${'word '.repeat(200)}end.`);
    expect(long.length).toBeGreaterThan(2);
    expect(long.every((x) => x.text.length <= 320)).toBe(true);
  });
});

// ─── Library ─────────────────────────────────────────────────

describe('tags, search and series', () => {
  it('reads tags as typed', () => {
    expect(parseTags('Sea, history,  #Sea #ships\nold  maps')).toEqual(['sea', 'history', 'ships', 'old maps']);
    expect(parseTags('  ')).toEqual([]);
  });

  it('matches words, #tags and series', () => {
    const d = doc({ title: 'The Salt Road', author: 'Mira Holt', series: 'Coast', tags: ['travel', 'history'] });
    expect(matches(d, 'salt holt')).toBe(true);
    expect(matches(d, '#trav')).toBe(true);
    expect(matches(d, '#sea')).toBe(false);
    expect(matches(d, 'coast')).toBe(true);
    expect(matches(d, 'history road')).toBe(true);
  });

  it('sorts by series and number, and keeps to a collection', () => {
    const items = [
      doc({ id: 'c', title: 'Third', series: 'Coast', seriesIndex: 3, collections: ['k'] }),
      doc({ id: 'a', title: 'First', series: 'Coast', seriesIndex: 1, collections: ['k'] }),
      doc({ id: 'z', title: 'Alone', series: '' }),
      doc({ id: 'b', title: 'Second', series: 'Coast', seriesIndex: 2 }),
    ];
    expect(shelve(items, 'all', 'series').map((d) => d.id)).toEqual(['a', 'b', 'c', 'z']);
    expect(shelve(items, 'all', 'series', '', 'k').map((d) => d.id)).toEqual(['a', 'c']);
  });
});

describe('reading stats', () => {
  const now = new Date(2026, 10, 5, 9).getTime();
  const day = (ago: number) => dayKey(now - ago * 86_400_000);
  const session = (ago: number, ms: number, chars = 0): ReadingSession => ({ id: `${day(ago)}|x`, day: day(ago), docId: 'x', ms, chars });

  it('adds up today, the week and the streak', () => {
    const s = summarise([session(0, 60_000), session(1, 120_000), session(2, 30_000), session(4, 10_000), session(9, 999)], now);
    expect(s.todayMs).toBe(60_000);
    expect(s.streak).toBe(3);
    expect(s.week).toHaveLength(7);
    expect(s.week.at(-1)).toEqual({ day: day(0), ms: 60_000 });
    expect(s.totalMs).toBe(60_000 + 120_000 + 30_000 + 10_000 + 999);
  });

  it('keeps a streak through the morning, and learns the pace', () => {
    expect(summarise([session(1, 1000), session(2, 1000)], now).streak).toBe(2);
    expect(summarise([session(0, 20 * 60_000, 40_000)], now).pace).toBe(2000);
    // Too little reading to learn from: the default.
    expect(summarise([session(0, 60_000, 90_000)], now).pace).toBe(1500);
  });
});

// ─── Formats ─────────────────────────────────────────────────

describe('new formats', () => {
  it('reads FictionBook with its series', async () => {
    const info = await readInfo(fixture('salt-road.fb2'), 'salt-road.fb2');
    expect(info).toMatchObject({ format: 'fb2', title: 'The Salt Road', author: 'Mira Holt', series: 'Coast', seriesIndex: 2 });
    const open = (await openDocument(fixture('salt-road.fb2'), 'fb2')) as FlowDoc;
    expect(open.sections).toHaveLength(2);
    expect(open.toc.map((e) => e.label)).toEqual(['Inland', 'The well']);
    expect(open.sections[1]!.text).toContain('crossroads');
  });

  it('reads a comic archive as its pictures, in order', async () => {
    expect(isComicArchive(['page-01.png', 'page-02.jpg'])).toBe(true);
    expect(isComicArchive(['mimetype', 'content.xml'])).toBe(false);
    const info = await readInfo(fixture('tin-moon.cbz'), 'tin-moon.cbz');
    expect(info).toMatchObject({ format: 'cbz', title: 'Tin moon' });
    const open = (await openDocument(fixture('tin-moon.cbz'), 'cbz')) as FlowDoc;
    expect(open.sections.flatMap((s) => s.html.match(/<img/g) ?? [])).toHaveLength(3);
  });

  it('reads RTF with its styling and accented letters', async () => {
    const r = rtfToHtml(new TextDecoder().decode(fixture('ship-log.rtf')));
    expect(r.title).toBe('Ship Log');
    expect(r.author).toBe('Ned Ward');
    expect(r.html).toContain('<strong>Monday</strong>');
    expect(r.html).toContain('<em>Marigold</em>');
    expect(r.html).toContain('Café');
    expect(rtfToHtml('{\\rtf1 A\\u8212?B\\par}').html).toContain('A—B');
  });

  it('reads OpenDocument text with its headings and lists', async () => {
    const info = await readInfo(fixture('orchard.odt'), 'orchard.odt');
    expect(info).toMatchObject({ format: 'odt', title: 'Orchard Diary', author: 'June Park' });
    const open = (await openDocument(fixture('orchard.odt'), 'odt')) as FlowDoc;
    expect(open.toc.map((e) => [e.label, e.depth])).toEqual([
      ['Spring', 0],
      ['Late frost', 1],
    ]);
    expect(open.sections[0]!.html).toContain('<li>');
  });

  it('keeps EPUB footnotes and pictures', async () => {
    const open = (await openDocument(fixture('lantern.epub'), 'epub')) as FlowDoc;
    expect(open.sections[0]!.html).toContain('noteref');
    expect(open.sections[1]!.html).toMatch(/<img [^>]*alt="A map of the point"/);
  });

  // Damaged files: any of these may open, but none may throw anything other than FormatError.
  it('fails cleanly on damaged files', async () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const sources = ['lantern.epub', 'field-notes.docx', 'salt-road.fb2', 'tin-moon.cbz', 'ship-log.rtf', 'orchard.odt'];
    for (const name of sources) {
      const original = fixture(name);
      for (let round = 0; round < 12; round++) {
        const bytes = original.slice(0, round % 3 === 0 ? Math.floor(original.length * random()) : original.length);
        for (let i = 0; i < 1 + round * 4; i++) bytes[Math.floor(random() * bytes.length)] = Math.floor(random() * 256);
        try {
          const info = await readInfo(bytes, name);
          await openDocument(bytes, info.format);
        } catch (err) {
          expect(err, `${name}, round ${round}: ${String(err)}`).toBeInstanceOf(FormatError);
        }
      }
    }
  });
});

describe('publisher styles', () => {
  it('scopes selectors to the column and leaves theme and type to the reader', () => {
    const css = scopeCss('body { margin: 0; color: red } p.first::first-letter { font-size: 3em; float: left; font-family: Fancy } #intro, h1 { text-indent: 0; font-size: 24px } @import url(x.css); a[href="#x"] { text-decoration: none }', { scope: '.reading.publisher' });
    expect(css).toContain('.reading.publisher { margin: 0 }');
    expect(css).toContain('.reading.publisher p.r-first::first-letter { font-size: 3em; float: left }');
    expect(css).toContain('.reading.publisher #r-intro, .reading.publisher h1 { text-indent: 0 }');
    expect(css).toContain('a[href="#x"]');
    expect(css).not.toMatch(/color|Fancy|import|24px/);
  });

  it('keeps everything for fixed layout, but nothing from the network', () => {
    const css = scopeCss('.page { color: navy; background: url(https://example.com/bg.png) } .art { background: url(img/a.png) }', { scope: '.fx', keepAll: true, resolveUrl: (u) => (u.startsWith('img/') ? `blob:${u}` : null) });
    expect(css).toContain('color: navy');
    expect(css).not.toContain('example.com');
    expect(css).toContain('url("blob:img/a.png")');
  });
});

// ─── Catalogs and the sibling apps ───────────────────────────

describe('OPDS catalogs', () => {
  const feed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Popular</title>
<link rel="next" href="?page=2" type="application/atom+xml;profile=opds-catalog"/>
<link rel="search" href="/search.xml" type="application/opensearchdescription+xml"/>
<entry><id>urn:1</id><title>Moby Dick</title><author><name>Herman Melville</name></author><summary>A whale.</summary>
<link rel="http://opds-spec.org/acquisition" href="/1.pdf" type="application/pdf"/>
<link rel="http://opds-spec.org/acquisition/open-access" href="/1.epub" type="application/epub+zip"/>
<link rel="http://opds-spec.org/acquisition/buy" href="/buy" type="application/epub+zip"/>
<link rel="http://opds-spec.org/image/thumbnail" href="/1.jpg" type="image/jpeg"/></entry>
<entry><id>urn:shelf</id><title>Sea stories</title><link rel="subsection" href="/sea" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/></entry>
</feed>`;

  it('reads entries, the best download first, and the way to more', () => {
    const f = parseFeed(feed, 'https://books.example/opds/');
    expect(f.title).toBe('Popular');
    expect(f.next).toBe('https://books.example/opds/?page=2');
    expect(f.search).toBe('https://books.example/search.xml');
    const [book, shelf] = f.entries;
    expect(book).toMatchObject({ title: 'Moby Dick', author: 'Herman Melville', thumbnail: 'https://books.example/1.jpg', feed: null });
    expect(book!.downloads.map((d) => d.href)).toEqual(['https://books.example/1.epub', 'https://books.example/1.pdf']);
    expect(shelf!.feed?.href).toBe('https://books.example/sea');
    expect(() => parseFeed('<html/>', 'https://x/')).toThrow();
  });

  it('fills a search template', () => {
    const xml = '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"><Url type="application/atom+xml" template="/q?s={searchTerms}&amp;p={startPage?}"/></OpenSearchDescription>';
    const template = searchTemplate(xml, 'https://books.example/search.xml')!;
    expect(fillSearch(template, 'sea & sky')).toBe('https://books.example/q?s=sea%20%26%20sky&p=');
  });
});

describe('hand-off links', () => {
  it('logs a finished book in BookShelf', () => {
    const url = bookShelfUrl({ title: 'Moby Dick', author: 'Herman Melville', finishedAt: Date.UTC(2026, 10, 4, 12), progress: 1 });
    expect(url.startsWith('bookshelf://log?')).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(Object.fromEntries(q)).toEqual({ title: 'Moby Dick', author: 'Herman Melville', progress: '1.00', source: 'rosetta', finished: '2026-11-04' });
  });

  it('reads rosetta:// links', () => {
    expect(parseRosettaUrl('rosetta://open?id=abc')).toEqual({ kind: 'open', id: 'abc', title: undefined });
    expect(parseRosettaUrl('rosetta://open?title=Moby%20Dick')).toEqual({ kind: 'open', id: undefined, title: 'Moby Dick' });
    expect(parseRosettaUrl('rosetta://open')).toBeNull();
    expect(parseRosettaUrl('rosetta://delete?id=abc')).toBeNull();
    expect(parseRosettaUrl('https://example.com')).toBeNull();
  });
});

// ─── Sync ────────────────────────────────────────────────────

describe('sync and restore', () => {
  const backup = (over: Partial<Backup>): Backup => ({ app: 'rosetta', version: 2, exportedAt: '2026-11-05T00:00:00.000Z', docs: [], collections: [], deleted: [], ...over }) as Backup;
  const remoteDoc = (over: Record<string, unknown>) => ({ id: 'x', fileName: 'x.md', title: 'X', author: '', location: null, progress: 0, finishedAt: null, openedAt: null, marks: [], ...over });

  it('takes the newer place, and leaves the newer local one', () => {
    const local = { docs: [doc({ id: 'x', updatedAt: 100, progress: 0.1 }), doc({ id: 'y', updatedAt: 500, progress: 0.9 })], marks: [], collections: [], deleted: [] };
    const remote = backup({ docs: [remoteDoc({ id: 'x', updatedAt: 200, progress: 0.4, tags: ['sea'] }), remoteDoc({ id: 'y', updatedAt: 300, progress: 0.2 }), remoteDoc({ id: 'z', updatedAt: 1 })] as never });
    const r = merge(local, remote);
    expect(r.docs).toHaveLength(1);
    expect(r.docs[0]).toMatchObject({ id: 'x', patch: { progress: 0.4, tags: ['sea'], updatedAt: 200 } });
    expect(r.missing).toBe(1);
  });

  it('merges marks: newer edits win, and a deletion wins over an older edit', () => {
    const local = {
      docs: [doc({ id: 'x', updatedAt: 999 })],
      marks: [mark({ id: 'a', note: 'old', createdAt: 10 }), mark({ id: 'b', createdAt: 10, updatedAt: 50 }), mark({ id: 'c', createdAt: 10 })],
      collections: [],
      deleted: [{ id: 'd', deletedAt: 400 }],
    };
    const remote = backup({
      docs: [remoteDoc({ id: 'x', updatedAt: 1, marks: [mark({ id: 'a', note: 'new', createdAt: 10, updatedAt: 90 }), mark({ id: 'b', createdAt: 10, updatedAt: 40 }), mark({ id: 'd', createdAt: 300 }), mark({ id: 'e', createdAt: 5 })] })] as never,
      deleted: [{ id: 'c', deletedAt: 20 }],
    });
    const r = merge(local, remote);
    expect(r.putMarks.map((m) => m.id).sort()).toEqual(['a', 'e']);
    expect(r.putMarks.find((m) => m.id === 'a')!.note).toBe('new');
    expect(r.deleteMarks).toEqual(['c']);
    expect(r.deleted.map((d) => d.id).sort()).toEqual(['c', 'd']);
  });

  it('restores a version 1 backup over an untouched library', () => {
    const local = { docs: [doc({ id: 'x', updatedAt: 1000 })], marks: [], collections: [], deleted: [] };
    const r = merge(local, { app: 'rosetta', version: 1, exportedAt: '', docs: [remoteDoc({ id: 'x', progress: 0.5 })] } as never);
    expect(r.docs[0]!.patch.progress).toBe(0.5);
  });

  it('keeps the newest five automatic backups', () => {
    const names = ['rosetta-backup-2026-10-01.json', 'notes.md', 'rosetta-backup-2026-11-05.json', 'rosetta-backup-2026-10-08.json', 'rosetta-backup-2026-10-15.json', 'rosetta-backup-2026-10-22.json', 'rosetta-backup-2026-10-29.json'];
    expect(backupsToPrune(names)).toEqual(['rosetta-backup-2026-10-01.json']);
    expect(backupsToPrune(names, 2)).toHaveLength(4);
  });
});

// ─── Languages ───────────────────────────────────────────────

describe('translations', async () => {
  const en = (await import('../../src/i18n/en')).default as Record<string, unknown>;
  const locales = { es: (await import('../../src/i18n/es')).default, fr: (await import('../../src/i18n/fr')).default, de: (await import('../../src/i18n/de')).default };
  const holes = (v: unknown) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort();

  for (const [name, messages] of Object.entries(locales) as [string, Record<string, unknown>][]) {
    it(`${name} has every key, with the same placeholders`, () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en)) {
        expect(holes(messages[key]), `${name} ${key}`).toEqual(holes(en[key]));
        expect(typeof messages[key], `${name} ${key}`).toBe(typeof en[key]);
      }
    });
  }
});
