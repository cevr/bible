// Upstream: packages/react/src/menu/trigger/MenuTrigger.tsx
//
// The button that opens the menu: on press (mousedown, so pressing, dragging
// onto an item and releasing picks it, as native menus do), with the arrow
// keys, or on hover with `openOnHover`. A click within half a second of a
// hover-open keeps the menu open. While the menu it opened is open, invisible
// focus guards sit on either side of it so Tab leaves the menu in page order.
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
import { contains } from '../../floating-ui-solid/utils/element.ts';
import { PATIENT_CLICK_THRESHOLD } from '../../internals/constants.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types.ts';
import { useButton } from '../../internals/useButton.ts';
import { propsFromAccessor, useRenderElement } from '../../internals/useRenderElement.tsx';
import { addEventListener, ownerDocument } from '../../utils/dom.ts';
import { FocusGuard } from '../../utils/FocusGuard.tsx';
import { isMouseWithinBounds } from '../../utils/getPseudoElementBounds.ts';
import { pressableTriggerOpenStateMapping } from '../../utils/popupStateMapping.ts';
import { useTriggerFocusGuards } from '../../utils/popups/popupStore.ts';
import { useTimeout } from '../../utils/timers.ts';
import { useMenuRootContext } from '../root/MenuRootContext.ts';
import { findRootOwnerId } from '../utils/isKeyboardOpen.ts';

export interface MenuTriggerState {
  /** Whether the menu is open and was opened by this trigger. */
  open: boolean;
  disabled: boolean;
}

export interface MenuTriggerProps
  extends NativeButtonProps, BaseUIComponentProps<'button', MenuTriggerState> {
  /** @default false */
  disabled?: boolean | undefined;
  /** How long the pointer rests before a hover opens the menu, in ms. @default 100 */
  delay?: number | undefined;
  /** How long before a hover-opened menu closes, in ms. @default 0 */
  closeDelay?: number | undefined;
  /** Whether hovering the trigger opens the menu. */
  openOnHover?: boolean | undefined;
}

export function MenuTrigger(componentProps: MenuTriggerProps): JSX.Element {
  const { store, parent, triggerProps } = useMenuRootContext();
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

  const disabled = () => (componentProps.disabled ?? false) || store.disabled();
  const isOpenedByThisTrigger = () => store.isOpenedByTrigger(triggerId);
  const isMountedByThisTrigger = () => store.isMountedByTrigger(triggerId);

  const { getButtonProps, buttonRef } = useButton({
    get disabled() {
      return disabled();
    },
    get native() {
      return componentProps.nativeButton ?? true;
    },
  });

  createEffect(isOpenedByThisTrigger, (opened) => {
    if (!opened && parent.type === undefined) {
      store.allowMouseUpTriggerRef.current = false;
    }
  });

  createEffect(isMountedByThisTrigger, (mounted) => {
    if (mounted) {
      store.setCloseDelay(untrack(() => componentProps.closeDelay ?? 0));
    }
  });

  const allowMouseUpTriggerTimeout = useTimeout();

  // A press that drags off the trigger and releases outside the menu cancels the open.
  const handleDocumentMouseUp = (mouseEvent: MouseEvent) => {
    const trigger = untrack(triggerElement);
    if (!trigger) {
      return;
    }
    allowMouseUpTriggerTimeout.clear();
    store.allowMouseUpTriggerRef.current = false;
    const mouseUpTarget = mouseEvent.target as Element | null;
    if (
      contains(trigger, mouseUpTarget) ||
      contains(untrack(store.positionerElement), mouseUpTarget) ||
      mouseUpTarget === trigger
    ) {
      return;
    }
    if (mouseUpTarget != null && findRootOwnerId(mouseUpTarget) === untrack(store.rootId)) {
      return;
    }
    if (isMouseWithinBounds(mouseEvent, trigger)) {
      return;
    }
    store.floatingTreeRoot.events.emit('close', {
      domEvent: mouseEvent,
      reason: REASONS.cancelOpen,
    });
  };

  createEffect(isOpenedByThisTrigger, (opened) => {
    if (opened && untrack(store.lastOpenChangeReason) === REASONS.triggerHover) {
      const doc = ownerDocument(untrack(triggerElement));
      return addEventListener(doc, 'mouseup', handleDocumentMouseUp, { once: true });
    }
    return undefined;
  });

  // A click soon after a hover-open keeps the menu open; a patient click closes it.
  const [stickIfOpen, setStickIfOpen] = createSignal(false, { ownedWrite: true });
  const stickIfOpenTimeout = useTimeout();
  createEffect(isOpenedByThisTrigger, (opened) => {
    if (opened && untrack(store.lastOpenChangeReason) === REASONS.triggerHover) {
      setStickIfOpen(true);
      stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => setStickIfOpen(false));
    } else if (!opened) {
      stickIfOpenTimeout.clear();
      setStickIfOpen(false);
    }
  });

  const hoverProps = useHoverReferenceInteraction(store.floatingRootContext, {
    get enabled() {
      return (componentProps.openOnHover ?? false) && !disabled();
    },
    handleClose: safePolygon({ blockPointerEvents: true }),
    mouseOnly: true,
    move: false,
    restMs: () => (parent.type === undefined ? (componentProps.delay ?? 100) : 0),
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
    event: 'mousedown',
    toggle: true,
    ignoreMouse: false,
    get stickIfOpen() {
      return parent.type === undefined ? stickIfOpen() : false;
    },
  });

  const rootTriggerProps = propsFromAccessor(() => triggerProps(isMountedByThisTrigger()));

  const { handlePreFocusGuardFocus, handleFocusTargetFocus } = useTriggerFocusGuards(store, () =>
    untrack(triggerElement),
  );

  const state: MenuTriggerState = {
    get disabled() {
      return disabled();
    },
    get open() {
      return isOpenedByThisTrigger();
    },
  };

  const element = useRenderElement('button', componentProps, {
    state,
    stateAttributesMapping: pressableTriggerOpenStateMapping,
    ref: (el: HTMLElement) => {
      setTriggerElement(el);
      buttonRef(el);
      store.registerTrigger(triggerId, el);
    },
    props: [
      click.reference,
      hoverProps,
      rootTriggerProps,
      {
        'aria-haspopup': 'menu',
        get 'aria-controls'() {
          return store.triggerPopupId(triggerId);
        },
        id: triggerId,
        onMouseDown(event: MouseEvent) {
          if (untrack(store.open)) {
            return;
          }
          // A release on an item within 200ms of the press is the same click, not a pick.
          allowMouseUpTriggerTimeout.start(200, () => {
            store.allowMouseUpTriggerRef.current = true;
          });
          const doc = ownerDocument(event.currentTarget as Element);
          doc.addEventListener('mouseup', handleDocumentMouseUp, { once: true });
        },
      },
      elementProps,
      getButtonProps,
    ],
  });

  onCleanup(() => store.registerTrigger(triggerId, null));

  return (
    <>
      <Show when={isOpenedByThisTrigger()}>
        <FocusGuard
          ref={(el) => {
            store.beforeTriggerFocusGuardRef.current = el;
          }}
          onFocus={handlePreFocusGuardFocus}
        />
      </Show>
      {element}
      <Show when={isOpenedByThisTrigger()}>
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
