// The lab's writes to scene source: a cue's `offset`, `dur` or `ease`, or a
// knob's value, in the `drawing({...})` literal SceneSources locates.
//
// A write re-reads the file (the modules this process imported are as they
// were at start), splices the one value (`scene-source.ts`), writes the file
// whole (a partial file renamed into place), runs oxfmt on it, and reads the
// value back from the formatted file. If oxfmt fails or the value does not
// read back, the file is put back as it was and the write fails. Writes run
// one at a time. The last write can be undone once, byte for byte, while the
// file is still exactly as that write left it.

import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Ref,
  Result,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import type { CuePatch, Knob } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import {
  FormatFailed,
  type SceneNotLocated,
  type SourceRefused,
  UndoUnavailable,
  WriteUnverified,
} from './errors.ts';
import { FilmRepo } from './film-repo.ts';
import { collect } from './process.ts';
import { editCue, editKnob, readCue, readKnob, roundValue } from './scene-source.ts';
import { type LocateError, type SceneSite, SceneSources } from './scene-sources.ts';

/** One write the lab made: the file's text before and after it. */
export interface Written {
  readonly scene: string;
  readonly file: string;
  /** What changed, e.g. `cue topple offset,dur` or `knob palm`. */
  readonly target: string;
  readonly before: string;
  readonly after: string;
}

export type WriteError =
  | LocateError
  | SceneNotLocated
  | SourceRefused
  | FormatFailed
  | WriteUnverified;

export interface SceneWriterService {
  readonly setCue: (
    film: string,
    scene: string,
    cue: string,
    patch: CuePatch,
  ) => Effect.Effect<Written, WriteError>;
  readonly setKnob: (
    film: string,
    scene: string,
    knob: string,
    value: Knob,
  ) => Effect.Effect<Written, WriteError>;
  /** Put the last write's file back as it was; once. */
  readonly undo: Effect.Effect<Written, UndoUnavailable | PlatformError>;
  /** The write `undo` would put back, if any. */
  readonly last: Effect.Effect<Option.Option<Written>>;
}

/** Whether two numbers are the same value as the lab writes it. */
const same = (a: number, b: number) => roundValue(a) === roundValue(b);

const sameKnob = (a: Knob, b: Knob): boolean => {
  if (Predicate.isNumber(a) || Predicate.isNumber(b))
    return Predicate.isNumber(a) && Predicate.isNumber(b) && same(a, b);
  return same(a[0], b[0]) && same(a[1], b[1]);
};

/** `name` when `wanted` is set and `read` is not the same value. */
const missed = <A>(
  name: string,
  wanted: Option.Option<A>,
  read: Option.Option<A>,
  eq: (a: A, b: A) => boolean,
): ReadonlyArray<string> =>
  Option.match(wanted, {
    onNone: () => [],
    onSome: (w) => Arr.filter([name], () => !Option.exists(read, (r) => eq(r, w))),
  });

const field = <K extends keyof CuePatch>(patch: CuePatch, key: K) =>
  Option.fromUndefinedOr(patch[key]);

/** Which patched fields do not read back as written. */
const cueMismatches = (patch: CuePatch, read: CuePatch): ReadonlyArray<string> => [
  ...missed('offset', field(patch, 'offset'), field(read, 'offset'), same),
  ...missed('dur', field(patch, 'dur'), field(read, 'dur'), same),
  ...missed('ease', field(patch, 'ease'), field(read, 'ease'), (a, b) => a === b),
];

const fieldsOf = (patch: CuePatch) =>
  (['offset', 'dur', 'ease'] satisfies ReadonlyArray<keyof CuePatch>).filter((k) =>
    Predicate.hasProperty(patch, k),
  );

