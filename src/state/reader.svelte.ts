// The open document: its content, where the reader is, and its bookmarks and
// highlights. The views render from here and report the location back.

import { cheer } from '../lib/delight';
import { openDocument, PasswordError, type OpenDoc } from '../formats';
import { FORMAT_LABEL } from '../formats/types';
import { blockBreaks } from '../reader/cadence';
import { excerpt } from '../reader/offsets';
import { chapterAt, chapterTicks, FAR_CHARS, flowProgress, globalOffset, pageProgress, START, type Location } from '../reader/progress';
import { queryPattern, searchText, MAX_HITS, type Hit } from '../reader/search';
import { t } from '../i18n/index.svelte';
import { duration } from '../lib/format';
import { tick } from '../platform/device';
import { db, type HighlightColour, type Mark, type StoredDoc } from './db';
import { library } from './library.svelte';
import { stats } from './stats.svelte';
import { settings } from './settings.svelte';
import { ui } from './ui.svelte';

export interface Jump {
  to: Location;
  /** Characters to flash after arriving: a search hit or a highlight. */
  flash?: { start: number; end: number };
  /** An element id in the section to scroll to instead of the offset. */
  anchor?: string;
  key: number;
}

const SAVE_MS = 800;

class ReaderState {
  doc = $state.raw<StoredDoc | null>(null);
  content = $state.raw<OpenDoc | null>(null);
  loading = $state(false);
  /** The flow section on screen. PDF shows every page, so it follows the location. */
  section = $state(0);
  location = $state<Location>(START);
  /** The last character on screen, for "is this place bookmarked". */
  visibleEnd = $state(0);
  marks = $state.raw<Mark[]>([]);
  jump = $state.raw<Jump | null>(null);
  /** The toolbars; hidden by a tap on the page. */
  chrome = $state(true);
  /** When the last jump happened: the scrolling it causes doesn't hide the toolbars. */
  jumpedAt = 0;
  /** The view on screen turns a page (paged mode) or a screen (scrolling); set by the view. */
  turner: ((direction: 1 | -1) => void) | null = null;
  /** Where the reader was before a long jump (contents, search, a link), to go back to. */
  returnTo = $state.raw<Location | null>(null);
  /** Called when a document is finished (main.ts offers BookShelf). */
  onFinished: ((doc: StoredDoc) => void) | null = null;

  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private jumpKey = 0;
  private lengths: number[] = [];
  /** Where a remembered jump landed; reading on a few screens from it lets the way back go. */
  private landed: Location | null = null;
  /** Progress when the document was opened, for the note on leaving. */
  private openedProgress = 0;
  private starts: Location[] | null = null;

  get isPdf(): boolean {
    return this.content?.kind === 'pdf';
  }

  get sectionCount(): number {
    const c = this.content;
    return !c ? 0 : c.kind === 'pdf' ? c.pageCount : c.sections.length;
  }

  get progress(): number {
    const c = this.content;
    if (!c) return 0;
    return c.kind === 'pdf' ? pageProgress(c.pageCount, this.location) : flowProgress(this.lengths, this.location);
  }

  /** Characters after the reader's place, for the time left. */
  get charsLeft(): number {
    if (this.content?.kind !== 'flow') return 0;
    const total = this.lengths.reduce((a, b) => a + b, 0);
    return Math.max(0, total - Math.round(this.progress * total));
  }

  /** Where each chapter starts: contents entries, or sections when there are none. */
  get chapterStarts(): Location[] {
    if (this.starts) return this.starts;
    const c = this.content;
    if (c?.kind !== 'flow') return [];
    if (c.sections.length === 1) return (this.starts = [START, ...this.anchorOffsets().map((a) => ({ section: 0, offset: a.offset }))]);
    const fromToc = [...new Set(c.toc.map((e) => e.section))].filter((i) => i >= 0 && i < c.sections.length);
    const sections = fromToc.length > 1 ? fromToc : c.sections.map((_, i) => i);
    return (this.starts = sections.map((section) => ({ section, offset: 0 })));
  }

  /** Chapter boundaries as fractions, for ticks on the footer's meter. */
  get ticks(): number[] {
    return this.content?.kind === 'flow' ? chapterTicks(this.lengths, this.chapterStarts) : [];
  }

