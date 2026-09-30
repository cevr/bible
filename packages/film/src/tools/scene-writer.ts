// The lab's writes to scene source: a cue's `offset`, `dur`, `until`, `ease`
// or `stagger`, or a knob's value, in the `drawing({...})` literal
// SceneSources locates. A cue write the scene's timeline cannot resolve with
// is refused (`TimelineUnresolved`).
//
// A write re-reads the file (the modules this process imported are as they
// were at start), splices the one value (`scene-source.ts`), formats the new
// text with oxfmt through its stdin, and reads the value back from the
// formatted text. Only then does it touch the file, and only if the file is
// still the text the edit was made from (an editor may have saved it since):
// then it writes the file whole (a partial file renamed into place), else it
// fails as `SourceChanged` and writes nothing. So a failed write never
// changes the file, and there is nothing to put back. Writes, undos and redos
// run one at a time. Undo puts back the newest write still on a bounded stack
// (UNDO_DEPTH), byte for byte, and Redo writes the newest undone one again;
// each only while the file is exactly as the step it reverses left it. A new
// write drops what could be redone.

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
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { sceneClock, sceneOf } from '../core/layout.ts';
import type { CuePatch, Knob } from '../core/schema.ts';
import { resolveTimeline } from '../core/timeline.ts';
import { ContentStore } from './content-store.ts';
import {
  FormatFailed,
  type SceneNotLocated,
  RedoUnavailable,
  SourceChanged,
  type SourceRefused,
  type SourceShared,
  TimelineUnresolved,
  UndoUnavailable,
  WriteUnverified,
} from './errors.ts';
import { FilmRepo, placeFilm } from './film-repo.ts';
import { collectWithin } from './process.ts';
import { editCue, editKnob, readCue, readKnob, readSpans, roundValue } from './scene-source.ts';
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
  | SourceShared
  | TimelineUnresolved;

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
  /** Put the newest write on the stack back: its file as it was before it. */
  readonly undo: Effect.Effect<Written, UndoUnavailable | PlatformError>;
  /** Write the newest undone write again. */
  readonly redo: Effect.Effect<Written, RedoUnavailable | PlatformError>;
  /** What undo and redo would do now, and the lab's latest change to a file. */
  readonly history: Effect.Effect<WriteHistory>;
}

/** What the lab has done to scene files: the writes it may undo, and those it may redo. */
export interface History {
  /** Oldest first; Undo takes the last. */
  readonly undos: ReadonlyArray<Written>;
  /** Oldest undo first; Redo takes the last. */
  readonly redos: ReadonlyArray<Written>;
  /** The latest change: a write, an undo (`undo …`) or a redo (`redo …`). */
  readonly latest: Option.Option<Written>;
}

/** The history as a page asks for it (`GET /lab/<film>/check`). */
export interface WriteHistory {
  /** The write Undo would put back. */
  readonly undo: Option.Option<Written>;
  /** The write Redo would make again. */
  readonly redo: Option.Option<Written>;
  readonly latest: Option.Option<Written>;
}

/** How many writes Undo can walk back. Each holds its file's text before and after. */
export const UNDO_DEPTH = 50;

export const emptyHistory: History = { undos: [], redos: [], latest: Option.none() };

/** `h` after the write `w`: on top of the stack (the oldest past `depth` dropped), nothing to redo. */
export const recordWrite = (h: History, w: Written, depth = UNDO_DEPTH): History => ({
  undos: [...h.undos, w].slice(-depth),
  redos: [],
  latest: Option.some(w),
});

/** The undo of `w`: its file from `w.after` back to `w.before`, named `undo <target>`. */
const undoneOf = (w: Written): Written => ({
  ...w,
  target: `undo ${w.target}`,
  before: w.after,
  after: w.before,
});

/** `w` made again: named `redo <target>`. */
const redoneOf = (w: Written): Written => ({ ...w, target: `redo ${w.target}` });

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
  ...missed('until', field(patch, 'until'), field(read, 'until'), (a, b) => a === b),
  ...missed('ease', field(patch, 'ease'), field(read, 'ease'), (a, b) => a === b),
  ...missed('stagger', field(patch, 'stagger'), field(read, 'stagger'), same),
];

