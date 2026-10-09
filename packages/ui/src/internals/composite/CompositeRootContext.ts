// Upstream: packages/react/src/internals/composite/root/CompositeRootContext.ts
//
// What a composite's items read from their root: which index holds the tab
// stop, and how to move it.
import { type Accessor, createContext, useContext } from 'solid-js';

export interface CompositeRootContextValue {
  highlightedIndex: Accessor<number>;
  onHighlightedIndexChange: (index: number, shouldScrollIntoView?: boolean) => void;
}

export const CompositeRootContext = createContext<CompositeRootContextValue | null>(null);

/** The enclosing composite root; throws outside one. */
export function useCompositeRootContext(): CompositeRootContextValue {
  const context = useContext(CompositeRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: CompositeRootContext is missing. Composite parts must be placed within <Composite.Root>.',
    );
  }
  return context;
}
