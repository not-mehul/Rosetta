<script lang="ts">
  // Flow mode: one sentence at a time in the middle of the screen, its letters
  // appearing one after another at the reader's speed. A tap shows the rest of
  // the sentence at once; the next tap clears it and starts the next one. A tap
  // on the left edge, or the left arrow, goes back a sentence; a tap along the
  // top, or on the count at the bottom of the screen, shows and hides the bars.
  import { onMount, untrack } from 'svelte';
  import type { FlowDoc } from '../../formats/types';
  import { t } from '../../i18n/index.svelte';
  import { anchorRuns } from '../../reader/anchors';
  import { beatAt, beats, type Beat } from '../../reader/cadence';
  import { reader } from '../../state/reader.svelte';
  import { settings } from '../../state/settings.svelte';
  import { MEASURE_VALUE } from '../../state/settings';

  let { content }: { content: FlowDoc } = $props();

  const v = $derived(settings.value);
  const index = $derived(reader.section);
  const section = $derived(content.sections[index]!);
  const list = $derived<Beat[]>(beats(section.html, section.text, content.lang));
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

  function onclick(e: MouseEvent) {
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
      cancelAnimationFrame(frame);
      if (reader.turner) reader.turner = null;
    };
  });
</script>

<svelte:window {onkeydown} />

<!-- The stage takes taps: the left edge goes back, the top shows the bars, anywhere else goes on. Keys do the same. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="flow-stage" bind:this={stage} {onclick}>
  <div class="flow-column" style:--read-measure={MEASURE_VALUE[v.measure]}>
    {#if beat}
      {#key `${index}:${at}`}
        <p
          class="flow-sentence"
          class:heading={beat.heading}
          class:sans={v.typeface === 'sans'}
          class:custom={v.typeface === 'custom' && !!v.customFont}
          class:still={reduceMotion}
          lang={content.lang}
          dir={content.dir}
          style:--read-size="{v.fontSize}px"
          aria-live="polite"
        >
          <span class="visually-hidden">{beat.text}</span><span aria-hidden="true"
            >{#each pieces as p, i (i)}{#if p.anchor}<b class="anchor" class:veiled={p.veiled}>{p.text}</b>{:else}<span class:veiled={p.veiled}>{p.text}</span>{/if}{/each}</span
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
