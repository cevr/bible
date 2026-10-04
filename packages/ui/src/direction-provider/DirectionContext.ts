// Upstream: packages/react/src/internals/direction-context/DirectionContext.ts
//
// The text direction parts read for their keys (ArrowLeft/ArrowRight swap in
// right-to-left). Outside a provider it is `ltr`.
import { createContext, useContext } from 'solid-js';

export type TextDirection = 'ltr' | 'rtl';

export interface DirectionContextValue {
  readonly direction: TextDirection;
}

export const DirectionContext = createContext<DirectionContextValue>({ direction: 'ltr' });

/**
 * The text direction of the nearest `DirectionProvider`, else `ltr`. Read in
 * a reactive scope (JSX, a memo, a handler of a part) it stays current.
 */
export function useDirection(): TextDirection {
  return useContext(DirectionContext).direction;
}

/** The provider's direction as an accessor, for a part to read when it handles a key. */
export function useDirectionAccessor(): () => TextDirection {
  const context = useContext(DirectionContext);
  return () => context.direction;
}
