<script lang="ts">
  // A document's details: what it is, how far through, and what to do with it.
  import { FORMAT_LABEL } from '../../formats/types';
  import { t } from '../../i18n/index.svelte';
  import { notesMarkdown, slug } from '../../lib/export';
  import { fileSize, relativeDay } from '../../lib/format';
  import { openInColophon, sendToBookShelf } from '../../platform/handoff';
  import { saveFile, shareFile, shareText } from '../../platform/output';
  import { restoreFile } from '../../state/intake';
  import { duration } from '../../lib/format';
  import { db } from '../../state/db';
  import { library, nextInSeries } from '../../state/library.svelte';
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
  /** Time spent in this document, and on how many days. */
  let time = $state.raw<{ ms: number; days: number }>({ ms: 0, days: 0 });
  $effect(() => {
    void db.sessions
      .where('docId')
      .equals(id)
      .toArray()
      .then((rows) => (time = { ms: rows.reduce((a, r) => a + r.ms, 0), days: rows.length }))
      .catch(() => undefined);
  });
  const next = $derived(doc ? nextInSeries(library.items, doc) : undefined);
  const collectionNames = $derived(doc ? library.collections.filter((c) => doc.collections.includes(c.id)).map((c) => c.name) : []);

  function toggleFinished() {
    if (!doc) return;
    void library.update(id, { finishedAt: doc.finishedAt ? null : Date.now() });
  }

  async function startOver() {
    await library.update(id, { location: null, progress: 0, finishedAt: null });
    ui.notify(t('details.startedOver'), 'success');
  }

  async function exportNotes() {
    if (!doc) return;
    const out = await saveFile({ name: `${slug(doc.title)}-notes.md`, data: new TextEncoder().encode(notesMarkdown(doc, marks)), mime: 'text/markdown' });
    ui.notify(t('saved.to', { where: out.label }), 'success');
  }

  async function share() {
    if (!doc) return;
    const bytes = await library.bytes(id);
    if (bytes) await shareFile({ name: doc.fileName, data: bytes, mime: 'application/octet-stream' }, doc.title);
  }

  async function bookShelf() {
    if (!doc) return;
    const sent = await sendToBookShelf(doc);
    if (!sent) {
      // No BookShelf to take it: offer the details as text instead.
      await shareText(doc.title, `${doc.title}${doc.author ? ` — ${doc.author}` : ''}`);
      ui.notify(t('details.noBookShelf'), 'info');
    }
  }

  async function colophon() {
    if (!doc) return;
    const bytes = await library.bytes(id);
    if (bytes) await openInColophon(doc.fileName, bytes, doc.title);
  }

  async function offload() {
    if (!doc) return;
    const ok = await ui.confirm({ title: t('details.offloadTitle'), message: t('details.offloadMessage', { size: fileSize(doc.size) }), action: t('details.offload') });
    if (!ok) return;
    await library.offload(id);
    ui.notify(t('details.offloaded'), 'success');
  }

  async function remove() {
    if (!doc) return;
    const title = doc.title;
    onclose();
    const undo = await library.remove(id);
    ui.undoable(t('details.removed', { title }), () => void undo());
  }
</script>

