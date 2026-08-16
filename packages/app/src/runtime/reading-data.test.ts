/**
 * End-to-end proof that the reading cache behaves through the real stack:
 * an in-memory RPC server, the `AtomRpc` families, the Solid bindings, and
 * the derived reactivity keys.
 *
 * The unit proof in `../cache/reactivity-keys.test.ts` shows the derived key
 * sets decide what the retired predicate decided. This suite shows the keys
 * are actually wired: a mutation refreshes the queries whose keys it touches
 * and leaves the others alone, per-input memoisation holds, and the value a
 * component reads is the value the procedure returned.
 */

import { CommitId, BibleProcedureGroup } from '@bible/core/procedure';
import { LibraryEntityId, type ReaderLocation } from '@bible/core/library-state';
import { NoteId } from '@bible/core/local-first';
import { DEFAULT_READING_PREFERENCES } from '@bible/core/reading-preferences';
import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Option, Schema, Stream } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import * as AtomRegistry from 'effect/unstable/reactivity/AtomRegistry';
import { RegistryContext, useAtomInitialValues } from '@bible/atom-solid';
import { createRoot, flush, resolve, type Accessor } from 'solid-js';

import { procedureClientAtom, type ProcedureClient } from '../cache/reading-rpc.js';
import { resetTrackedQueries } from '../cache/settled-mutation.js';
import {
  useCollections,
  useLibraryMutation,
  useLocationAnnotations,
  useMemoryPractice,
  useReadingContinuity,
  useReadingPlans,
  useReadingPreferences,
  useWritingsLibrary,
} from './reading-data.js';

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

const emptyAnnotations = { bookmarks: [], notes: [], markers: [], crossReferences: [] };

const testCommitId = Schema.decodeSync(CommitId)('test-commit');
const johnNoteId = Schema.decodeSync(NoteId)('note:bible:KJV:/bible/43/3/16');
const studyCollectionId = Schema.decodeSync(LibraryEntityId)('collection:study');

/** Counts every read the cache actually sends, per procedure and per input. */
interface Recorder {
  readonly counts: Map<string, number>;
  readonly bump: (key: string) => void;
}

const makeRecorder = (): Recorder => {
  const counts = new Map<string, number>();
  return {
    counts,
    bump: (key) => counts.set(key, (counts.get(key) ?? 0) + 1),
  };
};

/**
 * A latch the test opens by hand, used to hold a query's refresh in flight for
 * as long as the assertion needs.
 *
 * A `Deferred` the handler awaits is what turns "the refresh has started" and
 * "the refresh has finished" into two moments the test can separate. Without
 * it, an in-memory handler completes within the same microtask burst as the
 * mutation and a mutation promise that resolved too early would still look
 * correct.
 */
interface Gate {
  readonly wait: Effect.Effect<void>;
  readonly open: () => void;
}

const makeGate = (): Gate => {
  const deferred = Deferred.makeUnsafe<void>();
  return {
    wait: Deferred.await(deferred),
    open: () => Deferred.doneUnsafe(deferred, Effect.void),
  };
};

/**
 * Which handler a gate holds.
 *
 * `refresh` holds the collections read from its *second* call onward: the first
 * read has to complete for the query to be an active one, which is the
 * precondition the mutation contract is about. `mutation` holds the mutation
 * RPC itself, which is what opens a window for a query to mount *while* the
 * mutation is in flight.
 */
interface Gates {
  readonly refresh?: Gate;
  readonly mutation?: Gate;
}

