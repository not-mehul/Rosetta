// Stats across a clock change, heading ids, and plain-text headings.
import { afterAll, describe, expect, it } from 'vitest';
import { headingToc } from '../../src/formats/sanitize';
import { textToHtml } from '../../src/formats/flow';
import { summarise } from '../../src/state/stats.svelte';

const zone = process.env.TZ;
afterAll(() => {
  process.env.TZ = zone;
});

describe('stats across a clock change', () => {
  it('the week has seven different days, and the streak holds, just after a spring-forward midnight', () => {
    process.env.TZ = 'America/Chicago';
    // Clocks went forward on 14 March 2027; it's 00:30 on the 15th.
    const now = new Date(2027, 2, 15, 0, 30).getTime();
    const sessions = ['2027-03-13', '2027-03-14', '2027-03-15'].map((day) => ({ id: `${day}|d`, day, docId: 'd', ms: 600_000, chars: 0 }));
    const s = summarise(sessions, now);
    expect(s.week.map((w) => w.day)).toEqual(['2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12', '2027-03-13', '2027-03-14', '2027-03-15']);
    expect(s.streak).toBe(3);
  });

  it('and after a fall-back midnight', () => {
    process.env.TZ = 'America/Chicago';
    const now = new Date(2026, 10, 2, 23, 30).getTime(); // the day after clocks went back (1 Nov 2026), late evening
    const s = summarise([], now);
    expect(new Set(s.week.map((w) => w.day)).size).toBe(7);
    expect(s.week.at(-1)!.day).toBe('2026-11-02');
  });
});

describe('heading ids', () => {
  it('never collide with ids the document already has', () => {
    const { html, toc } = headingToc('<p id="h1">intro</p><h2>Alpha</h2><h2>Beta</h2>');
    const t = document.createElement('template');
    t.innerHTML = html;
    const ids = [...t.content.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(toc.map((e) => e.anchor)).toEqual(['r-h0', 'r-h1-2']);
  });
});

describe('plain-text headings', () => {
  it('a short all-caps line is a heading; a long shouted one is not', () => {
    expect(textToHtml('THE SPECKLED BAND')).toBe('<h2>THE SPECKLED BAND</h2>');
    expect(textToHtml('I AM NOT A CHAPTER TITLE BUT A LINE OF DIALOGUE')).not.toContain('<h2>');
  });
});
