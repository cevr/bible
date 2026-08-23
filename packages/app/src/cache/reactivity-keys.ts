/**
 * Reactivity keys derived from the local-first change-scope vocabulary.
 *
 * The reading cache used to invalidate by predicate: a mutation produced
 * change scopes and every cached input was tested against them with a
 * `matches(input, scope)` function. `Reactivity` invalidates by key-set
 * intersection instead, so the predicate has to become two key functions —
 * one for the query side, one for the mutation side — that intersect exactly
 * when the predicate returned `true`.
 *
 * The vocabulary makes that possible because every scope is either
 * *area-wide* or *location-specific*, and a query's input names at most one
 * location. Each query therefore registers the pair `[area, area+location]`,
 * and each mutation invalidates the single key at its own precision: the area
 * key when the scope names no location — matching every query in the area, as
 * the predicate's unconditional `true` branch did — or the location key when
 * it does, matching only the query for that location. Areas that are not
 * location-addressed collapse to one key on both sides.
 *
 * These are the app's cache rules, not domain rules, so they live here rather
 * than in `@bible/core` (see
 * `docs/wayfinder/wiki-study-layer/client-compatibility.md`). Their input is
 * core's own sync scope vocabulary, so the sync engine's published
 * `ChangeSet`s can be routed into the same keys without a second mapping.
 */

import type { LibraryStateArea, ReaderLocation } from '@bible/core/library-state';
import { scopeForLibraryCommand } from '@bible/core/library-state';
import type { ChangeScope, LibraryMutationCommand, NoteScope } from '@bible/core/local-first';
import { Match, Option } from 'effect';

/**
 * The change scopes the reading caches react to: core's own `ChangeScope`,
 * plus the one scope core has no name for.
 *
 * Taking core's union rather than restating it is what makes the sync engine's
 * published `ChangeSet`s routable through {@link keysForScope} with no second
 * mapping — a claim a hand-written look-alike could not support, because
 * core's `NoteScope` carries a required `noteId` and three *optional strings*
 * where a restatement is tempted to write one optional `ReaderLocation`.
 * {@link noteLocation} is the one piece of real work that difference costs:
 * a note scope addresses a location only when all three of its string fields
 * are present, which is exactly when core's `changeSetFor` copies them from a
 * `SaveNote`. A `DeleteNote` carries only the id and so stales the whole area.
 *
 * `WritingsLibrary` has no sync counterpart: downloaded books are
 * device-local, so that scope exists only in this cache. `ContentUpdate`
 * (§3.6's installed topic content) is device-local for the same reason — which
 * generation a machine has activated is a fact about that machine, so it is
 * never published and never arrives from another device.
 */
export type CacheScope =
  | ChangeScope
  | { readonly _tag: 'WritingsLibrary' }
  | { readonly _tag: 'ContentUpdate' };

/**
 * The location a note scope addresses, if it addresses one.
 *
 * The three fields are optional independently in core's schema, but a
 * `ReaderLocation` needs all three, so a partially-filled scope resolves to
 * `None` and invalidates its whole area rather than a location it cannot name.
 */
const noteLocation = (scope: NoteScope): Option.Option<ReaderLocation> => {
  const source = Option.fromNullishOr(scope.source);
  const resourceId = Option.fromNullishOr(scope.resourceId);
  const location = Option.fromNullishOr(scope.location);
  if (Option.isNone(source) || Option.isNone(resourceId) || Option.isNone(location)) {
    return Option.none();
  }
  return Option.some({
    source: source.value,
    resourceId: resourceId.value,
    location: location.value,
  });
};

export const READING_PREFERENCES_KEY = 'reading-preferences';
export const READING_CONTINUITY_KEY = 'reading-continuity';
export const WRITINGS_LIBRARY_KEY = 'writings-library';
/** §3.6's installed topic content. Invalidated by `v1.content.update`, so the
 *  toast and the settings entry re-read one status after a run rather than each
 *  holding its own stale copy. */
export const CONTENT_KEY = 'content-update';

/** The key every query and mutation in one library area shares. */
export const libraryAreaKey = (area: LibraryStateArea): string => `library:${area}`;

/**
 * A reader location is three strings of unrestricted content, so the key that
 * stands for it is built by length-prefixing each field. That encoding is
 * injective — no pair of distinct locations can produce one key — which is
 * what makes key equality here mean exactly what the old predicate's
 * field-by-field comparison meant.
 */
export const annotationLocationKey = (location: ReaderLocation): string =>
  `${libraryAreaKey('annotations')}:${field(location.source)}${field(location.resourceId)}${field(location.location)}`;

const field = (value: string): string => `${String(value.length)}:${value}`;

/**
 * The keys a location-annotations query covers: the area key, so an area-wide
 * mutation reaches it, and its own location key, so a location-scoped
 * mutation reaches it and no sibling location.
 */
export const annotationQueryKeys = (location: ReaderLocation): readonly string[] => [
  libraryAreaKey('annotations'),
  annotationLocationKey(location),
];

/**
 * The keys one change scope invalidates. A scope that names a location
 * invalidates only that location's key; a scope that does not invalidates the
 * whole area.
 */
export const keysForScope = (scope: CacheScope): readonly string[] =>
  Match.value(scope).pipe(
    Match.tagsExhaustive({
      LibraryState: (libraryState) => {
        const location = Option.fromNullishOr(libraryState.location);
        if (libraryState.area === 'annotations' && Option.isSome(location)) {
          return [annotationLocationKey(location.value)];
        }
        return [libraryAreaKey(libraryState.area)];
      },
      Note: (note) => {
        const location = noteLocation(note);
        if (Option.isSome(location)) return [annotationLocationKey(location.value)];
        return [libraryAreaKey('annotations')];
      },
      ReadingPreferences: () => [READING_PREFERENCES_KEY],
      ReadingContinuity: () => [READING_CONTINUITY_KEY],
      WritingsLibrary: () => [WRITINGS_LIBRARY_KEY],
      ContentUpdate: () => [CONTENT_KEY],
    }),
  );

/**
 * The change scopes a library mutation produces — the app-side half of core's
 * `changeSetFor`, and deliberately field-for-field with it. Library-state
 * commands defer to core's own `scopeForLibraryCommand`; the two note commands
 * build core's `NoteScope` exactly as `changeSetFor` does, so a mutation
 * routed locally and the same mutation arriving back as a published
 * `ChangeSet` invalidate the identical keys.
 */
export const scopesForLibraryMutation = (
  command: LibraryMutationCommand,
): readonly CacheScope[] => {
  if (command._tag === 'SaveNote') {
    return [
      {
        _tag: 'Note',
        noteId: command.noteId,
        source: command.source,
        resourceId: command.resourceId,
        location: command.location,
      },
    ];
  }
  if (command._tag === 'DeleteNote') return [{ _tag: 'Note', noteId: command.noteId }];
  return [scopeForLibraryCommand(command)];
};

/** The keys a library mutation invalidates. */
export const keysForLibraryMutation = (command: LibraryMutationCommand): readonly string[] =>
  scopesForLibraryMutation(command).flatMap(keysForScope);
