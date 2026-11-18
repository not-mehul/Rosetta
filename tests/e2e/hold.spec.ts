// Long press: choosing several books and acting on them together, and the
// small menus that a hold opens on highlights, bookmarks, tags, the add
// button and Continue reading.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

async function add(page: Page, files: string[], button = '#addFirst') {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(button)]);
  await chooser.setFiles(files.map(fixture));
}

/** Presses and holds, as a finger would (near the top, clear of any toast). */
async function hold(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 40));
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

const tile = (page: Page, title: string) => page.locator('.doc-card', { hasText: title }).locator('.doc-open');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('holding a book starts choosing; the chosen ones are finished, collected and removed together', async ({ page }) => {
  await add(page, ['garden.md', 'tide.txt', 'ship-log.rtf']);
  await expect(page.locator('.doc-card')).toHaveCount(3);

  // A hold chooses the book and doesn't open it; the add button gives way to the bar.
  await hold(page, tile(page, 'Garden Diary'));
  await expect(page.locator('#selectionBar')).toBeVisible();
  await expect(page.locator('.reading')).toHaveCount(0);
  await expect(page.locator('#addDocs')).toHaveCount(0);
  await expect(page.locator('#selectionBar [role=status] .visually-hidden')).toHaveText('1 chosen');
  await expect(tile(page, 'Garden Diary')).toHaveAttribute('aria-pressed', 'true');

  // While choosing, a tap chooses rather than opens.
  await tile(page, 'Tide').click();
  await expect(page.locator('#selectionBar [role=status] .visually-hidden')).toHaveText('2 chosen');
  await expect(page.locator('.reading')).toHaveCount(0);

  // Mark finished, with Undo.
  await page.click('#selectFinish');
  await expect(page.locator('#selectionBar')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('2 documents marked finished.');
  await expect(page.locator('.status-mark.is-finished')).toHaveCount(2);
  await page.click('#toast button');
  await expect(page.locator('.status-mark.is-finished')).toHaveCount(0);

  // Choose all, then into a new collection.
  await hold(page, tile(page, 'Tide'));
  await page.click('#selectAll');
  await expect(page.locator('#selectionBar [role=status] .visually-hidden')).toHaveText('3 chosen');
  await page.click('#selectCollect');
  await page.click('.action-row:has-text("New collection")');
  await page.fill('#promptInput', 'Sea');
  await page.click('#promptAction');
  await expect(page.locator('#toast')).toContainText('3 documents added to Sea.');

  // Back stops choosing without doing anything.
  await hold(page, tile(page, 'Tide'));
  await page.keyboard.press('Escape');
  await expect(page.locator('#selectionBar')).toHaveCount(0);
  await expect(page.locator('#addDocs')).toBeVisible();

  // Remove two, and Undo brings them back.
  await hold(page, tile(page, 'Tide'));
  await tile(page, 'Garden Diary').click();
  await page.click('#selectRemove');
  await expect(page.locator('.doc-card')).toHaveCount(1);
  await expect(page.locator('#toast')).toContainText('2 documents removed.');
  await page.click('#toast button');
  await expect(page.locator('.doc-card')).toHaveCount(3);

  // Letting go of the last one stops choosing.
  await hold(page, tile(page, 'Tide'));
  await tile(page, 'Tide').click();
  await expect(page.locator('#selectionBar')).toHaveCount(0);
});

async function select(page: Page, nth: number, from: number, to: number) {
  await page.evaluate(
    ([n, a, b]) => {
      const p = document.querySelectorAll('.reading p')[n]!;
      p.scrollIntoView({ block: 'center' });
      const r = document.createRange();
      r.setStart(p.firstChild!, a);
      r.setEnd(p.firstChild!, b);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    },
    [nth, from, to] as const,
  );
}

async function bars(page: Page) {
  if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(200, 420);
  await expect(page.locator('.reader.chrome-hidden')).toHaveCount(0);
}

test('in Contents, a held bookmark is renamed or deleted, and a held highlight changes colour', async ({ page }) => {
  await add(page, ['lantern.epub']);
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await select(page, 1, 0, 11);
  await page.click('.selection-bar [data-colour=sage]');
  await expect(page.locator('mark.hl-sage')).toHaveText('Paragraph 1');
  await bars(page);
  await page.click('#toggleBookmark');

  await page.click('#openContents');
  await page.click('#tab-highlights');
  await hold(page, page.locator('.highlight-row').first());
  // The colour it has is marked; picking another changes it on the page too.
  await expect(page.locator('.action-row[aria-current=true]')).toContainText('Sage');
  await page.click('[data-action="colour:amber"]');
  await expect(page.locator('.highlight-row .hl-bar.hl-amber')).toHaveCount(1);
  await expect(page.locator('mark.hl-amber')).toHaveText('Paragraph 1');
  // Edit opens the highlight's own editor.
  await hold(page, page.locator('.highlight-row').first());
  await page.click('[data-action=edit]');
  await expect(page.locator('#noteText')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.click('#tab-bookmarks');
  const bookmark = page.locator('#contents-panel .row').first();
  await hold(page, bookmark);
  await page.click('[data-action=rename]');
  await page.fill('#promptInput', 'Where the log starts');
  await page.click('#promptAction');
  await expect(bookmark).toContainText('Where the log starts');
  await hold(page, bookmark);
  await page.click('[data-action=delete]');
  await expect(page.locator('#contents-panel .row')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Bookmark removed.');
});

test('in Notes, a held highlight is recoloured, copied or deleted, with Undo', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await add(page, ['lantern.epub']);
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await select(page, 1, 0, 11);
  await page.click('.selection-bar [data-colour=sage]');
  await expect(page.locator('mark.hl-sage')).toHaveCount(1);
  await bars(page);
  await page.click('#closeReader');
  await page.click('#tab-notes');

  const row = page.locator('.highlight-row').first();
  await hold(page, row);
  await page.click('[data-action="colour:bright"]');
  await expect(row.locator('.hl-bar.hl-bright')).toHaveCount(1);

  await hold(page, row);
  await page.click('[data-action=copy]');
  await expect(page.locator('#toast')).toContainText('Copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Paragraph 1');

  await hold(page, row);
  await page.click('[data-action=delete]');
  await expect(page.locator('.highlight-row')).toHaveCount(0);
  await page.click('#toast button');
  await expect(page.locator('.highlight-row .hl-bar.hl-bright')).toHaveCount(1);
  // And it really came back: it's there after a reload.
  await page.reload();
  await page.click('#tab-notes');
  await expect(page.locator('.highlight-row .hl-bar.hl-bright')).toHaveCount(1);
});

test('a held tag is renamed or taken off everything, and the filter follows it', async ({ page }) => {
  await add(page, ['garden.md', 'tide.txt']);
  for (const title of ['Garden Diary', 'Tide']) {
    await page.getByRole('button', { name: `Details for ${title}` }).click();
    await page.click('#editDetails');
    await page.fill('#editTags', 'sea');
    await page.click('#saveDetails');
    await expect(page.locator('#toast')).toContainText('Details saved');
    while (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
  }
  await page.click('#arrangeLibrary');
  await page.click('.tag-chip[data-tag=sea]');
  await expect(page.locator('#libraryFilter')).toHaveValue('#sea');
  await hold(page, page.locator('.tag-chip[data-tag=sea]'));
  await page.click('[data-action=rename]');
  await expect(page.locator('dialog[open]').last()).toContainText('On all 2 documents that have it.');
  await page.fill('#promptInput', 'Ocean');
  await page.click('#promptAction');
  await expect(page.locator('.tag-chip')).toHaveText(['#ocean']);
  await expect(page.locator('#libraryFilter')).toHaveValue('#ocean');

  await hold(page, page.locator('.tag-chip[data-tag=ocean]'));
  await page.click('[data-action=delete]');
  await expect(page.locator('.tag-chip')).toHaveCount(0);
  await expect(page.locator('#libraryFilter')).toHaveValue('');
  await expect(page.locator('#toast')).toContainText('#ocean taken off 2 documents.');
  await page.click('#toast button');
  await expect(page.locator('.tag-chip')).toHaveText(['#ocean']);
});

test('Continue reading held: finish, start over or details; the add button held adds', async ({ page }) => {
  await add(page, ['lantern.epub']);
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await page.evaluate(() => document.querySelector('.reader-page, .reading')?.scrollBy?.(0, 600));
  await bars(page);
  await page.click('#closeReader');
  await expect(page.locator('#resume')).toBeVisible();

  await hold(page, page.locator('#resume'));
  await expect(page.locator('.action-row')).toHaveText(['Continue', 'Mark finished', 'Start over', 'Details']);
  await page.click('[data-action=details]');
  await expect(page.locator('#editDetails')).toBeVisible();
  await page.keyboard.press('Escape');

  await hold(page, page.locator('#resume'));
  await page.click('[data-action=finish]');
  await expect(page.locator('#resume')).toHaveCount(0);
  await expect(page.locator('.status-mark.is-finished')).toHaveCount(1);
  await page.click('#toast button');
  await expect(page.locator('#resume')).toBeVisible();

  // On a phone there's no folder to pick, so holding the add button just adds.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), hold(page, page.locator('#addDocs'))]);
  expect(chooser).toBeTruthy();
});
