// Upstream: packages/react/src/toast/viewport/ToastViewport.tsx,
// packages/react/src/toast/viewport/ToastViewportCssVars.ts
//
// The region the toasts live in. Hovering it or moving keyboard focus into
// it expands the stack and pauses the auto-dismiss timers; leaving resumes
// them (a mouse leave waits for exiting toasts and touch gestures to
// finish). F6 anywhere moves focus to the viewport, and Shift+Tab from it
// returns focus where it was. Focus guards around it send Tab to the first
// toast, or back out.
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, omit, Show } from 'solid-js';

import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import {
  activeElement,
  addEventListener,
  contains,
  getTarget,
  mergeCleanups,
  ownerDocument,
  ownerWindow,
} from '../utils/dom.ts';
import { FocusGuard } from '../utils/FocusGuard.tsx';
import { useTimeout } from '../utils/timers.ts';
import { selectors } from './store.ts';
import { useToastProviderContext, useToastSelector } from './ToastProviderContext.ts';
import { isFocusVisible } from './utils.ts';

const ToastViewportCssVars = {
  /** Indicates the height of the frontmost toast. */
  frontmostHeight: '--toast-frontmost-height',
} as const;

export interface ToastViewportState {
  /** Whether toasts are expanded in the viewport. */
  expanded: boolean;
}

export interface ToastViewportProps extends BaseUIComponentProps<'div', ToastViewportState> {}