/** The handlers, optionally with the collections read or the mutation gated. */
const handlerLayer = (recorder: Recorder, gates: Gates = {}) =>
  BibleProcedureGroup.toLayer(
    Effect.succeed({
      'v1.runtime.connect': () => Effect.die('unused'),
      'v1.runtime.events': () => Stream.empty,
      'v1.reading.bibleChapter.get': () => Effect.die('unused'),
      'v1.reading.bibleSearch.get': () => Effect.die('unused'),
      'v1.reading.writingsCatalog.get': () => Effect.die('unused'),
      'v1.reading.writingsPage.get': () => Effect.die('unused'),
      'v1.reading.writingsPublication.open': () => Effect.die('unused'),
      'v1.reading.writingsParagraph.get': () => Effect.die('unused'),
      'v1.reading.writingsLibrary.get': () =>
        Effect.sync(() => {
          recorder.bump('writingsLibrary');
          return [];
        }),
      'v1.reading.writingsPublication.download': () => Effect.die('unused'),
      'v1.reading.writingsLibrary.downloadAll': () => Effect.die('unused'),
      'v1.reading.continuity.get': () =>
        Effect.sync(() => {
          recorder.bump('continuity');
          // The procedure answers an absent location as `null`; the hook maps
          // it back to `Option.none()`.
          return Option.getOrNull(Option.none<ReaderLocation>());
        }),
      'v1.reading.continuity.record': () => Effect.die('unused'),
      'v1.preferences.reading.get': () =>
        Effect.sync(() => {
          recorder.bump('preferences');
          return DEFAULT_READING_PREFERENCES;
        }),
      'v1.preferences.reading.patch': () => Effect.die('unused'),
      'v1.library.annotations.get': (input: ReaderLocation) =>
        Effect.sync(() => {
          recorder.bump(`annotations ${input.location}`);
          return emptyAnnotations;
        }),
      'v1.library.collections.get': () =>
        Effect.gen(function* () {
          recorder.bump('collections');
          const call = Option.getOrElse(
            Option.fromNullishOr(recorder.counts.get('collections')),
            () => 0,
          );
          const gate = Option.fromNullishOr(gates.refresh);
          if (Option.isSome(gate) && call > 1) yield* gate.value.wait;
          return [];
        }),
      'v1.library.plans.get': () =>
        Effect.sync(() => {
          recorder.bump('plans');
          return [];
        }),
      'v1.library.practice.get': () =>
        Effect.sync(() => {
          recorder.bump('practice');
          return { verses: [], history: [] };
        }),
      'v1.library.mutate': () =>
        Effect.gen(function* () {
          recorder.bump('mutate');
          const gate = Option.fromNullishOr(gates.mutation);
          if (Option.isSome(gate)) yield* gate.value.wait;
          return {
            _tag: 'MutationCommit' as const,
            value: {},
            commitId: testCommitId,
            changes: { scopes: [] },
          };
        }),
      'v1.data.export': () => Effect.die('unused'),
      'v1.data.import': () => Effect.die('unused'),
      'v1.topics.list': () => Effect.die('unused'),
      'v1.topics.get': () => Effect.die('unused'),
    }),
  );

/**
 * Runs the reading hooks inside a Solid root against a registry of its own,
 * seeded with the procedure client.
 *
 * The hooks resolve their registry through `RegistryContext`, so pointing the
 * context default at a fresh registry exercises the real lookup path.
 * `ReadingDataProvider` is not mounted here for the reason its neighbouring
 * binding tests give: a provider is a component, and the bun test environment
 * compiles no JSX runtime. The provider contributes only the registry and this
 * same seeding call.
 */
const startSession = (procedures: ProcedureClient): AtomRegistry.AtomRegistry => {
  const registry = AtomRegistry.make();
  RegistryContext.defaultValue = registry;
  // The query index is module-global, matching the atom families it points at.
  // Clearing it per mount keeps one test's atoms from being waited on by the
  // next test's mutation, in a registry that never held them.
  resetTrackedQueries();
  createRoot(() => {
    useAtomInitialValues([[procedureClientAtom, procedures]]);
  });
  return registry;
};

const mount = (procedures: ProcedureClient) => {
  const registry = AtomRegistry.make();
  RegistryContext.defaultValue = registry;
  resetTrackedQueries();
  return createRoot((dispose) => {
    useAtomInitialValues([[procedureClientAtom, procedures]]);
    return {
      probe: {
        john: useLocationAnnotations(() => johnLocation),
        romans: useLocationAnnotations(() => romansLocation),
        collections: useCollections(),
        plans: useReadingPlans(),
        mutate: useLibraryMutation(),
      },
      dispose: () => {
        dispose();
        registry.dispose();
      },
    };
  });
};

const settle = Effect.gen(function* () {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    yield* Effect.yieldNow;
    flush();
  }
});

