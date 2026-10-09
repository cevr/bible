// Upstream: packages/react/src/menu/positioner/MenuPositioner.tsx,
// packages/react/src/menu/positioner/MenuPositionerContext.ts,
// packages/react/src/context-menu/positioner/ContextMenuPositioner.tsx
//
// Positions the menu's popup under its trigger, or, in a context menu, at
// the pointer: fixed, start-aligned and nudged -5/2 off the point so its
// first item sits under it, shifting over the point to stay on screen. The
// open menu is modal: a transparent backdrop covers the page (with a hole
// over a top-level menu's trigger), and page scroll is locked unless a touch
// opened it.
import { isServer, type JSX } from '@solidjs/web';
import { createContext, omit, onCleanup, Show, untrack, useContext } from 'solid-js';

import { CompositeList } from '../../internals/composite/CompositeList.tsx';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import {
  type Align,
  type Side,
  useAnchorPositioning,
} from '../../internals/useAnchorPositioning.ts';
import { InternalBackdrop } from '../../utils/FocusGuard.tsx';
import { usePositioner } from '../../utils/usePositioner.ts';
import { useAnchoredPopupScrollLock } from '../../utils/useScrollLock.ts';
import { useMenuPortalContext } from '../portal/MenuPortal.tsx';
import { useMenuRootContext } from '../root/MenuRootContext.ts';
import type { MenuInstantType } from '../store/MenuStore.ts';

interface MenuPositionerContextValue {
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

interface MenuPositionerState {
  open: boolean;
  side: Side;
  align: Align;
  anchorHidden: boolean;
  /** Why transitions are skipped, if they are. */
  instant: MenuInstantType;
}

export interface MenuPositionerProps extends BaseUIComponentProps<'div', MenuPositionerState> {
  /** The gap between the trigger and the popup, in pixels. @default 0 */
  sideOffset?: number | undefined;
  /** How the popup lines up with the trigger. @default 'center' */
  align?: Align | undefined;
}

export function MenuPositioner(componentProps: MenuPositionerProps): JSX.Element {
  const { store, parent } = useMenuRootContext();
  useMenuPortalContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'sideOffset', 'align');

  const contextMenu = parent.type === 'context-menu' ? parent.context : undefined;
  const props = componentProps;

  const positioner = useAnchorPositioning({
    floatingRootContext: store.floatingRootContext,
    get mounted() {
      return store.mounted();
    },
    get anchor() {
      return contextMenu?.anchor();
    },
    positionMethod: contextMenu ? 'fixed' : 'absolute',
    get sideOffset() {
      return contextMenu ? -5 : (props.sideOffset ?? 0);
    },
    get align() {
      return contextMenu ? 'start' : (props.align ?? 'center');
    },
    alignOffset: contextMenu ? 2 : 0,
    shiftCrossAxis: contextMenu !== undefined,
  });

  // The server set no element to let go.
  onCleanup(() => {
    if (!isServer) store.setPositionerElement(null);
  });

  useAnchoredPopupScrollLock(
    store.open,
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

  const positionerContext: MenuPositionerContextValue = {
    side: positioner.side,
    align: positioner.align,
  };

  return (
    <MenuPositionerContext value={positionerContext}>
      <Show when={store.mounted()}>
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
      <CompositeList
        elementsRef={store.itemDomElements}
        labelsRef={store.itemLabels}
        onMapChange={store.followActiveItem}
      >
        {/* Built inside the providers, so the popup and items read them. */}
        {untrack(() =>
          usePositioner(componentProps, state, {
            styles: positioner.positionerStyles,
            transitionStatus: store.transitionStatus,
            props: elementProps,
            ref: (el: HTMLElement) => store.setPositionerElement(el),
            inert: () => !store.open(),
          }),
        )}
      </CompositeList>
    </MenuPositionerContext>
  );
}
