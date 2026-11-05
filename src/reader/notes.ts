// Footnotes: which links are note references, and the note they point at, so
// the reader can show the note in place instead of jumping away from the page.

const NOTE_ID = /^r-(fn|ftn|footnote|note|endnote|en|nt)[-_:.]?\w*/i;
const NOTE_TEXT = /^\[?(\d{1,4}|[*†‡§¶]|[ivxlc]{1,6}|[a-z])\]?$/i;

/** True when a link looks like a reference to a note rather than a cross-reference. */
export function isNoteRef(link: Element, target: Element | null): boolean {
  const type = `${link.getAttribute('epub:type') ?? ''} ${link.getAttribute('role') ?? ''}`;
  if (/noteref|doc-noteref|doc-footnote/i.test(type)) return true;
  if (!target) return false;
  const targetType = `${target.getAttribute('epub:type') ?? ''} ${target.getAttribute('role') ?? ''} ${target.closest('aside, [epub\\:type], [role]')?.getAttribute('epub:type') ?? ''}`;
  if (/footnote|endnote|rearnote|note\b|doc-endnote|doc-footnote/i.test(targetType)) return true;
  const text = (link.textContent ?? '').trim();
  const inSup = !!link.closest('sup') || !!link.querySelector('sup');
  return NOTE_TEXT.test(text) && (inSup || NOTE_ID.test(target.id));
}

/** The note's HTML without its back-link ("↩", "^", the number linking home). */
export function noteHtml(target: Element): string {
  // An anchor marking the note's start: the note is its paragraph or list item.
  let el: Element = target;
  if (el.tagName === 'A' && !el.textContent?.trim()) el = el.closest('p, li, aside, div') ?? el;
  if ((el.tagName === 'A' || el.tagName === 'SPAN') && el.parentElement) el = el.closest('p, li, aside, div, section') ?? el;
  const copy = el.cloneNode(true) as Element;
  for (const a of copy.querySelectorAll('a[data-link]')) {
    const t = (a.textContent ?? '').trim();
    if (/^[↩↑^⤴]|^back$|^return$/i.test(t) || NOTE_TEXT.test(t)) a.replaceWith(...(/^[↩↑^⤴]/.test(t) ? [] : [document.createTextNode(t)]));
  }
  copy.removeAttribute('id');
  for (const n of copy.querySelectorAll('[id]')) n.removeAttribute('id');
  return copy.innerHTML.trim() || copy.outerHTML;
}
