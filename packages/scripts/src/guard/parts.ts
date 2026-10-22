// A tool run over the gate's files in parts, side by side. oxlint runs its JS
// plugins (the effect, film and judged rules) on one thread of its process,
// so one process over the whole repo is bound by that thread: split into
// parts, one process each, the plugins run on as many cores. A part is a
// share of the files dealt by size, largest first, each to the part holding
// the fewest bytes so far, so the parts end near one another. Each part's
// output is kept whole and printed in the parts' order once all have ended,
// so no two parts' lines interleave; the run's exit code is the highest any
// part answered.

import { Array as Arr, Console, Effect, FileSystem, Option, Path, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** A file and its size in bytes, the cost a part is dealt by. */
interface Sized {
  readonly name: string;
  readonly bytes: number;
}

/**
 * The files dealt into at most `count` parts, largest first, each to the
 * part with the fewest bytes so far (the first such part on a tie); a part
 * dealt nothing is left out, and each part lists its files sorted.
 */
export const partsOf = (files: ReadonlyArray<Sized>, count: number) => {
  const parts: Array<{ bytes: number; readonly names: Array<string> }> = Array.from(
    { length: Math.max(1, Math.floor(count)) },
    () => ({ bytes: 0, names: [] }),
  );
  const bySize = files.toSorted((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  for (const file of bySize) {
    const least = Math.min(...parts.map((part) => part.bytes));
    Option.map(
      Arr.findFirst(parts, (part) => part.bytes === least),
      (lightest) => {
        lightest.bytes += file.bytes;
        lightest.names.push(file.name);
      },
    );
  }
  return parts.filter((part) => part.names.length > 0).map((part) => part.names.toSorted());
};

/**
 * How many parts a machine of `cores` runs, and the threads each gives its
 * tool: a part per three cores, at most four (four parts cut the lint from
 * 13.4 s to 4.6 s on twelve cores; six, to 4.1 s), at least one.
 */
export const shareOf = (cores: number) => {
  const parts = Math.min(4, Math.max(1, Math.floor(cores / 3)));
  return { parts, threads: Math.max(1, Math.floor(cores / parts)) };
};

/** One part's run: what it printed (stdout, then stderr) and its exit code. */
interface PartRun {
  readonly output: string;
  readonly code: number;
}

/** Runs `bin` with `args` and then `files` in `root`, keeping what it prints. */
const runPart = (root: string, bin: string, args: ReadonlyArray<string>) =>
  Effect.fn('guard.runPart')(function* (files: ReadonlyArray<string>) {
    const spawner = yield* ChildProcessSpawner;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(
          ChildProcess.make(bin, [...args, ...files], { cwd: root, forceKillAfter: '5 seconds' }),
        );
        const [out, err, code] = yield* Effect.all(
          [
            Stream.mkString(Stream.decodeText(handle.stdout)),
            Stream.mkString(Stream.decodeText(handle.stderr)),
            handle.exitCode,
          ],
          { concurrency: 3 },
        );
        return { output: `${out}${err}`, code: Number(code) } satisfies PartRun;
      }),
    );
  });

/** Each of `files` (relative to `root`) with its size: what `partsOf` deals by. */
export const sizesOf = Effect.fn('guard.sizesOf')(function* (
  root: string,
  files: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* Effect.forEach(
    files,
    (name): Effect.Effect<Sized, PlatformError> =>
      Effect.map(fs.stat(path.join(root, name)), (info) => ({ name, bytes: Number(info.size) })),
    { concurrency: 16 },
  );
});

/**
 * Runs the tool `bin` (a path from `root`) once per part, side by side,
 * `args` before the part's files (relative to `root`), and answers each
 * part's run in the parts' order, printing nothing.
 */
export const runEachPart = Effect.fn('guard.runEachPart')(function* (
  root: string,
  bin: string,
  args: ReadonlyArray<string>,
  parts: ReadonlyArray<ReadonlyArray<string>>,
) {
  const path = yield* Path.Path;
  return yield* Effect.forEach(parts, runPart(root, path.join(root, bin), args), {
    concurrency: Math.max(1, parts.length),
  });
});

/**
 * Runs the tool `bin` (a path from `root`) once per part, side by side,
 * `args` before the part's files (relative to `root`); prints each part's
 * output in the parts' order once all have ended and answers the highest
 * exit code, 0 when there is no part.
 */
export const runParts = Effect.fn('guard.runParts')(function* (
  root: string,
  bin: string,
  args: ReadonlyArray<string>,
  parts: ReadonlyArray<ReadonlyArray<string>>,
) {
  const runs = yield* runEachPart(root, bin, args, parts);
  yield* Effect.forEach(
    runs.filter((run) => run.output !== ''),
    (run) => Console.log(run.output.trimEnd()),
    { discard: true },
  );
  return Math.max(0, ...runs.map((run) => run.code));
});
