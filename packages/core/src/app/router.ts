/**
 * App Router Service
 *
 * Renderer-agnostic router state machine for managing application navigation.
 * Provides navigation methods and history management.
 *
 * The TUI/Web renderers wrap this service with their own input handling
 * (keyboard shortcuts for TUI, click handlers for Web).
 */

import type { AppRoute, AppRouterState, BibleReference, EGWReference } from './types.js';
import { initialRouterState, Route } from './types.js';

/**
 * Router actions - all possible state transitions
 */
export type RouterAction =
  | { readonly type: 'navigate'; readonly route: AppRoute }
  | { readonly type: 'back' }
  | { readonly type: 'reset' };

/**
 * Pure reducer for router state
 * Returns new state without mutation
 */
export function routerReducer(state: AppRouterState, action: RouterAction): AppRouterState {
  switch (action.type) {
    case 'navigate': {
      // Don't add to history if navigating to same route type
      if (state.current._tag === action.route._tag) {
        return { ...state, current: action.route };
      }
      return {
        current: action.route,
        history: [...state.history, state.current],
      };
    }

    case 'back': {
      if (state.history.length === 0) {
        return state;
      }
      const newHistory = [...state.history];
      const previous = newHistory.pop();
      if (!previous) return state;
      return {
        current: previous,
        history: newHistory,
      };
    }

    case 'reset': {
      return initialRouterState;
    }
  }
}

/**
 * Router instance - mutable wrapper around pure state
 * Renderers use this to manage navigation state
 */
export interface AppRouter {
  /** Get current router state */
  getState(): AppRouterState;

  /** Get current route */
  getCurrentRoute(): AppRoute;

  /** Navigate to a route */
  navigate(route: AppRoute): void;

  /** Navigate to Bible view */
  navigateToBible(ref?: BibleReference): void;

  /** Navigate to EGW reader */
  navigateToEgw(ref?: EGWReference): void;

  /** Navigate to Messages view */
  navigateToMessages(): void;

  /** Navigate to Sabbath School view */
  navigateToSabbathSchool(): void;

  /** Navigate to Studies view */
  navigateToStudies(): void;

  /** Go back to previous route */
  back(): boolean;

  /** Check if can go back */
  canGoBack(): boolean;

  /** Reset to initial state */
  reset(): void;

  /** Subscribe to state changes */
  subscribe(listener: (state: AppRouterState) => void): () => void;
}

/**
 * Create a new router instance
 * @param initialState - Optional initial state (defaults to Bible view)
 */
export function createAppRouter(initialState: AppRouterState = initialRouterState): AppRouter {
  let state = initialState;
  const listeners = new Set<(state: AppRouterState) => void>();

  const dispatch = (action: RouterAction): void => {
    state = routerReducer(state, action);
    listeners.forEach((listener) => listener(state));
  };

  return {
    getState: () => state,

    getCurrentRoute: () => state.current,

    navigate: (route) => {
      dispatch({ type: 'navigate', route });
    },

    navigateToBible: (ref) => {
      dispatch({ type: 'navigate', route: Route.bible(ref) });
    },

    navigateToEgw: (ref) => {
      dispatch({ type: 'navigate', route: Route.egw(ref) });
    },

    navigateToMessages: () => {
      dispatch({ type: 'navigate', route: Route.messages() });
    },

    navigateToSabbathSchool: () => {
      dispatch({ type: 'navigate', route: Route.sabbathSchool() });
    },

    navigateToStudies: () => {
      dispatch({ type: 'navigate', route: Route.studies() });
    },

    back: () => {
      if (state.history.length === 0) {
        return false;
      }
      dispatch({ type: 'back' });
      return true;
    },

    canGoBack: () => state.history.length > 0,

    reset: () => {
      dispatch({ type: 'reset' });
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
