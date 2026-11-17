<script lang="ts">
  // Flow mode: one sentence at a time in the middle of the screen, its letters
  // appearing one after another at the reader's speed. A tap shows the rest of
  // the sentence at once; the next tap clears it and starts the next one. A tap
  // on the left edge, or the left arrow, goes back a sentence; a tap along the
  // top, or on the count at the bottom of the screen, shows and hides the bars.
  // Holding a sentence highlights it, or opens the highlight it already has.
  import { onMount, untrack } from 'svelte';
  import type { FlowDoc } from '../../formats/types';
  import { t } from '../../i18n/index.svelte';
  import { anchorRuns } from '../../reader/anchors';
  import { beatAt, beats, type Beat } from '../../reader/cadence';
  import { reader } from '../../state/reader.svelte';
  import { MEASURE_VALUE } from '../../state/settings';

  let { content, onedit }: { content: FlowDoc; onedit: (id: string) => void } = $props();

  const v = $derived(reader.view);
  const index = $derived(reader.section);
  const section = $derived(content.sections[index]!);
  const list = $derived<Beat[]>(beats(section.html, section.text, content.lang, section.joins));
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** The sentence on screen. */
  let at = $state(0);
  /** Letters (code units) shown so far. */
  let shown = $state(0);
  let startedAt = 0;
  let frame = 0;
  let stage = $state<HTMLElement>();
  /** The first sentence after opening: the hint says how it works. */
  let fresh = $state(true);

  const beat = $derived(list[at]);
  /** The highlight over the sentence on screen, if any. */
  const marked = $derived(beat && !beat.heading ? reader.highlights.find((m) => m.section === index && m.start < beat.end && m.end > beat.start) : undefined);
  const full = $derived(!beat || shown >= beat.text.length);
  const atEnd = $derived(at >= list.length - 1 && index >= content.sections.length - 1);

  /** The sentence's runs (bold starts with visual anchors), each split where the reveal has reached. */
  const pieces = $derived.by(() => {
    if (!beat) return [];
    const runs = v.anchors ? anchorRuns(beat.text) : [{ text: beat.text, anchor: false }];
    const out: { text: string; anchor: boolean; veiled: boolean }[] = [];
    let pos = 0;
    for (const r of runs) {
      const cut = Math.max(0, Math.min(r.text.length, shown - pos));
      if (cut > 0) out.push({ text: r.text.slice(0, cut), anchor: r.anchor, veiled: false });
      if (cut < r.text.length) out.push({ text: r.text.slice(cut), anchor: r.anchor, veiled: true });
      pos += r.text.length;
    }
    return out;
  });

  function tickReveal(now: number) {
    if (!beat) return;
    const n = Math.floor(((now - startedAt) / 1000) * v.flowSpeed);
    // Never stop inside a surrogate pair.
    let next = Math.min(beat.text.length, n);
    if (next < beat.text.length && /[\uDC00-\uDFFF]/.test(beat.text[next] ?? '')) next++;
    shown = next;
    if (shown < beat.text.length) frame = requestAnimationFrame(tickReveal);
  }

  /** Puts sentence `i` on screen, revealing it letter by letter or all at once. */
  function show(i: number, reveal: boolean) {
    cancelAnimationFrame(frame);
    at = Math.max(0, Math.min(list.length - 1, i));
    shownFor = index;
    const b = list[at];
    if (!b) return;
    reader.report({ section: index, offset: b.start }, b.end);
    if (!reveal || b.heading) {
      shown = b.text.length;
      return;
    }
    shown = 0;
    startedAt = performance.now();
    frame = requestAnimationFrame(tickReveal);
  }

  function forward() {
    fresh = false;
    reader.chrome = false;
    if (!full) {
      cancelAnimationFrame(frame);
      shown = beat!.text.length;
      return;
    }
    if (at < list.length - 1) show(at + 1, true);
    else if (index < content.sections.length - 1) reader.goTo({ section: index + 1, offset: 0 });
    else reader.chrome = true;
  }

  function back() {
    fresh = false;
    if (at > 0) show(at - 1, false);
    else if (index > 0) reader.goTo({ section: index - 1, offset: content.sections[index - 1]!.text.length });
  }

  /** The section whose sentences are on screen. */
  let shownFor = -1;

  // A jump (contents, search, a bookmark, the place on opening, the next section).
  $effect(() => {
    const jump = reader.jump;
    if (!jump) return;
    untrack(() => {
      if (jump.to.section !== index) return;
      reader.jump = null;
      // Going back from the next section lands on the last sentence, shown whole.
      show(beatAt(list, jump.to.offset), jump.to.offset < section.text.length);
    });
  });

  // Coming to Flow from scrolling or pages: carry on from the place.
  $effect(() => {
    void list;
    untrack(() => {
      if (shownFor === index || reader.jump) return;
      show(beatAt(list, reader.location.section === index ? reader.location.offset : 0), true);
    });
  });

  // A change of speed mid-sentence carries on from the letters already shown.
  $effect(() => {
    const speed = v.flowSpeed;
    untrack(() => {
      if (!full) startedAt = performance.now() - (shown / speed) * 1000;
    });
  });

  // ─── Holding a sentence ─────────────────────────────────────

  const HOLD_MS = 500;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let holdFrom: { x: number; y: number } | null = null;
  /** A hold just happened: the click that ends it is not a tap. */
  let held = false;

  function onpointerdown(e: PointerEvent) {
    // A touch that is held often ends without a click: the next press starts afresh.
    held = false;
    if (e.button !== 0 || (e.target as Element).closest('button, a') || !(e.target as Element).closest('.flow-sentence')) return;
    holdFrom = { x: e.clientX, y: e.clientY };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      holdFrom = null;
      held = true;
      void hold();
    }, HOLD_MS);
  }
  function onpointermove(e: PointerEvent) {
    if (holdFrom && Math.hypot(e.clientX - holdFrom.x, e.clientY - holdFrom.y) > 10) endHold();
  }
  function endHold() {
    clearTimeout(holdTimer);
    holdFrom = null;
  }

  /** Highlights the sentence on screen, then opens it for a colour or a note; one already highlighted just opens. */
  async function hold() {
    const b = beat;
    if (!b || b.heading) return;
    cancelAnimationFrame(frame);
    shown = b.text.length;
    if (marked) return onedit(marked.id);
    const words = section.text.slice(b.start, b.end).replace(/\s+/g, ' ').trim();
    const mark = await reader.highlight(index, b.start, b.end, words, 'amber');
    if (mark) onedit(mark.id);
  }

  function onclick(e: MouseEvent) {
    if (held) {
      held = false;
      return;
    }
    if ((e.target as Element).closest('button, a')) return;
    const r = stage!.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (y < 0.18) {
      reader.chrome = !reader.chrome;
      return;
    }
    if ((x < 0.25) !== (content.dir === 'rtl')) back();
    else forward();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
    if ((e.target as Element)?.closest?.('input, textarea, select, button, [contenteditable]')) return;
    const forwardKey = content.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backKey = content.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if ([forwardKey, ' ', 'Enter', 'PageDown'].includes(e.key)) {
      e.preventDefault();
      forward();
    } else if ([backKey, 'PageUp'].includes(e.key)) {
      e.preventDefault();
      back();
    }
  }

  onMount(() => {
    reader.turner = (dir) => (dir === 1 ? forward() : back());
    return () => {
      clearTimeout(holdTimer);
      cancelAnimationFrame(frame);
      if (reader.turner) reader.turner = null;
    };
  });
