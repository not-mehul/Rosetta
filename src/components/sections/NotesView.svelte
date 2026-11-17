<script lang="ts">
  // The Notes section: every highlight in the library in one list: filter by colour, search the
  // words and notes, and go to any of them.
  import { t } from '../../i18n/index.svelte';
  import { relativeDay } from '../../lib/format';
  import { shareQuote } from '../../lib/quote';
  import { allNotesMarkdown } from '../../lib/export';
  import { saveFile } from '../../platform/output';
  import { ui } from '../../state/ui.svelte';
  import { db, type HighlightColour, type Mark } from '../../state/db';
  import { library } from '../../state/library.svelte';
  import { reader } from '../../state/reader.svelte';
  import { COLOURS } from '../reader/colours';
  import EmptyState from '../ui/EmptyState.svelte';
  import Icon from '../ui/Icon.svelte';

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

  /** The notes shown (by colour and search), as one Markdown file. */
  async function exportShown() {
    const ids = new Set(shown.map((m) => m.docId));
    const md = allNotesMarkdown(
      library.items.filter((d) => ids.has(d.id)).map((d) => ({ ...d, note: '' })),
      shown,
    );
    const out = await saveFile({ name: `rosetta-notes-${new Date().toISOString().slice(0, 10)}.md`, data: new TextEncoder().encode(md), mime: 'text/markdown' });
    ui.notify(t('saved.to', { where: out.label }), 'success');
  }

  async function go(m: Mark) {
    const doc = library.get(m.docId);
    await reader.openAt(m.docId, { section: m.section, offset: doc?.format === 'pdf' ? 0 : m.start }, { start: m.start, end: m.end });
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
      <div class="chip-row" role="radiogroup" aria-label={t('mark.colour')}>
        <button type="button" class="chip" role="radio" aria-checked={colour === ''} onclick={() => (colour = '')}>{t('notes.all')}</button>
        {#each COLOURS as c (c.id)}
          <button type="button" class="chip" role="radio" aria-checked={colour === c.id} onclick={() => (colour = c.id)}><span class="hl-dot hl-{c.id}" aria-hidden="true"></span>{t(`colour.${c.id}`)}</button>
        {/each}
      </div>
    </div>
    {#if shown.length}
      <div class="notes-count">
        <span class="t-data-small faint tabular">{t('notes.count', { count: shown.length })}</span>
        <button type="button" class="btn btn-muted" id="exportNotes" onclick={() => void exportShown()}><Icon name="file-down" />{t('notes.export')}</button>
      </div>
      <ul class="row-list dd-stagger" id="allNotes">
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
</div>

<style>
  .hl-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: var(--space-1);
  }
  .notes-tools {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .notes-count {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }
</style>
