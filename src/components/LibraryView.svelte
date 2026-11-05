<script lang="ts">
  // The library: what you are reading, everything, and what you've finished,
  // on every collection or one; search by title, author, series or #tag.
  import { ACCEPT } from '../formats/sniff';
  import { t } from '../i18n/index.svelte';
  import { canPickFolder, pickFiles, pickFolder } from '../lib/pick';
  import { shown, toggledTheme } from '../platform/theme.svelte';
  import { addFiles } from '../state/intake';
  import { isFinished, isReading, library, shelve, upNext } from '../state/library.svelte';
  import { stats } from '../state/stats.svelte';
  import { duration } from '../lib/format';
  import { reader } from '../state/reader.svelte';
  import { settings } from '../state/settings.svelte';
  import type { LibraryShelf, LibrarySort } from '../state/settings';
  import { ui } from '../state/ui.svelte';
  import { addGuide } from '../lib/guide';
  import DocCard from './DocCard.svelte';
  import EmptyState from './ui/EmptyState.svelte';
  import Icon from './ui/Icon.svelte';
  import { TabRail, ThemeToggle } from 'dusk-dawn';

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
  const tags = $derived(library.tags.slice(0, 12));

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
    await addFiles(files.filter((f) => /\.(epub|pdf|docx|md|markdown|txt|html?|xhtml|fb2|cbz|rtf|odt)$/i.test(f.name)));
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

  const SORTS = $derived<[LibrarySort, string][]>([
    ['recent', t('library.sortRecent')],
    ['title', t('library.sortTitle')],
    ['author', t('library.sortAuthor')],
    ['series', t('library.sortSeries')],
  ]);
  const EMPTY = $derived<Record<LibraryShelf, string>>({
    reading: t('library.emptyReading'),
    all: collection ? t('library.emptyCollection') : t('library.noMatch'),
    finished: t('library.emptyFinished'),
  });
</script>

<div class="container">
  <header class="site-header">
    <div class="site-title">
      <p class="eyebrow">{t('library.eyebrow')}</p>
      <h1 class="t-page-title">{t('library.titleBefore')}<em>{t('library.titleEm')}</em>{t('library.titleAfter')}</h1>
      <p class="t-tagline">{t('library.tagline')}</p>
    </div>
    <div class="header-tools">
      <ThemeToggle dawn={!shown.dark} label={t('library.dawn')} ontoggle={() => void settings.update({ theme: toggledTheme() })} />
      {#if library.items.length}
        <button type="button" class="btn-icon" id="openNotes" aria-label={t('notes.title')} onclick={() => ui.open('notes')}><Icon name="highlighter" /></button>
        <button type="button" class="btn-icon" id="openStats" aria-label={t('stats.title')} onclick={() => ui.open('stats')}><Icon name="chart-column" /></button>
      {/if}
      <button type="button" class="btn-icon" id="openCatalogs" aria-label={t('catalog.title')} onclick={() => ui.open('catalog')}><Icon name="globe" /></button>
      <button type="button" class="btn-icon" id="openSettings" aria-label={t('settings.title')} onclick={() => ui.open('settings')}><Icon name="settings" /></button>
    </div>
  </header>

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
            <span class="resume-text">
              <span class="t-card-title ellipsis-2">{next.next.title}</span>
              <span class="doc-author ellipsis">{t('library.upNextAfter', { series: next.next.series, title: next.after.title })}</span>
            </span>
            <Icon name="chevron-right" />
          </button>
        </section>
      {/if}

      <div class="chip-row collections" role="radiogroup" aria-label={t('collections.title')}>
        <button type="button" class="chip" role="radio" aria-checked={!collection} onclick={() => void settings.update({ collection: '' })}>{t('collections.everything')}</button>
        {#each library.collections as c (c.id)}
          <button type="button" class="chip" role="radio" aria-checked={collection === c.id} data-collection={c.name} onclick={() => void settings.update({ collection: c.id })}>{c.name}</button>
        {/each}
        <button type="button" class="chip" id="addCollection" onclick={() => void newCollection()}><Icon name="plus" />{t('collections.new')}</button>
      </div>
      {#if collection}
        <div class="btn-row btn-row-start collection-tools">
          <button type="button" class="btn btn-muted" onclick={() => void renameCollection()}><Icon name="pencil" />{t('collections.rename')}</button>
          <button type="button" class="btn btn-muted" onclick={() => void deleteCollection()}><Icon name="trash-2" />{t('collections.delete')}</button>
        </div>
      {/if}

      <nav class="shelf-tabs" aria-label={t('library.shelves')}>
        <TabRail tabs={shelves} value={v.shelf} label={t('library.shelves')} onselect={(id) => void settings.update({ shelf: id })} />
      </nav>

      <div class="library-tools">
        <label class="filter-field">
          <span class="visually-hidden">{t('library.filter')}</span>
          <Icon name="search" />
          <input class="input" type="search" id="libraryFilter" placeholder={t('library.filterPlaceholder')} enterkeyhint="search" autocomplete="off" bind:value={filter} />
        </label>
        <div class="segmented" role="radiogroup" aria-label={t('library.sort')}>
          {#each SORTS as [id, label] (id)}
            <button type="button" role="radio" aria-checked={v.sort === id} onclick={() => void settings.update({ sort: id })}>{label}</button>
          {/each}
        </div>
      </div>
      {#if tags.length}
        <div class="chip-row tag-row" aria-label={t('library.tags')}>
          {#each tags as tag (tag)}
            <button type="button" class="chip chip-small" aria-pressed={filter.trim() === `#${tag}`} onclick={() => (filter = filter.trim() === `#${tag}` ? '' : `#${tag}`)}>#{tag}</button>
          {/each}
        </div>
      {/if}

      <div id="shelf" role="tabpanel" aria-labelledby="shelf-{v.shelf}">
        {#if docs.length}
          <ul class="doc-list" aria-label={t('library.documents')}>
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

{#if library.adding}
  <p class="adding t-data-small" role="status">{t('library.adding', { count: library.adding })}</p>
{/if}
