// Fitting controls to large text (the phone's text size turned up), where a
// layout made for the usual size would clip or break:
// - A sheet's icon tabs (Settings, Aa, Contents) show the open tab's word
//   under its icon; once that word no longer fits its share of the row, it
//   goes, and the amber icon and its rule say which tab is open.
// - A segmented control whose options no longer fit one line (Sort, at
//   150%) becomes an even grid of two to a row, rather than three and one.
// Both are measured, not guessed: a ResizeObserver on each, and a look
// again when a tab is chosen or a control is added.

const TABS = '.sheet-icon-tabs';
const SEGMENTED = '.field > .segmented, .settings-group > .segmented, .library-tools > .segmented';

function fitTabs(host: HTMLElement) {
  host.classList.remove('is-tight');
  const word = host.querySelector<HTMLElement>('[role="tab"][aria-selected="true"] .icon-tab-word');
  if (word && word.scrollWidth > word.clientWidth + 0.5) host.classList.add('is-tight');
}

function fitSegmented(el: HTMLElement) {
  el.classList.remove('is-wrapped');
  const buttons = [...el.children] as HTMLElement[];
  if (buttons.length < 3) return;
  const top = buttons[0]!.offsetTop;
  if (buttons.some((b) => b.offsetTop > top + 2)) el.classList.add('is-wrapped');
}

export function startFitting(root: HTMLElement = document.body): () => void {
  const seen = new WeakSet<Element>();
  const resize = new ResizeObserver((entries) => {
    for (const { target } of entries) (target.matches(TABS) ? fitTabs : fitSegmented)(target as HTMLElement);
  });
  const scan = () => {
    for (const el of root.querySelectorAll<HTMLElement>(`${TABS}, ${SEGMENTED}`)) {
      if (seen.has(el)) continue;
      seen.add(el);
      resize.observe(el);
    }
  };
  // New sheets and panels as they open; a tab chosen changes which word must fit.
  const mutations = new MutationObserver((records) => {
    scan();
    for (const r of records) {
      if (r.type !== 'attributes') continue;
      const host = (r.target as Element).closest<HTMLElement>(TABS);
      if (host) fitTabs(host);
    }
  });
  mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
  scan();
  return () => {
    mutations.disconnect();
    resize.disconnect();
  };
}
