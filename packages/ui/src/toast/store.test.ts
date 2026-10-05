// Upstream: packages/react/src/toast/store.test.ts,
// packages/react/src/toast/utils/isRenderableNode.test.ts
import { afterEach, describe, expect, it, jest, mock } from 'bun:test';

import { selectors, ToastStore } from './store.ts';
import type { ToastObject } from './types.ts';
import { isRenderableNode } from './utils.ts';

function createStore(toasts: ToastObject[]) {
  return new ToastStore({
    // Mirrors `addToast`, which always stamps an `updateKey` on the way in.
    toasts: toasts.map((toast) => ({ updateKey: 0, ...toast })),
    timeout: 0,
    limit: 3,
    hovering: false,
    focused: false,
    isWindowFocused: true,
    viewport: null,
    prevFocusElement: null,
  });
}

function expectToastMetadataToMatchToasts(store: ToastStore) {
  let visibleIndex = 0;
  let offsetY = 0;

  store.state.toasts.forEach((toast, index) => {
    const isEnding = toast.transitionStatus === 'ending';

    expect(selectors.toast(store.state, toast.id)).toBe(toast);
    expect(selectors.toastIndex(store.state, toast.id)).toBe(index);
    expect(selectors.toastOffsetY(store.state, toast.id)).toBe(offsetY);
    expect(selectors.toastVisibleIndex(store.state, toast.id)).toBe(isEnding ? -1 : visibleIndex);

    offsetY += toast.height || 0;

    if (!isEnding) {
      visibleIndex += 1;
    }
  });
}

const statusOf = (store: ToastStore, id: string) =>
  selectors.toast(store.state, id)?.transitionStatus;

