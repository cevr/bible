// Upstream: packages/react/src/tooltip/trigger/TooltipTrigger.tsx,
// packages/react/src/tooltip/trigger/TooltipTriggerDataAttributes.ts,
// packages/react/src/tooltip/utils/constants.ts
//
// The element the tooltip describes. The tooltip opens once the pointer
// rests on it for `delay` (no wait while its `Tooltip.Provider` group is
// active), or when it gets keyboard focus, and closes when the pointer or
// focus leaves (the pointer may travel to the popup unless the root says
// `disableHoverablePopup`). A press closes it and cancels a pending open,
// unless `closeOnClick={false}`. A tooltip trigger nested inside this one
// takes over: hovering it closes this trigger's hover-opened tooltip.
import { isElement } from '@floating-ui/utils/dom';
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, createUniqueId, omit, onCleanup, untrack } from 'solid-js';

import { useDelayGroup } from '../../floating-ui-solid/FloatingDelayGroup.tsx';
import { useFocus } from '../../floating-ui-solid/hooks/useFocus.ts';
import { useHoverReferenceInteraction } from '../../floating-ui-solid/hooks/useHoverReferenceInteraction.ts';
import {
  getDelay,
  useHoverInteractionSharedState,
} from '../../floating-ui-solid/hooks/useHoverShared.ts';
import { safePolygon } from '../../floating-ui-solid/safePolygon.ts';
import { isMouseLikePointerType } from '../../floating-ui-solid/utils/event.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, BaseUIEvent } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { closest, contains, getTarget } from '../../utils/dom.ts';
import { triggerOpenStateMapping } from '../../utils/popupStateMapping.ts';
import { useTimeout } from '../../utils/timers.ts';
import { useTooltipProviderDelay } from '../provider/TooltipProvider.tsx';
import { useTooltipRootContext } from '../root/TooltipRootContext.ts';

/** How long the pointer rests on the trigger before the tooltip opens, in ms. */
const OPEN_DELAY = 600;

const TOOLTIP_TRIGGER_IDENTIFIER = 'data-base-ui-tooltip-trigger';

export const TooltipTriggerDataAttributes = {
  /** Present while the tooltip is open. */
  popupOpen: 'data-popup-open',
  /** Present when the trigger is disabled. */
  triggerDisabled: 'data-trigger-disabled',
} as const;

function getTargetElement(event: Event): Element | null {
  const target = getTarget(event);
  return isElement(target) ? target : null;
}

export interface TooltipTriggerState {
  /** Whether the tooltip is open and was opened by this trigger. */
  open: boolean;
}

export interface TooltipTriggerProps extends BaseUIComponentProps<'button', TooltipTriggerState> {
  /** How long the pointer rests before the tooltip opens, in ms. @default 600 */
  delay?: number | undefined;
  /** Whether a press on this trigger closes the tooltip. @default true */
  closeOnClick?: boolean | undefined;
  /** How long before the tooltip closes, in ms. @default 0 */
  closeDelay?: number | undefined;
  /**
   * Whether interacting with this trigger leaves the tooltip alone. Does not
   * disable the element itself. @default the root's `disabled`
   */
  disabled?: boolean | undefined;
}

