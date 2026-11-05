#!/usr/bin/env node
// Writes the small documents the tests open: an EPUB 3 with three chapters
// (a footnote and a picture among them), a Word document, FB2, CBZ, RTF and
// ODT files, and (with Playwright's Chromium) a three-page PDF.
//
//   node tests/fixtures/make-fixtures.mjs

import { strToU8, zlibSync, zipSync } from 'fflate';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** A small solid PNG, so the image tests have real pictures. */
function png(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const x of bytes) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (type, data) => {
    const body = [...strToU8(type), ...data];
    return [...u32(data.length), ...body, ...u32(crc(body))];
  };
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0);
    for (let x = 0; x < w; x++) raw.push(r, g, b);
  }
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', [...u32(w), ...u32(h), 8, 2, 0, 0, 0]), ...chunk('IDAT', [...zlibSync(new Uint8Array(raw))]), ...chunk('IEND', [])]);
}

const chapter = (title, paras) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title><style>p{color:red}</style></head>
<body><h1 id="top">${title}</h1>${paras.map((p, i) => `<p id="p${i}">${p}</p>`).join('')}<script>alert(1)</script></body></html>`;

const lorem = (n, word) => Array.from({ length: n }, (_, i) => `Paragraph ${i + 1} about ${word}. The lantern keeper climbed the stair each evening and counted the ships that passed the point, writing their names in a ledger bound in green cloth.`);

const epub = zipSync({
  mimetype: [strToU8('application/epub+zip'), { level: 0 }],
  'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
  'OEBPS/content.opf': strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:1</dc:identifier><dc:title>The Lantern Keeper</dc:title><dc:creator>Ada Marlow</dc:creator><dc:language>en</dc:language></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/two.xhtml" media-type="application/xhtml+xml"/><item id="c3" href="text/three.xhtml" media-type="application/xhtml+xml"/><item id="map" href="images/map.png" media-type="image/png"/></manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/></spine></package>`),
  'OEBPS/nav.xhtml': strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/one.xhtml">The stair</a></li><li><a href="text/two.xhtml">The ledger</a><ol><li><a href="text/two.xhtml#p3">A green cloth</a></li></ol></li><li><a href="text/three.xhtml">The storm</a></li></ol></nav></body></html>`),
  'OEBPS/text/one.xhtml': strToU8(chapter('The stair', ['The keeper kept a log<a epub:type="noteref" href="#n1">1</a> of every ship.', ...lorem(20, 'stairs'), 'See <a href="two.xhtml#p3">the ledger</a> later.', '<aside epub:type="footnote" id="n1">The log is now in the harbour museum.</aside>'])),
  'OEBPS/images/map.png': png(40, 30, [90, 120, 160]),
  'OEBPS/text/two.xhtml': strToU8(chapter('The ledger', ['<img src="../images/map.png" alt="A map of the point"/>', ...lorem(20, 'ledgers')])),
  'OEBPS/text/three.xhtml': strToU8(chapter('The storm', [...lorem(20, 'storms'), 'The albatross came at dawn.'])),
});
writeFileSync(join(here, 'lantern.epub'), epub);

const docx = zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'),
  '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'),
  'docProps/core.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Field Notes</dc:title><dc:creator>Iris Vale</dc:creator></cp:coreProperties>'),
  'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Field notes</w:t></w:r></w:p>
<w:p><w:r><w:t>The heron stood in the shallows for an hour.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Second day</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Rain.</w:t></w:r><w:r><w:t xml:space="preserve"> The kingfisher did not come.</w:t></w:r></w:p>
</w:body></w:document>`),
});
writeFileSync(join(here, 'field-notes.docx'), docx);

const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description><title-info><author><first-name>Mira</first-name><last-name>Holt</last-name></author><book-title>The Salt Road</book-title><lang>en</lang><sequence name="Coast" number="2"/></title-info></description>
<body><section><title><p>Inland</p></title><p>The caravan left at first light.</p><p>Salt was worth its weight in silver.</p></section>
<section><title><p>The well</p></title><p>The well at the crossroads had run dry.</p></section></body>
</FictionBook>`;
writeFileSync(join(here, 'salt-road.fb2'), fb2);

const cbz = zipSync({
  'page-01.png': png(60, 90, [200, 80, 60]),
  'page-02.png': png(60, 90, [60, 160, 90]),
  'page-03.png': png(60, 90, [60, 90, 200]),
});
writeFileSync(join(here, 'tin-moon.cbz'), cbz);

const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Times;}}{\info{\title Ship Log}{\author Ned Ward}}
{\pard\b Monday\b0\par}
{\pard The \i Marigold\i0  came in at noon.\par}
{\pard Caf\'e9 on the quay was shut.\par}
}`;
writeFileSync(join(here, 'ship-log.rtf'), rtf);

const odt = zipSync({
  mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
  'META-INF/manifest.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>'),
  'meta.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"><office:meta><dc:title>Orchard Diary</dc:title><meta:initial-creator>June Park</meta:initial-creator></office:meta></office:document-meta>'),
  'content.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>
<text:h text:outline-level="1">Spring</text:h><text:p>The pear trees flowered early.</text:p>
<text:h text:outline-level="2">Late frost</text:h><text:p>We lit fires between the rows.</text:p>
<text:list><text:list-item><text:p>Pears</text:p></text:list-item><text:list-item><text:p>Quinces</text:p></text:list-item></text:list>
</office:text></office:body></office:document-content>`),
});
writeFileSync(join(here, 'orchard.odt'), odt);

// A PDF printed by Chromium, so it has a real text layer.
try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  const pages = ['First page about lighthouses.', 'Second page about the albatross at dawn.', 'Third page about the harbour.'];
  await page.setContent(`<html><head><title>Harbour Charts</title></head><body style="font: 18px serif">${pages.map((t, i) => `<section style="page-break-after: always"><h1>Chart ${i + 1}</h1><p>${t}</p></section>`).join('')}</body></html>`);
  writeFileSync(join(here, 'harbour.pdf'), await page.pdf({ format: 'A5', outline: true, tagged: true }));
  await browser.close();
} catch (err) {
  console.warn('Skipped the PDF (Playwright not available):', err.message);
}
console.log('Wrote the fixtures.');
