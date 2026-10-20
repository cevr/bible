/**
 * The upload against a set held in memory and a fake R2: the set's folder is
 * a map behind Effect's FileSystem, R2 a `Ref` of objects, so a run is a few
 * milliseconds and no network. The hashes are the real Bun ones.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Console, Effect, FileSystem, Layer, Option, Path, Ref, Result, Schema } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ManifestJson, type RecordingManifest } from '@bible/hymnal/recording-manifest';

import { HashBun } from './hash-bun.ts';
import { SDAH_HYMNS } from './plan.ts';
import type { PutMetadata, TargetObject } from './stores.ts';
import { Hash, StoreFailed, Target } from './stores.ts';
import { SET_CACHE_CONTROL, setKey } from './upload-plan.ts';
import { dryRun, run } from './upload.ts';

const DIR = '/sets/warm-1';

const recording = (hymn: number) =>
  Uint8Array.from(`warm-1 recording of hymn ${hymn}`, (c) => c.charCodeAt(0));

const sha256Hex = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(bytes);
  return hasher.digest('hex');
};

/** A set as the render leaves it: every hymn's MP3 and the manifest over them. */
const setOf = Effect.gen(function* () {
  const hash = yield* Hash;
  const files = new Map<string, Uint8Array>();
  const hymns = SDAH_HYMNS.map((hymn) => {
    const bytes = recording(hymn);
    files.set(`${DIR}/${hymn}.mp3`, bytes);
    return {
      hymn,
      key: `sdah/${hymn}.mp3`,
      file: `${hymn}.mp3`,
      bytes: bytes.byteLength,
      sha256: sha256Hex(bytes),
      md5: hash.md5(bytes),
      seconds: 60,
      lufs: -16,
      truePeak: -2.5,
      lagMs: 3,
      passed: true,
    };
  });
  const manifest: RecordingManifest = {
    set: 'warm-1',
    style: 'C Warm band',
    platform: 'darwin-arm64',
    configHash: 'c'.repeat(64),
    tools: { sfizz: { version: '1.2.3', sha256: 's' }, nodeAv: { version: '6.1.1' } },
    hymns,
  };
  return { files, manifest };
});

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: 'NotFound',
    module: 'FileSystem',
    method,
    pathOrDescriptor: path,
  });

/** The set's folder: the manifest as `manifest` encodes, and the MP3s in `files`. */
const folderOf = (files: ReadonlyMap<string, Uint8Array>, manifest: RecordingManifest) =>
  Effect.gen(function* () {
    const text = yield* Schema.encodeEffect(ManifestJson)(manifest).pipe(Effect.orDie);
    const texts = new Map([[`${DIR}/manifest.json`, text]]);
    const read =
      <A>(method: string, from: ReadonlyMap<string, A>) =>
      (path: string) =>
        Effect.fromOption(Option.fromUndefinedOr(from.get(path))).pipe(
          Effect.mapError(() => notFound(method, path)),
        );
    return FileSystem.layerNoop({
      readFileString: read('readFileString', texts),
      readFile: read('readFile', files),
    });
  });

interface Bucket {
  readonly objects: Ref.Ref<ReadonlyMap<string, TargetObject>>;
  readonly puts: Ref.Ref<ReadonlyArray<{ readonly key: string; readonly metadata: PutMetadata }>>;
}

const bucket = Effect.gen(function* () {
  return {
    objects: yield* Ref.make<ReadonlyMap<string, TargetObject>>(new Map()),
    puts: yield* Ref.make<ReadonlyArray<{ key: string; metadata: PutMetadata }>>([]),
  };
});

