/**
 * The copy job against fake stores: S3, the GitHub fill and R2 are each a
 * service over plain maps and a `Ref`, so a run is a few milliseconds and no
 * network. The hashes are the real Bun ones.
 *
 * The fixture is the hymnal as measured: S3 has every hymn but 388, and the
 * GitHub tree has all 695. Each recording is a few bytes of its own.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Console, Effect, Layer, Option, Ref, Result } from 'effect';

import { audioKey } from '../../src/remote.ts';
import { HashBun } from './hash-bun.ts';
import { dryRun, run } from './job.ts';
import { SDAH_HYMNS } from './plan.ts';
import type { FillEntry, TargetObject } from './stores.ts';
import { Fill, Hash, Source, StoreFailed, Target } from './stores.ts';

const bytesOf = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

const recording = (hymn: number) => bytesOf(`recording of hymn ${hymn}`);

interface S3Object {
  readonly bytes: Uint8Array;
  /** What HEAD answers: the MD5 in quotes, unless a case says otherwise. */
  readonly etag: string;
  readonly size: number;
}

interface Fixture {
  readonly s3: Map<number, S3Object>;
  /** The tree's entries, and the bytes a download of each answers. */
  readonly fill: Map<number, { readonly entry: FillEntry; readonly bytes: Uint8Array }>;
  /** Hymns whose HEAD gets no answer (a 5xx after its retries). */
  readonly unanswered: ReadonlySet<number>;
}

const fixture = Effect.gen(function* () {
  const hash = yield* Hash;
  const s3 = new Map<number, S3Object>();
  const fill = new Map<number, { entry: FillEntry; bytes: Uint8Array }>();
  for (const hymn of SDAH_HYMNS) {
    const bytes = recording(hymn);
    const path = `mp3/${String(hymn).padStart(3, '0')} – Hymn ${hymn}.mp3`;
    const entry = { hymn, path, size: bytes.byteLength, sha: hash.gitBlobSha1(bytes) };
    fill.set(hymn, { entry, bytes });
    if (hymn !== 388) s3.set(hymn, { bytes, etag: `"${hash.md5(bytes)}"`, size: bytes.byteLength });
  }
  return { s3, fill, unanswered: new Set<number>() };
});

const sourceOf = (fx: Fixture) =>
  Layer.succeed(
    Source,
    Source.of({
      head: (hymn) => {
        if (fx.unanswered.has(hymn)) {
          return Effect.fail(
            StoreFailed.make({ store: 's3', reason: `${hymn}.mp3: HEAD answered 503` }),
          );
        }
        return Effect.succeed(
          Option.map(Option.fromUndefinedOr(fx.s3.get(hymn)), (object) => ({
            size: object.size,
            etag: object.etag,
            contentType: 'audio/mpeg',
          })),
        );
      },
      get: (hymn) =>
        Effect.fromOption(Option.fromUndefinedOr(fx.s3.get(hymn))).pipe(
          Effect.map((object) => object.bytes),
          Effect.orElseSucceed(() => new Uint8Array()),
        ),
    }),
  );

const fillOf = (fx: Fixture) =>
  Layer.succeed(
    Fill,
    Fill.of({
      tree: Effect.succeed(new Map(Arr.map([...fx.fill], ([hymn, { entry }]) => [hymn, entry]))),
      get: (entry) =>
        Effect.fromOption(Option.fromUndefinedOr(fx.fill.get(entry.hymn))).pipe(
          Effect.map((found) => found.bytes),
          Effect.orElseSucceed(() => new Uint8Array()),
        ),
    }),
  );

/** R2 as a map: an upload's ETag is the MD5 of the bytes it got, as R2's is. */
interface Bucket {
  readonly objects: Ref.Ref<ReadonlyMap<string, TargetObject>>;
  readonly puts: Ref.Ref<ReadonlyArray<string>>;
}

const bucket = Effect.gen(function* () {
  return {
    objects: yield* Ref.make<ReadonlyMap<string, TargetObject>>(new Map()),
    puts: yield* Ref.make<ReadonlyArray<string>>([]),
  };
});

