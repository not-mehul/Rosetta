<script lang="ts">
  // A reflowable document, one section at a time, in the reader's type. It
  // scrolls, or turns a page at a time (CSS columns one screen wide) with a
  // page curl, a slide or no motion. Highlights are painted as <mark>s over
  // the section's text; the place is the first character on screen, so it
  // survives any change of type, width or mode.
  import { onMount, tick, untrack } from 'svelte';
  import type { FlowDoc } from '../../formats/types';
  import { addAnchors } from '../../reader/anchors';
  import { Curl } from '../../reader/curl';
  import { isNoteRef, noteHtml } from '../../reader/notes';
  import { firstVisibleOffset, paint, rangeAt, unpaint, type Paint } from '../../reader/offsets';
  import { findPage, firstOffsetOnPage, pageCount, pageOfOffset, pageOfRect, TextIndex, type Columns } from '../../reader/paging';
  import { watchSelection, type PageSelection } from '../../reader/selection.svelte';
  import type { HighlightColour } from '../../state/db';
  import { library, nextInSeries } from '../../state/library.svelte';
  import { reader } from '../../state/reader.svelte';
  import { settings } from '../../state/settings.svelte';
  import { MEASURE_VALUE, SPACING_VALUE } from '../../state/settings';
  import { speech } from '../../state/speech.svelte';
  import { t } from '../../i18n/index.svelte';
  import Icon from '../ui/Icon.svelte';
  import SelectionBar from './SelectionBar.svelte';

  interface Props {
    content: FlowDoc;
    onedit: (id: string) => void;
    /** A footnote to show in place, with a way to go to it. */
    onnote: (html: string, go: () => void) => void;
    onimage: (src: string, alt: string) => void;
  }

  let { content, onedit, onnote, onimage }: Props = $props();

  /** Where the page starts under the top bar. */
  const TOP = 72;
  /** Paged mode's side margin at the smallest width. */
  const SIDE = 20;
  let root = $state<HTMLElement>();
  let pager = $state<HTMLElement>();
  let selection = $state<PageSelection | null>(null);
  let flash = $state<{ start: number; end: number } | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  /** True after the reader scrolls by hand, so a late font load doesn't move them. */
  let userScrolled = false;

  const index = $derived(reader.section);
  const section = $derived(content.sections[index]!);
  const v = $derived(settings.value);
  const paged = $derived(v.readingMode === 'paged');
  const rtl = $derived(content.dir === 'rtl');
  const publisher = $derived(v.publisherStyles && !!content.css);
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const turnStyle = $derived(reduceMotion ? 'none' : v.pageTurn);
  const spoken = $derived(speech.current && speech.current.section === index ? speech.current : null);
  const paints = $derived<Paint[]>([
    ...reader.highlights.filter((h) => h.section === index).map((h) => ({ id: h.id, start: h.start, end: h.end, className: `hl hl-${h.colour}${h.note ? ' has-note' : ''}` })),
    ...(flash ? [{ id: 'flash', ...flash, className: 'hl-flash' }] : []),
    ...(spoken ? [{ id: 'tts', start: spoken.start, end: spoken.end, className: 'tts' }] : []),
  ]);

  // ─── Paged layout ──────────────────────────────────────────

  let page = $state(0);
  let pages = $state(1);
  let text: TextIndex | null = null;
  /** The pager's width: one turn. */
  let stride = 0;
  let side = SIDE;
  let pageW = 0;
  let tx = 0;
  let turning = false;

  function columns(): Columns {
    // The column box's own edge moves with its transform (even mid-animation),
    // just as the boxes measured against it do.
    const r = root!.getBoundingClientRect();
    return { origin: rtl ? r.right : r.left, stride, rtl };
  }

  /** Sizes the columns to the pager. */
  function layout() {
    dropCurl();
    if (!paged || !root || !pager) return;
    const w = pager.clientWidth;
    const h = pager.clientHeight;
    const measure = parseFloat(MEASURE_VALUE[v.measure]) * v.fontSize;
    pageW = Math.floor(Math.min(w - 2 * SIDE, measure));
    side = Math.floor((w - pageW) / 2);
    stride = w;
    Object.assign(root.style, {
      position: 'absolute',
      top: '0',
      left: `${side}px`,
      width: `${pageW}px`,
      height: `${h}px`,
      columnWidth: `${pageW}px`,
      columnGap: `${2 * side}px`,
    });
    pages = pageCount(root.scrollWidth + 2 * side, stride);
    text = new TextIndex(root);
    warmCurl();
  }

  function place(p: number, animate = false) {
    page = Math.max(0, Math.min(pages - 1, p));
    tx = (rtl ? 1 : -1) * page * stride;
    if (!root) return;
    root.style.transition = animate ? 'transform var(--dur-settle) var(--ease-settle)' : 'none';
    root.style.transform = `translateX(${tx}px)`;
  }

  function reportPage() {
    if (!text || !root) return;
    const c = columns();
    const offset = firstOffsetOnPage(text, page, c);
    const end = page < pages - 1 ? Math.max(offset, firstOffsetOnPage(text, page + 1, c) - 1) : text.length;
    reader.report({ section: index, offset }, end);
  }

  function showOffset(offset: number) {
    if (!text || !stride) return;
    if (offset <= 0) place(0);
    else {
      // Not laid out yet (hidden, or mid-render): keep the page, and the place, as they are.
      const p = findPage(text, offset, columns());
      if (p === null) return;
      place(p);
    }
    reportPage();
  }

  // ─── Scrolling ─────────────────────────────────────────────

  function scrollToOffset(offset: number, behavior: 'instant' | 'smooth' = 'instant') {
    if (paged) return showOffset(offset);
    if (offset <= 0) return scrollTo({ top: 0, behavior });
    const range = rangeAt(root!, offset, offset);
    const rect = range?.getClientRects()[0] ?? range?.startContainer.parentElement?.getBoundingClientRect();
    if (!rect) return;
    scrollTo({ top: Math.max(0, scrollY + rect.top - TOP), behavior });
    // Until the reader scrolls away, the place is the one asked for, not the
    // first character the new layout happens to put at the top.
    if (behavior === 'instant') placed = { offset, y: scrollY };
  }

  let placed: { offset: number; y: number } | null = null;

  function arrive() {
    const jump = reader.jump;
    if (!jump || jump.to.section !== index || !root) return;
    reader.jump = null;
    userScrolled = false;
    if (jump.anchor) {
      const el = root.querySelector(`#${CSS.escape(jump.anchor)}`);
      if (el) {
        if (paged) {
          place(pageOfRect(el.getBoundingClientRect(), columns()));
          reportPage();
        } else scrollTo({ top: Math.max(0, scrollY + el.getBoundingClientRect().top - TOP - 8), behavior: 'instant' });
        return;
      }
    }
    scrollToOffset(jump.to.offset);
    if (jump.flash) {
      clearTimeout(flashTimer);
      flash = jump.flash;
      flashTimer = setTimeout(() => (flash = null), 2400);
    }
  }

  function paintAll() {
    if (!root) return;
    unpaint(root);
    paint(root, paints);
    // Painting splits text nodes; the index points at nodes.
    if (paged) text = new TextIndex(root);
    // The curl's copy shows marks too.
    dropCurl();
    warmCurl();
  }

  /** Runs `fn` when the browser is idle (after a short wait where it can't say). */
  const idle = (fn: () => void): number => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1200 }) : window.setTimeout(fn, 300));
  const cancelIdle = (id: number) => (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(id) : clearTimeout(id));

  // Pages or the curl turned off: nothing to keep ready.
  $effect(() => {
    void [paged, turnStyle];
    untrack(() => (paged && turnStyle === 'curl' ? warmCurl() : dropCurl()));
  });

  // A new section, or a change of mode: its HTML, its marks, and the jump that brought us here.
  $effect(() => {
    const html = section.html;
    const anchors = v.anchors;
    void paged;
    if (!root) return;
    // The section is sanitised HTML that the marks then rewrite, so Svelte doesn't own it.
    // eslint-disable-next-line svelte/no-dom-manipulating
    root.innerHTML = html;
    if (anchors) addAnchors(root);
    void tick().then(() => {
      untrack(() => {
        layout();
        paintAll();
        if (paged) place(0);
        if (reader.jump?.to.section === index) arrive();
        else if (paged) showOffset(reader.location.section === index ? reader.location.offset : 0);
      });
    });
  });

  // Marks change: repaint in place.
  $effect(() => {
    void paints;
    untrack(paintAll);
  });

  // Reading aloud: keep the sentence being read on screen.
  $effect(() => {
    const s = spoken;
    if (!s || !root) return;
    untrack(() => {
      if (paged) {
        if (!text) return;
        const p = pageOfOffset(text, s.start, columns());
        if (p !== page) {
          place(p, turnStyle !== 'none');
          reportPage();
        }
      } else {
        const rect = rangeAt(root!, s.start, s.end)?.getBoundingClientRect();
        if (rect && (rect.bottom > innerHeight - 96 || rect.top < TOP)) scrollTo({ top: Math.max(0, scrollY + rect.top - innerHeight / 3), behavior: reduceMotion ? 'instant' : 'smooth' });
      }
    });
  });

  // A jump within the section on screen (search, contents, a bookmark).
  $effect(() => {
    if (reader.jump && reader.jump.to.section === index) void tick().then(arrive);
  });

  // Type or size changes: keep the same words at the top.
  $effect(() => {
    void [v.fontSize, v.typeface, v.customFont, v.anchors, v.spacing, v.measure, v.justify, publisher];
    const at = untrack(() => reader.location.offset);
    void tick().then(() =>
      requestAnimationFrame(() => {
        layout();
        scrollToOffset(at);
      }),
    );
  });

  // ─── Turning pages ─────────────────────────────────────────

  /** A copy of the whole section as laid out, for the curl; begin() moves it to a page. */
  function snapshot(): HTMLElement {
    const copy = root!.cloneNode(true) as HTMLElement;
    for (const el of copy.querySelectorAll('[id]')) el.removeAttribute('id');
    copy.style.transition = 'none';
    return copy;
  }

  // The curl is made ahead of time, while nothing is moving, and reused for
  // every turn until the page's layout or marks change.
  let curl: Curl | null = null;
  /** The curl in the middle of a turn, which a change waits for before throwing it away. */
  let curling: Curl | null = null;
  let warmTimer = 0;

  function dropCurl() {
    cancelIdle(warmTimer);
    if (curl && curl !== curling) curl.destroy();
    curl = null;
  }

  function warmCurl() {
    cancelIdle(warmTimer);
    if (!paged || turnStyle !== 'curl' || curl) return;
    warmTimer = idle(() => {
      if (paged && turnStyle === 'curl' && !curl && pager && root) curl = new Curl(pager, snapshot());
    });
  }

  /** The curl, shown over page `p`. */
  function curlOver(p: number, corner: 'top' | 'bottom'): Curl {
    if (!curl) curl = new Curl(pager!, snapshot());
    curling = curl;
    return curl.begin((rtl ? 1 : -1) * p * stride, corner);
  }

  /** After a turn: keep the curl for the next one, unless the page changed under it. */
  function release(c: Curl) {
    if (curling === c) curling = null;
    if (c === curl) c.end();
    else c.destroy();
    warmCurl();
  }

  const canTurn = (dir: 1 | -1) => (dir === 1 ? page < pages - 1 || index < content.sections.length - 1 : page > 0 || index > 0);

  /** Moves the content to the next or previous page, crossing into the next section when needed. */
  async function step(dir: 1 | -1) {
    if (dir === 1 && page < pages - 1) place(page + 1);
    else if (dir === -1 && page > 0) place(page - 1);
    else if (dir === 1) {
      reader.goTo({ section: index + 1, offset: 0 });
      await tick();
      return;
    } else {
      // The end of the previous section.
      reader.goTo({ section: index - 1, offset: content.sections[index - 1]!.text.length });
      await tick();
      return;
    }
    reportPage();
  }

  /** A turn from a tap, a key or a volume key. */
  async function turn(dir: 1 | -1) {
    if (!paged) {
      scrollBy({ top: dir * (innerHeight - TOP - 96), behavior: reduceMotion ? 'instant' : 'smooth' });
      return;
    }
    if (turning || !canTurn(dir)) return;
    getSelection()?.removeAllRanges();
    if (turnStyle === 'curl' && (dir === 1 || page > 0)) {
      turning = true;
      const c = curlOver(dir === 1 ? page : page - 1, 'bottom');
      const w = c.width;
      const y = c.corner;
      if (dir === 1) {
        c.set({ x: w, y });
        await step(1);
        await c.animate({ x: -w, y }, 520, c.height * 0.12);
      } else {
        c.set({ x: -w, y });
        await c.animate({ x: w, y }, 520, c.height * 0.12);
        await step(-1);
      }
      release(c);
      turning = false;
      return;
    }
    if (turnStyle === 'slide' && (dir === 1 ? page < pages - 1 : page > 0)) {
      place(page + dir, true);
      reportPage();
      return;
    }
    await step(dir);
  }

  // Swipes: the curl (or the page) follows the finger.
  let gesture: { id: number; x: number; y: number; t: number; dir: 0 | 1 | -1; curl: Curl | null; startTx: number } | null = null;

  function pointerdown(e: PointerEvent) {
    if (!paged || turning || e.pointerType === 'mouse' || !e.isPrimary) return;
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dir: 0, curl: null, startTx: tx };
  }

  function pointermove(e: PointerEvent) {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const r = pager!.getBoundingClientRect();
    if (!g.dir) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2 || getSelection()?.isCollapsed === false) return;
      const forward = (dx < 0) !== rtl;
      const dir: 1 | -1 = forward ? 1 : -1;
      if (!canTurn(dir)) {
        gesture = null;
        return;
      }
      g.dir = dir;
      pager!.setPointerCapture(e.pointerId);
      if (turnStyle === 'curl' && (dir === 1 || page > 0)) {
        g.curl = curlOver(dir === 1 ? page : page - 1, g.y - r.top < r.height / 2 ? 'top' : 'bottom');
        if (dir === 1) {
          void step(1);
          g.curl.set({ x: g.curl.width, y: g.curl.corner });
        } else g.curl.set({ x: -g.curl.width, y: g.curl.corner });
      }
    }
    if (g.curl) {
      const w = g.curl.width;
      const travel = (rtl ? -dx : dx) * 2;
      const x = g.dir === 1 ? w + travel : -w + travel;
      g.curl.set({ x: Math.max(-w, Math.min(w, x)), y: g.curl.corner + dy * 0.6 });
    } else if (turnStyle === 'slide' && root) {
      root.style.transition = 'none';
      root.style.transform = `translateX(${g.startTx + dx}px)`;
    }
  }

  async function pointerup(e: PointerEvent) {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    gesture = null;
    if (!g.dir) return;
    // Swallow the click that follows a swipe.
    swiped = performance.now();
    const dx = e.clientX - g.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - g.t);
    const far = Math.abs(dx) > (pager?.clientWidth ?? 360) * 0.22 || speed > 0.45;
    const sameWay = g.dir === 1 ? (dx < 0) !== rtl : (dx > 0) !== rtl;
    const commit = far && sameWay;
    if (g.curl) {
      turning = true;
      const c = g.curl;
      const w = c.width;
      const flat = { x: w, y: c.corner };
      const over = { x: -w, y: c.corner };
      if (g.dir === 1) {
        await c.animate(commit ? over : flat, commit ? 320 : 260);
        if (!commit) await step(-1);
      } else {
        await c.animate(commit ? flat : over, commit ? 320 : 260);
        if (commit) await step(-1);
      }
      release(c);
      turning = false;
      return;
    }
    if (turnStyle === 'slide') {
      if (commit && (g.dir === 1 ? page < pages - 1 : page > 0)) {
        place(page + g.dir, true);
        reportPage();
      } else if (commit) {
        place(page, false);
        await step(g.dir);
      } else place(page, true);
      return;
    }
    if (commit) await step(g.dir);
  }

  let swiped = -Infinity;

  // ─── Taps, links, notes and pictures ───────────────────────

  function targetOf(to: string): { section: number; anchor: string | undefined; el: Element | null } {
    const [part, anchor] = to.split('#');
    const at = part === '' ? index : Number(part);
    let el: Element | null = null;
    if (anchor && Number.isFinite(at)) {
      if (at === index) el = root!.querySelector(`#${CSS.escape(anchor)}`);
      else {
        const t = document.createElement('template');
        t.innerHTML = content.sections[at]?.html ?? '';
        el = t.content.getElementById(anchor);
      }
    }
    return { section: at, anchor: anchor || undefined, el };
  }

  function onclick(e: MouseEvent) {
    const target = e.target as Element;
    const link = target.closest('a');
    // A book's links never navigate the app itself.
    if (link?.hasAttribute('data-link')) e.preventDefault();
    if (performance.now() - swiped < 400) return;
    if (link) {
      const to = link.getAttribute('data-link');
      if (to) {
        e.preventDefault();
        const { section: at, anchor, el } = targetOf(to);
        if (!Number.isFinite(at)) return;
        const go = () => reader.goTo({ section: at, offset: 0 }, undefined, anchor, true);
        if (el && isNoteRef(link, el)) onnote(noteHtml(el), go);
        else go();
      }
      return;
    }
    const mark = target.closest('mark[data-mark]') as HTMLElement | null;
    if (mark && mark.dataset.mark !== 'flash' && mark.dataset.mark !== 'tts') {
      onedit(mark.dataset.mark!);
      return;
    }
    const img = target.closest('img');
    if (img && !content.pictures) {
      onimage(img.currentSrc || img.src, img.alt);
      return;
    }
    if (getSelection()?.isCollapsed === false) return;
    if (paged && pager) {
      // Tap zones: the outer thirds turn the page; the middle shows the bars.
      const r = pager.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (x < 0.3 || x > 0.7) {
        const forward = (x > 0.7) !== rtl;
        void turn(forward ? 1 : -1);
        reader.chrome = false;
        return;
      }
    }
    reader.chrome = !reader.chrome;
  }

  function ondblclick(e: MouseEvent) {
    const img = (e.target as Element).closest('img');
    if (img && content.pictures) onimage(img.currentSrc || img.src, img.alt);
  }

  function onkeydown(e: KeyboardEvent) {
    if (!paged || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
    if ((e.target as Element)?.closest?.('input, textarea, select, [contenteditable]')) return;
    const next = ['ArrowRight', 'PageDown', ' '].includes(e.key) ? (rtl ? -1 : 1) : ['ArrowLeft', 'PageUp'].includes(e.key) ? (rtl ? 1 : -1) : 0;
    if (e.key === ' ' && e.shiftKey) {
      e.preventDefault();
      void turn(-1);
      return;
    }
    if (next) {
      e.preventDefault();
      void turn(next as 1 | -1);
    }
  }

  let frame = 0;
  function track() {
    if (paged) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!root) return;
      if (placed && Math.abs(scrollY - placed.y) > 2) placed = null;
      const offset = placed?.offset ?? firstVisibleOffset(root, TOP);
      const end = firstVisibleOffset(root, innerHeight - 80);
      reader.report({ section: index, offset }, end);
    });
  }

  // The book's own styles, scoped to the reading column.
  $effect(() => {
    if (!publisher) return;
    const style = document.createElement('style');
    style.dataset.publisher = '';
    style.textContent = content.css!;
    document.head.appendChild(style);
    return () => style.remove();
  });

  onMount(() => {
    const stopSelection = watchSelection((node) => (root?.contains(node) ? { root, section: index } : null), (sel) => (selection = sel));
    const onScroll = () => {
      userScrolled = true;
      track();
    };
    const onResize = () => {
      if (!paged) return;
      const at = reader.location.offset;
      layout();
      showOffset(at);
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onResize);
    reader.turner = (dir) => void turn(dir);
    // Fraunces arrives after the first layout; put the reader back where they were.
    void document.fonts?.ready.then(() => {
      if (!userScrolled) {
        layout();
        scrollToOffset(reader.location.offset);
      }
    });
    return () => {
      stopSelection();
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onResize);
      if (reader.turner) reader.turner = null;
      cancelAnimationFrame(frame);
      curling = null;
      dropCurl();
      clearTimeout(flashTimer);
    };
  });

  async function highlight(colour: HighlightColour, withNote: boolean) {
    const sel = selection;
    if (!sel) return;
    getSelection()?.removeAllRanges();
    selection = null;
    const mark = await reader.highlight(sel.section, sel.start, sel.end, sel.text, colour);
    if (mark && withNote) onedit(mark.id);
  }

  const next = $derived(content.sections[index + 1]);
  const nextTitle = $derived(next ? reader.whereIs(index + 1) : '');
  /** At the end of the last section: the series' next volume, when it is in the library. */
  const following = $derived(!next && reader.doc ? nextInSeries(library.items, reader.doc) : undefined);
