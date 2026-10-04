// Upstream: packages/react/src/floating-ui-react/hooks/useFocus.ts
//
// Opens a popup while its trigger has keyboard focus (`:focus-visible`, so a
// mouse press that focuses the trigger does not open it) and closes it when
// focus leaves for somewhere other than the popup or another of its
// triggers. After a trigger press or Escape closed the popup, focus on that
// same trigger does not reopen it until the pointer leaves or focus moves.
// Leaving the window with the trigger focused does not reopen the popup when
// the window regains focus.
import { getWindow, isElement, isHTMLElement } from '@floating-ui/utils/dom';
import { createEffect, onCleanup, untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { FloatingUIOpenChangeDetails, HTMLProps } from '../../internals/types.ts';
import { addEventListener, mergeCleanups, ownerDocument } from '../../utils/dom.ts';
import { platform } from '../../utils/platform.ts';
import { useTimeout } from '../../utils/timers.ts';
import type { FloatingRootContext } from '../FloatingRootContext.ts';
import {
  activeElement,
  contains,
  createAttribute,
  getTarget,
  isTargetInsideEnabledTrigger,
  isTypeableElement,
  matchesFocusVisible,
} from '../utils/element.ts';

const isMacSafari = platform.os.mac && platform.engine.webkit;

export interface UseFocusProps {
  /** Whether focus opens the popup. Read live. @default true */
  enabled?: boolean | undefined;
  /** How long focus rests before the popup opens, in ms. */
  delay?: number | undefined;
}

export function useFocus(
  context: FloatingRootContext,
  props: UseFocusProps = {},
): { reference: HTMLProps; trigger: HTMLProps } {
  const { events, dataRef } = context;
  const enabled = () => props.enabled ?? true;

  let blockFocus = false;
  // The trigger kept from reopening after an Escape or trigger-press close.
  let blockedReference: Element | null = null;
  let keyboardModality = true;
  const timeout = useTimeout();

  createEffect(
    () => [enabled(), context.domReferenceElement()] as const,
    ([isEnabled, domReference]) => {
      if (!isEnabled) {
        return undefined;
      }
      const win = getWindow(domReference);
      // The trigger kept focus while the user left the window: returning must not open it.
      const onBlur = () => {
        const currentDomReference = untrack(context.domReferenceElement);
        if (
          !untrack(context.open) &&
          isHTMLElement(currentDomReference) &&
          currentDomReference === activeElement(ownerDocument(currentDomReference))
        ) {
          blockFocus = true;
          blockedReference = currentDomReference;
        }
      };
      const onKeyDown = () => {
        keyboardModality = true;
      };
      const onPointerDown = () => {
        keyboardModality = false;
      };
      return mergeCleanups(
        addEventListener(win, 'blur', onBlur),
        isMacSafari && addEventListener(win, 'keydown', onKeyDown, true),
        isMacSafari && addEventListener(win, 'pointerdown', onPointerDown, true),
      );
    },
  );

  const onOpenChangeLocal = (details: FloatingUIOpenChangeDetails) => {
    if (!untrack(enabled)) {
      return;
    }
    if (details.reason === REASONS.triggerPress || details.reason === REASONS.escapeKey) {
      const referenceElement = untrack(context.domReferenceElement);
      if (isElement(referenceElement)) {
        blockedReference = referenceElement;
        blockFocus = true;
      }
    }
  };
  events.on('openchange', onOpenChangeLocal);
  onCleanup(() => events.off('openchange', onOpenChangeLocal));

  const resetBlockedFocus = () => {
    blockFocus = false;
    blockedReference = null;
  };

  const reference: HTMLProps = {
    onMouseLeave() {
      resetBlockedFocus();
    },
    onFocus(event: FocusEvent) {
      if (!untrack(enabled)) {
        return;
      }
      const focusTarget = event.currentTarget as HTMLElement;
      if (blockFocus) {
        if (blockedReference === focusTarget) {
          return;
        }
        resetBlockedFocus();
      }

      const target = getTarget(event);
      if (isElement(target)) {
        // Safari fails to match `:focus-visible` when focus came from outside the document.
        if (isMacSafari && !event.relatedTarget) {
          if (!keyboardModality && !isTypeableElement(target)) {
            return;
          }
        } else if (!matchesFocusVisible(target)) {
          return;
        }
      }

      const movedFromOtherEnabledTrigger = isTargetInsideEnabledTrigger(
        event.relatedTarget,
        context.triggerElements,
      );
      const open = () =>
        context.setOpen(true, createChangeEventDetails(REASONS.triggerFocus, event, focusTarget));

      const delay = props.delay;
      if ((untrack(context.open) && movedFromOtherEnabledTrigger) || !delay) {
        open();
        return;
      }
      timeout.start(delay, () => {
        if (!blockFocus) {
          open();
        }
      });
    },
    onBlur(event: FocusEvent) {
      if (!untrack(enabled)) {
        return;
      }
      resetBlockedFocus();
      const relatedTarget = event.relatedTarget;
      // Focus moving onto the non-modal focus manager's outside guard goes on into the popup.
      const movedToFocusGuard =
        isElement(relatedTarget) &&
        relatedTarget.hasAttribute(createAttribute('focus-guard')) &&
        relatedTarget.getAttribute('data-type') === 'outside';

      // Waits for the window blur listener.
      timeout.start(0, () => {
        const domReference = untrack(context.domReferenceElement);
        const activeEl = activeElement(ownerDocument(domReference));
        // Focus left the page: keep it open.
        if (!relatedTarget && activeEl === domReference) {
          return;
        }
        if (
          contains(dataRef.current.floatingContext?.elements.floating, activeEl) ||
          contains(domReference, activeEl) ||
          movedToFocusGuard
        ) {
          return;
        }
        // Another trigger of this popup took focus; its own focus handler decides.
        const nextFocusedElement = relatedTarget ?? activeEl;
        if (isTargetInsideEnabledTrigger(nextFocusedElement, context.triggerElements)) {
          return;
        }
        context.setOpen(false, createChangeEventDetails(REASONS.triggerFocus, event));
      });
    },
  };

  return { reference, trigger: reference };
}
