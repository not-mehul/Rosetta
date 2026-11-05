<script lang="ts">
  // style.md §8.15: a 4px bar. It fills on first appearance only (§11); after
  // that, changes snap, so editing doesn't make the ledger dance.
  import { onFirstView } from '../../lib/appear';

  interface Props {
    value: number;
    max: number;
    /** Keeps the first-appearance memory across remounts. */
    key: string;
    label?: string;
  }

  let { value, max, key, label }: Props = $props();
  let node: HTMLDivElement;
  let shown = $state(false);
  let animate = $state(false);
  const fraction = $derived(max > 0 ? Math.max(0, Math.min(1, value / max)) : 0);

  $effect(() => {
    return onFirstView(node, `meter:${key}`, (first) => {
      animate = first;
      shown = true;
    });
  });
</script>

<div
  class="meter"
  bind:this={node}
  role="meter"
  aria-valuemin={0}
  aria-valuemax={max}
  aria-valuenow={value}
  aria-label={label}
>
  <div
    class="meter-fill"
    class:is-complete={fraction >= 1}
    class:animate
    style:transform="scaleX({shown ? fraction : 0})"
  ></div>
</div>

<style>
  .meter-fill.animate {
    transition: transform var(--dur-settle) var(--ease-settle);
  }
</style>
