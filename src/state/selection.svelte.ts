// Choosing several books at once (style.md §14: long press opens selection
// mode in a list that supports bulk edit). Holding a book starts it; while
// it's on, a tap chooses or lets go instead of opening, and letting go of the
// last book ends it.
import { t } from '../i18n/index.svelte';
import type { StoredDoc } from './db';
import { library } from './library.svelte';
import { ui } from './ui.svelte';

type Patch = Partial<Omit<StoredDoc, 'id'>>;

class SelectionState {
  ids = $state.raw<ReadonlySet<string>>(new Set());

  get active(): boolean {
    return this.ids.size > 0;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  toggle(id: string): void {
    // A new set each time: ids is replaced whole, never changed in place.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(this.ids);
    if (!next.delete(id)) next.add(id);
    this.ids = next;
  }

  /** Every book shown, or none if all of them are already chosen. */
  all(ids: readonly string[]): void {
    this.ids = ids.every((id) => this.ids.has(id)) ? new Set() : new Set(ids);
  }

  clear(): void {
    if (this.ids.size) this.ids = new Set();
  }

  private chosen(): StoredDoc[] {
    return library.items.filter((d) => this.ids.has(d.id));
  }

  /** Changes every chosen book, with an Undo that puts each one back as it was. */
  private async change(patch: (d: StoredDoc) => Patch | null, message: (count: number) => string): Promise<void> {
    const before: [string, Patch][] = [];
    for (const d of this.chosen()) {
      const p = patch(d);
      if (!p) continue;
      before.push([d.id, Object.fromEntries(Object.keys(p).map((k) => [k, d[k as keyof StoredDoc]])) as Patch]);
      await library.update(d.id, p);
    }
    this.clear();
    if (!before.length) return;
    ui.undoable(message(before.length), () => {
      void (async () => {
        for (const [id, p] of before) await library.update(id, p);
      })();
    });
  }

  finish(): Promise<void> {
    const now = Date.now();
    return this.change(
      (d) => (d.finishedAt ? null : { finishedAt: now }),
      (count) => t('select.finished', { count }),
    );
  }

  /** Back to the shelf as if never opened: no place, no progress, not finished. */
  reset(): Promise<void> {
    return this.change(
      (d) => (d.openedAt === null && d.finishedAt === null && !d.location ? null : { location: null, progress: 0, finishedAt: null, openedAt: null }),
      (count) => t('select.reset', { count }),
    );
  }

  async collect(): Promise<void> {
    const NEW = '\u0000new';
    const choice = await ui.actions({
      title: t('select.toCollection'),
      actions: [
        ...library.collections.map((c) => ({ id: c.id, label: c.name, icon: 'folder' as const })),
        { id: NEW, label: t('collections.new'), icon: 'folder-plus' },
      ],
    });
    if (!choice) return;
    let target = library.collections.find((c) => c.id === choice);
    if (choice === NEW) {
      const name = await ui.prompt({ title: t('collections.new'), message: t('collections.newHint'), label: t('collections.name'), action: t('collections.create') });
      if (!name?.trim()) return;
      target = await library.createCollection(name);
    }
    if (!target) return;
    const id = target.id;
    const name = target.name;
    await this.change(
      (d) => (d.collections.includes(id) ? null : { collections: [...d.collections, id] }),
      (count) => t('select.collected', { count, name }),
    );
  }

  async remove(): Promise<void> {
    const docs = this.chosen();
    const undos: (() => Promise<void>)[] = [];
    for (const d of docs) undos.push(await library.remove(d.id));
    this.clear();
    if (!undos.length) return;
    ui.undoable(t('select.removed', { count: undos.length }), () => {
      void (async () => {
        for (const undo of undos) await undo();
      })();
    });
  }
}

export const selection = new SelectionState();
