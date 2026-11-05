<script lang="ts">
  // A fixed-layout EPUB (picture books, comics, cookbooks): each page as the
  // publisher drew it, with its own CSS inside a shadow root so it can't
  // touch the app, scaled to fit the screen. Pages turn like paged mode.
  import { onMount } from 'svelte';
  import type { FlowDoc } from '../../formats/types';
  import { t } from '../../i18n/index.svelte';
  import { reader } from '../../state/reader.svelte';
  import { settings } from '../../state/settings.svelte';

  let { content }: { content: FlowDoc } = $props();
  const pages = $derived(content.fixed!);
  const index = $derived(reader.section);
  const rtl = $derived(content.dir === 'rtl');
  let host = $state<HTMLDivElement>();
  let box = $state<HTMLDivElement>();
  let size = $state({ w: 360, h: 640 });
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let sliding = $state(0);

  const pageSize = $derived(pages[index] ?? { width: 1200, height: 1600 });
  const scale = $derived(Math.min(size.w / pageSize.width, size.h / pageSize.height));

  $effect(() => {
    const page = pages[index];
    if (!host || !page) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    // The page's own markup and CSS, already sanitised and scoped to .fx (styles.ts).
    shadow.innerHTML = `<style>:host{display:block}.fx{position:relative;overflow:hidden;width:${page.width}px;height:${page.height}px;background:var(--sheet-bg)}.fx img{max-width:none}${page.css}</style><div class="fx">${page.html}</div>`;
    reader.report({ section: index, offset: 0 }, content.sections[index]?.text.length ?? 0);
    if (reader.jump) reader.jump = null;
  });

  function turn(dir: 1 | -1) {
    const to = index + dir;
    if (to < 0 || to >= pages.length) return;
    if (!reduceMotion && settings.value.pageTurn !== 'none') {
      sliding = dir;
      setTimeout(() => (sliding = 0), 180);
    }
    reader.goTo({ section: to, offset: 0 });
  }

  function onclick(e: MouseEvent) {
    const r = box!.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.3 || x > 0.7) {
      turn((x > 0.7) !== rtl ? 1 : -1);
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
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) turn(rtl ? -1 : 1);
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) turn(rtl ? 1 : -1);
    else return;
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
    role="img"
    aria-label={t('reader.pageOf', { page: index + 1, pages: pages.length })}
    style:width="{pageSize.width}px"
    style:height="{pageSize.height}px"
    style:transform="translate(-50%, -50%) scale({scale})"
  >
    <div bind:this={host}></div>
  </div>
</div>
<p class="t-data-small faint page-number tabular">{t('reader.pageOf', { page: index + 1, pages: pages.length })}</p>
<p class="visually-hidden">{content.sections[index]?.text}</p>
