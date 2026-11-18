<script module lang="ts">
  /* eslint-disable @typescript-eslint/no-explicit-any -- a part takes whatever props its component does. */
  import type { Component } from 'svelte';

  export type Loader = () => Promise<Component<any>>;

  /** What each loader gave, so a part shown once shows at once after that. Not
      reactive: each Lazy counts its own arrival. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const loaded = new Map<Loader, Component<any>>();

  /** A part of the app loaded the first time it's needed (src/components/parts.ts). */
  export function part(load: () => Promise<{ default: Component<any> }>): Loader {
    let pending: Promise<Component<any>> | undefined;
    const loader: Loader = () =>
      (pending ??= load().then((m) => {
        loaded.set(loader, m.default);
        return m.default;
      }));
    return loader;
  }
</script>

<script lang="ts">
  // Shows a part of the app that isn't in the first download (the reader, the
  // sheets, Notes and Stats), loading it the first time it's needed; the
  // props pass straight through.
  let { load, ...props }: { load: Loader } & Record<string, unknown> = $props();
  let arrived = $state(0);
  const Part = $derived(arrived >= 0 ? loaded.get(load) : undefined);
  $effect(() => {
    const l = load;
    if (!loaded.has(l)) void l().then(() => arrived++);
  });
</script>

{#if Part}<Part {...props} />{/if}
