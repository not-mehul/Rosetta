import { describe, expect, it } from 'vitest';
import { cleanBookSettings, DEFAULT_SETTINGS, settingsFor } from '../../src/state/settings';

describe('settings per book', () => {
  it('reads with the defaults until the book has its own', () => {
    expect(settingsFor(DEFAULT_SETTINGS, undefined)).toBe(DEFAULT_SETTINGS);
    const v = settingsFor({ ...DEFAULT_SETTINGS, fontSize: 20 }, { readingMode: 'flow' });
    expect(v.readingMode).toBe('flow');
    expect(v.fontSize).toBe(20);
  });

  it('keeps only reading settings that fit', () => {
    expect(cleanBookSettings({ fontSize: 22, readingMode: 'sideways', theme: 'dark', pdfZoom: 99 })).toEqual({ fontSize: 22 });
    expect(cleanBookSettings(null)).toEqual({});
  });

  it('falls back when the book wants a font file that has been removed', () => {
    expect(settingsFor({ ...DEFAULT_SETTINGS, customFont: '' }, { typeface: 'custom' }).typeface).toBe('serif');
    expect(settingsFor({ ...DEFAULT_SETTINGS, customFont: 'Mine.ttf' }, { typeface: 'custom' }).typeface).toBe('custom');
  });
});