</script>

<svelte:window {onkeydown} />

{#if paged}
  <!-- The pager takes taps (zones), swipes (turns) and the page's links and highlights. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="pager"
    bind:this={pager}
    onpointerdown={pointerdown}
    onpointermove={pointermove}
    onpointerup={(e) => void pointerup(e)}
    onpointercancel={(e) => void pointerup(e)}
    {onclick}
    {ondblclick}
  >
    <article
      class="reading paged"
      class:sans={v.typeface === 'sans'}
      class:custom={v.typeface === 'custom' && !!v.customFont}
      class:anchored={v.anchors}
      class:justify={v.justify}
      class:publisher
      class:pictures={content.pictures}
      lang={content.lang}
      dir={content.dir}
      style:--read-size="{v.fontSize}px"
      style:--read-leading={SPACING_VALUE[v.spacing]}
      style:--read-measure={MEASURE_VALUE[v.measure]}
      bind:this={root}
    ></article>
  </div>
  <p class="t-data-small faint page-number tabular" aria-live="off">{t('reader.pageOf', { page: page + 1, pages })}</p>
{:else}
  <!-- Taps on the page show and hide the bars; links and highlights inside it are real controls. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <article
    class="reading"
    class:sans={v.typeface === 'sans'}
    class:custom={v.typeface === 'custom' && !!v.customFont}
    class:anchored={v.anchors}
    class:justify={v.justify}
    class:publisher
    class:pictures={content.pictures}
    lang={content.lang}
    dir={content.dir}
    style:--read-size="{v.fontSize}px"
    style:--read-leading={SPACING_VALUE[v.spacing]}
    style:--read-measure={MEASURE_VALUE[v.measure]}
    bind:this={root}
    {onclick}
    {ondblclick}
  ></article>

  {#if content.sections.length > 1}
    <nav class="section-nav" aria-label={t('reader.chapters')}>
      {#if index > 0}
        <button type="button" class="btn btn-muted" id="prevSection" onclick={() => reader.previousSection()}><Icon name="chevron-left" />{t('reader.previous')}</button>
      {:else}
        <span></span>
      {/if}
      {#if next}
        <button type="button" class="btn btn-primary" id="nextSection" onclick={() => reader.nextSection()}>{t('reader.next')}<Icon name="chevron-right" /></button>
      {:else}
        <p class="t-hint section-end">{t('reader.theEnd')}</p>
      {/if}
    </nav>
    {#if next && nextTitle}<p class="t-hint next-title">{t('reader.nextTitle', { title: nextTitle })}</p>{/if}
  {/if}
  {#if following}
    <div class="next-volume">
      <p class="t-section-label">{t('reader.nextVolume')}</p>
      <button type="button" class="btn btn-secondary" id="nextVolume" onclick={() => void reader.open(following.id)}>{following.title}<Icon name="chevron-right" /></button>
    </div>
  {/if}
{/if}

{#if selection}
  <SelectionBar rect={selection.rect} text={selection.text} onhighlight={(c, n) => void highlight(c, n)} />
{/if}
