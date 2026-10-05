// Upstream: packages/react/src/menu/positioner/MenuPositioner.tsx,
// packages/react/src/menu/positioner/MenuPositionerContext.ts
//
// Positions the menu's popup against its trigger (a submenu beside its
// trigger item, a context menu at the pointer). It also keeps the menu tree
// in order: a menu opening closes its open siblings, a parent closing
// closes its children, and hovering another item of the parent closes this
// submenu (after the trigger's `closeDelay`). A modal top-level menu gets a
// transparent backdrop with a hole over its trigger, and locks page scroll.
import type { JSX } from '@solidjs/web';
import { createContext, createEffect, omit, onCleanup, Show, untrack, useContext } from 'solid-js';

import { FloatingNode } from '../../floating-ui-solid/FloatingTree.tsx';
import type { FloatingContext } from '../../floating-ui-solid/FloatingRootContext.ts';
import { CompositeList } from '../../internals/composite/CompositeList.tsx';
import {
  DROPDOWN_COLLISION_AVOIDANCE,
  POPUP_COLLISION_AVOIDANCE,
} from '../../internals/constants.ts';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import {
  type Align,
  type Side,
  type UseAnchorPositioningSharedParameters,
  useAnchorPositioning,
} from '../../internals/useAnchorPositioning.ts';
import { InternalBackdrop } from '../../utils/FocusGuard.tsx';
import { onClientCleanup } from '../../utils/onClientCleanup.ts';
import { usePositioner } from '../../utils/usePositioner.ts';
import { useAnchoredPopupScrollLock } from '../../utils/useScrollLock.ts';
import { useTimeout } from '../../utils/timers.ts';
import { useMenuPortalContext } from '../portal/MenuPortal.tsx';
import { useMenuRootContext } from '../root/MenuRootContext.ts';
import type { MenuChangeEventReason, MenuInstantType } from '../store/MenuStore.ts';

export interface MenuPositionerContextValue {
  side: () => Side;
  align: () => Align;
  setArrowElement: (element: Element | null) => void;
  arrowUncentered: () => boolean;
  arrowStyles: () => JSX.CSSProperties;
  context: FloatingContext;
}

const MenuPositionerContext = createContext<MenuPositionerContextValue | null>(null);

export function useMenuPositionerContext(): MenuPositionerContextValue {
  const context = useContext(MenuPositionerContext);
  if (context === null) {
    throw new Error(
      'Base UI: MenuPositionerContext is missing. MenuPositioner parts must be placed within <Menu.Positioner>.',
    );
  }
  return context;
}

export function useMenuPositionerContextOptional(): MenuPositionerContextValue | null {
  return useContext(MenuPositionerContext);
}

export interface ItemHoverEvent {
  nodeId: string | undefined;
  target: Element | null;
}

interface MenuOpenEventDetails {
  open: boolean;
  reason: MenuChangeEventReason | null;
  nodeId: string | undefined;
  parentNodeId: string | null;
}

export interface MenuPositionerState {
  open: boolean;
  side: Side;
  align: Align;
  anchorHidden: boolean;
  /** Whether the menu is a submenu. */
  nested: boolean;
  /** Why transitions are skipped, if they are. */
  instant: MenuInstantType;
}

export interface MenuPositionerProps
  extends UseAnchorPositioningSharedParameters, BaseUIComponentProps<'div', MenuPositionerState> {}

