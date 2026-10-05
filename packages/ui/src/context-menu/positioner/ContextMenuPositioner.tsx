// Upstream: packages/react/src/context-menu/positioner/ContextMenuPositioner.tsx
//
// The context menu's positioner is the menu's: a context menu sits at the
// pointer (bottom, start, nudged -5/2 off the point unless `side` or a
// centred `align` is given), with fixed positioning and no arrow padding.
import { MenuPositioner } from '../../menu/positioner/MenuPositioner.tsx';
import type {
  MenuPositionerProps,
  MenuPositionerState,
} from '../../menu/positioner/MenuPositioner.tsx';

export interface ContextMenuPositionerState extends MenuPositionerState {}

export interface ContextMenuPositionerProps extends Omit<MenuPositionerProps, 'positionMethod'> {}

export const ContextMenuPositioner: (
  props: ContextMenuPositionerProps,
) => ReturnType<typeof MenuPositioner> = MenuPositioner;
