/**
 * RuntimeProvider - Solid.js context for Effect Runtime
 *
 * Provides a managed Effect runtime to the component tree.
 * Based on gent's atom-solid pattern.
 */

import type { ManagedRuntime } from 'effect';
import { createContext, useContext } from 'solid-js';
import type { JSX } from 'solid-js';

/**
 * Runtime context - holds the Effect runtime
 */
const RuntimeContext = createContext<ManagedRuntime.ManagedRuntime<unknown, unknown>>();

/**
 * Props for RuntimeProvider
 */
export interface RuntimeProviderProps<R, ER> {
  /**
   * The Effect runtime to provide to children
   */
  runtime: ManagedRuntime.ManagedRuntime<R, ER>;
  /**
   * Child components
   */
  children: JSX.Element;
}

/**
 * Provides an Effect runtime to the component tree
 */
export function RuntimeProvider<R, ER>(props: RuntimeProviderProps<R, ER>): JSX.Element {
  return (
    <RuntimeContext.Provider
      value={props.runtime as ManagedRuntime.ManagedRuntime<unknown, unknown>}
    >
      {props.children}
    </RuntimeContext.Provider>
  );
}

/**
 * Hook to access the Effect runtime from context
 *
 * @throws Error if used outside of RuntimeProvider
 */
export function useAppRuntime<R = unknown>(): ManagedRuntime.ManagedRuntime<R, unknown> {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error('useAppRuntime must be used within a RuntimeProvider');
  }
  return runtime as ManagedRuntime.ManagedRuntime<R, unknown>;
}

/**
 * Hook to optionally access the Effect runtime from context
 *
 * Returns undefined if not within a RuntimeProvider.
 * Useful for components that can work with or without Effect.
 */
export function useMaybeRuntime<R = unknown>():
  | ManagedRuntime.ManagedRuntime<R, unknown>
  | undefined {
  const runtime = useContext(RuntimeContext);
  return runtime as ManagedRuntime.ManagedRuntime<R, unknown> | undefined;
}
