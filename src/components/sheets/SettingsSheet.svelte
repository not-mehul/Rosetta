<script lang="ts">
  // Settings (style.md §8.17): appearance and reading, the library, your data, about.
  import { t } from '../../i18n/index.svelte';
  import { notesMarkdown } from '../../lib/export';
  import { fileBytes, pickFiles } from '../../lib/pick';
  import { isNative } from '../../platform/native';
  import { saveFile } from '../../platform/output';
  import { db } from '../../state/db';
  import { library } from '../../state/library.svelte';
  import { settings } from '../../state/settings.svelte';
  import { autoBackup, canPickSyncFolder, chooseSyncFolder, currentBackup, makeArchive, restoreArchive, restoreBackup, syncNow, type MergeResult } from '../../state/sync';
  import { ui } from '../../state/ui.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import Switch from '../ui/Switch.svelte';
  import ReadingControls from './ReadingControls.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const v = $derived(settings.value);
  const today = () => new Date().toISOString().slice(0, 10);
  let busy = $state(false);

  async function exportAllNotes() {
    const marks = await db.marks.toArray();
    const withMarks = library.items.filter((d) => marks.some((m) => m.docId === d.id && m.kind === 'highlight'));
    if (!withMarks.length) {
      ui.notify(t('data.noHighlights'), 'info');
      return;
    }
    const md = withMarks.map((d) => notesMarkdown(d, marks.filter((m) => m.docId === d.id))).join('\n---\n\n');
    const out = await saveFile({ name: `rosetta-notes-${today()}.md`, data: new TextEncoder().encode(md), mime: 'text/markdown' });
    ui.notify(t('saved.to', { where: out.label }), 'success');
  }

  async function backUp() {
    const out = await saveFile({ name: `rosetta-backup-${today()}.json`, data: new TextEncoder().encode(JSON.stringify(await currentBackup(), null, 2)), mime: 'application/json' });
    ui.notify(t('data.backupSaved', { where: out.label }), 'success');
  }

  async function archive() {
    busy = true;
    try {
      const out = await saveFile({ name: `rosetta-library-${today()}.zip`, data: await makeArchive(), mime: 'application/zip' });
      ui.notify(t('data.archiveSaved', { where: out.label }), 'success');
    } finally {
      busy = false;
    }
  }

  function report(result: MergeResult, added = 0) {
    const marks = result.putMarks.length;
    const docs = result.docs.length;
    const missing = result.missing;
    ui.notify(t('data.restored', { marks, docs, added }) + (missing ? ` ${t('data.missing', { count: missing })}` : ''), 'success');
  }

  async function restore() {
    const [file] = await pickFiles('.json,.zip,application/json,application/zip', false);
    if (!file) return;
    busy = true;
    try {
      const bytes = await fileBytes(file);
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        const { added, result } = await restoreArchive(bytes);
        report(result, added);
      } else report(await restoreBackup(new TextDecoder().decode(bytes)));
    } catch (err) {
      ui.notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      busy = false;
    }
  }

  async function toggleSync(on: boolean) {
    if (on && canPickSyncFolder && !(await chooseSyncFolder())) return;
    await settings.update({ sync: on });
    if (on) await runSync();
  }

  async function runSync() {
    busy = true;
    try {
      const result = await syncNow();
      ui.notify(result ? t('sync.done', { marks: result.putMarks.length + result.deleteMarks.length, docs: result.docs.length }) : t('sync.first'), 'success');
    } catch (err) {
      ui.notify(t('sync.failed', { reason: err instanceof Error ? err.message : String(err) }), 'error');
    } finally {
      busy = false;
    }
  }

  async function toggleAutoBackup(on: boolean) {
    await settings.update({ autoBackup: on, lastAutoBackup: on ? 0 : v.lastAutoBackup });
    if (on && (await autoBackup())) ui.notify(t('data.autoWritten'), 'success');
  }

  async function clearLibrary() {
    const ok = await ui.confirm({ title: t('data.clearTitle'), message: t('data.clearMessage', { count: library.items.length }), action: t('data.clear'), danger: true });
    if (!ok) return;
    await library.clear();
    ui.notify(t('data.cleared'), 'success');
  }
</script>

<Sheet title={t('settings.title')} {onclose}>
  <section class="settings-group">
    <h3 class="t-section-label">{t('settings.appearance')}</h3>
    <ReadingControls />
  </section>

  <section class="settings-group">
    <h3 class="t-section-label">{t('settings.library')}</h3>
    <div class="btn-row btn-row-start">
      <button type="button" class="btn btn-secondary" id="openStorage" onclick={() => ui.open('storage')}>{t('storage.title')}</button>
      <button type="button" class="btn btn-secondary" onclick={() => ui.open('catalog')}>{t('catalog.title')}</button>
    </div>
  </section>

  <section class="settings-group">
    <h3 class="t-section-label">{t('settings.data')}</h3>
    <p class="t-body-small dim">{t('data.intro')}</p>
    <div class="btn-row btn-row-start">
      <button type="button" class="btn btn-secondary" id="exportAll" onclick={() => void exportAllNotes()}>{t('data.exportNotes')}</button>
      <button type="button" class="btn btn-secondary" id="backUp" onclick={() => void backUp()}>{t('data.backUp')}</button>
      <button type="button" class="btn btn-secondary" id="archive" disabled={busy || !library.items.length} onclick={() => void archive()}>{t('data.archive')}</button>
      <button type="button" class="btn btn-muted" id="restore" disabled={busy} onclick={() => void restore()}>{t('data.restore')}</button>
    </div>
    <div class="settings-list">
      {#if isNative}
        <Switch checked={v.autoBackup} label={t('data.auto')} hint={t('data.autoHint')} onchange={(on) => void toggleAutoBackup(on)} />
      {/if}
      {#if isNative || canPickSyncFolder}
        <Switch checked={v.sync} label={t('sync.label')} hint={isNative ? t('sync.hintNative') : t('sync.hintWeb')} onchange={(on) => void toggleSync(on)} />
      {/if}
    </div>
    {#if v.sync}
      <div class="btn-row btn-row-start">
        <button type="button" class="btn btn-muted" id="syncNow" disabled={busy} onclick={() => void runSync()}>{t('sync.now')}</button>
        {#if canPickSyncFolder}<button type="button" class="btn btn-muted" onclick={() => void chooseSyncFolder()}>{t('sync.choose')}</button>{/if}
      </div>
    {/if}
    <div class="btn-row btn-row-start">
      <button type="button" class="btn btn-danger" disabled={!library.items.length} onclick={() => void clearLibrary()}>{t('data.clear')}</button>
    </div>
  </section>

  <section class="settings-group">
    <h3 class="t-section-label">{t('settings.about')}</h3>
    <p class="t-body-small dim">{t('about.version', { version: __APP_VERSION__ })}</p>
    <p class="t-hint"><em>{t('about.privateTerm')}</em> {t('about.private')}</p>
  </section>
</Sheet>
