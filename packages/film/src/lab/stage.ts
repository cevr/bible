// The preview as the lab's machines drive it: an edit shown in memory (the
// scene's timeline or knobs standing in for its drawing's until the write
// lands and the page reloads), held here and handed to the player whole
// (`Player.showEdits`), which draws every frame with it
// (`RenderOptions.edits`); and the lab's place in the URL held at the frame a
// write is asked at, then let go. The place keeps its one writer (the lab's
// time in the URL, `tInUrl` behind `Player.holdT` and `Player.settle`);
// nothing here writes the URL. A write the film's code does not import (a
// take's audio and timings, which the player fetches once) reloads the page
// itself, once the held place is on the address bar, so it lands on the
// frame, the scene and the pick it left.

import { Context, Effect, Layer, Option, Result, Schema } from 'effect';
import type { SceneEdit, SceneSpec, ShownEdit } from '../canvas/film.ts';
import { type Placed, sceneOf } from '../core/layout.ts';
import type { Knobs, ResolvedCue, Timeline } from '../core/schema.ts';
import type { LoopRange, Player } from '../player/main.ts';
import { type Host, reloadAtAddress } from '../browser/host.ts';

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
  /** `scene`'s cues as the preview draws them: previewed, else laid out. */
  readonly cuesOf: (scene: string) => ReadonlyMap<string, ResolvedCue>;
  /** A write is on its way: hold `#t=` at this frame for the reload it causes. */
  readonly holdT: Effect.Effect<void>;
  /**
   * Load the page again at this frame: the film's timings and narration are
   * read once, at load, so a new take plays only after it.
   */
  readonly reload: Effect.Effect<void>;
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
class NoStill extends Schema.TaggedError<NoStill>()('NoStill', {
  T: Schema.Finite,
}) {
  override get message() {
    return `no still of ${this.T.toFixed(2)}s: the canvas gave no image`;
  }
}

export class Stage extends Context.Service<Stage, StageOps>()('@bible/film/lab/Stage') {}

/**
 * The stage over `player`'s film, on the page's `host` (its address bar and
 * its loads). `changed` is told after each preview, so the panels that draw
 * the edited timeline read it again.
 */
export const makeStage = (player: Player, host: Host, changed: () => void): StageOps => {
  const { film } = player;
  const edits = new Map<string, ShownEdit>();
  const placed = (scene: string): Option.Option<Placed<SceneSpec>> =>
    Result.getSuccess(sceneOf(film.placed, scene));
  const declared = <K extends 'timeline' | 'knobs'>(scene: string, field: K) =>
    Option.flatMap(placed(scene), (p) => Option.fromUndefinedOr(p.spec[field]));
  const edited = <K extends 'timeline' | 'knobs'>(scene: string, field: K) =>
    Option.flatMap(Option.fromUndefinedOr(edits.get(scene)), (e) =>
      Option.fromUndefinedOr(e.edit[field]),
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
  const cuesOf = (scene: string): ReadonlyMap<string, ResolvedCue> =>
    edits.get(scene)?.cues ??
    Option.getOrElse(
      Option.map(placed(scene), (p) => p.cues),
      () => new Map(),
    );
  return {
    preview: (scene, edit) =>
      Effect.suspend(() => {
        const next: SceneEdit = {
          timeline: edit.timeline ?? timelineOf(scene),
          knobs: edit.knobs ?? knobsOf(scene),
        };
        return Effect.fromResult(film.edit(scene, next)).pipe(
          Effect.mapError((err) => NotPreviewed.make({ scene, reason: err.message })),
          Effect.map((shown) => {
            edits.set(scene, shown);
            player.showEdits(new Map(edits));
            changed();
          }),
        );
      }),
    unpreview: (scene) =>
      Effect.sync(() => {
        edits.delete(scene);
        player.showEdits(new Map(edits));
        changed();
      }),
    timelineOf,
    knobsOf,
    cuesOf,
    holdT: Effect.sync(() => player.holdT()),
    reload: Effect.sync(() => player.holdT()).pipe(
      Effect.andThen(reloadAtAddress),
      Effect.provideContext(host),
    ),
    settle: Effect.sync(() => player.settle()),
    pause: Effect.sync(() => player.pause()),
    duration: film.duration,
    cueSpan: (scene, name) =>
      Option.flatMap(placed(scene), (p) =>
        Option.map(Option.fromUndefinedOr(cuesOf(scene).get(name)), (c) => ({
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
      Effect.sync(() => player.renderShown(player.ctx, T)).pipe(
        Effect.flatMap(() =>
          Effect.callback<Blob, NoStill>((resume) =>
            player.canvas.toBlob((blob) =>
              resume(Effect.fromOption(Option.fromNullishOr(blob), () => NoStill.make({ T }))),
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
