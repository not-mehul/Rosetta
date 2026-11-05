<script lang="ts">
  // style.md §8.14, "Nothing here yet".
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  interface Props {
    icon: IconName;
    title: string;
    text: string;
    children?: Snippet;
  }

  let { icon, title, text, children }: Props = $props();
</script>

<div class="empty-state">
  <Icon name={icon} />
  <p class="empty-title">{title}</p>
  <p class="empty-text">{text}</p>
  {#if children}<div class="empty-actions">{@render children()}</div>{/if}
</div>
