/**
 * The key sets as a stream (`./stream.ts`): for each key in the stepper's
 * order (`KEY_TRANSPOSES`), each hymn is rendered, checked, uploaded to R2,
 * read back from R2, and only then deleted from the disk. At most
 * `parallel` hymns are in hand at once, so the disk holds at most that many
 * hymns' MP3s and work folders, whatever the number of hymns.
 *
 * Each hymn, in this order:
 *
 * 1. **Kept.** Its record passed and R2 holds the record's bytes (size and
 *    MD5): no render, no upload; a local MP3 or work folder left is deleted.
 * 2. **Rendered.** The renderer (`render.ts --skip-manifest`) renders it, or
 *    keeps a local MP3 that still stands; the run then reads the record and
 *    the MP3 back. A hymn whose record did not pass, or whose MP3 is not the
 *    record's, is failed: its MP3 and work folder are deleted, its record
 *    (and the render's sheet) stay, and nothing is uploaded.
 * 3. **Uploaded.** A key R2 already holds with other bytes is never
 *    replaced: the hymn fails and its MP3 stays. Otherwise the MP3 goes up
 *    as `audio/mpeg` with a year's immutable cache, R2's answer must hold the
 *    record's MD5 and size, and a listing of the key must say the same. Only
 *    then are the MP3 and the work folder deleted. A failed upload deletes
 *    nothing.
 *
 * A stop (SIGTERM, an interruption) leaves at most the hymns in hand
 * unfinished; the next run keeps what R2 holds and renders the rest again.
 * After each key, the renderer writes the key's manifest
 * (`render.ts --manifest-only`). Every line goes to the console and to
 * `<cache>/stream.log`.
 */
import { KEY_TRANSPOSES, keySet } from '@bible/hymnal/recordings';
import { Console, Context, Effect, FileSystem, Option, Path, Ref, Result, Schema } from 'effect';

import { holds, unquote } from './plan.ts';
import type { TargetObject } from './stores.ts';
import { Hash, Target } from './stores.ts';
import { SET_CACHE_CONTROL, setKey, setPrefix } from './upload-plan.ts';

/** The stream could not go on: a renderer that could not run, or R2 that could not list a key. */
export class StreamFailed extends Schema.TaggedError<StreamFailed>()('StreamFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `audio stream: ${this.reason}`;
  }
}

/** What a render process answered: its exit code and the end of its output. */
export interface Rendered {
  readonly code: number;
  readonly tail: string;
}

/** Where one key set's hymns are rendered: its set folder and its work folder. */
export interface Dirs {
  readonly out: string;
  readonly work: string;
}

/**
 * The render, one process a hymn so each keeps its own memory
 * (`./stream.ts` runs `render.ts`; the tests a fake). It writes
 * `<out>/<n>.mp3`, `<out>/<n>.json` and `<work>/<n>/`, and `manifest`
 * writes `<out>/manifest.json`.
 */
export class Renderer extends Context.Service<
  Renderer,
  {
    readonly render: (
      job: Dirs & { readonly hymn: number; readonly transpose: number },
    ) => Effect.Effect<Rendered, StreamFailed>;
    readonly manifest: (
      job: Dirs & { readonly transpose: number },
    ) => Effect.Effect<Rendered, StreamFailed>;
  }
>()('@bible/hymnal-app/infra/audio/Renderer') {}

/** A key set's folders under the render cache, as `render.ts` names them. */
export const setDirs = (cache: string, set: string): Dirs => ({
  out: `${cache}/sets/${set}`,
  work: `${cache}/work-${set}`,
});

/** `--keys`: `all` (the stepper's order), or transposes from -5 to 6 other than 0, comma-separated. */
export const keysOf = (text: string): Result.Result<ReadonlyArray<number>, string> => {
  if (text === 'all') return Result.succeed(KEY_TRANSPOSES);
  const keys = text.split(',').map((part) => Number(part.trim()));
  const wrong = keys.some((t) => !Number.isInteger(t) || t === 0 || t < -5 || t > 6);
  if (text.trim() === '' || wrong)
    return Result.fail(
      `--keys ${text}: all, or transposes from -5 to 6 other than 0 (0 is warm-1)`,
    );
  return Result.succeed(keys);
};

/** `--hymns`: hymn numbers from 1 to 695, unpadded and comma-separated, in the order given. */
export const hymnsOf = (text: string): Result.Result<ReadonlyArray<number>, string> => {
  const hymns = text.split(',').map((part) => Number(part.trim()));
  const wrong = hymns.some((n) => !Number.isInteger(n) || n < 1 || n > 695);
  if (text.trim() === '' || wrong)
    return Result.fail(`--hymns ${text}: hymn numbers from 1 to 695, comma-separated`);
  return Result.succeed(hymns);
};

