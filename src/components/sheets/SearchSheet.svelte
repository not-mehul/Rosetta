<script lang="ts">
  // Search the whole document; a result takes you there and flashes the words.
  import { t } from '../../i18n/index.svelte';
  import type { Hit } from '../../reader/search';
  import { reader } from '../../state/reader.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let query = $state(memory.query);
  let hits = $state.raw<Hit[]>([]);
  let done = $state(true);
  let excerpts = $state.raw<Map<Hit, { before: string; match: string; after: string }>>(new Map());
  let input: HTMLInputElement;
  const SHOWN = 120;

  $effect(() => {
    input.focus();
    input.select();
  });

  $effect(() => {
    const q = query;
    memory.query = q;
    let stop = () => {};
    const timer = setTimeout(() => {
      stop = reader.search(q, (found, finished) => {
        hits = found;
        done = finished;
        void Promise.all(found.slice(0, SHOWN).map(async (h) => [h, await reader.excerptFor(h)] as const)).then((pairs) => (excerpts = new Map(pairs)));
      });
    }, 180);
    return () => {
      clearTimeout(timer);
      stop();
    };
  });

  /** The shown hits in runs by chapter, in reading order. */
  const groups = $derived.by(() => {
    const out: { where: string; hits: Hit[] }[] = [];
    for (const hit of hits.slice(0, SHOWN)) {
      const where = reader.whereIs(hit.section, hit.start) || t('search.title');
      if (out.at(-1)?.where === where) out.at(-1)!.hits.push(hit);
      else out.push({ where, hits: [hit] });
    }
    return out;
  });

  function go(hit: Hit) {
    onclose();
    reader.goTo({ section: hit.section, offset: reader.isPdf ? 0 : hit.start }, { start: hit.start, end: hit.end }, undefined, true);
  }
</script>

<script lang="ts" module>
  /** The last search, kept while the app is open. */
  const memory = { query: '' };
</script>

<Sheet title={t('search.title')} {onclose} tall>
  <label class="field">
    <span class="t-field-label">{t('search.label')}</span>
    <input class="input" id="searchInput" type="search" enterkeyhint="search" autocomplete="off" placeholder={t('search.placeholder')} bind:this={input} bind:value={query} />
  </label>
  {#if query.trim().length >= 2}
    <p class="t-data-small dim" role="status">{done ? (hits.length ? t('search.matches', { count: hits.length }) : t('search.none')) : t('search.searching', { count: hits.length })}</p>
    {#if hits.length}
      <!-- Grouped by chapter, each with its count, so the chapter isn't repeated on every row. -->
      <div id="searchResults" class="search-groups">
        {#each groups as group, g (g)}
          <section class="search-group">
            <h3 class="t-section-label search-group-head"><span class="ellipsis">{group.where}</span><span class="tabular faint">{group.hits.length}</span></h3>
            <ul class="row-list">
              {#each group.hits as hit, i (i)}
                {@const ex = excerpts.get(hit)}
                <li>
                  <button type="button" class="row" onclick={() => go(hit)}>
                    {#if ex}<span class="row-sub search-excerpt">{ex.before}<mark class="search-match">{ex.match}</mark>{ex.after}</span>{/if}
                  </button>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
      {#if hits.length > SHOWN}<p class="t-hint">{t('search.capped', { count: SHOWN })}</p>{/if}
    {/if}
  {/if}
</Sheet>

<style>
  .search-match {
    background: rgba(var(--accent-amber-rgb), 0.14);
    color: var(--accent-amber);
    border-radius: 2px;
    box-shadow: inset 0 -1px 0 rgba(var(--accent-amber-rgb), 0.5);
  }
  .search-groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .search-group-head {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    margin: 0 0 var(--space-2);
    min-width: 0;
  }
  /* Where one paragraph or heading ends and the next begins, a new line. */
  .search-excerpt {
    white-space: pre-line;
    color: var(--text-body);
  }
</style>
