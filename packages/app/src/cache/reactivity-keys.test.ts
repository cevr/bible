/**
 * Equivalence proof for the key derivation that replaced the reading cache's
 * predicate-scope invalidation.
 *
 * The old layer refreshed a cached entry when
 * `affects(command).some((scope) => matches(input, scope))` held. The new
 * layer refreshes it when the query's key set and the mutation's key set
 * intersect. This suite keeps the retired `affects`/`matches` pair as an
 * oracle and asserts the two agree over the cross product of every mutation
 * command shape and every cached input the app can hold.
 */

import type {
  LibraryStateArea,
  LibraryStateScope,
  ReaderLocation,
} from '@bible/core/library-state';
import { LibraryEntityId, scopeForLibraryCommand } from '@bible/core/library-state';
import {
  changeSetFor,
  NoteId,
  Timestamp,
  type ChangeScope,
  type DomainMutationCommand,
  type LibraryMutationCommand,
} from '@bible/core/local-first';
import { DEFAULT_READING_PREFERENCES } from '@bible/core/reading-preferences';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Schema } from 'effect';

import {
  annotationLocationKey,
  annotationQueryKeys,
  keysForLibraryMutation,
  keysForScope,
  libraryAreaKey,
  READING_CONTINUITY_KEY,
  READING_PREFERENCES_KEY,
  WRITINGS_LIBRARY_KEY,
} from './reactivity-keys.js';

// ---------------------------------------------------------------------------
// The retired predicate layer, kept verbatim as the oracle.
// `scopeForMutation` and the four `matches` bodies below are copies of
// `reading-data.tsx` at 998f5ea6, lines 88-102 and 243-286.
// ---------------------------------------------------------------------------

const scopeForMutation = (command: LibraryMutationCommand): LibraryStateScope => {
  if (command._tag === 'SaveNote') {
    return {
      _tag: 'LibraryState',
      area: 'annotations',
      location: {
        source: command.source,
        resourceId: command.resourceId,
        location: command.location,
      },
    };
  }
  if (command._tag === 'DeleteNote') return { _tag: 'LibraryState', area: 'annotations' };
  return scopeForLibraryCommand(command);
};

const annotationsMatches = (location: ReaderLocation, scope: LibraryStateScope): boolean => {
  if (scope.area !== 'annotations') return false;
  const scopeLocation = Option.fromNullishOr(scope.location);
  if (Option.isNone(scopeLocation)) return true;
  return (
    scopeLocation.value.source === location.source &&
    scopeLocation.value.resourceId === location.resourceId &&
    scopeLocation.value.location === location.location
  );
};

const areaMatches =
  (area: LibraryStateArea) =>
  (_input: {}, scope: LibraryStateScope): boolean =>
    scope.area === area;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const id = (value: string) => Schema.decodeSync(LibraryEntityId)(value);
const noteId = (value: string) => Schema.decodeSync(NoteId)(value);

/** The local-first wire schema models these optional fields as `null`. */
const absent = Option.getOrNull(Option.none());

const johnLocation: ReaderLocation = {
  source: 'bible',
  resourceId: 'KJV',
  location: '/bible/43/3/16',
};
const romansLocation: ReaderLocation = {
  source: 'bible',
  resourceId: 'KJV',
  location: '/bible/45/8/28',
};
const writingsLocation: ReaderLocation = {
  source: 'egw',
  resourceId: '130',
  location: '/writings/130/page/12',
};

/** Every cached annotations input the app can hold. */
const annotationInputs: readonly ReaderLocation[] = [
  johnLocation,
  romansLocation,
  writingsLocation,
];

/**
 * One command per constructor of `LibraryMutationCommand`. Keying the record
 * by the union's own tag makes completeness a type error rather than a test
 * that has to be remembered: a new command shape cannot compile until it has a
 * fixture here.
 */
