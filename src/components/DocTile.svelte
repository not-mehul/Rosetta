<script lang="ts">
  import { untrack } from 'svelte';
  // A document in the cover grid (style.md §7.2, a card with a picture): the
  // cover (its own, or one drawn for it), a thin meter while it's being read,
  // the serif title, the author, and one figure. The menu opens its details.
  import { t } from '../i18n/index.svelte';
  import { relativeDay } from '../lib/format';
  import type { StoredDoc } from '../state/db';
  import { docStatus } from '../state/library.svelte';
  import { reader } from '../state/reader.svelte';
  import { hold } from '../lib/hold';
  import { selection } from '../state/selection.svelte';
  import { ui } from '../state/ui.svelte';
  import Cover from './ui/Cover.svelte';
  import Icon from './ui/Icon.svelte';
  import StatusMark from './ui/StatusMark.svelte';

  let { doc }: { doc: StoredDoc } = $props();
  const status = $derived(docStatus(doc));
  /** Added a moment ago: it pops onto the shelf (motion.css, shelf-pop). */
  const isNew = untrack(() => Date.now() - doc.addedAt < 4000);

  const chosen = $derived(selection.has(doc.id));

  /** A tap opens the book, or, while choosing several, chooses it. */
  function tap() {
    if (selection.active) selection.toggle(doc.id);
    else void reader.open(doc.id);
  }

  function details() {
    ui.detailsId = doc.id;
    ui.open('details');
  }
</script>

<div class="doc-card doc-tile dd-lift" class:is-new={isNew} class:is-chosen={chosen}>
  <button type="button" class="doc-open dd-pressable" data-doc={doc.id} aria-pressed={selection.active ? chosen : undefined} use:hold={() => selection.toggle(doc.id)} onclick={tap}>
    <span class="doc-thumb tile-cover" aria-hidden="true"><Cover {doc} /><StatusMark {status} />{#if selection.active}<span class="doc-check" class:is-on={chosen}><Icon name="check" /></span>{/if}</span>
    {#if status === 'reading'}
      <span class="meter tile-meter" aria-hidden="true"><span class="meter-fill" style:transform="scaleX({doc.progress})"></span></span>
    {/if}
    <span class="tile-text">
      <span class="tile-title ellipsis-2">{doc.title}</span><span class="visually-hidden">, {t(`status.${status}`)}</span>
      {#if doc.author}<span class="doc-author ellipsis">{doc.author}</span>{/if}
      {#if status === 'reading'}
        <span class="t-data-small tabular"><span class="amber">{Math.floor(doc.progress * 100)}%</span> <span class="faint">· {relativeDay(doc.openedAt!)}</span></span>
      {:else if doc.series}
        <span class="t-data-small faint ellipsis">{doc.series}{doc.seriesIndex !== null ? ` ${doc.seriesIndex}` : ''}</span>
      {/if}
      {#if doc.offloaded}<span class="t-data-small faint">{t('details.offloadedShort')}</span>{/if}
    </span>
  </button>
  {#if !selection.active}<button type="button" class="btn-icon doc-more" aria-label={t('library.detailsFor', { title: doc.title })} onclick={details}><Icon name="ellipsis-vertical" /></button>{/if}
</div>

<style>
  .tile-meter {
    height: 3px;
  }
  .tile-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    min-width: 0;
  }
  .tile-title {
    font-family: var(--font-serif);
    font-size: 1rem;
    line-height: 1.25;
    letter-spacing: -0.01em;
    color: var(--text-heading);
  }
</style>
