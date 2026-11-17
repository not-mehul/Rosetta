<script lang="ts">
  // The reader: a bar at the top (back, title, read aloud, search, contents,
  // bookmark, type), the page, and a footer with the place and progress. A
  // tap on the page, or scrolling on, hides the bars.
  import { t } from '../../i18n/index.svelte';
  import { captureVolumeKeys, keepAwake } from '../../platform/device';
  import { duration } from '../../lib/format';
  import { percent, timeLeft } from '../../reader/progress';
  import type { FooterShows } from '../../state/settings';
  import { reader } from '../../state/reader.svelte';
  import { settings } from '../../state/settings.svelte';
  import { speech } from '../../state/speech.svelte';
  import { stats } from '../../state/stats.svelte';
  import { ui } from '../../state/ui.svelte';
  import Icon from '../ui/Icon.svelte';
  import FixedView from './FixedView.svelte';
  import FlowView from './FlowView.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import MarkModal from './MarkModal.svelte';
  import OpeningBook from './OpeningBook.svelte';
  import NoteSheet from './NoteSheet.svelte';
  import PdfView from './PdfView.svelte';
  import SentenceView from './SentenceView.svelte';
  import SpeechBar from './SpeechBar.svelte';
  import AutoScrollBar from './AutoScrollBar.svelte';
  import Ruler from './Ruler.svelte';
  import { autoScroll } from '../../state/autoscroll.svelte';
  import { SPACING_VALUE } from '../../state/settings';

  const doc = $derived(reader.doc!);
  const v = $derived(reader.view);
  const where = $derived(reader.content ? reader.whereIs(reader.location.section, reader.location.offset) : '');
  /** The bar's title: the chapter a reader would name (a PDF's from its outline), or nothing, and then the book's own title. */
  const chapter = $derived.by(() => {
    const c = reader.content;
    if (!c) return '';
    if (c.kind === 'pdf') return c.toc.filter((e) => e.section <= reader.location.section).at(-1)?.label ?? '';
    return where;
  });
  const progress = $derived(reader.progress);
  /** The figures the footer can show for this document; a tap on it moves to the next. */
  const shows = $derived.by<FooterShows[]>(() => {
    const c = reader.content;
    if (!c) return ['book'];
    if (c.kind === 'pdf') return c.pageCount > 1 ? ['book', 'chapter'] : ['book'];
    if (c.pictures || c.fixed) return ['book'];
    return reader.chapter.count > 1 ? ['book', 'chapter', 'place'] : ['book'];
  });
  const showing = $derived(shows.includes(v.footerShows) ? v.footerShows : 'book');
  const footer = $derived.by(() => {
    const c = reader.content;
    if (!c) return '';
    if (c.kind === 'pdf') {
      const left = c.pageCount - reader.location.section - 1;
      if (showing === 'chapter') return left ? t('reader.pagesLeft', { count: left }) : t('reader.lastPage');
      return t('reader.pageOf', { page: reader.location.section + 1, pages: c.pageCount });
    }
    if (showing === 'place') return t('reader.chapterOf', { index: reader.chapter.index, count: reader.chapter.count });
    if (showing === 'chapter') {
      const minutes = Math.round(reader.chapter.charsLeft / Math.max(100, stats.pace));
      return minutes < 1 ? t('reader.chapterUnder') : t('reader.chapterLeft', { time: duration(minutes * 60_000) });
    }
    return timeLeft(reader.charsLeft, stats.pace);
  });
  function cycleFooter() {
    if (shows.length < 2) return;
    void settings.update({ footerShows: shows[(shows.indexOf(showing) + 1) % shows.length] });
  }
  /** The way back after a long jump. */
  const backLabel = $derived.by(() => {
    const to = reader.returnTo;
    if (!to || !reader.content) return '';
    if (reader.content.kind === 'pdf') return t('reader.backToPage', { page: to.section + 1 });
    const where = reader.whereIs(to.section, to.offset);
    return where && where !== doc.title ? t('reader.backTo', { where }) : t('reader.backToPlace');
  });
  /** Flow mode: a sentence at a time, for text (not comics or fixed layouts). */
  const flowing = $derived(reader.content?.kind === 'flow' && v.readingMode === 'flow' && !reader.content.pictures && !reader.content.fixed);
  const paged = $derived(reader.content?.kind === 'flow' && !flowing && (v.readingMode === 'paged' || !!reader.content.fixed));
  /** The highlight being edited in the modal. */
  let editing = $state<string | null>(null);
  let note = $state<{ html: string; go: () => void } | null>(null);
  let image = $state<{ src: string; alt: string } | null>(null);

  // Keep the screen on while reading, when asked.
  $effect(() => {
    void keepAwake(v.keepAwake || speech.playing || autoScroll.running);
    return () => void keepAwake(false);
  });

  /** One line of the reading text, in pixels: the ruler's height and auto-scroll's step. */
  const lineHeight = $derived.by(() => {
    void v.fontSize;
    const rem = typeof document === 'undefined' ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return v.fontSize * (rem / 16) * SPACING_VALUE[v.spacing];
  });
  /** Words laid out in the column (not pictures, a fixed layout, a PDF's pages or Flow): what the ruler and auto-scroll are for. */
  const columnText = $derived(reader.content?.kind === 'flow' && !reader.content.pictures && !reader.content.fixed && !flowing);
  const scrolling = $derived(columnText && v.readingMode === 'scroll');

  // Auto-scroll runs with the bars out of the way, only in scroll mode, and ends with the book.
  $effect(() => {
    autoScroll.lineHeight = lineHeight;
  });
  $effect(() => {
    if (autoScroll.running) reader.chrome = false;
  });
  $effect(() => {
    if (!scrolling) autoScroll.stop();
  });
  $effect(() => () => autoScroll.stop());
  // Scrolling by hand takes over from it.
  $effect(() => {
    if (!autoScroll.running) return;
    const takeOver = () => autoScroll.pause();
    addEventListener('wheel', takeOver, { passive: true });
    addEventListener('touchmove', takeOver, { passive: true });
    return () => {
      removeEventListener('wheel', takeOver);
      removeEventListener('touchmove', takeOver);
    };
  });
  /** A tap on the page pauses it, and another goes on (the bars come and go with it). */
  function tapWhileScrolling(e: PointerEvent) {
    if (!autoScroll.active || (e.target as Element).closest('a, button, mark')) return;
    autoScroll.toggle();
  }

  // Volume keys turn pages (Android), when asked.
  $effect(() => {
    if (!v.volumeKeys || !reader.content) return;
    return captureVolumeKeys((dir) => reader.turner?.(dir));
  });

  // Leaving the document stops reading aloud.
  $effect(() => () => speech.stop());

  let lastY = 0;
  function onscroll() {
    if (paged || flowing) return;
    const y = scrollY;
    if (performance.now() - reader.jumpedAt < 600) {
      lastY = y;
      return;
    }
    // Scrolling on hides the bars; scrolling back a little brings them back.
    if (y > lastY + 12 && y > 80) reader.chrome = false;
    else if (y < lastY - 24) reader.chrome = true;
    lastY = y;
  }
