// Upstream: packages/react/src/toast/store.ts
//
// The toasts of one `Toast.Provider`: the list (newest first) and each
// toast's index, visible index and vertical offset, whether the viewport is
// hovered or focused, the auto-dismiss timers (paused while the viewport is
// expanded or the window is blurred, resumed with the time left), the
// `limit` (the oldest active toasts past it are marked `limited`), and focus
// hand-off when a focused toast closes.
//
// The store is plain state and methods, framework-free; `subscribe` tells a
// listener the state changed (the provider mirrors it into a signal).
import { activeElement, contains, getTarget, ownerDocument } from '../utils/dom.ts';
import { Timeout } from '../utils/timers.ts';
import type { ToastManagerAddOptions, ToastObject } from './types.ts';
import { generateToastId, isFocusVisible } from './utils.ts';

type ToastInternalUpdateOptions<Data extends object> = Partial<
  Omit<ToastObject<Data>, 'id' | 'updateKey'>
>;

/** How long (in ms) a toast without its own `timeout` shows. */
const DEFAULT_TIMEOUT = 5000;

/**
 * A toast once it lives in the store. `addToast` is the only way in and it always
 * assigns `updateKey`, so unlike the public `ToastObject` it is never missing.
 */
export type StoredToast<Data extends object = object> = ToastObject<Data> & { updateKey: number };

export type State = {
  toasts: StoredToast[];
  toastMetadata: Map<string, ToastMetadata>;
  hovering: boolean;
  focused: boolean;
  limit: number;
  isWindowFocused: boolean;
  viewport: HTMLElement | null;
  prevFocusElement: HTMLElement | null;
};

type ToastMetadata = {
  value: StoredToast;
  domIndex: number;
  visibleIndex: number;
  offsetY: number;
};

type InitialState = Omit<State, 'toastMetadata'>;

function createToastMetadata(toasts: StoredToast[]) {
  const metadata = new Map<string, ToastMetadata>();
  let visibleIndex = 0;
  let offsetY = 0;

  toasts.forEach((toast, toastIndex) => {
    const isEnding = toast.transitionStatus === 'ending';
    metadata.set(toast.id, {
      value: toast,
      domIndex: toastIndex,
      visibleIndex: isEnding ? -1 : visibleIndex,
      offsetY,
    });

    offsetY += toast.height || 0;

    if (!isEnding) {
      visibleIndex += 1;
    }
  });

  return metadata;
}

// Marks the active (non-ending) toasts beyond `limit` as limited. Callers pass
// toasts in newest-first order, so the newest `limit` toasts stay visible and
// the rest are flagged. Returns the same toast reference when its `limited`
// flag is unchanged.
function applyLimited(toasts: StoredToast[], limit: number): StoredToast[] {
  let activeIndex = 0;
  return toasts.map((toast) => {
    if (toast.transitionStatus === 'ending') {
      return toast;
    }
    const limited = activeIndex >= limit;
    activeIndex += 1;
    return toast.limited === limited ? toast : { ...toast, limited };
  });
}

export const selectors = {
  toasts: (state: State) => state.toasts,
  isEmpty: (state: State) => state.toasts.length === 0,
  toast: (state: State, id: string) => state.toastMetadata.get(id)?.value,
  toastIndex: (state: State, id: string) => state.toastMetadata.get(id)?.domIndex ?? -1,
  toastOffsetY: (state: State, id: string) => state.toastMetadata.get(id)?.offsetY ?? 0,
  toastVisibleIndex: (state: State, id: string) => state.toastMetadata.get(id)?.visibleIndex ?? -1,
  expanded: (state: State) => state.hovering || state.focused,
  expandedOrOutOfFocus: (state: State) => state.hovering || state.focused || !state.isWindowFocused,
  prevFocusElement: (state: State) => state.prevFocusElement,
};

interface TimerInfo {
  timeout?: Timeout | undefined;
  /** Timestamp of the last time the timeout started running. */
  start: number;
  /** Full timeout duration, used to restart a timer that elapsed while throttled. */
  delay: number;
  /** Time left before the toast auto-dismisses, excluding any paused time. */
  remaining: number;
  callback: () => void;
}

export class ToastStore {
  state: State;

  private listeners = new Set<() => void>();

  private timers = new Map<string, TimerInfo>();

  private areTimersPaused = false;

