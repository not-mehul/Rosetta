<script lang="ts">
  // While a document opens: its cover swings open on its spine and a few
  // leaves turn after it, over and over, until the first page is ready. With
  // reduce motion on, the closed book breathes instead.
  import type { StoredDoc } from '../../state/db';
  import { t } from '../../i18n/index.svelte';
  import BlobImg from '../ui/BlobImg.svelte';

  let { doc }: { doc: StoredDoc } = $props();
  /** The cover's lettering when the file has no cover picture. */
  const initial = $derived([...doc.title.trim()][0]?.toUpperCase() ?? '');
</script>

<div class="opening" role="status" aria-label={t('reader.opening', { title: doc.title })}>
  <div class="opening-book" aria-hidden="true">
    <div class="opening-back"></div>
    <div class="opening-leaf leaf-1"></div>
    <div class="opening-leaf leaf-2"></div>
    <div class="opening-leaf leaf-3"></div>
    <div class="opening-cover" class:plain={!doc.cover}>
      {#if doc.cover}
        <BlobImg bytes={doc.cover} alt="" />
      {:else}
        <span class="opening-initial">{initial}</span>
        <span class="opening-rule"></span>
      {/if}
    </div>
  </div>
  <div class="opening-text" aria-hidden="true">
    <p class="t-section-label">{t('reader.openingLabel')}</p>
    <p class="opening-title ellipsis-2">{doc.title}</p>
    {#if doc.author}<p class="t-hint">{doc.author}</p>{/if}
  </div>
</div>
