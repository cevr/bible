/** The vector artifact's lifecycle: when it is read, what a read failure means,
 *  and what a defect means.
 *
 *  Three properties that are invisible to a result-shaped assertion, because
 *  each is about *how* the answer was reached rather than what it was. A search
 *  that reparses a 246 MB index on every keystroke returns the right rows; so
 *  does one that reports a cancelled fiber as "no index installed". Both are
 *  bugs, and only a test that counts reads or inspects the failure channel can
 *  see them.
 */

import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, Exit, FileSystem, Layer, Option, Ref } from 'effect';

import { QueryEmbedder } from './embedder.js';
import {
  goldenSearchSources,
  goldenVector,
  goldenVectorIndexBytes,
  GOLDEN_QUERIES,
} from './golden-fixture.js';
import { SearchQuery } from './model.js';
import { SearchService } from './service.js';
import { VectorIndexBytes } from './vector-artifact.js';
import { layerFileVectorIndexBytes } from './vector-bytes-fs.js';
import { MODEL_FINGERPRINT } from './vector-index.js';

const embedder = Layer.succeed(
  QueryEmbedder,
  QueryEmbedder.of({
    fingerprint: MODEL_FINGERPRINT,
    embedQuery: (query: string) => Effect.succeed(goldenVector(query)),
    embedDocument: (text: string) => Effect.succeed(goldenVector(text)),
  }),
);

const query = (text: string) =>
  SearchQuery.make({
    text,
    scope: Option.none(),
    bookCode: Option.none(),
    limit: Option.none(),
  });

/** How many times the counting byte source below was read.
 *
 *  Its own service, so the layer that counts and the test that asserts share
 *  one `Ref` while the whole graph is still built once, at the test boundary. */
class ReadCount extends Context.Service<ReadCount, Ref.Ref<number>>()(
  '@bible/core/search/test/ReadCount',
) {
  static readonly Live: Layer.Layer<ReadCount> = Layer.effect(ReadCount, Ref.make(0));
}

/** A byte source that counts its own reads. The index bytes are the same every
 *  time, so no result assertion could tell one read from twenty — the count is
 *  the only observable that distinguishes a scoped resource from a per-query
 *  parse. */
const countingBytes: Layer.Layer<VectorIndexBytes, never, ReadCount> = Layer.effect(
  VectorIndexBytes,
  Effect.gen(function* () {
    const reads = yield* ReadCount;
    const bytes = goldenVectorIndexBytes();
    return VectorIndexBytes.of({
      read: Ref.update(reads, (count) => count + 1).pipe(Effect.as(Option.some(bytes))),
    });
  }),
);

/** `SearchService.Live` directly, not `goldenSearchLayer`: the fixture builder
 *  supplies its own `VectorIndexBytes` from the `index` argument, which would
 *  shadow the counting source and make this test read zero. */
const countingSearch: Layer.Layer<SearchService | ReadCount> = SearchService.Live.pipe(
  Layer.provide(goldenSearchSources),
  Layer.provide(countingBytes),
  Layer.provide(embedder),
  Layer.provideMerge(ReadCount.Live),
);

describe('§9.6 the index is read once, not once per query', () => {
  it.scopedLive('parses the artifact at layer start and never again', () =>
    Effect.gen(function* () {
      const service = yield* SearchService;
      const reads = yield* ReadCount;
      // Every golden query, plus repeats: a per-query read would climb with
      // each one.
      for (const golden of GOLDEN_QUERIES) {
        yield* service.query(golden.query);
      }
      yield* service.query(query('the sanctuary'));
      yield* service.query(query('the daily'));

      expect(yield* Ref.get(reads)).toBe(1);
    }).pipe(Effect.provide(countingSearch)),
  );
});

describe('§6.5 the filesystem reader degrades on faults and not on defects', () => {
  /** A `FileSystem` whose `exists` dies rather than failing. */
  const dyingFileSystem = Layer.succeed(
    FileSystem.FileSystem,
    FileSystem.makeNoop({ exists: () => Effect.die(new Error('stat blew up')) }),
  );

  /** A `FileSystem` whose `readFile` dies, with the file reported present. */
  const dyingRead = Layer.succeed(
    FileSystem.FileSystem,
    FileSystem.makeNoop({
      exists: () => Effect.succeed(true),
      readFile: () => Effect.die(new Error('read blew up')),
    }),
  );

  // The supported state, and the baseline the two defect tests below are
  // read against: absence must still reach the reader as `None`.
  const missing = Layer.succeed(
    FileSystem.FileSystem,
    FileSystem.makeNoop({ exists: () => Effect.succeed(false) }),
  );

  it.scopedLive('reports a missing file as an absent index', () =>
    Effect.gen(function* () {
      const source = yield* VectorIndexBytes;
      const bytes = yield* source.read;
      expect(Option.isNone(bytes)).toBe(true);
    }).pipe(
      Effect.provide(
        layerFileVectorIndexBytes('/nowhere/vectors.bvi').pipe(Layer.provide(missing)),
      ),
    ),
  );

  it.scopedLive('lets a defect in the stat propagate', () =>
    Effect.gen(function* () {
      // `catchCause` swallowed this and answered `None`, which reports a broken
      // platform layer as "the index was never installed" — an absence the
      // operator would try to fix by installing an index that is already there.
      const outcome = yield* Effect.exit(Effect.flatMap(VectorIndexBytes, (source) => source.read));
      expect(Exit.isFailure(outcome)).toBe(true);
    }).pipe(
      Effect.provide(
        layerFileVectorIndexBytes('/nowhere/vectors.bvi').pipe(Layer.provide(dyingFileSystem)),
      ),
    ),
  );

  it.scopedLive('lets a defect in the read propagate', () =>
    Effect.gen(function* () {
      const outcome = yield* Effect.exit(Effect.flatMap(VectorIndexBytes, (source) => source.read));
      expect(Exit.isFailure(outcome)).toBe(true);
    }).pipe(
      Effect.provide(
        layerFileVectorIndexBytes('/nowhere/vectors.bvi').pipe(Layer.provide(dyingRead)),
      ),
    ),
  );
});
