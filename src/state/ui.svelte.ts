// Transient UI state: the open sheet, the toast, confirm requests and
// the overlay stack that Android's back button unwinds.

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  run: () => void;
  /** Called when the toast goes away without the action being taken. */
  dismissed?: () => void;
}

export interface Toast {
  message: string;
  kind: ToastKind;
  key: number;
  action?: ToastAction;
  /** Fading out. */
  leaving?: boolean;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  /** The verb on the committing button: "Clear library", not "OK". */
  action: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

/** Overlays the app opens; one at a time per kind. */
export type Overlay = 'settings' | 'contents' | 'search' | 'type' | 'details' | null;

/** How long a toast stays (style.md §8.12): longer when it offers an action. */
export const TOAST_MS = 4000;
export const TOAST_ACTION_MS = 6000;
/** --dur-exit */
const TOAST_EXIT_MS = 160;

class UiState {
  overlay = $state<Overlay>(null);
  /** The document the details sheet is about. */
  detailsId = $state<string | null>(null);
  toast = $state.raw<Toast | null>(null);
  confirmRequest = $state.raw<ConfirmRequest | null>(null);
  /** Called by back when no overlay is open: closes the reader. False when there is nothing to close. */
  onBack: (() => boolean) | null = null;

  private closers: (() => void)[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private toastKey = 0;

  /** Shows one toast, replacing any current one. */
  notify(message: string, kind: ToastKind = 'info', action?: ToastAction): void {
    if (!this.toast?.leaving) this.toast?.action?.dismissed?.();
    this.toast = { message, kind, key: ++this.toastKey, action };
    this.resumeToast();
  }

  /** A toast with Undo. */
  undoable(message: string, undo: () => void): void {
    this.notify(message, 'success', { label: 'Undo', run: undo });
  }

  /** Holds the toast on screen while it is touched or hovered. */
  pauseToast(): void {
    clearTimeout(this.toastTimer);
  }

  resumeToast(): void {
    clearTimeout(this.toastTimer);
    const toast = this.toast;
    if (!toast) return;
    this.toastTimer = setTimeout(() => this.dismissToast(toast.key), toast.action ? TOAST_ACTION_MS : TOAST_MS);
  }

  dismissToast(key: number): void {
    const toast = this.toast;
    if (toast?.key !== key || toast.leaving) return;
    clearTimeout(this.toastTimer);
    toast.action?.dismissed?.();
    this.toast = { ...toast, action: undefined, leaving: true };
    setTimeout(() => {
      if (this.toast?.key === key) this.toast = null;
    }, TOAST_EXIT_MS);
  }

  /** Runs the toast's action and closes it. */
  actOnToast(): void {
    const toast = this.toast;
    if (!toast?.action) return;
    clearTimeout(this.toastTimer);
    this.toast = null;
    toast.action.run();
  }

  /** Asks in a confirm modal (style.md §8.10). Only for what can't be undone. */
  confirm(request: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
    this.confirmRequest?.resolve(false);
    return new Promise((resolve) => {
      this.confirmRequest = {
        ...request,
        resolve: (ok) => {
          this.confirmRequest = null;
          resolve(ok);
        },
      };
    });
  }

  open(overlay: Exclude<Overlay, null>): void {
    this.overlay = overlay;
  }

  close(): void {
    this.overlay = null;
  }

  /** Registers an open overlay; the returned function unregisters it. */
  pushOverlay(close: () => void): () => void {
    this.closers.push(close);
    return () => {
      this.closers = this.closers.filter((c) => c !== close);
    };
  }

  /**
   * Android back (style.md §14): the topmost overlay first, then out of the
   * reader to the library. False when the app should exit.
   */
  back(): boolean {
    const close = this.closers.at(-1);
    if (close) {
      close();
      return true;
    }
    return this.onBack?.() ?? false;
  }
}

export const ui = new UiState();
