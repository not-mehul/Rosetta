// The settings in use, loaded once at start and saved on every change.

import { db } from './db';
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from './settings';

class SettingsState {
  value = $state<Settings>({ ...DEFAULT_SETTINGS });

  async load(): Promise<void> {
    const stored = await db.settings.get('settings').catch(() => undefined);
    this.value = mergeSettings(stored?.value);
  }

  async update(patch: Partial<Settings>): Promise<void> {
    Object.assign(this.value, patch);
    await db.settings.put({ id: 'settings', value: $state.snapshot(this.value) }).catch((err) => console.warn('Saving settings failed:', err));
  }
}

export const settings = new SettingsState();
