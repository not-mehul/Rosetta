<script lang="ts">
  // Settings (style.md §8.17), in tabs:
  //   General  theme, language, haptics, goals, the reading reminder, the library
  //   Reading  the defaults every book starts with: text, page, light, and the
  //            niche ones under Advanced
  //   Listen   read-aloud speed and voice
  //   Data     back up and restore, sync with automatic backups, clear everything
  //   About    version, privacy and licences
  import { onMount } from 'svelte';
  import { IconTabs, Select, Switch, TimeField, WavyProgress } from 'dusk-dawn';
  import type { Snippet } from 'svelte';
  import { EGGS, eggsFound } from '../../lib/delight';
  import { LOCALE_NAMES, LOCALES, locale, t, type MessageKey } from '../../i18n/index.svelte';
  import { relativeTime } from '../../lib/format';
  import { canPickFolder, fileBytes, pickFiles } from '../../lib/pick';
  import { volumeKeysAvailable } from '../../platform/device';
  import { folderStatus } from '../../platform/folders';
  import { isNative } from '../../platform/native';
  import { saveFile } from '../../platform/output';
  import { applyTheme } from '../../platform/theme.svelte';
  import { reveal } from '../../lib/reveal';
  import { remindersAvailable } from '../../platform/reminders';
  import { addFolder } from '../../state/intake';
  import { library } from '../../state/library.svelte';
  import { refreshReminders, setReminder } from '../../state/reminders';
  import { AUTO_SCROLL } from '../../state/autoscroll.svelte';
  import { DAILY_GOALS, FLOW_SPEED, YEARLY_GOALS, type BackupFrequency, type Settings } from '../../state/settings';
  import { settings } from '../../state/settings.svelte';
  import { autoBackup, backupPlace, canPickSyncFolder, currentBackup, makeArchive, restoreArchive, restoreBackup, startSync, stopSync, syncNow, type MergeResult } from '../../state/sync';
  import { ui, type SettingsTab } from '../../state/ui.svelte';
  import LightControls from '../controls/LightControls.svelte';
  import ListenControls from '../controls/ListenControls.svelte';
  import PageControls from '../controls/PageControls.svelte';
  import SliderField from '../controls/SliderField.svelte';
  import TextControls from '../controls/TextControls.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const v = $derived(settings.value);
  const set = (patch: Partial<Settings>) => void settings.update(patch);
  /** The new theme spreads as a circle from the option tapped. */
  function themeTo(theme: Settings['theme'], from: Element): Promise<void> {
    if (v.theme === theme) return Promise.resolve();
    return reveal(from, async () => {
      await settings.update({ theme });
      applyTheme(theme, settings.value.oled);
    });
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  let busy = $state(false);

  // Icons that share the row evenly; only the open tab shows its word.
  const TABS: { id: SettingsTab; label: MessageKey; icon: Snippet }[] = [
    { id: 'general', label: 'settings.general', icon: generalIcon },
    { id: 'reading', label: 'settings.reading', icon: readingIcon },
    { id: 'listen', label: 'settings.listen', icon: listenIcon },
    { id: 'data', label: 'settings.data', icon: dataIcon },
    { id: 'about', label: 'settings.about', icon: aboutIcon },
  ];
  const tabs = $derived(TABS.map((x) => ({ id: x.id, label: t(x.label), icon: x.icon, domId: `settings-${x.id}`, controls: 'settingsBody' })));
  /** Which side the tab's controls slide in from: the side its tab is on. */
  let from = $state(0);
  function choose(id: SettingsTab) {
    from = Math.sign(TABS.findIndex((x) => x.id === id) - TABS.findIndex((x) => x.id === ui.settingsTab));
    ui.settingsTab = id;
  }

  // ─── General ───────────────────────────────────────────────

  async function goal(patch: Partial<Settings>) {
    await settings.update(patch);
    void refreshReminders();
  }

  const timeShown = (time: string) => {
    const [h, m] = time.split(':').map(Number) as [number, number];
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
  };
  async function toggleReminder(on: boolean) {
    if (!(await setReminder(on))) ui.notify(t('settings.reminderDenied'), 'error');
    else if (on) ui.notify(t('reminder.on', { time: timeShown(v.reminderTime) }), 'success');
  }
  async function reminderAt(time: string) {
    if (!time) return;
    await settings.update({ reminderTime: time });
    void refreshReminders();
  }

  // ─── Data ──────────────────────────────────────────────────

  /** Back up with the books' files (a .zip) or without (a small .json). */
  let withBooks = $state(false);

  async function backUp() {
    busy = true;
    try {
      if (withBooks) {
        const out = await saveFile({ name: `rosetta-library-${today()}.zip`, data: await makeArchive(), mime: 'application/zip' });
        ui.notify(t('data.archiveSaved', { where: out.label }), 'success');
      } else {
        const out = await saveFile({ name: `rosetta-backup-${today()}.json`, data: new TextEncoder().encode(JSON.stringify(await currentBackup(new Date(), true), null, 2)), mime: 'application/json' });
        ui.notify(t('data.backupSaved', { where: out.label }), 'success');
      }
    } catch (err) {
      ui.notify(t('data.archiveFailed', { reason: err instanceof Error ? err.message : String(err) }), 'error');
    } finally {
      busy = false;
    }
  }

  function report(result: MergeResult, added = 0) {
    const missing = result.missing;
    ui.notify(t('data.restored', { marks: result.putMarks.length, docs: result.docs.length, added }) + (missing ? ` ${t('data.missing', { count: missing })}` : ''), 'success');
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

  /** The folder synced with, by name, once chosen; and where automatic backups go. */
  let folder = $state<{ chosen: boolean; name?: string }>({ chosen: false });
  let place = $state<'folder' | 'documents' | null>(null);
  async function loadFolder() {
    folder = await folderStatus('sync');
    place = await backupPlace();
  }
  onMount(() => void loadFolder());
  /** On a phone, sync turned on before folders could be chosen still runs in Documents/Rosetta/sync. */
  const syncing = $derived(v.sync && (folder.chosen || isNative));

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

  async function chooseFolder() {
    const started = await startSync();
    await loadFolder();
    if (started) await runSync();
  }

  async function stop() {
    await stopSync();
    await loadFolder();
    ui.notify(t('sync.stopped'), 'info');
  }

  const FREQUENCIES: { id: BackupFrequency; label: MessageKey }[] = [
    { id: 'off', label: 'data.freqOff' },
    { id: 'daily', label: 'data.freqDaily' },
    { id: 'weekly', label: 'data.freqWeekly' },
    { id: 'monthly', label: 'data.freqMonthly' },
  ];
  async function frequency(id: BackupFrequency) {
    await settings.update({ autoBackup: id });
    if (await autoBackup()) ui.notify(t('data.autoWritten'), 'success');
  }

  async function clearAll() {
    const ok = await ui.confirm({ title: t('data.clearAllTitle'), message: t('data.clearAllMessage'), action: t('data.clearAllAction'), danger: true });
    if (!ok) return;
    const { clearEverything } = await import('../../state/reset');
    await clearEverything();
  }
</script>

{#snippet generalIcon()}<Icon name="settings-2" />{/snippet}
{#snippet readingIcon()}<Icon name="book-open" />{/snippet}
{#snippet listenIcon()}<Icon name="headphones" />{/snippet}
{#snippet dataIcon()}<Icon name="database" />{/snippet}
{#snippet aboutIcon()}<Icon name="info" />{/snippet}

<Sheet title={t('settings.title')} {onclose} tall>
  <div class="sheet-tabs sheet-icon-tabs">
    <IconTabs {tabs} value={ui.settingsTab} label={t('settings.title')} onselect={choose} />
  </div>

  {#key ui.settingsTab}
  <div class="settings-body axis-stage axis-small" style:--from={from} id="settingsBody" role="tabpanel" aria-labelledby="settings-{ui.settingsTab}">
    {#if ui.settingsTab === 'general'}
      <section class="settings-group">
        <h3 class="t-section-label">{t('settings.appearance')}</h3>
        <div class="field">
          <span class="t-field-label" id="themeLabel">{t('type.theme')}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="themeLabel">
            {#each [['system', t('type.system')], ['dark', t('type.dusk')], ['light', t('type.dawn')]] as const as [id, label] (id)}
              <button type="button" role="radio" data-theme-option={id} aria-checked={v.theme === id} onclick={(e) => void themeTo(id, e.currentTarget)}>{label}</button>
            {/each}
          </div>
        </div>
        <label class="field">
          <span class="t-field-label">{t('type.language')}</span>
          <Select
            id="language"
            value={v.locale}
            options={[{ value: 'system' as Settings['locale'], label: t('type.system') }, ...LOCALES.map((l) => ({ value: l as Settings['locale'], label: LOCALE_NAMES[l] }))]}
            onchange={(l) => set({ locale: l })}
          />
        </label>
        {#if isNative}
          <div class="settings-list">
            <Switch checked={v.haptics} label={t('type.haptics')} hint={t('type.hapticsHint')} onchange={(on) => set({ haptics: on })} />
          </div>
        {/if}
      </section>

      <section class="settings-group">
        <h3 class="t-section-label">{t('settings.goals')}</h3>
        <div class="field">
          <span class="t-field-label" id="goalLabel">{t('stats.goal')}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="goalLabel">
            {#each DAILY_GOALS as minutes (minutes)}
              <button type="button" role="radio" aria-checked={v.dailyGoal === minutes} data-goal={minutes} onclick={() => void goal({ dailyGoal: minutes })}>
                {minutes ? t('time.minutes', { count: minutes }) : t('stats.goalOff')}
              </button>
            {/each}
          </div>
          <span class="field-hint">{t('stats.goalHint')}</span>
        </div>
        <div class="field">
          <span class="t-field-label" id="yearGoalLabel">{t('stats.yearGoal', { year })}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="yearGoalLabel">
            {#each YEARLY_GOALS as books (books)}
              <button type="button" role="radio" aria-checked={v.yearlyGoal === books} data-year-goal={books} onclick={() => set({ yearlyGoal: books })}>{books || t('stats.goalOff')}</button>
            {/each}
          </div>
        </div>
      </section>

      <section class="settings-group">
        <h3 class="t-section-label">{t('settings.reminder')}</h3>
        {#if remindersAvailable}
          <div class="settings-list">
            <Switch checked={v.reminder} label={t('settings.reminderLabel')} hint={t('settings.reminderHint')} onchange={(on) => void toggleReminder(on)} />
          </div>
          {#if v.reminder}
            <div class="field">
              <TimeField
                id="reminderTime"
                label={t('settings.reminderTime')}
                value={v.reminderTime}
                locale={locale()}
                words={{ hour: t('time.hour'), minute: t('time.minute'), cancel: t('action.cancel'), choose: t('time.choose'), close: t('action.close'), empty: t('time.empty'), plusMinutes: (n) => t('time.plusMinutes', { count: n }) }}
                onchange={(time) => void reminderAt(time)}
              />
            </div>
          {/if}
        {:else}
          <p class="t-hint">{t('settings.reminderWeb')}</p>
        {/if}
      </section>

      <section class="settings-group">
        <h3 class="t-section-label">{t('settings.library')}</h3>
        <div class="btn-grid">
          <button type="button" class="btn btn-secondary" id="openStorage" onclick={() => ui.open('storage')}>{t('storage.title')}</button>
          {#if isNative || canPickFolder}<button type="button" class="btn btn-secondary" id="addFolder" onclick={() => void addFolder()}>{t('library.addFolder')}</button>{/if}
        </div>
      </section>
    {:else if ui.settingsTab === 'reading'}
      <p class="t-hint reading-hint">{t('settings.readingHint')}</p>
      <section class="settings-group">
        <h3 class="t-section-label">{t('panel.text')}</h3>
        <TextControls {v} {set} bookStyles />
      </section>
      <section class="settings-group">
        <h3 class="t-section-label">{t('panel.page')}</h3>
        <PageControls {v} {set} />
        <div class="field">
          <span class="t-field-label" id="turnLabel">{t('type.pageTurn')}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="turnLabel">
            {#each [['curl', t('type.curl')], ['slide', t('type.slide')], ['none', t('type.none')]] as const as [id, label] (id)}
              <button type="button" role="radio" id="turn-{id}" aria-checked={v.pageTurn === id} onclick={() => set({ pageTurn: id })}>{label}</button>
            {/each}
          </div>
          <span class="field-hint">{t('type.pageTurnHint')}</span>
        </div>
        <SliderField id="flowSpeed" label={t('type.flowSpeed')} hint={t('type.flowSpeedHint')} value={v.flowSpeed} min={FLOW_SPEED.min} max={FLOW_SPEED.max} step={FLOW_SPEED.step} shown={String(v.flowSpeed)} lessLabel={t('type.slower')} moreLabel={t('type.faster')} onchange={(n) => set({ flowSpeed: n })} />
        <SliderField id="scrollSpeed" label={t('type.scrollSpeed')} hint={t('type.scrollSpeedHint')} value={v.autoScrollSpeed} min={AUTO_SCROLL.min} max={AUTO_SCROLL.max} step={AUTO_SCROLL.step} shown={t('autoscroll.speed', { lines: v.autoScrollSpeed })} lessLabel={t('autoscroll.slower')} moreLabel={t('autoscroll.faster')} onchange={(n) => set({ autoScrollSpeed: n })} />
        {#if volumeKeysAvailable}
          <div class="settings-list">
            <Switch checked={v.volumeKeys} label={t('type.volumeKeys')} hint={t('type.volumeKeysHint')} onchange={(on) => set({ volumeKeys: on })} />
          </div>
        {/if}
      </section>
      <section class="settings-group">
        <h3 class="t-section-label">{t('panel.light')}</h3>
        <LightControls {v} {set} />
      </section>
      <section class="settings-group">
        <h3 class="t-section-label">{t('settings.advanced')}</h3>
        <div class="settings-list">
          <Switch checked={v.ruler} label={t('type.ruler')} hint={t('type.rulerHint')} onchange={(on) => set({ ruler: on })} />
          <Switch checked={v.anchors} label={t('type.anchors')} hint={t('type.anchorsHint')} onchange={(on) => set({ anchors: on })} />
          <Switch checked={v.spreads} label={t('type.spreads')} hint={t('type.spreadsHint')} onchange={(on) => set({ spreads: on })} />
        </div>
        <div class="field">
          <span class="t-field-label" id="columnLabel">{t('type.column')}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="columnLabel">
            {#each [['narrow', t('type.narrow')], ['medium', t('type.medium')], ['wide', t('type.wide')]] as const as [id, label] (id)}
              <button type="button" role="radio" data-measure={id} aria-checked={v.measure === id} onclick={() => set({ measure: id })}>{label}</button>
            {/each}
          </div>
          <span class="field-hint">{t('type.columnHint')}</span>
        </div>
      </section>
    {:else if ui.settingsTab === 'listen'}
      <section class="settings-group">
        <ListenControls {v} {set} />
        <p class="t-hint">{t('settings.listenHint')}</p>
      </section>
    {:else if ui.settingsTab === 'data'}
      <section class="settings-group">
        <h3 class="t-section-label">{t('data.backupTitle')}</h3>
        <div class="settings-list">
          <Switch checked={withBooks} label={t('data.withBooks')} hint={t('data.withBooksHint')} onchange={(on) => (withBooks = on)} />
        </div>
        <div class="btn-grid">
          <button type="button" class="btn btn-secondary" id="backUp" disabled={busy || (withBooks && !library.items.length)} onclick={() => void backUp()}>{t('data.backupNow')}</button>
          <button type="button" class="btn btn-muted" id="restore" disabled={busy} onclick={() => void restore()}>{t('data.restore')}</button>
        </div>
        {#if busy}<WavyProgress label={t('data.working')} />{/if}
      </section>

      <section class="settings-group">
        <h3 class="t-section-label">{t('sync.title')}</h3>
        {#if isNative || canPickSyncFolder}
          <p class="t-hint">{t('sync.hint')}</p>
          {#if syncing}
            <p class="t-body-small" id="syncStatus">
              {folder.chosen ? t('sync.status', { folder: folder.name || '…', when: v.lastSync ? relativeTime(v.lastSync) : t('sync.never') }) : t('sync.inLegacy')}
            </p>
            <div class="btn-row-wrap">
              <button type="button" class="btn btn-secondary" id="syncNow" disabled={busy} onclick={() => void runSync()}>{t('sync.now')}</button>
              <button type="button" class="btn btn-muted" id="chooseSyncFolder" disabled={busy} onclick={() => void chooseFolder()}>{folder.chosen ? t('sync.change') : t('sync.start')}</button>
              <button type="button" class="btn btn-muted" id="stopSync" disabled={busy} onclick={() => void stop()}>{t('sync.stop')}</button>
            </div>
          {:else}
            <button type="button" class="btn btn-secondary start-sync" id="chooseSyncFolder" disabled={busy} onclick={() => void chooseFolder()}>{t('sync.start')}</button>
          {/if}

          <div class="field">
            <span class="t-field-label" id="autoBackupLabel">{t('data.autoLabel')}</span>
            <div class="segmented" role="radiogroup" aria-labelledby="autoBackupLabel">
              {#each FREQUENCIES as f (f.id)}
                <button type="button" role="radio" data-frequency={f.id} aria-checked={v.autoBackup === f.id} onclick={() => void frequency(f.id)}>{t(f.label)}</button>
              {/each}
            </div>
            {#if v.autoBackup !== 'off'}
              <span class="field-hint" id="backupWhere">
                {place === 'folder' ? t('data.autoInFolder') : place === 'documents' ? t('data.autoInDocuments') : t('data.autoNowhere')}
                {#if v.lastAutoBackup}{t('data.lastBackup', { when: relativeTime(v.lastAutoBackup) })}{/if}
              </span>
            {/if}
          </div>
        {:else}
          <p class="t-hint">{t('sync.web')}</p>
        {/if}
      </section>

      <section class="settings-group">
        <h3 class="t-section-label">{t('data.startOver')}</h3>
        <p class="t-hint">{t('data.clearAllHint')}</p>
        <button type="button" class="btn btn-danger clear-all" id="clearAll" onclick={() => void clearAll()}>{t('data.clearAll')}</button>
      </section>
    {:else}
      <section class="settings-group">
        <p class="t-body-small" id="appVersion">{t('about.version', { version: __APP_VERSION__ })}</p>
        <p class="t-body-small dim" id="eggCount">{t('about.eggs', { found: eggsFound(), total: EGGS.length })}</p>
        <p class="t-hint"><em>{t('about.privateTerm')}</em> {t('about.private')}</p>
      </section>
    {/if}
  </div>
  {/key}
</Sheet>

<style>
  .sheet-tabs {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 0 calc(-1 * var(--space-5));
    padding: 0 var(--space-5);
    background: var(--sheet-bg);
  }
  .settings-body {
    display: flex;
    flex-direction: column;
  }
  .settings-body > .settings-group:first-child,
  .reading-hint + .settings-group {
    padding-top: var(--space-3);
  }
  .reading-hint {
    padding-top: var(--space-4);
  }
  /* Groups of actions: two equal columns, so the buttons line up instead of
     wrapping to ragged rows. A lone last button takes the whole row. */
  .btn-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }
  .btn-row-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .start-sync,
  .clear-all {
    align-self: flex-start;
  }
</style>
