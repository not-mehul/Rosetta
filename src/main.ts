// Rosetta: loads settings and the library, applies the theme, mounts the
// Svelte UI, and wires the native shell (back button, splash, open-with).

import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { mount } from 'svelte';
import App from './App.svelte';
import { setLocale, t } from './i18n/index.svelte';
import { parseRosettaUrl, sendToBookShelf } from './platform/handoff';
import { loadCustomFont } from './platform/fonts';
import { listenForFiles } from './platform/intake';
import { isNative } from './platform/native';
import { applyTheme } from './platform/theme.svelte';
import { addFiles } from './state/intake';
import { library } from './state/library.svelte';
import { reader } from './state/reader.svelte';
import { settings } from './state/settings.svelte';
import { stats } from './state/stats.svelte';
import { autoBackup, syncNow } from './state/sync';
import { ui } from './state/ui.svelte';
import './styles/app.css';

async function start(): Promise<void> {
  await Promise.all([settings.load(), library.load(), stats.load()]).catch((err) => console.error('Loading saved data failed:', err));
  applyTheme(settings.value.theme, settings.value.oled);
  // The reader's own font, if they added one; a lost file falls back to serif.
  const font = await loadCustomFont();
  if (font !== settings.value.customFont || (!font && settings.value.typeface === 'custom')) {
    await settings.update({ customFont: font, ...(!font && settings.value.typeface === 'custom' ? { typeface: 'serif' as const } : {}) });
  }
  await setLocale(settings.value.locale).catch(() => undefined);
  await syncNow().catch((err) => console.warn('Sync failed:', err));

  mount(App, { target: document.getElementById('app')! });

  // Back into the document that was open, at the same place.
  const last = settings.value.lastDocId;
  if (last && library.get(last)) await reader.open(last);

  // A finished book can go to BookShelf.
  reader.onFinished = (doc) => {
    if (!isNative) return;
    ui.notify(t('handoff.finished'), 'success', { label: t('handoff.logIt'), run: () => void sendToBookShelf(doc) });
  };

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
      if (!ui.back()) void CapacitorApp.exitApp();
    });
    void CapacitorApp.addListener('pause', () => {
      reader.flush();
      void syncNow().catch(() => undefined);
    });
    void CapacitorApp.addListener('resume', () => void syncNow().catch(() => undefined));
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
    void autoBackup();
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
