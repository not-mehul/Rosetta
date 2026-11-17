<script lang="ts">
  // The library's search, inside the books: every document's words, grouped by
  // book, a few places each. The first search reads books never opened, so it
  // says how far it has got.
  import { WavyProgress } from 'dusk-dawn';
  import { t } from '../i18n/index.svelte';
  import { searchLibrary, type BookHits, type LibraryHit } from '../state/fulltext';
  import { library } from '../state/library.svelte';
  import { reader } from '../state/reader.svelte';
  import Cover from './ui/Cover.svelte';

  let { query }: { query: string } = $props();

  let books = $state.raw<BookHits[]>([]);
  let done = $state(0);
  let total = $state(0);

  // A short pause after typing, then a fresh search; the last one stops.
  $effect(() => {
    const q = query.trim();
    const docs = library.items;
    books = [];
    done = total = 0;
    if (q.length < 2) return;
    let stop: (() => void) | undefined;
    const timer = setTimeout(() => {
      stop = searchLibrary(q, docs, (found, d, n) => {
        books = found;
        done = d;
        total = n;
      });
    }, 350);
    return () => {
      clearTimeout(timer);
      stop?.();
    };
  });

  const go = (book: BookHits, hit: LibraryHit) => void reader.openAt(book.doc.id, { section: hit.section, offset: book.doc.format === 'pdf' ? 0 : hit.start }, { start: hit.start, end: hit.end });
  const reading = $derived(total > 0 && done < total);
</script>

{#if query.trim().length >= 2}
  <section class="text-results" aria-labelledby="textResultsHead" aria-busy={reading}>
    <h2 class="t-section-label text-results-head" id="textResultsHead">{t('library.inside')}</h2>
    {#if reading}
      <WavyProgress value={done / total} label={t('library.readingBooks', { done, total })} />
    {/if}
    {#if books.length}
      <ul class="text-books" id="textResults">
        {#each books as book (book.doc.id)}
          <li class="text-book">
            <div class="text-book-head">
              <span class="text-book-cover"><Cover doc={book.doc} small /></span>
              <span class="text-book-title ellipsis">{book.doc.title}</span>
              <span class="t-data-small faint tabular">{t('library.matches', { count: book.count })}</span>
            </div>
            <ul class="row-list">
              {#each book.hits as hit, i (i)}
                <li>
                  <button type="button" class="row text-hit" onclick={() => go(book, hit)}>
                    <span class="row-main">
                      {#if hit.where}<span class="t-data-small faint ellipsis">{hit.where}</span>{/if}
                      <span class="row-sub">{hit.before}<mark class="text-match">{hit.match}</mark>{hit.after}</span>
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
    {:else if !reading && total}
      <p class="t-hint" id="textResultsNone">{t('library.insideNone')}</p>
    {/if}
  </section>
{/if}

<style>
  .text-results {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border-faint);
  }
  .text-results-head {
    margin: 0;
  }
  .text-books {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .text-book-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .text-book-cover {
    flex: none;
    width: 1.75rem;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: var(--corner-sm);
  }
  .text-book-title {
    flex: 1;
    min-width: 0;
    font-family: var(--font-serif);
    font-size: 1.0625rem;
    color: var(--text-heading);
  }
  .text-match {
    background: rgba(var(--accent-amber-rgb), 0.14);
    color: var(--accent-amber);
    border-radius: 2px;
    box-shadow: inset 0 -1px 0 rgba(var(--accent-amber-rgb), 0.5);
  }
</style>
