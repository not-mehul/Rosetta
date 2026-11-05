// Rosetta: loads settings and the library, applies the theme, mounts the
// Svelte UI, and wires the native shell (back button, splash, open-with).

import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { mount } from 'svelte';
import App from './App.svelte';
import { listenForFiles } from './platform/intake';
import { isNative } from './platform/native';
import { applyTheme } from './platform/theme.svelte';
import { addFiles } from './state/intake';
import { library } from './state/library.svelte';
import { reader } from './state/reader.svelte';
import { settings } from './state/settings.svelte';
import { ui } from './state/ui.svelte';
import './styles/app.css';

async function start(): Promise<void> {
  await Promise.all([settings.load(), library.load()]).catch((err) => console.error('Loading saved data failed:', err));
  applyTheme(settings.value.theme);

  mount(App, { target: document.getElementById('app')! });

  // Back into the document that was open, at the same place.
  const last = settings.value.lastDocId;
  if (last && library.get(last)) await reader.open(last);

  ui.onBack = () => {
    if (!reader.doc) return false;
    reader.close();
    return true;
  };

  if (isNative) {
    // Android back: overlays, then the reader, then exit.
    void CapacitorApp.addListener('backButton', () => {
      if (!ui.back()) void CapacitorApp.exitApp();
    });
    void CapacitorApp.addListener('pause', () => reader.flush());
    void listenForFiles(
      (file) => void addFiles([file], { openSingle: true }),
      (err) => ui.notify(`Couldn’t open that file (${err instanceof Error ? err.message : String(err)}).`, 'error'),
    );
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
