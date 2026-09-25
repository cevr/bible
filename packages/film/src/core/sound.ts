// Sound: a film's music and effects, declared as data and placed on the same
// clock as the pictures. A music act starts at a scene; an effect fires at one
// of a scene's named cues (the same cue its picture reads), or at a mark, so
// re-recording a line moves its sounds with it. Pure — the score and mix
// scripts read it without a DOM.

import { Array as Arr, Option, Result, Schema } from 'effect';
import {
  ActTooShort,
  CueInvalid,
  type SoundCueError,
  UnknownCue,
  UnknownMark,
  UnknownScene,
} from './errors.ts';
import type { Placed } from './layout.ts';
import { hashText } from './narration.ts';
import {
  type Act,
  type Cue,
  EffectRequestKey,
  type Music,
  MusicRequestKey,
  type Plan,
  type PlanChunk,
  type SoundEffect,
} from './schema.ts';

/** The API refuses chunks shorter than this. */
const MIN_CHUNK_MS = 3000;

const sceneOf = (
  placed: ReadonlyArray<Placed>,
  scene: string,
): Result.Result<Placed, UnknownScene> =>
  Result.fromOption(
    Arr.findFirst(placed, (p) => p.spec.id === scene),
    () => UnknownScene.make({ scene }),
  );

export const filmEnd = (placed: ReadonlyArray<Placed>): number =>
  Option.match(Arr.last(placed), { onNone: () => 0, onSome: (p) => p.start + p.dur });

/** Where in its scene a cue lands, from the scene's start, before its offset. */
const anchorOf = (cue: Cue, p: Placed): Result.Result<number, SoundCueError> => {
  const { scene } = cue;
  const named = Option.fromNullishOr(cue.cue);
  const mark = Option.fromNullishOr(cue.mark);
  const edge = Option.fromNullishOr(cue.edge);
  if (Option.isSome(named) && Option.isSome(mark))
    return Result.fail(CueInvalid.make({ scene, reason: 'names both cue and mark' }));
  if (Option.isSome(edge) && Option.isNone(named))
    return Result.fail(CueInvalid.make({ scene, reason: 'has an edge but names no cue' }));
  if (Option.isSome(named)) {
    const name = named.value;
    const end = Option.contains(edge, 'end');
    return Result.fromOption(
      Option.map(Option.fromNullishOr(p.cues.get(name)), (c) => {
        if (end) return c.end;
        return c.start;
      }),
      () => UnknownCue.make({ scene, cue: name }),
    );
  }
  if (Option.isSome(mark))
    return Result.fromOption(
      Option.map(Option.fromNullishOr(p.voice.marks.get(mark.value)), (m) => p.speechStart + m),
      () => UnknownMark.make({ scene, mark: mark.value }),
    );
  return Result.succeed(0);
};

/** Absolute film time of a cue. */
export const cueTime = (
  cue: Cue,
  placed: ReadonlyArray<Placed>,
): Result.Result<number, SoundCueError> =>
  Result.gen(function* () {
    const p = yield* sceneOf(placed, cue.scene);
    const anchor = yield* anchorOf(cue, p);
    return p.start + Option.getOrElse(Option.fromNullishOr(cue.offset), () => 0) + anchor;
  });

/** Where an act starts: the first always opens the film. */
const actStart = (
  act: Act,
  index: number,
  placed: ReadonlyArray<Placed>,
): Result.Result<number, UnknownScene> => {
  if (index === 0) return Result.succeed(0);
  return Result.map(sceneOf(placed, act.from), (p) => p.start);
};

/**
 * The score's plan: each act lasts from its scene to the next act's scene, and
 * carries the film-wide styles ahead of its own. The act name is a structure
 * tag, never a lyric.
 */
export const musicPlan = (
  music: Music,
  placed: ReadonlyArray<Placed>,
): Result.Result<Plan, UnknownScene | ActTooShort> =>
  Result.gen(function* () {
    const starts: number[] = [];
    for (const [i, act] of music.acts.entries()) starts.push(yield* actStart(act, i, placed));
    const bounds = [...starts, filmEnd(placed)].map((s) => Math.round(s * 1000));
    const chunks: PlanChunk[] = [];
    for (const [i, act] of music.acts.entries()) {
      const ms = Arr.getUnsafe(bounds, i + 1) - Arr.getUnsafe(bounds, i);
      if (ms < MIN_CHUNK_MS) return yield* Result.fail(ActTooShort.make({ act: act.name, ms }));
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

export const effectKey = (e: SoundEffect): string =>
  hashText(Schema.encodeSync(EffectRequestKey)({ prompt: e.prompt, secs: e.secs }));
