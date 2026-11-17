<script lang="ts">
  // A fixed-layout EPUB (picture books, comics, cookbooks): each page as the
  // publisher drew it, with its own CSS inside a shadow root so it can't
  // touch the app, scaled to fit the screen. Pages turn like paged mode. On a
  // wide screen held sideways, upright pages show two at a time, as the book
  // lies open: the cover alone, then 1–2, 3–4…
  import { onMount } from 'svelte';
  import type { FlowDoc } from '../../formats/types';
  import { t } from '../../i18n/index.svelte';
  import { keyTurn, tapTurn } from '../../reader/gestures';
  import { spreadAt } from '../../reader/paging';
  import { reader } from '../../state/reader.svelte';
  import { settings } from '../../state/settings.svelte';

  let { content }: { content: FlowDoc } = $props();
  const pages = $derived(content.fixed!);
  const index = $derived(reader.section);
  const rtl = $derived(content.dir === 'rtl');
  let hosts = $state<HTMLDivElement[]>([]);
  let box = $state<HTMLDivElement>();
  let size = $state({ w: 360, h: 640 });
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let sliding = $state(0);

  const pageSize = $derived(pages[index] ?? { width: 1200, height: 1600 });
  /** Two upright pages fit side by side on this screen. */
  const spread = $derived(reader.view.spreads && size.w > size.h * 1.1 && pageSize.height > pageSize.width);
  /** The pages on screen, in reading order. */
  const shown = $derived(spread ? spreadAt(index, pages.length) : [index]);
  /** Left to right on screen: a right-to-left book's first page is on the right. */
  const laidOut = $derived(rtl ? [...shown].reverse() : shown);
  const across = $derived(laidOut.reduce((w, i) => w + (pages[i]?.width ?? pageSize.width), 0));
  const tallest = $derived(Math.max(...shown.map((i) => pages[i]?.height ?? pageSize.height)));
  const scale = $derived(Math.min(size.w / across, size.h / tallest));
  const label = $derived(shown.length > 1 ? t('reader.pagesOf', { first: shown[0]! + 1, last: shown.at(-1)! + 1, pages: pages.length }) : t('reader.pageOf', { page: index + 1, pages: pages.length }));

  $effect(() => {
    const order = laidOut;
    order.forEach((i, slot) => {
      const page = pages[i];
      const host = hosts[slot];
      if (!host || !page) return;
      const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      // The page's own markup and CSS, already sanitised and scoped to .fx (styles.ts).
      shadow.innerHTML = `<style>:host{display:block}.fx{position:relative;overflow:hidden;width:${page.width}px;height:${page.height}px;background:var(--sheet-bg)}.fx img{max-width:none}${page.css}</style><div class="fx">${page.html}</div>`;
    });
    // The place is the last page on screen, so the end of the book is reached on its last spread.
    const last = shown.at(-1)!;
    reader.report({ section: last, offset: 0 }, content.sections[last]?.text.length ?? 0);
    if (reader.jump) reader.jump = null;
  });

  function turn(dir: 1 | -1) {
    const to = dir === 1 ? shown.at(-1)! + 1 : shown[0]! - 1;
    if (to < 0 || to >= pages.length) return;
    if (!reduceMotion && settings.value.pageTurn !== 'none') {
      sliding = dir;
      setTimeout(() => (sliding = 0), 180);
    }
    reader.goTo({ section: spread ? spreadAt(to, pages.length)[0]! : to, offset: 0 });
  }

  function onclick(e: MouseEvent) {
    const r = box!.getBoundingClientRect();
    const dir = tapTurn((e.clientX - r.left) / r.width, rtl);
    if (dir) {
      turn(dir);
      reader.chrome = false;
    } else reader.chrome = !reader.chrome;
  }

  let start: { x: number; y: number; id: number } | null = null;
  function pointerup(e: PointerEvent) {
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = performance.now();
      turn((dx < 0) !== rtl ? 1 : -1);
    }
  }
  let swiped = 0;

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
    const dir = keyTurn(e.key, e.shiftKey, rtl);
    if (!dir) return;
    turn(dir);
    e.preventDefault();
  }

  onMount(() => {
    const resize = new ResizeObserver(() => {
      if (box) size = { w: box.clientWidth, h: box.clientHeight };
    });
    resize.observe(box!);
    reader.turner = turn;
    return () => {
      resize.disconnect();
      if (reader.turner === turn) reader.turner = null;
    };
  });
</script>

<svelte:window {onkeydown} />

<!-- Taps turn pages at the edges and show the bars in the middle. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="pager fixed-pager"
  bind:this={box}
  onclick={(e) => performance.now() - swiped > 400 && onclick(e)}
  onpointerdown={(e) => e.pointerType !== 'mouse' && (start = { x: e.clientX, y: e.clientY, id: e.pointerId })}
  onpointerup={pointerup}
>
  <div
    class="fixed-page"
    class:slide-next={sliding === 1}
    class:slide-prev={sliding === -1}
    class:spread={laidOut.length > 1}
    role="img"
    aria-label={label}
    style:width="{across}px"
    style:height="{tallest}px"
    style:transform="translate(-50%, -50%) scale({scale})"
  >
    {#each laidOut as i, slot (i)}
      <div class="fixed-leaf" style:width="{pages[i]?.width}px" style:height="{pages[i]?.height}px" bind:this={hosts[slot]}></div>
    {/each}
  </div>
</div>
<p class="t-data-small faint page-number tabular">{label}</p>
<p class="visually-hidden">{shown.map((i) => content.sections[i]?.text ?? '').join(' ')}</p>

<style>
  /* ─── Fixed layout and pictures ─────────────────────────────── */

  .fixed-pager {
    touch-action: pan-y;
  }
  .fixed-page {
    position: absolute;
    left: 50%;
    top: 50%;
    transform-origin: center;
    box-shadow: 0 8px 24px rgba(var(--shadow-rgb), calc(0.35 * var(--shadow-strength)));
  }
  .fixed-page {
    display: flex;
    align-items: center;
  }
  /* The fold between two pages: a soft shadow into the gutter. */
  .fixed-page.spread .fixed-leaf:first-child {
    box-shadow: inset -12px 0 16px -12px rgba(var(--shadow-rgb), calc(0.45 * var(--shadow-strength)));
  }
  .fixed-page.slide-next {
    animation: page-in-next var(--spring-spatial-calm-dur) var(--spring-spatial-calm);
  }
  .fixed-page.slide-prev {
    animation: page-in-prev var(--spring-spatial-calm-dur) var(--spring-spatial-calm);
  }

  @media (prefers-reduced-motion: reduce) {
    .fixed-page.slide-next,
    .fixed-page.slide-prev {
      animation: none;
    }
  }
</style>
