<script lang="ts">
  // A document's details, as the reader wants them: title, author, series,
  // tags, collections and cover. Imported titles are often wrong.
  import { untrack } from 'svelte';
  import { t } from '../../i18n/index.svelte';
  import { coverFrom, pickFiles } from '../../lib/pick';
  import { library, parseTags } from '../../state/library.svelte';
  import { ui } from '../../state/ui.svelte';
  import BlobImg from '../ui/BlobImg.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { id, onclose }: { id: string; onclose: () => void } = $props();
  // The form starts from the document as it is when the sheet opens.
  const doc = untrack(() => library.get(id));
  let title = $state(doc?.title ?? '');
  let author = $state(doc?.author ?? '');
  let series = $state(doc?.series ?? '');
  let seriesIndex = $state(doc?.seriesIndex === null || doc?.seriesIndex === undefined ? '' : String(doc.seriesIndex));
  let tags = $state((doc?.tags ?? []).join(', '));
  let collections = $state<string[]>([...(doc?.collections ?? [])]);
  let cover = $state.raw<Uint8Array | null>(doc?.cover ?? null);

  async function pickCover() {
    const [file] = await pickFiles('image/*', false);
    if (!file) return;
    const bytes = await coverFrom(file);
    if (bytes) cover = bytes;
    else ui.notify(t('edit.coverFailed'), 'error');
  }

  async function newCollection() {
    const name = await ui.prompt({ title: t('collections.new'), message: '', label: t('collections.name'), action: t('collections.create') });
    if (!name?.trim()) return;
    const c = await library.createCollection(name);
    if (!collections.includes(c.id)) collections = [...collections, c.id];
  }

  async function save() {
    if (!doc) return;
    const index = Number.parseFloat(seriesIndex.replace(',', '.'));
    await library.update(id, {
      title: title.trim() || doc.title,
      author: author.trim(),
      series: series.trim(),
      seriesIndex: series.trim() && Number.isFinite(index) ? index : null,
      tags: parseTags(tags),
      collections,
      cover,
    });
    ui.notify(t('edit.saved'), 'success');
    onclose();
  }
</script>

{#if doc}
  <Sheet title={t('edit.title')} {onclose}>
    <form
      class="form-stack"
      id="editForm"
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div class="edit-cover">
        <div class="details-cover" aria-hidden="true">
          {#if cover}<BlobImg bytes={cover} alt="" />{:else}<Icon name="book-open" />{/if}
        </div>
        <div class="btn-row btn-row-start">
          <button type="button" class="btn btn-secondary" id="pickCover" onclick={() => void pickCover()}><Icon name="image" />{t('edit.pickCover')}</button>
          {#if cover}<button type="button" class="btn btn-muted" onclick={() => (cover = null)}>{t('edit.removeCover')}</button>{/if}
        </div>
      </div>
      <label class="field">
        <span class="t-field-label">{t('edit.docTitle')}</span>
        <input class="input" id="editTitle" bind:value={title} enterkeyhint="next" autocomplete="off" />
      </label>
      <label class="field">
        <span class="t-field-label">{t('edit.author')}</span>
        <input class="input" id="editAuthor" bind:value={author} enterkeyhint="next" autocomplete="off" />
      </label>
      <div class="field-pair">
        <label class="field">
          <span class="t-field-label">{t('edit.series')}</span>
          <input class="input" id="editSeries" bind:value={series} enterkeyhint="next" autocomplete="off" />
        </label>
        <label class="field field-narrow">
          <span class="t-field-label">{t('edit.volume')}</span>
          <input class="input" id="editVolume" bind:value={seriesIndex} inputmode="decimal" enterkeyhint="next" autocomplete="off" />
        </label>
      </div>
      <label class="field">
        <span class="t-field-label">{t('edit.tags')}</span>
        <input class="input" id="editTags" bind:value={tags} placeholder={t('edit.tagsPlaceholder')} enterkeyhint="done" autocomplete="off" />
        <span class="field-hint">{t('edit.tagsHint')}</span>
      </label>
      <div class="field">
        <span class="t-field-label">{t('collections.title')}</span>
        <div class="chip-row">
          {#each library.collections as c (c.id)}
            <button
              type="button"
              class="chip"
              aria-pressed={collections.includes(c.id)}
              onclick={() => (collections = collections.includes(c.id) ? collections.filter((x) => x !== c.id) : [...collections, c.id])}>{c.name}</button
            >
          {/each}
          <button type="button" class="chip" id="newCollection" onclick={() => void newCollection()}><Icon name="plus" />{t('collections.new')}</button>
        </div>
      </div>
    </form>
    {#snippet footer()}
      <div class="btn-row">
        <button type="button" class="btn btn-muted" onclick={onclose}>{t('action.cancel')}</button>
        <button type="submit" form="editForm" class="btn btn-primary" id="saveDetails">{t('action.save')}</button>
      </div>
    {/snippet}
  </Sheet>
{/if}