const commandFixtures = {
  SaveNote: {
    _tag: 'SaveNote',
    noteId: noteId('note:bible:KJV:/bible/43/3/16'),
    source: 'bible',
    resourceId: 'KJV',
    location: '/bible/43/3/16',
    content: 'the love of God',
  },
  DeleteNote: { _tag: 'DeleteNote', noteId: noteId('note:bible:KJV:/bible/43/3/16') },
  SaveBookmark: {
    _tag: 'SaveBookmark',
    id: id('bookmark:1'),
    location: johnLocation,
    label: 'John 3:16',
  },
  DeleteBookmark: { _tag: 'DeleteBookmark', id: id('bookmark:1') },
  SaveMarker: {
    _tag: 'SaveMarker',
    id: id('marker:1'),
    location: writingsLocation,
    style: 'highlight',
    color: 'ochre',
  },
  DeleteMarker: { _tag: 'DeleteMarker', id: id('marker:1') },
  SaveUserCrossReference: {
    _tag: 'SaveUserCrossReference',
    id: id('reference:1'),
    from: johnLocation,
    to: romansLocation,
    toEnd: absent,
    kind: absent,
    note: absent,
  },
  DeleteUserCrossReference: { _tag: 'DeleteUserCrossReference', id: id('reference:1') },
  SaveCollection: {
    _tag: 'SaveCollection',
    id: id('collection:study'),
    name: 'Study',
    description: absent,
  },
  DeleteCollection: { _tag: 'DeleteCollection', id: id('collection:study') },
  AddCollectionMember: {
    _tag: 'AddCollectionMember',
    collectionId: id('collection:study'),
    memberId: id('bookmark:1'),
    memberType: 'bookmark',
    position: 0,
  },
  RemoveCollectionMember: {
    _tag: 'RemoveCollectionMember',
    collectionId: id('collection:study'),
    memberId: id('bookmark:1'),
  },
  SaveReadingPlan: {
    _tag: 'SaveReadingPlan',
    id: id('plan:1'),
    title: 'Gospels',
    description: absent,
    steps: [{ id: 'step-1', title: 'John 1', route: '/bible/43/1' }],
  },
  DeleteReadingPlan: { _tag: 'DeleteReadingPlan', id: id('plan:1') },
  SetReadingPlanProgress: {
    _tag: 'SetReadingPlanProgress',
    planId: id('plan:1'),
    stepId: 'step-1',
    completedAt: absent,
  },
  SaveMemoryVerse: {
    _tag: 'SaveMemoryVerse',
    id: id('verse:1'),
    resourceId: 'KJV',
    location: 'John 3:16',
    prompt: absent,
    nextPracticeAt: absent,
    intervalDays: 0,
  },
  DeleteMemoryVerse: { _tag: 'DeleteMemoryVerse', id: id('verse:1') },
  RecordMemoryPractice: {
    _tag: 'RecordMemoryPractice',
    id: id('practice:1'),
    memoryVerseId: id('verse:1'),
    rating: 4,
    practicedAt: '2026-08-16T00:00:00.000Z',
    nextPracticeAt: '2026-08-23T00:00:00.000Z',
    intervalDays: 7,
  },
} satisfies {
  readonly [Tag in LibraryMutationCommand['_tag']]: Extract<
    LibraryMutationCommand,
    { readonly _tag: Tag }
  >;
};

/**
 * A writings note proves the derivation separates sources, which the
 * Bible-only fixture above cannot show on its own.
 */
const writingsNote: LibraryMutationCommand = {
  _tag: 'SaveNote',
  noteId: noteId('note:egw:130:/writings/130/page/12'),
  source: 'egw',
  resourceId: '130',
  location: '/writings/130/page/12',
  content: 'a quiet hour',
};

const commands: ReadonlyArray<readonly [string, LibraryMutationCommand]> = [
  ...Object.entries(commandFixtures),
  ['SaveNote (writings)', writingsNote],
];

/**
 * The two `DomainMutationCommand` shapes that are not library mutations. They
 * have no `keysForLibraryMutation` counterpart — the app reaches their scopes
 * through `keysForScope` directly — so they are named here for the
 * core-`ChangeScope` cases rather than swept with the rest.
 */
const setPreferences: DomainMutationCommand = {
  _tag: 'SetReadingPreferences',
  preferences: DEFAULT_READING_PREFERENCES,
};

const recordReading: DomainMutationCommand = {
  _tag: 'RecordReading',
  historyId: id('history:1'),
  location: johnLocation,
  progress: 5_000,
  readAt: Schema.decodeSync(Timestamp)('2026-08-16T00:00:00.000Z'),
};

const intersects = (left: readonly string[], right: readonly string[]): boolean => {
  const lookup = new Set(right);
  for (const key of left) {
    if (lookup.has(key)) return true;
  }
  return false;
};

const collectionAreas = ['collections', 'plans', 'practice'] satisfies LibraryStateArea[];

/** One row per (command, cached input) pair: what each layer decides. */
interface Verdict {
  readonly command: string;
  readonly entry: string;
  readonly predicate: boolean;
  readonly keys: boolean;
}

const sweep = (): readonly Verdict[] => {
  const verdicts: Verdict[] = [];
  for (const [command, mutation] of commands) {
    const mutationKeys = keysForLibraryMutation(mutation);
    const scope = scopeForMutation(mutation);
    for (const location of annotationInputs) {
      verdicts.push({
        command,
        entry: `annotations ${location.location}`,
        predicate: annotationsMatches(location, scope),
        keys: intersects(annotationQueryKeys(location), mutationKeys),
      });
    }
    for (const area of collectionAreas) {
      verdicts.push({
        command,
        entry: area,
        predicate: areaMatches(area)({}, scope),
        keys: intersects([libraryAreaKey(area)], mutationKeys),
      });
    }
  }
  return verdicts;
};

