<script lang="ts">
  // Search the whole document; a result takes you there and flashes the words.
  import { plural } from '../../lib/format';
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

  function go(hit: Hit) {
    onclose();
    reader.goTo({ section: hit.section, offset: reader.isPdf ? 0 : hit.start }, { start: hit.start, end: hit.end });
  }
</script>

<script lang="ts" module>
  /** The last search, kept while the app is open. */
  const memory = { query: '' };
</script>

<Sheet title="Search" {onclose}>
  <label class="field">
    <span class="t-field-label">Words to find</span>
    <input class="input" id="searchInput" type="search" enterkeyhint="search" autocomplete="off" placeholder="A word or a phrase" bind:this={input} bind:value={query} />
  </label>
  {#if query.trim().length >= 2}
    <p class="t-data-small dim" role="status">{done ? (hits.length ? plural(hits.length, 'match', 'matches') : 'No matches') : `Searching… ${plural(hits.length, 'match', 'matches')}`}</p>
    {#if hits.length}
      <ul class="row-list" id="searchResults">
        {#each hits.slice(0, SHOWN) as hit, i (i)}
          {@const ex = excerpts.get(hit)}
          <li>
            <button type="button" class="row" onclick={() => go(hit)}>
              <span class="row-main">
                <span class="t-data-small faint">{reader.whereIs(hit.section, hit.start)}</span>
                {#if ex}<span class="row-sub">{ex.before}<mark class="search-match">{ex.match}</mark>{ex.after}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
      {#if hits.length > SHOWN}<p class="t-hint">Showing the first {SHOWN}. Add a word to narrow it down.</p>{/if}
    {/if}
  {/if}
</Sheet>
