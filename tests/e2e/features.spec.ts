import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

async function add(page: Page, files: string[], button = '#addFirst') {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(button)]);
  await chooser.setFiles(files.map((f) => (f.startsWith('/') ? f : fixture(f))));
}

async function showBars(page: Page) {
  if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(200, 420);
  await expect(page.locator('.reader.chrome-hidden')).toHaveCount(0);
}

/** WCAG 2.1 AA, as axe sees it. */
async function expectAccessible(page: Page, include?: string) {
  let axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (include) axe = axe.include(include);
  const { violations } = await axe.analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** With text at 200% (WCAG 1.4.4), nothing is cut off at the side: no visible element reaches past the window, unless it sits in something that scrolls sideways. */
async function fits(page: Page, where: string) {
  // Measure once things have slid into place.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
  const over = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrolls = (el: Element | null): boolean => {
      for (; el && el !== document.body; el = el.parentElement) {
        const x = getComputedStyle(el).overflowX;
        if ((x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth) return true;
      }
      return false;
    };
    return [...document.querySelectorAll('button, a, label, h1, h2, h3, p, span, input, select, summary')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && r.right > width + 1 && r.left < width && !el.closest('.reading, .page-strip') && !scrolls(el.parentElement);
      })
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 30)}"`);
  });
  expect(over, where).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('reads FB2, comic archives, RTF and OpenDocument', async ({ page }) => {
  await add(page, ['salt-road.fb2', 'tin-moon.cbz', 'ship-log.rtf', 'orchard.odt']);
  await expect(page.locator('#toast')).toContainText('Added 4 documents');
  await expect(page.locator('.doc-card', { hasText: 'The Salt Road' })).toContainText('Mira Holt');

  await page.getByRole('button', { name: /^The Salt Road/ }).click();
  await expect(page.locator('.reading h2')).toHaveText('Inland');
  await page.click('#closeReader');

  await page.getByRole('button', { name: /^Tin moon/ }).click();
  await expect(page.locator('.reading img')).toHaveCount(3);
  await page.click('#closeReader');

  await page.getByRole('button', { name: /^Ship Log/ }).click();
  await expect(page.locator('.reading em')).toHaveText('Marigold');
  await page.click('#closeReader');

  await page.getByRole('button', { name: /^Orchard Diary/ }).click();
  await expect(page.locator('.reading h1')).toHaveText('Spring');
});

test('pages turn by tap, key and swipe, and the place survives a reload', async ({ page }) => {
  await add(page, ['lantern.epub']);
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await showBars(page);
  await page.click('#openType');
  await page.click('#modePaged');
  await page.click('#turn-none');
  await page.keyboard.press('Escape');

  const number = page.locator('.page-number');
  await expect(number).toHaveText(/^Page 1 of \d+$/);
  const box = (await page.locator('.pager').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  await expect(number).toHaveText(/^Page 2 of/);
  await page.keyboard.press('ArrowRight');
  await expect(number).toHaveText(/^Page 3 of/);
  await page.keyboard.press('ArrowLeft');
  await expect(number).toHaveText(/^Page 2 of/);
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
  await expect(number).toHaveText(/^Page 1 of/);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(number).toHaveText(/^Page 4 of/);

  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.locator('.page-number')).toHaveText(/^Page 4 of/);
});

test('the page curl follows the finger and turns the page', async ({ page }) => {
  await add(page, ['lantern.epub']);
  await showBars(page);
  await page.click('#openType');
  await page.click('#modePaged');
  await page.click('#turn-curl');
  await page.keyboard.press('Escape');
  await expect(page.locator('.page-number')).toHaveText(/^Page 1 of/);

  const box = (await page.locator('.pager').boundingBox())!;
  const y = box.y + box.height * 0.8;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.85, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * (0.85 - i * 0.06), y: y - i * 4 }] });
  await expect(page.locator('.curl-flap')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.page-number')).toHaveText(/^Page 2 of/);
  // The curl is put away, ready for the next turn.
  await expect(page.locator('.curl:not(.is-idle)')).toHaveCount(0);
});

test('footnotes open in place, and pictures open full screen', async ({ page }) => {
  await add(page, ['lantern.epub']);
  await page.locator('.reading a[epub\\:type="noteref"]').click();
  await expect(page.locator('.note-body')).toContainText('harbour museum');
  await page.keyboard.press('Escape');
  await expect(page.locator('.reading h1')).toHaveText('The stair');

  await showBars(page);
  await page.click('#nextSection');
  await page.locator('.reading img').click();
  await expect(page.locator('#closeImage')).toBeVisible();
  await page.click('#closeImage');
  await expect(page.locator('#closeImage')).toHaveCount(0);
});

