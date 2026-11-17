<script lang="ts">
  // A catalog book's cover: fetched only when its row scrolls into view, with
  // the catalog's own sign-in, and let go when the row goes. Until then (or
  // without one) it is drawn like any other book's.
  import { onMount } from 'svelte';
  import { fetchBytes, type Catalog } from '../../lib/opds';
  import Cover from '../ui/Cover.svelte';

  let { url, catalog, id, title, author }: { url: string | null; catalog: Catalog; id: string; title: string; author: string } = $props();

  let el = $state<HTMLElement>();
  let src = $state<string | null>(null);

  onMount(() => {
    if (!url || !el) return;
    let gone = false;
    let made: string | null = null;
    const load = async () => {
      try {
        const bytes = await fetchBytes(url, catalog);
        if (gone || !bytes.length) return;
        made = URL.createObjectURL(new Blob([bytes.slice().buffer]));
        src = made;
      } catch {
        // No cover is fine: the drawn one stays.
      }
    };
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        void load();
      },
      { rootMargin: '200px' },
    );
    seen.observe(el);
    return () => {
      gone = true;
      seen.disconnect();
      if (made) URL.revokeObjectURL(made);
    };
  });
</script>

<span class="catalog-cover" bind:this={el} aria-hidden="true">
  {#if src}
    <img {src} alt="" onerror={() => (src = null)} />
  {:else}
    <Cover doc={{ id, title, author, cover: null, format: 'epub' }} small />
  {/if}
</span>

<style>
  .catalog-cover {
    display: block;
    flex: none;
    width: 3.25rem;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: var(--corner-sm);
    background: var(--panel-bg-faint);
    box-shadow: 0 4px 12px rgba(var(--shadow-rgb), calc(0.3 * var(--shadow-strength)));
  }
  .catalog-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
</style>
