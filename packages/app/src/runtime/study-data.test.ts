/** The study pane's data contract, through the real stack.
 *
 *  The pane component itself cannot be rendered here. Solid 2 has **no runtime
 *  JSX factory** — `@solidjs/web` exports neither `jsx` nor `jsxDEV`, because
 *  the framework compiles JSX with a Babel transform rather than calling a
 *  function at runtime — so mounting a component needs that transform, and the
 *  transform is a dependency. Every suite in this package therefore tests hooks
 *  and pure functions rather than markup; the pane's *decisions* live in
 *  `../reading/study-pane-state.ts` and are asserted beside it.
 *
 *  What *is* testable here is everything the pane's behavior rests on:
 *
 *  - the hooks read through the real `AtomRpc` families and the real Solid
 *    bindings, so the value the pane renders is the value the procedure
 *    returned;
 *  - moving from verse to verse swaps the atom and re-reads, so the pane follows
 *    the route;
 *  - **retained-stale**: an already-resolved read keeps returning its previous
 *    value while a new one is in flight, rather than falling back to `<Loading>`
 *    — the property the pane depends on to not flash a spinner on every verse
 *    tap, and the one that omitting `suspendOnWaiting` buys;
 *  - a failing procedure throws, so the pane's `<Errored>` boundary is reachable;
 *  - the bundle is memoised per reference, so a re-render is not a re-fetch;
 *  - and, over a transport that counts, the pane's *own* traffic: one verse
 *    request on open and one Strong's request per word tap, with nothing else
 *    crossing the wire. The host round-trip suites call the procedure directly,
 *    so a pane that fetched more would pass every one of them.
 *
 *  Structural web/desktop parity needs no test: both hosts render the one
 *  `VerseStudyPane` from this package, so there is no second implementation to
 *  compare. What the hosts genuinely differ in — the wire — is asserted in
 *  `apps/web/src/workers/study-round-trip.test.ts` and
 *  `apps/desktop/tests/study-round-trip.test.ts`.
 */

import { bookNumber, chapterNumber, verseNumber } from '@bible/core/bible';
import { BibleProcedureGroup, ProcedureError } from '@bible/core/procedure';
import {
  StrongsStudy,
  StudyCrossReference,
  StudyMarginNote,
  StudyWord,
  VerseStudy,
  strongsNumber,
} from '@bible/core/study';
import { RegistryContext, useAtomInitialValues } from '@bible/atom-solid';
import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Option, Stream } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import * as AtomRegistry from 'effect/unstable/reactivity/AtomRegistry';
import { createEffect, createRoot, createSignal, flush, resolve, type Accessor } from 'solid-js';

import { procedureClientAtom, type ProcedureClient } from '../cache/reading-rpc.js';
import { resetTrackedQueries } from '../cache/settled-mutation.js';
import { useStrongsStudy, useVerseStudy } from './reading-data.js';

const DANIEL = bookNumber(27);
const CHAPTER_8 = chapterNumber(8);
const VERSE_13 = verseNumber(13);
const VERSE_14 = verseNumber(14);

const bundleFor = (verse: number, text: string): VerseStudy =>
  VerseStudy.make({
    reference: { _tag: 'verse', book: DANIEL, chapter: CHAPTER_8, verse: verseNumber(verse) },
    label: `Daniel 8:${String(verse)}`,
    text: Option.some(text),
    words: [
      StudyWord.make({ text: 'the daily', strongs: [strongsNumber('H8548')], italic: false }),
      StudyWord.make({ text: 'sacrifice', strongs: [], italic: true }),
    ],
    crossRefs: [
      StudyCrossReference.make({
        book: bookNumber(66),
        chapter: chapterNumber(12),
        verse: Option.some(verseNumber(6)),
        verseEnd: Option.none(),
        label: 'Revelation 12:6',
        source: 'openbible',
        preview: Option.none(),
      }),
    ],
    marginNotes: [
      StudyMarginNote.make({
        index: 0,
        kind: 'hebrew',
        phrase: 'the daily',
        text: 'Heb. the continual',
      }),
    ],
    commentary: [],
    // §8.4's common case: the reverse lookup found nothing, and that is a value.
    parallelWritings: [],
    parallelWritingsTotal: 0,
  });