export function TooltipTrigger(componentProps: TooltipTriggerProps): JSX.Element {
  const { store, triggerProps } = useTooltipRootContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'delay',
    'closeOnClick',
    'closeDelay',
    'disabled',
    'id',
  );
  const triggerId = untrack(() => componentProps.id) || createUniqueId();
  const [triggerElement, setTriggerElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });
  const floatingRootContext = store.floatingRootContext;

  const disabled = () => componentProps.disabled ?? store.disabled();
  const closeOnClick = () => componentProps.closeOnClick ?? true;
  const isOpenedByThisTrigger = () => store.isOpenedByTrigger(triggerId);
  const isMountedByThisTrigger = () => store.isMountedByTrigger(triggerId);

  // The trigger that owns the tooltip tells it how long a hover-out waits.
  const triggerData = {
    get closeDelay() {
      return componentProps.closeDelay ?? 0;
    },
  };
  createEffect(isMountedByThisTrigger, (mounted) => {
    if (mounted) {
      store.setTriggerData(triggerData);
      store.setCloseOnClick(untrack(closeOnClick));
    }
  });

  const providerDelay = useTooltipProviderDelay();
  const { activeIdRef, delayRef, isInstantPhase, hasProvider } = useDelayGroup(
    floatingRootContext,
    { open: isOpenedByThisTrigger },
  );
  createEffect(isInstantPhase, (value) => {
    store.setIsInstantPhase(value);
  });

  const hoverInteraction = useHoverInteractionSharedState(floatingRootContext);
  let isNestedTriggerHovered = false;
  const nestedTriggerOpenTimeout = useTimeout();
  // Kept here so mouseleave can clear it without touching the hover hook's own.
  let pointerType: string | undefined;

  function getOpenDelay(): number {
    // Adjacent tooltips open at once while the group is active.
    if (hasProvider && activeIdRef.current != null) {
      return 0;
    }
    return componentProps.delay ?? providerDelay() ?? OPEN_DELAY;
  }

  function isEnabledNestedTriggerTarget(target: Element | null): boolean {
    const element = untrack(triggerElement);
    if (!element || !target) {
      return false;
    }
    const nearestTrigger = closest(target, `[${TOOLTIP_TRIGGER_IDENTIFIER}]`);
    return (
      nearestTrigger !== null && nearestTrigger !== element && contains(element, nearestTrigger)
    );
  }

  function detectNestedTriggerHover(target: Element | null): boolean {
    const nestedTriggerHovered = isEnabledNestedTriggerTarget(target);
    isNestedTriggerHovered = nestedTriggerHovered;
    if (nestedTriggerHovered) {
      hoverInteraction.openChangeTimeout.clear();
      hoverInteraction.restTimeout.clear();
      hoverInteraction.restTimeoutPending = false;
      nestedTriggerOpenTimeout.clear();
    }
    return nestedTriggerHovered;
  }

  const hoverProps = useHoverReferenceInteraction(floatingRootContext, {
    get enabled() {
      return !disabled();
    },
    mouseOnly: true,
    move: false,
    get handleClose() {
      return store.disableHoverablePopup() ? null : safePolygon();
    },
    restMs: getOpenDelay,
    delay: () => {
      const closeDelay = componentProps.closeDelay;
      if (closeDelay == null && hasProvider) {
        return { close: getDelay(delayRef.current, 'close') };
      }
      return { close: closeDelay ?? 0 };
    },
    triggerElement,
    get isActiveTrigger() {
      return store.isTriggerActive(triggerId);
    },
    isClosing: () => untrack(store.transitionStatus) === 'ending',
    shouldOpen: () => !isNestedTriggerHovered,
  });

  const focusProps = useFocus(floatingRootContext, {
    get enabled() {
      return !disabled();
    },
  }).reference;

  function handleNestedTriggerHover(event: MouseEvent) {
    const wasNestedTriggerHovered = isNestedTriggerHovered;
    const target = getTargetElement(event);
    const nestedTriggerHovered = detectNestedTriggerHover(target);
    const element = untrack(triggerElement);
    const targetInsideTrigger = element && target && contains(element, target);

    // Only a hover-opened tooltip gives way; a focus open stays with focus.
    if (
      nestedTriggerHovered &&
      untrack(store.open) &&
      untrack(store.lastOpenChangeReason) === REASONS.triggerHover
    ) {
      store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
      return;
    }

    if (
      wasNestedTriggerHovered &&
      !nestedTriggerHovered &&
      targetInsideTrigger &&
      !untrack(disabled) &&
      !untrack(store.open) &&
      element &&
      isMouseLikePointerType(pointerType)
    ) {
      const open = () => {
        if (!isNestedTriggerHovered && !untrack(disabled) && !untrack(store.open)) {
          store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, element));
        }
      };
      // With `move: false` the hover hook hears nothing when the pointer
      // leaves a nested trigger for this one's own area, so reopen here.
      const openDelay = getOpenDelay();
      if (openDelay === 0) {
        nestedTriggerOpenTimeout.clear();
        open();
      } else {
        nestedTriggerOpenTimeout.start(openDelay, open);
      }
    }
  }

  const state: TooltipTriggerState = {
    get open() {
      return isOpenedByThisTrigger();
    },
  };

  const element = useRenderElement('button', componentProps, {
    state,
    stateAttributesMapping: triggerOpenStateMapping,
    ref: (el: HTMLElement) => {
      setTriggerElement(el);
      store.registerTrigger(triggerId, el);
    },
    props: [
      hoverProps,
      focusProps,
      triggerProps,
      {
        onMouseOver(event: MouseEvent) {
          handleNestedTriggerHover(event);
        },
        onFocus(event: BaseUIEvent<FocusEvent>) {
          // A nested trigger's focus is its own; this one's focus handler stays out of it.
          if (isEnabledNestedTriggerTarget(getTargetElement(event))) {
            event.preventBaseUIHandler();
          }
        },
        onMouseLeave() {
          isNestedTriggerHovered = false;
          nestedTriggerOpenTimeout.clear();
          pointerType = undefined;
        },
        onPointerEnter(event: PointerEvent) {
          pointerType = event.pointerType;
        },
        onPointerDown(event: PointerEvent) {
          pointerType = event.pointerType;
          store.setCloseOnClick(untrack(closeOnClick));
          if (untrack(closeOnClick) && !untrack(store.open)) {
            store.cancelPendingOpen(event);
          }
        },
        onClick(event: MouseEvent) {
          if (untrack(closeOnClick) && !untrack(store.open)) {
            store.cancelPendingOpen(event);
          }
        },
        id: triggerId,
        get 'data-trigger-disabled'() {
          return disabled() ? '' : undefined;
        },
        get [TOOLTIP_TRIGGER_IDENTIFIER]() {
          return disabled() ? undefined : '';
        },
      },
      elementProps,
    ],
  });

  onCleanup(() => {
    const wasOpen = untrack(isOpenedByThisTrigger);
    store.registerTrigger(triggerId, null);
    // A tooltip whose trigger goes away closes; deferred, past the rest of the teardown.
    if (wasOpen) {
      queueMicrotask(() => {
        if (untrack(store.open) && store.triggerElements.size === 0) {
          store.setOpen(false, createChangeEventDetails(REASONS.none));
        }
      });
    }
  });

  return element;
}
