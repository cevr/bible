/**
 * RuntimeProvider - Solid.js context for Effect Runtime
 *
 * Provides a managed Effect runtime to the component tree.
 * Based on gent's atom-solid pattern.
 */

import { createContext, useContext } from 'solid-js';
import type { JSX } from 'solid-js';

import type { AppRuntime } from './app-runtime.js';

/**
 * Runtime context - holds the Effect runtime
 */
const RuntimeContext = createContext<AppRuntime>();

/**
 * Props for RuntimeProvider
 */
export interface RuntimeProviderProps {
  /**
   * The Effect runtime to provide to children
   */
  runtime: AppRuntime;
  /**
   * Child components
   */
  children: JSX.Element;
}

/**
 * Provides an Effect runtime to the component tree
 */
export function RuntimeProvider(props: RuntimeProviderProps): JSX.Element {
  return <RuntimeContext.Provider value={props.runtime}>{props.children}</RuntimeContext.Provider>;
}

/**
 * Hook to access the Effect runtime from context
 *
 * @throws Error if used outside of RuntimeProvider
 */
export function useAppRuntime(): AppRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error('useAppRuntime must be used within a RuntimeProvider');
  }
  return runtime;
}

/**
 * Hook to optionally access the Effect runtime from context
 *
 * Returns undefined if not within a RuntimeProvider.
 * Useful for components that can work with or without Effect.
 */
export function useMaybeRuntime(): AppRuntime | undefined {
  return useContext(RuntimeContext);
}
