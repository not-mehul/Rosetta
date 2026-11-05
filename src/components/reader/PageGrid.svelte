<script lang="ts">
  // A PDF's pages as small pictures, drawn as they scroll into view: the way
  // around a scan that has no contents.
  import { onMount } from 'svelte';
  import type { PdfDoc } from '../../formats/types';
  import { t } from '../../i18n/index.svelte';

  let { content, current, onpick }: { content: PdfDoc; current: number; onpick: (page: number) => void } = $props();
  const WIDTH = 104;
  let grid: HTMLUListElement;

  onMount(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const canvas = e.target as HTMLCanvasElement;
          io.unobserve(canvas);
          void content.renderThumb(Number(canvas.dataset.page), canvas, WIDTH).catch(() => undefined);
        }
      },
      { rootMargin: '200px 0px' },
    );
    for (const c of grid.querySelectorAll('canvas')) io.observe(c);
    grid.querySelector('.current')?.scrollIntoView({ block: 'center' });
    return () => io.disconnect();
  });
</script>

<ul class="page-grid" bind:this={grid}>
  {#each content.sizes as size, i (i)}
    <li>
      <button type="button" class="page-thumb" class:current={i === current} aria-label={t('reader.page', { page: i + 1 })} aria-current={i === current ? 'page' : undefined} onclick={() => onpick(i)}>
        <canvas data-page={i} style:aspect-ratio="{size.width} / {size.height}"></canvas>
        <span class="t-data-small tabular">{i + 1}</span>
      </button>
    </li>
  {/each}
</ul>