  constructor(initialState: InitialState) {
    this.state = { ...initialState, toastMetadata: createToastMetadata(initialState.toasts) };
  }

  /** Calls `listener` after every state change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  set<K extends keyof State>(key: K, value: State[K]): void {
    if (Object.is(this.state[key], value)) {
      return;
    }
    this.state = { ...this.state, [key]: value };
    this.notify();
  }

  update(updates: Partial<State>): void {
    const changed = (Object.keys(updates) as Array<keyof State>).some(
      (key) => !Object.is(this.state[key], updates[key]),
    );
    if (!changed) {
      return;
    }
    this.state = { ...this.state, ...updates };
    this.notify();
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  setViewport = (viewport: HTMLElement | null) => {
    this.set('viewport', viewport);
  };

  /** Sets the limit, and with it each toast's `limited` flag. */
  setLimit(limit: number) {
    if (this.state.limit === limit) {
      return;
    }
    const newToasts = applyLimited(this.state.toasts, limit);
    this.update({ limit, toasts: newToasts, toastMetadata: createToastMetadata(newToasts) });
  }

  /** Clears every pending timer (the provider unmounted). */
  dispose = () => {
    this.timers.forEach((timer) => {
      timer.timeout?.clear();
    });
    this.timers.clear();
  };

  removeToast(toastId: string, skipOnRemove: boolean = false) {
    const index = selectors.toastIndex(this.state, toastId);
    if (index === -1) {
      return;
    }

    const toast = this.state.toasts[index];
    if (!skipOnRemove) {
      toast?.onRemove?.();
    }

    const newToasts = [...this.state.toasts];
    newToasts.splice(index, 1);
    this.setToasts(newToasts);
  }

  addToast = <Data extends object>(toast: ToastManagerAddOptions<Data>): string => {
    const { limit } = this.state;
    const id = toast.id || generateToastId();

    if (toast.id) {
      const existingToast = selectors.toast(this.state, toast.id);

      if (existingToast) {
        if (existingToast.transitionStatus === 'ending') {
          this.removeToast(toast.id, true);
        } else {
          const { id: _id, transitionStatus: _transitionStatus, ...updates } = toast;
          this.updateToastInternal(toast.id, updates, true);
          return toast.id;
        }
      }
    }

    const toastToAdd: StoredToast<Data> = {
      ...toast,
      id,
      updateKey: 0,
      transitionStatus: 'starting',
    };

    const updatedToasts = [toastToAdd as StoredToast, ...this.state.toasts];
    this.setToasts(applyLimited(updatedToasts, limit));

    const duration = toastToAdd.timeout ?? DEFAULT_TIMEOUT;
    if (duration > 0) {
      this.scheduleTimer(id, duration, () => this.closeToast(id));
    }

    if (selectors.expandedOrOutOfFocus(this.state)) {
      this.pauseTimers();
    }

    return id;
  };

  /**
   * Merges `updates` into a toast. An upsert (`addToast` under an existing id)
   * also bumps its `updateKey` and restarts its auto-dismiss timer from the
   * full timeout, or clears the timer when the toast no longer has one; the
   * root's height measurement is not an upsert and leaves the timer alone.
   */
  updateToastInternal = <Data extends object>(
    id: string,
    updates: ToastInternalUpdateOptions<Data>,
    upsert: boolean = false,
  ) => {
    const { toasts } = this.state;
    const prevToast = selectors.toast(this.state, id);
    if (!prevToast) {
      return;
    }

    // Ignore updates for toasts that are already closing (a late height
    // measurement), so they cannot block a dismissal from completing.
    if (prevToast.transitionStatus === 'ending') {
      return;
    }

    const nextToast: StoredToast = {
      ...prevToast,
      ...(updates as ToastInternalUpdateOptions<object>),
      ...(upsert && { updateKey: prevToast.updateKey + 1 }),
    };

    this.setToasts(toasts.map((toast) => (toast.id === id ? nextToast : toast)));

    if (!upsert) {
      return;
    }

    this.clearTimer(id);
    const nextTimeout = nextToast.timeout ?? DEFAULT_TIMEOUT;
    if (nextTimeout > 0) {
      this.scheduleTimer(id, nextTimeout, () => this.closeToast(id));
      if (selectors.expandedOrOutOfFocus(this.state)) {
        this.pauseTimers();
      }
    }
  };

