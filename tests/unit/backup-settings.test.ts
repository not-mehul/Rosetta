import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, portableSettings, restoredSettings, type Settings } from '../../src/state/settings';
import { makeBackup, parseBackup } from '../../src/lib/export';

const mine: Settings = {
  ...DEFAULT_SETTINGS,
  theme: 'light',
  fontSize: 21,
  dailyGoal: 30,
  customFont: 'Mine.ttf',
  sync: true,
  lastDocId: 'abc',
  lastAutoBackup: 99,
};

describe('settings in backups', () => {
  it('carries the settings without what belongs to this device', () => {
    const p = portableSettings(mine);
    expect(p.theme).toBe('light');
    expect(p.dailyGoal).toBe(30);
    for (const key of ['customFont', 'sync', 'lastDocId', 'lastAutoBackup']) expect(p).not.toHaveProperty(key);
  });

  it('round-trips through a backup, and only when asked', () => {
    const withSettings = parseBackup(JSON.stringify(makeBackup([], [], new Date(), [], [], portableSettings(mine))));
    expect(withSettings.settings?.fontSize).toBe(21);
    expect(makeBackup([], [])).not.toHaveProperty('settings');
  });

  it('restores over the settings in use, keeping what belongs to this device', () => {
    const here: Settings = { ...DEFAULT_SETTINGS, customFont: 'Here.ttf' };
    const back = restoredSettings(here, portableSettings(mine));
    expect(back.theme).toBe('light');
    expect(back.fontSize).toBe(21);
    expect(back.customFont).toBe('Here.ttf');
  });

  it('ignores values that do not fit', () => {
    const back = restoredSettings(mine, { fontSize: 400, theme: 'neon', dailyGoal: 15 });
    expect(back.fontSize).toBe(21);
    expect(back.theme).toBe('light');
    expect(back.dailyGoal).toBe(15);
  });
});
