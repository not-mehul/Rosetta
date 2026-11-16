<script lang="ts">
  // The Library section: what you are reading, everything, and what you've
  // finished, on every collection or one; search by title, author, series or #tag.
  import { ACCEPT, isReadableName } from '../formats/sniff';
  import { t } from '../i18n/index.svelte';
  import { canPickFolder, pickFiles, pickFolder } from '../lib/pick';
  import { addFiles } from '../state/intake';
  import { isFinished, isReading, library, shelve, upNext } from '../state/library.svelte';
  import { stats } from '../state/stats.svelte';
  import { duration } from '../lib/format';
  import { reader } from '../state/reader.svelte';
  import { settings } from '../state/settings.svelte';
  import type { LibraryShelf } from '../state/settings';
  import { ui } from '../state/ui.svelte';
  import { addGuide } from '../lib/guide';
  import DocCard from './DocCard.svelte';
  import DocTile from './DocTile.svelte';
  import ArrangeSheet from './sheets/ArrangeSheet.svelte';
  import Cover from './ui/Cover.svelte';
  import EmptyState from './ui/EmptyState.svelte';
  import Icon from './ui/Icon.svelte';
  import { TabRail, WavyProgress } from 'dusk-dawn';
  import { tick } from 'svelte';
  import { hatch } from '../lib/delight';

  let filter = $state('');
  const v = $derived(settings.value);
  const collection = $derived(library.collections.some((c) => c.id === v.collection) ? v.collection : '');
  const inCollection = $derived(collection ? library.items.filter((d) => d.collections.includes(collection)) : library.items);
  const reading = $derived(inCollection.filter(isReading));
  const finished = $derived(inCollection.filter(isFinished));
  const shelves = $derived([
    { id: 'reading' as const, label: t('library.reading'), badge: reading.length || undefined, domId: 'shelf-reading', controls: 'shelf' },
    { id: 'all' as const, label: t('library.all'), badge: inCollection.length || undefined, domId: 'shelf-all', controls: 'shelf' },
    { id: 'finished' as const, label: t('library.finished'), badge: finished.length || undefined, domId: 'shelf-finished', controls: 'shelf' },
  ]);
  const docs = $derived(shelve(library.items, v.shelf, v.sort, filter, collection));
  /** The document read most recently and not finished: the one to go back to. */
  const current = $derived(shelve(library.items.filter(isReading), 'reading', 'recent')[0]);
  /** With nothing in progress: the next volume of a series just finished. */
  const next = $derived(current ? undefined : upNext(library.items));
  const goal = $derived(v.dailyGoal ? { done: Math.floor(stats.todayMs / 60_000), goal: v.dailyGoal } : null);
  /** The search field opens under the shelves when asked for, and stays while it holds words. */
  let searchOpen = $state(false);
  const searching = $derived(searchOpen || !!filter);
  let filterInput = $state<HTMLInputElement>();
  async function toggleSearch() {
    if (searching) {
      filter = '';
      searchOpen = false;
      return;
    }
    searchOpen = true;
    await tick();
    filterInput?.focus();
  }

  /** The Arrange sheet: collection, tag, order and layout, out of the way of the books. */
  let arranging = $state(false);
  /** Something other than the defaults is arranging the shelf, so the button says so. */
  const arranged = $derived(!!collection || v.sort !== 'recent' || filter.trim().startsWith('#'));
  const collectionName = $derived(library.collections.find((c) => c.id === collection)?.name ?? '');

  // New documents land on the collection being shown.
  $effect(() => {
    library.collectionFilter = collection;
  });

  async function add() {
    const files = await pickFiles(ACCEPT);
    await addFiles(files, { openSingle: true });
  }

  async function addFolder() {
    const files = await pickFolder();
    await addFiles(files.filter((f) => isReadableName(f.name)));
  }

  async function newCollection() {
    const name = await ui.prompt({ title: t('collections.new'), message: t('collections.newHint'), label: t('collections.name'), action: t('collections.create') });
    if (!name?.trim()) return;
    const c = await library.createCollection(name);
    await settings.update({ collection: c.id });
  }

  async function renameCollection() {
    const c = library.collections.find((x) => x.id === collection);
    if (!c) return;
    const name = await ui.prompt({ title: t('collections.rename'), message: '', label: t('collections.name'), action: t('action.save'), value: c.name });
    if (name?.trim()) await library.renameCollection(c.id, name);
  }

  async function deleteCollection() {
    const c = library.collections.find((x) => x.id === collection);
    if (!c) return;
    const ok = await ui.confirm({ title: t('collections.deleteTitle', { name: c.name }), message: t('collections.deleteMessage'), action: t('collections.delete'), danger: true });
    if (!ok) return;
    await settings.update({ collection: '' });
    await library.deleteCollection(c.id);
  }

  const EMPTY = $derived<Record<LibraryShelf, string>>({
    reading: t('library.emptyReading'),
    all: collection ? t('library.emptyCollection') : t('library.noMatch'),
    finished: t('library.emptyFinished'),
  });

  // The filter knows the answer (style.md §11.3; the title's eggs live in Home.svelte).
  let answered = false;
  $effect(() => {
    const asked = filter.trim() === '42';
    if (asked && !answered) hatch('answer', t('egg.answer'));
    answered = asked;
  });
