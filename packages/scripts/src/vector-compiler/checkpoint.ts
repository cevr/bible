/** Resumable embedding for the vector compiler.
 *
 *  The full EGW scope is ~11 hours of single-threaded ONNX inference, and the
 *  first release run died mid-flight — an all-or-nothing pass is the wrong
 *  shape for a job that long. This module makes the embed loop restartable:
 *
 *  - vectors append to `<out>.part` as they are produced, one flush per
 *    `FLUSH_EVERY` rows, so at most one flush window of work is ever lost;
 *  - `<out>.checkpoint.json` records how far the part file is *known good*
 *    (count, fingerprint, dimensions, and the identity of the last row), and
 *    is rewritten after every flush;
 *  - on start, a checkpoint that matches the current source order resumes the
 *    loop at `completed`; anything inconsistent — different fingerprint, a
 *    source whose row at `completed - 1` is not the recorded identity, a part
 *    file shorter than the checkpoint claims — discards the pair and starts
 *    clean.
 *
 *  A part file *longer* than the checkpoint claims is the crash window between
 *  "bytes appended" and "checkpoint rewritten": the tail is unaccounted for,
 *  so it is truncated back to the last checkpointed byte rather than trusted.
 *
 *  Resumability leans on the source being deterministic: `readVectorSource`
 *  orders by `(book_code, puborder)`, and the writings database does not
 *  change under a build. The identity check on the last completed row is what
 *  turns that assumption into a verified precondition.
 */

import { DIMENSIONS, MODEL_FINGERPRINT, QueryEmbedder } from '@bible/core/search';
import { Clock, Console, Effect, FileSystem, Option, Schema } from 'effect';

import { paragraphIdentity } from '@bible/core/egw-db';

import type { VectorSourceRow } from './emit.js';

/** §9.2's join key for one source row — the same derivation `emit.ts` uses. */
const identityOf = (row: VectorSourceRow): string =>
  paragraphIdentity(row.bookCode, Option.some(row.paraId), row.refcode);

/** Rows between flushes. At ~25 rows/s this is ~20 seconds of exposure. */
const FLUSH_EVERY = 500;

export class VectorCheckpoint extends Schema.Class<VectorCheckpoint>(
  'VectorCompiler/VectorCheckpoint',
)({
  fingerprint: Schema.NonEmptyString,
  dimensions: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0))),
  /** Rows fully embedded and flushed to the part file. */
  completed: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  /** Identity of row `completed - 1`, the resume-order witness. */
  lastIdentity: Schema.NonEmptyString,
}) {}

const CheckpointJson = Schema.fromJsonString(VectorCheckpoint);
const decodeCheckpoint = Schema.decodeEffect(CheckpointJson);
const encodeCheckpoint = Schema.encodeEffect(CheckpointJson);

export class CompilerEmbedError extends Schema.TaggedError<CompilerEmbedError>()(
  'CompilerEmbedError',
  { message: Schema.String },
) {}

export const partPath = (out: string): string => `${out}.part`;
export const checkpointPath = (out: string): string => `${out}.checkpoint.json`;

/** Where to pick the loop back up, verified against the current source. */
const resumePoint = (
  rows: readonly VectorSourceRow[],
  out: string,
): Effect.Effect<number, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const fresh = Effect.gen(function* () {
      yield* fs.remove(partPath(out)).pipe(Effect.ignore);
      yield* fs.remove(checkpointPath(out)).pipe(Effect.ignore);
      return 0;
    });

    const read = yield* fs
      .readFileString(checkpointPath(out))
      .pipe(Effect.flatMap(decodeCheckpoint), Effect.option);
    if (Option.isNone(read)) return yield* fresh;
    const checkpoint = read.value;

    const witness = Option.filter(
      Option.fromNullishOr(rows[checkpoint.completed - 1]),
      (row) => identityOf(row) === checkpoint.lastIdentity,
    );
    const usable =
      checkpoint.fingerprint === MODEL_FINGERPRINT &&
      checkpoint.dimensions === DIMENSIONS &&
      checkpoint.completed > 0 &&
      checkpoint.completed <= rows.length &&
      Option.isSome(witness);
    if (!usable) {
      yield* Console.error(`  checkpoint at ${checkpointPath(out)} does not match — starting over`);
      return yield* fresh;
    }

    const stat = yield* fs.stat(partPath(out)).pipe(Effect.option);
    const wanted = BigInt(checkpoint.completed * DIMENSIONS);
    if (Option.isNone(stat) || stat.value.size < wanted) return yield* fresh;
    if (stat.value.size > wanted) {
      // The crash window between an append and its checkpoint: the tail bytes
      // are real vectors, but nothing records which rows they belong to.
      yield* fs.truncate(partPath(out), wanted).pipe(Effect.ignore);
      const repaired = yield* fs.stat(partPath(out)).pipe(Effect.option);
      const exact = Option.filter(repaired, (info) => info.size === wanted);
      if (Option.isNone(exact)) return yield* fresh;
    }
    yield* Console.error(
      `  resuming at ${String(checkpoint.completed)}/${String(rows.length)} from ${partPath(out)}`,
    );
    return checkpoint.completed;
  });

