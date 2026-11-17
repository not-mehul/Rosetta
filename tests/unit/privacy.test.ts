// Nothing in a document may reach the network, and a stray "%" in a book
// must not stop it opening.
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { clean, declarations, offlineStyle, offlineValue } from '../../src/formats/sanitize';
import { scopeCss } from '../../src/formats/styles';
import { epubInfo, openEpub } from '../../src/formats/epub';
import { nameFrom } from '../../src/platform/intake';
import { safeDecode } from '../../src/lib/uri';

const remote = /https?:|tracker/i;

function epub(href: string, body: string) {
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/p.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/p.opf': strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title></metadata><manifest><item id="c" href="${href}" media-type="application/xhtml+xml"/><item id="c2" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/><itemref idref="c2"/></spine></package>`),
    [`OEBPS/${href}`]: strToU8(`<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`),
    'OEBPS/two.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="x">Two</h1></body></html>'),
  });
}

describe('nothing in a document reaches the network', () => {
  it('drops srcset and sizes from images', () => {
    const { html } = clean('<p><img src="a.png" srcset="https://tracker.example/x.png 1x" sizes="100vw" alt="a"></p>', { resolveSrc: () => 'blob:ok' });
    expect(html).toContain('blob:ok');
    expect(html).not.toMatch(remote);
    expect(html).not.toContain('sizes');
  });

  it('drops image-set() and escaped url() from a book’s CSS', () => {
    for (const rule of ['li { list-style-image: image-set("https://tracker.example/i.png" 1x); }', 'li { list-style-image: -webkit-image-set("https://tracker.example/i.png" 1x); }', 'li { list-style-image: url(\\68ttps://tracker.example/i.png); }', 'li { list-style-image: \\75 rl(https://tracker.example/i.png); }', 'li { list-style-image: url("\\68ttps://tracker.example/i.png"); }']) {
      expect(scopeCss(rule, { scope: '.reading.publisher', resolveUrl: () => null })).not.toMatch(remote);
    }
  });

  it('keeps only url()s that name a file in the book, in fixed-layout inline styles', () => {
    const resolve = (u: string) => (u === '../img/p1.jpg' ? 'blob:page1' : null);
    const { html } = clean(
      '<div style="width: 600px; background-image: url(../img/p1.jpg)">a</div>' +
        '<div style="background-image: image-set(&quot;https://tracker.example/i.png&quot; 1x)">b</div>' +
        '<div style="background: url(\\68ttps://tracker.example/i.png)">c</div>' +
        '<div style="background: url(https://tracker.example/i.png)">d</div>',
      { keepStyle: true, resolveSrc: resolve },
    );
    expect(html).not.toMatch(remote);
    expect(html).toContain('url(&quot;blob:page1&quot;)');
    expect(html).toContain('width: 600px');
  });

  it('keeps text escapes inside strings, which books use for quotes and bullets', () => {
    expect(offlineValue('"\\201C"')).toBe('"\\201C"');
  });

  it('splits declarations without breaking a data: URI', () => {
    expect(declarations('src: url(data:font/woff2;base64,AAAA) format("woff2"); font-family: "A;B"')).toEqual(['src: url(data:font/woff2;base64,AAAA) format("woff2")', 'font-family: "A;B"']);
    const css = scopeCss('@font-face { font-family: X; src: url(data:font/woff2;base64,AAAA) format("woff2"); }', { scope: '.fx', keepAll: true });
    expect(css).toContain('data:font/woff2;base64,AAAA');
    expect(offlineStyle('background: url(data:image/png;base64,AAAA); color: red')).toBe('background: url(data:image/png;base64,AAAA); color: red');
  });
});

describe('a stray % in a book', () => {
  it('decodes what it can and keeps the rest', () => {
    expect(safeDecode('caf%C3%A9')).toBe('café');
    expect(safeDecode('100%.xhtml')).toBe('100%.xhtml');
    expect(safeDecode('a%20b%E0%A4')).toBe('a b%E0%A4');
  });

  it('opens a book with a literal % in a file name', () => {
    const bytes = epub('100%.xhtml', '<h1>One</h1><p>Text</p>');
    expect(epubInfo(bytes).title).toBe('T');
    expect(openEpub(bytes).sections).toHaveLength(2);
  });

  it('keeps a chapter whose links have malformed escapes', () => {
    const doc = openEpub(epub('one.xhtml', '<h1>One</h1><p><a href="#note%E0%A4">a</a> <a href="two.xhtml#x%ZZ">b</a> <a href="two.xhtml#x">c</a></p>'));
    expect(doc.sections[0]!.text).toContain('One');
    expect(doc.sections[0]!.html).toContain('data-link="1#r-x"');
  });

  it('names a file opened from a content URI with a stray %', () => {
    expect(nameFrom('content://x/document/100%.epub')).toBe('100%.epub');
  });
});
