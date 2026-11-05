<script lang="ts">
  // style.md §8.13: an inline banner with an icon, a line and an optional detail.
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  interface Props {
    kind?: 'info' | 'success' | 'error';
    icon?: IconName;
    title: string;
    detail?: string;
    children?: Snippet;
  }

  let { kind = 'info', icon, title, detail, children }: Props = $props();
  const glyph = $derived(icon ?? (kind === 'error' ? 'triangle-alert' : kind === 'success' ? 'circle-check' : 'info'));
</script>

<div class="notice" class:is-error={kind === 'error'} class:is-success={kind === 'success'} role={kind === 'error' ? 'alert' : undefined}>
  <Icon name={glyph} />
  <div class="notice-text">
    <p class="notice-title">{title}</p>
    {#if detail}<p class="notice-detail">{detail}</p>{/if}
    {#if children}{@render children()}{/if}
  </div>
</div>