const fieldsOf = (patch: CuePatch) =>
  (['offset', 'dur', 'until', 'ease', 'stagger'] satisfies ReadonlyArray<keyof CuePatch>).filter(
    (k) => Predicate.hasProperty(patch, k),
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
      const history = yield* Ref.make(emptyHistory);

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
       * Rewrite one value of a scene's drawing: `edit` gives the new text,
       * `verify` reads the formatted text back, naming what did not land, and
       * `check` refuses a text the scene cannot play.
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
        check: (at: SceneSite, after: string) => Effect.Effect<void, TimelineUnresolved>,
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
            yield* check(at, after);
            // Uninterruptible: the write reloads the page, which drops its
            // request; the file and the history must still agree once it lands.
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
                yield* Ref.update(history, (h) => recordWrite(h, written));
                yield* Effect.log(
                  `lab.write film=${film} scene=${scene} target="${target}" file=${path.relative(repo.paths(film).dir, at.file)}`,
                );
                return written;
              }),
            );
          }),
        );

      /**
       * Refuse `after` when the scene's timeline, its spans read from `after`
       * where they are literals, does not resolve. A film that does not load or
       * lay out as it stands is not this write's to judge: the check passes.
       */
      const resolves =
        (film: string, scene: string, target: string) => (at: SceneSite, after: string) =>
          Effect.gen(function* () {
            const placed = yield* repo.load(film).pipe(Effect.flatMap(placeFilm), Effect.option);
            const p = Option.flatMap(placed, (all) => Result.getSuccess(sceneOf(all, scene)));
            if (Option.isNone(p)) return;
            const spans = readSpans(at.file, after, at.exportName);
            const resolved = Result.try({
              try: () =>
                resolveTimeline({ ...p.value.spec.timeline, ...spans }, sceneClock(p.value)),
              catch: (cause) => String(cause).replace(/^Error: /, ''),
            });
            if (Result.isFailure(resolved))
              return yield* TimelineUnresolved.make({
                file: at.file,
                target,
                reason: resolved.failure,
              });
          });

      const setCue = Effect.fn('SceneWriter.setCue')(function* (
        film: string,
        scene: string,
        cue: string,
        patch: CuePatch,
      ) {
        const target = `cue ${cue} ${fieldsOf(patch).join(',')}`;
        return yield* write(
          film,
          scene,
          'timeline',
          target,
          (at, source) => editCue(at.file, source, at.exportName, cue, patch),
          (at, after) =>
            Result.map(readCue(at.file, after, at.exportName, cue), (read) =>
              cueMismatches(patch, read),
            ),
          resolves(film, scene, target),
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
          () => Effect.void,
        );
      });

      const undo = writer
        .withPermits(1)(
          Effect.uninterruptible(
            Effect.gen(function* () {
              const h = yield* Ref.get(history);
              const top = Arr.last(h.undos);
              if (Option.isNone(top))
                return yield* UndoUnavailable.make({ reason: 'the lab has made no write to undo' });
              const w = top.value;
              if ((yield* fs.readFileString(w.file)) !== w.after)
                return yield* UndoUnavailable.make({
                  reason: `${w.file} has changed since the lab wrote ${w.target}`,
                });
              yield* put(w.file, w.before);
              const undone = undoneOf(w);
              yield* Ref.set(history, {
                undos: h.undos.slice(0, -1),
                redos: [...h.redos, w],
                latest: Option.some(undone),
              });
              yield* Effect.log(`lab.undo scene=${w.scene} target="${w.target}" file=${w.file}`);
              return undone;
            }),
          ),
        )
        .pipe(Effect.withSpan('SceneWriter.undo'));

      const redo = writer
        .withPermits(1)(
          Effect.uninterruptible(
            Effect.gen(function* () {
              const h = yield* Ref.get(history);
              const top = Arr.last(h.redos);
              if (Option.isNone(top))
                return yield* RedoUnavailable.make({ reason: 'the lab has undone no write' });
              const w = top.value;
              if ((yield* fs.readFileString(w.file)) !== w.before)
                return yield* RedoUnavailable.make({
                  reason: `${w.file} has changed since the lab undid ${w.target}`,
                });
              yield* put(w.file, w.after);
              const redone = redoneOf(w);
              yield* Ref.set(history, {
                undos: [...h.undos, w].slice(-UNDO_DEPTH),
                redos: h.redos.slice(0, -1),
                latest: Option.some(redone),
              });
              yield* Effect.log(`lab.redo scene=${w.scene} target="${w.target}" file=${w.file}`);
              return redone;
            }),
          ),
        )
        .pipe(Effect.withSpan('SceneWriter.redo'));

      const current = Effect.map(Ref.get(history), (h): WriteHistory => ({
        undo: Arr.last(h.undos),
        redo: Arr.last(h.redos),
        latest: h.latest,
      }));

      return SceneWriter.of({ setCue, setKnob, undo, redo, history: current });
    }),
  );
}
