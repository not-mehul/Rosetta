<script lang="ts">
  // Contents, bookmarks and highlights, each a list that takes you there.
  import { t } from '../../i18n/index.svelte';
  import { notesMarkdown, slug } from '../../lib/export';
  import { relativeDay } from '../../lib/format';
  import { saveFile } from '../../platform/output';
  import { reader } from '../../state/reader.svelte';
  import { ui } from '../../state/ui.svelte';
  import MarkModal from '../reader/MarkModal.svelte';
  import PageGrid from '../reader/PageGrid.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { TabRail } from 'dusk-dawn';

  let { onclose }: { onclose: () => void } = $props();
  type View = 'contents' | 'pages' | 'bookmarks' | 'highlights';
  const content = $derived(reader.content!);
  // A PDF with no outline (a scan) starts on its pages.
  let view = $state<View>(reader.content?.toc.length ? 'contents' : reader.content?.kind === 'pdf' ? 'pages' : 'bookmarks');
  let editing = $state<string | null>(null);

  const tabs = $derived([
    { id: 'contents' as const, label: t('contents.contents'), domId: 'tab-contents', controls: 'contents-panel' },
    ...(content.kind === 'pdf' ? [{ id: 'pages' as const, label: t('contents.pages'), domId: 'tab-pages', controls: 'contents-panel' }] : []),
    { id: 'bookmarks' as const, label: t('contents.bookmarks'), badge: reader.bookmarks.length || undefined, domId: 'tab-bookmarks', controls: 'contents-panel' },
    { id: 'highlights' as const, label: t('contents.highlights'), badge: reader.highlights.length || undefined, domId: 'tab-highlights', controls: 'contents-panel' },
  ]);

  /** The contents entry the reader is in: the last one at or before the place. */
  const currentEntry = $derived.by(() => {
    const { section } = reader.location;
    let at = -1;
    content.toc.forEach((e, i) => {
      if (e.section <= section) at = i;
    });
    return at;
  });

  /** Opens the list with the current chapter in view, not at the top. */
  function showCurrent(list: HTMLElement) {
    list.querySelector('[aria-current]')?.scrollIntoView({ block: 'center' });
  }

  function go(section: number, offset = 0, anchor?: string, flash?: { start: number; end: number }) {
    onclose();
    reader.goTo({ section, offset }, flash, anchor, true);
  }

  async function exportNotes() {
    const doc = reader.doc!;
    const md = notesMarkdown(doc, reader.marks);
    const out = await saveFile({ name: `${slug(doc.title)}-notes.md`, data: new TextEncoder().encode(md), mime: 'text/markdown' });
    ui.notify(t('saved.to', { where: out.label }), 'success');
  }
</script>

<Sheet title={reader.doc?.title ?? t('contents.contents')} {onclose} wide={view === 'pages'}>
  <TabRail {tabs} value={view} label={t('contents.lists')} onselect={(id) => (view = id)} />
  <div id="contents-panel" role="tabpanel" aria-labelledby="tab-{view}">
    {#if view === 'contents'}
      {#if content.toc.length}
        <ul class="row-list toc-list" {@attach showCurrent}>
          {#each content.toc as entry, i (i)}
            <li>
              <button type="button" class="row toc-row" class:current={i === currentEntry} class:read={i < currentEntry} aria-current={i === currentEntry ? 'location' : undefined} style:--depth={Math.min(entry.depth, 4)} onclick={() => go(entry.section, 0, entry.anchor)}>
                <span class="row-main">{entry.label}</span>
                {#if content.kind === 'pdf'}<span class="t-data-small faint tabular">{entry.section + 1}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="t-hint empty-line">{t('contents.none')}</p>
      {/if}
    {:else if view === 'pages' && content.kind === 'pdf'}
      <PageGrid {content} current={reader.location.section} onpick={(p) => go(p)} />
    {:else if view === 'bookmarks'}
      {#if reader.bookmarks.length}
        <ul class="row-list">
          {#each reader.bookmarks as b (b.id)}
            <li class="row-with-action">
              <button type="button" class="row" onclick={() => go(b.section, content.kind === 'pdf' ? 0 : b.start)}>
                <span class="row-main">
                  <span class="row-title">{b.where}</span>
                  {#if b.text}<span class="row-sub ellipsis-2">{b.text}</span>{/if}
                </span>
                <span class="t-data-small faint">{relativeDay(b.createdAt)}</span>
              </button>
              <button type="button" class="btn-icon" aria-label={t('reader.removeBookmark')} onclick={() => void reader.removeMark(b.id)}><Icon name="x" /></button>
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState icon="bookmark" title={t('contents.noBookmarks')} text={t('contents.noBookmarksText')} />
      {/if}
    {:else if reader.highlights.length}
      <ul class="row-list">
        {#each reader.highlights as h (h.id)}
          <li class="row-with-action">
            <button type="button" class="row highlight-row" onclick={() => go(h.section, content.kind === 'pdf' ? 0 : h.start, undefined, { start: h.start, end: h.end })}>
              <span class="hl-bar hl-{h.colour}" aria-hidden="true"></span>
              <span class="row-main">
                <span class="row-quote ellipsis-3">{h.text}</span>
                {#if h.note}<span class="row-note">{h.note}</span>{/if}
                <span class="t-data-small faint">{h.where}</span>
              </span>
            </button>
            <button type="button" class="btn-icon" aria-label={t('contents.editHighlight')} onclick={() => (editing = h.id)}><Icon name="pencil" /></button>
          </li>
        {/each}
      </ul>
      <div class="btn-row btn-row-start">
        <button type="button" class="btn btn-secondary" id="exportNotes" onclick={() => void exportNotes()}><Icon name="file-down" />{t('contents.export')}</button>
      </div>
    {:else}
      <EmptyState icon="highlighter" title={t('contents.noHighlights')} text={t('contents.noHighlightsText')} />
    {/if}
  </div>
</Sheet>

{#if editing}
  <MarkModal id={editing} onclose={() => (editing = null)} />
{/if}
