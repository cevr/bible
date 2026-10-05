// Upstream: packages/react/src/menu/trigger/MenuTrigger.tsx
//
// The button that opens the menu: on press (mousedown, so pressing, dragging
// onto an item and releasing picks it, as native menus do) or with the arrow
// keys. Upstream's hover opening is left out. While the menu it opened is
// open, invisible focus guards sit on either side of it so Tab leaves the
// menu in page order.
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
import { contains } from '../../floating-ui-solid/utils/element.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types.ts';
import { useButton } from '../../internals/useButton.ts';
import { propsFromAccessor, useRenderElement } from '../../internals/useRenderElement.tsx';
import { ownerDocument } from '../../utils/dom.ts';
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
}

export function MenuTrigger(componentProps: MenuTriggerProps): JSX.Element {
  const { store, triggerProps } = useMenuRootContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'disabled',
    'nativeButton',
    'id',
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
    if (!opened) {
      store.allowMouseUpTriggerRef.current = false;
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

  const click = useClick(store.floatingRootContext, {
    get enabled() {
      return !disabled();
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
