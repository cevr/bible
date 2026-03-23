/**
 * App Router Types
 *
 * Renderer-agnostic types for the application router state machine.
 * Used by both TUI and Web renderers.
 */

import { Schema } from 'effect';

/**
 * Bible Reference - identifies a location in the Bible
 */
export class BibleReference extends Schema.Class<BibleReference>('BibleReference')({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.optionalKey(Schema.NullishOr(Schema.Number)),
}) {
  static fromJson = Schema.decodeEffect(Schema.fromJsonString(BibleReference));
  static toJson = Schema.encodeEffect(Schema.fromJsonString(BibleReference));
}

/**
 * EGW Reference - identifies a location in EGW writings
 * Uses refcode format like "PP 351.1"
 */
export class EGWReference extends Schema.Class<EGWReference>('EGWReference')({
  bookCode: Schema.String,
  page: Schema.optionalKey(Schema.NullishOr(Schema.Number)),
  paragraph: Schema.optionalKey(Schema.NullishOr(Schema.Number)),
}) {
  static fromJson = Schema.decodeEffect(Schema.fromJsonString(EGWReference));
  static toJson = Schema.encodeEffect(Schema.fromJsonString(EGWReference));
}

/**
 * App Route variants - discriminated union using Schema.TaggedClass
 */
export class BibleRoute extends Schema.TaggedClass<BibleRoute>('BibleRoute')('bible', {
  ref: Schema.optional(BibleReference),
}) {}

export class EGWRoute extends Schema.TaggedClass<EGWRoute>('EGWRoute')('egw', {
  ref: Schema.optional(EGWReference),
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
  bible: (ref?: BibleReference): AppRoute => new BibleRoute({ ref }),
  egw: (ref?: EGWReference): AppRoute => new EGWRoute({ ref }),
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
