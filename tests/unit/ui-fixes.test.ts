// Small UI fixes: read-aloud failures in words, "Under a minute", the pace before it's measured.
import { describe, expect, it } from 'vitest';
import { duration } from '../../src/lib/format';
import { speechFailure } from '../../src/state/speech.svelte';
import { summarise } from '../../src/state/stats.svelte';

describe('read aloud failing', () => {
  it('never shows an [object …], and says what to do when no voice answers', () => {
    const noVoice = speechFailure({ error: 'synthesis-failed', toString: () => '[object SpeechSynthesisErrorEvent]' });
    expect(noVoice).toContain('text-to-speech');
    expect(noVoice).not.toContain('[object');
    expect(speechFailure({})).toBe(noVoice);
    expect(speechFailure(new Error('TTS engine not yet initialized'))).toBe(noVoice);
    expect(speechFailure(new Error('The audio route changed'))).toContain('The audio route changed');
  });
});

describe('figures', () => {
  it('a little reading is "Under a minute", none is "0 min"', () => {
    expect(duration(20_000)).toBe('Under a minute');
    expect(duration(0)).toBe('0 min');
    expect(duration(90_000)).toBe('2 min');
  });

  it('the pace is only "measured" after ten minutes of reading', () => {
    const day = '2026-11-16';
    expect(summarise([{ id: `${day}|d`, day, docId: 'd', ms: 5 * 60_000, chars: 9000 }]).paceMeasured).toBe(false);
    expect(summarise([{ id: `${day}|d`, day, docId: 'd', ms: 12 * 60_000, chars: 20000 }]).paceMeasured).toBe(true);
  });
});