const lexicon = StrongsStudy.make({
  number: strongsNumber('H8548'),
  entry: Option.none(),
  occurrences: [],
  total: 104,
  limit: 50,
});

/** Counts every read the cache actually sends, per procedure and per input. */
interface Recorder {
  readonly counts: Map<string, number>;
  readonly bump: (key: string) => void;
}

const makeRecorder = (): Recorder => {
  const counts = new Map<string, number>();
  return { counts, bump: (key) => counts.set(key, (counts.get(key) ?? 0) + 1) };
};

/** A latch the test opens by hand, so "the read has started" and "the read has
 *  finished" are two moments an assertion can separate. Without it an in-memory
 *  handler resolves inside the same microtask burst, and a pane that *did* flash
 *  its loading state would still look correct. */
interface Gate {
  readonly wait: Effect.Effect<void>;
  readonly open: () => void;
}

const makeGate = (): Gate => {
  const deferred = Deferred.makeUnsafe<void>();
  return { wait: Deferred.await(deferred), open: () => Deferred.doneUnsafe(deferred, Effect.void) };
};

interface HandlerOptions {
  /** Held from the *second* verse read onward: the first must complete for the
   *  query to be a resolved one, which is the precondition retained-stale is
   *  about. */
  readonly secondVerseRead?: Gate;
  /** Every verse read fails, so the pane's `<Errored>` boundary is reachable. */
  readonly failVerse?: boolean;
}

const handlerLayer = (recorder: Recorder, options: HandlerOptions = {}) =>
  BibleProcedureGroup.toLayer(
    Effect.succeed({
      'v1.runtime.connect': () => Effect.die('unused'),
      'v1.runtime.events': () => Stream.empty,
      'v1.reading.bibleChapter.get': () => Effect.die('unused'),
      'v1.reading.bibleChapterMarginAnchors.get': () => Effect.die('unused'),
      'v1.reading.bibleSearch.get': () => Effect.die('unused'),
      'v1.reading.writingsCatalog.get': () => Effect.die('unused'),
      'v1.reading.writingsPage.get': () => Effect.die('unused'),
      'v1.reading.writingsPublication.open': () => Effect.die('unused'),
      'v1.reading.writingsParagraph.get': () => Effect.die('unused'),
      'v1.reading.writingsLibrary.get': () => Effect.die('unused'),
      'v1.reading.writingsPublication.download': () => Effect.die('unused'),
      'v1.reading.writingsLibrary.downloadAll': () => Effect.die('unused'),
      'v1.reading.continuity.get': () => Effect.die('unused'),
      'v1.reading.continuity.record': () => Effect.die('unused'),
      'v1.library.annotations.get': () => Effect.die('unused'),
      'v1.library.collections.get': () => Effect.die('unused'),
      'v1.library.plans.get': () => Effect.die('unused'),
      'v1.library.practice.get': () => Effect.die('unused'),
      'v1.library.mutate': () => Effect.die('unused'),
      'v1.data.export': () => Effect.die('unused'),
      'v1.data.import': () => Effect.die('unused'),
      'v1.topics.list': () => Effect.die('unused'),
      'v1.topics.get': () => Effect.die('unused'),
      'v1.wiki.topic.get': () => Effect.die('unused'),
      'v1.wiki.topics.list': () => Effect.die('unused'),
      'v1.wiki.dictionary.get': () => Effect.die('unused'),
      'v1.preferences.reading.get': () => Effect.die('unused'),
      'v1.preferences.reading.patch': () => Effect.die('unused'),
      'v1.study.verse.get': (input: { readonly verse: number }) =>
        Effect.gen(function* () {
          const key = `verse ${String(input.verse)}`;
          recorder.bump(key);
          if (options.failVerse === true) {
            return yield* ProcedureError.make({
              procedure: 'v1.study.verse.get',
              code: 'StudyUnavailableError',
              message: 'bible.db is unavailable',
            });
          }
          const gate = Option.fromNullishOr(options.secondVerseRead);
          if (Option.isSome(gate) && (recorder.counts.get(key) ?? 0) === 1 && input.verse === 14) {
            yield* gate.value.wait;
          }
          return bundleFor(input.verse, `Text of Daniel 8:${String(input.verse)}`);
        }),
      'v1.study.strongs.get': (input: { readonly number: string }) => {
        recorder.bump(`strongs ${input.number}`);
        return Effect.succeed(lexicon);
      },
    }),
  );