export class SceneWriter extends Context.Service<SceneWriter, SceneWriterService>()(
  '@bible/film/tools/SceneWriter',
) {
  static readonly layer = Layer.effect(
    SceneWriter,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const repo = yield* FilmRepo;
      const sources = yield* SceneSources;
      const store = yield* ContentStore;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const writer = yield* Semaphore.make(1);
      const last = yield* Ref.make(Option.none<Written>());

      /** Put `text` back as the file, when a write has to be undone. */
      const restore = (file: string, text: string) =>
        store.writeFile(file, new TextEncoder().encode(text));

      const format = (file: string) =>
        collect(spawner, ChildProcess.make('bunx', ['oxfmt', file])).pipe(
          Effect.mapError((error) => FormatFailed.make({ file, reason: error.message })),
          Effect.flatMap((done) => {
            if (done.exitCode === 0) return Effect.void;
            return Effect.fail(
              FormatFailed.make({ file, reason: `${done.stderr}${done.stdout}`.trim() }),
            );
          }),
        );

      /**
       * Rewrite one value of a scene's drawing: `edit` gives the new text, and
       * `verify` reads the formatted file back, naming what did not land.
       */
      const write = (
        film: string,
        scene: string,
        target: string,
        edit: (at: SceneSite, source: string) => Result.Result<string, SourceRefused>,
        verify: (
          at: SceneSite,
          after: string,
        ) => Result.Result<ReadonlyArray<string>, SourceRefused>,
      ) =>
        // Uninterruptible: the page the write reloads drops its request, and a
        // write must not stop between the rename and the check that it read back.
        writer.withPermits(1)(
          Effect.uninterruptible(
            Effect.gen(function* () {
              const at = yield* sources.site(film, scene);
              const before = yield* fs.readFileString(at.file);
              const next = yield* Effect.fromResult(edit(at, before));
              yield* store.writeFile(at.file, new TextEncoder().encode(next));
              const undone = <E>(error: E) =>
                Effect.andThen(restore(at.file, before), Effect.fail(error));
              yield* format(at.file).pipe(Effect.catchTag('FormatFailed', undone));
              const after = yield* fs.readFileString(at.file);
              const missed = Result.match(verify(at, after), {
                onFailure: (e) => [e.reason],
                onSuccess: (m) => m,
              });
              if (missed.length > 0)
                return yield* undone(
                  WriteUnverified.make({ file: at.file, target, reason: missed.join(', ') }),
                );
              const written: Written = { scene, file: at.file, target, before, after };
              yield* Ref.set(last, Option.some(written));
              yield* Effect.log(
                `lab.write film=${film} scene=${scene} target="${target}" file=${path.relative(repo.paths(film).dir, at.file)}`,
              );
              return written;
            }),
          ),
        );

      const setCue = Effect.fn('SceneWriter.setCue')(function* (
        film: string,
        scene: string,
        cue: string,
        patch: CuePatch,
      ) {
        return yield* write(
          film,
          scene,
          `cue ${cue} ${fieldsOf(patch).join(',')}`,
          (at, source) => editCue(at.file, source, at.exportName, cue, patch),
          (at, after) =>
            Result.map(readCue(at.file, after, at.exportName, cue), (read) =>
              cueMismatches(patch, read),
            ),
        );
      });

      const setKnob = Effect.fn('SceneWriter.setKnob')(function* (
        film: string,
        scene: string,
        knob: string,
        value: Knob,
      ) {
        return yield* write(
          film,
          scene,
          `knob ${knob}`,
          (at, source) => editKnob(at.file, source, at.exportName, knob, value),
          (at, after) =>
            Result.map(readKnob(at.file, after, at.exportName, knob), (read) =>
              Arr.filter([knob], () => !Option.exists(read, (r) => sameKnob(r, value))),
            ),
        );
      });

      const undo = writer
        .withPermits(1)(
          Effect.uninterruptible(
            Effect.gen(function* () {
              const previous = yield* Ref.get(last);
              if (Option.isNone(previous))
                return yield* UndoUnavailable.make({ reason: 'the lab has made no write to undo' });
              const w = previous.value;
              const now = yield* fs.readFileString(w.file);
              if (now !== w.after)
                return yield* UndoUnavailable.make({
                  reason: `${w.file} has changed since the lab wrote ${w.target}`,
                });
              yield* restore(w.file, w.before);
              yield* Ref.set(last, Option.none());
              yield* Effect.log(`lab.undo scene=${w.scene} target="${w.target}" file=${w.file}`);
              const undone: Written = {
                scene: w.scene,
                file: w.file,
                target: `undo ${w.target}`,
                before: w.after,
                after: w.before,
              };
              return undone;
            }),
          ),
        )
        .pipe(Effect.withSpan('SceneWriter.undo'));

      return SceneWriter.of({ setCue, setKnob, undo, last: Ref.get(last) });
    }),
  );
}