interface TargetFaults {
  /** Keys whose put fails. */
  readonly failing: ReadonlySet<string>;
  /** Keys whose put stores the bytes but answers another ETag. */
  readonly lying: ReadonlySet<string>;
}

const healthy: TargetFaults = { failing: new Set(), lying: new Set() };

const targetOf = (state: Bucket, faults: TargetFaults) =>
  Layer.effect(
    Target,
    Effect.gen(function* () {
      const hash = yield* Hash;
      return Target.of({
        list: (prefix) =>
          Ref.get(state.objects).pipe(
            Effect.map(
              (objects) => new Map([...objects].filter(([key]) => key.startsWith(prefix))),
            ),
          ),
        put: (key, bytes) =>
          Effect.gen(function* () {
            yield* Ref.update(state.puts, (puts) => [...puts, key]);
            if (faults.failing.has(key)) {
              return yield* StoreFailed.make({ store: 'r2', reason: `put ${key}: 500` });
            }
            const stored = { size: bytes.byteLength, etag: hash.md5(bytes) };
            yield* Ref.update(state.objects, (objects) => new Map(objects).set(key, stored));
            if (faults.lying.has(key))
              return { ...stored, etag: '"0123456789abcdef0123456789abcdef"' };
            return { ...stored, etag: `"${stored.etag}"` };
          }),
      });
    }),
  );

/** R2 a dry run must never reach: any call is a defect. */
const unreachable = Layer.succeed(
  Target,
  Target.of({
    list: () => Effect.die('the dry run listed R2'),
    put: () => Effect.die('the dry run wrote to R2'),
  }),
);

/** Run the job, keeping what it printed and how it ended. */
const exec = <E>(
  program: Effect.Effect<void, E, Source | Fill | Hash | Target>,
  layer: Layer.Layer<Source | Fill | Target, never, Hash>,
) => {
  const lines: Array<string> = [];
  const console = { ...globalThis.console, log: (line: string) => void lines.push(line) };
  return program.pipe(
    Effect.provide(layer),
    Effect.provideService(Console.Console, console),
    Effect.result,
    Effect.map((result) => ({ lines, result, last: lines.at(-1) ?? '' })),
  );
};

const stores = (fx: Fixture, state: Bucket, faults: TargetFaults = healthy) =>
  Layer.mergeAll(sourceOf(fx), fillOf(fx), targetOf(state, faults));

const key = audioKey;

/** The summary of a run over the default fixture. */
const sums = (fx: Fixture) => {
  const s3 = [...fx.s3.values()].reduce((total, object) => total + object.size, 0);
  const github = Option.match(Option.fromUndefinedOr(fx.fill.get(388)), {
    onNone: () => 0,
    onSome: ({ entry }) => entry.size,
  });
  return `s3=694/${s3} github=1/${github} missing=0 total=695/${s3 + github}`;
};

const failedWith = (result: Result.Result<void, unknown>) =>
  Result.match(result, { onSuccess: () => 'none', onFailure: (error) => String(error) });

