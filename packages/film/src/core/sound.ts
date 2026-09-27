// Sound: a film's music and effects, declared as data and placed on the same
// clock as the pictures. A music act starts at a scene; an effect fires at an
// Event its scene's timeline fires (the moment the drawing names), or at a
// mark, so re-recording a line or redrawing a scene moves its sounds with it.
// Pure — the score and mix scripts read it without a DOM.

import { Array as Arr, Option, Result, Schema } from 'effect';
import {
  ActTooShort,
  CueInvalid,
  type SoundCueError,
  UnknownEvent,
  UnknownMark,
  type UnknownScene,
} from './errors.ts';
import { type Placed, sceneOf } from './layout.ts';
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

/**
 * Each scene's Events by name, in scene seconds: where the film plays each
 * Event's first key (`eventTimes`). A film with no Rive project has none.
 */
export type EventTimes = ReadonlyMap<string, ReadonlyMap<string, number>>;

/** The API refuses chunks shorter than this. */
export const MIN_CHUNK_MS = 3000;

export const filmEnd = (placed: ReadonlyArray<Placed>): number =>
  Option.match(Arr.last(placed), { onNone: () => 0, onSome: (p) => p.start + p.dur });

/** Where in its scene a cue lands, from the scene's start, before its offset. */
const anchorOf = (
  cue: Cue,
  p: Placed,
  events: EventTimes,
): Result.Result<number, SoundCueError> => {
  const { scene } = cue;
  const event = Option.fromNullishOr(cue.event);
  const mark = Option.fromNullishOr(cue.mark);
  if (Option.isSome(event) && Option.isSome(mark))
    return Result.fail(CueInvalid.make({ scene, reason: 'names both an event and a mark' }));
  if (Option.isSome(event))
    return Result.fromOption(Option.fromNullishOr(events.get(scene)?.get(event.value)), () =>
      UnknownEvent.make({ scene, event: event.value }),
    );
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
  events: EventTimes,
): Result.Result<number, SoundCueError> =>
  Result.gen(function* () {
    const p = yield* sceneOf(placed, cue.scene);
    const anchor = yield* anchorOf(cue, p, events);
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