  /** The chapter on screen: its number, how many, and the characters left in it. */
  get chapter(): { index: number; count: number; charsLeft: number } {
    return chapterAt(this.lengths, this.chapterStarts, this.location);
  }

  get bookmarks(): Mark[] {
    return this.marks.filter((m) => m.kind === 'bookmark').sort(byPlace);
  }

  get highlights(): Mark[] {
    return this.marks.filter((m) => m.kind === 'highlight').sort(byPlace);
  }

  /** The bookmark on screen now, if there is one. */
  get bookmarkHere(): Mark | undefined {
    const { section, offset } = this.location;
    return this.bookmarks.find((b) => b.section === section && (this.isPdf || (b.start >= offset && b.start <= Math.max(offset, this.visibleEnd))));
  }

  /** The chapter (or page) a place is in, for lists and the footer. */
  whereIs(section: number, offset = 0): string {
    const c = this.content;
    if (!c) return '';
    if (c.kind === 'pdf') return t('reader.page', { page: section + 1 });
    if (c.sections.length === 1)
      return (
        this.anchorOffsets()
          .filter((h) => h.offset <= offset)
          .at(-1)?.label ?? ''
      );
    const own = c.toc.find((e) => e.section === section);
    return own?.label || c.sections[section]?.title || c.toc.filter((e) => e.section < section).at(-1)?.label || t('reader.section', { section: section + 1 });
  }

  private anchors: { label: string; offset: number }[] | null = null;
  /** For one-section documents: where each heading in the contents starts. */
  private anchorOffsets(): { label: string; offset: number }[] {
    if (this.anchors) return this.anchors;
    const c = this.content;
    if (c?.kind !== 'flow') return [];
    const t = document.createElement('template');
    t.innerHTML = c.sections[0]!.html;
    const out: { label: string; offset: number }[] = [];
    for (const e of c.toc) {
      const el = e.anchor ? t.content.getElementById(e.anchor) : null;
      if (!el) continue;
      const r = document.createRange();
      r.setStart(t.content, 0);
      r.setEndBefore(el);
      out.push({ label: e.label, offset: r.toString().length });
    }
    return (this.anchors = out.sort((a, b) => a.offset - b.offset));
  }

  async open(id: string): Promise<void> {
    const doc = library.get(id);
    if (!doc) return;
    if (doc.offloaded) {
      ui.notify(t('reader.offloaded', { title: doc.title }), 'info', {
        label: t('reader.addFile'),
        run: () => void import('./intake').then((m) => m.restoreFile(id)),
      });
      return;
    }
    this.close();
    this.loading = true;
    this.doc = doc;
    try {
      const bytes = await library.bytes(id);
      if (!bytes) throw new Error(t('error.fileMissing'));
      const [content, marks] = await Promise.all([this.openWithPassword(bytes, doc), library.marks(id)]);
      if (!content) {
        this.doc = null;
        return;
      }
      if (content.kind === 'pdf') this.cacheText(id, content);
      if (this.doc?.id !== id) {
        content.dispose();
        return;
      }
      this.lengths = content.kind === 'flow' ? content.sections.map((s) => s.text.length) : [];
      this.content = content;
      this.marks = marks;
      this.openedProgress = doc.progress;
      const at = doc.location && doc.location.section < this.sectionCount ? doc.location : START;
      this.location = at;
      this.section = content.kind === 'flow' ? at.section : 0;
      this.jump = { to: at, key: ++this.jumpKey };
      this.jumpedAt = performance.now();
      this.chrome = true;
      stats.begin(id);
      void library.update(id, { openedAt: Date.now() });
      void settings.update({ lastDocId: id });
    } catch (err) {
      this.doc = null;
      ui.notify(
        t('reader.openFailed', {
          title: doc.title,
          reason: err instanceof Error ? err.message : String(err),
        }),
        'error',
      );
    } finally {
      this.loading = false;
    }
  }

  /** Opens a document at a mark: the notes view and sync use it. */
  async openAt(id: string, to: Location, flash?: Jump['flash']): Promise<void> {
    if (this.doc?.id !== id) await this.open(id);
    if (this.doc?.id === id) this.goTo(to, flash, undefined, true);
  }

