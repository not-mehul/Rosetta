// A note on the whole book, a line from your notes on the library, last
// week's recap, the Notes tab, and a goal for books this year.
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));

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

/** Puts reading sessions straight into the database, as if read on those days. */
async function readOn(page: Page, rows: { day: string; ms: number }[]) {
  await page.evaluate(async (rows) => {
    const docId = await new Promise<string>((ok, fail) => {
      const open = indexedDB.open('rosetta');
      open.onerror = () => fail(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction(['docs', 'sessions'], 'readwrite');
        const all = tx.objectStore('docs').getAll();
        all.onsuccess = () => {
          const id = (all.result[0] as { id: string }).id;
          for (const r of rows) tx.objectStore('sessions').put({ id: `${r.day}|${id}`, day: r.day, docId: id, ms: r.ms, chars: 0 });
          tx.oncomplete = () => {
            open.result.close();
            ok(id);
          };
        };
      };
    });
    return docId;
  }, rows);
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('a book note, a line from your notes, the weekly recap and the yearly goal', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fixture('lantern.epub'));
  await expect(page.locator('.reading h1').first()).toBeVisible();
  // A highlight to have a line from.
  await select(page, 1, 0, 30);
  await page.click('.selection-bar [data-colour=sage]');
  await expect(page.locator('mark.hl-sage')).toHaveCount(1);
  await page.keyboard.press('Escape');

  // Finished, so nothing is in progress: the library shows a line from the notes.
  await page.locator('.doc-more').first().click();
  await page.click('#toggleFinished');
  // And a note on the whole book, kept as it's typed.
  await page.fill('#bookNote', 'Read it on the ferry.');
  await page.waitForTimeout(900);
  await page.keyboard.press('Escape');
  await expect(page.locator('#lineOfDay')).toContainText('Paragraph 1 about stairs. The');
  await page.locator('.doc-more').first().click();
  await expect(page.locator('#bookNote')).toHaveValue('Read it on the ferry.');
  await page.keyboard.press('Escape');

  // Last week's reading, once, until put away.
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7, 12);
  await readOn(page, [
    { day: dayKey(monday), ms: 30 * 60_000 },
    { day: dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2, 12)), ms: 15 * 60_000 },
  ]);
  await page.reload();
  await expect(page.locator('#weekRecap')).toContainText('45 min');
  await expect(page.locator('#weekRecap')).toContainText('over 2 days');
  await expect(page.locator('#weekRecap')).toContainText('The Lantern Keeper');
  await page.click('#recapDone');
  await expect(page.locator('#weekRecap')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.doc-card')).toHaveCount(1);
  await expect(page.locator('#weekRecap')).toHaveCount(0);

  // The Notes tab lists it, and exports nothing.
  await page.click('#tab-notes');
  await expect(page.locator('.notes-count')).toContainText('1 highlight');
  await expect(page.locator('#exportNotes')).toHaveCount(0);

  // A goal of books this year, set in Settings, with the one finished in Stats.
  await page.click('#openSettings');
  await page.click('#settings-general');
  await page.click('[data-year-goal="12"]');
  await page.keyboard.press('Escape');
  await page.click('#tab-stats');
  await expect(page.locator('#yearGoalStatus')).toContainText('1 of 12 so far');
});
