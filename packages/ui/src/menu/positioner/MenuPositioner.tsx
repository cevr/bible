// Upstream: packages/react/src/menu/positioner/MenuPositioner.tsx,
// packages/react/src/menu/positioner/MenuPositionerContext.ts
//
// Positions the menu's popup against its trigger (a context menu at the
// pointer). A modal menu gets a transparent backdrop (with a hole over a
// top-level menu's trigger), and locks page scroll unless a touch opened it.
import { isServer, type JSX } from '@solidjs/web';
import { createContext, omit, onCleanup, Show, untrack, useContext } from 'solid-js';

import { FloatingNode } from '../../floating-ui-solid/FloatingTree.tsx';
import { CompositeList } from '../../internals/composite/CompositeList.tsx';
import { DROPDOWN_COLLISION_AVOIDANCE } from '../../internals/constants.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import {
  type Align,
  type Side,
  type UseAnchorPositioningSharedParameters,
  useAnchorPositioning,
} from '../../internals/useAnchorPositioning.ts';
import { InternalBackdrop } from '../../utils/FocusGuard.tsx';
import { usePositioner } from '../../utils/usePositioner.ts';
import { useAnchoredPopupScrollLock } from '../../utils/useScrollLock.ts';
import { useMenuPortalContext } from '../portal/MenuPortal.tsx';
import { useMenuRootContext } from '../root/MenuRootContext.ts';
import type { MenuInstantType } from '../store/MenuStore.ts';

export interface MenuPositionerContextValue {
  side: () => Side;
  align: () => Align;
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

export interface MenuPositionerState {
  open: boolean;
  side: Side;
  align: Align;
  anchorHidden: boolean;
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

  const align = (): Align | undefined => props.align ?? (contextMenu ? 'start' : undefined);
  // A context menu sits just off the pointer, its first item under it.
  const contextMenuOffsets = () => contextMenu && !props.side && align() !== 'center';
  const collisionAvoidance = () => props.collisionAvoidance ?? DROPDOWN_COLLISION_AVOIDANCE;

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
      return props.side;
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

  // The server set no element to let go.
  onCleanup(() => {
    if (!isServer) store.setPositionerElement(null);
  });

  useAnchoredPopupScrollLock(
    () => store.open() && store.modal(),
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
    get instant() {
      return store.instantType();
    },
  };

  const shouldRenderBackdrop = () => store.mounted() && store.modal();

  const positionerContext: MenuPositionerContextValue = {
    side: positioner.side,
    align: positioner.align,
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
