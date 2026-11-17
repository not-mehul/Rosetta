<script lang="ts">
  // Settings (style.md §8.17): appearance and reading, the library, your data, about.
  import { EGGS, eggsFound } from '../../lib/delight';
  import { t } from '../../i18n/index.svelte';
  import { allNotesMarkdown } from '../../lib/export';
  import { canPickFolder, fileBytes, pickFiles } from '../../lib/pick';
  import { addFolder } from '../../state/intake';
  import { isNative } from '../../platform/native';
  import { saveFile } from '../../platform/output';
  import { folderStatus, pickFolder } from '../../platform/folders';
  import { onMount } from 'svelte';
  import { db } from '../../state/db';
  import { library } from '../../state/library.svelte';
  import { settings } from '../../state/settings.svelte';
  import { autoBackup, canPickSyncFolder, chooseSyncFolder, currentBackup, makeArchive, restoreArchive, restoreBackup, syncNow, type MergeResult } from '../../state/sync';
  import { ui } from '../../state/ui.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { Select, Switch, WavyProgress } from 'dusk-dawn';
  import { LOCALE_NAMES, LOCALES } from '../../i18n/index.svelte';
  import type { Settings } from '../../state/settings';
  import ThemeControls from './ThemeControls.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const v = $derived(settings.value);
  const today = () => new Date().toISOString().slice(0, 10);
  let busy = $state(false);

  async function exportAllNotes() {
    const md = allNotesMarkdown(library.items, await db.marks.toArray());
    if (!md) {
      ui.notify(t('data.noHighlights'), 'info');
      return;
    }
    const out = await saveFile({ name: `rosetta-notes-${today()}.md`, data: new TextEncoder().encode(md), mime: 'text/markdown' });
    ui.notify(t('saved.to', { where: out.label }), 'success');
  }

  /** Highlights from a Kindle's My Clippings.txt, onto the same books here. */
  async function kindle() {
    const [file] = await pickFiles('.txt,text/plain', false);
    if (!file) return;
    busy = true;
    try {
      const { importKindle } = await import('../../state/kindle');
      const r = await importKindle(new TextDecoder().decode(await fileBytes(file)));
      if (!r.placed && !r.kept && !r.missing.length) ui.notify(t('kindle.none'), 'info');
      else {
        const missing = r.missing.length ? ` ${t('kindle.missing', { count: r.missing.length, titles: r.missing.slice(0, 3).join(', ') + (r.missing.length > 3 ? ', …' : '') })}` : '';
        ui.notify(`${t('kindle.done', { placed: r.placed, kept: r.kept })}${missing}`, r.placed || r.kept ? 'success' : 'info');
      }
    } catch (err) {
      ui.notify(t('kindle.failed', { reason: err instanceof Error ? err.message : String(err) }), 'error');
    } finally {
      busy = false;
    }
  }

  async function backUp() {
    const out = await saveFile({ name: `rosetta-backup-${today()}.json`, data: new TextEncoder().encode(JSON.stringify(await currentBackup(new Date(), true), null, 2)), mime: 'application/json' });
    ui.notify(t('data.backupSaved', { where: out.label }), 'success');
  }

  async function archive() {
    busy = true;
    try {
      const out = await saveFile({ name: `rosetta-library-${today()}.zip`, data: await makeArchive(), mime: 'application/zip' });
      ui.notify(t('data.archiveSaved', { where: out.label }), 'success');
    } catch (err) {
      ui.notify(t('data.archiveFailed', { reason: err instanceof Error ? err.message : String(err) }), 'error');
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

  /** The folders sync and the weekly backups use, by name, once chosen. */
  let syncFolder = $state<string | null>(null);
  let backupFolder = $state<string | null>(null);
  async function loadFolders() {
    if (!canPickSyncFolder) return;
    syncFolder = (await folderStatus('sync')).name ?? null;
    if (isNative) backupFolder = (await folderStatus('backup')).name ?? null;
  }
  onMount(() => void loadFolders());

  async function chooseFolder(key: 'sync' | 'backup'): Promise<boolean> {
    const chosen = key === 'sync' ? await chooseSyncFolder() : await pickFolder('backup');
    await loadFolders();
    return chosen;
  }

  async function toggleSync(on: boolean) {
    // A phone keeps working with Documents/Rosetta/sync if the picker is cancelled; a browser needs a folder.
    if (on && canPickSyncFolder && !syncFolder && !(await chooseFolder('sync')) && !isNative) return;
    await settings.update({ sync: on });
    if (on) await runSync();
  }

  async function changeSyncFolder() {
    if (await chooseFolder('sync')) await runSync();
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
    <ThemeControls />
    <label class="field">
      <span class="t-field-label">{t('type.language')}</span>
      <Select
        id="language"
        value={v.locale}
        options={[{ value: 'system' as Settings['locale'], label: t('type.system') }, ...LOCALES.map((l) => ({ value: l as Settings['locale'], label: LOCALE_NAMES[l] }))]}
        onchange={(locale) => void settings.update({ locale })}
      />
    </label>
    {#if isNative}
      <div class="settings-list">
        <Switch checked={v.haptics} label={t('type.haptics')} hint={t('type.hapticsHint')} onchange={(on) => void settings.update({ haptics: on })} />
      </div>
    {/if}
    <!-- Type, page and read-aloud settings live in a book, under Aa, where you can see them work. -->
    <p class="field-hint">{t('settings.readingWhere')}</p>
  </section>

  <section class="settings-group">
    <h3 class="t-section-label">{t('settings.library')}</h3>
    <div class="btn-grid">
      <button type="button" class="btn btn-secondary" id="openStorage" onclick={() => ui.open('storage')}>{t('storage.title')}</button>
    </div>
  </section>

  <section class="settings-group">
    <h3 class="t-section-label">{t('settings.data')}</h3>
    <p class="t-body-small dim">{t('data.intro')}</p>
    <div class="btn-grid">
      <button type="button" class="btn btn-secondary" id="exportAll" onclick={() => void exportAllNotes()}>{t('data.exportNotes')}</button>
      <button type="button" class="btn btn-secondary" id="backUp" onclick={() => void backUp()}>{t('data.backUp')}</button>
      <button type="button" class="btn btn-secondary" id="archive" disabled={busy || !library.items.length} onclick={() => void archive()}>{t('data.archive')}</button>
      <button type="button" class="btn btn-muted" id="restore" disabled={busy} onclick={() => void restore()}>{t('data.restore')}</button>
      {#if isNative || canPickFolder}<button type="button" class="btn btn-muted" id="addFolder" disabled={busy} onclick={() => void addFolder()}>{t('library.addFolder')}</button>{/if}
      <button type="button" class="btn btn-muted" id="importKindle" disabled={busy || !library.items.length} onclick={() => void kindle()}>{t('data.kindle')}</button>
    </div>
    <p class="t-hint">{t('data.kindleHint')}</p>
    {#if busy}<WavyProgress label={t('data.working')} />{/if}
    <div class="settings-list">
      {#if isNative}
        <Switch checked={v.autoBackup} label={t('data.auto')} hint={t('data.autoHint')} onchange={(on) => void toggleAutoBackup(on)} />
        {#if v.autoBackup}
          <div class="folder-row">
            <p class="t-body-small dim" id="backupWhere">{backupFolder ? t('data.autoIn', { name: backupFolder }) : t('data.autoInLegacy')}</p>
            <button type="button" class="btn btn-muted" id="chooseBackupFolder" onclick={() => void chooseFolder('backup')}>{backupFolder ? t('sync.change') : t('data.chooseBackupFolder')}</button>
          </div>
        {/if}
      {/if}
      {#if isNative || canPickSyncFolder}
        <Switch checked={v.sync} label={t('sync.label')} hint={isNative ? t('sync.hintNative') : t('sync.hintWeb')} onchange={(on) => void toggleSync(on)} />
      {/if}
    </div>
    {#if v.sync}
      {#if canPickSyncFolder}
        <p class="t-body-small dim" id="syncWhere">{syncFolder ? t('sync.in', { name: syncFolder }) : isNative ? t('sync.inLegacy') : ''}</p>
      {/if}
      <div class="btn-grid">
        <button type="button" class="btn btn-muted" id="syncNow" disabled={busy} onclick={() => void runSync()}>{t('sync.now')}</button>
        {#if canPickSyncFolder}<button type="button" class="btn btn-muted" id="chooseSyncFolder" onclick={() => void changeSyncFolder()}>{syncFolder ? t('sync.change') : t('sync.choose')}</button>{/if}
      </div>
    {/if}
    <div class="btn-grid">
      <button type="button" class="btn btn-danger" disabled={!library.items.length} onclick={() => void clearLibrary()}>{t('data.clear')}</button>
    </div>
  </section>

  <section class="settings-group">
    <h3 class="t-section-label">{t('settings.about')}</h3>
    <p class="t-body-small dim">{t('about.version', { version: __APP_VERSION__ })}</p>
    <p class="t-body-small dim" id="eggCount">{t('about.eggs', { found: eggsFound(), total: EGGS.length })}</p>
    <p class="t-hint"><em>{t('about.privateTerm')}</em> {t('about.private')}</p>
  </section>
</Sheet>

<style>
  /* Groups of actions (details, settings): two equal columns, so the buttons
     line up instead of wrapping to ragged rows. A lone last button takes the
     whole row, and a long label wraps inside its button. */
  .btn-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }
  .folder-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) 0 var(--space-3);
  }
</style>