describe('ToastStore', () => {
  it('keeps toast metadata synchronized after mutations', () => {
    const store = createStore([
      { id: 'newest', height: 30 },
      { id: 'middle', height: 40 },
      { id: 'oldest', height: 50 },
    ]);

    expectToastMetadataToMatchToasts(store);

    store.updateToastInternal('middle', { height: 45 });
    expectToastMetadataToMatchToasts(store);

    store.closeToast('middle');
    expectToastMetadataToMatchToasts(store);
    expect(statusOf(store, 'middle')).toBe('ending');

    store.removeToast('middle', true);
    expectToastMetadataToMatchToasts(store);

    store.addToast({ id: 'front', title: 'Front', timeout: 0 });
    expectToastMetadataToMatchToasts(store);
  });

  it('notifies subscribers on change and not on a no-op', () => {
    const store = createStore([]);
    const listener = mock(() => {});
    const unsubscribe = store.subscribe(listener);

    store.set('hovering', true);
    store.set('hovering', true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.set('hovering', false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores height recalculations while a toast is transitioning out', () => {
    const store = createStore([{ id: 'a', height: 40 }]);

    store.closeToast('a');
    expect(statusOf(store, 'a')).toBe('ending');

    // The write `recalculateHeight` makes when a content observer fires always
    // includes `transitionStatus: undefined`; the ending toast must stay ending.
    store.updateToastInternal('a', { height: 80, transitionStatus: undefined });

    const toast = selectors.toast(store.state, 'a');
    expect(toast?.transitionStatus).toBe('ending');
    expect(toast?.height).toBe(0);

    store.removeToast('a', true);
    expect(selectors.toast(store.state, 'a')).toBe(undefined);
  });

  it('ignores mutations that target an unknown toast', () => {
    const store = createStore([{ id: 'a' }]);
    const toastsBefore = store.state.toasts;

    store.removeToast('missing');
    store.closeToast('missing');
    store.updateToastInternal('missing', { height: 10 });

    expect(store.state.toasts).toBe(toastsBefore);
    expect(statusOf(store, 'a')).toBe(undefined);
  });

  it('upserts when re-adding under an existing id, bumping updateKey', () => {
    const store = createStore([]);

    store.addToast({ id: 'a', data: { status: 'error', errorCode: 42 } });
    store.addToast({ id: 'a', data: { status: 'ok' } });
    expect(selectors.toast(store.state, 'a')?.data).toEqual({ status: 'ok' });
    expect(selectors.toast(store.state, 'a')?.updateKey).toBe(1);

    store.addToast({ id: 'a', title: 'Still uploading' });
    expect(selectors.toast(store.state, 'a')?.data).toEqual({ status: 'ok' });
    expect(store.state.toasts).toHaveLength(1);
  });

  it('drops the action of the toast it replaces when re-added with actionProps undefined', () => {
    const store = createStore([]);
    store.addToast({ id: 'a', title: 'Moved', actionProps: { children: 'Undo' } });
    store.addToast({ id: 'a', title: 'Refused', actionProps: undefined });
    expect(selectors.toast(store.state, 'a')?.title).toBe('Refused');
    expect(selectors.toast(store.state, 'a')?.actionProps).toBeUndefined();
  });

  it('replaces a closing toast when adding again with the same id', () => {
    const onRemove = mock(() => {});
    const store = createStore([]);
    store.addToast({ id: 'a', title: 'first', onRemove });
    store.closeToast('a');
    store.addToast({ id: 'a', title: 'second' });
    expect(store.state.toasts).toHaveLength(1);
    expect(statusOf(store, 'a')).toBe('starting');
    expect(selectors.toast(store.state, 'a')?.title).toBe('second');
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('calls onClose once, and not for toasts already ending', () => {
    const onClose = mock(() => {});
    const store = createStore([]);
    store.addToast({ id: 'a', onClose });
    store.addToast({ id: 'b', onClose });
    store.closeToast('a');
    store.closeToast();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not invoke onRemove for a toast that is no longer in the store', () => {
    const onRemove = mock(() => {});
    const store = createStore([{ id: 'a', onRemove }]);

    store.removeToast('a');
    expect(onRemove).toHaveBeenCalledTimes(1);

    store.removeToast('a');
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  describe('limit', () => {
    it('recomputes limited flags when the limit changes', () => {
      // Ordered newest-first, matching how `addToast` prepends.
      const store = createStore([{ id: 'c' }, { id: 'b' }, { id: 'a' }]);

      store.syncProviderProps(0, 1);
      expect(selectors.toast(store.state, 'c')?.limited).toBe(false);
      expect(selectors.toast(store.state, 'b')?.limited).toBe(true);
      expect(selectors.toast(store.state, 'a')?.limited).toBe(true);

      store.syncProviderProps(0, 3);
      expect(selectors.toast(store.state, 'c')?.limited).toBe(false);
      expect(selectors.toast(store.state, 'b')?.limited).toBe(false);
      expect(selectors.toast(store.state, 'a')?.limited).toBe(false);
    });

    it('marks toasts past the limit as they are added, skipping ending ones', () => {
      const store = createStore([]);
      store.syncProviderProps(0, 2);
      store.addToast({ id: 'a' });
      store.addToast({ id: 'b' });
      store.addToast({ id: 'c' });
      expect(selectors.toast(store.state, 'a')?.limited).toBe(true);
      store.closeToast('c');
      expect(selectors.toast(store.state, 'a')?.limited).toBe(false);
    });
  });

  describe('timers', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('auto-dismisses after the toast timeout, else the store timeout', () => {
      jest.useFakeTimers();
      const store = createStore([]);
      store.syncProviderProps(5000, 3);
      store.addToast({ id: 'default' });
      store.addToast({ id: 'short', timeout: 100 });
      store.addToast({ id: 'never', timeout: 0 });
      store.addToast({ id: 'loading', type: 'loading' });

      jest.advanceTimersByTime(100);
      expect(statusOf(store, 'short')).toBe('ending');
      expect(statusOf(store, 'default')).toBe('starting');

      jest.advanceTimersByTime(4900);
      expect(statusOf(store, 'default')).toBe('ending');

      jest.advanceTimersByTime(60_000);
      expect(statusOf(store, 'never')).toBe('starting');
      expect(statusOf(store, 'loading')).toBe('starting');
    });

    it('re-pauses timers after the last toast is closed and a new one is added', () => {
      jest.useFakeTimers();
      const store = createStore([]);

      store.addToast({ title: 'a', timeout: 100 });
      store.pauseTimers();

      // Closing the last toast clears the paused flag, else the next toast's
      // timer could never be paused again.
      store.closeToast(store.state.toasts[0]?.id);

      store.addToast({ title: 'b', timeout: 100 });
      const newToastId = store.state.toasts[0]?.id ?? '';

      store.pauseTimers();
      jest.advanceTimersByTime(200);

      expect(statusOf(store, newToastId)).not.toBe('ending');
    });

    it('re-pauses timers after all toasts are closed and a new one is added', () => {
      jest.useFakeTimers();
      const store = createStore([]);

      store.addToast({ id: 'a', title: 'a', timeout: 100 });
      store.addToast({ id: 'b', title: 'b', timeout: 100 });
      store.pauseTimers();

      store.closeToast();

      store.addToast({ id: 'c', title: 'c', timeout: 100 });
      store.pauseTimers();
      jest.advanceTimersByTime(200);

      expect(statusOf(store, 'c')).not.toBe('ending');
    });

    it('re-pauses timers after the last timed toast closes while untimed toasts remain', () => {
      jest.useFakeTimers();
      const store = createStore([]);

      store.addToast({ id: 'loading', title: 'loading', type: 'loading' });
      store.addToast({ id: 'timed', title: 'timed', timeout: 100 });
      store.pauseTimers();

      store.closeToast('timed');

      store.addToast({ id: 'c', title: 'c', timeout: 100 });
      store.pauseTimers();
      jest.advanceTimersByTime(200);

      expect(statusOf(store, 'c')).not.toBe('ending');
    });

    it('keeps a rescheduled timer paused while expanded, and runs it once collapsed', () => {
      jest.useFakeTimers();
      const store = createStore([]);

      store.addToast({ id: 'a', title: 'a', timeout: 100 });

      store.set('hovering', true);
      store.pauseTimers();

      // Re-adding reschedules the timer; it must not run while expanded.
      store.addToast({ id: 'a', timeout: 100 });

      jest.advanceTimersByTime(200);
      expect(statusOf(store, 'a')).not.toBe('ending');

      store.set('hovering', false);
      store.resumeTimers();

      jest.advanceTimersByTime(100);
      expect(statusOf(store, 'a')).toBe('ending');
    });

    it('does not extend the remaining time across repeated pause/resume cycles', () => {
      jest.useFakeTimers();
      const store = createStore([]);

      store.addToast({ id: 'a', title: 'a', timeout: 5000 });

      for (let cycle = 0; cycle < 2; cycle += 1) {
        jest.advanceTimersByTime(1000);
        store.pauseTimers();
        jest.advanceTimersByTime(1000);
        store.resumeTimers();
      }

      // 2000ms of the 5000ms timeout has been consumed, so 3000ms remain.
      jest.advanceTimersByTime(2999);
      expect(statusOf(store, 'a')).not.toBe('ending');

      jest.advanceTimersByTime(2);
      expect(statusOf(store, 'a')).toBe('ending');
    });

    it('restarts the full delay when the clock jumped past the timeout before pausing', () => {
      jest.useFakeTimers();
      const store = createStore([]);

      store.addToast({ id: 'a', title: 'a', timeout: 5000 });

      // A throttled background tab: wall-clock time passes without the
      // scheduled timeout running.
      jest.setSystemTime(Date.now() + 60_000);
      store.pauseTimers();
      store.resumeTimers();

      jest.advanceTimersByTime(4999);
      expect(statusOf(store, 'a')).not.toBe('ending');

      jest.advanceTimersByTime(1);
      expect(statusOf(store, 'a')).toBe('ending');
    });

    it('re-pauses timers after the last timed toast becomes untimed', () => {
      jest.useFakeTimers();
      const store = createStore([]);

      store.addToast({ id: 'a', title: 'a', timeout: 100 });
      store.pauseTimers();

      store.addToast({ id: 'a', timeout: 0 });

      store.addToast({ id: 'b', title: 'b', timeout: 100 });
      store.pauseTimers();
      jest.advanceTimersByTime(200);

      expect(statusOf(store, 'b')).not.toBe('ending');
    });

    it('accumulates active time across hover cycles so the toast still dismisses', () => {
      jest.useFakeTimers();
      const store = createStore([]);

      store.addToast({ id: 'a', title: 'a', timeout: 100 });

      jest.advanceTimersByTime(40);
      store.pauseTimers();
      expect(statusOf(store, 'a')).not.toBe('ending');

      store.resumeTimers();
      jest.advanceTimersByTime(40);
      store.pauseTimers();
      expect(statusOf(store, 'a')).not.toBe('ending');

      store.resumeTimers();
      jest.advanceTimersByTime(40);

      expect(statusOf(store, 'a')).toBe('ending');
    });

    it('restarts the timer when re-added with the same timeout', () => {
      jest.useFakeTimers();
      const store = createStore([]);
      store.addToast({ id: 'a', timeout: 100 });
      jest.advanceTimersByTime(80);
      store.addToast({ id: 'a', timeout: 100 });
      jest.advanceTimersByTime(80);
      expect(statusOf(store, 'a')).not.toBe('ending');
      jest.advanceTimersByTime(20);
      expect(statusOf(store, 'a')).toBe('ending');
    });

    it('schedules a timer when a loading toast becomes another type', () => {
      jest.useFakeTimers();
      const store = createStore([]);
      store.addToast({ id: 'a', type: 'loading', timeout: 100 });
      jest.advanceTimersByTime(500);
      expect(statusOf(store, 'a')).not.toBe('ending');
      store.addToast({ id: 'a', type: 'success' });
      jest.advanceTimersByTime(100);
      expect(statusOf(store, 'a')).toBe('ending');
    });
  });
});

describe('isRenderableNode', () => {
  it('treats renderable primitives as content', () => {
    expect(isRenderableNode(0)).toBe(true);
    expect(isRenderableNode(Number.NaN)).toBe(true);
    expect(isRenderableNode('text')).toBe(true);
  });

  it('treats non-rendering values as empty', () => {
    expect(isRenderableNode(null)).toBe(false);
    expect(isRenderableNode(undefined)).toBe(false);
    expect(isRenderableNode(true)).toBe(false);
    expect(isRenderableNode(false)).toBe(false);
    expect(isRenderableNode('')).toBe(false);
  });

  it('recurses into arrays', () => {
    expect(isRenderableNode([])).toBe(false);
    expect(isRenderableNode([null, undefined, false])).toBe(false);
    expect(isRenderableNode([null, 0])).toBe(true);
    expect(isRenderableNode([[null]])).toBe(false);
    expect(isRenderableNode([[0]])).toBe(true);
  });
});
