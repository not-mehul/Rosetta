// The whole-library archive on a new device, and what counts as a change for sync.
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

async function add(page: Page, files: string[]) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(files.map(fixture));
}

/** A document's stored row, read straight from IndexedDB. */
function stored(page: Page, title: string) {
  return page.evaluate(
    (t) =>
      new Promise<{ updatedAt: number; openedAt: number | null }>((resolve, reject) => {
        const open = indexedDB.open('rosetta');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('docs').objectStore('docs').getAll();
          all.onsuccess = () => {
            resolve(all.result.find((d: { title: string }) => d.title === t));
            open.result.close();
          };
        };
      }),
    title,
  );
}

test('restoring the archive brings back the finished shelf and tags', async ({ page, browser }) => {
  await page.goto('/');
  await add(page, ['garden.md', 'tide.txt']);
  await page.getByRole('button', { name: 'Details for Garden Diary' }).click();
  await page.click('#toggleFinished');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.click('#openSettings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#archive')]);
  const path = test.info().outputPath('library.zip');
  await download.saveAs(path);

  const fresh = await browser.newPage();
  await fresh.goto('/');
  await fresh.click('#openSettings');
  const [chooser] = await Promise.all([fresh.waitForEvent('filechooser'), fresh.click('#restore')]);
  await chooser.setFiles(path);
  await expect(fresh.locator('#toast')).toContainText('on 2 documents; added 2 files');
  await fresh.keyboard.press('Escape');
  await expect(fresh.locator('.doc-card')).toHaveCount(2);
  await fresh.click('#shelf-finished');
  await expect(fresh.locator('.doc-card')).toHaveCount(1);
  await expect(fresh.locator('.doc-card')).toContainText('Garden Diary');
});

test('opening and leaving a document without reading isn’t a change for sync', async ({ page }) => {
  await page.goto('/');
  await add(page, ['garden.md', 'tide.txt']);
  const before = await stored(page, 'Garden Diary');
  await page.waitForTimeout(50);
  await page.getByRole('button', { name: /^Garden Diary/ }).click();
  await expect(page.locator('.reading h1').first()).toBeVisible();
  await page.waitForTimeout(1200);
  await page.click('#closeReader');
  await page.waitForTimeout(500);
  const after = await stored(page, 'Garden Diary');
  expect(after.openedAt).not.toBeNull();
  expect(after.updatedAt).toBe(before.updatedAt);
});
