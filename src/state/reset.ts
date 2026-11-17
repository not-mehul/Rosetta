// Clearing everything: the library and its files, highlights, notes,
// bookmarks, reading time, collections and settings, and the folders chosen
// for sync. Backups already saved somewhere else stay where they are. The app
// starts again as on its first day.

import { forgetFolder } from '../platform/folders';
import { cancelReminders } from '../platform/reminders';
import { db } from './db';

export async function clearEverything(): Promise<void> {
  await cancelReminders();
  for (const key of ['sync', 'backup', 'import'] as const) await forgetFolder(key).catch(() => undefined);
  db.close();
  await db.delete();
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('rosetta') || key.includes(':rosetta')) localStorage.removeItem(key);
  } catch {
    // Private mode: nothing kept there.
  }
  location.reload();
}
