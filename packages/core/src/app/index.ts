/**
 * App Module - Application-level Services
 *
 * Provides the core router and application state management
 * that can be used by any renderer (TUI, Web, etc).
 */

export {
  BibleRouteReference,
  Route,
  isRoute,
  initialRouterState,
  type AppRoute,
  type AppRouterState,
} from './types.js';

export type { EGWLocation } from '../egw/parse.js';
