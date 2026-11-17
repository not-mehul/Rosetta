// Rosetta: loads settings and the library, applies the theme, mounts the
// Svelte UI, and wires the native shell (back button, splash, open-with).

import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { dismissOverlay } from 'dusk-dawn';
import { mount } from 'svelte';
import App from './App.svelte';
import { setLocale, t } from './i18n/index.svelte';
import { canOpen, parseRosettaUrl, sendToBookShelf } from './platform/handoff';
import { listenForFiles } from './platform/intake';
import { listenForSharedText, sharedDocument } from './platform/shared';
import { isNative } from './platform/native';
import { applyTheme } from './platform/theme.svelte';
import { addFiles } from './state/intake';
import { library } from './state/library.svelte';
import { reader } from './state/reader.svelte';
import { settings } from './state/settings.svelte';
import { stats } from './state/stats.svelte';
import { autoBackup, syncNow, whenMerged } from './state/sync';
import { db } from './state/db';
import { refreshReminders } from './state/reminders';
import { ui } from './state/ui.svelte';
import { followForWidget } from './state/widget.svelte';
import './styles/app.css';

async function start(): Promise<void> {
  await Promise.all([settings.load(), library.load(), stats.load()]).catch((err) => console.error('Loading saved data failed:', err));
  applyTheme(settings.value.theme, settings.value.oled);
  // A font file of one's own was kept here before typefaces became Serif and Sans.
  void db.settings.delete('customFont' as 'settings').catch(() => undefined);
  await setLocale(settings.value.locale).catch(() => undefined);
  // A sync that brings the open document a newer place lets the reader follow it.
  whenMerged((result) => {
    for (const { id, patch } of result.docs) reader.followRemote(id, patch);
  });
  await syncNow().catch((err) => console.warn('Sync failed:', err));
  // A backup when one is due: into the sync folder, or Documents/Rosetta/backups on a phone.
  void autoBackup();

  mount(App, { target: document.getElementById('app')! });

  // Back into the document that was open, at the same place.
  const last = settings.value.lastDocId;
  if (last && library.get(last)) await reader.open(last);

  // A finished book can go to BookShelf, offered once.
  reader.onFinished = async (doc) => {
    if (!isNative || !(await canOpen('bookshelf'))) return;
    ui.notify(t('handoff.finished'), 'success', { label: t('handoff.logIt'), run: () => void sendToBookShelf(doc) });
  };

  // The Continue Reading widget follows the library: the book last opened and not finished.
  followForWidget();

  // Today's goal, met while reading: said once, quietly.
  stats.onGoal = (minutes) => {
    if (!ui.toast?.action) ui.notify(t('stats.goalMet', { count: minutes }), 'success');
  };

  ui.onBack = () => {
    if (!reader.doc) return false;
    reader.leave();
    return true;
  };

  if (isNative) {
    // Android back: overlays, then the reader, then exit.
    void CapacitorApp.addListener('backButton', () => {
      if (dismissOverlay()) return;
      if (!ui.back()) void CapacitorApp.exitApp();
    });
    void CapacitorApp.addListener('pause', () => {
      reader.flush();
      void syncNow().catch(() => undefined);
      void refreshReminders();
    });
    void CapacitorApp.addListener('resume', () => {
      void syncNow().catch(() => undefined);
      void autoBackup();
      void refreshReminders();
    });
    void listenForFiles(
      (file) => void addFiles([file], { openSingle: true }),
      (err) => ui.notify(t('intake.openFailed', { reason: err instanceof Error ? err.message : String(err) }), 'error'),
      (url) => {
        const link = parseRosettaUrl(url);
        if (!link) return;
        const doc = link.id ? library.get(link.id) : library.items.find((d) => d.title.toLowerCase() === link.title?.toLowerCase());
        if (doc) void reader.open(doc.id);
        else ui.notify(t('intake.notInLibrary'), 'info');
      },
    );
    void listenForSharedText((text, subject) => {
      const doc = sharedDocument(text, subject);
      if (doc) void addFiles([doc], { openSingle: true });
      else ui.notify(t('intake.sharedLink'), 'info');
    });
    void refreshReminders();
    await SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined);
  } else {
    // Escape closes the reader in a browser, after any sheet.
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('dialog[open]')) ui.back();
    });
  }
  addEventListener('pagehide', () => reader.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') reader.flush();
  });
}

void start();
