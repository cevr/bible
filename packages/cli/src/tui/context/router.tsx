/**
 * TUI Router Context
 *
 * Owns the TUI's reactive route history and navigation actions.
 */

import type { EGWLocation } from '@bible/core/egw';
import { createContext, createSignal, useContext, type ParentProps } from 'solid-js';

import type { ReaderReference } from '../../app/reader-reference.js';
import { initialRouterState, Route, type AppRoute, type AppRouterState } from '../../app/route.js';

/**
 * Router context value for TUI-owned reactive navigation
 */
interface RouterContextValue {
  /** Current route (reactive) */
  route: () => AppRoute;

  /** Navigate to Bible view */
  navigateToBible: (ref?: ReaderReference) => void;

  /** Navigate to EGW reader */
  navigateToEgw: (ref?: EGWLocation) => void;

  /** Navigate to Messages view */
  navigateToMessages: () => void;

  /** Navigate to Sabbath School view */
  navigateToSabbathSchool: () => void;

  /** Navigate to Studies view */
  navigateToStudies: () => void;

  /** Go back to previous route */
  back: () => boolean;

  /** Check if can go back */
  canGoBack: () => boolean;
}

const RouterContext = createContext<RouterContextValue>();

interface RouterProviderProps {
  /** Optional initial route */
  initialRoute?: AppRoute;
}

/**
 * Router Provider
 *
 * Keeps the route state at the Solid presentation seam that consumes it.
 */
export function RouterProvider(props: ParentProps<RouterProviderProps>) {
  // Create initial state from props if provided
  const initialState: AppRouterState = props.initialRoute
    ? { current: props.initialRoute, history: [] }
    : initialRouterState;

  const [state, setState] = createSignal<AppRouterState>(initialState);

  const navigate = (route: AppRoute) => {
    setState((current) =>
      current.current._tag === route._tag
        ? { ...current, current: route }
        : { current: route, history: [...current.history, current.current] },
    );
  };

  const back = (): boolean => {
    const current = state();
    const previous = current.history.at(-1);
    if (!previous) return false;
    setState({ current: previous, history: current.history.slice(0, -1) });
    return true;
  };

  const value: RouterContextValue = {
    route: () => state().current,
    navigateToBible: (ref) => navigate(Route.bible(ref)),
    navigateToEgw: (ref) => navigate(Route.egw(ref)),
    navigateToMessages: () => navigate(Route.messages()),
    navigateToSabbathSchool: () => navigate(Route.sabbathSchool()),
    navigateToStudies: () => navigate(Route.studies()),
    back,
    canGoBack: () => state().history.length > 0,
  };

  return <RouterContext.Provider value={value}>{props.children}</RouterContext.Provider>;
}

/**
 * Use the router context
 */
export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return ctx;
}
