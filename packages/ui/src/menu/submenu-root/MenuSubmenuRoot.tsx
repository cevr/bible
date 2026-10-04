// Upstream: packages/react/src/menu/submenu-root/MenuSubmenuRoot.tsx,
// packages/react/src/menu/submenu-trigger/MenuSubmenuTrigger.tsx
//
// A menu nested in another: its root joins the parent's tree, and its
// trigger is an item of the parent's list. The trigger opens the submenu on
// hover (after `delay`, through a safe polygon so moving to the submenu does
// not close it), on press, or with the arrow key pointing at the submenu's
// side; the opposite arrow or Escape closes it and returns to the trigger.
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, createUniqueId, omit, onCleanup, untrack } from 'solid-js';

import { useClick } from '../../floating-ui-solid/hooks/useClick.ts';
import { useHoverReferenceInteraction } from '../../floating-ui-solid/hooks/useHoverReferenceInteraction.ts';
import { safePolygon } from '../../floating-ui-solid/safePolygon.ts';
import { getTarget } from '../../floating-ui-solid/utils/element.ts';
import { useCompositeListItem } from '../../internals/composite/CompositeList.tsx';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types.ts';
import { propsFromAccessor, useRenderElement } from '../../internals/useRenderElement.tsx';
import { addEventListener, mergeCleanups } from '../../utils/dom.ts';
import { platform } from '../../utils/platform.ts';
import { triggerOpenStateMapping } from '../../utils/popupStateMapping.ts';
import { useMenuItem } from '../item/useMenuItem.ts';
import { useMenuPositionerContextOptional } from '../positioner/MenuPositioner.tsx';
import { MenuRootInternal, type MenuRootProps } from '../root/MenuRoot.tsx';
import { useMenuRootContext } from '../root/MenuRootContext.ts';

export interface MenuSubmenuRootProps extends Omit<MenuRootProps, 'modal'> {}

/** Groups the parts of a submenu. Doesn't render its own element. */
export function MenuSubmenuRoot(props: MenuSubmenuRootProps): JSX.Element {
  // Throws outside a menu.
  useMenuRootContext();
  return <MenuRootInternal {...props} isSubmenu />;
}

export interface MenuSubmenuTriggerState {
  disabled: boolean;
  highlighted: boolean;
  open: boolean;
}

export interface MenuSubmenuTriggerProps
  extends NativeButtonProps, BaseUIComponentProps<'div', MenuSubmenuTriggerState> {
  label?: string | undefined;
  /** @default false */
  disabled?: boolean | undefined;
  /** How long the pointer rests before hovering opens the submenu, in ms. @default 100 */
  delay?: number | undefined;
  /** How long before a hover-opened submenu closes, in ms. @default 0 */
  closeDelay?: number | undefined;
  /** Whether hovering opens the submenu. @default true */
  openOnHover?: boolean | undefined;
}

const VOICE_OVER_EXPANDED_PROPS = { 'aria-expanded': undefined };

