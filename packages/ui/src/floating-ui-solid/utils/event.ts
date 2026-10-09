// Upstream: packages/react/src/floating-ui-react/utils/event.ts,
// packages/react/src/floating-ui-react/utils/createEventEmitter.ts,
// packages/react/src/floating-ui-react/utils/enqueueFocus.ts
//
// Event predicates (a click from a screen reader or keyboard has no pointer),
// the per-popup event emitter, and focus moved on the next frame.
import { NOOP } from '../../utils/dom.ts';
import { platform } from '../../utils/platform.ts';
import type { FocusableElement } from './tabbable.ts';

export function stopEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

/** A click with no pointer behind it: a screen reader's, or Enter/Space on a button. */
export function isVirtualClick(event: MouseEvent | PointerEvent): boolean {
  if ((event as PointerEvent).pointerType === '' && event.isTrusted) {
    return true;
  }
  if (platform.os.android && (event as PointerEvent).pointerType) {
    return event.type === 'click' && event.buttons === 1;
  }
  return event.detail === 0 && !(event as PointerEvent).pointerType;
}

export function isVirtualPointerEvent(event: PointerEvent) {
  return (
    (!platform.os.android && event.width === 0 && event.height === 0) ||
    (event.type === 'pointerdown' &&
      event.width === 1 &&
      event.height === 1 &&
      event.pressure === 0 &&
      event.detail === 0 &&
      event.pointerType === 'mouse' &&
      (platform.os.android || event.buttons === 0)) ||
    (event.width < 1 &&
      event.height < 1 &&
      event.pressure === 0 &&
      event.detail === 0 &&
      event.pointerType === 'touch')
  );
}

export function isMouseLikePointerType(pointerType: string | undefined, strict?: boolean) {
  const values: Array<string | undefined> = ['mouse', 'pen'];
  if (!strict) {
    values.push('', undefined);
  }
  return values.includes(pointerType);
}

export function isClickLikeEvent(event: Event) {
  const type = event.type;
  return type === 'click' || type === 'mousedown' || type === 'keydown' || type === 'keyup';
}

export interface FloatingEvents {
  emit(event: string, data?: unknown): void;
  /** A listener names the data type its event carries (`openchange`: the open change details). */
  on<T>(event: string, handler: (data: T) => void): void;
  off<T>(event: string, handler: (data: T) => void): void;
}

type Listener = (data: unknown) => void;

export function createEventEmitter(): FloatingEvents {
  const map = new Map<string, Set<Listener>>();
  return {
    emit(event, data) {
      map.get(event)?.forEach((listener) => listener(data));
    },
    on(event, listener) {
      let listeners = map.get(event);
      if (!listeners) {
        listeners = new Set();
        map.set(event, listeners);
      }
      listeners.add(listener as Listener);
    },
    off(event, listener) {
      map.get(event)?.delete(listener as Listener);
    },
  };
}

interface EnqueueFocusOptions {
  preventScroll?: boolean | undefined;
  sync?: boolean | undefined;
  shouldFocus?: (() => boolean) | undefined;
}

let rafId = 0;

/** Focuses `el` on the next frame (or now with `sync`); a later call cancels an earlier one. */
export function enqueueFocus(
  el: FocusableElement | null | undefined,
  options: EnqueueFocusOptions = {},
) {
  const { preventScroll = false, sync = false, shouldFocus } = options;
  cancelAnimationFrame(rafId);

  function exec() {
    if (shouldFocus && !shouldFocus()) {
      return;
    }
    el?.focus({ preventScroll });
  }

  if (sync) {
    exec();
    return NOOP;
  }

  const currentRafId = requestAnimationFrame(exec);
  rafId = currentRafId;
  return () => {
    if (rafId === currentRafId) {
      cancelAnimationFrame(currentRafId);
      rafId = 0;
    }
  };
}
