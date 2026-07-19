import { Reference as BibleReference } from '@bible/core/bible';

import { decodeRoute, encodeRoute } from './codec.js';
import type { AppRoute, NavigationIntent, ReadingRoute, RouteHistory } from './model.js';

export interface BootRouteInput {
  readonly requestedPath: string;
  readonly persisted?: ReadingRoute;
  readonly resolveLegacy?: (path: string) => AppRoute | undefined;
}

export interface BootRouteResult {
  readonly route: AppRoute;
  readonly historyMode: 'preserve' | 'replace';
  readonly reason: 'explicit' | 'persisted' | 'fallback' | 'legacy' | 'not-found';
}

export const bootRoute = (input: BootRouteInput): BootRouteResult => {
  const path = input.requestedPath || '/';
  if (path === '/') {
    if (input.persisted) {
      return { route: input.persisted, historyMode: 'replace', reason: 'persisted' };
    }
    return {
      route: { _tag: 'bible', reference: BibleReference.chapter(1, 1) },
      historyMode: 'replace',
      reason: 'fallback',
    };
  }

  const explicit = decodeRoute(path);
  if (explicit) return { route: explicit, historyMode: 'preserve', reason: 'explicit' };

  const legacy = input.resolveLegacy?.(path);
  if (legacy) return { route: legacy, historyMode: 'replace', reason: 'legacy' };

  return {
    route: { _tag: 'not-found', requestedPath: path },
    historyMode: 'preserve',
    reason: 'not-found',
  };
};

export const navigate = (
  history: RouteHistory,
  route: AppRoute,
  intent: NavigationIntent = 'intentional',
): void => {
  const path = encodeRoute(route);
  if (intent === 'refinement') history.replace(path);
  else history.push(path);
};
