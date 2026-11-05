<script lang="ts">
  // Every highlight in the library in one list: filter by colour, search the
  // words and notes, and go to any of them.
  import { t } from '../../i18n/index.svelte';
  import { relativeDay } from '../../lib/format';
  import { shareQuote } from '../../lib/quote';
  import { db, type HighlightColour, type Mark } from '../../state/db';
  import { library } from '../../state/library.svelte';
  import { reader } from '../../state/reader.svelte';
  import { COLOURS } from '../reader/colours';
  import EmptyState from '../ui/EmptyState.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { onclose }: { onclose: () => void } = $props();
  let marks = $state.raw<Mark[]>([]);
  let loaded = $state(false);
  let colour = $state<HighlightColour | ''>('');
  let query = $state('');

  $effect(() => {
    void db.marks.toArray().then((all) => {
      marks = all.filter((m) => m.kind === 'highlight').sort((a, b) => b.createdAt - a.createdAt);
      loaded = true;
    });
  });

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return marks.filter((m) => (!colour || m.colour === colour) && (!q || `${m.text} ${m.note} ${library.get(m.docId)?.title ?? ''}`.toLowerCase().includes(q)));
  });

  async function go(m: Mark) {
    onclose();
    const doc = library.get(m.docId);
    await reader.openAt(m.docId, { section: m.section, offset: doc?.format === 'pdf' ? 0 : m.start }, { start: m.start, end: m.end });
  }
</script>

<Sheet title={t('notes.title')} {onclose}>
  {#if loaded && !marks.length}
    <EmptyState icon="highlighter" title={t('notes.emptyTitle')} text={t('notes.emptyText')} />
  {:else}
    <div class="notes-tools">
      <label class="filter-field">
        <span class="visually-hidden">{t('notes.search')}</span>
        <Icon name="search" />
        <input class="input" type="search" id="notesSearch" placeholder={t('notes.search')} enterkeyhint="search" autocomplete="off" bind:value={query} />
      </label>
      <div class="chip-row" role="radiogroup" aria-label={t('mark.colour')}>
        <button type="button" class="chip" role="radio" aria-checked={colour === ''} onclick={() => (colour = '')}>{t('notes.all')}</button>
        {#each COLOURS as c (c.id)}
          <button type="button" class="chip" role="radio" aria-checked={colour === c.id} onclick={() => (colour = c.id)}><span class="hl-dot hl-{c.id}" aria-hidden="true"></span>{t(`colour.${c.id}`)}</button>
        {/each}
      </div>
    </div>
    {#if shown.length}
      <ul class="row-list" id="allNotes">
        {#each shown as m (m.id)}
          {@const doc = library.get(m.docId)}
          <li class="row-with-action">
            <button type="button" class="row highlight-row" onclick={() => void go(m)}>
              <span class="hl-bar hl-{m.colour}" aria-hidden="true"></span>
              <span class="row-main">
                <span class="row-quote ellipsis-3">{m.text}</span>
                {#if m.note}<span class="row-note">{m.note}</span>{/if}
                <span class="t-data-small faint">{doc?.title ?? t('notes.removedDoc')}{m.where ? ` · ${m.where}` : ''} · {relativeDay(m.createdAt)}</span>
              </span>
            </button>
            {#if doc}<button type="button" class="btn-icon" aria-label={t('mark.share')} onclick={() => void shareQuote(m, doc)}><Icon name="share-2" /></button>{/if}
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty-match">
        <p class="t-hint">{t('library.noMatch')}</p>
        <button
          type="button"
          class="btn btn-muted"
          onclick={() => {
            query = '';
            colour = '';
          }}>{t('library.clearFilter')}</button
        >
      </div>
    {/if}
  {/if}
</Sheet>
