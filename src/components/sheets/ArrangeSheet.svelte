<script lang="ts">
  // Arranging the library, out of the way of the books (style.md §8.11, a
  // sheet for filters): which collection, which tag, the order, and covers
  // or a list. Every choice takes effect at once; Close keeps them.
  import { t } from '../../i18n/index.svelte';
  import { library } from '../../state/library.svelte';
  import type { LibraryLayout, LibrarySort } from '../../state/settings';
  import { settings } from '../../state/settings.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';

  interface Props {
    /** The collection shown, '' for everything. */
    collection: string;
    /** The library filter, for the tag chips ("#poetry"). */
    filter: string;
    onfilter: (filter: string) => void;
    onnewcollection: () => void;
    onclose: () => void;
  }

  let { collection, filter, onfilter, onnewcollection, onclose }: Props = $props();
  const v = $derived(settings.value);
  const tags = $derived(library.tags.slice(0, 24));
  const SORTS = $derived<[LibrarySort, string][]>([
    ['recent', t('library.sortRecent')],
    ['title', t('library.sortTitle')],
    ['author', t('library.sortAuthor')],
    ['series', t('library.sortSeries')],
  ]);
  const LAYOUTS = $derived<[LibraryLayout, string][]>([
    ['grid', t('arrange.grid')],
    ['list', t('arrange.list')],
  ]);
</script>

<Sheet title={t('arrange.title')} {onclose}>
  <div class="field">
    <span class="t-field-label" id="arrangeLayout">{t('arrange.layout')}</span>
    <div class="segmented" role="radiogroup" aria-labelledby="arrangeLayout">
      {#each LAYOUTS as [id, label] (id)}
        <button type="button" role="radio" id="layout-{id}" aria-checked={v.layout === id} onclick={() => void settings.update({ layout: id })}>{label}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="t-field-label" id="arrangeSort">{t('library.sort')}</span>
    <div class="segmented" role="radiogroup" aria-labelledby="arrangeSort">
      {#each SORTS as [id, label] (id)}
        <button type="button" role="radio" id="sort-{id}" aria-checked={v.sort === id} onclick={() => void settings.update({ sort: id })}>{label}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="t-field-label" id="arrangeCollection">{t('collections.title')}</span>
    <div class="chip-row" role="radiogroup" aria-labelledby="arrangeCollection">
      <button type="button" class="chip" role="radio" aria-checked={!collection} onclick={() => void settings.update({ collection: '' })}>{t('collections.everything')}</button>
      {#each library.collections as c (c.id)}
        <button type="button" class="chip" role="radio" aria-checked={collection === c.id} data-collection={c.name} onclick={() => void settings.update({ collection: c.id })}>{c.name}</button>
      {/each}
      <button type="button" class="chip" id="addCollection" onclick={onnewcollection}><Icon name="plus" />{t('collections.new')}</button>
    </div>
  </div>

  {#if tags.length}
    <div class="field">
      <span class="t-field-label" id="arrangeTags">{t('library.tags')}</span>
      <div class="chip-row" aria-labelledby="arrangeTags">
        {#each tags as tag (tag)}
          <button type="button" class="chip" aria-pressed={filter.trim() === `#${tag}`} onclick={() => onfilter(filter.trim() === `#${tag}` ? '' : `#${tag}`)}>#{tag}</button>
        {/each}
      </div>
    </div>
  {/if}
</Sheet>
