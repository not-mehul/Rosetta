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

<style>
  .opening-book {
    --book-w: 104px;
    position: relative;
    width: var(--book-w);
    aspect-ratio: 2 / 3;
    perspective: 900px;
  }
  .opening-back,
  .opening-leaf,
  .opening-cover {
    position: absolute;
    inset: 0;
    border-radius: 2px var(--corner-sm) var(--corner-sm) 2px;
    transform-origin: left center;
    backface-visibility: hidden;
  }
  .opening-back {
    background: var(--modal-bg);
    border: 1px solid var(--border);
    box-shadow: 0 12px 32px rgba(var(--shadow-rgb), calc(0.35 * var(--shadow-strength)));
  }
  .opening-leaf {
    inset: 3px 3px 3px 0;
    background: linear-gradient(90deg, rgba(var(--shadow-rgb), 0.12), transparent 18%), var(--modal-bg);
    border: 1px solid var(--border-faint);
    backface-visibility: visible;
  }
  .opening-back::before,
  .opening-leaf::before {
    /* A few ruled lines: a page of text, seen from across the room. */
    content: '';
    position: absolute;
    inset: 22% 16% 22% 16%;
    background: repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px 9px);
    opacity: 0.8;
  }
  .opening-cover {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    overflow: hidden;
    background: var(--modal-bg);
    border: 1px solid var(--border);
  }
  .opening-cover :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .opening-initial {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 2.75rem;
    line-height: 1;
    color: var(--accent-amber);
  }
  .opening-rule {
    width: 1.5rem;
    height: 1px;
    background: var(--accent-amber);
  }
  .opening-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    max-width: 22rem;
  }
  .opening-title {
    margin: 0;
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 1.5rem;
    line-height: 1.25;
    color: var(--text-heading);
  }
  @media (prefers-reduced-motion: no-preference) {
    /* The book slides right as it opens, so the open spread stays centred. */
    .opening-book {
      animation: opening-centre 2.8s var(--ease-settle) infinite;
    }
    .opening-cover {
      animation: opening-cover 2.8s var(--ease-settle) infinite;
    }
    .opening-leaf {
      animation: opening-leaf 2.8s var(--ease-settle) infinite;
    }
    .opening-leaf.leaf-1 {
      animation-delay: 0.18s;
    }
    .opening-leaf.leaf-2 {
      animation-delay: 0.36s;
    }
    .opening-leaf.leaf-3 {
      animation-delay: 0.54s;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .opening-book {
      animation: opening-breathe 2.4s ease-in-out infinite;
    }
  }
</style>