  closeToast = (toastId: string) => {
    const { limit, toasts } = this.state;
    if (!selectors.toast(this.state, toastId)) {
      return;
    }
    this.clearTimer(toastId);

    const endingToasts = toasts.map((item) =>
      item.id === toastId ? { ...item, transitionStatus: 'ending' as const, height: 0 } : item,
    );
    const newToasts = applyLimited(endingToasts, limit);
    this.setToasts(newToasts, !newToasts.some((toast) => toast.transitionStatus !== 'ending'));

    this.handleFocusManagement(toastId);
  };

  pauseTimers() {
    if (this.areTimersPaused) {
      return;
    }
    this.areTimersPaused = true;
    this.timers.forEach((timer) => {
      // Timers added while already paused have no running timeout, so their
      // `remaining` is still the full delay and must be left alone.
      if (timer.timeout) {
        timer.timeout.clear();
        // `start` is stamped on every resume, so subtracting from `remaining`
        // (rather than from the original delay) keeps repeated pause/resume
        // cycles from handing the toast extra time.
        timer.remaining = Math.max(timer.remaining - (Date.now() - timer.start), 0);
      }
    });
  }

  resumeTimers() {
    if (!this.areTimersPaused) {
      return;
    }
    this.areTimersPaused = false;
    this.timers.forEach((timer, id) => {
      timer.remaining = timer.remaining > 0 ? timer.remaining : timer.delay;
      timer.timeout ??= Timeout.create();
      timer.timeout.start(timer.remaining, () => {
        this.handleTimerFired(id);
        timer.callback();
      });
      timer.start = Date.now();
    });
  }

  restoreFocusToPrevElement() {
    this.state.prevFocusElement?.focus({ preventScroll: true });
  }

  handleDocumentPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      return;
    }

    const target = getTarget(event) as Element | null;
    if (contains(this.state.viewport, target)) {
      return;
    }

    // Explicit touch activity outside the viewport ends the paused
    // interaction state even if the window focus state is unchanged.
    this.resumeTimers();
    this.update({ hovering: false, focused: false });
  };

  private scheduleTimer(id: string, delay: number, callback: () => void) {
    const start = Date.now();
    const shouldStartActive = !selectors.expandedOrOutOfFocus(this.state);
    const currentTimeout = shouldStartActive ? Timeout.create() : undefined;

    currentTimeout?.start(delay, () => {
      this.handleTimerFired(id);
      callback();
    });

    this.timers.set(id, {
      timeout: currentTimeout,
      start,
      delay,
      remaining: delay,
      callback,
    });
  }

  private clearTimer(id: string) {
    const timer = this.timers.get(id);
    timer?.timeout?.clear();
    this.timers.delete(id);

    this.resetPausedStateIfNoTimersRemain();
  }

  private handleTimerFired(id: string) {
    this.timers.delete(id);
    this.resetPausedStateIfNoTimersRemain();
  }

  private resetPausedStateIfNoTimersRemain() {
    if (this.timers.size === 0) {
      // No timers remain to keep paused; clear the flag so a fresh toast's
      // running timer can be paused again on hover or focus.
      this.areTimersPaused = false;
    }
  }

  private setToasts(newToasts: StoredToast[], clearInteraction: boolean = newToasts.length === 0) {
    const updates: Partial<State> = {
      toasts: newToasts,
      toastMetadata: createToastMetadata(newToasts),
    };

    if (clearInteraction) {
      updates.hovering = false;
      updates.focused = false;
    }

    this.update(updates);
  }

  private handleFocusManagement(toastId: string) {
    const viewport = this.state.viewport;
    if (!viewport) {
      return;
    }
    const activeEl = activeElement(ownerDocument(viewport));
    if (!contains(viewport, activeEl) || !isFocusVisible(activeEl)) {
      return;
    }

    const toasts = selectors.toasts(this.state);
    const currentIndex = selectors.toastIndex(this.state, toastId);

    const scan = (from: number, step: number) => {
      for (let index = from; index >= 0 && index < toasts.length; index += step) {
        if (toasts[index]?.transitionStatus !== 'ending') {
          return toasts[index];
        }
      }
      return null;
    };

    // The next toast that isn't animating out, else the previous one.
    const nextToast = scan(currentIndex + 1, 1) ?? scan(currentIndex - 1, -1);

    if (nextToast) {
      nextToast.ref?.current?.focus();
    } else {
      this.restoreFocusToPrevElement();
    }
  }
}
