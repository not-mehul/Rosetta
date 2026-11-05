// Shares a highlight as a quote card image.

import { locale, t } from '../i18n/index.svelte';
import { shareFile } from '../platform/output';
import type { Mark, StoredDoc } from '../state/db';
import { ui } from '../state/ui.svelte';
import { renderQuoteCard } from './card';
import { slug } from './export';

export async function shareQuote(mark: Pick<Mark, 'text'>, doc: Pick<StoredDoc, 'title' | 'author'>): Promise<void> {
  try {
    const png = await renderQuoteCard({
      quote: mark.text,
      title: doc.title,
      author: doc.author,
      date: new Date(),
      locale: locale(),
      tagline: t('card.tagline'),
    });
    await shareFile({ name: `${slug(doc.title)}-quote.png`, data: png, mime: 'image/png' }, doc.title);
  } catch (err) {
    ui.notify(
      t('card.failed', {
        reason: err instanceof Error ? err.message : String(err),
      }),
      'error',
    );
  }
}
