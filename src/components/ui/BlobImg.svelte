<script lang="ts">
  // An <img> for bytes in memory; the object URL is revoked when it changes.
  import { blobUrl } from '../../lib/format';

  interface Props {
    bytes: Uint8Array | null | undefined;
    type?: string;
    alt: string;
    class?: string;
  }

  let { bytes, type = 'image/jpeg', alt, class: className = '' }: Props = $props();
  const src = $derived(blobUrl(bytes, type));
  $effect(() => {
    const url = src;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });
</script>

{#if src}<img {src} {alt} class={className} decoding="async" />{/if}