export function MenuPositioner(componentProps: MenuPositionerProps): JSX.Element {
  const { store, parent, syncHighlightedItem } = useMenuRootContext();
  const keepMounted = useMenuPortalContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'anchor',
    'positionMethod',
    'side',
    'align',
    'sideOffset',
    'alignOffset',
    'collisionBoundary',
    'collisionPadding',
    'arrowPadding',
    'sticky',
    'disableAnchorTracking',
    'collisionAvoidance',
  );

  const contextMenu = parent.type === 'context-menu' ? parent.context : undefined;
  const props = componentProps;

  const align = (): Align | undefined => {
    if (props.align !== undefined) {
      return props.align;
    }
    if (contextMenu || parent.type === 'menu') {
      return 'start';
    }
    return undefined;
  };
  const side = (): Side | undefined =>
    props.side ?? (parent.type === 'menu' ? 'inline-end' : undefined);
  // A context menu sits just off the pointer, its first item under it.
  const contextMenuOffsets = () => contextMenu && !props.side && align() !== 'center';
  const collisionAvoidance = () =>
    props.collisionAvoidance ??
    (parent.type === 'menu' ? POPUP_COLLISION_AVOIDANCE : DROPDOWN_COLLISION_AVOIDANCE);

  const positioner = useAnchorPositioning({
    get anchor() {
      return props.anchor ?? (contextMenu ? contextMenu.anchor() : undefined);
    },
    floatingRootContext: store.floatingRootContext,
    get positionMethod() {
      return contextMenu ? 'fixed' : (props.positionMethod ?? 'absolute');
    },
    get mounted() {
      return store.mounted();
    },
    get side() {
      return side();
    },
    get sideOffset() {
      return props.sideOffset ?? (contextMenuOffsets() ? -5 : 0);
    },
    get align() {
      return align();
    },
    get alignOffset() {
      return props.alignOffset ?? (contextMenuOffsets() ? 2 : 0);
    },
    get arrowPadding() {
      return contextMenu ? 0 : (props.arrowPadding ?? 5);
    },
    get collisionBoundary() {
      return props.collisionBoundary ?? 'clipping-ancestors';
    },
    get collisionPadding() {
      return props.collisionPadding ?? 5;
    },
    get sticky() {
      return props.sticky ?? false;
    },
    nodeId: store.floatingNodeId,
    get keepMounted() {
      return keepMounted();
    },
    get disableAnchorTracking() {
      return props.disableAnchorTracking ?? false;
    },
    get collisionAvoidance() {
      return collisionAvoidance();
    },
    get shift() {
      if (!contextMenu) {
        return undefined;
      }
      const avoidance = collisionAvoidance();
      return {
        crossAxis: !('side' in avoidance && avoidance.side === 'flip'),
        rootBoundary: 'layoutViewport' as const,
      };
    },
    externalTree: store.floatingTreeRoot,
  });

  const events = store.floatingTreeRoot.events;

  // A menu opening closes its open siblings and turns off its parent's hover opening.
  const onMenuOpenChange = (details: MenuOpenEventDetails) => {
    if (!details.open) {
      return;
    }
    if (details.parentNodeId === store.floatingNodeId) {
      store.setHoverEnabled(false);
    }
    if (
      details.nodeId !== store.floatingNodeId &&
      details.parentNodeId === store.floatingParentNodeId
    ) {
      store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
    }
  };
  // A parent closing closes this submenu.
  const onParentClose = (details: MenuOpenEventDetails) => {
    if (
      store.floatingParentNodeId == null ||
      details.open ||
      details.nodeId !== store.floatingParentNodeId
    ) {
      return;
    }
    store.setOpen(false, createChangeEventDetails(details.reason ?? REASONS.siblingOpen));
  };

  const closeTimeout = useTimeout();
  // Hovering another item of the parent menu closes this submenu.
  const onItemHover = (event: ItemHoverEvent) => {
    if (!untrack(store.open) || event.nodeId !== store.floatingParentNodeId) {
      return;
    }
    const triggerElement = untrack(store.activeTriggerElement);
    if (event.target && triggerElement && triggerElement !== event.target) {
      const delay = untrack(store.closeDelay);
      if (delay > 0) {
        if (!closeTimeout.isStarted()) {
          closeTimeout.start(delay, () => {
            store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
          });
        }
      } else {
        store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
      }
    } else {
      closeTimeout.clear();
    }
  };

  events.on<MenuOpenEventDetails>('menuopenchange', onMenuOpenChange);
  events.on<MenuOpenEventDetails>('menuopenchange', onParentClose);
  events.on<ItemHoverEvent>('itemhover', onItemHover);
  onCleanup(() => {
    events.off<MenuOpenEventDetails>('menuopenchange', onMenuOpenChange);
    events.off<MenuOpenEventDetails>('menuopenchange', onParentClose);
    events.off<ItemHoverEvent>('itemhover', onItemHover);
  });
  onClientCleanup(() => store.setPositionerElement(null));

  createEffect(store.open, (isOpen) => {
    if (!isOpen) {
      closeTimeout.clear();
    }
    const details: MenuOpenEventDetails = {
      open: isOpen,
      nodeId: store.floatingNodeId,
      parentNodeId: store.floatingParentNodeId,
      reason: untrack(store.lastOpenChangeReason),
    };
    events.emit('menuopenchange', details);
  });

  const popupModal = () => store.modal() && store.lastOpenChangeReason() !== REASONS.triggerHover;

  useAnchoredPopupScrollLock(
    () => store.open() && popupModal(),
    () => store.openMethod() === 'touch',
    store.positionerElement,
    store.activeTriggerElement,
  );

  const state: MenuPositionerState = {
    get open() {
      return store.open();
    },
    get side() {
      return positioner.side();
    },
    get align() {
      return positioner.align();
    },
    get anchorHidden() {
      return positioner.anchorHidden();
    },
    nested: parent.type === 'menu',
    get instant() {
      return store.instantType();
    },
  };

  const shouldRenderBackdrop = () => store.mounted() && parent.type !== 'menu' && popupModal();

  const positionerContext: MenuPositionerContextValue = {
    side: positioner.side,
    align: positioner.align,
    setArrowElement: positioner.setArrowElement,
    arrowUncentered: positioner.arrowUncentered,
    arrowStyles: positioner.arrowStyles,
    context: positioner.context,
  };

  return (
    <MenuPositionerContext value={positionerContext}>
      <Show when={shouldRenderBackdrop()}>
        <InternalBackdrop
          ref={(el: HTMLDivElement) => {
            if (contextMenu) {
              contextMenu.internalBackdropRef.current = el;
            }
          }}
          inert={!store.open() || undefined}
          cutout={parent.type === undefined ? store.activeTriggerElement() : null}
        />
      </Show>
      <FloatingNode id={store.floatingNodeId}>
        <CompositeList
          elementsRef={store.itemDomElements}
          labelsRef={store.itemLabels}
          onMapChange={syncHighlightedItem}
        >
          {/* Built inside the providers, so the popup and items read them. */}
          {untrack(() =>
            usePositioner(componentProps, state, {
              styles: positioner.positionerStyles,
              transitionStatus: store.transitionStatus,
              props: elementProps,
              ref: (el: HTMLElement) => store.setPositionerElement(el),
              hidden: () => !store.mounted(),
              inert: () => !store.open(),
            }),
          )}
        </CompositeList>
      </FloatingNode>
    </MenuPositionerContext>
  );
}
