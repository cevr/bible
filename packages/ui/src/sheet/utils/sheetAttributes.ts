// Upstream: react-aria-components 1.22.1, packages/react-aria-components/src/Sheet.tsx
// (SheetRenderProps, getDataAttributes). Copyright 2026 Adobe, Apache-2.0
// (`../LICENSE`); ported to Solid 2: a `true` state is a bare attribute, as every
// part of this package shows one.
//
// The state the overlay, backdrop and popup show as `data-*` attributes.
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps.ts';
import type { SheetPosition, SheetSwipeDirection } from './swipe.ts';

export interface SheetState {
  /** The edge the sheet rests on. */
  position: SheetPosition;
  /** The direction a swipe dismisses it in. */
  swipeDirection: SheetSwipeDirection;
  /** Its place among the sheets mounted now: 0 for the first. */
  stackIndex: number;
  /** Whether another sheet stands in front of it. */
  hasDescendants: boolean;
  /** Whether all of it shows (it rests at its last snap point). */
  expanded: boolean;
  /** Whether it is scrolling in. */
  entering: boolean;
  /** Whether it is scrolling out, closed. */
  exiting: boolean;
}

const bare = (name: string) => (value: boolean) => (value ? { [name]: '' } : null);

export const sheetStateAttributesMapping: StateAttributesMapping<SheetState> = {
  position: (value) => ({ 'data-position': value }),
  swipeDirection: (value) => ({ 'data-swipe-direction': value }),
  stackIndex: (value) => ({ 'data-stack-index': String(value) }),
  hasDescendants: bare('data-has-descendants'),
  expanded: bare('data-expanded'),
  entering: bare('data-entering'),
  exiting: bare('data-exiting'),
};
