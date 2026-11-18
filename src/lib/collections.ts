// Renaming and deleting a collection, from the bar over a chosen collection
// and from a long press on its chip in the filter sheet.
import { t } from '../i18n/index.svelte';
import { library } from '../state/library.svelte';
import { settings } from '../state/settings.svelte';
import { ui } from '../state/ui.svelte';

export async function renameCollection(id: string): Promise<void> {
  const c = library.collections.find((x) => x.id === id);
  if (!c) return;
  const name = await ui.prompt({ title: t('collections.rename'), message: '', label: t('collections.name'), action: t('action.save'), value: c.name });
  if (name?.trim()) await library.renameCollection(c.id, name);
}

export async function deleteCollection(id: string): Promise<void> {
  const c = library.collections.find((x) => x.id === id);
  if (!c) return;
  const ok = await ui.confirm({ title: t('collections.deleteTitle', { name: c.name }), message: t('collections.deleteMessage'), action: t('collections.delete'), danger: true });
  if (!ok) return;
  if (settings.value.collection === c.id) await settings.update({ collection: '' });
  await library.deleteCollection(c.id);
}

/** A long press on a collection: rename it or delete it. */
export async function collectionActions(id: string): Promise<void> {
  const c = library.collections.find((x) => x.id === id);
  if (!c) return;
  const choice = await ui.actions({
    title: c.name,
    actions: [
      { id: 'rename', label: t('collections.rename'), icon: 'pencil' },
      { id: 'delete', label: t('action.delete'), icon: 'trash-2', danger: true },
    ],
  });
  if (choice === 'rename') await renameCollection(c.id);
  else if (choice === 'delete') await deleteCollection(c.id);
}
