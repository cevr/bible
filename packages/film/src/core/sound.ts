// Sound: a film's music, beds and effects, declared as data and placed on the
// same clock as the pictures. A score movement starts at a scene; an effect
// fires at a point in a scene (one of its named cues, the same cue its
// picture reads, a mark, or a landmark such as where its voice starts), and a
// bed runs from one point to another, so re-recording a line moves its sounds
// with it. Effects and beds name sounds from the app's library (`sfx.ts`).
// Pure — the score and mix scripts read it without a DOM.

import { Array as Arr, Option, Result, Schema } from 'effect';
import {
  type MovementLength,
  MovementTooLong,
  MovementTooShort,
  ScoreUnknown,
  type SoundCueError,
} from './errors.ts';
import { type PartError, stretchesOf } from './acts.ts';
import { type Placed, filmEnd, pointIn, sceneOf } from './layout.ts';
import { hashText } from './narration.ts';
import {
  type Cue,
  type Movement,
  type Music,
  MusicRequestKey,
  type Plan,
  type PlanChunk,
  type Score,
  type ScoreAsset,
  type SoundManifest,
} from './schema.ts';

/** The API refuses chunks shorter than this. */
export const MIN_CHUNK_MS = 3000;

/** The API refuses chunks longer than this. */
export const MAX_CHUNK_MS = 120_000;

/**
 * Seconds the score's last movement is composed past the film's end. A composed
 * ending decays to silence on its own; landing it after the cut means the
 * film's last seconds hear the mix's fade-out over music still playing, not
 * dead air (the mix trims the tail).
 */
export const MUSIC_TAIL = 6;

/** One option of a score, by its name. */
export interface ScoreOption {
  readonly name: string;
  readonly music: Music;
}

/** Each of the score's options, in the order `sound.ts` declares them. */
export const scoreOptions = (score: Score): ReadonlyArray<ScoreOption> =>
  Object.entries(score.options).map(([name, music]) => ({ name, music }));

/**
 * The option the mix plays: the one asked for by name, or else the one the
 * score plays (`play`); a name the score lacks is `ScoreUnknown`.
 */
export const playedOption = (
  score: Score,
  asked: Option.Option<string>,
): Result.Result<ScoreOption, ScoreUnknown> => {
  const name = Option.getOrElse(asked, () => score.play);
  return Result.fromOption(
    Option.map(Option.fromUndefinedOr(score.options[name]), (music) => ({ name, music })),
    () => ScoreUnknown.make({ option: name, known: Object.keys(score.options) }),
  );
};

/** Absolute film time of a cue: its scene's start, its offset, and its point in the scene. */
export const cueTime = (
  cue: Cue,
  placed: ReadonlyArray<Placed>,
): Result.Result<number, SoundCueError> =>
  Result.gen(function* () {
    const p = yield* sceneOf(placed, cue.scene);
    const anchor = yield* pointIn(p, cue, 'sound');
    return p.start + Option.getOrElse(Option.fromNullishOr(cue.offset), () => 0) + anchor;
  });

/** How long one movement of the score lasts, in whole milliseconds, as its plan sends it. */
export interface MovementSpan {
  readonly movement: Movement;
  readonly ms: number;
}

/**
 * Each movement's length, from where its stretch starts (`stretchesOf`: its
 * scene, the first at 0) to the next one's (the last to the film's end and
 * `MUSIC_TAIL` past it), with `MovementTooShort` or `MovementTooLong` in
 * place of a movement outside the API's chunk lengths. Fails as an act does:
 * the first movement naming no scene, or declared out of film order.
 */
export const movementSpans = (
  music: Music,
  placed: ReadonlyArray<Placed>,
): Result.Result<ReadonlyArray<Result.Result<MovementSpan, MovementLength>>, PartError> =>
  Result.map(stretchesOf(music.movements, placed), (stretches) => {
    const bounds = [...stretches.map((s) => s.from), filmEnd(placed) + MUSIC_TAIL].map((s) =>
      Math.round(s * 1000),
    );
    return stretches.map(({ part: movement }, i): Result.Result<MovementSpan, MovementLength> => {
      const ms = Arr.getUnsafe(bounds, i + 1) - Arr.getUnsafe(bounds, i);
      if (ms < MIN_CHUNK_MS)
        return Result.fail(MovementTooShort.make({ movement: movement.name, ms }));
      if (ms > MAX_CHUNK_MS)
        return Result.fail(
          MovementTooLong.make({ movement: movement.name, ms, max: MAX_CHUNK_MS }),
        );
      return Result.succeed({ movement, ms });
    });
  });

/**
 * The score's plan: each movement lasts from its scene to the next one's, and
 * carries the film-wide styles ahead of its own. The movement's name is a
 * structure tag, never a lyric. Fails with the first movement
 * `movementSpans` refuses.
 */
export const musicPlan = (
  music: Music,
  placed: ReadonlyArray<Placed>,
): Result.Result<Plan, PartError | MovementLength> =>
  Result.gen(function* () {
    const spans = yield* movementSpans(music, placed);
    const chunks: PlanChunk[] = [];
    for (const span of spans) {
      const { movement, ms } = yield* span;
      chunks.push({
        text: `[${movement.name}]`,
        duration_ms: ms,
        positive_styles: [...music.styles, ...movement.styles],
        negative_styles: [
          ...music.avoid,
          ...Option.getOrElse(Option.fromNullishOr(movement.avoid), () => []),
        ],
        context_adherence: 'high',
      });
    }
    return { chunks };
  });

export const musicKey = (music: Music, plan: Plan): string =>
  hashText(Schema.encodeSync(MusicRequestKey)({ model: music.model, plan }));

/** Why a composed option no longer fits: the film was re-timed (the plan's key now), or no plan holds. */
export type ScoreStale =
  | { readonly _tag: 'Retimed'; readonly key: string }
  | PartError
  | MovementLength;

/**
 * Where a score option stands against what was composed for it, the one
 * answer the mix, the check, the composer and the review read: `Current` when
 * the manifest holds a file composed for the plan as the film now times it;
 * `Stale` when it holds one composed for another plan, or when no plan holds
 * any longer (a movement outside the API's chunk lengths, a movement naming
 * no scene or out of film order): the file still plays, with a warning; `Missing` when nothing was
 * composed.
 */
export type ScoreOptionState =
  | { readonly _tag: 'Current'; readonly asset: ScoreAsset; readonly key: string }
  | { readonly _tag: 'Stale'; readonly asset: ScoreAsset; readonly why: ScoreStale }
  | { readonly _tag: 'Missing' };

/** `option`'s state against `manifest`, for the film as `placed` times it. */
export const scoreOptionState = (
  option: ScoreOption,
  placed: ReadonlyArray<Placed>,
  manifest: SoundManifest,
): ScoreOptionState =>
  Option.match(Option.fromUndefinedOr(manifest.scores?.[option.name]), {
    onNone: (): ScoreOptionState => ({ _tag: 'Missing' }),
    onSome: (asset): ScoreOptionState =>
      Result.match(musicPlan(option.music, placed), {
        onFailure: (why): ScoreOptionState => ({ _tag: 'Stale', asset, why }),
        onSuccess: (plan): ScoreOptionState => {
          const key = musicKey(option.music, plan);
          if (asset.hash === key) return { _tag: 'Current', asset, key };
          return { _tag: 'Stale', asset, why: { _tag: 'Retimed', key } };
        },
      }),
  });
