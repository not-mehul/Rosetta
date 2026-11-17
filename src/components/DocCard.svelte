<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '../i18n/index.svelte';
  // A document in the library's list (style.md §7.2): cover, serif title, the
  // author, the series when there is one, and one trailing figure.
  import { relativeDay } from '../lib/format';
  import type { StoredDoc } from '../state/db';
  import { docStatus } from '../state/library.svelte';
  import { reader } from '../state/reader.svelte';
  import { ui } from '../state/ui.svelte';
  import Cover from './ui/Cover.svelte';
  import Icon from './ui/Icon.svelte';
  import StatusMark from './ui/StatusMark.svelte';

  let { doc }: { doc: StoredDoc } = $props();

  const status = $derived(docStatus(doc));
  /** Added a moment ago: it pops onto the shelf (motion.css, shelf-pop). */
  const isNew = untrack(() => Date.now() - doc.addedAt < 4000);

  function details() {
    ui.detailsId = doc.id;
    ui.open('details');
  }
</script>

<div class="doc-card dd-lift" class:is-new={isNew}>
  <button type="button" class="doc-open dd-pressable" data-doc={doc.id} onclick={() => void reader.open(doc.id)}>
    <span class="doc-thumb" aria-hidden="true">
      <Cover {doc} small />
      <StatusMark {status} />
    </span>
    <span class="doc-text">
      <span class="t-card-title doc-title ellipsis-2">{doc.title}</span><span class="visually-hidden">, {t(`status.${status}`)}</span>
      {#if doc.author}<span class="doc-author ellipsis">{doc.author}</span>{/if}
      {#if doc.series || doc.offloaded}
        <span class="t-data-small faint">{[doc.series ? `${doc.series}${doc.seriesIndex !== null ? ` ${doc.seriesIndex}` : ''}` : '', doc.offloaded ? t('details.offloadedShort') : ''].filter(Boolean).join(' · ')}</span>
      {/if}
      {#if status === 'reading'}
        <span class="doc-meter meter" aria-hidden="true"><span class="meter-fill" style:transform="scaleX({doc.progress})"></span></span>
      {/if}
    </span>
    <span class="doc-figure">
      {#if status === 'finished'}
        <span class="t-data-small sage doc-when">{relativeDay(doc.finishedAt!)}</span>
      {:else if status === 'reading'}
        <span class="t-data amber tabular">{Math.floor(doc.progress * 100)}%</span>
        <span class="t-data-small faint doc-when">{relativeDay(doc.openedAt!)}</span>
      {/if}
    </span>
  </button>
  <button type="button" class="btn-icon doc-more" aria-label={t('library.detailsFor', { title: doc.title })} onclick={details}><Icon name="ellipsis-vertical" /></button>
</div>

<style>
  .doc-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .doc-title {
    font-size: 1.125rem;
  }
  .doc-meter {
    margin-top: var(--space-2);
    max-width: 10rem;
  }
  .doc-figure {
    /* The status sits on the same line as the menu beside it, centred on the card. */
    flex-shrink: 0;
    align-self: center;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  /* When a card was last read or finished, under its figure. */
  .doc-figure {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .doc-when {
    white-space: nowrap;
  }
</style>
