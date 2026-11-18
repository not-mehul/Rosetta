<script lang="ts">
  // Filtering and arranging the library, out of the way of the books
  // (style.md §8.11, a sheet for filters): one of the three states (not
  // started, reading, finished; none chosen shows everything), covers or a
  // list, the order, a tag, and at the bottom a collection. A chosen state,
  // tag or collection is tapped again to let it go; a collection held offers
  // Rename and Delete. Every choice takes effect at once; Close keeps them.
  import { t } from '../../i18n/index.svelte';
  import { collectionActions, tagActions } from '../../lib/collections';
  import { hold } from '../../lib/hold';
  import { library } from '../../state/library.svelte';
  import type { LibraryLayout, LibraryShelf, LibrarySort } from '../../state/settings';
  import StatusMark from '../ui/StatusMark.svelte';
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
  /** A tag held: renamed or deleted everywhere, and the filter follows it. */
  async function holdTag(tag: string) {
    const now = await tagActions(tag);
    if (now !== null && filter.trim() === `#${tag}`) onfilter(now ? `#${now}` : '');
  }
  const SHOWS: Exclude<LibraryShelf, 'all'>[] = ['unread', 'reading', 'finished'];
  const LAYOUTS = $derived<[LibraryLayout, string][]>([
    ['grid', t('arrange.grid')],
    ['list', t('arrange.list')],
  ]);
</script>

<Sheet title={t('arrange.title')} {onclose}>
  <div class="field">
    <span class="t-field-label" id="arrangeShow">{t('arrange.show')}</span>
    <div class="show-row" role="radiogroup" aria-labelledby="arrangeShow">
      {#each SHOWS as id (id)}
        <button type="button" class="chip show-chip" role="radio" id="show-{id}" aria-checked={v.shelf === id} onclick={() => void settings.update({ shelf: v.shelf === id ? 'all' : id })}>
          <span class="chip-mark"><StatusMark status={id} /></span><span class="show-word">{t(`status.${id}`)}</span>
        </button>
      {/each}
    </div>
  </div>

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

  {#if tags.length}
    <div class="field">
      <span class="t-field-label" id="arrangeTags">{t('library.tags')}</span>
      <div class="chip-row" aria-labelledby="arrangeTags">
        {#each tags as tag (tag)}
          <button type="button" class="chip tag-chip" aria-pressed={filter.trim() === `#${tag}`} data-tag={tag} use:hold={() => void holdTag(tag)} onclick={() => onfilter(filter.trim() === `#${tag}` ? '' : `#${tag}`)}>#{tag}</button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Collections last: dotted until chosen, filled once chosen. -->
  <div class="field">
    <span class="t-field-label" id="arrangeCollection">{t('collections.title')}</span>
    <div class="chip-row" aria-labelledby="arrangeCollection">
      {#each library.collections as c (c.id)}
        <button
          type="button"
          class="chip collection-chip"
          aria-pressed={collection === c.id}
          aria-keyshortcuts="Shift+F10"
          data-collection={c.name}
          use:hold={() => void collectionActions(c.id)}
          onclick={() => void settings.update({ collection: collection === c.id ? '' : c.id })}>{c.name}</button>
      {/each}
      <button type="button" class="chip" id="addCollection" onclick={onnewcollection}><Icon name="plus" />{t('collections.new')}</button>
    </div>
    {#if library.collections.length || tags.length}<p class="field-hint">{t(tags.length ? 'collections.holdBothHint' : 'collections.holdHint')}</p>{/if}
  </div>
</Sheet>

<style>
  /* The three states share one row evenly, the mark beside the word. */
  .show-row {
    container: show / inline-size;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-2);
  }
  .show-chip {
    justify-content: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    text-align: center;
    white-space: normal;
  }
  .show-word {
    min-width: 0;
  }
  /* Large text: the mark over its word, the word on as many lines as it needs, never cut. */
  @container show (max-width: 21rem) {
    .show-chip {
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-2) var(--space-1);
    }
  }
  /* A collection not chosen is dotted; chosen, it fills (the chip's own pressed state). */
  .collection-chip[aria-pressed='false'] {
    border-style: dashed;
    border-color: var(--border);
    background: none;
  }
  /* The same mark as on the covers, in the chip. */
  .chip-mark {
    position: relative;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
  }
  .chip-mark :global(.status-mark) {
    top: 0;
    left: 0;
    width: 18px;
    height: 18px;
    box-shadow: none;
  }
  .chip-mark :global(.status-mark svg) {
    width: 11px;
    height: 11px;
  }
</style>
