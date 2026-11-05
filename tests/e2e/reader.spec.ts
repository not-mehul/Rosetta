import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

async function add(page: Page, files: string[], button = '#addFirst') {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(button)]);
  await chooser.setFiles(files.map(fixture));
}

/** Selects characters [from, to) of the nth paragraph on the page. */
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

/** Taps the page if the reader's bars are hidden. */
async function showBars(page: Page) {
  if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(200, 420);
  await expect(page.locator('.reader.chrome-hidden')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('adds every format and reads each one', async ({ page }) => {
  await expect(page.locator('.empty-state')).toContainText('No documents yet');
  await add(page, ['lantern.epub', 'harbour.pdf', 'field-notes.docx', 'garden.md', 'tide.txt']);
  await expect(page.locator('#toast')).toContainText('Added 5 documents');
  await expect(page.locator('.doc-card')).toHaveCount(5);

  // Titles and authors come from the files' own metadata.
  for (const [title, author] of [
    ['The Lantern Keeper', 'Ada Marlow'],
    ['Field Notes', 'Iris Vale'],
    ['Garden Diary', 'Tom Reed'],
  ]) {
    await expect(page.locator('.doc-card', { hasText: title })).toContainText(author!);
  }

  await page.getByRole('button', { name: /^The Lantern Keeper/ }).click();
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  // Publisher scripts and styles never reach the page.
  await expect(page.locator('.reading script, .reading style')).toHaveCount(0);
  await page.click('#closeReader');

  await page.getByRole('button', { name: /^Harbour Charts/ }).click();
  await expect(page.locator('.pdf-page')).toHaveCount(3);
  await expect(page.locator('.textLayer').first()).toContainText('lighthouses');
  await page.click('#closeReader');

  await page.getByRole('button', { name: /^Field Notes/ }).click();
  await expect(page.locator('.reading h1')).toHaveText('Field notes');
  await expect(page.locator('.reading strong')).toHaveText('Rain.');
  await page.click('#closeReader');

  await page.getByRole('button', { name: /^Garden Diary/ }).click();
  await expect(page.locator('.reading li')).toHaveCount(2);
  await page.click('#closeReader');

  await page.getByRole('button', { name: /^Tide/ }).click();
  await expect(page.locator('.reading h2').first()).toHaveText('CHAPTER ONE');
});

test('adding the same file twice keeps one copy', async ({ page }) => {
  // A single file opens as soon as it's added; adding it again opens the same copy.
  await add(page, ['garden.md']);
  await page.click('#closeReader');
  await add(page, ['garden.md'], '#addDocs');
  await expect(page.locator('.reading h1').first()).toHaveText('Spring');
  await page.click('#closeReader');
  await expect(page.locator('.doc-card')).toHaveCount(1);
});

test('contents, chapters, search, highlights, notes and bookmarks', async ({ page }) => {
  await add(page, ['lantern.epub']);
  await expect(page.locator('.reading h1')).toHaveText('The stair');

  // Contents: a nested entry goes to its anchor in the second chapter.
  await page.click('#openContents');
  await page.getByRole('button', { name: 'A green cloth' }).click();
  await expect(page.locator('.reading h1')).toHaveText('The ledger');
  await expect(page.locator('.reader-bar')).toContainText('The ledger');

  // Next chapter, from the foot of the chapter.
  await page.click('#nextSection');
  await expect(page.locator('.reading h1')).toHaveText('The storm');

  // Search the whole book; a result goes there and flashes the words.
  await page.click('#openSearch');
  await page.fill('#searchInput', 'albatross');
  await expect(page.locator('.sheet [role=status]')).toHaveText('1 match');
  await page.locator('#searchResults button').click();
  await expect(page.locator('mark.hl-flash')).toHaveText('albatross');

  // Highlight with a note.
  await select(page, 0, 0, 11);
  await page.click('#noteSelection');
  await page.fill('#noteText', 'Counting starts here.');
  await page.click('#saveNote');
  await expect(page.locator('mark.hl.has-note')).toHaveText('Paragraph 1');

  // A plain highlight in sage.
  await select(page, 1, 0, 11);
  await page.click('.selection-bar [data-colour=sage]');
  await expect(page.locator('mark.hl-sage')).toHaveText('Paragraph 2');

  // Bookmark the place, then see everything in the lists.
  await showBars(page);
  await page.click('#toggleBookmark');
  await expect(page.locator('#toggleBookmark')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#openContents');
  await page.click('#tab-highlights');
  await expect(page.locator('.highlight-row')).toHaveCount(2);
  await expect(page.locator('.highlight-row').first()).toContainText('Counting starts here.');
  await page.click('#tab-bookmarks');
  await expect(page.locator('#contents-panel')).toContainText('The storm');
});

test('resumes where reading stopped and keeps the place through type changes', async ({ page }) => {
  await add(page, ['lantern.epub']);
  await page.click('#openContents');
  await page.getByRole('button', { name: 'The ledger' }).click();
  await page.evaluate(() => document.querySelectorAll('.reading p')[10]!.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1200);
  const before = await page.textContent('#progressLabel');

  // Bigger type: the same paragraph stays at the top.
  await showBars(page);
  await page.click('#openType');
  for (let i = 0; i < 4; i++) await page.click('#larger');
  await expect(page.locator('#sizeValue')).toHaveText('22');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const top = await page.evaluate(() => {
    const p = [...document.querySelectorAll('.reading p')].find((el) => el.getBoundingClientRect().bottom > 90)!;
    return p.textContent!.slice(0, 13);
  });
  expect(top).toBe('Paragraph 11 ');

  // Reload: back in the same chapter at the same place.
  await page.reload();
  await expect(page.locator('.reading h1')).toHaveText('The ledger');
  await expect(page.locator('#progressLabel')).toHaveText(before!);
});

test('the library: shelves, details, finishing and removing with undo', async ({ page }) => {
  await add(page, ['garden.md']);
  await page.click('#closeReader');
  await add(page, ['tide.txt', 'field-notes.docx'], '#addDocs');
  await expect(page.locator('#toast')).toContainText('Added 2 documents');
  await expect(page.locator('#resume')).toContainText('Garden Diary');

  await page.click('#shelf-reading');
  await expect(page.locator('.doc-card')).toHaveCount(1);
  await page.click('#shelf-all');

  await page.getByRole('button', { name: 'Details for Garden Diary' }).click();
  await page.click('#toggleFinished');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.click('#shelf-finished');
  await expect(page.locator('.doc-card')).toContainText('Finished');

  await page.getByRole('button', { name: 'Details for Garden Diary' }).click();
  await page.click('#removeDoc');
  await expect(page.locator('#toast')).toContainText('Removed Garden Diary');
  await page.locator('.toast-action').click();
  await expect(page.locator('.doc-card', { hasText: 'Garden Diary' })).toHaveCount(1);
});

test('the guide opens from the empty library, and the theme can be set', async ({ page }) => {
  await page.click('#readGuide');
  await expect(page.locator('.reading h1')).toHaveText('A short guide to Rosetta');
  await page.click('#closeReader');
  await page.click('#openSettings');
  await page.getByRole('radio', { name: 'Dawn' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'Dusk' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
