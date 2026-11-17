// A highlight's own modal, with its actions as icons, and highlighting in
// Flow by holding a sentence.
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));

async function open(page: Page) {
  await page.goto('/');
  const [c] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await c.setFiles(fixture('lantern.epub'));
  await expect(page.locator('.reading h1')).toHaveText('The stair');
}

async function bars(page: Page) {
  if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(200, 450);
  await expect(page.locator('#openType')).toBeVisible();
}

test('a highlight opens with its actions as icons that fit, and Remove removes it', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const p = document.querySelectorAll('.reading p')[1]!;
    const r = document.createRange();
    r.setStart(p.firstChild!, 0);
    r.setEnd(p.firstChild!, 20);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.click('.selection-bar [data-colour=sage]');
  await expect(page.locator('mark.hl-sage')).toHaveCount(1);
  await page.locator('mark.hl-sage').click();
  await expect(page.locator('#noteText')).toBeVisible();

  // Remove and Share are icons with names; none of the actions overlap.
  for (const id of ['#removeMark', '#shareQuote']) {
    await expect(page.locator(id)).toHaveAttribute('aria-label', /.+/);
    await expect(page.locator(id)).toHaveText('');
  }
  const boxes = await page.locator('.mark-actions button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i]!, boxes[j]!];
      expect(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top || b.bottom <= a.top, `buttons ${i} and ${j} overlap`).toBe(true);
    }

  await page.click('#removeMark');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('mark.hl-sage')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Highlight removed');
  // Undo puts it back.
  await page.locator('.toast-action').click();
  await expect(page.locator('mark.hl-sage')).toHaveCount(1);
});

test('in Flow, holding a sentence highlights it; holding it again opens it', async ({ page }) => {
  await open(page);
  await bars(page);
  await page.click('#openType');
  await page.click('#panel-page');
  await page.click('#modeFlow');
  await page.keyboard.press('Escape');
  // On to the first sentence of the text (the heading comes first).
  await page.mouse.click(300, 500);
  await page.mouse.click(300, 500);
  await expect(page.locator('.flow-sentence .visually-hidden')).toHaveText(/The keeper kept a log/);
  const box = (await page.locator('.flow-sentence').boundingBox())!;
  const hold = async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
  };
  await hold();
  // It is highlighted, and opens for a colour or a note; the sentence stays on screen.
  await expect(page.locator('#noteText')).toBeVisible();
  await expect(page.locator('.mark-quote')).toContainText('The keeper kept a log');
  await page.click('#saveNote');
  await expect(page.locator('.flow-sentence .flow-marked').first()).toBeVisible();
  await expect(page.locator('.flow-count')).toHaveText(/^2 of /);
  // It is a highlight like any other: in Contents too.
  await hold();
  await expect(page.locator('#noteText')).toBeVisible();
  await page.fill('#noteText', 'Every ship.');
  await page.click('#saveNote');
  await expect(page.locator('.flow-sentence .has-note').first()).toBeVisible();
  // Holding didn't turn the sentence.
  await expect(page.locator('.flow-count')).toHaveText(/^2 of /);
  // Remove from Flow too.
  await hold();
  await page.click('#removeMark');
  await expect(page.locator('.flow-sentence .flow-marked')).toHaveCount(0);
});
