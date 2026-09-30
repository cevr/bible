// Sound: a film's music, beds and effects, declared as data and placed on the
// same clock as the pictures. A music act starts at a scene; an effect fires
// at a point in a scene (one of its named cues, the same cue its picture
// reads, a mark, or a landmark such as where its voice starts), and a bed runs
// from one point to another, so re-recording a line moves its sounds with it. Effects and beds name sounds from the app's library
// (`sfx.ts`). Pure — the score and mix scripts read it without a DOM.

import { Array as Arr, Option, Predicate, Result, Schema } from 'effect';
import {
  type ActLength,
  ActTooLong,
  ActTooShort,
  ScoreUnknown,
  type SoundCueError,
  type UnknownScene,
} from './errors.ts';
import { type Placed, pointIn, sceneOf } from './layout.ts';
import { hashText } from './narration.ts';
import {
  type Act,
  type Cue,
  type Music,
  MusicRequestKey,
  type Plan,
  type PlanChunk,
  type Score,
  type ScenePoint,
} from './schema.ts';

/** The API refuses chunks shorter than this. */
export const MIN_CHUNK_MS = 3000;

/** The API refuses chunks longer than this. */
export const MAX_CHUNK_MS = 120_000;

/**
 * Seconds the score's last act is composed past the film's end. A composed
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

export const filmEnd = (placed: ReadonlyArray<Placed>): number =>
  Option.match(Arr.last(placed), { onNone: () => 0, onSome: (p) => p.start + p.dur });

/** Where in its scene a cue lands, before its offset: its point (`pointIn`), or the scene's start. */
const anchorOf = (cue: Cue, p: Placed) => {
  if (!pointed(cue)) return Result.succeed(0);
  return pointIn(p, cue, 'sound');
};

/** Whether a cue names a point in its scene: a mark, a cue or a landmark. */
const pointed = (cue: Cue): cue is Cue & ScenePoint =>
  [cue.mark, cue.cue, cue.at].some(Predicate.isNotUndefined);

/** Absolute film time of a cue: its scene's start, its offset, and its point in the scene. */
export const cueTime = (
  cue: Cue,
  placed: ReadonlyArray<Placed>,
): Result.Result<number, SoundCueError> =>
  Result.gen(function* () {
    const p = yield* sceneOf(placed, cue.scene);
    const anchor = yield* anchorOf(cue, p);
    return p.start + Option.getOrElse(Option.fromNullishOr(cue.offset), () => 0) + anchor;
  });

/** Where an act starts: the first always opens the film, though its scene must exist too. */
const actStart = (
  act: Act,
  index: number,
  placed: ReadonlyArray<Placed>,
): Result.Result<number, UnknownScene> =>
  Result.map(sceneOf(placed, act.from), (p) => {
    if (index === 0) return 0;
    return p.start;
  });

/** How long one act of the score lasts, in whole milliseconds, as its plan sends it. */
export interface ActSpan {
  readonly act: Act;
  readonly ms: number;
}

/**
 * Each act's length, from its scene to the next act's (the last to the film's
 * end and `MUSIC_TAIL` past it), with `ActTooShort` or `ActTooLong` in place of an act outside the
 * API's chunk lengths; or, when any act names no scene, every such act.
 */
export const actSpans = (
  music: Music,
  placed: ReadonlyArray<Placed>,
): Result.Result<
  ReadonlyArray<Result.Result<ActSpan, ActLength>>,
  Arr.NonEmptyReadonlyArray<UnknownScene>
> => {
  const [unknown, starts] = Arr.partition(music.acts, (act, i) => actStart(act, i, placed));
  if (Arr.isReadonlyArrayNonEmpty(unknown)) return Result.fail(unknown);
  const bounds = [...starts, filmEnd(placed) + MUSIC_TAIL].map((s) => Math.round(s * 1000));
  return Result.succeed(
    music.acts.map((act, i): Result.Result<ActSpan, ActLength> => {
      const ms = Arr.getUnsafe(bounds, i + 1) - Arr.getUnsafe(bounds, i);
      if (ms < MIN_CHUNK_MS) return Result.fail(ActTooShort.make({ act: act.name, ms }));
      if (ms > MAX_CHUNK_MS)
        return Result.fail(ActTooLong.make({ act: act.name, ms, max: MAX_CHUNK_MS }));
      return Result.succeed({ act, ms });
    }),
  );
};

/**
 * The score's plan: each act lasts from its scene to the next act's scene, and
 * carries the film-wide styles ahead of its own. The act name is a structure
 * tag, never a lyric. Fails with the first act `actSpans` refuses.
 */
export const musicPlan = (
  music: Music,
  placed: ReadonlyArray<Placed>,
): Result.Result<Plan, UnknownScene | ActLength> =>
  Result.gen(function* () {
    const spans = yield* Result.mapError(actSpans(music, placed), Arr.headNonEmpty);
    const chunks: PlanChunk[] = [];
    for (const span of spans) {
      const { act, ms } = yield* span;
      chunks.push({
        text: `[${act.name}]`,
        duration_ms: ms,
        positive_styles: [...music.styles, ...act.styles],
        negative_styles: [
          ...music.avoid,
          ...Option.getOrElse(Option.fromNullishOr(act.avoid), () => []),
        ],
        context_adherence: 'high',
      });
    }
    return { chunks };
  });

export const musicKey = (music: Music, plan: Plan): string =>
  hashText(Schema.encodeSync(MusicRequestKey)({ model: music.model, plan }));
