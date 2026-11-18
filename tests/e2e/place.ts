// Waiting for a reading place to be saved, by reading IndexedDB rather than
// sleeping: the reader writes the place a moment after the last turn, and on
// a busy machine that moment can stretch.
import { expect, type Page } from '@playwright/test';

/** The places the library's books have stored, read straight from IndexedDB. */
export function storedPlace(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('rosetta');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('docs').objectStore('docs').getAll();
          all.onsuccess = () => {
            resolve(JSON.stringify(all.result.map((d: { location: unknown }) => d.location)));
            open.result.close();
          };
        };
      }),
  );
}

/** Waits until the place has been written and has stopped changing (it's saved a moment after the last turn). */
export async function placeSettled(page: Page, from: string) {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = await storedPlace(page);
        const settled = now !== from && now === last;
        last = now;
        return settled;
      },
      { intervals: [1000], timeout: 15_000 },
    )
    .toBe(true);
}
