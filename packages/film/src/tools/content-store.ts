// Generated assets are content-addressed: each manifest entry carries the hash
// of the request that made it, so a rerun does only stale work. The store
// reads and rewrites those manifests (timings.json, sound/manifest.json)
// through their Schema codecs, one writer at a time, so takes finishing
// together can no longer overwrite each other's entries.

import {
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { FileInvalid } from './errors.ts';

/** A manifest file, its codec, and what it holds before anything is generated. */
export interface Manifest<A> {
  readonly file: string;
  readonly codec: Schema.Codec<A, string>;
  readonly empty: A;
}

export type StoreError = FileInvalid | PlatformError;

/** One generated asset, requested by the hash of what makes it. */
export interface Ensure<M, A, E, R> {
  readonly manifest: Manifest<M>;
  /** The hash of the request. */
  readonly hash: string;
  /** Produce even when the stored hash matches. */
  readonly force: boolean;
  /** The hash stored for this asset, if any. */
  readonly stored: (manifest: M) => Option.Option<string>;
  readonly produce: Effect.Effect<A, E, R>;
  /** Record the new asset in the manifest. */
  readonly record: (manifest: M, made: A) => M;
}

/** Whether an asset must be (re)made. */
export const isStale = (stored: Option.Option<string>, hash: string, force: boolean): boolean =>
  force || !Option.contains(stored, hash);

export interface ContentStoreService {
  /** The manifest as stored, or its empty value when there is no file yet. */
  readonly read: <A>(manifest: Manifest<A>) => Effect.Effect<A, StoreError>;
  /** Read, change and write the manifest back, serialized with every other update. */
  readonly update: <A>(
    manifest: Manifest<A>,
    change: (current: A) => A,
  ) => Effect.Effect<A, StoreError>;
  /**
   * Read, change and write the manifest back, serialized with every other
   * update; a change that fails writes nothing and fails the call. What the
   * change decides from (an entry by its hash, say) is read under the same
   * lock as the write, so no other update lands between them.
   */
  readonly modify: <A, E>(
    manifest: Manifest<A>,
    change: (current: A) => Result.Result<A, E>,
  ) => Effect.Effect<A, E | StoreError>;
  /** Write a file whole: a reader never sees half of it. */
  readonly writeFile: (file: string, bytes: Uint8Array) => Effect.Effect<void, PlatformError>;
  /** Produce the asset unless its stored hash is current, then record it. `None` when skipped. */
  readonly ensure: <M, A, E, R>(
    request: Ensure<M, A, E, R>,
  ) => Effect.Effect<Option.Option<A>, E | StoreError, R>;
}

export class ContentStore extends Context.Service<ContentStore, ContentStoreService>()(
  '@bible/film/tools/ContentStore',
) {
  static readonly layer = Layer.effect(
    ContentStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const writer = yield* Semaphore.make(1);

      const writeFile = Effect.fn('ContentStore.writeFile')(function* (
        file: string,
        bytes: Uint8Array,
      ) {
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        const partial = `${file}.partial`;
        yield* fs.writeFile(partial, bytes);
        yield* fs.rename(partial, file);
      });

      const read = Effect.fn('ContentStore.read')(function* <A>(manifest: Manifest<A>) {
        if (!(yield* fs.exists(manifest.file))) return manifest.empty;
        const text = yield* fs.readFileString(manifest.file);
        return yield* Schema.decodeEffect(manifest.codec)(text).pipe(
          Effect.mapError((error) =>
            FileInvalid.make({ file: manifest.file, reason: error.message }),
          ),
        );
      });

      const modify = <A, E>(manifest: Manifest<A>, change: (current: A) => Result.Result<A, E>) =>
        writer
          .withPermit(
            Effect.gen(function* () {
              const next = yield* Effect.fromResult(change(yield* read(manifest)));
              const text = yield* Schema.encodeEffect(manifest.codec)(next).pipe(
                Effect.mapError((error) =>
                  FileInvalid.make({ file: manifest.file, reason: error.message }),
                ),
              );
              yield* writeFile(manifest.file, new TextEncoder().encode(text));
              return next;
            }),
          )
          .pipe(Effect.withSpan('ContentStore.modify'));

      const update = <A>(manifest: Manifest<A>, change: (current: A) => A) =>
        modify(manifest, (current: A) => Result.succeed(change(current)));

      const ensure = Effect.fn('ContentStore.ensure')(function* <M, A, E, R>(
        request: Ensure<M, A, E, R>,
      ) {
        const current = yield* read(request.manifest);
        if (!isStale(request.stored(current), request.hash, request.force)) return Option.none<A>();
        const made = yield* request.produce;
        yield* update(request.manifest, (m) => request.record(m, made));
        return Option.some(made);
      });

      return ContentStore.of({ read, update, modify, writeFile, ensure });
    }),
  );
}
