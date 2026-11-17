// Reading to the end finishes a document, in every mode, and "not finished" sticks.
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
const LONG = Buffer.from(
  `# Long tide\n\n${Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1}. ${'The tide came in over the flats and the gulls went quiet. '.repeat(5)}`).join('\n\n')}\n\nThe last line of the book.\n`,
);

async function addLong(page: Page) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles({ name: 'long-tide.md', mimeType: 'text/markdown', buffer: LONG });
  await expect(page.locator('.reading h1')).toHaveText('Long tide');
}

async function toBottom(page: Page) {
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(250);
  }
}

const finished = (page: Page) => expect(page.locator('#toast')).toContainText('Finished', { timeout: 4000 });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('scrolling to the end finishes a document', async ({ page }) => {
  await addLong(page);
  await toBottom(page);
  await finished(page);
  await expect(page.locator('#progressLabel')).toHaveText('100%');
});

test('turning to the last page finishes a document', async ({ page }) => {
  await addLong(page);
  await page.click('#openType');
  await page.click('#panel-page');
  await page.click('#modePaged');
  await page.keyboard.press('Escape');
  let last = '';
  for (let i = 0; i < 300; i++) {
    await page.keyboard.press('ArrowRight');
    // A turn in motion takes no new turn.
    await page.waitForTimeout(60);
    if (i % 10 === 9) {
      const now = (await page.locator('#progressLabel').textContent()) ?? '';
      if (now === last) break;
      last = now;
    }
  }
  await finished(page);
  await expect(page.locator('#progressLabel')).toHaveText('100%');
});

test('scrolling to the bottom of a PDF’s last page finishes it', async ({ page }) => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fixture('harbour.pdf'));
  await expect(page.locator('.pdf-page')).toHaveCount(3);
  await toBottom(page);
  await finished(page);
});

test('a note that fits on one screen is not finished by opening it', async ({ page }) => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fixture('garden.md'));
  await expect(page.locator('.reading h1').first()).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('#toast', { hasText: 'Finished' })).toHaveCount(0);
  // It says it's all on screen rather than 0%, and can be finished from its end.
  await expect(page.locator('#progressLabel')).toHaveText('All on screen');
  await page.click('#finishHere');
  await expect(page.locator('#toast', { hasText: 'Finished' })).toBeVisible();
  await expect(page.locator('#finishHere')).toHaveCount(0);
});

test('Undo on "Finished" sticks until the end is reached again', async ({ page }) => {
  await addLong(page);
  await toBottom(page);
  await finished(page);
  await page.locator('.toast-action').click();
  // A nudge up and back down at the end isn't reading to it again.
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(500);
  await toBottom(page);
  await page.waitForTimeout(1200);
  await expect(page.locator('#toast', { hasText: 'Finished' })).toHaveCount(0);
  // Straight back to the library: still not finished.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await expect(page.locator('#toast', { hasText: 'Finished' })).toHaveCount(0);
  await page.click('#arrangeLibrary');
  await page.click('#show-finished');
  await page.keyboard.press('Escape');
  await expect(page.locator('.doc-card')).toHaveCount(0);

  // Back in at the end: still not finished. Back a long way, then to the end again: finished.
  // Tapping the chosen state again lets it go: everything shows.
  await page.click('#arrangeLibrary');
  await page.click('#show-finished');
  await expect(page.locator('#show-finished')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await page.locator('#resume').click();
  await page.waitForTimeout(800);
  await expect(page.locator('#toast', { hasText: 'Finished' })).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * 0.5));
  await page.waitForTimeout(1200);
  await toBottom(page);
  await finished(page);
});
