// The theme on screen: System, Dusk (dark) or Dawn (light), and OLED black for
// Dusk. Paints data-theme and data-oled,
// the theme-color meta, and the system bars (style.md §2, §14).

import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import type { ThemeSetting } from '../state/settings';
import { isNative } from './native';

/** Read by the inline script in index.html, so the first paint has the right theme. */
const STORAGE_KEY = 'rosetta.theme';
const OLED_KEY = 'rosetta.oled';

const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
let current: ThemeSetting = 'system';
let black = false;

/** The theme on screen now, after "system" is resolved. */
export const shown = $state({ dark: true });

function resolved(setting: ThemeSetting): 'light' | 'dark' {
  if (setting !== 'system') return setting;
  return media?.matches === false ? 'light' : 'dark';
}

function paint(): void {
  const theme = resolved(current);
  document.documentElement.dataset.theme = theme;
  // OLED: Dusk's surfaces go to true black (app.css); Dawn is unchanged.
  if (black) document.documentElement.dataset.oled = '';
  else delete document.documentElement.dataset.oled;
  shown.dark = theme === 'dark';
  const surface = getComputedStyle(document.documentElement).getPropertyValue('--bg-grad-mid').trim();
  if (surface) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface);
  if (isNative) {
    // DARK = light icons for dark backgrounds.
    void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  }
  dispatchEvent(new Event('themechange'));
}

media?.addEventListener('change', () => {
  if (current === 'system') paint();
});

export function applyTheme(setting: ThemeSetting, oled = false): void {
  current = setting;
  black = oled;
  try {
    localStorage.setItem(STORAGE_KEY, setting);
    localStorage.setItem(OLED_KEY, oled ? '1' : '');
  } catch {
    // Private mode: the first paint falls back to the system theme.
  }
  paint();
}

/** The header switch: picks the side opposite to the one on screen. */
export function toggledTheme(): ThemeSetting {
  return shown.dark ? 'light' : 'dark';
}
