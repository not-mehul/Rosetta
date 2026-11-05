import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openEpub, resolvePath } from '../../src/formats/epub';
import { frontMatter, openMarkdown, openText, textToHtml } from '../../src/formats/flow';
import { readInfo } from '../../src/formats';
import { clean, headingToc } from '../../src/formats/sanitize';
import { detectFormat, titleFromName } from '../../src/formats/sniff';

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));
const utf8 = (s: string) => new TextEncoder().encode(s);

describe('detectFormat', () => {
  it('reads the bytes before the name', () => {
    expect(detectFormat(fixture('lantern.epub'), 'whatever.bin')).toBe('epub');
    expect(detectFormat(fixture('harbour.pdf'), 'document:1234')).toBe('pdf');
    expect(detectFormat(fixture('field-notes.docx'), 'notes')).toBe('docx');
  });

  it('uses the extension for text formats, and sniffs when there is none', () => {
    expect(detectFormat(utf8('hello'), 'a.md')).toBe('md');
    expect(detectFormat(utf8('hello'), 'a.txt')).toBe('txt');
    expect(detectFormat(utf8('<!doctype html><p>x'), 'content:42')).toBe('html');
    expect(detectFormat(utf8('# Title\n\ntext'), 'content:42')).toBe('md');
    expect(detectFormat(utf8('Just words.'), 'content:42')).toBe('txt');
  });

  it('refuses binary files and other zips', () => {
    expect(detectFormat(new Uint8Array([0, 1, 2, 3, 0, 0]), 'x.txt')).toBeNull();
    expect(detectFormat(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9]), 'x.zip')).toBeNull();
  });
});

describe('titleFromName', () => {
  it('turns slugs into titles and leaves names alone', () => {
    expect(titleFromName('the_art-of-reading.md')).toBe('The art of reading');
    expect(titleFromName('Jean-Paul Sartre - Nausea.epub')).toBe('Jean-Paul Sartre - Nausea');
    expect(titleFromName('.txt')).toBe('Untitled');
  });
});

describe('clean', () => {
  it('drops scripts, styles and handlers, and prefixes ids, classes and anchors', () => {
    const out = clean('<p id="a" class="x" style="color:red" onclick="evil()">Hi <a href="#a">me</a></p><script>alert(1)</script><style>p{}</style>');
    expect(out.html).toBe('<p id="r-a" class="r-x">Hi <a href="#r-a" data-link="#r-a">me</a></p>');
    expect(out.text).toBe('Hi me');
  });

  it('opens external links outside the app and resolves internal ones', () => {
    const out = clean('<a href="https://example.org">x</a><a href="ch2.xhtml#n1">y</a><a href="javascript:alert(1)">z</a>', { resolveLink: (h) => (h.startsWith('ch2') ? '1#r-n1' : null) });
    expect(out.html).toContain('target="_blank"');
    expect(out.html).toContain('data-link="1#r-n1"');
    expect(out.html).not.toContain('javascript');
  });

  it('keeps alt text for images it cannot load', () => {
    expect(clean('<p><img src="gone.png" alt="A map"></p>').html).toBe('<p>A map</p>');
    expect(clean('<img src="x.png">', { resolveSrc: () => 'blob:1' }).html).toContain('src="blob:1"');
  });
});

describe('headingToc', () => {
  it('lists headings with depth relative to the top level', () => {
    const { html, toc } = headingToc('<h2>One</h2><p>a</p><h3>One a</h3><h2>Two</h2>');
    expect(toc.map((t) => [t.label, t.depth, t.anchor])).toEqual([
      ['One', 0, 'r-h0'],
      ['One a', 1, 'r-h1'],
      ['Two', 0, 'r-h2'],
    ]);
    expect(clean(html).html).toContain('id="r-h0"');
  });
});

describe('EPUB', () => {
  it('reads the spine, the nav contents with nesting, and the metadata', async () => {
    const doc = openEpub(fixture('lantern.epub'));
    expect(doc.sections).toHaveLength(3);
    expect(doc.sections[0]!.title).toBe('The stair');
    expect(doc.toc.map((t) => [t.label, t.section, t.depth, t.anchor])).toEqual([
      ['The stair', 0, 0, undefined],
      ['The ledger', 1, 0, undefined],
      ['A green cloth', 1, 1, 'r-p3'],
      ['The storm', 2, 0, undefined],
    ]);
    // Cross-chapter links point at the section and its anchor.
    expect(doc.sections[0]!.html).toContain('data-link="1#r-p3"');
    expect(doc.sections[2]!.text).toContain('The albatross came at dawn.');
    expect(doc.sections[2]!.html).not.toContain('<script');
    const info = await readInfo(fixture('lantern.epub'), 'lantern.epub');
    expect(info).toMatchObject({ format: 'epub', title: 'The Lantern Keeper', author: 'Ada Marlow' });
  });

  it('resolves relative paths', () => {
    expect(resolvePath('OEBPS/text/', '../images/a%20b.png#x')).toBe('OEBPS/images/a b.png');
    expect(resolvePath('', '/root.xhtml')).toBe('root.xhtml');
  });
});

describe('Markdown and text', () => {
  it('reads front matter and builds contents from headings', async () => {
    const md = fixture('garden.md');
    expect(frontMatter(new TextDecoder().decode(md))).toMatchObject({ title: 'Garden Diary', author: 'Tom Reed' });
    const doc = openMarkdown(md);
    expect(doc.toc.map((t) => t.label)).toEqual(['Spring', 'Planting', 'Summer']);
    expect(doc.sections[0]!.html).toContain('<strong>crocus</strong>');
    expect(await readInfo(md, 'garden.md')).toMatchObject({ format: 'md', title: 'Garden Diary', author: 'Tom Reed' });
  });

  it('takes the first heading as the title without front matter', async () => {
    expect((await readInfo(utf8('# On Walking\n\nSlowly.'), 'walk.md')).title).toBe('On Walking');
    expect((await readInfo(utf8('Plain words'), 'my_notes.txt')).title).toBe('My notes');
  });

  it('sets plain text as paragraphs with chapter headings', () => {
    expect(textToHtml('CHAPTER ONE\n\nA line\nand another.\n\n\nNext <b>.')).toBe('<h2>CHAPTER ONE</h2>\n<p>A line<br>and another.</p>\n<p>Next &lt;b&gt;.</p>');
    const doc = openText(fixture('tide.txt'));
    expect(doc.toc.map((t) => t.label)).toEqual(['CHAPTER ONE', 'CHAPTER TWO']);
  });
});

describe('Word', () => {
  it('reads the core properties', async () => {
    expect(await readInfo(fixture('field-notes.docx'), 'field-notes.docx')).toMatchObject({ format: 'docx', title: 'Field Notes', author: 'Iris Vale' });
  });
});
