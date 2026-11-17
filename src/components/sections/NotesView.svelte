<script lang="ts">
  // The Notes section: every highlight and bookmark in the library, by
  // document. One search finds words, notes, chapters and titles in both;
  // chips show bookmarks only, or one colour of highlight. A tap opens the
  // document at that very place.
  import { t } from '../../i18n/index.svelte';
  import { relativeDay } from '../../lib/format';
  import { shareQuote } from '../../lib/quote';
  import { db, type HighlightColour, type Mark } from '../../state/db';
  import { library } from '../../state/library.svelte';
  import { reader } from '../../state/reader.svelte';
  import { COLOURS } from '../reader/colours';
  import EmptyState from '../ui/EmptyState.svelte';
  import Icon from '../ui/Icon.svelte';

  type Show = '' | 'bookmark' | HighlightColour;

  let marks = $state.raw<Mark[]>([]);
  let loaded = $state(false);
  let show = $state<Show>('');
  let query = $state('');

  $effect(() => {
    void db.marks.toArray().then((all) => {
      marks = all;
      loaded = true;
    });
  });

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return marks.filter((m) => {
      if (show === 'bookmark' ? m.kind !== 'bookmark' : show && (m.kind !== 'highlight' || m.colour !== show)) return false;
      return !q || `${m.text} ${m.note} ${m.where} ${library.get(m.docId)?.title ?? ''}`.toLowerCase().includes(q);
    });
  });

  /** The marks by document, the one marked most recently first, each in reading order. */
  const groups = $derived.by(() => {
    const byDoc: Record<string, Mark[]> = {};
    for (const m of shown) (byDoc[m.docId] ??= []).push(m);
    return Object.entries(byDoc)
      .map(([docId, list]) => ({
        docId,
        title: library.get(docId)?.title ?? t('notes.removedDoc'),
        latest: Math.max(...list.map((m) => m.createdAt)),
        marks: list.sort((a, b) => a.section - b.section || a.start - b.start),
      }))
      .sort((a, b) => b.latest - a.latest);
  });
  const highlights = $derived(shown.filter((m) => m.kind === 'highlight').length);
  const bookmarks = $derived(shown.length - highlights);

  async function go(m: Mark) {
    const doc = library.get(m.docId);
    if (!doc) return;
    const pdf = doc.format === 'pdf';
    await reader.openAt(m.docId, { section: m.section, offset: pdf ? 0 : m.start }, m.kind === 'highlight' ? { start: m.start, end: m.end } : undefined);
  }
</script>

<div class="section-view" id="view-notes" role="tabpanel" aria-labelledby="tab-notes">
  {#if loaded && !marks.length}
    <EmptyState icon="highlighter" title={t('notes.emptyTitle')} text={t('notes.emptyText')} />
  {:else}
    <div class="notes-tools">
      <label class="filter-field">
        <span class="visually-hidden">{t('notes.search')}</span>
        <Icon name="search" />
        <input class="input" type="search" id="notesSearch" placeholder={t('notes.search')} enterkeyhint="search" autocomplete="off" bind:value={query} />
      </label>
      <div class="chip-row notes-chips" role="radiogroup" aria-label={t('notes.show')}>
        <button type="button" class="chip" role="radio" id="notesAll" aria-checked={show === ''} onclick={() => (show = '')}>{t('notes.all')}</button>
        <button type="button" class="chip" role="radio" id="notesBookmarks" aria-checked={show === 'bookmark'} onclick={() => (show = 'bookmark')}><Icon name="bookmark" />{t('contents.bookmarks')}</button>
        {#each COLOURS as c (c.id)}
          <button type="button" class="chip" role="radio" data-colour={c.id} aria-checked={show === c.id} onclick={() => (show = c.id)}><span class="hl-dot hl-{c.id}" aria-hidden="true"></span>{t(`colour.${c.id}`)}</button>
        {/each}
      </div>
    </div>
    {#if shown.length}
      <p class="t-data-small faint tabular notes-count" id="notesCount">
        {[highlights ? t('notes.count', { count: highlights }) : '', bookmarks ? t('notes.bookmarkCount', { count: bookmarks }) : ''].filter(Boolean).join(' · ')}
      </p>
      <div class="notes-groups" id="allNotes">
        {#each groups as g (g.docId)}
          <section class="notes-book" aria-labelledby="notes-{g.docId}">
            <h3 class="notes-book-title" id="notes-{g.docId}"><span class="ellipsis">{g.title}</span><span class="t-data-small faint tabular">{g.marks.length}</span></h3>
            <ul class="row-list">
              {#each g.marks as m (m.id)}
                {@const doc = library.get(m.docId)}
                <li class="row-with-action">
                  {#if m.kind === 'highlight'}
                    <button type="button" class="row highlight-row" data-mark={m.id} onclick={() => void go(m)}>
                      <span class="hl-bar hl-{m.colour}" aria-hidden="true"></span>
                      <span class="row-main">
                        <span class="row-quote ellipsis-3">{m.text}</span>
                        {#if m.note}<span class="row-note">{m.note}</span>{/if}
                        <span class="t-data-small faint">{[m.where, relativeDay(m.createdAt)].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                    {#if doc}<button type="button" class="btn-icon" aria-label={t('mark.share')} onclick={() => void shareQuote(m, doc)}><Icon name="share-2" /></button>{/if}
                  {:else}
                    <button type="button" class="row bookmark-row" data-mark={m.id} onclick={() => void go(m)}>
                      <span class="bookmark-icon" aria-hidden="true"><Icon name="bookmark" /></span>
                      <span class="row-main">
                        <span class="row-title">{m.where || t('notes.bookmark')}</span>
                        {#if m.text}<span class="row-sub ellipsis-2">{m.text}</span>{/if}
                        <span class="t-data-small faint">{relativeDay(m.createdAt)}</span>
                      </span>
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    {:else}
      <div class="empty-match">
        <p class="t-hint">{t('library.noMatch')}</p>
        <button
          type="button"
          class="btn btn-muted"
          onclick={() => {
            query = '';
            show = '';
          }}>{t('library.clearFilter')}</button
        >
      </div>
    {/if}
  {/if}
</div>

<style>
  .notes-tools {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  /* In this column the field keeps its own height (filter-field grows along a row). */
  .notes-tools > .filter-field {
    flex: none;
  }
  /* The chips stay on one line and scroll sideways on a narrow phone. */
  .notes-chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    margin: 0 calc(-1 * var(--space-1));
    padding: 2px var(--space-1);
  }
  .notes-chips > .chip {
    flex-shrink: 0;
  }
  .hl-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: var(--space-1);
  }
  .notes-count {
    margin-top: calc(-1 * var(--space-1));
  }
  .notes-groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }
  .notes-book {
    display: flex;
    flex-direction: column;
  }
  /* The document's title over its marks, in serif, with the count at its right. */
  .notes-book-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    margin: 0;
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border-soft);
    font-family: var(--font-serif);
    font-weight: 400;
    font-size: 1.125rem;
    color: var(--text-heading);
  }
  .bookmark-row {
    align-items: flex-start;
  }
  .bookmark-icon {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 16px;
    margin-top: 2px;
    color: var(--accent-amber);
  }
  .bookmark-icon :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