describe('audio copy', () => {
  const test = (name: string, body: () => Effect.Effect<void, never, Hash>) =>
    it.effect(name, () => body().pipe(Effect.provide(HashBun)));

  test('a first run into an empty bucket uploads every hymn, each checked against its source MD5', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const hash = yield* Hash;
      const state = yield* bucket;
      const { result, last, lines } = yield* exec(run, stores(fx, state));

      expect(Result.isSuccess(result)).toBe(true);
      expect(last).toBe(
        `audio-copy run ${sums(fx)} target=kept 0 uploaded 695 failed 0 verified 695/695`,
      );
      expect((yield* Ref.get(state.puts)).length).toBe(695);
      const objects = yield* Ref.get(state.objects);
      for (const hymn of SDAH_HYMNS) {
        expect(objects.get(key(hymn))).toEqual({
          size: recording(hymn).byteLength,
          etag: hash.md5(recording(hymn)),
        });
      }
      expect(lines).toContain(`upload 1 s3 ${recording(1).byteLength}`);
    }));

  test('an upload R2 answers with another ETag is failed, and the run fails', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const state = yield* bucket;
      const faults = { failing: new Set<string>(), lying: new Set([key(5)]) };
      const { result, lines, last } = yield* exec(run, stores(fx, state, faults));

      expect(lines.filter((line) => line.startsWith('failed'))).toEqual([
        expect.stringMatching(/^failed 5 r2 stored etag 0123456789abcdef0123456789abcdef /),
      ]);
      expect(last).toContain('uploaded 694 failed 1 verified 694/695');
      expect(failedWith(result)).toContain('failed=1');
    }));

  test('a fill past ten hymns is warned of first, before any hymn is read or written', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      for (const hymn of Arr.range(1, 11)) fx.s3.delete(hymn);
      const state = yield* bucket;
      const warning =
        'warning 12 hymns come from the github fill, not s3: is the s3 bucket still public?';

      const preview = yield* exec(dryRun, Layer.mergeAll(sourceOf(fx), fillOf(fx), unreachable));
      expect(preview.lines[0]).toBe(warning);
      const copied = yield* exec(run, stores(fx, state));
      expect(copied.lines[0]).toBe(warning);
    }));

  test('a second run uploads nothing and keeps every hymn', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const state = yield* bucket;
      yield* exec(run, stores(fx, state));
      yield* Ref.set(state.puts, []);
      const { result, lines, last } = yield* exec(run, stores(fx, state));

      expect(Result.isSuccess(result)).toBe(true);
      expect(yield* Ref.get(state.puts)).toEqual([]);
      expect(lines).toEqual([
        `audio-copy run ${sums(fx)} target=kept 695 uploaded 0 failed 0 verified 695/695`,
      ]);
      expect(last).toContain('kept 695 uploaded 0');
    }));

  test('a put that fails is reported, the others land, and a rerun uploads only that hymn', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const state = yield* bucket;
      const faults = { failing: new Set([key(100)]), lying: new Set<string>() };
      const first = yield* exec(run, stores(fx, state, faults));

      expect(first.lines).toContain(`failed 100 r2: put ${key(100)}: 500`);
      expect(first.last).toContain('kept 0 uploaded 694 failed 1 verified 694/695');
      expect(failedWith(first.result)).toContain('failed=1');
      expect((yield* Ref.get(state.objects)).size).toBe(694);

      yield* Ref.set(state.puts, []);
      const rerun = yield* exec(run, stores(fx, state));
      expect(Result.isSuccess(rerun.result)).toBe(true);
      expect(yield* Ref.get(state.puts)).toEqual([key(100)]);
      expect(rerun.last).toContain('kept 694 uploaded 1 failed 0 verified 695/695');
    }));

  test('an object of the wrong size or ETag is uploaded again', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const state = yield* bucket;
      yield* exec(run, stores(fx, state));
      yield* Ref.update(state.objects, (objects) => {
        const changed = new Map(objects);
        changed.set(key(7), {
          size: 1,
          etag: Option.getOrThrow(Option.fromUndefinedOr(objects.get(key(7)))).etag,
        });
        changed.set(key(8), {
          size: recording(8).byteLength,
          etag: 'ffffffffffffffffffffffffffffffff',
        });
        return changed;
      });
      yield* Ref.set(state.puts, []);
      const { result, last } = yield* exec(run, stores(fx, state));

      expect(Result.isSuccess(result)).toBe(true);
      expect([...(yield* Ref.get(state.puts))].sort()).toEqual([key(7), key(8)]);
      expect(last).toContain('kept 693 uploaded 2 failed 0 verified 695/695');
    }));

  test('S3 bytes that do not match their ETag are never uploaded', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const state = yield* bucket;
      const original = Option.getOrThrow(Option.fromUndefinedOr(fx.s3.get(9)));
      fx.s3.set(9, { ...original, bytes: bytesOf('recording of hymn X') });
      const { result, lines, last } = yield* exec(run, stores(fx, state));

      expect(lines).toContainEqual(
        expect.stringMatching(/^failed 9 s3 body md5 [0-9a-f]{32}, etag /),
      );
      expect(yield* Ref.get(state.puts)).not.toContain(key(9));
      expect((yield* Ref.get(state.objects)).has(key(9))).toBe(false);
      expect(last).toContain('uploaded 694 failed 1 verified 694/695');
      expect(failedWith(result)).toContain('failed=1');
    }));

  test('a hymn S3 lacks is filled from GitHub once its size and git blob SHA-1 match', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const hash = yield* Hash;
      const state = yield* bucket;
      const { lines } = yield* exec(run, stores(fx, state));

      expect(lines).toContain(`fill 388 github ${recording(388).byteLength}`);
      expect((yield* Ref.get(state.objects)).get(key(388))).toEqual({
        size: recording(388).byteLength,
        etag: hash.md5(recording(388)),
      });
    }));

  test('a fill whose bytes are not the tree’s blob is refused', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const state = yield* bucket;
      const original = Option.getOrThrow(Option.fromUndefinedOr(fx.fill.get(388)));
      fx.fill.set(388, { ...original, bytes: bytesOf('recording of hymn 389') });
      const { result, lines } = yield* exec(run, stores(fx, state));

      expect(lines).toContainEqual(
        expect.stringMatching(/^failed 388 github body blob [0-9a-f]{40}, tree said /),
      );
      expect(yield* Ref.get(state.puts)).not.toContain(key(388));
      expect(failedWith(result)).toContain('failed=1');
    }));

  test('a hymn neither source has is missing, and the run fails', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const state = yield* bucket;
      fx.fill.delete(388);
      const { result, lines, last } = yield* exec(run, stores(fx, state));

      expect(lines).toContain('missing 388');
      expect(last).toMatch(
        / github=0\/0 missing=1 total=694\/\d+ target=kept 0 uploaded 694 failed 0 verified 694\/695$/,
      );
      expect(failedWith(result)).toContain('missing=1');
    }));

  test('a HEAD with no answer fails its hymn, never reads as absent', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const state = yield* bucket;
      const { result, lines } = yield* exec(
        run,
        stores({ ...fx, unanswered: new Set([20]) }, state),
      );

      expect(lines).toContain('failed 20 s3: 20.mp3: HEAD answered 503');
      expect(lines).not.toContainEqual(expect.stringMatching(/^fill 20 /));
      expect(yield* Ref.get(state.puts)).not.toContain(key(20));
      expect(failedWith(result)).toContain('failed=1');
    }));

  test('a dry run never calls R2 and sums each source', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const { result, lines, last } = yield* exec(
        dryRun,
        Layer.mergeAll(sourceOf(fx), fillOf(fx), unreachable),
      );

      expect(Result.isSuccess(result)).toBe(true);
      expect(last).toBe(`audio-copy dry-run ${sums(fx)} target=unread`);
      expect(lines).toContain(`fill 388 github ${recording(388).byteLength}`);
      expect(lines.filter((line) => line.startsWith('upload ')).length).toBe(694);
    }));

  test('a multipart ETag is checked by size, and R2 must answer the MD5 of the bytes', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const hash = yield* Hash;
      const state = yield* bucket;
      const original = Option.getOrThrow(Option.fromUndefinedOr(fx.s3.get(10)));
      fx.s3.set(10, { ...original, etag: '"9b2cf535f27731c974343645a3985328-2"' });
      const { result } = yield* exec(run, stores(fx, state));

      expect(Result.isSuccess(result)).toBe(true);
      expect((yield* Ref.get(state.objects)).get(key(10))?.etag).toBe(hash.md5(recording(10)));
    }));

  test('a multipart ETag whose body is not the size HEAD said is never uploaded', () =>
    Effect.gen(function* () {
      const fx = yield* fixture;
      const state = yield* bucket;
      const original = Option.getOrThrow(Option.fromUndefinedOr(fx.s3.get(11)));
      fx.s3.set(11, { ...original, etag: '"9b2cf535f27731c974343645a3985328-2"', size: 99 });
      const { result, lines } = yield* exec(run, stores(fx, state));

      expect(lines).toContain(`failed 11 s3 body ${original.size} bytes, head said 99`);
      expect(yield* Ref.get(state.puts)).not.toContain(key(11));
      expect(failedWith(result)).toContain('failed=1');
    }));
});
