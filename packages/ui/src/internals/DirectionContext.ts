// Upstream: packages/react/src/internals/direction-context/DirectionContext.ts
//
// The text direction parts read for their keys (ArrowLeft/ArrowRight swap in
// right-to-left) and their placement. It is `ltr` unless a `DirectionContext`
// provider above sets it; upstream's `DirectionProvider` is left out, as no
// page is right-to-left.
import { createContext, useContext } from 'solid-js';

export type TextDirection = 'ltr' | 'rtl';

export interface DirectionContextValue {
  readonly direction: TextDirection;
}

export const DirectionContext = createContext<DirectionContextValue>({ direction: 'ltr' });

/** The context's direction as an accessor, for a part to read when it handles a key. */
export function useDirectionAccessor(): () => TextDirection {
  const context = useContext(DirectionContext);
  return () => context.direction;
}
