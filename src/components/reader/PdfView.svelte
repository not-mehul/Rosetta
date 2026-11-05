<script lang="ts">
  // A PDF as a column of pages. Pages near the screen are drawn (canvas plus a
  // text layer for selection, search and highlights); pages far away are let go.
  import { onMount, tick, untrack } from 'svelte';
  import type { PdfDoc } from '../../formats/types';
  import { paint, unpaint, type Paint } from '../../reader/offsets';
  import { watchSelection, type PageSelection } from '../../reader/selection.svelte';
  import type { HighlightColour } from '../../state/db';
  import { reader } from '../../state/reader.svelte';
  import { settings } from '../../state/settings.svelte';
  import { PDF_ZOOM } from '../../state/settings';
  import { t } from '../../i18n/index.svelte';
  import { speech } from '../../state/speech.svelte';
  import { ui } from '../../state/ui.svelte';
  import SelectionBar from './SelectionBar.svelte';

  let { content, onedit }: { content: PdfDoc; onedit: (id: string) => void } = $props();

  const TOP = 72;
  const MAX_COLUMN = 880;
  let column = $state<HTMLDivElement>();
  let columnWidth = $state(360);
  let viewHeight = $state(640);
  const zoom = $derived(settings.value.pdfZoom);
  /** The page width at zoom 1: the column, or small enough that the tallest page fits the screen. */
  const fitted = $derived.by(() => {
    const width = Math.min(columnWidth, MAX_COLUMN);
    if (settings.value.pdfFit !== 'page') return width;
    const tallest = Math.max(...content.sizes.map((s) => s.height / s.width));
    return Math.min(width, Math.floor((viewHeight - TOP - 96) / tallest));
  });
  const pageWidth = $derived(Math.round(fitted * zoom));
  /** A pinch in progress: the pages are scaled by CSS until it ends, then drawn at the new size. */
  let pinchScale = $state(1);
  let pinchOrigin = $state('50% 0');
  let selection = $state<PageSelection | null>(null);
  let flash = $state<{ page: number; start: number; end: number } | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  const pages: HTMLDivElement[] = [];
  /** Pages drawn, at the width they were drawn. */
  // Bookkeeping for drawing, not state the markup reads.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const drawn = new Map<number, number>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const near = new Set<number>();

  function paintsFor(page: number): Paint[] {
    const spoken = speech.current?.section === page ? speech.current : null;
    return [
      ...(spoken ? [{ id: 'tts', start: spoken.start, end: spoken.end, className: 'tts' }] : []),
      ...reader.highlights.filter((h) => h.section === page).map((h) => ({ id: h.id, start: h.start, end: h.end, className: `hl hl-${h.colour}${h.note ? ' has-note' : ''}` })),
      ...(flash?.page === page ? [{ id: 'flash', start: flash.start, end: flash.end, className: 'hl-flash' }] : []),
    ];
  }

  function layerOf(page: number) {
    return pages[page]?.querySelector<HTMLElement>('.textLayer') ?? null;
  }

  function repaint(page: number) {
    const layer = layerOf(page);
    if (!layer || !drawn.has(page)) return;
    unpaint(layer);
    paint(layer, paintsFor(page));
  }

  async function draw(page: number) {
    const el = pages[page];
    if (!el || drawn.get(page) === pageWidth) return;
    drawn.set(page, pageWidth);
    try {
      await content.renderPage(page, el.querySelector('canvas')!, layerOf(page)!, pageWidth);
      repaint(page);
      if (flash?.page === page) layerOf(page)?.querySelector('mark[data-mark="flash"]')?.scrollIntoView({ block: 'center' });
    } catch (err) {
      drawn.delete(page);
      console.warn(`Page ${page + 1} failed to draw:`, err);
    }
  }

  function release(page: number) {
    const el = pages[page];
    if (!el || !drawn.has(page)) return;
    drawn.delete(page);
    const canvas = el.querySelector('canvas')!;
    canvas.width = 0;
    canvas.height = 0;
    layerOf(page)?.replaceChildren();
  }

  // Redraw what's near when the width changes.
  $effect(() => {
    void pageWidth;
    untrack(() => {
      for (const p of near) void draw(p);
      for (const p of [...drawn.keys()]) if (!near.has(p)) release(p);
    });
  });

  // Marks change: repaint drawn pages.
  $effect(() => {
    void reader.highlights;
    void flash;
    void speech.current;
    untrack(() => {
      for (const p of drawn.keys()) repaint(p);
    });
  });

  function arrive() {
    const jump = reader.jump;
    if (!jump) return;
    reader.jump = null;
    const el = pages[jump.to.section];
    if (!el) return;
    scrollTo({ top: Math.max(0, scrollY + el.getBoundingClientRect().top - TOP + (jump.to.offset / 10000) * el.offsetHeight), behavior: 'instant' });
    if (jump.flash) {
      clearTimeout(flashTimer);
      flash = { page: jump.to.section, ...jump.flash };
      flashTimer = setTimeout(() => (flash = null), 2400);
      if (drawn.has(jump.to.section)) layerOf(jump.to.section)?.querySelector('mark[data-mark="flash"]')?.scrollIntoView({ block: 'center' });
    }
  }

  $effect(() => {
    if (reader.jump) void tick().then(arrive);
  });

  let frame = 0;
  function track() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      for (let i = 0; i < pages.length; i++) {
        const r = pages[i]!.getBoundingClientRect();
        if (r.bottom > TOP) {
          const offset = Math.round(Math.max(0, Math.min(1, (TOP - r.top) / r.height)) * 10000);
          reader.report({ section: i, offset }, 0);
          return;
        }
      }
    });
  }

  // Reading aloud moves to the next page: follow it.
  $effect(() => {
    const s = speech.current;
    if (!s) return;
    untrack(() => {
      const el = pages[s.section];
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < TOP || r.top > innerHeight - 96) scrollTo({ top: Math.max(0, scrollY + r.top - TOP), behavior: 'instant' });
    });
  });

  // ─── Pinch and double-tap zoom ─────────────────────────────

  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; cx: number; cy: number } | null = null;
  let lastTap = { t: 0, x: 0, y: 0 };
  const spread = () => {
    const [a, b] = [...touches.values()];
    return a && b ? { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 } : null;
  };

  /** Sets the zoom, keeping the point under (cx, cy) where it is. */
  function zoomTo(next: number, cx: number, cy: number) {
    const z = Math.max(PDF_ZOOM.min, Math.min(PDF_ZOOM.max, Math.round(next * 100) / 100));
    const ratio = z / zoom;
    const docY = scrollY + cy;
    const colX = (column?.scrollLeft ?? 0) + cx - (column?.getBoundingClientRect().left ?? 0);
    void settings.update({ pdfZoom: z });
    void tick().then(() => {
      scrollTo({ top: Math.max(0, docY * ratio - cy), behavior: 'instant' });
      if (column) column.scrollLeft = Math.max(0, colX * ratio - (cx - column.getBoundingClientRect().left));
    });
  }

  function touchDown(e: PointerEvent) {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      pinch = spread();
      const r = column!.getBoundingClientRect();
      if (pinch) pinchOrigin = `${pinch.cx - r.left + column!.scrollLeft}px ${pinch.cy - r.top}px`;
    } else if (touches.size === 1) {
      const now = performance.now();
      if (now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        zoomTo(zoom > 1.05 ? 1 : 2, e.clientX, e.clientY);
        lastTap = { t: 0, x: 0, y: 0 };
        doubleTapped = now;
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  }
  function touchMove(e: PointerEvent) {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = spread();
    if (pinch && now) pinchScale = Math.max(PDF_ZOOM.min / zoom, Math.min(PDF_ZOOM.max / zoom, now.d / Math.max(1, pinch.d)));
  }
  function touchUp(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (pinch && touches.size < 2) {
      const { cx, cy } = pinch;
      const scale = pinchScale;
      pinch = null;
      pinchScale = 1;
      if (Math.abs(scale - 1) > 0.03) zoomTo(zoom * scale, cx, cy);
    }
  }
  let doubleTapped = 0;

  onMount(() => {
    reader.turner = (dir) => scrollBy({ top: dir * (innerHeight - TOP - 96), behavior: 'instant' });
    const resize = new ResizeObserver(() => {
      if (column) columnWidth = column.clientWidth;
      viewHeight = innerHeight;
    });
    resize.observe(column!);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const page = Number((e.target as HTMLElement).dataset.page);
          if (e.isIntersecting) {
            near.add(page);
            void draw(page);
          } else {
            near.delete(page);
            release(page);
          }
        }
      },
      { rootMargin: '150% 0px' },
    );
    for (const p of pages) io.observe(p);
    const stopSelection = watchSelection(
      (node) => {
        const layer = (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest<HTMLElement>('.textLayer');
        return layer ? { root: layer, section: Number(layer.dataset.page) } : null;
      },
      (sel) => (selection = sel),
    );
    addEventListener('scroll', track, { passive: true });
    return () => {
      resize.disconnect();
      io.disconnect();
      stopSelection();
      removeEventListener('scroll', track);
      reader.turner = null;
      cancelAnimationFrame(frame);
      clearTimeout(flashTimer);
    };
  });

  function onclick(e: MouseEvent) {
    if (performance.now() - doubleTapped < 400) return;
    const mark = (e.target as Element).closest('mark[data-mark]') as HTMLElement | null;
    if (mark && mark.dataset.mark !== 'flash') {
      onedit(mark.dataset.mark!);
      return;
    }
    if (getSelection()?.isCollapsed !== false) reader.chrome = !reader.chrome;
  }

  async function highlight(colour: HighlightColour, withNote: boolean) {
    const sel = selection;
    if (!sel) return;
    getSelection()?.removeAllRanges();
    selection = null;
    const mark = await reader.highlight(sel.section, sel.start, sel.end, sel.text, colour);
    if (mark && withNote) onedit(mark.id);
    else if (!mark) ui.notify(t('selection.failed'), 'error');
  }
</script>

<div class="pdf-column" bind:this={column} onpointerdown={touchDown} onpointermove={touchMove} onpointerup={touchUp} onpointercancel={touchUp} role="presentation">
  <!-- Taps on a page show and hide the bars; highlights on it open their note. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="pdf-pages"
    class:tone-theme={settings.value.pageTone === 'theme'}
    style:width="{pageWidth}px"
    style:transform={pinchScale !== 1 ? `scale(${pinchScale})` : undefined}
    style:transform-origin={pinchOrigin}
    {onclick}
  >
    {#each content.sizes as size, i (i)}
      <div class="pdf-page" data-page={i} bind:this={pages[i]} style:height="{Math.round((pageWidth * size.height) / size.width)}px">
        <canvas></canvas>
        <div class="textLayer" data-page={i}></div>
      </div>
    {/each}
  </div>
</div>

{#if selection}
  <SelectionBar rect={selection.rect} text={selection.text} onhighlight={(c, n) => void highlight(c, n)} />
{/if}