describe('reading data', () => {
  const test = it.scoped;

  test('reads through the cache and refreshes only the keys a mutation touches', () =>
    Effect.gen(function* () {
      const recorder = makeRecorder();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(Effect.provide(handlerLayer(recorder)));

      const mounted = mount(procedures);
      yield* Effect.addFinalizer(() => Effect.sync(mounted.dispose));

      // Every read resolves to the procedure's value.
      expect(yield* Effect.promise(() => resolve(mounted.probe.john))).toEqual(emptyAnnotations);
      expect(yield* Effect.promise(() => resolve(mounted.probe.romans))).toEqual(emptyAnnotations);
      expect(yield* Effect.promise(() => resolve(mounted.probe.collections))).toEqual([]);
      expect(yield* Effect.promise(() => resolve(mounted.probe.plans))).toEqual([]);
      yield* settle;

      expect(recorder.counts.get(`annotations ${johnLocation.location}`)).toBe(1);
      expect(recorder.counts.get(`annotations ${romansLocation.location}`)).toBe(1);
      expect(recorder.counts.get('collections')).toBe(1);
      expect(recorder.counts.get('plans')).toBe(1);

      // A note saved at one location refreshes that location alone.
      yield* Effect.promise(() =>
        mounted.probe.mutate({
          _tag: 'SaveNote',
          noteId: johnNoteId,
          source: 'bible',
          resourceId: 'KJV',
          location: '/bible/43/3/16',
          content: 'the love of God',
        }),
      );
      yield* settle;

      expect(recorder.counts.get(`annotations ${johnLocation.location}`)).toBe(2);
      expect(recorder.counts.get(`annotations ${romansLocation.location}`)).toBe(1);
      expect(recorder.counts.get('collections')).toBe(1);
      expect(recorder.counts.get('plans')).toBe(1);

      // A collection change refreshes collections and nothing else.
      yield* Effect.promise(() =>
        mounted.probe.mutate({
          _tag: 'SaveCollection',
          id: studyCollectionId,
          name: 'Study',
          description: Option.getOrNull(Option.none()),
        }),
      );
      yield* settle;

      expect(recorder.counts.get('collections')).toBe(2);
      expect(recorder.counts.get('plans')).toBe(1);
      expect(recorder.counts.get(`annotations ${johnLocation.location}`)).toBe(2);
      expect(recorder.counts.get(`annotations ${romansLocation.location}`)).toBe(1);
    }));

  test('holds a mutation promise open until the queries it staled have refreshed', () =>
    Effect.gen(function* () {
      const recorder = makeRecorder();
      const gate = makeGate();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(Effect.provide(handlerLayer(recorder, { refresh: gate })));

      const mounted = mount(procedures);
      yield* Effect.addFinalizer(() => Effect.sync(mounted.dispose));

      // The collections query has to be active before the contract applies.
      expect(yield* Effect.promise(() => resolve(mounted.probe.collections))).toEqual([]);
      yield* settle;
      expect(recorder.counts.get('collections')).toBe(1);

      // The mutation's refresh of collections now blocks on the gate.
      let settled = false;
      const mutation = mounted.probe
        .mutate({
          _tag: 'SaveCollection',
          id: studyCollectionId,
          name: 'Study',
          description: Option.getOrNull(Option.none()),
        })
        .then((value) => {
          settled = true;
          return value;
        });
      yield* settle;

      // The RPC itself has long since answered — `mutate` was recorded and the
      // refresh has been issued — yet the promise must still be pending,
      // because the refresh it triggered has not produced a result.
      expect(recorder.counts.get('mutate')).toBe(1);
      expect(recorder.counts.get('collections')).toBe(2);
      expect(settled).toBe(false);

      // Releasing the refresh is what lets the mutation resolve.
      gate.open();
      yield* Effect.promise(() => mutation);
      expect(settled).toBe(true);
    }));

  // The wait set has to be read after the mutation, not before it: a route
  // that mounts while the RPC is in flight is a reader `Reactivity` will stale
  // but a pre-collected set could never name.
  test('waits for a query that mounted while the mutation was still in flight', () =>
    Effect.gen(function* () {
      const recorder = makeRecorder();
      const mutationGate = makeGate();
      const refreshGate = makeGate();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(
        Effect.provide(handlerLayer(recorder, { mutation: mutationGate, refresh: refreshGate })),
      );

      // A session with no collections reader, so the affected set is empty at
      // mutation-start and only a post-mutation collection can find the query.
      const registry = startSession(procedures);
      yield* Effect.addFinalizer(() => Effect.sync(() => registry.dispose()));
      const caller = createRoot((dispose) => ({ mutate: useLibraryMutation(), dispose }));
      yield* Effect.addFinalizer(() => Effect.sync(caller.dispose));
      expect(recorder.counts.get('collections')).toBeUndefined();

      let settledFlag = false;
      const mutation = caller
        .mutate({
          _tag: 'SaveCollection',
          id: studyCollectionId,
          name: 'Study',
          description: Option.getOrNull(Option.none()),
        })
        .then((value) => {
          settledFlag = true;
          return value;
        });
      yield* settle;
      expect(recorder.counts.get('mutate')).toBe(1);

      // A route mounts the collections reader while the RPC is still gated.
      const route = createRoot((dispose) => ({ collections: useCollections(), dispose }));
      yield* Effect.addFinalizer(() => Effect.sync(route.dispose));
      expect(yield* Effect.promise(() => resolve(route.collections))).toEqual([]);
      yield* settle;
      expect(recorder.counts.get('collections')).toBe(1);

      // Releasing the mutation lets `Reactivity` stale that late reader. Its
      // refresh is the second collections call, which the refresh gate holds.
      mutationGate.open();
      yield* settle;
      expect(recorder.counts.get('collections')).toBe(2);
      expect(settledFlag).toBe(false);

      refreshGate.open();
      yield* Effect.promise(() => mutation);
      expect(settledFlag).toBe(true);
    }));

  /**
   * The six library-wide reads the ADR says all carry an infinite TTL, each
   * paired with the recorder key its handler bumps.
   *
   * The retention proof is one shape repeated six times, so it is written once
   * and driven from this table: a hook the table forgets is a hook the policy
   * silently stops covering, which is exactly the drift that let continuity
   * ship without its TTL.
   */
  const libraryReads: readonly {
    readonly name: string;
    readonly counter: string;
    readonly read: () => Accessor<unknown>;
  }[] = [
    { name: 'collections', counter: 'collections', read: useCollections },
    { name: 'plans', counter: 'plans', read: useReadingPlans },
    { name: 'practice', counter: 'practice', read: useMemoryPractice },
    { name: 'preferences', counter: 'preferences', read: useReadingPreferences },
    { name: 'continuity', counter: 'continuity', read: useReadingContinuity },
    { name: 'writings library', counter: 'writingsLibrary', read: useWritingsLibrary },
  ];

  // The registry evicts idle nodes on real `setTimeout`s, so these cases need
  // the live clock: a `TestClock.adjust` would move Effect's own time while
  // the registry's sweep timer stayed put.
  for (const { name, counter, read } of libraryReads) {
    it.scopedLive(`keeps the ${name} query cached across a route change`, () =>
      Effect.gen(function* () {
        const recorder = makeRecorder();
        const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
          flatten: true,
        }).pipe(Effect.provide(handlerLayer(recorder)));

        // One session registry, carrying the provider's own 400ms idle default;
        // the short sweep resolution only keeps the test's wait short.
        const session = AtomRegistry.make({ defaultIdleTTL: 400, timeoutResolution: 10 });
        RegistryContext.defaultValue = session;
        resetTrackedQueries();
        yield* Effect.sync(() =>
          createRoot(() => {
            useAtomInitialValues([[procedureClientAtom, procedures]]);
          }),
        );
        yield* Effect.addFinalizer(() => Effect.sync(() => session.dispose()));

        // A route mounts a reader, reads once, then unmounts — which is the
        // moment the entry becomes idle and the TTL starts to matter.
        const route = createRoot((dispose) => ({ value: read(), dispose }));
        yield* Effect.promise(() => resolve(route.value));
        yield* settle;
        expect(recorder.counts.get(counter)).toBe(1);
        route.dispose();
        yield* settle;

        // Idle for longer than the default TTL.
        yield* Effect.sleep('700 millis');
        yield* settle;

        // Navigating back must not re-fetch: the entry survives idleness for as
        // long as the session owns the registry, as the retired cache's
        // owner-lifetime entries did.
        const revisit = createRoot((dispose) => ({ value: read(), dispose }));
        yield* Effect.addFinalizer(() => Effect.sync(revisit.dispose));
        yield* Effect.promise(() => resolve(revisit.value));
        yield* settle;
        expect(recorder.counts.get(counter)).toBe(1);
      }),
    );
  }
});
