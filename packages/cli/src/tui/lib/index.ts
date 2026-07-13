/**
 * TUI Library - Effect + Solid.js integration utilities
 *
 * Based on gent's atom-solid patterns for reactive Effect state management.
 */

// Result ADT for async state
export {
  Result,
  isInitial,
  isSuccess,
  isFailure,
  getValue,
  getCause,
  isLoading,
  match,
  type Initial,
  type Success,
  type Failure,
  type Result as ResultType,
} from './result.js';

// Runtime hooks
export { useRuntime, useEffectRunner } from './use-runtime.js';

// Runtime provider
export {
  RuntimeProvider,
  useAppRuntime,
  useMaybeRuntime,
  type RuntimeProviderProps,
} from './runtime-provider.js';

// App runtime
export {
  AppLayer,
  appRuntime,
  getAppRuntime,
  runAppEffect,
  type AppRuntime,
  type AppServices,
} from './app-runtime.js';
