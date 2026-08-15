import type { ReaderLocation } from '@bible/core/library-state';
import { Option } from 'effect';

import { decodeRoute, encodeRoute } from './codec.js';
import type { AppRoute, ReadingRoute } from './model.js';

export const readerLocationForRoute = (route: AppRoute): Option.Option<ReaderLocation> => {
  if (route._tag === 'bible') {
    return Option.some({ source: 'bible', resourceId: 'KJV', location: encodeRoute(route) });
  }
  if (route._tag === 'writings') {
    return Option.some({
      source: 'egw',
      resourceId: String(route.reference.publicationId),
      location: encodeRoute(route),
    });
  }
  return Option.none();
};

export const readingRouteForLocation = (
  location: Option.Option<ReaderLocation>,
): Option.Option<ReadingRoute> =>
  Option.flatMap(location, (current) =>
    Option.flatMap(decodeRoute(current.location), (route) => {
      if (current.source === 'bible' && route._tag === 'bible') return Option.some(route);
      if (
        current.source === 'egw' &&
        route._tag === 'writings' &&
        String(route.reference.publicationId) === current.resourceId
      ) {
        return Option.some(route);
      }
      return Option.none();
    }),
  );
