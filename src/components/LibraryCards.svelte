<script lang="ts">
  // Two quiet cards for the top of the library: last week's reading, the
  // first time the library opens in a new week (until put away), and, when
  // nothing is in progress, a line from the reader's own highlights, the same
  // one all day.
  import { t } from '../i18n/index.svelte';
  import { lineOfTheDay } from '../lib/export';
  import { dayKey } from '../lib/calendar';
  import { duration } from '../lib/format';
  import { db, type Mark } from '../state/db';
  import { library } from '../state/library.svelte';
  import { reader } from '../state/reader.svelte';
  import { settings } from '../state/settings.svelte';
  import { lastWeek, type Recap } from '../state/stats.svelte';
  import Icon from './ui/Icon.svelte';

  let { quiet }: { quiet: boolean } = $props();

  let recap = $state.raw<Recap | null>(null);
  let line = $state.raw<Mark | null>(null);

  $effect(() => {
    const seen = settings.value.recapSeen;
    const finishedAt = library.items.map((d) => d.finishedAt);
    void db.sessions
      .toArray()
      .then((rows) => {
        const r = lastWeek(rows, finishedAt);
        recap = r && r.week !== seen ? r : null;
      })
      .catch(() => (recap = null));
  });

  $effect(() => {
    if (!quiet) {
      line = null;
      return;
    }
    const ids = new Set(library.items.map((d) => d.id));
    void db.marks
      .where('docId')
      .anyOf([...ids])
      .toArray()
      .then((all) => (line = lineOfTheDay(all.filter((m) => m.kind === 'highlight' && m.text.trim().length > 12), dayKey())))
      .catch(() => (line = null));
  });

  const top = $derived(recap?.topDocId ? library.get(recap.topDocId) : undefined);
  const lineDoc = $derived(line ? library.get(line.docId) : undefined);
  const putAway = () => recap && void settings.update({ recapSeen: recap.week });
  const goToLine = () => line && void reader.openAt(line.docId, { section: line.section, offset: lineDoc?.format === 'pdf' ? 0 : line.start }, { start: line.start, end: line.end });
</script>

{#if recap}
  <section class="library-card panel" id="weekRecap" aria-labelledby="recapHead">
    <div class="library-card-head">
      <p class="t-section-label" id="recapHead">{t('recap.title')}</p>
      <button type="button" class="btn-icon" id="recapDone" aria-label={t('recap.done')} onclick={putAway}><Icon name="x" /></button>
    </div>
    <p class="recap-figure">{duration(recap.ms)} <span class="dim">{t('recap.overDays', { days: t('stats.days', { count: recap.days }) })}</span></p>
    <p class="t-data-small dim">
      {#if recap.finished}{t('recap.finished', { count: recap.finished })}{/if}
      {#if top}{recap.finished ? ' · ' : ''}{t('recap.most', { title: top.title })}{/if}
    </p>
  </section>
{/if}

{#if line && lineDoc}
  <section class="library-card panel" id="lineOfDay" aria-labelledby="lineHead">
    <p class="t-section-label" id="lineHead">{t('library.line')}</p>
    <button type="button" class="line-body" onclick={goToLine}>
      <span class="line-quote" data-colour={line.colour}>{line.text}</span>
      <span class="t-data-small faint ellipsis">{lineDoc.title}{line.where ? ` · ${line.where}` : ''}</span>
    </button>
  </section>
{/if}

<style>
  .library-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    padding: var(--space-4);
  }
  .library-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) 0 0;
  }
  .library-card .t-section-label {
    margin: 0;
  }
  .recap-figure {
    margin: 0;
    font-family: var(--font-serif);
    font-size: 1.5rem;
    color: var(--text-heading);
  }
  .recap-figure .dim {
    font-size: 1rem;
  }
  .line-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .line-quote {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    padding-left: var(--space-3);
    border-left: 3px solid var(--hl-colour, var(--accent-amber));
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 1.0625rem;
    line-height: 1.5;
    color: var(--text-heading);
  }
  .line-quote[data-colour='sage'] {
    --hl-colour: var(--accent-sage);
  }
  .line-quote[data-colour='bright'] {
    --hl-colour: var(--accent-bright);
  }
</style>
