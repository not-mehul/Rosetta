<script lang="ts">
  // style.md §9: Lucide, inlined, stroke in currentColor. Sized by the parent's CSS.
  import { ICONS, type IconName } from './icons';

  let { name, label }: { name: IconName; label?: string } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  <!-- Trusted, inlined Lucide markup (icons.ts), never external data. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html ICONS[name]}
</svg>