/** R2 as a map: an upload's ETag is the MD5 of the bytes it got; `failing` keys refuse their put. */
const targetOf = (state: Bucket, failing: ReadonlySet<string> = new Set()) =>
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
        put: (key, bytes, metadata) =>
          Effect.gen(function* () {
            yield* Ref.update(state.puts, (puts) => [...puts, { key, metadata }]);
            if (failing.has(key))
              return yield* StoreFailed.make({ store: 'r2', reason: `put ${key}: 500` });
            const stored = { size: bytes.byteLength, etag: `"${hash.md5(bytes)}"` };
            yield* Ref.update(state.objects, (objects) => new Map(objects).set(key, stored));
            return stored;
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

/** Run the job over `folder` and `target`, keeping what it printed and how it ended. */
const exec = <E>(
  program: Effect.Effect<void, E, FileSystem.FileSystem | Path.Path | Hash | Target>,
  folder: Layer.Layer<FileSystem.FileSystem>,
  target: Layer.Layer<Target, never, Hash>,
) => {
  const lines: Array<string> = [];
  const console = { ...globalThis.console, log: (line: string) => void lines.push(line) };
  return program.pipe(
    Effect.provide(Layer.mergeAll(folder, Path.layer, target)),
    Effect.provideService(Console.Console, console),
    Effect.result,
    Effect.map((result) => ({ lines, result, last: lines.at(-1) ?? '' })),
  );
};

const failedWith = (result: Result.Result<void, unknown>) =>
  Result.match(result, { onSuccess: () => 'none', onFailure: (error) => String(error) });

describe('audio upload', () => {
  const test = (name: string, body: () => Effect.Effect<void, never, Hash>) =>
    it.effect(name, () => body().pipe(Effect.provide(HashBun)));

  test('a first run uploads every hymn immutable, and a second uploads none', () =>
    Effect.gen(function* () {
      const { files, manifest } = yield* setOf;
      const folder = yield* folderOf(files, manifest);
      const state = yield* bucket;
      const first = yield* exec(run(DIR), folder, targetOf(state));
      expect(failedWith(first.result)).toBe('none');
      expect(first.last).toBe(
        'audio-upload run set=warm-1 kept 0 uploaded 695 conflict 0 failed 0 verified 695/695',
      );
      const puts = yield* Ref.get(state.puts);
      expect(puts.length).toBe(695);
      expect(puts.every((p) => p.metadata.contentType === 'audio/mpeg')).toBe(true);
      expect(puts.every((p) => p.metadata.cacheControl === SET_CACHE_CONTROL)).toBe(true);
      expect((yield* Ref.get(state.objects)).has(setKey('warm-1', 695))).toBe(true);

      const second = yield* exec(run(DIR), folder, targetOf(state));
      expect(second.last).toBe(
        'audio-upload run set=warm-1 kept 695 uploaded 0 conflict 0 failed 0 verified 695/695',
      );
      expect((yield* Ref.get(state.puts)).length).toBe(695);
    }));

  test('a dry run reads the set and never reaches R2', () =>
    Effect.gen(function* () {
      const { files, manifest } = yield* setOf;
      const { result, last } = yield* exec(
        dryRun(DIR),
        yield* folderOf(files, manifest),
        unreachable,
      );
      expect(failedWith(result)).toBe('none');
      expect(last).toBe(
        'audio-upload dry-run set=warm-1 kept 0 uploaded 0 conflict 0 failed 0 verified 0/695',
      );
    }));

  test('a key R2 holds with other bytes is a conflict, never replaced', () =>
    Effect.gen(function* () {
      const { files, manifest } = yield* setOf;
      const state = yield* bucket;
      const other = { size: 3, etag: `"${'e'.repeat(32)}"` };
      yield* Ref.set(state.objects, new Map([[setKey('warm-1', 46), other]]));
      const { result, last, lines } = yield* exec(
        run(DIR),
        yield* folderOf(files, manifest),
        targetOf(state),
      );
      expect(last).toBe(
        'audio-upload run set=warm-1 kept 0 uploaded 694 conflict 1 failed 0 verified 694/695',
      );
      expect(lines.some((line) => line.startsWith('conflict 46 ') && line.includes('warm-2'))).toBe(
        true,
      );
      expect(failedWith(result)).toContain('UploadIncomplete');
      expect((yield* Ref.get(state.objects)).get(setKey('warm-1', 46))).toEqual(other);
      expect((yield* Ref.get(state.puts)).some((p) => p.key === setKey('warm-1', 46))).toBe(false);
    }));

  test('a failed put fails its hymn alone, and the next run uploads it', () =>
    Effect.gen(function* () {
      const { files, manifest } = yield* setOf;
      const folder = yield* folderOf(files, manifest);
      const state = yield* bucket;
      const first = yield* exec(run(DIR), folder, targetOf(state, new Set([setKey('warm-1', 7)])));
      expect(first.last).toBe(
        'audio-upload run set=warm-1 kept 0 uploaded 694 conflict 0 failed 1 verified 694/695',
      );
      expect(failedWith(first.result)).toContain('UploadIncomplete');
      const second = yield* exec(run(DIR), folder, targetOf(state));
      expect(second.last).toBe(
        'audio-upload run set=warm-1 kept 694 uploaded 1 conflict 0 failed 0 verified 695/695',
      );
    }));

  test('refuses a set whose file is not its manifest, before R2 is reached', () =>
    Effect.gen(function* () {
      const { files, manifest } = yield* setOf;
      const changed = new Map(files).set(`${DIR}/250.mp3`, recording(251));
      const gone = new Map(files);
      gone.delete(`${DIR}/462.mp3`);
      for (const folder of [changed, gone]) {
        const { result } = yield* exec(run(DIR), yield* folderOf(folder, manifest), unreachable);
        expect(failedWith(result)).toContain('UploadRefused');
      }
    }));

  test('refuses a manifest with a hymn that did not pass, before R2 is reached', () =>
    Effect.gen(function* () {
      const { files, manifest } = yield* setOf;
      const hymns = manifest.hymns.map((h) => ({ ...h, passed: h.hymn !== 108 }));
      const { result } = yield* exec(
        dryRun(DIR),
        yield* folderOf(files, { ...manifest, hymns }),
        unreachable,
      );
      expect(failedWith(result)).toContain('did not pass their checks: 108');
    }));
});
