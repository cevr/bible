// The lab's writes to scene source: a cue's `offset`, `dur`, `until`, `ease`
// or `stagger`, or a knob's value, in the `drawing({...})` literal
// SceneSources locates. A cue write the scene's timeline cannot resolve with
// is refused (`TimelineUnresolved`): judged in a fresh `film read cue
// --spans` (`FreshFilm`), on the clock the film's files give now, never this
// process's first import of them; its answer is the cue where it lands.
//
// Each write splices the one value (`scene-source.ts`) and reads it back from
// the formatted text, through SourceWriter: oxfmt, the compare-and-swap over
// the text the edit was made from (`SourceChanged`), and the film's undo stack
// are its.

import { Array as Arr, Context, Effect, Layer, Option, Predicate, Result } from 'effect';
import type { CuePatch, Knob } from '../core/schema.ts';
import {
  type SceneNotLocated,
  type SourceRefused,
  type SourceShared,
  TimelineUnresolved,
} from '../core/refusals.ts';
import { toMs } from '../core/time.ts';
import type { FilmName } from './film-repo.ts';
import { CueRead, FreshFilm } from './fresh-film.ts';
import { editCue, editKnob, readCue, readKnob, readSpans } from './scene-source.ts';
import { type Field, type LocateError, type SceneSite, SceneSources } from './scene-sources.ts';
import { type Change, type RewriteError, SourceWriter } from './source-writer.ts';

/** One write to a scene file: the change, and the name the file exports the drawing under. */
interface Written extends Change {
  /** Where the written value reads back. */
  readonly exportName: string;
}

type WriteError = LocateError | SceneNotLocated | SourceShared | TimelineUnresolved | RewriteError;

/** A cue written, and where it resolves as the film's files now give it (or why it does not). */
export interface CueWritten {
  readonly written: Written;
  readonly read: CueRead;
}

interface SceneWriterService {
  readonly setCue: (
    film: FilmName,
    scene: string,
    cue: string,
    patch: CuePatch,
  ) => Effect.Effect<CueWritten, WriteError>;
  readonly setKnob: (
    film: FilmName,
    scene: string,
    knob: string,
    value: Knob,
  ) => Effect.Effect<Written, WriteError>;
}

/** Whether two numbers are the same value as the lab writes it. */
const same = (a: number, b: number) => toMs(a) === toMs(b);

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
      const fresh = yield* FreshFilm;
      const sources = yield* SceneSources;
      const writer = yield* SourceWriter;

      /**
       * Rewrite one value of a scene's drawing: `edit` gives the new text,
       * `verify` reads the formatted text back, naming what did not land, and
       * `check` refuses a text the scene cannot play.
       */
      const write = <A>(
        film: string,
        scene: string,
        slot: Field,
        target: string,
        edit: (at: SceneSite, source: string) => Result.Result<string, SourceRefused>,
        verify: (
          at: SceneSite,
          after: string,
        ) => Result.Result<ReadonlyArray<string>, SourceRefused>,
        check: (at: SceneSite, after: string) => Effect.Effect<A, TimelineUnresolved>,
      ) =>
        Effect.gen(function* () {
          const at = yield* sources.writable(film, scene, slot);
          const [change, checked] = yield* writer.write({
            film,
            scene: Option.some(scene),
            file: at.file,
            target,
            edit: (source) => edit(at, source),
            verify: (after) => verify(at, after),
            check: (after) => check(at, after),
          });
          const written: Written = { ...change, exportName: at.exportName };
          return [written, checked] as const;
        });

      /**
       * Refuse `after` when the scene's timeline, its spans read from `after`
       * where they are literals, does not resolve on the clock the film's
       * files give now (a fresh `film read cue --spans`); else answer where
       * `cue` lands. A film that does not load or lay out as it stands is not
       * this write's to judge: the check passes, saying why it could not
       * resolve the cue.
       */
      const resolves =
        (film: FilmName, scene: string, cue: string, target: string) =>
        (at: SceneSite, after: string) =>
          Effect.gen(function* () {
            const spans = readSpans(at.file, after, at.exportName);
            const answered = yield* Effect.result(fresh.cue(film, scene, cue, Option.some(spans)));
            if (Result.isFailure(answered)) {
              const why = `${answered.failure._tag}: ${answered.failure.message}`;
              yield* Effect.logWarning(
                `lab.cue.unread film=${film} scene=${scene} cue=${cue} reason=${why}`,
              );
              return CueRead.make({ unresolved: why });
            }
            const read = answered.success;
            if (Predicate.isString(read.unresolved))
              return yield* TimelineUnresolved.make({
                file: at.file,
                target,
                reason: read.unresolved,
              });
            return read;
          });

      const setCue = Effect.fn('SceneWriter.setCue')(function* (
        film: FilmName,
        scene: string,
        cue: string,
        patch: CuePatch,
      ) {
        const target = `cue ${cue} ${fieldsOf(patch).join(',')}`;
        const [written, read] = yield* write(
          film,
          scene,
          'timeline',
          target,
          (at, source) => editCue(at.file, source, at.exportName, cue, patch),
          (at, after) =>
            Result.map(readCue(at.file, after, at.exportName, cue), (read) =>
              cueMismatches(patch, read),
            ),
          resolves(film, scene, cue, target),
        );
        const done: CueWritten = { written, read };
        return done;
      });

      const setKnob = Effect.fn('SceneWriter.setKnob')(function* (
        film: FilmName,
        scene: string,
        knob: string,
        value: Knob,
      ) {
        const [written] = yield* write(
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
        return written;
      });

      return SceneWriter.of({ setCue, setKnob });
    }),
  );
}
