<script lang="ts">
  // The library: what you are reading, everything, and what you've finished.
  import { ACCEPT } from '../formats/sniff';
  import { plural } from '../lib/format';
  import { pickFiles } from '../lib/pick';
  import { shown, toggledTheme } from '../platform/theme.svelte';
  import { addFiles } from '../state/intake';
  import { isFinished, isReading, library, shelve } from '../state/library.svelte';
  import { reader } from '../state/reader.svelte';
  import { settings } from '../state/settings.svelte';
  import type { LibraryShelf, LibrarySort } from '../state/settings';
  import { ui } from '../state/ui.svelte';
  import { addGuide } from '../lib/guide';
  import DocCard from './DocCard.svelte';
  import EmptyState from './ui/EmptyState.svelte';
  import Icon from './ui/Icon.svelte';
  import TabRail from './ui/TabRail.svelte';
  import ThemeToggle from './ui/ThemeToggle.svelte';

  let filter = $state('');
  const v = $derived(settings.value);
  const reading = $derived(library.items.filter(isReading));
  const finished = $derived(library.items.filter(isFinished));
  const shelves = $derived([
    { id: 'reading' as const, label: 'Reading', badge: reading.length || undefined, domId: 'shelf-reading', controls: 'shelf' },
    { id: 'all' as const, label: 'All', badge: library.items.length || undefined, domId: 'shelf-all', controls: 'shelf' },
    { id: 'finished' as const, label: 'Finished', badge: finished.length || undefined, domId: 'shelf-finished', controls: 'shelf' },
  ]);
  const docs = $derived(shelve(library.items, v.shelf, v.sort, filter));
  /** The document read most recently and not finished: the one to go back to. */
  const current = $derived(shelve(reading, 'reading', 'recent')[0]);

  async function add() {
    const files = await pickFiles(ACCEPT);
    await addFiles(files, { openSingle: true });
  }

  const SORTS: [LibrarySort, string][] = [
    ['recent', 'Recent'],
    ['title', 'Title'],
    ['author', 'Author'],
  ];
  const EMPTY: Record<LibraryShelf, string> = {
    reading: 'Nothing in progress. Open a document and it will wait here.',
    all: 'Nothing matches.',
    finished: 'Nothing finished yet.',
  };
</script>

<div class="container">
  <header class="site-header">
    <div class="site-title">
      <p class="eyebrow">Rosetta · Library</p>
      <h1 class="t-page-title">The <em>reading</em> room</h1>
      <p class="t-tagline">Books, papers and notes, read quietly in one place.</p>
    </div>
    <div class="header-tools">
      <ThemeToggle dawn={!shown.dark} label="Dawn theme" ontoggle={() => void settings.update({ theme: toggledTheme() })} />
      <button type="button" class="btn-icon" id="openSettings" aria-label="Settings" onclick={() => ui.open('settings')}><Icon name="settings" /></button>
    </div>
  </header>

  <main>
    {#if library.loaded && !library.items.length}
      <EmptyState icon="library" title="No documents yet" text="Add an EPUB, PDF, Word document, Markdown or text file. Everything stays on this device.">
        <button type="button" class="btn btn-primary" id="addFirst" onclick={() => void add()}><Icon name="plus" />Add documents</button>
        <button type="button" class="btn btn-muted" id="readGuide" onclick={() => void addGuide()}>Read the guide</button>
      </EmptyState>
    {:else if library.loaded}
      {#if current}
        <section class="resume panel" aria-label="Continue reading">
          <p class="t-section-label">Continue reading</p>
          <button type="button" class="resume-body" id="resume" onclick={() => void reader.open(current.id)}>
            <span class="resume-text">
              <span class="t-card-title ellipsis-2">{current.title}</span>
              {#if current.author}<span class="doc-author ellipsis">{current.author}</span>{/if}
              <span class="t-data-small amber tabular">{Math.floor(current.progress * 100)}% read</span>
            </span>
            <Icon name="chevron-right" />
          </button>
          <div class="meter" aria-hidden="true"><div class="meter-fill" style:transform="scaleX({current.progress})"></div></div>
        </section>
      {/if}

      <nav class="shelf-tabs" aria-label="Shelves">
        <TabRail tabs={shelves} value={v.shelf} label="Shelves" onselect={(id) => void settings.update({ shelf: id })} />
      </nav>

      <div class="library-tools">
        <label class="filter-field">
          <span class="visually-hidden">Filter the library</span>
          <Icon name="search" />
          <input class="input" type="search" placeholder="Title or author" enterkeyhint="search" autocomplete="off" bind:value={filter} />
        </label>
        <div class="segmented" role="radiogroup" aria-label="Sort">
          {#each SORTS as [id, label] (id)}
            <button type="button" role="radio" aria-checked={v.sort === id} onclick={() => void settings.update({ sort: id })}>{label}</button>
          {/each}
        </div>
      </div>

      <div id="shelf" role="tabpanel" aria-labelledby="shelf-{v.shelf}">
        {#if docs.length}
          <ul class="doc-list" aria-label="Documents">
            {#each docs as doc (doc.id)}
              <li><DocCard {doc} /></li>
            {/each}
          </ul>
          <p class="t-data-small faint list-count tabular">{plural(docs.length, 'document')}</p>
        {:else}
          <div class="empty-match">
            <p class="t-hint">{filter ? 'Nothing matches that.' : EMPTY[v.shelf]}</p>
            {#if filter}<button type="button" class="btn btn-muted" onclick={() => (filter = '')}>Clear filter</button>{/if}
          </div>
        {/if}
      </div>
    {/if}
  </main>
</div>

{#if library.items.length}
  <button type="button" class="fab" id="addDocs" aria-label="Add documents" onclick={() => void add()}><Icon name="plus" /></button>
{/if}

{#if library.adding}
  <p class="adding t-data-small" role="status">Reading {plural(library.adding, 'file')}…</p>
{/if}
