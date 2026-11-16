<script lang="ts">
  // A book's cover: its own picture, or one drawn for it from tokens (a flat
  // tint, a spine, the title in serif and the author in mono caps; see
  // lib/cover.ts). Small covers (a list row, Continue reading) show the
  // title's first letter instead of words too small to read. It fills
  // whatever frame it sits in, at 2:3.
  import { FORMAT_LABEL } from '../../formats/types';
  import { coverInitial, coverTint } from '../../lib/cover';
  import type { StoredDoc } from '../../state/db';
  import BlobImg from './BlobImg.svelte';

  interface Props {
    doc: Pick<StoredDoc, 'id' | 'title' | 'author' | 'cover' | 'format'>;
    /** Too small for words: the initial instead. */
    small?: boolean;
  }

  let { doc, small = false }: Props = $props();
</script>

{#if doc.cover}
  <BlobImg bytes={doc.cover} alt="" />
{:else}
  <span class="cover-art tint-{coverTint(doc.id)}" class:small aria-hidden="true">
    <span class="cover-spine"></span>
    <span class="cover-body">
      {#if small}
        <span class="cover-initial">{coverInitial(doc.title)}</span>
      {:else}
        <span class="cover-title">{doc.title}</span>
        <span class="cover-foot">
          <span class="cover-rule"></span>
          <span class="cover-author">{doc.author || FORMAT_LABEL[doc.format]}</span>
        </span>
      {/if}
    </span>
  </span>
{/if}