const Move = Schema.Struct({ stem: Schema.String, octave: Schema.Int, folded: Schema.Int });

/** The fields of a hymn's record (`render.ts`'s `<n>.json`) the stream reads. */
const StreamRecord = Schema.fromJsonString(
  Schema.Struct({
    hymn: Schema.Int,
    passed: Schema.Boolean,
    bytes: Schema.Int,
    sha256: Schema.String,
    md5: Schema.String,
    moves: Schema.optional(Schema.Array(Move)),
  }),
);
type StreamRecord = typeof StreamRecord.Type;

const SIGNED = new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' });

/** A moved stem as `render.ts` says it: `bass -12`, `violas +12 folded 3`. */
const moveText = (move: typeof Move.Type) => {
  const text = `${move.stem} ${SIGNED.format(move.octave)}`;
  if (move.folded === 0) return text;
  return `${text} folded ${move.folded}`;
};

/** The hymn's moved stems as its line says them, or nothing. */
const movedText = (moves: ReadonlyArray<typeof Move.Type>) => {
  if (moves.length === 0) return '';
  return `moved ${moves.map(moveText).join(', ')}`;
};

/** A process's last line of output, or `otherwise` when it printed none. */
const lastLine = (text: string, otherwise: string) =>
  Option.getOrElse(
    Option.filter(Option.fromUndefinedOr(text.trim().split('\n').at(-1)), (line) => line !== ''),
    () => otherwise,
  );

const sha256Hex = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(bytes);
  return hasher.digest('hex');
};

type Status = 'rendered' | 'kept' | 'uploaded' | 'failed';

interface Counts {
  readonly rendered: number;
  readonly kept: number;
  readonly uploaded: number;
  readonly failed: number;
}

/** A line's detail: why a hymn failed after a colon, what else a hymn did after a comma. */
const detailText = (status: Status, detail: string) => {
  if (detail === '') return '';
  if (status === 'failed') return `: ${detail}`;
  return `, ${detail}`;
};

const countsText = (n: Counts, of: number) =>
  `rendered ${n.rendered} kept ${n.kept} uploaded ${n.uploaded} failed ${n.failed} of ${of}`;

/** One hymn of one key: its record read, rendered when R2 lacks it, uploaded, read back, deleted. */
const streamHymn = (
  key: { readonly set: string; readonly transpose: number; readonly dirs: Dirs },
  hymn: number,
  listed: ReadonlyMap<string, TargetObject>,
  say: (hymn: number, status: Status, detail?: string) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const hash = yield* Hash;
    const target = yield* Target;
    const renderer = yield* Renderer;
    const { out, work } = key.dirs;
    const mp3 = path.join(out, `${hymn}.mp3`);
    const objectKey = setKey(key.set, hymn);

    const readRecord = fs
      .readFileString(path.join(out, `${hymn}.json`))
      .pipe(Effect.flatMap(Schema.decodeEffect(StreamRecord)), Effect.option);
    const removeIfThere = (file: string) =>
      fs
        .remove(file, { recursive: true })
        .pipe(Effect.catchTag('PlatformError', () => Effect.void));
    const clean = Effect.andThen(removeIfThere(mp3), removeIfThere(path.join(work, String(hymn))));
    const holdsRecord = (object: Option.Option<TargetObject>, record: StreamRecord) =>
      Option.isSome(object) && holds(object.value, record.bytes, record.md5);
    const held = Option.fromUndefinedOr(listed.get(objectKey));

    const before = yield* readRecord;
    if (Option.isSome(before) && before.value.passed && holdsRecord(held, before.value)) {
      yield* clean;
      return yield* say(hymn, 'kept');
    }

    const rendered = yield* renderer.render({ hymn, transpose: key.transpose, ...key.dirs });
    const record = yield* readRecord;
    if (Option.isNone(record) || !record.value.passed) {
      yield* clean;
      return yield* say(hymn, 'failed', lastLine(rendered.tail, `render exited ${rendered.code}`));
    }
    const bytes = yield* fs.readFile(mp3).pipe(Effect.option);
    const matches = Option.exists(
      bytes,
      (read) =>
        read.byteLength === record.value.bytes &&
        sha256Hex(read) === record.value.sha256 &&
        hash.md5(read) === record.value.md5,
    );
    if (Option.isNone(bytes) || !matches) {
      yield* clean;
      return yield* say(hymn, 'failed', `${hymn}.mp3 is not its record's`);
    }
    yield* say(hymn, 'rendered', movedText(record.value.moves ?? []));

    if (Option.isSome(held)) {
      if (holdsRecord(held, record.value)) {
        yield* clean;
        return yield* say(hymn, 'kept');
      }
      yield* removeIfThere(path.join(work, String(hymn)));
      return yield* say(
        hymn,
        'failed',
        `r2 holds ${objectKey} as etag ${unquote(held.value.etag)} size ${held.value.size}, the render has md5 ${record.value.md5} size ${record.value.bytes}; never replaced, the MP3 stays`,
      );
    }

    const uploaded = yield* Effect.gen(function* () {
      const stored = yield* target.put(objectKey, bytes.value, {
        contentType: 'audio/mpeg',
        cacheControl: SET_CACHE_CONTROL,
      });
      if (!holds(stored, record.value.bytes, record.value.md5))
        return Option.some(
          `r2 stored etag ${unquote(stored.etag)} size ${stored.size}, expected ${record.value.md5} size ${record.value.bytes}`,
        );
      const read = Option.fromUndefinedOr((yield* target.list(objectKey)).get(objectKey));
      if (!holdsRecord(read, record.value))
        return Option.some(`r2 does not list ${objectKey} as uploaded`);
      return Option.none<string>();
    }).pipe(Effect.catchTag('StoreFailed', (error) => Effect.succeedSome(error.message)));
    if (Option.isSome(uploaded)) {
      yield* removeIfThere(path.join(work, String(hymn)));
      return yield* say(hymn, 'failed', `${uploaded.value}; the MP3 stays`);
    }
    yield* clean;
    return yield* say(hymn, 'uploaded');
  });

