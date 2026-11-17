// A highlight or a bookmark in Notes opens its book at that very place, in
// scroll and in page mode, however far it is from where the book was left.
import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function longBook(): string {
  const para = (c: number, i: number) => `Chapter ${c} paragraph ${i}: the keeper climbed the stair and counted the ships that passed the point in the evening light.`;
  const chapters = Array.from({ length: 4 }, (_, c) => `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${c}</title></head><body><h1>Part ${c + 1}</h1>${Array.from({ length: 60 }, (_, i) => `<p>${para(c + 1, i + 1)}</p>`).join('')}</body></html>`);
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'content.opf': strToU8(
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">jump</dc:identifier><dc:title>The Far Mark</dc:title></metadata><manifest>${chapters.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`,
    ),
  };
  chapters.forEach((html, i) => (files[`c${i}.xhtml`] = strToU8(html)));
  const path = join(mkdtempSync(join(tmpdir(), 'rosetta-')), 'far.epub');
  writeFileSync(path, zipSync(files));
  return path;
}

async function bars(page: Page) {
  if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(200, 450);
  await expect(page.locator('#openType')).toBeVisible();
}

/** Highlights paragraph `n` of the chapter on screen, as a reader would. */
async function highlight(page: Page, n: number) {
  await page.evaluate((n) => {
    const p = [...document.querySelectorAll('.reading p')].find((el) => el.textContent?.includes(`paragraph ${n}:`))!;
    p.scrollIntoView({ block: 'center' });
    const r = document.createRange();
    r.setStart(p.firstChild!, 0);
    r.setEnd(p.firstChild!, 30);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  }, n);
  await page.click('.selection-bar [data-colour=sage]');
  await expect(page.locator('mark.hl-sage')).toHaveCount(1);
}

for (const mode of ['scroll', 'paged'] as const) {
  test(`a highlight in Notes opens at its place (${mode})`, async ({ page }) => {
    await page.goto('/');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
    await chooser.setFiles(longBook());
    await expect(page.locator('.reading h1')).toHaveText('Part 1');
    // Highlight far into part 3, then go back to the start and leave there.
    await bars(page);
    await page.click('#openContents');
    await page.locator('.toc-row', { hasText: 'Part 3' }).click();
    await expect(page.locator('.reading h1')).toHaveText('Part 3');
    await highlight(page, 48);
    await bars(page);
    await page.click('#openContents');
    await page.locator('.toc-row', { hasText: 'Part 1' }).click();
    await expect(page.locator('.reading h1')).toHaveText('Part 1');
    if (mode === 'paged') {
      await bars(page);
      await page.click('#openType');
      await page.click('#panel-page');
      await page.click('#modePaged');
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(1200);
    await bars(page);
    await page.click('#closeReader');

    await page.click('#tab-notes');
    await page.locator('#allNotes .highlight-row').first().click();
    await expect(page.locator('.reading h1').first()).toHaveText('Part 3');
    await expect(page.locator('.reader-page mark.hl-sage').first()).toBeInViewport();
    // And it stays there once everything has settled.
    await page.waitForTimeout(1500);
    await expect(page.locator('.reader-page mark.hl-sage').first()).toBeInViewport();
  });
}
