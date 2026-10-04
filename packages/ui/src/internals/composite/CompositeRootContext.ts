// Upstream: packages/react/src/internals/composite/root/CompositeRootContext.ts
//
// What a composite's items read from their root: which index holds the tab
// stop, how to move it, whether hovering an item focuses it, and a way to
// hand the root a keydown that happened outside it.
import { type Accessor, createContext, useContext } from 'solid-js';

export interface CompositeRootContextValue {
  highlightedIndex: Accessor<number>;
  onHighlightedIndexChange: (index: number, shouldScrollIntoView?: boolean) => void;
  highlightItemOnHover: Accessor<boolean>;
  /**
   * Runs the root's key handling for a keydown that did not happen inside it
   * (a menu whose popup lives outside the toolbar holding its trigger).
   */
  relayKeyboardEvent: (event: KeyboardEvent) => void;
}

export const CompositeRootContext = createContext<CompositeRootContextValue | null>(null);

/** The enclosing composite root; throws outside one. */
export function useCompositeRootContext(): CompositeRootContextValue;
export function useCompositeRootContext(optional: true): CompositeRootContextValue | null;
export function useCompositeRootContext(optional = false): CompositeRootContextValue | null {
  const context = useContext(CompositeRootContext);
  if (context === null && !optional) {
    throw new Error(
      'Base UI: CompositeRootContext is missing. Composite parts must be placed within <Composite.Root>.',
    );
  }
  return context;
}