export interface StreamOptions {
  /** The render cache: `sets/<set>/`, `work-<set>/` and `stream.log` are under it. */
  readonly cache: string;
  /** The transposes, in the order they stream. */
  readonly keys: ReadonlyArray<number>;
  readonly hymns: ReadonlyArray<number>;
  /** Hymns in hand at once. */
  readonly parallel: number;
}

/** Every key's hymns streamed to R2; answers how many hymns failed in all. */
export const stream = (options: StreamOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = yield* Target;
    const renderer = yield* Renderer;
    const log = path.join(options.cache, 'stream.log');
    const line = (text: string) =>
      Effect.andThen(
        Console.log(text),
        fs.writeFileString(log, `${text}\n`, { flag: 'a' }).pipe(Effect.orDie),
      );
    let failed = 0;
    for (const transpose of options.keys) {
      if (transpose === 0)
        return yield* StreamFailed.make({ reason: 'transpose 0 is warm-1, never streamed' });
      const set = keySet(transpose);
      const dirs = setDirs(options.cache, set);
      yield* fs.makeDirectory(dirs.out, { recursive: true }).pipe(Effect.orDie);
      yield* fs.makeDirectory(dirs.work, { recursive: true }).pipe(Effect.orDie);
      const listed = yield* target
        .list(setPrefix(set))
        .pipe(Effect.mapError((error) => StreamFailed.make({ reason: error.message })));
      const counts = yield* Ref.make<Counts>({ rendered: 0, kept: 0, uploaded: 0, failed: 0 });
      const of = options.hymns.length;
      const say = (hymn: number, status: Status, detail = '') =>
        Effect.gen(function* () {
          const n = yield* Ref.updateAndGet(counts, (c) => ({ ...c, [status]: c[status] + 1 }));
          yield* line(
            `key ${set} hymn ${hymn} ${status}${detailText(status, detail)} (${countsText(n, of)})`,
          );
        });
      yield* Effect.forEach(
        options.hymns,
        (hymn) =>
          streamHymn({ set, transpose, dirs }, hymn, listed, say).pipe(
            Effect.catchTag('StreamFailed', (error) => say(hymn, 'failed', error.message)),
          ),
        { concurrency: options.parallel, discard: true },
      );
      const manifest = yield* renderer.manifest({ transpose, ...dirs });
      if (manifest.code !== 0)
        yield* line(
          `key ${set} manifest failed: ${lastLine(manifest.tail, `exit ${manifest.code}`)}`,
        );
      const n = yield* Ref.get(counts);
      failed += n.failed;
      yield* line(`key ${set} done: ${countsText(n, of)}`);
    }
    return { failed };
  });