const settle = Effect.gen(function* () {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    yield* Effect.yieldNow;
    flush();
  }
});

/** Mounts the study hooks over a fresh registry, exactly as
 *  `reading-data.test.ts` mounts its own — pointing the context default at the
 *  registry exercises the real lookup path without a JSX provider. */
const mount = (
  procedures: ProcedureClient,
  verse: Accessor<number>,
): {
  readonly bundle: Accessor<VerseStudy>;
  readonly lexicon: Accessor<StrongsStudy>;
  readonly dispose: () => void;
} => {
  const registry = AtomRegistry.make();
  RegistryContext.defaultValue = registry;
  resetTrackedQueries();
  return createRoot((dispose) => {
    useAtomInitialValues([[procedureClientAtom, procedures]]);
    return {
      bundle: useVerseStudy(() => ({
        book: DANIEL,
        chapter: CHAPTER_8,
        verse: verseNumber(verse()),
      })),
      lexicon: useStrongsStudy(() => ({ number: strongsNumber('H8548') })),
      dispose: () => {
        dispose();
        registry.dispose();
      },
    };
  });
};

/** Mounts the hooks **as the pane composes them**, rather than side by side.
 *
 *  The difference is the point of should-fix 6. `mount` above reads both hooks
 *  unconditionally, which is not what the pane does: `StudyBody` reads the verse
 *  bundle, and `StrongsView` — a separate component behind a `<Show>` — reads
 *  the lexicon only once a word has been tapped. A round-trip count taken over
 *  the flat mount therefore cannot see the property the milestone claims, that
 *  the pane makes exactly one request on open and exactly one more per tap.
 *
 *  So this models the pane's own shape: the verse read at the top, the Strong's
 *  read created inside a `createRoot` that only exists while a selection is
 *  some — which is what `<Show>` compiles to. A pane that grew a second fetch
 *  on mount, or that re-read the lexicon on a re-render, moves these counts.
 */
interface MountedPane {
  readonly bundle: Accessor<VerseStudy>;
  /** Taps a word, exactly as `StudyWords`'s chip does. */
  readonly select: (number: string) => void;
  /** The lexicon read, present only while a word is selected. */
  readonly lexicon: () => Option.Option<Accessor<StrongsStudy>>;
  readonly dispose: () => void;
}

const mountPane = (procedures: ProcedureClient, verse: Accessor<number>): MountedPane => {
  const registry = AtomRegistry.make();
  RegistryContext.defaultValue = registry;
  resetTrackedQueries();
  return createRoot((dispose) => {
    useAtomInitialValues([[procedureClientAtom, procedures]]);
    const bundle = useVerseStudy(() => ({
      book: DANIEL,
      chapter: CHAPTER_8,
      verse: verseNumber(verse()),
    }));
    const [selected, setSelected] = createSignal(Option.none<string>());
    let opened = Option.none<{
      readonly read: Accessor<StrongsStudy>;
      readonly dispose: () => void;
    }>();
    // The `<Show>` boundary, by hand: the child owner exists only while a
    // number is selected, so no lexicon atom is created before the first tap.
    createEffect(selected, (current) => {
      if (Option.isSome(opened)) opened.value.dispose();
      opened = Option.none();
      if (Option.isNone(current)) return;
      const number = current.value;
      opened = Option.some(
        createRoot((disposeChild) => ({
          read: useStrongsStudy(() => ({ number: strongsNumber(number) })),
          dispose: disposeChild,
        })),
      );
    });
    return {
      bundle,
      select: (number: string) => setSelected(Option.some(number)),
      lexicon: () => Option.map(opened, (child) => child.read),
      dispose: () => {
        dispose();
        registry.dispose();
      },
    };
  });
};

/** How many requests the transport carried, in total. The per-key counts prove
 *  *which* calls happened; this proves nothing else did. */
