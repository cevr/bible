import type { ReaderLocation } from '@bible/core/library-state';

import { decodeRoute, encodeRoute } from './codec.js';
import type { AppRoute, ReadingRoute } from './model.js';

export const readerLocationForRoute = (route: AppRoute): ReaderLocation | undefined => {
  if (route._tag === 'bible') {
    return { source: 'bible', resourceId: 'KJV', location: encodeRoute(route) };
  }
  if (route._tag === 'writings') {
    return {
      source: 'egw',
      resourceId: String(route.reference.publicationId),
      location: encodeRoute(route),
    };
  }
  return undefined;
};

export const readingRouteForLocation = (
  location: ReaderLocation | null | undefined,
): ReadingRoute | undefined => {
  if (location === null || location === undefined) return undefined;
  const route = decodeRoute(location.location);
  if (location.source === 'bible' && route?._tag === 'bible') return route;
  if (
    location.source === 'egw' &&
    route?._tag === 'writings' &&
    String(route.reference.publicationId) === location.resourceId
  ) {
    return route;
  }
  return undefined;
};
