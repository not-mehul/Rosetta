// Files Rosetta should take: other text encodings, comics with stray files,
// notes that mention PDFs, and every readable name in a folder.
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { detectFormat, isReadableName } from '../../src/formats/sniff';
import { decodeText, looksLikeText } from '../../src/formats/text';
import { fb2Info, openFb2 } from '../../src/formats/fb2';
import { openText, htmlInfo } from '../../src/formats/flow';

const bytes = (...parts: (string | number[])[]) => new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...strToU8(p)] : p)));
function utf16le(s: string): Uint8Array {
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < s.length; i++) {
    out[2 + i * 2] = s.charCodeAt(i) & 0xff;
    out[3 + i * 2] = s.charCodeAt(i) >> 8;
  }
  return out;
}

describe('text in other encodings', () => {
  it('reads Windows-1252 text', () => {
    const latin = bytes('Caf', [0xe9], ' au lait, na', [0xef], 've. ', [0x93], 'Quoted', [0x94], '\r\n');
    expect(detectFormat(latin, 'notes.txt')).toBe('txt');
    expect(decodeText(latin)).toBe('Café au lait, naïve. “Quoted”\n');
    expect(openText(latin).sections[0]!.text).toContain('Café');
  });

  it('reads UTF-16 text, as Windows Notepad saves "Unicode"', () => {
    const file = utf16le('Tide tables — spring\r\n\r\nHigh water at six.');
    expect(detectFormat(file, 'tides.txt')).toBe('txt');
    expect(detectFormat(file, 'opened-without-a-name')).toBe('txt');
    expect(decodeText(file)).toBe('Tide tables — spring\n\nHigh water at six.');
    expect(detectFormat(utf16le('# Heading\n\nBody'), 'note')).toBe('md');
  });

  it('reads a windows-1251 FictionBook', () => {
    const head = '<?xml version="1.0" encoding="windows-1251"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>';
    const tail = '</book-title></title-info></description><body><section><title><p>I</p></title><p>x</p></section></body></FictionBook>';
    const file = bytes(head, [0xc2, 0xee, 0xe9, 0xed, 0xe0], tail);
    expect(detectFormat(file, 'war.fb2')).toBe('fb2');
    expect(fb2Info(file).title).toBe('Война');
    expect(openFb2(file).sections).toHaveLength(1);
  });

  it('reads an old HTML page in the charset it names', () => {
    const page = bytes('<html><head><meta charset="windows-1251"><title>', [0xc4, 0xee, 0xec], '</title></head><body><p>x</p></body></html>');
    expect(detectFormat(page, 'page.html')).toBe('html');
    expect(htmlInfo(page).title).toBe('Дом');
  });

  it('keeps UTF-8 as UTF-8, whatever a tag says', () => {
    expect(decodeText(strToU8('<meta charset="iso-8859-1"><p>Café</p>'))).toContain('Café');
  });

  it('still refuses binary files', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
    expect(detectFormat(png, 'picture.txt')).toBeNull();
    const noise = Uint8Array.from({ length: 2048 }, (_, i) => (i * 37) % 31 || 1);
    expect(looksLikeText(noise)).toBe(false);
  });
});

describe('format detection', () => {
  it('a note that mentions %PDF- is still a note', () => {
    expect(detectFormat(strToU8('# File formats\n\nEvery PDF starts with %PDF-1.7.\n'), 'formats.md')).toBe('md');
    expect(detectFormat(strToU8('Every PDF starts with %PDF-1.7.'), 'content-uri-without-a-name')).toBe('txt');
  });

  it('a PDF with junk before its header is still a PDF', () => {
    expect(detectFormat(bytes('junk junk\n', '%PDF-1.4\n%', [0xe2, 0xe3, 0xcf, 0xd3], '\n1 0 obj'), 'scan')).toBe('pdf');
    expect(detectFormat(bytes('junk\n%PDF-1.4\n1 0 obj'), 'scan.pdf')).toBe('pdf');
  });

  it('a comic with Thumbs.db, desktop.ini or ComicInfo is still a comic', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    expect(detectFormat(zipSync({ '001.png': png, '002.png': png, 'Thumbs.db': new Uint8Array([1]), 'desktop.ini': strToU8('[x]'), 'ComicInfo.xml': strToU8('<ComicInfo/>') }), 'issue.cbz')).toBe('cbz');
    expect(detectFormat(zipSync({ 'notes.txt': strToU8('no pages') }), 'empty.cbz')).toBeNull();
  });

  it('a folder gives up every file Rosetta reads, Kindle books included', () => {
    for (const name of ['a.epub', 'b.PDF', 'c.mobi', 'd.azw3', 'e.azw', 'f.prc', 'g.cbz', 'h.markdown']) expect(isReadableName(name)).toBe(true);
    for (const name of ['cover.jpg', 'notes.xlsx', 'README']) expect(isReadableName(name)).toBe(false);
  });
});
