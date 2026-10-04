// Upstream: packages/react/src/floating-ui-react/components/FloatingFocusManager.tsx
//
// Moves focus into a popup when it opens and back to its trigger (or what
// had focus before) when it closes. A modal popup traps Tab between focus
// guards and hides the rest of the page from assistive tech; a non-modal one
// closes when focus leaves it for something outside its tree. Focus lost
// inside the popup (its focused element removed) can be restored.
//
// Upstream also tracks focus moving through React portals that stay inside
// the React tree; Solid's tree is the DOM's here, so that is not ported.
import { getNodeName, isHTMLElement } from '@floating-ui/utils/dom';
import type { JSX } from '@solidjs/web';
import { createEffect, onCleanup, Show, untrack } from 'solid-js';

import { CLICK_TRIGGER_IDENTIFIER } from '../internals/constants.ts';
import { createChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../internals/reasons.ts';
import type { FloatingUIOpenChangeDetails } from '../internals/types.ts';
import { addEventListener, mergeCleanups, ownerDocument, ownerWindow } from '../utils/dom.ts';
import { FocusGuard } from '../utils/FocusGuard.tsx';
import { platform } from '../utils/platform.ts';
import { useAnimationFrame, useTimeout } from '../utils/timers.ts';
import type { FloatingRootContext } from './FloatingRootContext.ts';
import { type MaybeRef, resolveRef, usePortalContext } from './FloatingPortal.tsx';
import {
  type FloatingTreeStore,
  getNodeAncestors,
  getNodeChildren,
  useFloatingTree,
} from './FloatingTree.tsx';
import { isElementVisible } from './utils/composite.ts';
import {
  activeElement,
  closest,
  contains,
  createAttribute,
  getFloatingFocusElement,
  getTarget,
  isTypeableCombobox,
  isTypeableElement,
} from './utils/element.ts';
import { enqueueFocus, isVirtualClick, isVirtualPointerEvent, stopEvent } from './utils/event.ts';
import { markOthers } from './utils/markOthers.ts';
import {
  type FocusableElement,
  focusable,
  getNextTabbable,
  getPreviousTabbable,
  isOutsideEvent,
  isTabbable,
  tabbable,
} from './utils/tabbable.ts';

/** How a popup was opened or closed: by pointer type, keyboard, or `''` when unknown. */
export type InteractionType = 'mouse' | 'touch' | 'pen' | 'keyboard' | '';

function getEventType(
  event: Event | undefined,
  lastInteractionType?: InteractionType,
): InteractionType {
  if (!event) {
    return lastInteractionType || '';
  }
  const win = ownerWindow(getTarget(event) as Element | null);
  if (event instanceof win.KeyboardEvent) {
    return 'keyboard';
  }
  if (event instanceof win.FocusEvent) {
    // Focus can follow a pointer press (focusout on an outside press); prefer the last pointer type.
    return lastInteractionType || 'keyboard';
  }
  if ('pointerType' in event) {
    // A trusted click without a pointer type is keyboard or assistive tech.
    return (
      ((event as PointerEvent).pointerType as InteractionType) ||
      (isVirtualClick(event as PointerEvent) ? 'keyboard' : lastInteractionType || 'mouse')
    );
  }
  if ('touches' in event) {
    return 'touch';
  }
  if (event instanceof win.MouseEvent) {
    return lastInteractionType || (event.detail === 0 ? 'keyboard' : 'mouse');
  }
  return '';
}

const LIST_LIMIT = 20;
let previouslyFocusedElements: WeakRef<Element>[] = [];

function clearDisconnectedPreviouslyFocusedElements() {
  previouslyFocusedElements = previouslyFocusedElements.filter(
    (entry) => entry.deref()?.isConnected,
  );
}

function addPreviouslyFocusedElement(element: Element | null | undefined) {
  clearDisconnectedPreviouslyFocusedElements();
  if (element && getNodeName(element) !== 'body') {
    previouslyFocusedElements.push(new WeakRef(element));
    if (previouslyFocusedElements.length > LIST_LIMIT) {
      previouslyFocusedElements = previouslyFocusedElements.slice(-LIST_LIMIT);
    }
  }
}

function getPreviouslyFocusedElement() {
  clearDisconnectedPreviouslyFocusedElements();
  return previouslyFocusedElements[previouslyFocusedElements.length - 1]?.deref();
}

function getFirstTabbableElement(container: Element | null) {
  if (!container) {
    return null;
  }
  if (isTabbable(container)) {
    return container;
  }
  return tabbable(container)[0] || container;
}

/** A dialog popup with nothing tabbable inside takes focus itself; otherwise it stays out of the Tab order. */
function handleTabIndex(floatingFocusElement: HTMLElement) {
  if (
    floatingFocusElement.hasAttribute('tabindex') &&
    !floatingFocusElement.hasAttribute('data-tabindex')
  ) {
    return;
  }
  if (!floatingFocusElement.getAttribute('role')?.includes('dialog')) {
    return;
  }
  const tabbableContent = focusable(floatingFocusElement).filter((element: Element) => {
    const dataTabIndex = element.getAttribute('data-tabindex') || '';
    const managed = element.hasAttribute('data-tabindex') && !dataTabIndex.startsWith('-');
    return isTabbable(element) || managed;
  });
  const tabIndex = floatingFocusElement.getAttribute('tabindex');
  if (tabbableContent.length === 0) {
    if (tabIndex !== '0') {
      floatingFocusElement.setAttribute('tabindex', '0');
      // Marks this write as ours, so the early return above does not freeze it.
      floatingFocusElement.setAttribute('data-tabindex', '0');
    }
  } else if (
    tabIndex !== '-1' ||
    (floatingFocusElement.hasAttribute('data-tabindex') &&
      floatingFocusElement.getAttribute('data-tabindex') !== '-1')
  ) {
    floatingFocusElement.setAttribute('tabindex', '-1');
    floatingFocusElement.setAttribute('data-tabindex', '-1');
  }
}

type FocusTarget =
  | boolean
  | MaybeRef<HTMLElement | null>
  | ((interactionType: InteractionType) => boolean | HTMLElement | null | void);

export interface FloatingFocusManagerProps {
  children?: JSX.Element;
  context: FloatingRootContext;
  /** How the popup was opened; `null` means programmatically (focus returns to what had it). */
  openInteractionType?: InteractionType | null | undefined;
  disabled?: boolean | undefined;
  /**
   * What takes focus on open: `true` the first tabbable element (else the
   * popup), `false` nothing, an element, or a function of the open type.
   */
  initialFocus?: FocusTarget | undefined;
  /**
   * What takes focus on close: `true` the trigger (or what had focus before),
   * `false` nothing, an element, or a function of the close type.
   */
  returnFocus?: FocusTarget | undefined;
  /** Whether `returnFocus` is the consumer's explicit target (returned to even if focus moved elsewhere). */
  explicitReturnFocus?: boolean | undefined;
  /** Where focus goes when the focused element inside is removed: `true` a nearby tabbable, `'popup'` the popup. */
  restoreFocus?: boolean | 'popup' | undefined;
  /** Whether focus is trapped inside and the rest of the page hidden from assistive tech. */
  modal?: boolean | undefined;
  /** Whether focus leaving the popup and its trigger closes it. */
  closeOnFocusOut?: boolean | undefined;
  nextFocusableElement?: MaybeRef<HTMLElement | null> | null | undefined;
  previousFocusableElement?: MaybeRef<HTMLElement | null> | null | undefined;
  /** Receives the guard before the content, to focus the popup programmatically. */
  beforeContentFocusGuardRef?: { current: HTMLSpanElement | null } | undefined;
  externalTree?: FloatingTreeStore | undefined;
  /** Elements outside the popup that count as inside it. */
  getInsideElements?: (() => Array<Element | null | undefined>) | undefined;
}

export function FloatingFocusManager(props: FloatingFocusManagerProps): JSX.Element {
  const context = props.context;
  const { events, dataRef } = context;
  const tree = useFloatingTree(props.externalTree);
  const portalContext = usePortalContext();

  const disabled = () => props.disabled ?? false;
  const modal = () => props.modal ?? true;
  const closeOnFocusOut = () => props.closeOnFocusOut ?? true;
  const restoreFocus = () => props.restoreFocus ?? false;
  const initialFocus = () => props.initialFocus ?? true;
  const returnFocus = () => props.returnFocus ?? true;
  const openInteractionType = () =>
    props.openInteractionType === undefined ? '' : props.openInteractionType;
  const floatingFocusElement = () => getFloatingFocusElement(context.floatingElement());
  // A typeable combobox trigger with `initialFocus={false}` keeps focus in its
  // input: no guards, but the outside is still hidden from assistive tech.
  const isUntrappedTypeableCombobox = () =>
    isTypeableCombobox(context.domReferenceElement()) && props.initialFocus === false;

  const getNodeId = () => dataRef.current.floatingContext?.nodeId;

  let preventReturnFocus = false;

  // The return target as it stood while the manager was enabled. A popup derives it from
  // state its own close clears (a menu returns focus only while its active trigger is
  // known, and that reads null once unmounted), so the value read at close is the last
  // one from before the manager was disabled. React gets the same from its unmounted
  // manager keeping its last props.
  let enabledReturnFocus = untrack(returnFocus);
  createEffect(
    () => [disabled(), returnFocus()] as const,
    ([isDisabled, value]) => {
      if (!isDisabled) {
        enabledReturnFocus = value;
      }
    },
  );
  let isPointerDown = false;
  let pointerDownOutside = false;
  let focusOutHandledByPortal = false;
  let lastFocusedTabbable: FocusableElement | null = null;
  let closeType: InteractionType = '';
  let lastInteractionType: InteractionType = '';
  let pendingReturnFocus: { cancelled: boolean } | null = null;

  const beforeGuardRef: { current: HTMLSpanElement | null } = { current: null };
  const afterGuardRef: { current: HTMLSpanElement | null } = { current: null };

  const blurTimeout = useTimeout();
  const pointerDownTimeout = useTimeout();
  const restoreFocusFrame = useAnimationFrame();

  const getTabbableContent = (container: Element | null = untrack(floatingFocusElement)) =>
    container ? tabbable(container) : [];

  const getResolvedInsideElements = () =>
    props.getInsideElements?.().filter((element): element is Element => element != null) ?? [];

  // Tab cannot leave a modal with nothing tabbable inside.
  createEffect(
    () => [disabled(), modal(), context.floatingElement(), isUntrappedTypeableCombobox()] as const,
    ([isDisabled, isModal, floatingForFocus, untrapped]) => {
      // Resolved here, once the popup's content is in the DOM.
      const focusElement = getFloatingFocusElement(floatingForFocus);
      if (isDisabled || !isModal) {
        return undefined;
      }
      return addEventListener(ownerDocument(focusElement), 'keydown', (event: KeyboardEvent) => {
        if (
          event.key === 'Tab' &&
          contains(focusElement, activeElement(ownerDocument(focusElement))) &&
          getTabbableContent(focusElement).length === 0 &&
          !untrapped
        ) {
          stopEvent(event);
        }
      });
    },
  );

  // Tracks pointer and keyboard interaction, to tell focus moves from outside presses.
  createEffect(
    () =>
      [
        disabled(),
        context.open(),
        context.floatingElement(),
        context.domReferenceElement(),
        context.floatingElement(),
      ] as const,
    ([isDisabled, open, floating, domReference, floatingForFocus]) => {
      // Resolved here, once the popup's content is in the DOM.
      const focusElement = getFloatingFocusElement(floatingForFocus);
      if (isDisabled || !open) {
        return undefined;
      }
      const doc = ownerDocument(focusElement);
      const clearPointerDownOutside = () => {
        pointerDownOutside = false;
      };
      const onPointerDown = (event: PointerEvent) => {
        const target = getTarget(event) as Element | null;
        const pointerTargetInside =
          contains(floating, target) ||
          contains(domReference, target) ||
          contains(portalContext?.portalNode(), target) ||
          getResolvedInsideElements().some(
            (element) => element === target || contains(element, target),
          );
        pointerDownOutside = !pointerTargetInside;
        lastInteractionType = (event.pointerType as InteractionType) || 'keyboard';
        if (closest(target, `[${CLICK_TRIGGER_IDENTIFIER}]`)) {
          isPointerDown = true;
          // Reset next tick, so one click on a click trigger does not keep focus-out closing off.
          pointerDownTimeout.start(0, () => {
            isPointerDown = false;
          });
        }
      };
      const onKeyDown = () => {
        lastInteractionType = 'keyboard';
      };
      return mergeCleanups(
        addEventListener(doc, 'pointerdown', onPointerDown, true),
        addEventListener(doc, 'pointerup', clearPointerDownOutside, true),
        addEventListener(doc, 'pointercancel', clearPointerDownOutside, true),
        addEventListener(doc, 'keydown', onKeyDown, true),
        // A popup dismissed between pointerdown and pointerup must not carry `true` into its next open.
        clearPointerDownOutside,
      );
    },
  );

  // Closes on focus out, and restores focus lost inside.
  createEffect(
    () =>
      [
        disabled(),
        closeOnFocusOut(),
        context.domReferenceElement(),
        context.floatingElement(),
        context.floatingElement(),
        modal(),
        restoreFocus(),
        isUntrappedTypeableCombobox(),
      ] as const,
    ([
      isDisabled,
      closeOnOut,
      domReference,
      floating,
      floatingForFocus,
      isModal,
      restore,
      untrapped,
    ]) => {
      // Resolved here, once the popup's content is in the DOM.
      const focusElement = getFloatingFocusElement(floatingForFocus);
      if (isDisabled || !closeOnOut) {
        return undefined;
      }
      const doc = ownerDocument(focusElement);

      // In Safari, buttons lose focus when pressed.
      const handlePointerDown = () => {
        isPointerDown = true;
        pointerDownTimeout.start(0, () => {
          isPointerDown = false;
        });
      };

      const handleFocusIn = (event: FocusEvent) => {
        const target = getTarget(event) as FocusableElement | null;
        if (isTabbable(target)) {
          lastFocusedTabbable = target;
        }
      };

      const handleFocusOutside = (event: FocusEvent) => {
        const relatedTarget = event.relatedTarget as HTMLElement | null;
        const currentTarget = event.currentTarget;
        const target = getTarget(event) as HTMLElement | null;

        // Focus lost to the body (a backdrop press): remember what had it, so a
        // confirmation opened meanwhile can return there. Modal only.
        if (isModal && relatedTarget == null && target != null && contains(floating, target)) {
          addPreviouslyFocusedElement(target);
        }

        queueMicrotask(() => {
          const nodeId = getNodeId();
          const insideElements = getResolvedInsideElements();
          const isRelatedFocusGuard =
            relatedTarget?.hasAttribute(createAttribute('focus-guard')) &&
            [
              beforeGuardRef.current,
              afterGuardRef.current,
              portalContext?.beforeInsideRef.current,
              portalContext?.afterInsideRef.current,
              portalContext?.beforeOutsideRef.current,
              portalContext?.afterOutsideRef.current,
              resolveRef(props.previousFocusableElement),
              resolveRef(props.nextFocusableElement),
            ].includes(relatedTarget);

          const movedToUnrelatedNode = !(
            contains(domReference, relatedTarget) ||
            contains(floating, relatedTarget) ||
            contains(relatedTarget, floating) ||
            contains(portalContext?.portalNode(), relatedTarget) ||
            insideElements.some(
              (element) => element === relatedTarget || contains(element, relatedTarget),
            ) ||
            context.triggerElements.hasMatchingElement((trigger) =>
              contains(trigger, relatedTarget),
            ) ||
            isRelatedFocusGuard ||
            (tree &&
              (getNodeChildren(tree.nodesRef.current, nodeId).find(
                (node) =>
                  contains(node.context?.elements.floating, relatedTarget) ||
                  contains(node.context?.elements.domReference, relatedTarget),
              ) ||
                getNodeAncestors(tree.nodesRef.current, nodeId).find(
                  (node) =>
                    [
                      node.context?.elements.floating,
                      getFloatingFocusElement(node.context?.elements.floating),
                    ].includes(relatedTarget) ||
                    node.context?.elements.domReference === relatedTarget,
                )))
          );

          if (currentTarget === domReference && focusElement) {
            handleTabIndex(focusElement);
          }

          // Focus fell to the body because the focused element went away: put it back inside.
          if (
            restore &&
            currentTarget !== domReference &&
            !isElementVisible(target) &&
            activeElement(doc) === doc.body
          ) {
            if (isHTMLElement(focusElement)) {
              focusElement.focus();
              if (restore === 'popup') {
                // An element removed on pointerdown pulls focus back in the same
                // tick and loses it; focusing again a frame later wins that race.
                restoreFocusFrame.request(() => focusElement.focus());
                return;
              }
            }
            const tabbableContent = getTabbableContent(focusElement) as Array<Element | null>;
            const nodeToFocus =
              (lastFocusedTabbable && tabbableContent.includes(lastFocusedTabbable)
                ? lastFocusedTabbable
                : null) ||
              tabbableContent[tabbableContent.length - 1] ||
              focusElement;
            if (isHTMLElement(nodeToFocus)) {
              nodeToFocus.focus();
            }
          }

          // In a portal, Tab out of the popup is the portal's guards' to close on.
          if (focusOutHandledByPortal) {
            focusOutHandledByPortal = false;
            return;
          }

          if (
            (untrapped ? true : !isModal) &&
            relatedTarget &&
            movedToUnrelatedNode &&
            !isPointerDown &&
            (untrapped || relatedTarget !== getPreviouslyFocusedElement())
          ) {
            preventReturnFocus = true;
            context.setOpen(false, createChangeEventDetails(REASONS.focusOut, event));
          }
        });
      };

      const markFocusOutHandledByPortal = () => {
        if (pointerDownOutside) {
          return;
        }
        focusOutHandledByPortal = true;
        blurTimeout.start(0, () => {
          focusOutHandledByPortal = false;
        });
      };

      const domReferenceElement = isHTMLElement(domReference) ? domReference : null;
      if (!floating && !domReferenceElement) {
        return undefined;
      }

      return mergeCleanups(
        domReferenceElement
          ? addEventListener(domReferenceElement, 'focusout', handleFocusOutside)
          : undefined,
        domReferenceElement
          ? addEventListener(domReferenceElement, 'pointerdown', handlePointerDown)
          : undefined,
        floating ? addEventListener(floating, 'focusin', handleFocusIn) : undefined,
        floating ? addEventListener(floating, 'focusout', handleFocusOutside) : undefined,
        floating && portalContext
          ? addEventListener(floating, 'focusout', markFocusOutHandledByPortal, true)
          : undefined,
      );
    },
  );

  // Hides everything outside the popup's tree from assistive tech while open.
  createEffect(
    () =>
      [
        disabled(),
        context.floatingElement(),
        context.open(),
        modal(),
        isUntrappedTypeableCombobox(),
        context.domReferenceElement(),
        portalContext?.portalNode() ?? null,
      ] as const,
    ([isDisabled, floating, open, isModal, untrapped, domReference, portalNode]) => {
      if (isDisabled || !floating || !open) {
        return undefined;
      }
      // Portals nested in this one stay visible.
      const portalNodes = Array.from(
        portalNode?.querySelectorAll(`[${createAttribute('portal')}]`) || [],
      );
      const ancestors = tree ? getNodeAncestors(tree.nodesRef.current, getNodeId()) : [];
      const rootAncestorComboboxDomReference = ancestors.find((node) =>
        isTypeableCombobox(node.context?.elements.domReference || null),
      )?.context?.elements.domReference;
      const insideElements = [
        floating,
        ...portalNodes,
        beforeGuardRef.current,
        afterGuardRef.current,
        portalContext?.beforeOutsideRef.current,
        portalContext?.afterOutsideRef.current,
        ...getResolvedInsideElements(),
        rootAncestorComboboxDomReference,
        // Read as the effect runs, not tracked: the guards follow the popup's open state.
        untrack(() => resolveRef(props.previousFocusableElement)),
        untrack(() => resolveRef(props.nextFocusableElement)),
        untrapped ? domReference : null,
      ].filter((x): x is Element => x != null);
      const ariaHiddenCleanup = markOthers(insideElements, {
        ariaHidden: isModal || untrapped,
        mark: false,
      });
      const markerCleanup = markOthers(
        [floating, ...portalNodes].filter((x): x is Element => x != null),
      );
      return () => {
        markerCleanup();
        ariaHiddenCleanup();
      };
    },
  );

  // Focuses the initial element on open.
  createEffect(
    () => [context.open(), disabled(), context.floatingElement()] as const,
    ([open, isDisabled, floatingForFocus]) => {
      // Resolved here, once the popup's content is in the DOM.
      const focusElement = getFloatingFocusElement(floatingForFocus);
      if (!open || isDisabled || !isHTMLElement(focusElement)) {
        return;
      }
      closeType = '';
      lastInteractionType = '';
      const doc = ownerDocument(focusElement);
      const previouslyFocusedElement = activeElement(doc);

      // Let the parts set their tabindex first.
      queueMicrotask(() => {
        const initial = untrack(initialFocus);
        const resolvedInitialFocus =
          typeof initial === 'function' ? initial(untrack(openInteractionType) || '') : initial;
        // `null` falls back to the default (an empty ref).
        if (resolvedInitialFocus === undefined || resolvedInitialFocus === false) {
          return;
        }
        if (contains(focusElement, previouslyFocusedElement)) {
          return;
        }
        let focusableElements: FocusableElement[] | null = null;
        const getDefaultFocusElement = () => {
          focusableElements ??= getTabbableContent(focusElement);
          return focusableElements[0] || focusElement;
        };
        let elToFocus: FocusableElement | null | undefined =
          resolvedInitialFocus === true || resolvedInitialFocus === null
            ? getDefaultFocusElement()
            : resolveRef(resolvedInitialFocus);
        elToFocus = elToFocus || getDefaultFocusElement();
        const hadFocusInside = contains(focusElement, activeElement(doc));
        // Screen readers re-sync focus right after a synthesized press; a focus a
        // frame later reads as a stray move, so it is moved at once then.
        const openEvent = dataRef.current.openEvent;
        const openedByVirtualPress =
          openEvent?.type === 'mousedown' && isVirtualClick(openEvent as MouseEvent);
        const target = elToFocus;
        enqueueFocus(target, {
          sync: openedByVirtualPress,
          preventScroll: target === focusElement,
          shouldFocus() {
            // Closed meanwhile (Tab out of a kept-mounted popup): leave focus where it went.
            if (!untrack(context.open)) {
              return false;
            }
            if (hadFocusInside) {
              return true;
            }
            const current = activeElement(doc);
            return !(current !== target && contains(focusElement, current));
          },
        });
      });
    },
  );

  // Records where focus returns to, and returns it when the popup closes or unmounts.
  createEffect(
    () =>
      [
        disabled(),
        context.floatingElement(),
        context.floatingElement(),
        context.domReferenceElement(),
      ] as const,
    ([isDisabled, floating, floatingForFocus, domReference]) => {
      // Resolved here, once the popup's content is in the DOM.
      const focusElement = getFloatingFocusElement(floatingForFocus);
      if (isDisabled || !focusElement) {
        pendingReturnFocus = null;
        return undefined;
      }
      // Re-armed in the same flush: a dependency changed while open, so the cleanup was no close.
      if (pendingReturnFocus) {
        pendingReturnFocus.cancelled = true;
        pendingReturnFocus = null;
      }
      const doc = ownerDocument(focusElement);
      const elementFocusedBeforeOpen = activeElement(doc);
      // Only an explicit `null` interaction type is a programmatic open.
      const preferPreviousFocus = untrack(openInteractionType) == null;
      addPreviouslyFocusedElement(elementFocusedBeforeOpen);

      const onOpenChangeLocal = (details: FloatingUIOpenChangeDetails) => {
        if (!details.open) {
          closeType = getEventType(details.nativeEvent, lastInteractionType);
        }
        // Focus guards move focus themselves; a hover close by leaving moves none.
        if (
          (details.reason === REASONS.focusOut &&
            details.triggerElement?.hasAttribute(createAttribute('focus-guard'))) ||
          (details.reason === REASONS.triggerHover && details.nativeEvent?.type === 'mouseleave')
        ) {
          preventReturnFocus = true;
        }
        if (details.reason !== REASONS.outsidePress) {
          return;
        }
        if (details.nested) {
          preventReturnFocus = false;
        } else if (
          isVirtualClick(details.nativeEvent as MouseEvent) ||
          isVirtualPointerEvent(details.nativeEvent as PointerEvent)
        ) {
          preventReturnFocus = false;
        } else {
          // On an outside press, focus returns only where `focus({ preventScroll })`
          // is supported; elsewhere it would scroll the page.
          let isPreventScrollSupported = false;
          doc.createElement('div').focus({
            get preventScroll() {
              isPreventScrollSupported = true;
              return false;
            },
          });
          preventReturnFocus = !isPreventScrollSupported;
        }
      };
      events.on('openchange', onOpenChangeLocal);

      const getReturnElement = (type: InteractionType) => {
        const value = enabledReturnFocus;
        let resolved = typeof value === 'function' ? value(type) : value;
        if (resolved === undefined || resolved === false) {
          return null;
        }
        if (resolved === null) {
          resolved = true;
        }
        const referenceReturnElement = domReference?.isConnected ? domReference : null;
        const previousReturnElement =
          elementFocusedBeforeOpen?.isConnected && getNodeName(elementFocusedBeforeOpen) !== 'body'
            ? elementFocusedBeforeOpen
            : null;
        let defaultReturnElement = preferPreviousFocus
          ? previousReturnElement || referenceReturnElement
          : referenceReturnElement || previousReturnElement;
        if (!defaultReturnElement) {
          defaultReturnElement = getPreviouslyFocusedElement() || null;
        }
        if (typeof resolved === 'boolean') {
          return defaultReturnElement;
        }
        return resolveRef(resolved) || defaultReturnElement || null;
      };

      return () => {
        events.off('openchange', onOpenChangeLocal);
        const activeEl = activeElement(doc);
        const isFocusInsideFloatingTree =
          contains(floating, activeEl) ||
          getResolvedInsideElements().some(
            (element) => element === activeEl || contains(element, activeEl),
          ) ||
          (tree &&
            getNodeChildren(tree.nodesRef.current, getNodeId(), false).some((node) =>
              contains(node.context?.elements.floating, activeEl),
            ));
        const returnFocusValue = enabledReturnFocus;
        const returnElement = getReturnElement(closeType);
        const job = { cancelled: false };
        pendingReturnFocus = job;

        queueMicrotask(() => {
          if (pendingReturnFocus === job) {
            pendingReturnFocus = null;
          }
          const tabbableReturnElement = getFirstTabbableElement(returnElement);
          const hasExplicitReturnFocus =
            untrack(() => props.explicitReturnFocus) ?? typeof returnFocusValue !== 'boolean';
          if (
            !job.cancelled &&
            returnFocusValue &&
            !preventReturnFocus &&
            isHTMLElement(tabbableReturnElement) &&
            // Focus that moved elsewhere after open is respected (floating-ui#2607).
            (!hasExplicitReturnFocus && tabbableReturnElement !== activeEl && activeEl !== doc.body
              ? isFocusInsideFloatingTree
              : true)
          ) {
            const focusOptions: FocusOptions & { focusVisible?: boolean } = {
              preventScroll: true,
            };
            if (closeType === 'keyboard') {
              focusOptions.focusVisible = true;
            }
            tabbableReturnElement.focus(focusOptions);
          }
          // A cancelled return clears suppression before the next close too.
          preventReturnFocus = false;
        });
      };
    },
  );

  // Safari may scroll to the page's end when a focused input inside a popup is removed; blur it first.
  createEffect(
    () => [context.open(), context.floatingElement()] as const,
    ([open, floating]) => {
      if (!platform.engine.webkit || open || !floating) {
        return;
      }
      const activeEl = activeElement(ownerDocument(floating));
      if (isHTMLElement(activeEl) && isTypeableElement(activeEl) && contains(floating, activeEl)) {
        activeEl.blur();
      }
    },
  );

  // The portal renders its own guards from this state.
  createEffect(
    () =>
      [
        disabled(),
        modal(),
        context.open(),
        closeOnFocusOut(),
        context.domReferenceElement(),
      ] as const,
    ([isDisabled, isModal, open, closeOnOut, domReference]) => {
      if (isDisabled || !portalContext) {
        return undefined;
      }
      portalContext.setFocusManagerState({
        modal: isModal,
        closeOnFocusOut: closeOnOut,
        open,
        onOpenChange: context.setOpen,
        domReference,
      });
      return () => portalContext.setFocusManagerState(null);
    },
  );

  createEffect(
    () => [disabled(), context.floatingElement()] as const,
    ([isDisabled, floatingForFocus]) => {
      // Resolved here, once the popup's content is in the DOM.
      const focusElement = getFloatingFocusElement(floatingForFocus);
      if (isDisabled || !focusElement) {
        return undefined;
      }
      handleTabIndex(focusElement);
      return () => queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
    },
  );

  onCleanup(() => {
    pendingReturnFocus = null;
  });

  const shouldRenderGuards = () =>
    !disabled() &&
    (modal() ? !isUntrappedTypeableCombobox() : true) &&
    (!!portalContext || modal());

  return (
    <>
      <Show when={shouldRenderGuards()}>
        <FocusGuard
          data-type="inside"
          ref={(el) => {
            beforeGuardRef.current = el;
            if (props.beforeContentFocusGuardRef) {
              props.beforeContentFocusGuardRef.current = el;
            }
            if (portalContext) {
              portalContext.beforeInsideRef.current = el;
            }
          }}
          onFocus={(event) => {
            if (modal()) {
              const els = getTabbableContent();
              enqueueFocus(els[els.length - 1]);
            } else {
              const portalNode = portalContext?.portalNode();
              if (portalNode) {
                preventReturnFocus = false;
                if (isOutsideEvent(event, portalNode)) {
                  getNextTabbable(untrack(context.domReferenceElement))?.focus();
                } else {
                  resolveRef(
                    props.previousFocusableElement ?? portalContext?.beforeOutsideRef ?? null,
                  )?.focus();
                }
              }
            }
          }}
        />
      </Show>
      {props.children}
      <Show when={shouldRenderGuards()}>
        <FocusGuard
          data-type="inside"
          ref={(el) => {
            afterGuardRef.current = el;
            if (portalContext) {
              portalContext.afterInsideRef.current = el;
            }
          }}
          onFocus={(event) => {
            if (modal()) {
              enqueueFocus(getTabbableContent()[0]);
            } else {
              const portalNode = portalContext?.portalNode();
              if (portalNode) {
                if (closeOnFocusOut()) {
                  preventReturnFocus = true;
                }
                if (isOutsideEvent(event, portalNode)) {
                  getPreviousTabbable(untrack(context.domReferenceElement))?.focus();
                } else {
                  resolveRef(
                    props.nextFocusableElement ?? portalContext?.afterOutsideRef ?? null,
                  )?.focus();
                }
              }
            }
          }}
        />
      </Show>
    </>
  );
}
