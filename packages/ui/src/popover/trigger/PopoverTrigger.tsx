// Upstream: packages/react/src/popover/trigger/PopoverTrigger.tsx,
// packages/react/src/popover/utils/constants.ts
//
// The button that opens the popover on click, or on hover with
// `openOnHover` (after `delay`; the pointer may travel to the popup through
// the safe polygon). A click within half a second of a hover-open keeps the
// popover open. While the non-trapping popover it opened is open, invisible
// focus guards sit on either side of it so Tab leaves the popup in page order.
import type { JSX } from '@solidjs/web';
import {
  createEffect,
  createSignal,
  createUniqueId,
  omit,
  onCleanup,
  Show,
  untrack,
} from 'solid-js';

import { useClick } from '../../floating-ui-solid/hooks/useClick.ts';
import { useHoverReferenceInteraction } from '../../floating-ui-solid/hooks/useHoverReferenceInteraction.ts';
import { safePolygon } from '../../floating-ui-solid/safePolygon.ts';
import { CLICK_TRIGGER_IDENTIFIER } from '../../internals/constants.ts';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types.ts';
import { useButton } from '../../internals/useButton.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { FocusGuard } from '../../utils/FocusGuard.tsx';
import {
  pressableTriggerOpenStateMapping,
  triggerOpenStateMapping,
} from '../../utils/popupStateMapping.ts';
import { useTriggerFocusGuards } from '../../utils/popups/popupStore.ts';
import { usePopoverRootContext } from '../root/PopoverRootContext.ts';

/** How long the pointer rests on the trigger before a hover opens the popover, in ms. */
const OPEN_DELAY = 300;

export interface PopoverTriggerState {
  disabled: boolean;
  /** Whether the popover is open and was opened by this trigger. */
  open: boolean;
}

export interface PopoverTriggerProps
  extends NativeButtonProps, BaseUIComponentProps<'button', PopoverTriggerState> {
  /** @default false */
  disabled?: boolean | undefined;
  /** Whether hovering the trigger also opens the popover. @default false */
  openOnHover?: boolean | undefined;
  /** How long the pointer rests before a hover opens the popover, in ms. @default 300 */
  delay?: number | undefined;
  /** How long before a hover-opened popover closes, in ms. @default 0 */
  closeDelay?: number | undefined;
}

export function PopoverTrigger(componentProps: PopoverTriggerProps): JSX.Element {
  const { store, triggerProps } = usePopoverRootContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'disabled',
    'nativeButton',
    'id',
    'openOnHover',
    'delay',
    'closeDelay',
  );
  const triggerId = untrack(() => componentProps.id) || createUniqueId();
  const [triggerElement, setTriggerElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });

  const disabled = () => componentProps.disabled ?? false;
  const openOnHover = () => componentProps.openOnHover ?? false;
  const isOpenedByThisTrigger = () => store.isOpenedByTrigger(triggerId);
  const isMountedByThisTrigger = () => store.isMountedByTrigger(triggerId);

  // The trigger that owns the popup tells it whether hover keeps it open and how long it waits.
  const triggerData = {
    get openOnHover() {
      return openOnHover();
    },
    get closeDelay() {
      return componentProps.closeDelay ?? 0;
    },
    get disabled() {
      return disabled();
    },
  };
  createEffect(isMountedByThisTrigger, (mounted) => {
    if (mounted) {
      store.setTriggerData(triggerData);
    }
  });

  const hoverProps = useHoverReferenceInteraction(store.floatingRootContext, {
    get enabled() {
      return (
        !disabled() &&
        openOnHover() &&
        (store.openMethod() !== 'touch' || store.openChangeReason() !== REASONS.triggerPress)
      );
    },
    mouseOnly: true,
    move: false,
    handleClose: safePolygon(),
    restMs: () => componentProps.delay ?? OPEN_DELAY,
    delay: () => ({ close: componentProps.closeDelay ?? 0 }),
    triggerElement,
    externalTree: store.floatingTreeRoot,
    get isActiveTrigger() {
      return store.isTriggerActive(triggerId);
    },
    isClosing: () => store.transitionStatus() === 'ending',
  });

  const click = useClick(store.floatingRootContext, {
    get enabled() {
      return !disabled();
    },
    get stickIfOpen() {
      return store.stickIfOpen();
    },
  });

  const { getButtonProps, buttonRef } = useButton({
    get disabled() {
      return disabled();
    },
    get native() {
      return componentProps.nativeButton ?? true;
    },
  });

  const stateAttributesMapping: StateAttributesMapping<PopoverTriggerState> = {
    open(value) {
      if (value && store.openChangeReason() === REASONS.triggerPress) {
        return pressableTriggerOpenStateMapping.open?.(value) ?? null;
      }
      return triggerOpenStateMapping.open?.(value) ?? null;
    },
  };

  const { handlePreFocusGuardFocus, handleFocusTargetFocus } = useTriggerFocusGuards(store, () =>
    untrack(triggerElement),
  );

  const state: PopoverTriggerState = {
    get disabled() {
      return disabled();
    },
    get open() {
      return isOpenedByThisTrigger();
    },
  };

  const element = useRenderElement('button', componentProps, {
    state,
    stateAttributesMapping,
    ref: (el: HTMLElement) => {
      setTriggerElement(el);
      buttonRef(el);
      store.registerTrigger(triggerId, el);
    },
    props: [
      click.reference,
      hoverProps,
      triggerProps,
      {
        [CLICK_TRIGGER_IDENTIFIER]: '',
        id: triggerId,
        'aria-haspopup': 'dialog',
        get 'aria-expanded'() {
          return isOpenedByThisTrigger() ? 'true' : 'false';
        },
        get 'aria-controls'() {
          return store.triggerPopupId(triggerId);
        },
      },
      elementProps,
      getButtonProps,
    ],
  });

  onCleanup(() => store.registerTrigger(triggerId, null));

  const showGuards = () => isOpenedByThisTrigger() && !store.focusManagerModal();

  return (
    <>
      <Show when={showGuards()}>
        <FocusGuard
          ref={(el) => {
            store.beforeTriggerFocusGuardRef.current = el;
          }}
          onFocus={handlePreFocusGuardFocus}
        />
      </Show>
      {element}
      <Show when={showGuards()}>
        <FocusGuard
          ref={(el) => {
            store.triggerFocusTargetRef.current = el;
          }}
          onFocus={handleFocusTargetFocus}
        />
      </Show>
    </>
  );
}
