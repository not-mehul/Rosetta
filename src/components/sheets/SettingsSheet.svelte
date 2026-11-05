<script lang="ts">
  // Settings (style.md §8.17): appearance, reading, your data, about.
  import { makeBackup, notesMarkdown, parseBackup } from '../../lib/export';
  import { plural } from '../../lib/format';
  import { fileBytes, pickFiles } from '../../lib/pick';
  import { saveFile } from '../../platform/output';
  import { db } from '../../state/db';
  import { library } from '../../state/library.svelte';
  import { ui } from '../../state/ui.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import ReadingControls from './ReadingControls.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const today = () => new Date().toISOString().slice(0, 10);

  async function exportAllNotes() {
    const marks = await db.marks.toArray();
    const withMarks = library.items.filter((d) => marks.some((m) => m.docId === d.id && m.kind === 'highlight'));
    if (!withMarks.length) {
      ui.notify('There are no highlights to export yet.', 'info');
      return;
    }
    const md = withMarks.map((d) => notesMarkdown(d, marks.filter((m) => m.docId === d.id))).join('\n---\n\n');
    const out = await saveFile({ name: `rosetta-notes-${today()}.md`, data: new TextEncoder().encode(md), mime: 'text/markdown' });
    ui.notify(`Saved to ${out.label}.`, 'success');
  }

  async function backUp() {
    const backup = makeBackup(library.items, await db.marks.toArray());
    const out = await saveFile({ name: `rosetta-backup-${today()}.json`, data: new TextEncoder().encode(JSON.stringify(backup, null, 2)), mime: 'application/json' });
    ui.notify(`Backup saved to ${out.label}.`, 'success');
  }

  async function restore() {
    const [file] = await pickFiles('.json,application/json', false);
    if (!file) return;
    try {
      const backup = parseBackup(new TextDecoder().decode(await fileBytes(file)));
      let docs = 0;
      let marks = 0;
      for (const d of backup.docs) {
        if (!library.get(d.id)) continue;
        docs++;
        await library.update(d.id, { location: d.location, progress: d.progress, finishedAt: d.finishedAt, openedAt: d.openedAt });
        await db.marks.bulkPut(d.marks);
        marks += d.marks.length;
      }
      const missing = backup.docs.length - docs;
      ui.notify(`Restored ${plural(marks, 'mark')} on ${plural(docs, 'document')}.${missing ? ` ${missing} aren’t in this library; add their files and restore again.` : ''}`, 'success');
    } catch (err) {
      ui.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  async function clearLibrary() {
    const ok = await ui.confirm({
      title: 'Clear the library?',
      message: `Removes ${plural(library.items.length, 'document')} with their bookmarks and highlights from Rosetta. The original files elsewhere are not touched.`,
      action: 'Clear library',
      danger: true,
    });
    if (!ok) return;
    await library.clear();
    ui.notify('The library is empty.', 'success');
  }
</script>

<Sheet title="Settings" {onclose}>
  <section class="settings-group">
    <h3 class="t-section-label">Appearance and reading</h3>
    <ReadingControls />
  </section>

  <section class="settings-group">
    <h3 class="t-section-label">Your data</h3>
    <p class="t-body-small dim">Documents, places and notes stay on this device. A backup holds places, bookmarks and highlights; the files themselves stay where they are.</p>
    <div class="btn-row btn-row-start">
      <button type="button" class="btn btn-secondary" id="exportAll" onclick={() => void exportAllNotes()}>Export all notes</button>
      <button type="button" class="btn btn-secondary" id="backUp" onclick={() => void backUp()}>Back up</button>
      <button type="button" class="btn btn-muted" id="restore" onclick={() => void restore()}>Restore</button>
    </div>
    <div class="btn-row btn-row-start">
      <button type="button" class="btn btn-danger" disabled={!library.items.length} onclick={() => void clearLibrary()}>Clear library</button>
    </div>
  </section>

  <section class="settings-group">
    <h3 class="t-section-label">About</h3>
    <p class="t-body-small dim">Rosetta {__APP_VERSION__}. Reads EPUB, PDF, Word (.docx), Markdown, HTML and plain text.</p>
    <p class="t-hint"><em>Private.</em> Nothing you add leaves this device. Fraunces is under the SIL Open Font License; pdf.js, mammoth, marked, DOMPurify, Dexie and fflate under their own open licences.</p>
  </section>
</Sheet>
