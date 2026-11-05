#!/usr/bin/env node
// Writes the small documents the tests open: an EPUB 3 with three chapters,
// a Word document, and (with Playwright's Chromium) a three-page PDF.
//
//   node tests/fixtures/make-fixtures.mjs

import { strToU8, zipSync } from 'fflate';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const chapter = (title, paras) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title><style>p{color:red}</style></head>
<body><h1 id="top">${title}</h1>${paras.map((p, i) => `<p id="p${i}">${p}</p>`).join('')}<script>alert(1)</script></body></html>`;

const lorem = (n, word) => Array.from({ length: n }, (_, i) => `Paragraph ${i + 1} about ${word}. The lantern keeper climbed the stair each evening and counted the ships that passed the point, writing their names in a ledger bound in green cloth.`);

const epub = zipSync({
  mimetype: [strToU8('application/epub+zip'), { level: 0 }],
  'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
  'OEBPS/content.opf': strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:1</dc:identifier><dc:title>The Lantern Keeper</dc:title><dc:creator>Ada Marlow</dc:creator><dc:language>en</dc:language></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/two.xhtml" media-type="application/xhtml+xml"/><item id="c3" href="text/three.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/></spine></package>`),
  'OEBPS/nav.xhtml': strToU8(`<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/one.xhtml">The stair</a></li><li><a href="text/two.xhtml">The ledger</a><ol><li><a href="text/two.xhtml#p3">A green cloth</a></li></ol></li><li><a href="text/three.xhtml">The storm</a></li></ol></nav></body></html>`),
  'OEBPS/text/one.xhtml': strToU8(chapter('The stair', [...lorem(20, 'stairs'), 'See <a href="two.xhtml#p3">the ledger</a> later.'])),
  'OEBPS/text/two.xhtml': strToU8(chapter('The ledger', lorem(20, 'ledgers'))),
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
