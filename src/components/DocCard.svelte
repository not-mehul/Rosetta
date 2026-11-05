<script lang="ts">
  // A document in the library (style.md §7.2): cover, serif title, a mono line,
  // and one trailing figure, the share read.
  import { FORMAT_LABEL } from '../formats/types';
  import { fileSize } from '../lib/format';
  import type { StoredDoc } from '../state/db';
  import { reader } from '../state/reader.svelte';
  import { ui } from '../state/ui.svelte';
  import BlobImg from './ui/BlobImg.svelte';
  import Icon from './ui/Icon.svelte';
  import type { IconName } from './ui/icons';

  let { doc }: { doc: StoredDoc } = $props();

  const ICON: Record<StoredDoc['format'], IconName> = { epub: 'book-open', pdf: 'file-text', docx: 'file-type', md: 'file-code', txt: 'file', html: 'globe' };
  const status = $derived(doc.finishedAt ? 'finished' : doc.openedAt ? 'reading' : 'new');

  function details() {
    ui.detailsId = doc.id;
    ui.open('details');
  }
</script>

<div class="doc-card">
  <button type="button" class="doc-open" data-doc={doc.id} aria-label="{doc.title}{doc.author ? `, ${doc.author}` : ''}" onclick={() => void reader.open(doc.id)}>
    <span class="doc-thumb" aria-hidden="true">
      {#if doc.cover}<BlobImg bytes={doc.cover} alt="" />{:else}<Icon name={ICON[doc.format]} />{/if}
    </span>
    <span class="doc-text">
      <span class="t-card-title doc-title ellipsis-2">{doc.title}</span>
      {#if doc.author}<span class="doc-author ellipsis">{doc.author}</span>{/if}
      <span class="t-data-small faint">{FORMAT_LABEL[doc.format]} · {fileSize(doc.size)}</span>
      {#if status === 'reading'}
        <span class="doc-meter meter" aria-hidden="true"><span class="meter-fill" style:transform="scaleX({doc.progress})"></span></span>
      {/if}
    </span>
    <span class="doc-figure">
      {#if status === 'finished'}
        <span class="chip-status is-done">Finished</span>
      {:else if status === 'reading'}
        <span class="t-data amber tabular">{Math.floor(doc.progress * 100)}%</span>
      {:else}
        <span class="chip-status">New</span>
      {/if}
    </span>
  </button>
  <button type="button" class="btn-icon doc-more" aria-label="Details for {doc.title}" onclick={details}><Icon name="ellipsis-vertical" /></button>
</div>