describe('reactivity key derivation', () => {
  it.effect('agrees with the retired predicate on every command and cached input', () =>
    Effect.sync(() => {
      const verdicts = sweep();
      const disagreements = verdicts.filter((verdict) => verdict.predicate !== verdict.keys);

      expect(disagreements).toEqual([]);
      // 19 command fixtures x (3 annotation locations + 3 singleton areas).
      expect(verdicts).toHaveLength(114);
      // A derivation that never invalidates would also agree with itself.
      expect(verdicts.filter((verdict) => verdict.keys).length).toBeGreaterThan(0);
    }),
  );

  it.effect('refreshes one annotated location without touching its siblings', () =>
    Effect.sync(() => {
      const keys = keysForLibraryMutation(commandFixtures.SaveNote);

      expect(intersects(annotationQueryKeys(johnLocation), keys)).toBe(true);
      expect(intersects(annotationQueryKeys(romansLocation), keys)).toBe(false);
      expect(intersects(annotationQueryKeys(writingsLocation), keys)).toBe(false);
    }),
  );

  it.effect('refreshes every annotated location when the scope names none', () =>
    Effect.sync(() => {
      const keys = keysForLibraryMutation(commandFixtures.DeleteNote);

      for (const location of annotationInputs) {
        expect(intersects(annotationQueryKeys(location), keys)).toBe(true);
      }
    }),
  );

  it.effect('separates locations that differ only in one field', () =>
    Effect.sync(() => {
      const keys = new Set([
        annotationLocationKey({ source: 'bible', resourceId: 'a', location: 'bc' }),
        annotationLocationKey({ source: 'bible', resourceId: 'ab', location: 'c' }),
        annotationLocationKey({ source: 'egw', resourceId: 'a', location: 'bc' }),
      ]);

      expect(keys.size).toBe(3);
    }),
  );

  it.effect('gives the singleton areas one key each', () =>
    Effect.sync(() => {
      expect(keysForScope({ _tag: 'ReadingPreferences' })).toEqual([READING_PREFERENCES_KEY]);
      expect(keysForScope({ _tag: 'ReadingContinuity' })).toEqual([READING_CONTINUITY_KEY]);
      expect(keysForScope({ _tag: 'WritingsLibrary' })).toEqual([WRITINGS_LIBRARY_KEY]);
    }),
  );

  // -------------------------------------------------------------------------
  // Core's own `ChangeScope`, as the sync engine publishes it.
  //
  // The claim the derivation makes is that a published `ChangeSet` routes
  // through `keysForScope` unchanged. That claim is only testable against
  // core's real scopes, which differ from a look-alike in one way that
  // matters: a `NoteScope` carries a required `noteId` and three *independently
  // optional* strings, not one optional `ReaderLocation`. These cases pin every
  // shape core can emit, including the partial ones a hand-written union could
  // not express.
  // -------------------------------------------------------------------------

  const changeScopes = (command: DomainMutationCommand): readonly ChangeScope[] =>
    changeSetFor(command).scopes;

  it.effect('routes core change scopes to the same keys the local command does', () =>
    Effect.sync(() => {
      for (const [name, command] of commands) {
        const local = keysForLibraryMutation(command);
        const published = changeScopes(command).flatMap(keysForScope);

        expect({ name, keys: published }).toEqual({ name, keys: [...local] });
      }
    }),
  );

  it.effect('routes the two non-library core scopes to their own keys', () =>
    Effect.sync(() => {
      expect(changeScopes(setPreferences).flatMap(keysForScope)).toEqual([READING_PREFERENCES_KEY]);
      expect(changeScopes(recordReading).flatMap(keysForScope)).toEqual([READING_CONTINUITY_KEY]);
    }),
  );

  it.effect('falls back to the whole area when a note scope names a location only in part', () =>
    Effect.sync(() => {
      const complete: ChangeScope = {
        _tag: 'Note',
        noteId: noteId('note:bible:KJV:/bible/43/3/16'),
        source: 'bible',
        resourceId: 'KJV',
        location: '/bible/43/3/16',
      };
      // Each partial omits exactly one of the three location fields; the last
      // omits all three, as a `DeleteNote` does. None can name a
      // `ReaderLocation`, so each must widen to the area key rather than build
      // a key from whatever it has. The fields are *omitted* rather than set
      // to a blank, because `Schema.optional` is what core declares and an
      // absent property is what a decoded scope carries.
      const { source, resourceId, location, ...idOnly } = complete;
      const partials: readonly ChangeScope[] = [
        { ...idOnly, resourceId, location },
        { ...idOnly, source, location },
        { ...idOnly, source, resourceId },
        idOnly,
      ];

      expect(keysForScope(complete)).toEqual([annotationLocationKey(johnLocation)]);
      for (const partial of partials) {
        expect(keysForScope(partial)).toEqual([libraryAreaKey('annotations')]);
      }
    }),
  );
});
