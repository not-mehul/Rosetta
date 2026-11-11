<script lang="ts">
  import { t } from '../i18n/index.svelte';
  // A document in the library (style.md §7.2): cover, serif title, a mono line,
  // and one trailing figure, the share read.
  import { FORMAT_LABEL } from '../formats/types';
  import { fileSize, relativeDay } from '../lib/format';
  import type { StoredDoc } from '../state/db';
  import { reader } from '../state/reader.svelte';
  import { ui } from '../state/ui.svelte';
  import BlobImg from './ui/BlobImg.svelte';
  import Icon from './ui/Icon.svelte';
  import type { IconName } from './ui/icons';

  let { doc }: { doc: StoredDoc } = $props();

  const ICON: Record<StoredDoc['format'], IconName> = { epub: 'book-open', pdf: 'file-text', docx: 'file-type', md: 'file-code', txt: 'file', html: 'globe', fb2: 'book-open', cbz: 'image', rtf: 'file-type', odt: 'file-type' };
  const status = $derived(doc.finishedAt ? 'finished' : doc.openedAt ? 'reading' : 'new');

  function details() {
    ui.detailsId = doc.id;
    ui.open('details');
  }
</script>

<div class="doc-card dd-lift">
  <button type="button" class="doc-open dd-pressable" data-doc={doc.id} onclick={() => void reader.open(doc.id)}>
    <span class="doc-thumb" aria-hidden="true">
      {#if doc.cover}<BlobImg bytes={doc.cover} alt="" />{:else}<Icon name={ICON[doc.format]} />{/if}
    </span>
    <span class="doc-text">
      <span class="t-card-title doc-title ellipsis-2">{doc.title}</span>
      {#if doc.author}<span class="doc-author ellipsis">{doc.author}</span>{/if}
      <span class="t-data-small faint">{doc.series ? `${doc.series}${doc.seriesIndex !== null ? ` ${doc.seriesIndex}` : ''} · ` : ''}{FORMAT_LABEL[doc.format]} · {doc.offloaded ? t('details.offloadedShort') : fileSize(doc.size)}</span>
      {#if status === 'reading'}
        <span class="doc-meter meter" aria-hidden="true"><span class="meter-fill" style:transform="scaleX({doc.progress})"></span></span>
      {/if}
    </span>
    <span class="doc-figure">
      {#if status === 'finished'}
        <span class="chip-status is-done">{t('library.finishedChip')}</span>
        <span class="t-data-small faint doc-when">{relativeDay(doc.finishedAt!)}</span>
      {:else if status === 'reading'}
        <span class="t-data amber tabular">{Math.floor(doc.progress * 100)}%</span>
        <span class="t-data-small faint doc-when">{relativeDay(doc.openedAt!)}</span>
      {:else}
        <span class="chip-status">{t('library.new')}</span>
      {/if}
    </span>
  </button>
  <button type="button" class="btn-icon doc-more" aria-label={t('library.detailsFor', { title: doc.title })} onclick={details}><Icon name="ellipsis-vertical" /></button>
</div>
