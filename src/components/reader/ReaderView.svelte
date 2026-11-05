<script lang="ts">
  // The reader: a bar at the top (back, title, search, contents, bookmark,
  // type), the page, and a footer with the place and progress. A tap on the
  // page, or scrolling on, hides the bars.
  import { percent, timeLeft } from '../../reader/progress';
  import { reader } from '../../state/reader.svelte';
  import { ui } from '../../state/ui.svelte';
  import Icon from '../ui/Icon.svelte';
  import FlowView from './FlowView.svelte';
  import MarkModal from './MarkModal.svelte';
  import PdfView from './PdfView.svelte';

  const doc = $derived(reader.doc!);
  const where = $derived(reader.content ? reader.whereIs(reader.location.section, reader.location.offset) : '');
  const progress = $derived(reader.progress);
  const footer = $derived.by(() => {
    if (!reader.content) return '';
    if (reader.content.kind === 'pdf') return `Page ${reader.location.section + 1} of ${reader.content.pageCount}`;
    return timeLeft(reader.charsLeft);
  });
  /** The highlight being edited in the modal. */
  let editing = $state<string | null>(null);

  let lastY = 0;
  function onscroll() {
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

<div class="reader" class:chrome-hidden={!reader.chrome} data-format={doc.format}>
  <header class="reader-bar" aria-label="Reader">
    <button type="button" class="btn-icon" id="closeReader" aria-label="Back to the library" onclick={() => reader.close()}><Icon name="arrow-left" /></button>
    <div class="reader-bar-text">
      <h1 class="reader-title ellipsis">{doc.title}</h1>
      {#if where && where !== doc.title}<p class="t-data-small dim ellipsis">{where}</p>{/if}
    </div>
    <div class="reader-bar-actions">
      <button type="button" class="btn-icon" id="openSearch" aria-label="Search" disabled={!reader.content} onclick={() => ui.open('search')}><Icon name="search" /></button>
      <button type="button" class="btn-icon" id="openContents" aria-label="Contents, bookmarks and highlights" disabled={!reader.content} onclick={() => ui.open('contents')}><Icon name="list" /></button>
      <button
        type="button"
        class="btn-icon"
        id="toggleBookmark"
        class:amber={!!reader.bookmarkHere}
        aria-label={reader.bookmarkHere ? 'Remove bookmark' : 'Bookmark this place'}
        aria-pressed={!!reader.bookmarkHere}
        disabled={!reader.content}
        onclick={() => void reader.toggleBookmark()}
      >
        <Icon name={reader.bookmarkHere ? 'bookmark-check' : 'bookmark'} />
      </button>
      <button type="button" class="btn-icon" id="openType" aria-label="Type and theme" onclick={() => ui.open('type')}><Icon name="a-large-small" /></button>
    </div>
  </header>

  <main class="reader-page">
    {#if reader.loading || !reader.content}
      <p class="t-hint reader-loading" role="status">Opening {doc.title}…</p>
    {:else if reader.content.kind === 'flow'}
      <FlowView content={reader.content} onedit={(id) => (editing = id)} />
    {:else}
      <PdfView content={reader.content} onedit={(id) => (editing = id)} />
    {/if}
  </main>

  {#if reader.content}
    <footer class="reader-foot">
      <div class="meter" role="meter" aria-label="Read" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress * 100)}>
        <div class="meter-fill" style:transform="scaleX({progress})"></div>
      </div>
      <div class="reader-foot-row">
        <span class="t-data-small dim ellipsis">{footer}</span>
        <span class="t-data-small amber tabular" id="progressLabel">{percent(progress)}</span>
      </div>
    </footer>
  {/if}
</div>

{#if editing}
  <MarkModal id={editing} onclose={() => (editing = null)} />
{/if}
