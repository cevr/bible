// The lab's writes to scene source: a cue's `offset`, `dur`, `until`, `ease`
// or `stagger`, or a knob's value, in the `drawing({...})` literal
// SceneSources locates. A cue write the scene's timeline cannot resolve with
// is refused (`TimelineUnresolved`).
//
// Each write splices the one value (`scene-source.ts`) and reads it back from
// the formatted text, through SourceWriter: oxfmt, the compare-and-swap over
// the text the edit was made from (`SourceChanged`), and the film's undo stack
// are its.

import { Array as Arr, Context, Effect, Layer, Option, Predicate, Result } from 'effect';
import { sceneClock, sceneOf } from '../core/layout.ts';
import type { CuePatch, Knob } from '../core/schema.ts';
import { resolveTimeline } from '../core/timeline.ts';
import {
  type SceneNotLocated,
  type SourceRefused,
  type SourceShared,
  TimelineUnresolved,
} from './errors.ts';
import { FilmRepo, placeFilm } from './film-repo.ts';
import { editCue, editKnob, readCue, readKnob, readSpans, roundValue } from './scene-source.ts';
import { type Field, type LocateError, type SceneSite, SceneSources } from './scene-sources.ts';
import { type Change, type RewriteError, SourceWriter } from './source-writer.ts';

/** One write to a scene file: the change, and the name the file exports the drawing under. */
export interface Written extends Change {
  /** Where the written value reads back. */
  readonly exportName: string;
}

export type WriteError =
  | LocateError
  | SceneNotLocated
  | SourceShared
  | TimelineUnresolved
  | RewriteError;

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
      const repo = yield* FilmRepo;
      const sources = yield* SceneSources;
      const writer = yield* SourceWriter;

      /**
       * Rewrite one value of a scene's drawing: `edit` gives the new text,
       * `verify` reads the formatted text back, naming what did not land, and
       * `check` refuses a text the scene cannot play.
       */
      const write = (
        film: string,
        scene: string,
        slot: Field,
        target: string,
        edit: (at: SceneSite, source: string) => Result.Result<string, SourceRefused>,
        verify: (
          at: SceneSite,
          after: string,
        ) => Result.Result<ReadonlyArray<string>, SourceRefused>,
        check: (at: SceneSite, after: string) => Effect.Effect<void, TimelineUnresolved>,
      ) =>
        Effect.gen(function* () {
          const at = yield* sources.writable(film, scene, slot);
          const change = yield* writer.write({
            film,
            scene: Option.some(scene),
            file: at.file,
            target,
            edit: (source) => edit(at, source),
            verify: (after) => verify(at, after),
            check: (after) => check(at, after),
          });
          const written: Written = { ...change, exportName: at.exportName };
          return written;
        });

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
            const resolved = resolveTimeline(
              { ...p.value.spec.timeline, ...spans },
              sceneClock(p.value),
            );
            if (Result.isFailure(resolved))
              return yield* TimelineUnresolved.make({
                file: at.file,
                target,
                reason: resolved.failure.message,
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

      return SceneWriter.of({ setCue, setKnob });
    }),
  );
}
