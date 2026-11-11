<script lang="ts">
  // The reader: a bar at the top (back, title, read aloud, search, contents,
  // bookmark, type), the page, and a footer with the place and progress. A
  // tap on the page, or scrolling on, hides the bars.
  import { LoadingIndicator } from 'dusk-dawn';
  import { t } from '../../i18n/index.svelte';
  import { captureVolumeKeys, keepAwake } from '../../platform/device';
  import { percent, timeLeft } from '../../reader/progress';
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
  import NoteSheet from './NoteSheet.svelte';
  import PdfView from './PdfView.svelte';
  import SpeechBar from './SpeechBar.svelte';

  const doc = $derived(reader.doc!);
  const v = $derived(settings.value);
  const where = $derived(reader.content ? reader.whereIs(reader.location.section, reader.location.offset) : '');
  const progress = $derived(reader.progress);
  const footer = $derived.by(() => {
    if (!reader.content) return '';
    if (reader.content.kind === 'pdf') return t('reader.pageOf', { page: reader.location.section + 1, pages: reader.content.pageCount });
    return timeLeft(reader.charsLeft, stats.pace);
  });
  const paged = $derived(reader.content?.kind === 'flow' && (v.readingMode === 'paged' || !!reader.content.fixed));
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
    if (paged) return;
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

<div class="reader" class:chrome-hidden={!reader.chrome} class:is-paged={paged} data-format={doc.format}>
  <header class="reader-bar" aria-label={t('reader.label')}>
    <button type="button" class="btn-icon" id="closeReader" aria-label={t('reader.back')} onclick={() => reader.close()}><Icon name="arrow-left" /></button>
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
      <div class="reader-loading" role="status">
        <LoadingIndicator label={t('reader.opening', { title: doc.title })} />
        <p class="t-hint">{t('reader.opening', { title: doc.title })}</p>
      </div>
    {:else if reader.content.kind === 'flow' && reader.content.fixed}
      <FixedView content={reader.content} />
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
      </div>
      <div class="reader-foot-row">
        <span class="t-data-small dim ellipsis">{footer}</span>
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