export function MenuSubmenuTrigger(componentProps: MenuSubmenuTriggerProps): JSX.Element {
  const context = useMenuRootContext();
  const parent = context.parent;
  if (parent.type !== 'menu') {
    throw new Error('Base UI: <Menu.SubmenuTrigger> must be placed in <Menu.SubmenuRoot>.');
  }
  const { store } = context;
  const parentStore = parent.store;
  const positionerContext = useMenuPositionerContextOptional();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'label',
    'id',
    'nativeButton',
    'openOnHover',
    'delay',
    'closeDelay',
    'disabled',
  );

  const listItem = useCompositeListItem({
    get label() {
      return componentProps.label;
    },
  });
  const triggerId = untrack(() => componentProps.id) || createUniqueId();
  const [triggerElement, setTriggerElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });
  let focusReturnedThroughGuard = false;

  createEffect(
    () => componentProps.closeDelay ?? 0,
    (closeDelay) => {
      store.setCloseDelay(closeDelay);
    },
  );

  // Focus coming back to the trigger through the submenu's guard closes the submenu.
  createEffect(
    () => [store.open(), store.positionerElement()] as const,
    ([isOpen, positioner]) => {
      if (!isOpen || !positioner) {
        return undefined;
      }
      const handleGuardFocusOut = (event: FocusEvent) => {
        if (getTarget(event) === store.beforeContentFocusGuardRef.current) {
          focusReturnedThroughGuard = event.relatedTarget === untrack(triggerElement);
        }
      };
      return mergeCleanups(
        addEventListener(positioner, 'focusout', handleGuardFocusOut, true),
        () => {
          focusReturnedThroughGuard = false;
        },
      );
    },
  );

  const disabled = () =>
    (componentProps.disabled ?? false) || store.disabled() || parentStore.disabled();
  const highlighted = () => parentStore.isActive(listItem.index());

  const { getItemProps, itemRef } = useMenuItem({
    closeOnClick: () => false,
    disabled,
    highlighted,
    id: triggerId,
    store,
    typingRef: parentStore.typingRef,
    nativeButton: () => componentProps.nativeButton ?? false,
    itemMetadata: {
      type: 'submenu-trigger',
      setActive(event) {
        if (untrack(parentStore.highlightItemOnHover)) {
          parentStore.setActiveIndex(untrack(listItem.index), REASONS.pointer, event);
        }
      },
    },
    nodeId: positionerContext?.context.nodeId,
  });

  const delay = () => componentProps.delay ?? 100;
  const openOnHover = () => componentProps.openOnHover ?? true;

  const hoverProps = useHoverReferenceInteraction(store.floatingRootContext, {
    get enabled() {
      return store.hoverEnabled() && openOnHover() && !disabled();
    },
    handleClose: safePolygon({ blockPointerEvents: true }),
    mouseOnly: true,
    move: true,
    restMs: () => delay(),
    delay: () => ({ open: delay(), close: componentProps.closeDelay ?? 0 }),
    shouldOpen: () => (delay() > 0 ? untrack(parentStore.allowMouseEnter) : true),
    triggerElement,
    externalTree: store.floatingTreeRoot,
    isClosing: () => store.transitionStatus() === 'ending',
    // Chrome can drop the trigger's mouseleave in a fast sweep; mouseout cancels too.
    guardStaleOpen: true,
  });

  // Toggles, so TalkBack users can close the submenu to move on; hover-opened, a press keeps it.
  const click = useClick(store.floatingRootContext, {
    get enabled() {
      return !disabled();
    },
    event: 'mousedown',
    toggle: true,
    get ignoreMouse() {
      return openOnHover();
    },
    get stickIfOpen() {
      return openOnHover();
    },
  });

  const rootTriggerProps = context.triggerProps(true);

  // VoiceOver announces the expanded change instead of the first item focus moves to, so a
  // keyboard-opened submenu drops `aria-expanded` while open (`aria-haspopup` still says it).
  const omitExpanded = propsFromAccessor(() => {
    const openedByKeyboard =
      store.lastOpenChangeReason() === REASONS.listNavigation || store.openMethod() === 'keyboard';
    return store.open() && openedByKeyboard && platform.screenReader.voiceOver
      ? VOICE_OVER_EXPANDED_PROPS
      : {};
  });

  const state: MenuSubmenuTriggerState = {
    get disabled() {
      return disabled();
    },
    get highlighted() {
      return highlighted();
    },
    get open() {
      return store.open();
    },
  };

  onCleanup(() => store.registerTrigger(triggerId, null));

  return useRenderElement('div', componentProps, {
    state,
    stateAttributesMapping: triggerOpenStateMapping,
    props: [
      click.reference,
      hoverProps,
      rootTriggerProps,
      context.parentItemProps,
      omitExpanded,
      {
        get 'aria-controls'() {
          return store.triggerPopupId(triggerId);
        },
        get tabindex() {
          return store.open() || highlighted() ? 0 : -1;
        },
        onFocus(event: FocusEvent) {
          if (untrack(store.open) && focusReturnedThroughGuard) {
            focusReturnedThroughGuard = false;
            store.setOpen(false, createChangeEventDetails(REASONS.focusOut, event));
          }
        },
        onBlur() {
          if (untrack(highlighted)) {
            parentStore.setActiveIndex(null, REASONS.none);
          }
        },
      },
      elementProps,
      // Last, so a disabled trigger's own handlers stay gated.
      getItemProps,
    ],
    ref: (el: HTMLElement) => {
      setTriggerElement(el);
      itemRef(el);
      listItem.ref(el);
      store.registerTrigger(triggerId, el);
    },
  });
}
