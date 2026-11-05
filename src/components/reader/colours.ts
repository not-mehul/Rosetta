import type { HighlightColour } from '../../state/db';

/** Highlight colours: the accent tints, in the order the series tokens use them. */
export const COLOURS: { id: HighlightColour; label: string }[] = [
  { id: 'amber', label: 'Amber' },
  { id: 'sage', label: 'Sage' },
  { id: 'bright', label: 'Gold' },
];