</script>

<svelte:window {onkeydown} />

<!-- The stage takes taps: the left edge goes back, the top shows the bars, anywhere else goes on. Keys do the same. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="flow-stage"
  bind:this={stage}
  {onclick}
  {onpointerdown}
  {onpointermove}
  onpointerup={endHold}
  onpointercancel={endHold}
  onpointerleave={endHold}
  oncontextmenu={(e) => e.preventDefault()}
>
  <div class="flow-column" style:--read-measure={MEASURE_VALUE[v.measure]}>
    {#if beat}
      {#key `${index}:${at}`}
        <p
          class="flow-sentence"
          class:heading={beat.heading}
          class:sans={v.typeface === 'sans'}
          class:still={reduceMotion}
          lang={content.lang}
          dir={content.dir}
          style:--read-size="{v.fontSize / 16}rem"
          aria-live="polite"
        >
          <span class="visually-hidden">{beat.text}</span><span aria-hidden="true" data-mark={marked?.id}
            >{#each pieces as p, i (i)}{@const wash = marked && !p.veiled ? `flow-marked hl-${marked.colour}${marked.note ? ' has-note' : ''}` : ''}{#if p.anchor}<b class="anchor {wash}" class:veiled={p.veiled}>{p.text}</b>{:else}<span class={wash} class:veiled={p.veiled}>{p.text}</span>{/if}{/each}</span
          >
        </p>
      {/key}
    {:else}
      <p class="t-hint">{t('flow.empty')}</p>
    {/if}
  </div>
  <div class="flow-under">
    <!-- Hints sit above the bar, so the bar and count never move when one comes or goes. -->
    {#if fresh}
      <p class="t-hint flow-hint">{t('flow.hint')}</p>
    {:else if atEnd && full}
      <p class="t-hint flow-hint">{t('reader.theEnd')}</p>
    {/if}
    <div class="flow-progress" aria-hidden="true"><span style:transform="scaleX({list.length > 1 ? at / (list.length - 1) : 1})"></span></div>
    <button type="button" class="t-data-small tabular flow-count" id="flowBars" aria-expanded={reader.chrome} onclick={() => (reader.chrome = !reader.chrome)}
      >{t('flow.count', { at: Math.min(at + 1, list.length), count: list.length })}<span class="visually-hidden">. {t('flow.bars')}</span></button
    >
  </div>
</div>

<style>
  /* ─── Flow mode: a sentence at a time (SentenceView) ─────────── */

  .flow-stage {
    position: fixed;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-6);
    padding: calc(4.5rem + var(--inset-top)) calc(1.5rem + var(--inset-right)) calc(4.5rem + var(--inset-bottom)) calc(1.5rem + var(--inset-left));
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    -webkit-user-select: none;
  }
  .flow-column {
    width: 100%;
    max-width: min(var(--read-measure), 100%);
    min-height: 9em;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .flow-sentence {
    --read-size: 1.125rem;
    margin: 0;
    font-family: var(--font-serif);
    font-size: calc(var(--read-size) * 1.3);
    line-height: 1.5;
    letter-spacing: -0.005em;
    color: var(--text-body);
    text-align: center;
    text-wrap: pretty;
    overflow-wrap: break-word;
    animation: flow-in var(--spring-effects-default-dur) var(--spring-effects-default) both;
  }
  /* The count and its line sit still at the bottom centre, whatever the
     sentence's length, so the sentence alone moves; they rise above the
     footer while the bars are showing. */
  .flow-under {
    position: absolute;
    left: 50%;
    bottom: calc(var(--space-4) + var(--inset-bottom));
    transform: translateX(-50%);
    transition: bottom var(--spring-spatial-calm-dur) var(--spring-spatial-calm);
    width: min(16rem, calc(100% - 3rem));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    text-align: center;
  }
  .flow-progress {
    width: 100%;
    height: 2px;
    border-radius: var(--corner-full);
    background: var(--chart-track);
    overflow: hidden;
  }
  .flow-progress > span {
    display: block;
    height: 100%;
    background: var(--accent-amber);
    transform-origin: left;
    transition: transform var(--spring-spatial-default-dur) var(--spring-spatial-default);
  }
  .flow-hint {
    margin: 0;
  }
  /* A highlighted sentence: the same wash as on the page, a little rounder. */
  .flow-marked {
    border-radius: var(--corner-xs);
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  .flow-marked.has-note {
    text-decoration: underline dotted rgba(var(--accent-amber-rgb), 0.9);
    text-underline-offset: 0.25em;
  }
  .flow-count {
    min-height: 44px;
    padding: 0 var(--space-4);
    border-radius: var(--corner-full);
    color: var(--text-faint);
    -webkit-tap-highlight-color: transparent;
  }
  .flow-count:hover {
    background: var(--hover-bg);
  }
</style>
