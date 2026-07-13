/**
 * App Module - Application-level Services
 *
 * Provides the core router and application state management
 * that can be used by any renderer (TUI, Web, etc).
 */

export type { AppRoute, AppRouterState, BibleRouteReference, EGWReference } from './types.js';

export { Route, isRoute, initialRouterState } from './types.js';

export type { AppRouter, RouterAction } from './router.js';

export { createAppRouter, routerReducer } from './router.js';