</script>

<svelte:window {onscroll} />

<div class="reader" class:chrome-hidden={!reader.chrome} class:is-paged={paged || flowing} class:is-flowing={flowing} data-format={doc.format}>
  <header class="reader-bar" aria-label={t('reader.label')}>
    <button type="button" class="btn-icon" id="closeReader" aria-label={t('reader.back')} onclick={() => reader.leave()}><Icon name="arrow-left" /></button>
    <!-- The chapter is the title, the book its eyebrow; a document without chapters shows its own title. Read aloud starts from Aa → Listen. -->
    <div class="reader-bar-text">
      {#if chapter && chapter !== doc.title}
        <p class="reader-book ellipsis">{doc.title}</p>
        <h1 class="reader-title ellipsis">{chapter}</h1>
      {:else}
        <h1 class="reader-title ellipsis">{doc.title}</h1>
      {/if}
    </div>
    <div class="reader-bar-actions">
      <button type="button" class="btn-icon" id="openSearch" aria-label={t('reader.search')} disabled={!reader.content} onclick={() => ui.open('search')}><Icon name="search" /></button>
      <button type="button" class="btn-icon" id="openContents" aria-label={t('reader.contents')} disabled={!reader.content} onclick={() => ui.open('contents')}><Icon name="list" /></button>
      <button
        type="button"
        class="btn-icon"
        id="toggleBookmark"
        class:amber={!!reader.bookmarkHere}
        aria-label={reader.bookmarkHere ? t('reader.removeBookmark') : t('reader.addBookmark')}
        aria-pressed={!!reader.bookmarkHere}
        disabled={!reader.content}
        onclick={() => void reader.toggleBookmark()}
      >
        <Icon name={reader.bookmarkHere ? 'bookmark-check' : 'bookmark'} />
      </button>
      <button type="button" class="btn-icon" id="openType" aria-label={t('reader.type')} onclick={() => ui.open('type')}><Icon name="a-large-small" /></button>
    </div>
  </header>

  <main class="reader-page" onpointerdowncapture={tapWhileScrolling}>
    {#if reader.loading || !reader.content}
      <OpeningBook {doc} />
    {:else if reader.content.kind === 'flow' && reader.content.fixed}
      <FixedView content={reader.content} />
    {:else if flowing && reader.content.kind === 'flow'}
      <SentenceView content={reader.content} />
    {:else if reader.content.kind === 'flow'}
      <FlowView content={reader.content} onedit={(id) => (editing = id)} onnote={(html, go) => (note = { html, go })} onimage={(src, alt) => (image = { src, alt })} />
    {:else}
      <PdfView content={reader.content} onedit={(id) => (editing = id)} />
    {/if}
  </main>

  {#if reader.content}
    <footer class="reader-foot">
      {#if speech.active}<SpeechBar />{/if}
      {#if autoScroll.active}<AutoScrollBar />{/if}
      <div class="meter" role="meter" aria-label={t('reader.read')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress * 100)}>
        <div class="meter-fill" style:transform="scaleX({progress})"></div>
        <!-- Chapters cut the line into lengths, so the place reads against them. -->
        {#each reader.ticks as at (at)}<span class="meter-tick" style:left="{at * 100}%"></span>{/each}
      </div>
      <div class="reader-foot-row">
        {#if shows.length > 1}
          <button type="button" class="foot-figure t-data-small dim" id="footerFigure" aria-label={t('reader.footerFigure', { figure: footer })} onclick={cycleFooter}><span class="ellipsis">{footer}</span></button>
        {:else}
          <span class="t-data-small dim ellipsis">{footer}</span>
        {/if}
        {#if backLabel}
          <button type="button" class="return-to t-data-small" id="returnTo" onclick={() => reader.goBack()}><Icon name="undo-2" /><span class="ellipsis">{backLabel}</span></button>
        {/if}
        <span class="t-data-small amber tabular" id="progressLabel">{reader.allInView ? t('reader.allOnScreen') : percent(progress)}</span>
      </div>
    </footer>
  {/if}
</div>

{#if v.ruler && columnText && reader.content}
  <Ruler {lineHeight} />
{/if}

{#if v.dim > 0 || v.warmth > 0}
  <div class="night-veil" aria-hidden="true" style:--dim={v.dim} style:--warmth={v.warmth}></div>
{/if}

{#if editing}
  <MarkModal id={editing} onclose={() => (editing = null)} />
{/if}
{#if note}
  <NoteSheet html={note.html} ongo={note.go} onclose={() => (note = null)} />
{/if}
{#if image}
  <ImageViewer src={image.src} alt={image.alt} onclose={() => (image = null)} />
{/if}

<style>
  /* ─── The reader ─────────────────────────────────────────────── */

  .reader-bar,
  .reader-foot {
    position: fixed;
    left: 0;
    right: 0;
    z-index: 30;
    background: var(--modal-bg);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    transition:
      transform var(--spring-spatial-default-dur) var(--spring-spatial-default),
      opacity var(--spring-effects-default-dur) var(--spring-effects-default);
  }
  .reader-bar {
    top: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: calc(var(--space-2) + var(--inset-top)) calc(var(--space-2) + var(--inset-right)) var(--space-2) calc(var(--space-2) + var(--inset-left));
    border-bottom: 1px solid var(--border-soft);
  }
  .reader-bar-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .reader-title {
    margin: 0;
    font-family: var(--font-serif);
    font-weight: 400;
    font-size: 1.0625rem;
    line-height: 1.3;
    color: var(--text-heading);
  }
  /* The book, as an eyebrow over the chapter (style.md §5.2). */
  .reader-book {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.625rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .reader-bar-text {
    container: bar / inline-size;
  }
  /* At large text the chapter needs the room: the eyebrow goes. */
  @container bar (max-width: 7rem) {
    .reader-book {
      display: none;
    }
  }
  .reader-bar-actions {
    display: flex;
    align-items: center;
  }
  .reader-foot {
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0 calc(var(--space-5) + var(--inset-right)) calc(var(--space-2) + var(--inset-bottom)) calc(var(--space-5) + var(--inset-left));
    border-top: 1px solid var(--border-soft);
  }
  .reader-foot-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    min-height: 24px;
    align-items: center;
  }
  .reader-foot-row > :first-child {
    flex: 1 1 auto;
    min-width: 0;
  }
  /* A chapter boundary: a cut in the line, in the page colour. */
  .meter-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--sheet-bg);
    pointer-events: none;
  }
  /* The footer's figure changes on a tap; the target is taller than it looks (§14). */
  .foot-figure {
    display: flex;
    align-items: center;
    min-height: 44px;
    margin: -10px 0;
    padding: 0;
    text-align: left;
    color: var(--text-dim);
    border-radius: var(--radius);
    transition: color var(--dur-hover);
  }
  .foot-figure:hover {
    color: var(--text-heading);
  }
  /* The way back after a jump: one quiet amber action. */
  .return-to {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 55%;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 44px;
    margin: -10px 0;
    padding: 0 var(--space-2);
    color: var(--accent-amber);
    border-radius: var(--radius);
    animation: fade-in var(--spring-effects-default-dur) var(--spring-effects-default);
    transition: background-color var(--dur-hover);
  }
  .return-to:hover {
    background: var(--hover-bg);
  }
  .return-to :global(svg) {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
  }
  .chrome-hidden .reader-bar {
    transform: translateY(-100%);
    opacity: 0;
    pointer-events: none;
  }
  .chrome-hidden .reader-foot {
    transform: translateY(100%);
    opacity: 0;
    pointer-events: none;
  }
  .reader-page {
    position: relative;
    z-index: 1;
    padding: calc(5rem + var(--inset-top)) calc(1.25rem + var(--inset-right)) calc(6rem + var(--inset-bottom)) calc(1.25rem + var(--inset-left));
  }
  .night-veil {
    position: fixed;
    inset: 0;
    z-index: 25;
    pointer-events: none;
    background: linear-gradient(rgba(var(--accent-amber-rgb), calc(var(--warmth) * 0.22)), rgba(var(--accent-amber-rgb), calc(var(--warmth) * 0.22))), rgba(var(--shadow-rgb), var(--dim));
    mix-blend-mode: multiply;
  }
</style>