test('collections, tags and series from a document’s details', async ({ page }) => {
  await add(page, ['lantern.epub', 'salt-road.fb2', 'garden.md']);
  await expect(page.locator('.doc-card')).toHaveCount(3);

  await page.getByRole('button', { name: 'Details for The Lantern Keeper' }).click();
  await page.click('#editDetails');
  await page.fill('#editSeries', 'Coast');
  await page.fill('#editVolume', '1');
  await page.fill('#editTags', 'sea, lights');
  await page.click('#newCollection');
  await page.fill('#promptInput', 'Holiday');
  await page.click('#promptAction');
  await page.click('#saveDetails');
  await expect(page.locator('#toast')).toContainText('Details saved');
  await page.keyboard.press('Escape');

  // The collection shows only its documents.
  await page.locator('.chip[data-collection="Holiday"]').click();
  await expect(page.locator('.doc-card')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Everything' }).click();
  await expect(page.locator('.doc-card')).toHaveCount(3);

  // #tags filter, and series sort puts volume 1 before volume 2.
  await page.getByRole('button', { name: '#sea' }).click();
  await expect(page.locator('.doc-card')).toHaveCount(1);
  await page.fill('#libraryFilter', '');
  await page.getByRole('radio', { name: 'Series' }).click();
  await expect(page.locator('.doc-card').nth(0)).toContainText('The Lantern Keeper');
  await expect(page.locator('.doc-card').nth(1)).toContainText('The Salt Road');
});

test('all notes gather in one place and search', async ({ page }) => {
  await add(page, ['lantern.epub', 'tide.txt']);
  await page.getByRole('button', { name: /^The Lantern Keeper/ }).click();
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await page.evaluate(() => {
    const p = document.querySelectorAll('.reading p')[1]!;
    const r = document.createRange();
    r.setStart(p.firstChild!, 0);
    r.setEnd(p.firstChild!, 11);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.getByRole('button', { name: 'Highlight in Amber' }).click();
  await page.click('#closeReader');

  await page.click('#openNotes');
  await expect(page.locator('#allNotes li')).toHaveCount(1);
  await expect(page.locator('#allNotes')).toContainText('Paragraph 1');
  await page.fill('#notesSearch', 'albatross');
  await expect(page.locator('#allNotes li')).toHaveCount(0);
});

test('the interface speaks Spanish, French and German', async ({ page }) => {
  await page.click('#openSettings');
  await page.click('#language');
  await page.click('.dd-option[data-value="es"]');
  await expect(page.locator('.sheet-title')).toHaveText('Ajustes');
  await page.click('#language');
  await page.click('.dd-option[data-value="fr"]');
  await expect(page.locator('.sheet-title')).toHaveText('Réglages');
  await page.click('#language');
  await page.click('.dd-option[data-value="de"]');
  await expect(page.locator('.sheet-title')).toHaveText('Einstellungen');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.click('#language');
  await page.click('.dd-option[data-value="en"]');
  await expect(page.locator('.sheet-title')).toHaveText('Settings');
});

test('library, reader and sheets pass an accessibility check', async ({ page }) => {
  await expectAccessible(page);
  await add(page, ['lantern.epub', 'harbour.pdf']);
  await expect(page.locator('.doc-card')).toHaveCount(2);
  await expectAccessible(page);

  await page.click('#openSettings');
  await expectAccessible(page, '.sheet');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^The Lantern Keeper/ }).click();
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await showBars(page);
  await expectAccessible(page);
  await page.click('#openContents');
  await expectAccessible(page, '.sheet');
});

test('the library, reader and sheets fit with text at 200%', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await add(page, ['lantern.epub', 'harbour.pdf']);
  await expect(page.locator('.doc-card')).toHaveCount(2);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await fits(page, 'library');
  for (const sheet of ['#openSettings']) {
    await page.click(sheet);
    await fits(page, sheet);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: /^The Lantern Keeper/ }).click();
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await showBars(page);
  await fits(page, 'reader');
  for (const sheet of ['#openContents', '#openType']) {
    await page.click(sheet);
    await fits(page, sheet);
    await page.keyboard.press('Escape');
  }
});