  /** Opens the file, asking for a PDF's password when it needs one. Null when the person cancels. */
  private async openWithPassword(bytes: Uint8Array, doc: StoredDoc): Promise<OpenDoc | null> {
    let password = doc.password;
    for (;;) {
      try {
        const content = await openDocument(bytes, doc.format, password);
        if (password && password !== doc.password) void library.update(doc.id, { password }, { touch: false });
        return content;
      } catch (err) {
        if (!(err instanceof PasswordError)) throw err;
        const answer = await ui.prompt({
          title: t('password.title'),
          message: err.retry && password ? t('password.wrong') : t('password.message', { title: doc.title }),
          label: t('password.label'),
          action: t('password.open'),
          secret: true,
        });
        if (answer === null) return null;
        password = answer;
      }
    }
  }

  /** Keeps a PDF's page text in the database, so later searches don't read every page again. */
  private cacheText(id: string, content: Extract<OpenDoc, { kind: 'pdf' }>): void {
    const read = content.pageText;
    let cache: (string | null)[] | null = null;
    const loaded = db.pdfText.get(id).then((row) => (cache = row?.pages ?? Array.from({ length: content.pageCount }, () => null)));
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    content.pageText = async (i) => {
      await loaded;
      const hit = cache?.[i];
      if (typeof hit === 'string') return hit;
      const text = await read(i);
      if (cache) {
        cache[i] = text;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => void db.pdfText.put({ id, pages: cache! }).catch(() => undefined), 1500);
      }
      return text;
    };
  }

  close(): void {
    this.flush();
    stats.end();
    this.content?.dispose();
    this.content = null;
    this.doc = null;
    this.marks = [];
    this.jump = null;
    this.anchors = null;
    this.starts = null;
    this.returnTo = null;
    this.landed = null;
    this.section = 0;
    if (settings.value.lastDocId) void settings.update({ lastDocId: null });
  }

  /**
   * Leaves the document for the library, with a word on how the sitting went
   * when there was real reading in it.
   */
  leave(): void {
    const doc = this.doc;
    const ms = stats.sessionMs;
    const gained = this.content ? this.progress - this.openedProgress : 0;
    this.close();
    // A toast that offers something (Undo, BookShelf) is worth more than the note.
    if (!doc || ms < 60_000 || ui.toast?.action) return;
    const percent = Math.floor(gained * 100);
    ui.notify(percent >= 1 ? t('reader.sitting', { time: duration(ms), percent }) : t('reader.sittingShort', { time: duration(ms) }), 'info');
  }

  /**
   * Moves to a place; the view scrolls there and clears `jump`. `remember`
   * keeps the place left, when it is far, so the footer can offer the way back.
   */
  goTo(to: Location, flash?: Jump['flash'], anchor?: string, remember = false): void {
    if (!this.content) return;
    if (remember) {
      const from = $state.snapshot(this.location);
      this.returnTo = this.isFar(from, to) ? from : this.returnTo;
      this.landed = null;
    }
    const section = Math.max(0, Math.min(this.sectionCount - 1, to.section));
    if (this.content.kind === 'flow') this.section = section;
    this.location = { section, offset: to.offset };
    this.jump = {
      to: { section, offset: to.offset },
      flash,
      anchor,
      key: ++this.jumpKey,
    };
    this.jumpedAt = performance.now();
    this.chrome = true;
    this.save();
  }

  /** Back to the place before the jump; the place left becomes the way back, so the two can be compared. */
  goBack(): void {
    const back = this.returnTo;
    if (!back) return;
    this.goTo(back, undefined, undefined, true);
  }

  /** More than a couple of screens (or `times` that) apart. */
  private isFar(a: Location, b: Location, times = 1): boolean {
    if (this.isPdf) return Math.abs(a.section - b.section) > times;
    return Math.abs(globalOffset(this.lengths, a) - globalOffset(this.lengths, b)) > FAR_CHARS * times;
  }

  nextSection(): void {
    if (this.section < this.sectionCount - 1) this.goTo({ section: this.section + 1, offset: 0 });
  }

  previousSection(): void {
    if (this.section > 0) this.goTo({ section: this.section - 1, offset: 0 });
  }

  /** Called by the views as the reader scrolls or turns. */
  report(location: Location, visibleEnd: number): void {
    const before = this.globalChar(this.location);
    this.location = location;
    this.visibleEnd = visibleEnd;
    if (this.doc) stats.activity(this.doc.id, Math.abs(this.globalChar(location) - before));
    if (this.returnTo) {
      // The scroll a jump causes settles where it lands; reading on from there lets the way back go.
      if (!this.landed || performance.now() - this.jumpedAt < 800) this.landed = location;
      else if (this.isFar(this.landed, location, 4)) {
        this.returnTo = null;
        this.landed = null;
      }
    }
    this.save();
  }

  /** Characters from the start of the document to a place (flow documents). */
  private globalChar(at: Location): number {
    return this.content?.kind === 'flow' ? globalOffset(this.lengths, at) : 0;
  }

  private save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), SAVE_MS);
  }

  /** Writes the place now (on pause, close and leaving the page). */
  flush(): void {
    clearTimeout(this.saveTimer);
    void stats.flush();
    const doc = this.doc;
    if (!doc || !this.content) return;
    const progress = this.progress;
    const patch: Partial<StoredDoc> = {
      location: $state.snapshot(this.location),
      progress,
    };
    const justFinished = progress >= 0.999 && doc.finishedAt === null;
    if (justFinished) patch.finishedAt = Date.now();
    void library.update(doc.id, patch);
    this.doc = { ...doc, ...patch };
    if (justFinished) {
      const finished = { ...doc, ...patch };
      cheer(null, { count: 80 });
      void this.finishedMessage(doc.id).then((message) => this.notifyFinished(doc, finished, message));
    }
  }

  /** "Finished after 6 h 10 min over 9 days", from the reading kept for it. */
  private async finishedMessage(id: string): Promise<string> {
    await stats.flush();
    const sessions = await db.sessions.where('docId').equals(id).toArray().catch(() => []);
    const ms = sessions.reduce((a, s) => a + s.ms, 0);
    if (ms < 60_000) return t('reader.finished');
    return t('reader.finishedAfter', { time: duration(ms), days: t('stats.days', { count: sessions.length }) });
  }

  private notifyFinished(doc: StoredDoc, finished: StoredDoc, message: string): void {
    ui.notify(message, 'success', {
      label: t('action.undo'),
      run: () => {
        if (this.doc?.id === doc.id) this.doc = { ...this.doc, finishedAt: null };
        void library.update(doc.id, { finishedAt: null });
      },
      // Once the Undo has passed, the finished book can go on to BookShelf.
      dismissed: () => this.onFinished?.(finished),
    });
  }

  // ─── Marks ─────────────────────────────────────────────────

  private async putMark(mark: Mark): Promise<void> {
    mark = { ...mark, updatedAt: Date.now() };
    this.marks = [...this.marks.filter((m) => m.id !== mark.id), mark];
    await db.transaction('rw', db.marks, db.tombstones, async () => {
      await db.marks.put($state.snapshot(mark) as Mark);
      await db.tombstones.delete(mark.id);
    });
  }

  private async deleteMarks(ids: string[]): Promise<void> {
    const at = Date.now();
    await db.transaction('rw', db.marks, db.tombstones, async () => {
      await db.marks.bulkDelete(ids);
      await db.tombstones.bulkPut(ids.map((id) => ({ id, deletedAt: at })));
    });
  }

  async toggleBookmark(): Promise<void> {
    const doc = this.doc;
    if (!doc || !this.content) return;
    const here = this.bookmarkHere;
    if (here) {
      await this.removeMark(here.id);
      return;
    }
    const { section, offset } = this.location;
    const text = this.content.kind === 'flow' ? this.content.sections[section]!.text.slice(offset, offset + 160) : await this.content.pageText(section).then((t) => t.slice(0, 160));
    await this.putMark({
      id: crypto.randomUUID(),
      docId: doc.id,
      kind: 'bookmark',
      section,
      start: this.isPdf ? 0 : offset,
      end: this.isPdf ? 0 : offset,
      text: text.replace(/\s+/g, ' ').trim(),
      where: this.whereIs(section, offset),
      colour: 'amber',
      note: '',
      createdAt: Date.now(),
    });
    if (settings.value.haptics) tick();
    ui.notify(t('reader.bookmarked'), 'success');
  }

  async highlight(section: number, start: number, end: number, text: string, colour: HighlightColour, note = ''): Promise<Mark | null> {
    const doc = this.doc;
    if (!doc) return null;
    // A highlight laid over existing ones absorbs them.
    const overlapping = this.highlights.filter((h) => h.section === section && h.start < end && h.end > start);
    const mark: Mark = {
      id: crypto.randomUUID(),
      docId: doc.id,
      kind: 'highlight',
      section,
      start: Math.min(start, ...overlapping.map((h) => h.start)),
      end: Math.max(end, ...overlapping.map((h) => h.end)),
      text,
      where: this.whereIs(section, start),
      colour,
      note: [...overlapping.map((h) => h.note), note].filter(Boolean).join('\n\n'),
      createdAt: Date.now(),
    };
    if (overlapping.length) {
      const sectionText = this.content?.kind === 'flow' ? this.content.sections[section]?.text : await (this.content as Extract<OpenDoc, { kind: 'pdf' }>).pageText(section);
      if (sectionText) mark.text = sectionText.slice(mark.start, mark.end).replace(/\s+/g, ' ').trim();
      this.marks = this.marks.filter((m) => !overlapping.includes(m));
      await this.deleteMarks(overlapping.map((m) => m.id));
    }
    await this.putMark(mark);
    if (settings.value.haptics) tick();
    return mark;
  }

  async updateMark(id: string, patch: Partial<Pick<Mark, 'colour' | 'note'>>): Promise<void> {
    const mark = this.marks.find((m) => m.id === id);
    if (mark) await this.putMark({ ...mark, ...patch });
  }

  async removeMark(id: string): Promise<void> {
    const mark = this.marks.find((m) => m.id === id);
    if (!mark) return;
    this.marks = this.marks.filter((m) => m.id !== id);
    await this.deleteMarks([id]);
    ui.undoable(mark.kind === 'bookmark' ? t('reader.bookmarkRemoved') : t('reader.highlightRemoved'), () => void this.putMark(mark));
  }

  // ─── Search ────────────────────────────────────────────────

  /**
   * Searches the whole document, calling `onHits` as results arrive (PDF pages
   * are read one at a time). Returns a function that stops the search.
   */
  search(query: string, onHits: (hits: Hit[], done: boolean) => void): () => void {
    const c = this.content;
    const pattern = queryPattern(query);
    let stopped = false;
    if (!c || !pattern) {
      onHits([], true);
      return () => undefined;
    }
    const hits: Hit[] = [];
    if (c.kind === 'flow') {
      c.sections.forEach((s, i) => searchText(s.text, pattern, i, hits));
      onHits(hits, true);
      return () => undefined;
    }
    void (async () => {
      for (let i = 0; i < c.pageCount && !stopped && hits.length < MAX_HITS; i++) {
        searchText(await c.pageText(i), pattern, i, hits);
        if (i % 8 === 7) onHits([...hits], false);
      }
      if (!stopped) onHits([...hits], true);
    })();
    return () => {
      stopped = true;
    };
  }

  /** Where paragraphs meet in each section, so excerpts don't run them together. */
  private breaks = new WeakMap<object, number[]>();

  async excerptFor(hit: Hit) {
    const c = this.content;
    if (!c) return { before: '', match: '', after: '' };
    if (c.kind !== 'flow') return excerpt(await c.pageText(hit.section), hit.start, hit.end);
    const section = c.sections[hit.section]!;
    let breaks = this.breaks.get(section);
    if (!breaks) this.breaks.set(section, (breaks = blockBreaks(section.html)));
    return excerpt(section.text, hit.start, hit.end, 48, breaks);
  }

  get formatLabel(): string {
    return this.doc ? FORMAT_LABEL[this.doc.format] : '';
  }
}

const byPlace = (a: Mark, b: Mark) => a.section - b.section || a.start - b.start;

export const reader = new ReaderState();