export function ToastViewport(props: ToastViewportProps): JSX.Element {
  const context = useToastProviderContext();
  const { store } = context;
  const windowFocusTimeout = useTimeout();

  let handlingFocusGuard = false;
  let markedReadyForMouseLeave = false;
  let touchActive = false;

  const isEmpty = useToastSelector(context, selectors.isEmpty);
  const toasts = useToastSelector(context, selectors.toasts);
  const expanded = useToastSelector(context, selectors.expanded);
  const prevFocusElement = useToastSelector(context, selectors.prevFocusElement);
  const viewportElement = useToastSelector(context, (state) => state.viewport);
  const frontmostHeight = createMemo(() => toasts()[0]?.height);
  const hasTransitioningToasts = createMemo(() =>
    toasts().some((toast) => toast.transitionStatus === 'ending'),
  );

  createEffect(
    () => [viewportElement(), isEmpty()] as const,
    ([viewport, empty]) => {
      // Listen once toasts exist and the viewport element is attached.
      if (!viewport || empty) {
        return undefined;
      }

      const win = ownerWindow(viewport);
      const doc = ownerDocument(viewport);

      // F6 anywhere force-focuses the viewport.
      function handleGlobalKeyDown(event: KeyboardEvent) {
        if (event.key === 'F6' && getTarget(event) !== viewport) {
          event.preventDefault();
          store.set('prevFocusElement', activeElement(doc) as HTMLElement | null);
          viewport?.focus({ preventScroll: true });
          store.pauseTimers();
          store.set('focused', true);
        }
      }

      function handleWindowBlur(event: FocusEvent) {
        if (getTarget(event) !== win) {
          return;
        }

        store.set('isWindowFocused', false);
        store.pauseTimers();
      }

      function handleWindowFocus(event: FocusEvent) {
        if (event.relatedTarget) {
          return;
        }

        const target = getTarget(event);
        const activeEl = activeElement(ownerDocument(viewport));
        if (
          target === win ||
          !contains(viewport, target as HTMLElement | null) ||
          !isFocusVisible(activeEl)
        ) {
          store.resumeTimers();
        }

        // Wait for the viewport's own focus handler to run.
        windowFocusTimeout.start(0, () => store.set('isWindowFocused', true));
      }

      return mergeCleanups(
        addEventListener(win, 'keydown', handleGlobalKeyDown),
        addEventListener(win, 'blur', handleWindowBlur, true),
        addEventListener(win, 'focus', handleWindowFocus, true),
        addEventListener(doc, 'pointerdown', store.handleDocumentPointerDown, true),
      );
    },
  );

  function handleFocusGuard(event: FocusEvent) {
    handlingFocusGuard = true;

    // Coming off the container, move to the first toast that can hold focus,
    // skipping toasts that are animating out or inert because they're limited.
    const firstFocusableToast =
      event.relatedTarget === store.state.viewport
        ? store.state.toasts.find((toast) => toast.transitionStatus !== 'ending' && !toast.limited)
        : undefined;

    if (firstFocusableToast) {
      firstFocusableToast.ref?.current?.focus();
    } else {
      store.restoreFocusToPrevElement();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Tab' && event.shiftKey && getTarget(event) === store.state.viewport) {
      event.preventDefault();
      // Restoring focus blurs the viewport, and the focusout handler resumes
      // the timers (unless focus lands inside the viewport again).
      store.restoreFocusToPrevElement();
    }
  }

  function flushMouseLeave() {
    const hasEndingToasts = store.state.toasts.some((toast) => toast.transitionStatus === 'ending');

    if (hasEndingToasts || touchActive || !markedReadyForMouseLeave) {
      return;
    }

    // Apply a mouseleave that was deferred until transitions finished.
    store.set('hovering', false);
    if (!selectors.expandedOrOutOfFocus(store.state)) {
      store.resumeTimers();
    }
    markedReadyForMouseLeave = false;
  }

  createEffect(hasTransitioningToasts, () => {
    flushMouseLeave();
  });

  function handleMouseEnter() {
    store.pauseTimers();
    store.set('hovering', true);
    markedReadyForMouseLeave = false;
  }

  function handleMouseLeave() {
    // While toasts are transitioning out or a touch gesture is active this
    // records the intent and collapses later; otherwise it collapses now.
    markedReadyForMouseLeave = true;
    flushMouseLeave();
  }

  function handlePointerDown(event: PointerEvent) {
    if (event.pointerType === 'touch') {
      touchActive = true;
    }
  }

  function handlePointerEnd(event: PointerEvent) {
    if (event.pointerType !== 'touch') {
      return;
    }

    touchActive = false;
    flushMouseLeave();
  }

  function handleFocus() {
    if (handlingFocusGuard) {
      handlingFocusGuard = false;
      return;
    }

    if (store.state.focused) {
      return;
    }

    // Only a focus-visible element expands the viewport, so a click inside
    // without keyboard navigation does not keep it expanded.
    if (isFocusVisible(activeElement(ownerDocument(store.state.viewport)))) {
      store.set('focused', true);
      store.pauseTimers();
    }
  }

  function handleBlur(event: FocusEvent) {
    if (
      !store.state.focused ||
      contains(store.state.viewport, event.relatedTarget as HTMLElement | null)
    ) {
      return;
    }

    store.set('focused', false);
    if (!selectors.expandedOrOutOfFocus(store.state)) {
      store.resumeTimers();
    }
  }

  const defaultProps: HTMLProps = {
    tabindex: -1,
    role: 'region',
    'aria-live': 'polite',
    'aria-atomic': 'false',
    'aria-relevant': 'additions text',
    'aria-label': 'Notifications',
    onMouseEnter: handleMouseEnter,
    onMouseMove: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocusIn: handleFocus,
    onFocusOut: handleBlur,
    onKeyDown: handleKeyDown,
    onClick: handleFocus,
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerEnd,
    onPointerCancel: handlePointerEnd,
    get style() {
      const height = frontmostHeight();
      return height ? { [ToastViewportCssVars.frontmostHeight]: `${height}px` } : undefined;
    },
  };

  const state: ToastViewportState = {
    get expanded() {
      return expanded();
    },
  };

  const showFocusGuard = () => !isEmpty() && prevFocusElement() != null;
  const focusGuard = () => (
    <Show when={showFocusGuard()}>
      <FocusGuard onFocus={handleFocusGuard} />
    </Show>
  );

  const content = (
    <>
      {focusGuard()}
      {props.children}
      {focusGuard()}
    </>
  );

  const element = useRenderElement('div', props, {
    ref: store.setViewport,
    state,
    props: [
      defaultProps,
      omit(props, 'class', 'style', 'render', 'children'),
      {
        get children() {
          return content;
        },
      },
    ],
  });

  return (
    <>
      {focusGuard()}
      {element}
    </>
  );
}