/** One log line per flush: absolute progress, percent, session rate, ETA.
 *
 *  Rate counts only rows embedded by *this* process (`done - startRow`), so a
 *  resumed run reports its own speed rather than a number inflated by work a
 *  previous run already banked. Written to stderr like the rest of the
 *  progress channel — stdout carries the `--json` manifest.
 */
const reportProgress = (input: {
  readonly startedAt: number;
  readonly startRow: number;
  readonly done: number;
  readonly total: number;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const elapsedSeconds = Math.max((now - input.startedAt) / 1000, 0.001);
    const ratePerSecond = (input.done - input.startRow) / elapsedSeconds;
    const remaining = input.total - input.done;
    const percent = ((input.done / input.total) * 100).toFixed(1);
    // A zero rate cannot happen after a flush (at least one row embedded),
    // but the guard keeps the arithmetic total rather than yielding Infinity.
    const etaSeconds = remaining / Math.max(ratePerSecond, 0.001);
    const etaHours = Math.floor(etaSeconds / 3600);
    const etaMinutes = Math.floor((etaSeconds % 3600) / 60);
    yield* Console.error(
      `  … ${String(input.done)}/${String(input.total)} (${percent}%) · ` +
        `${ratePerSecond.toFixed(1)}/s · ETA ${String(etaHours)}h${String(etaMinutes).padStart(2, '0')}m`,
    );
  });

/** Embeds every row, checkpointing as it goes; returns the full vector set. */
export const embedAllResumable = (
  rows: readonly VectorSourceRow[],
  out: string,
): Effect.Effect<Int8Array, CompilerEmbedError, QueryEmbedder | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const embedder = yield* QueryEmbedder;
    const start = yield* resumePoint(rows, out);

    const flush = (batch: readonly Int8Array[], completed: number) =>
      Effect.gen(function* () {
        const bytes = new Uint8Array(batch.length * DIMENSIONS);
        for (const [index, vector] of batch.entries()) bytes.set(vector, index * DIMENSIONS);
        const file = yield* fs.open(partPath(out), { flag: 'a' });
        yield* file.writeAll(bytes);
        const last = Option.fromNullishOr(rows[completed - 1]);
        if (Option.isSome(last)) {
          const encoded = yield* encodeCheckpoint(
            VectorCheckpoint.make({
              fingerprint: MODEL_FINGERPRINT,
              dimensions: DIMENSIONS,
              completed,
              lastIdentity: identityOf(last.value),
            }),
          ).pipe(Effect.orDie);
          yield* fs.writeFileString(checkpointPath(out), encoded);
        }
      }).pipe(
        Effect.scoped,
        Effect.mapError(
          (cause) =>
            new CompilerEmbedError({ message: `checkpoint flush failed: ${String(cause)}` }),
        ),
      );

    const startedAt = yield* Clock.currentTimeMillis;
    let batch: Int8Array[] = [];
    for (let index = start; index < rows.length; index += 1) {
      const row = Option.fromNullishOr(rows[index]);
      if (Option.isNone(row)) break;
      const vector = yield* embedder.embedDocument(row.value.text).pipe(
        Effect.mapError(
          (cause) =>
            new CompilerEmbedError({
              message: `${MODEL_FINGERPRINT} unavailable (${cause.adapter}): ${cause.reason}`,
            }),
        ),
      );
      batch.push(vector);
      const done = index + 1;
      if (batch.length === FLUSH_EVERY || done === rows.length) {
        yield* flush(batch, done);
        batch = [];
        yield* reportProgress({ startedAt, startRow: start, done, total: rows.length });
      }
    }

    const bytes = yield* fs
      .readFile(partPath(out))
      .pipe(
        Effect.mapError(
          (cause) => new CompilerEmbedError({ message: `part file unreadable: ${String(cause)}` }),
        ),
      );
    if (bytes.length !== rows.length * DIMENSIONS) {
      return yield* new CompilerEmbedError({
        message: `part file carries ${String(bytes.length)} bytes, expected ${String(rows.length * DIMENSIONS)}`,
      });
    }
    return new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
  });

/** Removes the working files once the final artifact is written. */
export const clearCheckpoint = (out: string): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.remove(partPath(out)).pipe(Effect.ignore);
    yield* fs.remove(checkpointPath(out)).pipe(Effect.ignore);
  });