test('a long book opens and turns within budget', async ({ page }) => {
  test.slow();
  // 40 chapters of 300 paragraphs: about 2.5 million characters.
  const para = 'The lantern keeper climbed the stair each evening and counted the ships that passed the point, writing their names in a ledger bound in green cloth. ';
  const chapters = Array.from({ length: 40 }, (_, c) => `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${c}</title></head><body><h1>Chapter ${c + 1}</h1>${Array.from({ length: 300 }, (_, i) => `<p>${i} ${para}</p>`).join('')}</body></html>`);
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'content.opf': strToU8(
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">big</dc:identifier><dc:title>The Long Book</dc:title></metadata><manifest>${chapters.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`,
    ),
  };
  chapters.forEach((html, i) => (files[`c${i}.xhtml`] = strToU8(html)));
  const path = join(mkdtempSync(join(tmpdir(), 'rosetta-')), 'long.epub');
  writeFileSync(path, zipSync(files));

  const started = Date.now();
  await add(page, [path]);
  await expect(page.locator('.reading h1')).toHaveText('Chapter 1', { timeout: 15_000 });
  const opened = Date.now() - started;
  expect(opened, `opened in ${opened} ms`).toBeLessThan(8000);

  await showBars(page);
  await page.click('#openType');
  await page.click('#modePaged');
  await page.click('#turn-none');
  await page.keyboard.press('Escape');
  await expect(page.locator('.page-number')).toHaveText(/^Page 1 of/);
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.page-number')).toHaveText(/^Page 11 of/);
  const turns = Date.now() - t0;
  expect(turns, `ten turns in ${turns} ms`).toBeLessThan(3000);
});

test('hides easter eggs, counts them once, and lists the count in Settings', async ({ page }) => {
  await expect(page.locator('#addFirst')).toBeVisible();
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
    await page.keyboard.press(key);
  }
  await expect(page.locator('.toast[data-kind="celebrate"]')).toContainText('One stone, many scripts. Easter egg found: 1 of 4.');
  await expect(page.locator('.script-word')).toHaveText('ἀνάγνωσις');

  for (let i = 0; i < 7; i++) await page.locator('.t-page-title').click();
  await expect(page.locator('.toast[data-kind="celebrate"]')).toHaveText('Every shelf dusted. Easter egg found: 2 of 4.');

  await page.click('#openSettings');
  await expect(page.locator('#eggCount')).toHaveText('Easter eggs: 2 of 4 found');
});

test('left alone, the library offers a stone that reads one word in nine scripts', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#addFirst')).toBeVisible();
  await page.clock.runFor(41_000);
  const dock = page.getByTestId('idle-dock');
  await expect(dock).toBeVisible();
  await expect(dock.locator('.idle-line')).toHaveText('One word, nine scripts. Tap the stone.');
  expect((await new AxeBuilder({ page }).include('[data-testid="idle-dock"]').analyze()).violations).toEqual([]);

  const stone = dock.getByRole('button', { name: 'Turn the stone' });
  await stone.click();
  await expect(dock.locator('.word')).toHaveText('Διάβασε');
  await expect(dock.locator('.language')).toHaveText('Greek');
  for (let i = 1; i < 9; i++) await stone.click();
  await expect(dock.locator('.word')).toHaveText('读');
  await expect(page.locator('.toast[data-kind="celebrate"]')).toHaveText('Nine scripts, one word. Champollion would be pleased. Easter egg found: 1 of 4.');

  await page.keyboard.press('Escape');
  await expect(dock).toHaveCount(0);
});

test('the way back after a jump, the footer’s figures and chapter ticks', async ({ page }) => {
  await add(page, ['lantern.epub']);
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await showBars(page);

  // Chapters cut the progress line; the footer's figure changes on a tap and stays changed.
  await expect(page.locator('.reader-foot .meter-tick')).toHaveCount(2);
  await expect(page.locator('#footerFigure')).toContainText('left');
  await page.click('#footerFigure');
  await expect(page.locator('#footerFigure')).toContainText('left in the chapter');
  await page.click('#footerFigure');
  await expect(page.locator('#footerFigure')).toHaveText('Chapter 1 of 3');

  // A search result far away leaves a way back, and the way back leaves one to return.
  await expect(page.locator('#returnTo')).toHaveCount(0);
  await page.click('#openSearch');
  await page.fill('#searchInput', 'albatross');
  await page.locator('#searchResults button').click();
  await expect(page.locator('mark.hl-flash')).toHaveText('albatross');
  await showBars(page);
  await expect(page.locator('#returnTo')).toHaveText('Back to The stair');
  await expect(page.locator('#footerFigure')).toHaveText('Chapter 3 of 3');
  await page.click('#returnTo');
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await showBars(page);
  await expect(page.locator('#returnTo')).toHaveText('Back to The storm');
  await expectAccessible(page, '.reader-foot');
});

