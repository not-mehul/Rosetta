<script lang="ts">
  // How far along a document is, as a small mark on its cover: not opened
  // (a dashed ring in the dim text colour), being read (an open book on
  // amber) or finished (a tick on sage). Its name is in the document's button for
  // screen readers, so the mark itself is drawn only.
  import { playIcon } from '../../lib/iconMotion';
  import type { DocStatus } from '../../state/library.svelte';
  import Icon from './Icon.svelte';

  let { status }: { status: DocStatus } = $props();

  // A change of state plays the new mark's motion (the tick writes itself, the
  // book opens), once, when it happens: not each time the library opens.
  let mark = $state<HTMLElement>();
  let was: DocStatus | undefined;
  $effect(() => {
    const now = status;
    if (was !== undefined && was !== now) requestAnimationFrame(() => playIcon(mark?.querySelector('svg[data-icon]')));
    was = now;
  });
</script>

<span class="status-mark is-{status}" data-status={status} aria-hidden="true" bind:this={mark}>
  {#if status === 'reading'}<Icon name="book-open" />{:else if status === 'finished'}<Icon name="check" />{/if}
</span>

<style>
  .status-mark {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--corner-full);
    background: currentColor;
    border: 1.5px solid currentColor;
    box-shadow: 0 2px 6px rgba(var(--shadow-rgb), calc(0.35 * var(--shadow-strength)));
  }
  .status-mark :global(svg) {
    width: 14px;
    height: 14px;
    stroke-width: 2.25;
    color: var(--modal-bg);
  }
  /* Not opened: a dashed ring in the heading colour, so it reads on a dark
     cover in Dusk and a pale one in Dawn alike. */
  .is-unread {
    color: var(--text-heading);
    background: var(--modal-bg);
    border-style: dashed;
    border-width: 1.75px;
  }
  .is-reading {
    color: var(--accent-amber);
  }
  .is-finished {
    color: var(--accent-sage);
  }
  /* The list's small covers take a smaller mark. */
  :global(.doc-card:not(.doc-tile)) .status-mark {
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
  }
  :global(.doc-card:not(.doc-tile)) .status-mark :global(svg) {
    width: 12px;
    height: 12px;
  }
</style>
