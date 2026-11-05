<script lang="ts">
  // A reflowable document, one section at a time, in the reader's type.
  // Highlights are painted as <mark>s over the section's text; the place is
  // the first character on screen, so it survives any change of type.
  import { onMount, tick, untrack } from 'svelte';
  import type { FlowDoc } from '../../formats/types';
  import { firstVisibleOffset, paint, rangeAt, unpaint, type Paint } from '../../reader/offsets';
  import { watchSelection, type PageSelection } from '../../reader/selection.svelte';
  import type { HighlightColour } from '../../state/db';
  import { reader } from '../../state/reader.svelte';
  import { settings } from '../../state/settings.svelte';
  import { MEASURE_VALUE, SPACING_VALUE } from '../../state/settings';
  import Icon from '../ui/Icon.svelte';
  import SelectionBar from './SelectionBar.svelte';

  let { content, onedit }: { content: FlowDoc; onedit: (id: string) => void } = $props();

  /** Where the page starts under the top bar. */
  const TOP = 72;
  let root: HTMLElement;
  let selection = $state<PageSelection | null>(null);
  let flash = $state<{ start: number; end: number } | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  /** True after the reader scrolls by hand, so a late font load doesn't move them. */
  let userScrolled = false;

  const index = $derived(reader.section);
  const section = $derived(content.sections[index]!);
  const v = $derived(settings.value);
  const paints = $derived<Paint[]>([
    ...reader.highlights.filter((h) => h.section === index).map((h) => ({ id: h.id, start: h.start, end: h.end, className: `hl hl-${h.colour}${h.note ? ' has-note' : ''}` })),
    ...(flash ? [{ id: 'flash', ...flash, className: 'hl-flash' }] : []),
  ]);

  function scrollToOffset(offset: number, behavior: 'instant' | 'smooth' = 'instant') {
    if (offset <= 0) return scrollTo({ top: 0, behavior });
    const range = rangeAt(root, offset, offset);
    const rect = range?.getClientRects()[0] ?? range?.startContainer.parentElement?.getBoundingClientRect();
    if (rect) scrollTo({ top: Math.max(0, scrollY + rect.top - TOP), behavior });
  }

  function arrive() {
    const jump = reader.jump;
    if (!jump || jump.to.section !== index) return;
    reader.jump = null;
    userScrolled = false;
    if (jump.anchor) {
      const el = root.querySelector(`#${CSS.escape(jump.anchor)}`);
      if (el) {
        scrollTo({ top: Math.max(0, scrollY + el.getBoundingClientRect().top - TOP - 8), behavior: 'instant' });
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

  // A new section: its HTML, its marks, and the jump that brought us here.
  $effect(() => {
    const html = section.html;
    // The section is sanitised HTML that the marks then rewrite, so Svelte doesn't own it.
    // eslint-disable-next-line svelte/no-dom-manipulating
    root.innerHTML = html;
    void tick().then(() => {
      paintAll();
      arrive();
    });
  });

  function paintAll() {
    unpaint(root);
    paint(root, paints);
  }

  // Marks change: repaint in place.
  $effect(() => {
    void paints;
    paintAll();
  });

  // A jump within the section on screen (search, contents, a bookmark).
  $effect(() => {
    if (reader.jump && reader.jump.to.section === index) void tick().then(arrive);
  });

  // Type changes: keep the same words at the top.
  $effect(() => {
    void [v.fontSize, v.typeface, v.spacing, v.measure, v.justify];
    const at = untrack(() => reader.location.offset);
    void tick().then(() => requestAnimationFrame(() => scrollToOffset(at)));
  });

  let frame = 0;
  function track() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!root) return;
      const offset = firstVisibleOffset(root, TOP);
      const end = firstVisibleOffset(root, innerHeight - 80);
      reader.report({ section: index, offset }, end);
    });
  }

  onMount(() => {
    const stopSelection = watchSelection((node) => (root.contains(node) ? { root, section: index } : null), (sel) => (selection = sel));
    const onScroll = () => {
      userScrolled = true;
      track();
    };
    addEventListener('scroll', onScroll, { passive: true });
    // Fraunces arrives after the first layout; put the reader back where they were.
    void document.fonts?.ready.then(() => {
      if (!userScrolled) scrollToOffset(reader.location.offset);
    });
    return () => {
      stopSelection();
      removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(flashTimer);
    };
  });

  function onclick(e: MouseEvent) {
    const target = e.target as Element;
    const link = target.closest('a');
    if (link) {
      const to = link.getAttribute('data-link');
      if (to) {
        e.preventDefault();
        const [part, anchor] = to.split('#');
        const at = part === '' ? index : Number(part);
        if (Number.isFinite(at)) reader.goTo({ section: at, offset: 0 }, undefined, anchor || undefined);
      }
      return;
    }
    const mark = target.closest('mark[data-mark]') as HTMLElement | null;
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
  }

  const next = $derived(content.sections[index + 1]);
  const nextTitle = $derived(next ? reader.whereIs(index + 1) : '');
</script>

<!-- Taps on the page show and hide the bars; links and highlights inside it are real controls. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<article
  class="reading"
  class:sans={v.typeface === 'sans'}
  class:justify={v.justify}
  style:--read-size="{v.fontSize}px"
  style:--read-leading={SPACING_VALUE[v.spacing]}
  style:--read-measure={MEASURE_VALUE[v.measure]}
  bind:this={root}
  {onclick}
></article>

{#if content.sections.length > 1}
  <nav class="section-nav" aria-label="Chapters">
    {#if index > 0}
      <button type="button" class="btn btn-muted" id="prevSection" onclick={() => reader.previousSection()}><Icon name="chevron-left" />Previous</button>
    {:else}
      <span></span>
    {/if}
    {#if next}
      <button type="button" class="btn btn-primary" id="nextSection" onclick={() => reader.nextSection()}>Next<Icon name="chevron-right" /></button>
    {:else}
      <p class="t-hint section-end">The end.</p>
    {/if}
  </nav>
  {#if next && nextTitle}<p class="t-hint next-title">Next: {nextTitle}</p>{/if}
{/if}

{#if selection}
  <SelectionBar rect={selection.rect} text={selection.text} onhighlight={(c, n) => void highlight(c, n)} />
{/if}
