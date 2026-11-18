// What a long press on a highlight or a bookmark offers, in Notes and in
// Contents: a highlight's colour, copying it, sharing it as a card and
// deleting it; a bookmark's name and deleting it. With the book open the
// reader makes the change, so the page shows it at once; from Notes, with no
// book open, it goes straight to the database.
import { COLOURS } from '../components/reader/colours';
import { t } from '../i18n/index.svelte';
import type { Mark } from '../state/db';
import { library } from '../state/library.svelte';
import { eraseMarks, storeMark } from '../state/marks';
import { reader } from '../state/reader.svelte';
import { ui, type Action } from '../state/ui.svelte';
import { shareQuote } from './quote';

/** What changed, so a list that holds its own copy of the marks can follow. */
export type MarkChange = { saved: Mark } | { removed: Mark };

const open = (m: Mark) => reader.doc?.id === m.docId;

async function change(m: Mark, patch: Partial<Pick<Mark, 'colour' | 'note'>>): Promise<Mark> {
  if (open(m)) {
    await reader.updateMark(m.id, patch);
    return reader.marks.find((x) => x.id === m.id) ?? { ...m, ...patch };
  }
  return storeMark({ ...m, ...patch });
}

async function remove(m: Mark, onchange?: (c: MarkChange) => void): Promise<void> {
  if (open(m)) {
    await reader.removeMark(m.id);
  } else {
    await eraseMarks([m.id]);
    ui.undoable(m.kind === 'bookmark' ? t('reader.bookmarkRemoved') : t('reader.highlightRemoved'), () => {
      void storeMark(m).then((saved) => onchange?.({ saved }));
    });
  }
  onchange?.({ removed: m });
}

export async function highlightActions(m: Mark, { edit, onchange }: { edit?: () => void; onchange?: (c: MarkChange) => void } = {}): Promise<void> {
  const doc = library.get(m.docId);
  const actions: Action[] = [
    ...COLOURS.map((c) => ({ id: `colour:${c.id}`, label: t(`colour.${c.id}`), swatch: c.id, current: m.colour === c.id })),
    ...(edit ? [{ id: 'edit', label: t('contents.editHighlight'), icon: 'pencil' as const }] : []),
    { id: 'copy', label: t('selection.copy'), icon: 'copy' },
    ...(doc ? [{ id: 'share', label: t('mark.share'), icon: 'share-2' as const }] : []),
    { id: 'delete', label: t('action.delete'), icon: 'trash-2', danger: true },
  ];
  const choice = await ui.actions({ title: m.text.length > 60 ? `${m.text.slice(0, 57).trimEnd()}…` : m.text, actions });
  if (!choice) return;
  if (choice.startsWith('colour:')) {
    const colour = choice.slice(7) as Mark['colour'];
    if (colour !== m.colour) {
      const saved = await change(m, { colour });
      onchange?.({ saved });
    }
  } else if (choice === 'edit') edit?.();
  else if (choice === 'copy') {
    try {
      await navigator.clipboard.writeText(m.text);
      ui.notify(t('selection.copied'), 'success');
    } catch {
      ui.notify(t('selection.copyFailed'), 'error');
    }
  } else if (choice === 'share' && doc) await shareQuote(m, doc);
  else if (choice === 'delete') await remove(m, onchange);
}

/** A bookmark's name: the one given it, or where it is. */
export const bookmarkName = (m: Mark) => m.note.trim() || m.where || t('notes.bookmark');

export async function bookmarkActions(m: Mark, { onchange }: { onchange?: (c: MarkChange) => void } = {}): Promise<void> {
  const choice = await ui.actions({
    title: bookmarkName(m),
    actions: [
      { id: 'rename', label: t('collections.rename'), icon: 'pencil' },
      { id: 'delete', label: t('action.delete'), icon: 'trash-2', danger: true },
    ],
  });
  if (choice === 'rename') {
    const name = await ui.prompt({ title: t('bookmark.rename'), message: '', label: t('bookmark.name'), action: t('action.save'), value: bookmarkName(m) });
    if (name === null) return;
    // Cleared, or left as where it is: it goes back to being named by its place.
    const note = name.trim() === m.where ? '' : name.trim();
    if (note !== m.note) {
      const saved = await change(m, { note });
      onchange?.({ saved });
    }
  } else if (choice === 'delete') await remove(m, onchange);
}
