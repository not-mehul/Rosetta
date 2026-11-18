// Highlights and bookmarks in the database, with the tombstones that tell
// sync a mark was deleted. The reader keeps its open book's marks in step;
// Notes, with no book open, changes them here directly.
import { db, type Mark } from './db';

export async function storeMark(mark: Mark): Promise<Mark> {
  const saved = { ...mark, updatedAt: Date.now() };
  await db.transaction('rw', db.marks, db.tombstones, async () => {
    await db.marks.put(saved);
    await db.tombstones.delete(saved.id);
  });
  return saved;
}

export async function eraseMarks(ids: string[]): Promise<void> {
  const at = Date.now();
  await db.transaction('rw', db.marks, db.tombstones, async () => {
    await db.marks.bulkDelete(ids);
    await db.tombstones.bulkPut(ids.map((id) => ({ id, deletedAt: at })));
  });
}