test('a daily goal and the reading calendar', async ({ page }) => {
  await add(page, ['lantern.epub']);
  await page.click('#closeReader');
  await page.click('#openStats');
  await expect(page.locator('.calendar-day[data-day]')).toHaveCount(18 * 7);
  await expect(page.locator('.calendar-day.is-today')).toHaveCount(1);
  await page.click('[data-goal="30"]');
  await expect(page.locator('#goalStatus')).toHaveText('0 of 30 min today');
  await expectAccessible(page, '.sheet');

  // Arrow keys move between days; a picked day shows its time.
  await page.locator('.calendar-day.is-today').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.calendar-day[aria-pressed=true]')).not.toHaveClass(/is-today/);
  await expect(page.locator('#calendarPicked')).toContainText('0 min');

  // The goal shows beside Continue reading.
  await page.keyboard.press('Escape');
  await expect(page.locator('#goalToday')).toHaveText('0 of 30 min today');
});

test('flows a sentence at a time, with visual anchors and a font of your own', async ({ page }) => {
  // A single file opens as it is added.
  await add(page, ['lantern.epub']);
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await showBars(page);
  await page.click('#openType');

  // Visual anchors bold the start of each word and leave the text alone.
  await page.getByRole('switch', { name: /Visual anchors/ }).click();
  await expect(page.locator('.reading b.anchor').first()).toHaveText('T');
  await expect(page.locator('.reading p').first()).toContainText('The keeper kept a log');

  // Flow: one sentence, revealed letter by letter at the chosen speed.
  await page.click('#modeFlow');
  await expect(page.locator('#flowSpeed')).toBeVisible();
  await page.locator('#flowSpeed').fill('10');
  await page.keyboard.press('Escape');
  await expect(page.locator('.flow-sentence')).toHaveCount(1);
  await expect(page.locator('.flow-count')).toHaveText(/^1 of \d+/);
  // The heading shows whole; the next sentence starts hidden and a tap shows the rest.
  await page.mouse.click(300, 500);
  await expect(page.locator('.flow-count')).toHaveText(/^2 of /);
  await expect(page.locator('.flow-sentence .veiled').first()).toBeAttached();
  await page.mouse.click(300, 500);
  await expect(page.locator('.flow-sentence .veiled')).toHaveCount(0);
  await expect(page.locator('.flow-sentence .visually-hidden')).toHaveText(/The keeper kept a log/);
  // The count stays put at the bottom centre while sentences of any length come and go.
  const where = async () => {
    // Once the bars' slide has settled.
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
    const box = (await page.locator('.flow-count').boundingBox())!;
    return { y: Math.round(box.y), centre: Math.round(box.x + box.width / 2) };
  };
  const before = await where();
  await page.mouse.click(300, 500);
  await expect(page.locator('.flow-count')).toHaveText(/^3 of /);
  const after = await where();
  expect(after.y).toBe(before.y);
  expect(Math.abs(after.centre - before.centre)).toBeLessThanOrEqual(2);
  const viewport = page.viewportSize()!;
  expect(Math.abs(after.centre - viewport.width / 2)).toBeLessThanOrEqual(2);
  expect(after.y).toBeGreaterThan(viewport.height * 0.8);
  // The left edge goes back, shown whole.
  await page.mouse.click(30, 500);
  await expect(page.locator('.flow-count')).toHaveText(/^2 of /);
  await expect(page.locator('.flow-sentence .veiled')).toHaveCount(0);

  // The count brings the bars back.
  await page.click('#flowBars');
  await expect(page.locator('.reader.chrome-hidden')).toHaveCount(0);

  // A font file that isn't a font is turned away.
  await page.click('#openType');
  const dir = mkdtempSync(join(tmpdir(), 'font-'));
  writeFileSync(join(dir, 'Broken.ttf'), 'not a font');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#faceCustom')]);
  await chooser.setFiles(join(dir, 'Broken.ttf'));
  await expect(page.locator('#toast')).toContainText('isn’t a font');
  await expect(page.locator('#faceCustom')).toHaveAttribute('aria-checked', 'false');
});

test('OLED turns Dusk to true black, and stays on through a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('#openSettings');
  await page.getByRole('switch', { name: /True black/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-oled', '');
  const black = () => page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  expect(await black()).toContain('rgb(0, 0, 0) 50%');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-oled', '');
  // Dawn is left as it is.
  await page.click('#openSettings');
  await page.locator('.segmented button', { hasText: 'Dawn' }).first().click();
  expect(await black()).not.toContain('rgb(0, 0, 0)');
});
