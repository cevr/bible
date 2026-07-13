import type { EGWLocation } from '@bible/core/egw';

import type { ReaderReference } from './reader-reference.js';

export type AppRoute =
  | { readonly _tag: 'bible'; readonly ref?: ReaderReference }
  | { readonly _tag: 'egw'; readonly ref?: EGWLocation }
  | { readonly _tag: 'messages' }
  | { readonly _tag: 'sabbath-school' }
  | { readonly _tag: 'studies' };

export interface AppRouterState {
  readonly current: AppRoute;
  readonly history: readonly AppRoute[];
}

export const Route = {
  bible: (ref?: ReaderReference): AppRoute => ({ _tag: 'bible', ref }),
  egw: (ref?: EGWLocation): AppRoute => ({ _tag: 'egw', ref }),
  messages: (): AppRoute => ({ _tag: 'messages' }),
  sabbathSchool: (): AppRoute => ({ _tag: 'sabbath-school' }),
  studies: (): AppRoute => ({ _tag: 'studies' }),
} as const;

export const initialRouterState: AppRouterState = {
  current: Route.bible(),
  history: [],
};

export const isRoute = {
  bible: (route: AppRoute): route is Extract<AppRoute, { readonly _tag: 'bible' }> =>
    route._tag === 'bible',
  egw: (route: AppRoute): route is Extract<AppRoute, { readonly _tag: 'egw' }> =>
    route._tag === 'egw',
  messages: (route: AppRoute): route is Extract<AppRoute, { readonly _tag: 'messages' }> =>
    route._tag === 'messages',
  sabbathSchool: (
    route: AppRoute,
  ): route is Extract<AppRoute, { readonly _tag: 'sabbath-school' }> =>
    route._tag === 'sabbath-school',
  studies: (route: AppRoute): route is Extract<AppRoute, { readonly _tag: 'studies' }> =>
    route._tag === 'studies',
} as const;
