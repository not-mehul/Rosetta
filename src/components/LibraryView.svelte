<script lang="ts">
  // The Library section: every document, each with a mark for how far along
  // it is; one search field (title, author, series or #tag, and the words
  // inside the books) and one filter (what to show, the order, a collection,
  // covers or a list).
  import { ACCEPT } from '../formats/sniff';
  import { t } from '../i18n/index.svelte';
  import { canPickFolder, pickFiles } from '../lib/pick';
  import { isNative } from '../platform/native';
  import { addFiles, addFolder as addBooksFolder } from '../state/intake';
  import { isReading, library, shelve, upNext } from '../state/library.svelte';
  import { stats } from '../state/stats.svelte';
  import { duration } from '../lib/format';
  import { reader } from '../state/reader.svelte';
  import { settings } from '../state/settings.svelte';
  import type { LibraryShelf } from '../state/settings';
  import { ui } from '../state/ui.svelte';
  import { addGuide } from '../lib/guide';
  import { deleteCollection, renameCollection } from '../lib/collections';
  import DocCard from './DocCard.svelte';
  import DocTile from './DocTile.svelte';
  import Lazy from './Lazy.svelte';
  import { ArrangeSheet } from './parts';
  import Cover from './ui/Cover.svelte';
  import EmptyState from './ui/EmptyState.svelte';
  import Icon from './ui/Icon.svelte';
  import { WavyProgress } from 'dusk-dawn';
  import TextResults from './TextResults.svelte';
  import LibraryCards from './LibraryCards.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import { selection } from '../state/selection.svelte';
  import { hold } from '../lib/hold';
  import type { StoredDoc } from '../state/db';
  import { hatch } from '../lib/delight';

  let filter = $state('');
  const v = $derived(settings.value);
  const collection = $derived(library.collections.some((c) => c.id === v.collection) ? v.collection : '');
  const docs = $derived(shelve(library.items, v.shelf, v.sort, filter, collection));
  /** The document read most recently and not finished: the one to go back to. */
  const current = $derived(shelve(library.items.filter(isReading), 'reading', 'recent')[0]);
  /** With nothing in progress: the next volume of a series just finished. */
  const next = $derived(current ? undefined : upNext(library.items));
  const goal = $derived(v.dailyGoal ? { done: Math.floor(stats.todayMs / 60_000), goal: v.dailyGoal } : null);
  const searching = $derived(!!filter.trim());

  /** The Arrange sheet: collection, tag, order and layout, out of the way of the books. */
  let arranging = $state(false);
  /** Something other than the defaults is filtering or ordering the shelf, so the button says so. */
  const arranged = $derived(!!collection || v.shelf !== 'all' || v.sort !== 'recent' || filter.trim().startsWith('#'));
  const collectionName = $derived(library.collections.find((c) => c.id === collection)?.name ?? '');

  // New documents land on the collection being shown.
  $effect(() => {
    library.collectionFilter = collection;
  });

  async function add() {
    const files = await pickFiles(ACCEPT);
    await addFiles(files, { openSingle: true });
  }

  const addFolder = () => void addBooksFolder();
  /** Phones and tablets pick folders with the system picker; browsers that can, with their folder input. */
  const canAddFolder = isNative || canPickFolder;

  /** The add button held: files, or a whole folder. */
  async function addChoices() {
    if (!canAddFolder) return add();
    const choice = await ui.actions({
      title: t('library.add'),
      actions: [
        { id: 'files', label: t('library.addFiles'), icon: 'file-plus' },
        ...(canAddFolder ? [{ id: 'folder', label: t('library.addFolder'), icon: 'folder-open' as const }] : []),
      ],
    });
    if (choice === 'files') await add();
    else if (choice === 'folder') addFolder();
  }

  /** Continue reading held: go on, mark it finished, start over, or its details. */
  async function resumeActions(doc: StoredDoc) {
    const choice = await ui.actions({
      title: doc.title,
      actions: [
        { id: 'open', label: t('details.continue'), icon: 'book-open' },
        { id: 'finish', label: t('details.markFinished'), icon: 'check' },
        { id: 'over', label: t('details.startOver'), icon: 'rotate-ccw' },
        { id: 'details', label: t('details.title'), icon: 'info' },
      ],
    });
    if (choice === 'open') await reader.open(doc.id);
    else if (choice === 'finish') {
      await library.update(doc.id, { finishedAt: Date.now() });
      ui.undoable(t('select.finished', { count: 1 }), () => void library.update(doc.id, { finishedAt: null }));
    } else if (choice === 'over') {
      const { location, progress } = doc;
      await library.update(doc.id, { location: null, progress: 0 });
      ui.undoable(t('details.startedOver'), () => void library.update(doc.id, { location, progress }));
    } else if (choice === 'details') {
      ui.detailsId = doc.id;
      ui.open('details');
    }
  }

  async function newCollection() {
    const name = await ui.prompt({ title: t('collections.new'), message: t('collections.newHint'), label: t('collections.name'), action: t('collections.create') });
    if (!name?.trim()) return;
    const c = await library.createCollection(name);
    await settings.update({ collection: c.id });
  }

  const EMPTY = $derived<Record<LibraryShelf, string>>({
    reading: t('library.emptyReading'),
    unread: t('library.emptyUnread'),
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
        {#if canAddFolder}<button type="button" class="btn btn-secondary" id="addFolderFirst" onclick={addFolder}><Icon name="folder-open" />{t('library.addFolder')}</button>{/if}
        <button type="button" class="btn btn-muted" id="readGuide" onclick={() => void addGuide()}>{t('library.readGuide')}</button>
      </EmptyState>
    {:else if library.loaded}
      <LibraryCards quiet={!current && !next} />
      {#if current}
        <section class="resume panel" aria-label={t('library.continue')}>
          <p class="t-section-label">{t('library.continue')}</p>
          <button type="button" class="resume-body" id="resume" use:hold={() => void resumeActions(current)} onclick={() => void reader.open(current.id)}>
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

      <!-- One row of controls: the search field and the filter. -->
      <div class="library-tools">
        <label class="filter-field">
          <span class="visually-hidden">{t('library.filter')}</span>
          <Icon name="search" />
          <input class="input" type="search" id="libraryFilter" placeholder={t('library.filterPlaceholder')} enterkeyhint="search" autocomplete="off" bind:value={filter} />
        </label>
        <button type="button" class="btn-icon arrange-button" class:is-set={arranged} id="arrangeLibrary" aria-label={t('arrange.open')} aria-haspopup="dialog" onclick={() => (arranging = true)}><Icon name="sliders-horizontal" /></button>
      </div>
      {#if v.shelf !== 'all'}
        <div class="collection-bar" id="showingBar">
          <span class="t-data-small dim">{t('arrange.showing')}</span>
          <span class="t-card-title collection-name ellipsis">{t(`status.${v.shelf}`)}</span>
          <button type="button" class="btn-icon" aria-label={t('arrange.showEverything')} onclick={() => void settings.update({ shelf: 'all' })}><Icon name="x" /></button>
        </div>
      {/if}
      {#if collection}
        <div class="collection-bar">
          <span class="t-data-small dim">{t('arrange.in')}</span>
          <span class="t-card-title collection-name ellipsis">{collectionName}</span>
          <button type="button" class="btn-icon" aria-label={t('collections.rename')} onclick={() => void renameCollection(collection)}><Icon name="pencil" /></button>
          <button type="button" class="btn-icon" aria-label={t('collections.delete')} onclick={() => void deleteCollection(collection)}><Icon name="trash-2" /></button>
          <button type="button" class="btn-icon" aria-label={t('arrange.showEverything')} onclick={() => void settings.update({ collection: '' })}><Icon name="x" /></button>
        </div>
      {/if}

      <div id="shelf">
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
      {#if searching && !filter.trim().startsWith('#')}
        <TextResults query={filter} />
      {/if}
    {/if}
  </main>
</div>

{#if selection.active}
  <SelectionBar shown={docs.map((d) => d.id)} />
{:else if library.items.length}
  <button type="button" class="fab" id="addDocs" aria-label={t('library.add')} use:hold={() => void addChoices()} onclick={() => void add()}><Icon name="plus" /></button>
{/if}

{#if arranging}
  <Lazy load={ArrangeSheet} {collection} {filter} onfilter={(f: string) => (filter = f)} onnewcollection={() => void newCollection()} onclose={() => (arranging = false)} />
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

<style>
  .resume-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .library-tools {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  /* Arranged other than by default (a collection, a tag, another order): a dot says so; the collection bar names it. */
  .arrange-button {
    position: relative;
    flex-shrink: 0;
  }
  .arrange-button.is-set::after {
    content: '';
    position: absolute;
    top: 9px;
    right: 9px;
    width: 7px;
    height: 7px;
    border-radius: var(--corner-full);
    background: var(--accent-amber);
  }
  .collection-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: calc(-1 * var(--space-2)) 0 var(--space-4);
    min-width: 0;
  }
  .collection-name {
    flex: 1;
    min-width: 0;
  }

  /* The cover grid: two columns on a phone, up to five at the content width. */
  .doc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(140px, 100%), 1fr));
    gap: var(--space-5) var(--space-4);
  }
  .doc-grid > li {
    min-width: 0;
  }
  /* A long shelf: books off screen are laid out and painted only as they
     come near it. The sizes stand in for them until then. */
  .doc-grid > li,
  .doc-list > li {
    content-visibility: auto;
  }
  .doc-grid > li {
    contain-intrinsic-size: auto 140px auto 300px;
  }
  .doc-list > li {
    contain-intrinsic-size: auto 100% auto 96px;
  }
  .list-count {
    margin-top: var(--space-4);
    text-align: center;
  }
  .adding-batch {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 12rem;
  }

  /* ─── Depth: the library's figures, the calendar, most read ─── */

  .resume-figures {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
  }
  .resume-thumb {
    width: 44px;
  }
</style>
