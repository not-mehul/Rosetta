<script lang="ts">
  // Contents, bookmarks and highlights, each a list that takes you there.
  import { notesMarkdown, slug } from '../../lib/export';
  import { relativeDay } from '../../lib/format';
  import { saveFile } from '../../platform/output';
  import { reader } from '../../state/reader.svelte';
  import { ui } from '../../state/ui.svelte';
  import MarkModal from '../reader/MarkModal.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import TabRail from '../ui/TabRail.svelte';

  let { onclose }: { onclose: () => void } = $props();
  type View = 'contents' | 'bookmarks' | 'highlights';
  const content = $derived(reader.content!);
  let view = $state<View>(reader.content?.toc.length ? 'contents' : 'bookmarks');
  let editing = $state<string | null>(null);

  const tabs = $derived([
    { id: 'contents' as const, label: 'Contents', domId: 'tab-contents', controls: 'contents-panel' },
    { id: 'bookmarks' as const, label: 'Bookmarks', badge: reader.bookmarks.length || undefined, domId: 'tab-bookmarks', controls: 'contents-panel' },
    { id: 'highlights' as const, label: 'Highlights', badge: reader.highlights.length || undefined, domId: 'tab-highlights', controls: 'contents-panel' },
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

  function go(section: number, offset = 0, anchor?: string, flash?: { start: number; end: number }) {
    onclose();
    reader.goTo({ section, offset }, flash, anchor);
  }

  async function exportNotes() {
    const doc = reader.doc!;
    const md = notesMarkdown(doc, reader.marks);
    const out = await saveFile({ name: `${slug(doc.title)}-notes.md`, data: new TextEncoder().encode(md), mime: 'text/markdown' });
    ui.notify(`Saved to ${out.label}.`, 'success');
  }
</script>

<Sheet title={reader.doc?.title ?? 'Contents'} {onclose}>
  <TabRail {tabs} value={view} label="Lists" onselect={(id) => (view = id)} />
  <div id="contents-panel" role="tabpanel" aria-labelledby="tab-{view}">
    {#if view === 'contents'}
      {#if content.toc.length}
        <ul class="row-list toc-list">
          {#each content.toc as entry, i (i)}
            <li>
              <button type="button" class="row toc-row" class:current={i === currentEntry} style:--depth={Math.min(entry.depth, 4)} onclick={() => go(entry.section, 0, entry.anchor)}>
                <span class="row-main">{entry.label}</span>
                {#if content.kind === 'pdf'}<span class="t-data-small faint tabular">{entry.section + 1}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="t-hint empty-line">This document has no contents list.</p>
      {/if}
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
              <button type="button" class="btn-icon" aria-label="Remove bookmark" onclick={() => void reader.removeMark(b.id)}><Icon name="x" /></button>
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState icon="bookmark" title="No bookmarks yet" text="The bookmark at the top of the page marks the place on screen." />
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
            <button type="button" class="btn-icon" aria-label="Edit highlight" onclick={() => (editing = h.id)}><Icon name="pencil" /></button>
          </li>
        {/each}
      </ul>
      <div class="btn-row btn-row-start">
        <button type="button" class="btn btn-secondary" id="exportNotes" onclick={() => void exportNotes()}><Icon name="file-down" />Export as Markdown</button>
      </div>
    {:else}
      <EmptyState icon="highlighter" title="No highlights yet" text="Select some words on the page and pick a colour, or add a note." />
    {/if}
  </div>
</Sheet>

{#if editing}
  <MarkModal id={editing} onclose={() => (editing = null)} />
{/if}
