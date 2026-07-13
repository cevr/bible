/**
 * App Router Types
 *
 * Renderer-agnostic types for the application router state machine.
 * Used by both TUI and Web renderers.
 */

import { Schema } from 'effect';
import { ChapterReference, VerseReference } from '../bible/model.js';
import { EGWLocation } from '../egw/parse.js';

/**
 * Bible Reference - identifies a location in the Bible
 */
export const BibleRouteReference = Schema.Union([ChapterReference, VerseReference]);
export type BibleRouteReference = typeof BibleRouteReference.Type;

/**
 * App Route variants - discriminated union using Schema.TaggedClass
 */
export class BibleRoute extends Schema.TaggedClass<BibleRoute>('BibleRoute')('bible', {
  ref: Schema.optional(BibleRouteReference),
}) {}

export class EGWRoute extends Schema.TaggedClass<EGWRoute>('EGWRoute')('egw', {
  ref: Schema.optional(EGWLocation),
}) {}

export class MessagesRoute extends Schema.TaggedClass<MessagesRoute>('MessagesRoute')(
  'messages',
  {},
) {}

export class SabbathSchoolRoute extends Schema.TaggedClass<SabbathSchoolRoute>(
  'SabbathSchoolRoute',
)('sabbath-school', {}) {}

export class StudiesRoute extends Schema.TaggedClass<StudiesRoute>('StudiesRoute')('studies', {}) {}

/**
 * App Route - discriminated union for all app routes
 */
export const AppRoute = Schema.Union([
  BibleRoute,
  EGWRoute,
  MessagesRoute,
  SabbathSchoolRoute,
  StudiesRoute,
]);

export type AppRoute = Schema.Schema.Type<typeof AppRoute>;

/**
 * App Router State
 */
export class AppRouterState extends Schema.Class<AppRouterState>('AppRouterState')({
  current: AppRoute,
  history: Schema.Array(AppRoute),
}) {
  static fromJson = Schema.decodeEffect(Schema.fromJsonString(AppRouterState));
  static toJson = Schema.encodeEffect(Schema.fromJsonString(AppRouterState));
}

/**
 * Initial router state - starts at Bible view
 */
export const initialRouterState = new AppRouterState({
  current: new BibleRoute({}),
  history: [],
});

/**
 * Route constructors for type-safe navigation
 */
export const Route = {
  bible: (ref?: BibleRouteReference): AppRoute => new BibleRoute({ ref }),
  egw: (ref?: EGWLocation): AppRoute => new EGWRoute({ ref }),
  messages: (): AppRoute => new MessagesRoute({}),
  sabbathSchool: (): AppRoute => new SabbathSchoolRoute({}),
  studies: (): AppRoute => new StudiesRoute({}),
} as const;

/**
 * Route matchers for type-safe pattern matching
 */
export const isRoute = {
  bible: (route: AppRoute): route is BibleRoute => route._tag === 'bible',
  egw: (route: AppRoute): route is EGWRoute => route._tag === 'egw',
  messages: (route: AppRoute): route is MessagesRoute => route._tag === 'messages',
  sabbathSchool: (route: AppRoute): route is SabbathSchoolRoute => route._tag === 'sabbath-school',
  studies: (route: AppRoute): route is StudiesRoute => route._tag === 'studies',
} as const;
