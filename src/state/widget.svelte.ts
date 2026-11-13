// Keeps the Continue Reading widget on the book last opened and not finished,
// in the reader's language, as the library changes.

import { t } from "../i18n/index.svelte";
import { bookToContinue, updateWidget } from "../platform/widget";
import { library } from "./library.svelte";

export function followForWidget(): void {
  $effect.root(() => {
    $effect(() => {
      updateWidget(bookToContinue(library.items), {
        eyebrow: t("widget.continue"),
        progress: (percent) => t("widget.percent", { percent }),
        empty: t("widget.empty"),
      });
    });
  });
}
