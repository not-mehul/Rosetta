<script lang="ts">
  // A document's details: what it is, how far through, and what to do with it.
  import { FORMAT_LABEL } from '../../formats/types';
  import { notesMarkdown, slug } from '../../lib/export';
  import { fileSize, plural, relativeDay } from '../../lib/format';
  import { saveFile, shareFile } from '../../platform/output';
  import { library } from '../../state/library.svelte';
  import { reader } from '../../state/reader.svelte';
  import { ui } from '../../state/ui.svelte';
  import type { Mark } from '../../state/db';
  import BlobImg from '../ui/BlobImg.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { id, onclose }: { id: string; onclose: () => void } = $props();
  const doc = $derived(library.get(id));
  let marks = $state.raw<Mark[]>([]);
  $effect(() => {
    void library.marks(id).then((m) => (marks = m));
  });
  const highlights = $derived(marks.filter((m) => m.kind === 'highlight').length);
  const bookmarks = $derived(marks.filter((m) => m.kind === 'bookmark').length);

  function toggleFinished() {
    if (!doc) return;
    void library.update(id, { finishedAt: doc.finishedAt ? null : Date.now() });
  }

  async function startOver() {
    await library.update(id, { location: null, progress: 0, finishedAt: null });
    ui.notify('Back to the beginning.', 'success');
  }

  async function exportNotes() {
    if (!doc) return;
    const out = await saveFile({ name: `${slug(doc.title)}-notes.md`, data: new TextEncoder().encode(notesMarkdown(doc, marks)), mime: 'text/markdown' });
    ui.notify(`Saved to ${out.label}.`, 'success');
  }

  async function share() {
    if (!doc) return;
    const bytes = await library.bytes(id);
    if (bytes) await shareFile({ name: doc.fileName, data: bytes, mime: 'application/octet-stream' }, doc.title);
  }

  async function remove() {
    if (!doc) return;
    const title = doc.title;
    onclose();
    const undo = await library.remove(id);
    ui.undoable(`Removed ${title}.`, () => void undo());
  }
</script>

{#if doc}
  <Sheet title={doc.title} {onclose}>
    <div class="details">
      <div class="details-cover" aria-hidden="true">
        {#if doc.cover}<BlobImg bytes={doc.cover} alt="" />{:else}<Icon name="book-open" />{/if}
      </div>
      <dl class="details-facts">
        {#if doc.author}<div><dt class="t-field-label">Author</dt><dd>{doc.author}</dd></div>{/if}
        <div><dt class="t-field-label">Format</dt><dd class="t-data">{FORMAT_LABEL[doc.format]} · {fileSize(doc.size)}</dd></div>
        <div><dt class="t-field-label">Added</dt><dd class="t-data">{relativeDay(doc.addedAt)}</dd></div>
        <div><dt class="t-field-label">Read</dt><dd class="t-data">{doc.finishedAt ? `Finished ${relativeDay(doc.finishedAt)}` : doc.openedAt ? `${Math.floor(doc.progress * 100)}%, last ${relativeDay(doc.openedAt)}` : 'Not opened'}</dd></div>
        {#if marks.length}<div><dt class="t-field-label">Marks</dt><dd class="t-data">{plural(highlights, 'highlight')} · {plural(bookmarks, 'bookmark')}</dd></div>{/if}
      </dl>
    </div>
    <p class="t-data-small faint details-file ellipsis">{doc.fileName}</p>

    <div class="btn-row btn-row-start">
      <button
        type="button"
        class="btn btn-primary"
        id="readDoc"
        onclick={() => {
          onclose();
          void reader.open(id);
        }}><Icon name="book-open" />{doc.openedAt && !doc.finishedAt ? 'Continue' : 'Read'}</button
      >
      <button type="button" class="btn btn-secondary" id="toggleFinished" onclick={toggleFinished}><Icon name={doc.finishedAt ? 'rotate-ccw' : 'check'} />{doc.finishedAt ? 'Mark unread' : 'Mark finished'}</button>
    </div>
    <div class="btn-row btn-row-start">
      {#if highlights || bookmarks}<button type="button" class="btn btn-muted" onclick={() => void exportNotes()}><Icon name="file-down" />Export notes</button>{/if}
      {#if doc.location}<button type="button" class="btn btn-muted" onclick={() => void startOver()}><Icon name="rotate-ccw" />Start over</button>{/if}
      <button type="button" class="btn btn-muted" onclick={() => void share()}><Icon name="share-2" />Share file</button>
      <button type="button" class="btn btn-danger" id="removeDoc" onclick={() => void remove()}><Icon name="trash-2" />Remove</button>
    </div>
  </Sheet>
{/if}