{#if doc}
  <Sheet title={doc.title} {onclose}>
    <div class="details">
      <div class="details-cover" aria-hidden="true">
        {#if doc.cover}<BlobImg bytes={doc.cover} alt="" />{:else}<Icon name="book-open" />{/if}
      </div>
      <dl class="details-facts">
        {#if doc.author}<div><dt class="t-field-label">{t('edit.author')}</dt><dd>{doc.author}</dd></div>{/if}
        {#if doc.series}<div><dt class="t-field-label">{t('edit.series')}</dt><dd>{doc.series}{doc.seriesIndex !== null ? ` · ${doc.seriesIndex}` : ''}</dd></div>{/if}
        <div><dt class="t-field-label">{t('details.format')}</dt><dd class="t-data">{FORMAT_LABEL[doc.format]} · {doc.offloaded ? t('details.offloadedShort') : fileSize(doc.size)}</dd></div>
        <div><dt class="t-field-label">{t('details.added')}</dt><dd class="t-data">{relativeDay(doc.addedAt)}</dd></div>
        <div>
          <dt class="t-field-label">{t('details.read')}</dt>
          <dd class="t-data">{doc.finishedAt ? t('details.finishedOn', { when: relativeDay(doc.finishedAt) }) : doc.openedAt ? t('details.progress', { percent: Math.floor(doc.progress * 100), when: relativeDay(doc.openedAt) }) : t('details.notOpened')}</dd>
        </div>
        {#if time.ms >= 60_000}<div><dt class="t-field-label">{t('details.time')}</dt><dd class="t-data" id="detailsTime">{t('details.timeOver', { time: duration(time.ms), days: t('stats.days', { count: time.days }) })}</dd></div>{/if}
        {#if marks.length}<div><dt class="t-field-label">{t('details.marks')}</dt><dd class="t-data">{t('details.markCounts', { highlights, bookmarks })}</dd></div>{/if}
      </dl>
    </div>
    {#if doc.tags.length || collectionNames.length}
      <div class="chip-row details-tags">
        {#each collectionNames as name (name)}<span class="chip-status">{name}</span>{/each}
        {#each doc.tags as tag (tag)}<span class="chip-tag">#{tag}</span>{/each}
      </div>
    {/if}
    <p class="t-data-small faint details-file ellipsis">{doc.fileName}</p>
    {#if next}
      <button
        type="button"
        class="details-next"
        id="nextInSeries"
        onclick={() => {
          onclose();
          void reader.open(next.id);
        }}
      >
        <span class="t-field-label">{t('details.nextInSeries')}</span>
        <span class="details-next-title ellipsis">{next.title}</span>
        <Icon name="chevron-right" />
      </button>
    {/if}

    <div class="btn-row btn-row-start">
      {#if doc.offloaded}
        <button type="button" class="btn btn-primary" id="restoreFile" onclick={() => void restoreFile(id)}><Icon name="download" />{t('details.addFileAgain')}</button>
      {:else}
        <button
          type="button"
          class="btn btn-primary"
          id="readDoc"
          onclick={() => {
            onclose();
            void reader.open(id);
          }}><Icon name="book-open" />{doc.openedAt && !doc.finishedAt ? t('details.continue') : t('details.readAction')}</button
        >
      {/if}
      <button type="button" class="btn btn-secondary" id="toggleFinished" onclick={toggleFinished}><Icon name={doc.finishedAt ? 'rotate-ccw' : 'check'} />{doc.finishedAt ? t('details.markUnread') : t('details.markFinished')}</button>
      <button type="button" class="btn btn-secondary" id="editDetails" onclick={() => ui.open('edit')}><Icon name="pencil" />{t('details.edit')}</button>
    </div>
    <div class="btn-row btn-row-start">
      {#if highlights || bookmarks}<button type="button" class="btn btn-muted" onclick={() => void exportNotes()}><Icon name="file-down" />{t('details.exportNotes')}</button>{/if}
      {#if doc.location}<button type="button" class="btn btn-muted" onclick={() => void startOver()}><Icon name="rotate-ccw" />{t('details.startOver')}</button>{/if}
      {#if !doc.offloaded}<button type="button" class="btn btn-muted" onclick={() => void share()}><Icon name="share-2" />{t('details.shareFile')}</button>{/if}
      <button type="button" class="btn btn-muted" id="sendBookShelf" onclick={() => void bookShelf()}><Icon name="library" />{t('details.toBookShelf')}</button>
      {#if doc.format === 'epub' && !doc.offloaded}<button type="button" class="btn btn-muted" id="openColophon" onclick={() => void colophon()}><Icon name="file-code" />{t('details.toColophon')}</button>{/if}
      {#if !doc.offloaded}<button type="button" class="btn btn-muted" id="offloadDoc" onclick={() => void offload()}><Icon name="hard-drive" />{t('details.offload')}</button>{/if}
      <button type="button" class="btn btn-danger" id="removeDoc" onclick={() => void remove()}><Icon name="trash-2" />{t('action.remove')}</button>
    </div>
  </Sheet>
{/if}
