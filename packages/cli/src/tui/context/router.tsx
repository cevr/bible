/**
 * TUI Router Context
 *
 * Wraps the core AppRouter with Solid.js reactivity and TUI-specific
 * keyboard bindings. The core router logic is renderer-agnostic;
 * this context adds TUI-specific behavior.
 */

import type {
  AppRoute,
  AppRouter,
  AppRouterState,
  BibleReference,
  EGWReference,
} from '@bible/core/app';
import { createAppRouter, initialRouterState } from '@bible/core/app';
import { createContext, createSignal, onCleanup, useContext, type ParentProps } from 'solid-js';

/**
 * Router context value - reactive wrapper around core AppRouter
 */
interface RouterContextValue {
  /** Current route (reactive) */
  route: () => AppRoute;

  /** Full router state (reactive) */
  state: () => AppRouterState;

  /** Core router instance for imperative access */
  router: AppRouter;

  /** Navigate to a route */
  navigate: (route: AppRoute) => void;

  /** Navigate to Bible view */
  navigateToBible: (ref?: BibleReference) => void;

  /** Navigate to EGW reader */
  navigateToEgw: (ref?: EGWReference) => void;

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
 * Creates a core AppRouter and provides reactive access to its state.
 * The router state is kept in sync with Solid.js signals for reactivity.
 */
export function RouterProvider(props: ParentProps<RouterProviderProps>) {
  // Create initial state from props if provided
  const initialState: AppRouterState = props.initialRoute
    ? { current: props.initialRoute, history: [] }
    : initialRouterState;

  // Create core router
  const router = createAppRouter(initialState);

  // Create reactive state
  const [state, setState] = createSignal<AppRouterState>(router.getState());

  // Subscribe to router changes and update reactive state
  const unsubscribe = router.subscribe((newState) => {
    setState(newState);
  });

  onCleanup(() => {
    unsubscribe();
  });

  const value: RouterContextValue = {
    route: () => state().current,
    state,
    router,
    navigate: (route) => router.navigate(route),
    navigateToBible: (ref) => router.navigateToBible(ref),
    navigateToEgw: (ref) => router.navigateToEgw(ref),
    navigateToMessages: () => router.navigateToMessages(),
    navigateToSabbathSchool: () => router.navigateToSabbathSchool(),
    navigateToStudies: () => router.navigateToStudies(),
    back: () => router.back(),
    canGoBack: () => router.canGoBack(),
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

/**
 * Use just the current route (convenience hook)
 */
export function useRoute(): () => AppRoute {
  return useRouter().route;
}
