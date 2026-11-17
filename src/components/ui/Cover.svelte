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

<style>
  /* A cover drawn for a book without one (lib/cover.ts, style.md §3.3): a flat
     tint of one accent, a spine, the title in serif and the author in mono caps.
     Sized in container units, so it reads the same at any size it's shown. */
  .cover-art {
    --cover-rgb: var(--accent-amber-rgb);
    /* The container: its children measure in cqw against the cover's own width. */
    container-type: inline-size;
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    background: rgba(var(--cover-rgb), 0.16);
    color: var(--text-heading);
    text-align: left;
    overflow: hidden;
  }
  .cover-spine {
    position: absolute;
    inset: 0 auto 0 0;
    width: 8cqw;
    background: rgba(var(--cover-rgb), 0.35);
    border-right: 1px solid rgba(var(--cover-rgb), 0.45);
  }
  .cover-title {
    font-family: var(--font-serif);
    font-size: 12.5cqw;
    line-height: 1.12;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
    hyphens: auto;
    display: -webkit-box;
    -webkit-line-clamp: 5;
    line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .cover-foot {
    display: flex;
    flex-direction: column;
    gap: 4cqw;
  }
  .cover-rule {
    width: 30cqw;
    height: 1px;
    background: rgba(var(--cover-rgb), 0.7);
  }
  .cover-author {
    font-family: var(--font-mono);
    font-size: 5.5cqw;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .cover-initial {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 52cqw;
    line-height: 1;
    color: var(--text-heading);
  }
</style>
