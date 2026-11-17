import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, portableSettings, restoredSettings, type Settings } from '../../src/state/settings';
import { makeBackup, parseBackup } from '../../src/lib/export';

const mine: Settings = {
  ...DEFAULT_SETTINGS,
  theme: 'light',
  fontSize: 21,
  dailyGoal: 30,
  reminder: true,
  sync: true,
  lastDocId: 'abc',
  lastAutoBackup: 99,
};

describe('settings in backups', () => {
  it('carries the settings without what belongs to this device', () => {
    const p = portableSettings(mine);
    expect(p.theme).toBe('light');
    expect(p.dailyGoal).toBe(30);
    for (const key of ['reminder', 'sync', 'lastDocId', 'lastAutoBackup']) expect(p).not.toHaveProperty(key);
  });

  it('round-trips through a backup, and only when asked', () => {
    const withSettings = parseBackup(JSON.stringify(makeBackup([], [], new Date(), [], [], portableSettings(mine))));
    expect(withSettings.settings?.fontSize).toBe(21);
    expect(makeBackup([], [])).not.toHaveProperty('settings');
  });

  it('restores over the settings in use, keeping what belongs to this device', () => {
    const here: Settings = { ...DEFAULT_SETTINGS, reminder: false };
    const back = restoredSettings(here, portableSettings(mine));
    expect(back.theme).toBe('light');
    expect(back.fontSize).toBe(21);
    expect(back.reminder).toBe(false);
  });

  it('ignores values that do not fit', () => {
    const back = restoredSettings(mine, { fontSize: 400, theme: 'neon', dailyGoal: 15 });
    expect(back.fontSize).toBe(21);
    expect(back.theme).toBe('light');
    expect(back.dailyGoal).toBe(15);
  });

  it('carries old settings over: backups on or off, dim and warmth', () => {
    expect(mergeSettings({ autoBackup: true } as never).autoBackup).toBe('weekly');
    expect(mergeSettings({ autoBackup: false } as never).autoBackup).toBe('off');
    expect(mergeSettings({ dim: 0.45, warmth: 1 } as never).nightLight).toBe('night');
    expect(mergeSettings({ dim: 0, warmth: 0.5 } as never).nightLight).toBe('warm');
    expect(mergeSettings({ dim: 0, warmth: 0 } as never).nightLight).toBe('off');
    expect(mergeSettings({ reminderTime: '7:30' }).reminderTime).toBe('20:00');
    expect(mergeSettings({ reminderTime: '07:30' }).reminderTime).toBe('07:30');
  });
});
