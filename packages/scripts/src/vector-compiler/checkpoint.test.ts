/** The resumable embed loop: crash, resume, and byte-identical completion.
 *
 *  The stub embedder is deterministic (each text embeds to a vector derived
 *  from its own characters), so "the resumed run produced the same index as a
 *  single uninterrupted pass" is checkable byte for byte — which is the whole
 *  claim resumability makes.
 *
 *  One embedder layer serves every test, provided once at each test's
 *  boundary; what varies mid-test is its *budget*, a mutable cell the tests
 *  refill. A fresh layer per call would need `Effect.provide` inside the test
 *  body, which is exactly the provisioning-at-the-boundary rule this repo
 *  lints for.
 */

import { describe, expect, it } from 'bun:test';
import { DIMENSIONS, QueryEmbedder, QueryEmbedderUnavailable } from '@bible/core/search';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Layer, Option } from 'effect';

import { checkpointPath, clearCheckpoint, embedAllResumable, partPath } from './checkpoint.js';
import type { VectorSourceRow } from './emit.js';

const row = (bookCode: string, refcode: string, text: string, paraId: string): VectorSourceRow => ({
  bookCode,
  refcode,
  text,
  paraId,
});

const ROWS: readonly VectorSourceRow[] = Array.from({ length: 1200 }, (_, index) =>
  row('GC', `GC ${String(index + 1)}.1`, `paragraph number ${String(index)}`, `${String(index)}.1`),
);

/** Deterministic per-text vector: byte i is a function of the text and i. */
const vectorFor = (text: string): Int8Array => {
  const out = new Int8Array(DIMENSIONS);
  let seed = 0;
  for (const unit of text) seed = (seed * 31 + unit.charCodeAt(0)) % 251;
  for (let axis = 0; axis < DIMENSIONS; axis += 1) out[axis] = ((seed + axis) % 251) - 125;
  return out;
};

/** Embeds remaining before the stub starts failing; None means unlimited.
 *  A module-level cell rather than a per-layer parameter so one layer serves
 *  every test — see the header. Tests run sequentially and each sets it. */
const budget = { remaining: Option.none<number>() };

const spend = (): Effect.Effect<void, QueryEmbedderUnavailable> =>
  Effect.suspend(() =>
    Option.match(budget.remaining, {
      onNone: () => Effect.void,
      onSome: (left) => {
        if (left <= 0) {
          return Effect.fail(
            QueryEmbedderUnavailable.make({ adapter: 'stub', reason: 'budget spent' }),
          );
        }
        budget.remaining = Option.some(left - 1);
        return Effect.void;
      },
    }),
  );

const embedderLayer: Layer.Layer<QueryEmbedder> = Layer.succeed(
  QueryEmbedder,
  QueryEmbedder.of({
    fingerprint: 'stub',
    embedQuery: (query) => Effect.succeed(vectorFor(query)),
    embedDocument: (text) => spend().pipe(Effect.map(() => vectorFor(text))),
  }),
);

const testLayer = Layer.mergeAll(embedderLayer, BunServices.layer);

describe('resumable vector embedding', () => {
  it('resumes after a mid-run failure and produces the single-pass bytes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const out = `${dir}/vectors.bvi`;

      // Pass 1: dies after 700 embeds — past the first 500-row flush, inside
      // the second window, so the checkpoint records 500 and the tail of the
      // second window is lost work.
      budget.remaining = Option.some(700);
      const first = yield* embedAllResumable(ROWS, out).pipe(Effect.exit);
      expect(first._tag).toBe('Failure');
      expect(yield* fs.exists(partPath(out))).toBe(true);
      expect(yield* fs.exists(checkpointPath(out))).toBe(true);
      const partial = yield* fs.stat(partPath(out));
      expect(partial.size).toBe(BigInt(500 * DIMENSIONS));

      // Pass 2 must complete from row 500, not row 0 — the budget proves it:
      // finishing needs 700 embeds and a from-scratch pass would need 1200,
      // which this refill cannot cover.
      budget.remaining = Option.some(701);
      const resumed = yield* embedAllResumable(ROWS, out);

      budget.remaining = Option.none();
      const single = yield* embedAllResumable(ROWS, `${dir}/single.bvi`);
      expect(resumed.length).toBe(single.length);
      expect(Buffer.from(resumed).equals(Buffer.from(single))).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise));

  it('truncates the unaccounted tail written after the last checkpoint', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const out = `${dir}/vectors.bvi`;

      budget.remaining = Option.some(700);
      const first = yield* embedAllResumable(ROWS, out).pipe(Effect.exit);
      expect(first._tag).toBe('Failure');

      // Simulate the append-then-crash window: bytes beyond what the
      // checkpoint accounts for.
      yield* Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* fs.open(partPath(out), { flag: 'a' });
          yield* handle.writeAll(new Uint8Array(37));
        }),
      );

      budget.remaining = Option.none();
      const resumed = yield* embedAllResumable(ROWS, out);
      const single = yield* embedAllResumable(ROWS, `${dir}/single.bvi`);
      expect(Buffer.from(resumed).equals(Buffer.from(single))).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise));

  it('starts over when the checkpoint does not match the source order', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const out = `${dir}/vectors.bvi`;

      budget.remaining = Option.some(700);
      const first = yield* embedAllResumable(ROWS, out).pipe(Effect.exit);
      expect(first._tag).toBe('Failure');

      // A different source in the same order slot: the recorded identity no
      // longer matches, so resuming would splice two corpora. The unlimited
      // budget lets the full restart run to completion.
      budget.remaining = Option.none();
      const reordered = [...ROWS.slice(600), ...ROWS.slice(0, 600)];
      const resumed = yield* embedAllResumable(reordered, out);
      expect(resumed.length).toBe(reordered.length * DIMENSIONS);
      const single = yield* embedAllResumable(reordered, `${dir}/single.bvi`);
      expect(Buffer.from(resumed).equals(Buffer.from(single))).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise));

  it('clears its working files once the artifact is written', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const out = `${dir}/vectors.bvi`;

      budget.remaining = Option.none();
      yield* embedAllResumable(ROWS.slice(0, 10), out);
      yield* clearCheckpoint(out);
      expect(yield* fs.exists(partPath(out))).toBe(false);
      expect(yield* fs.exists(checkpointPath(out))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise));
});
