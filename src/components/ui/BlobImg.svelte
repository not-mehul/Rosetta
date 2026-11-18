<script lang="ts">
  // An <img> for bytes in memory. The object URL is made once the picture
  // comes near the screen (a long shelf makes only the ones it shows), and
  // revoked when the bytes change or the picture goes.
  import { blobUrl } from '../../lib/format';
  import { near } from '../../lib/near';

  let { bytes, alt }: { bytes: Uint8Array | null | undefined; alt: string } = $props();
  let shown = $state(false);
  const src = $derived(shown ? blobUrl(bytes) : null);
  $effect(() => {
    const url = src;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });
</script>

{#if bytes?.length}<img src={src ?? undefined} {alt} decoding="async" use:near={() => (shown = true)} />{/if}
