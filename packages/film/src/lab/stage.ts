// The preview as the lab's machines drive it: an edit shown in memory
// (`film.preview`, the scene's timeline or knobs standing in for its
// drawing's until the write lands and the page reloads), and the clock's `#T`
// held at the frame a write is asked at, then let go. `#T` keeps its one
// owner (`tInUrl`, behind `Player.holdT` and `Player.settle`); nothing here
// writes the URL.

import { Context, Effect, Layer, Option, Result, Schema } from 'effect';
import type { SceneEdit, SceneSpec } from '../canvas/film.ts';
import { type Placed, sceneOf } from '../core/layout.ts';
import type { Knobs, Timeline } from '../core/schema.ts';
import type { LoopRange, Player } from '../player/main.ts';

/** An edit the scene's timeline cannot resolve with: shown nowhere, and why. */
export class NotPreviewed extends Schema.TaggedError<NotPreviewed>()('NotPreviewed', {
  scene: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `not previewed: ${this.reason}`;
  }
}

export interface StageOps {
  /**
   * Show `edit` over `scene`'s declared timeline and knobs: its `timeline` or
   * `knobs` stand in for the ones shown now, whichever it names.
   */
  readonly preview: (scene: string, edit: SceneEdit) => Effect.Effect<void, NotPreviewed>;
  /** Show `scene` as its drawing declares it again. */
  readonly unpreview: (scene: string) => Effect.Effect<void>;
  /** The timeline shown for `scene`: previewed, else declared. */
  readonly timelineOf: (scene: string) => Timeline;
  /** The knobs shown for `scene`: previewed, else declared. */
  readonly knobsOf: (scene: string) => Knobs;
  /** A write is on its way: hold `#T` at this frame for the reload it causes. */
  readonly holdT: Effect.Effect<void>;
  /** T settles where it is (a refused write reloads nothing). */
  readonly settle: Effect.Effect<void>;
  readonly pause: Effect.Effect<void>;
  /** The film's length, in seconds. */
  readonly duration: number;
  /** Where cue `name` of `scene` plays in film seconds, as its timeline is shown now. */
  readonly cueSpan: (scene: string, name: string) => Option.Option<LoopRange>;
  /** Show `T` and play from it. */
  readonly playFrom: (T: number) => Effect.Effect<void>;
  /** The frame at `T` as the film draws it (no lab marks: they never touch the film), as PNG bytes. */
  readonly still: (T: number) => Effect.Effect<Uint8Array, NoStill>;
}

/** The canvas gave no PNG for the frame. */
export class NoStill extends Schema.TaggedError<NoStill>()('NoStill', {
  T: Schema.Finite,
}) {
  override get message() {
    return `no still of ${this.T.toFixed(2)}s: the canvas gave no image`;
  }
}

export class Stage extends Context.Service<Stage, StageOps>()('@bible/film/lab/Stage') {}

/**
 * The stage over `player`'s film. `changed` is told after each preview, so
 * the panels that draw the edited timeline read it again.
 */
export const makeStage = (player: Player, changed: () => void): StageOps => {
  const { film } = player;
  const edits = new Map<string, SceneEdit>();
  const placed = (scene: string): Option.Option<Placed<SceneSpec>> =>
    Result.getSuccess(sceneOf(film.placed, scene));
  const declared = <K extends 'timeline' | 'knobs'>(scene: string, field: K) =>
    Option.flatMap(placed(scene), (p) => Option.fromUndefinedOr(p.spec[field]));
  const edited = <K extends 'timeline' | 'knobs'>(scene: string, field: K) =>
    Option.flatMap(Option.fromUndefinedOr(edits.get(scene)), (e) =>
      Option.fromUndefinedOr(e[field]),
    );
  const timelineOf = (scene: string): Timeline =>
    Option.getOrElse(
      Option.orElse(edited(scene, 'timeline'), () => declared(scene, 'timeline')),
      () => ({}),
    );
  const knobsOf = (scene: string): Knobs =>
    Option.getOrElse(
      Option.orElse(edited(scene, 'knobs'), () => declared(scene, 'knobs')),
      () => ({}),
    );
  const show = (scene: string, edit: Option.Option<SceneEdit>) =>
    Result.try({
      try: () => film.preview(scene, Option.getOrUndefined(edit)),
      catch: (err) => NotPreviewed.make({ scene, reason: String(err).replace(/^Error: /, '') }),
    });
  return {
    preview: (scene, edit) =>
      Effect.suspend(() => {
        const next: SceneEdit = {
          timeline: edit.timeline ?? timelineOf(scene),
          knobs: edit.knobs ?? knobsOf(scene),
        };
        return Effect.fromResult(show(scene, Option.some(next))).pipe(
          Effect.map(() => {
            edits.set(scene, next);
            player.redraw();
            changed();
          }),
        );
      }),
    unpreview: (scene) =>
      Effect.sync(() => {
        edits.delete(scene);
        show(scene, Option.none());
        player.redraw();
        changed();
      }),
    timelineOf,
    knobsOf,
    holdT: Effect.sync(() => player.holdT()),
    settle: Effect.sync(() => player.settle()),
    pause: Effect.sync(() => player.pause()),
    duration: film.duration,
    cueSpan: (scene, name) =>
      Option.flatMap(placed(scene), (p) =>
        Option.map(Option.fromUndefinedOr(film.cuesOf(scene).get(name)), (c) => ({
          from: p.start + c.start,
          to: p.start + c.end,
        })),
      ),
    playFrom: (T) =>
      Effect.sync(() => {
        player.seek(T);
        player.play();
      }),
    still: (T) =>
      Effect.sync(() => film.render(player.ctx, T, { captions: player.captions.on })).pipe(
        Effect.flatMap(() =>
          Effect.callback<Blob, NoStill>((resume) =>
            player.canvas.toBlob((blob) =>
              resume(
                Option.match(Option.fromNullishOr(blob), {
                  onNone: () => Effect.fail(NoStill.make({ T })),
                  onSome: Effect.succeed,
                }),
              ),
            ),
          ),
        ),
        Effect.flatMap((blob) => Effect.promise(() => blob.arrayBuffer())),
        Effect.map((buffer) => new Uint8Array(buffer)),
      ),
  };
};

/** The stage as a layer, for the lab's runtime. */
export const stageLayer = (stage: StageOps): Layer.Layer<Stage> => Layer.succeed(Stage, stage);