const totalRequests = (recorder: Recorder): number =>
  [...recorder.counts.values()].reduce((sum, count) => sum + count, 0);

describe('study pane round trips', () => {
  const test = it.scoped;

  test('mounting the pane sends exactly one verse request and nothing else', () =>
    Effect.gen(function* () {
      // Should-fix 6. §8.2's claim is that the whole bundle — all five sections
      // — crosses the wire in *one* round trip, and the existing round-trip
      // tests call the procedure directly, so a pane that quietly fetched a
      // sixth thing on mount would pass all of them.
      const recorder = makeRecorder();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(Effect.provide(handlerLayer(recorder)));
      const [verse] = createSignal(Number(VERSE_13));
      const mounted = mountPane(procedures, verse);
      yield* Effect.addFinalizer(() => Effect.sync(mounted.dispose));

      yield* Effect.promise(() => resolve(mounted.bundle));
      yield* settle;

      expect(recorder.counts.get('verse 13')).toBe(1);
      // And no Strong's request: the lexicon read lives inside the drill-down,
      // which no reader has opened yet.
      expect(recorder.counts.get('strongs H8548')).toBeUndefined();
      expect(totalRequests(recorder)).toBe(1);
    }));

  test('tapping a word sends exactly one Strong’s request', () =>
    Effect.gen(function* () {
      const recorder = makeRecorder();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(Effect.provide(handlerLayer(recorder)));
      const [verse] = createSignal(Number(VERSE_13));
      const mounted = mountPane(procedures, verse);
      yield* Effect.addFinalizer(() => Effect.sync(mounted.dispose));

      yield* Effect.promise(() => resolve(mounted.bundle));
      yield* settle;

      mounted.select('H8548');
      yield* settle;
      const read = Option.getOrThrow(mounted.lexicon());
      yield* Effect.promise(() => resolve(read));
      yield* settle;

      expect(recorder.counts.get('strongs H8548')).toBe(1);
      // Two requests in total across the whole interaction: the bundle, and the
      // one word the reader tapped.
      expect(totalRequests(recorder)).toBe(2);
    }));

  test('the verse bundle is not re-fetched when a word is tapped', () =>
    Effect.gen(function* () {
      // The drill-down is a separate suspense boundary precisely so opening a
      // word does not re-suspend — or re-request — the five sections already on
      // screen.
      const recorder = makeRecorder();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(Effect.provide(handlerLayer(recorder)));
      const [verse] = createSignal(Number(VERSE_13));
      const mounted = mountPane(procedures, verse);
      yield* Effect.addFinalizer(() => Effect.sync(mounted.dispose));

      yield* Effect.promise(() => resolve(mounted.bundle));
      yield* settle;
      mounted.select('H8548');
      yield* settle;
      yield* Effect.promise(() => resolve(Option.getOrThrow(mounted.lexicon())));
      yield* settle;

      expect(recorder.counts.get('verse 13')).toBe(1);
    }));
});

