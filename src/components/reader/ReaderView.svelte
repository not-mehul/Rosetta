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

  const doc = $derived(reader.doc!);
  const v = $derived(settings.value);
  const where = $derived(reader.content ? reader.whereIs(reader.location.section, reader.location.offset) : '');
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
    void keepAwake(v.keepAwake || speech.playing);
    return () => void keepAwake(false);
  });

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
    <div class="reader-bar-text">
      <h1 class="reader-title ellipsis">{doc.title}</h1>
      {#if where && where !== doc.title}<p class="t-data-small dim ellipsis">{where}</p>{/if}
    </div>
    <div class="reader-bar-actions">
      <button
        type="button"
        class="btn-icon"
        id="readAloud"
        class:amber={speech.active}
        aria-label={speech.active ? t('speech.stop') : t('speech.start')}
        aria-pressed={speech.active}
        disabled={!reader.content || !!(reader.content.kind === 'flow' && (reader.content.pictures || reader.content.fixed))}
        onclick={() => (speech.active ? speech.stop() : void speech.start())}><Icon name="volume-2" /></button
      >
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

  <main class="reader-page">
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
        <span class="t-data-small amber tabular" id="progressLabel">{percent(progress)}</span>
      </div>
    </footer>
  {/if}
</div>

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
