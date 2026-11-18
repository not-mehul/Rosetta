<script lang="ts">
  // An <img> for bytes in memory; the object URL is revoked when it changes.
  import { blobUrl } from '../../lib/format';

  let { bytes, alt }: { bytes: Uint8Array | null | undefined; alt: string } = $props();
  const src = $derived(blobUrl(bytes));
  $effect(() => {
    const url = src;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });
</script>

{#if src}<img {src} {alt} decoding="async" />{/if}
