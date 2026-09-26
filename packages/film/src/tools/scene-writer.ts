// The lab's writes to scene source: a cue's `offset`, `dur` or `ease`, or a
// knob's value, in the `drawing({...})` literal SceneSources locates.
//
// A write re-reads the file (the modules this process imported are as they
// were at start), splices the one value (`scene-source.ts`), formats the new
// text with oxfmt through its stdin, and reads the value back from the
// formatted text. Only then does it touch the file, and only if the file is
// still the text the edit was made from (an editor may have saved it since):
// then it writes the file whole (a partial file renamed into place), else it
// fails as `SourceChanged` and writes nothing. So a failed write never
// changes the file, and there is nothing to put back. Writes run one at a
// time. The last write can be undone once, byte for byte, while the file is
// still exactly as that write left it.

import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Ref,
  Result,
  Semaphore,
  Stream,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import type { CuePatch, Knob } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import {
  FormatFailed,
  type SceneNotLocated,
  SourceChanged,
  type SourceRefused,
  type SourceShared,
  UndoUnavailable,
  WriteUnverified,
} from './errors.ts';
import { FilmRepo } from './film-repo.ts';
import { collectWithin } from './process.ts';
import { editCue, editKnob, readCue, readKnob, roundValue } from './scene-source.ts';
import { type Field, type LocateError, type SceneSite, SceneSources } from './scene-sources.ts';

/** One write the lab made: the file's text before and after it. */
export interface Written {
  readonly scene: string;
  readonly file: string;
  /** The name the file exports the drawing under: where the written value reads back. */
  readonly exportName: string;
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
  | WriteUnverified
  | SourceChanged
  | SourceShared;

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

/**
 * The longest oxfmt may take on one file. Writes run one at a time, so a hung
 * oxfmt would hold every later write: past this it is stopped and the write
 * fails with the file untouched.
 */
export const FORMAT_LIMIT = Duration.seconds(20);

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

      /** Write `text` as the file, whole. */
      const put = (file: string, text: string) =>
        store.writeFile(file, new TextEncoder().encode(text));

      /**
       * `text` as oxfmt formats it for `file`, through its stdin: the file is
       * not touched. Run from the file's folder, so oxfmt finds the config the
       * file is formatted with.
       */
      const format = (file: string, text: string) =>
        collectWithin(
          spawner,
          'oxfmt',
          ChildProcess.make('bunx', ['oxfmt', `--stdin-filepath=${file}`], {
            cwd: path.dirname(file),
            stdin: Stream.make(new TextEncoder().encode(text)),
          }),
          FORMAT_LIMIT,
        ).pipe(
          Effect.mapError((error) => FormatFailed.make({ file, reason: error.message })),
          Effect.flatMap((done) => {
            if (done.exitCode === 0) return Effect.succeed(done.stdout);
            return Effect.fail(
              FormatFailed.make({ file, reason: `${done.stderr}${done.stdout}`.trim() }),
            );
          }),
        );

      /**
       * Rewrite one value of a scene's drawing: `edit` gives the new text, and
       * `verify` reads the formatted text back, naming what did not land.
       */
      const write = (
        film: string,
        scene: string,
        field: Field,
        target: string,
        edit: (at: SceneSite, source: string) => Result.Result<string, SourceRefused>,
        verify: (
          at: SceneSite,
          after: string,
        ) => Result.Result<ReadonlyArray<string>, SourceRefused>,
      ) =>
        writer.withPermits(1)(
          Effect.gen(function* () {
            const at = yield* sources.writable(film, scene, field);
            const before = yield* fs.readFileString(at.file);
            const next = yield* Effect.fromResult(edit(at, before));
            const after = yield* format(at.file, next);
            const missed = Result.match(verify(at, after), {
              onFailure: (e) => [e.reason],
              onSuccess: (m) => m,
            });
            if (missed.length > 0)
              return yield* WriteUnverified.make({
                file: at.file,
                target,
                reason: missed.join(', '),
              });
            // Uninterruptible: the write reloads the page, which drops its
            // request; the file and `last` must still agree once it lands.
            return yield* Effect.uninterruptible(
              Effect.gen(function* () {
                // Compare and swap: only over the very text the edit was made from.
                if ((yield* fs.readFileString(at.file)) !== before)
                  return yield* SourceChanged.make({ file: at.file, target });
                yield* put(at.file, after);
                const written: Written = {
                  scene,
                  file: at.file,
                  exportName: at.exportName,
                  target,
                  before,
                  after,
                };
                yield* Ref.set(last, Option.some(written));
                yield* Effect.log(
                  `lab.write film=${film} scene=${scene} target="${target}" file=${path.relative(repo.paths(film).dir, at.file)}`,
                );
                return written;
              }),
            );
          }),
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
          'timeline',
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
          'knobs',
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
              yield* put(w.file, w.before);
              yield* Ref.set(last, Option.none());
              yield* Effect.log(`lab.undo scene=${w.scene} target="${w.target}" file=${w.file}`);
              const undone: Written = {
                scene: w.scene,
                file: w.file,
                exportName: w.exportName,
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