describe('study pane data', () => {
  const test = it.scoped;

  test('reads the whole bundle the procedure returned', () =>
    Effect.gen(function* () {
      const recorder = makeRecorder();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(Effect.provide(handlerLayer(recorder)));
      const [verse] = createSignal(Number(VERSE_13));
      const mounted = mount(procedures, verse);
      yield* Effect.addFinalizer(() => Effect.sync(mounted.dispose));

      const bundle = yield* Effect.promise(() => resolve(mounted.bundle));
      // All five sections arrive together, including the two that are empty —
      // the pane renders "no citations" from a value, not from a missing field.
      expect(bundle.label).toBe('Daniel 8:13');
      expect(bundle.words.length).toBe(2);
      expect(bundle.crossRefs.length).toBe(1);
      expect(bundle.marginNotes.length).toBe(1);
      expect(bundle.commentary).toEqual([]);
      expect(bundle.parallelWritings).toEqual([]);
      expect(bundle.parallelWritingsTotal).toBe(0);
    }));

  test('follows the route: a new verse swaps the atom and re-reads', () =>
    Effect.gen(function* () {
      const recorder = makeRecorder();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(Effect.provide(handlerLayer(recorder)));
      const [verse, setVerse] = createSignal(Number(VERSE_13));
      const mounted = mount(procedures, verse);
      yield* Effect.addFinalizer(() => Effect.sync(mounted.dispose));

      expect((yield* Effect.promise(() => resolve(mounted.bundle))).label).toBe('Daniel 8:13');
      yield* settle;

      setVerse(Number(VERSE_14));
      expect((yield* Effect.promise(() => resolve(mounted.bundle))).label).toBe('Daniel 8:14');
      yield* settle;

      expect(recorder.counts.get('verse 13')).toBe(1);
      expect(recorder.counts.get('verse 14')).toBe(1);
    }));

  test('keeps the resolved bundle while the next verse is in flight', () =>
    Effect.gen(function* () {
      // The retained-stale property. With `suspendOnWaiting` set, the accessor
      // would return an unresolved promise here and the pane would fall back to
      // `<Loading>` on every verse tap; omitting it — which every read in this
      // package does — keeps the previous bundle on screen.
      const recorder = makeRecorder();
      const gate = makeGate();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(Effect.provide(handlerLayer(recorder, { secondVerseRead: gate })));
      const [verse, setVerse] = createSignal(Number(VERSE_13));
      const mounted = mount(procedures, verse);
      yield* Effect.addFinalizer(() => Effect.sync(mounted.dispose));

      expect((yield* Effect.promise(() => resolve(mounted.bundle))).label).toBe('Daniel 8:13');
      yield* settle;

      // Verse 14's read is now held open by the gate.
      setVerse(Number(VERSE_14));
      yield* settle;
      expect(recorder.counts.get('verse 14')).toBe(1);

      // And the pane still has verse 13's bundle to draw, rather than nothing.
      const retained = mounted.bundle();
      expect(retained.label).toBe('Daniel 8:13');

      gate.open();
      yield* settle;
      expect((yield* Effect.promise(() => resolve(mounted.bundle))).label).toBe('Daniel 8:14');
    }));

  test('memoises per reference, so a re-read is not a re-fetch', () =>
    Effect.gen(function* () {
      const recorder = makeRecorder();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(Effect.provide(handlerLayer(recorder)));
      const [verse] = createSignal(Number(VERSE_13));
      const mounted = mount(procedures, verse);
      yield* Effect.addFinalizer(() => Effect.sync(mounted.dispose));

      yield* Effect.promise(() => resolve(mounted.bundle));
      yield* Effect.promise(() => resolve(mounted.bundle));
      yield* settle;
      expect(recorder.counts.get('verse 13')).toBe(1);
    }));

  test("reads the Strong's payload with its uncapped total", () =>
    Effect.gen(function* () {
      const recorder = makeRecorder();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(Effect.provide(handlerLayer(recorder)));
      const [verse] = createSignal(Number(VERSE_13));
      const mounted = mount(procedures, verse);
      yield* Effect.addFinalizer(() => Effect.sync(mounted.dispose));

      const result = yield* Effect.promise(() => resolve(mounted.lexicon));
      // `total` exceeding the cap is what the pane's "showing the first N"
      // affordance keys on.
      expect(result.total).toBe(104);
      expect(result.limit).toBe(50);
      expect(recorder.counts.get('strongs H8548')).toBe(1);
    }));

  test('throws a failing read, so the pane Errored boundary is reachable', () =>
    Effect.gen(function* () {
      const recorder = makeRecorder();
      const procedures: ProcedureClient = yield* RpcTest.makeClient(BibleProcedureGroup, {
        flatten: true,
      }).pipe(Effect.provide(handlerLayer(recorder, { failVerse: true })));
      const [verse] = createSignal(Number(VERSE_13));
      const mounted = mount(procedures, verse);
      yield* Effect.addFinalizer(() => Effect.sync(mounted.dispose));

      const outcome = yield* Effect.promise(() =>
        resolve(mounted.bundle).then(
          () => 'resolved',
          (cause: unknown) => String(cause),
        ),
      );
      // A thrown cause is what `<Errored>` catches; a resolved value would mean
      // the pane silently rendered an empty study.
      expect(outcome).not.toBe('resolved');
      expect(outcome).toContain('bible.db is unavailable');
    }));
});