</script>

<div class="library-view" id="view-library" role="tabpanel" aria-labelledby="tab-library">
  <main>
    {#if library.loaded && !library.items.length}
      <EmptyState icon="library" title={t('library.emptyTitle')} text={t('library.emptyText')}>
        <button type="button" class="btn btn-primary" id="addFirst" onclick={() => void add()}><Icon name="plus" />{t('library.add')}</button>
        {#if canPickFolder}<button type="button" class="btn btn-secondary" id="addFolderFirst" onclick={() => void addFolder()}><Icon name="folder-open" />{t('library.addFolder')}</button>{/if}
        <button type="button" class="btn btn-muted" id="readGuide" onclick={() => void addGuide()}>{t('library.readGuide')}</button>
      </EmptyState>
    {:else if library.loaded}
      {#if current}
        <section class="resume panel" aria-label={t('library.continue')}>
          <p class="t-section-label">{t('library.continue')}</p>
          <button type="button" class="resume-body" id="resume" onclick={() => void reader.open(current.id)}>
            <span class="doc-thumb resume-thumb" aria-hidden="true"><Cover doc={current} small /></span>
            <span class="resume-text">
              <span class="t-card-title ellipsis-2">{current.title}</span>
              {#if current.author}<span class="doc-author ellipsis">{current.author}</span>{/if}
              <span class="t-data-small tabular resume-figures">
                <span class="amber">{t('library.percentRead', { percent: Math.floor(current.progress * 100) })}</span>
                {#if goal}<span class="dim" id="goalToday">{goal.done >= goal.goal ? t('stats.goalDone', { time: duration(stats.todayMs) }) : t('stats.goalToday', { done: goal.done, goal: goal.goal })}</span>{/if}
              </span>
            </span>
            <Icon name="chevron-right" />
          </button>
          <div class="meter" aria-hidden="true"><div class="meter-fill" style:transform="scaleX({current.progress})"></div></div>
        </section>
      {:else if next}
        <section class="resume panel" aria-label={t('library.upNext')}>
          <p class="t-section-label">{t('library.upNext')}</p>
          <button type="button" class="resume-body" id="upNext" onclick={() => void reader.open(next.next.id)}>
            <span class="doc-thumb resume-thumb" aria-hidden="true"><Cover doc={next.next} small /></span>
            <span class="resume-text">
              <span class="t-card-title ellipsis-2">{next.next.title}</span>
              <span class="doc-author ellipsis">{t('library.upNextAfter', { series: next.next.series, title: next.after.title })}</span>
            </span>
            <Icon name="chevron-right" />
          </button>
        </section>
      {/if}

      <!-- One row of controls: the shelves, then search and Arrange as icons. -->
      <div class="shelf-row">
        <nav class="shelf-tabs" aria-label={t('library.shelves')}>
          <TabRail tabs={shelves} value={v.shelf} label={t('library.shelves')} onselect={(id) => void settings.update({ shelf: id })} />
        </nav>
        <button type="button" class="btn-icon" class:amber={searching} id="searchLibrary" aria-label={t('library.filter')} aria-expanded={searching} aria-controls="libraryFilter" onclick={toggleSearch}><Icon name="search" /></button>
        <button type="button" class="btn-icon arrange-button" class:is-set={arranged} id="arrangeLibrary" aria-label={t('arrange.open')} aria-haspopup="dialog" onclick={() => (arranging = true)}><Icon name="sliders-horizontal" /></button>
      </div>
      {#if searching}
        <div class="library-tools">
          <label class="filter-field">
            <span class="visually-hidden">{t('library.filter')}</span>
            <Icon name="search" />
            <input class="input" type="search" id="libraryFilter" placeholder={t('library.filterPlaceholder')} enterkeyhint="search" autocomplete="off" bind:value={filter} bind:this={filterInput} onkeydown={(e) => e.key === 'Escape' && !filter && toggleSearch()} />
          </label>
        </div>
      {/if}
      {#if collection}
        <div class="collection-bar">
          <span class="t-data-small dim">{t('arrange.in')}</span>
          <span class="t-card-title collection-name ellipsis">{collectionName}</span>
          <button type="button" class="btn-icon" aria-label={t('collections.rename')} onclick={() => void renameCollection()}><Icon name="pencil" /></button>
          <button type="button" class="btn-icon" aria-label={t('collections.delete')} onclick={() => void deleteCollection()}><Icon name="trash-2" /></button>
          <button type="button" class="btn-icon" aria-label={t('arrange.showEverything')} onclick={() => void settings.update({ collection: '' })}><Icon name="x" /></button>
        </div>
      {/if}

      <div id="shelf" role="tabpanel" aria-labelledby="shelf-{v.shelf}">
        {#if docs.length && v.layout === 'grid'}
          <ul class="doc-grid dd-stagger" aria-label={t('library.documents')}>
            {#each docs as doc (doc.id)}
              <li><DocTile {doc} /></li>
            {/each}
          </ul>
          <p class="t-data-small faint list-count tabular">{t('library.count', { count: docs.length })}</p>
        {:else if docs.length}
          <ul class="doc-list dd-stagger" aria-label={t('library.documents')}>
            {#each docs as doc (doc.id)}
              <li><DocCard {doc} /></li>
            {/each}
          </ul>
          <p class="t-data-small faint list-count tabular">{t('library.count', { count: docs.length })}</p>
        {:else}
          <div class="empty-match">
            <p class="t-hint">{filter ? t('library.noMatch') : EMPTY[v.shelf]}</p>
            {#if filter}<button type="button" class="btn btn-muted" onclick={() => (filter = '')}>{t('library.clearFilter')}</button>{/if}
          </div>
        {/if}
      </div>
    {/if}
  </main>
</div>

{#if library.items.length}
  <button type="button" class="fab" id="addDocs" aria-label={t('library.add')} onclick={() => void add()}><Icon name="plus" /></button>
{/if}

{#if arranging}
  <ArrangeSheet {collection} {filter} onfilter={(f) => (filter = f)} onnewcollection={() => void newCollection()} onclose={() => (arranging = false)} />
{/if}

{#if library.batch}
  <!-- Several files coming in: the wavy bar fills as each lands (style.md §8.21). -->
  <div class="adding adding-batch" role="status">
    <span class="t-data-small tabular">{t('library.addingOf', { done: library.batch.done, total: library.batch.total })}</span>
    <WavyProgress value={library.batch.done / library.batch.total} label={t('library.addingOf', { done: library.batch.done, total: library.batch.total })} />
  </div>
{:else if library.adding}
  <p class="adding t-data-small" role="status">{t('library.adding', { count: library.adding })}</p>
{/if}
