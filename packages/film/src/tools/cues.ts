// The film's clock as text: each scene's placement, its marks and where its
// Events play (from the scene's start, through its warp), or each sound
// effect's film time. Pure; `film cues` prints it.

import { Option, Result } from 'effect';
import type { SoundCueError, UnknownScene } from '../core/errors.ts';
import { type Placed, sceneOf } from '../core/layout.ts';
import type { Cue, Sound } from '../core/schema.ts';
import { type EventTimes, cueTime } from '../core/sound.ts';

/** Which scenes to report: all, or the one `only` names, which must exist. */
const sceneFilter = (
  placed: ReadonlyArray<Placed>,
  only: Option.Option<string>,
): Result.Result<(scene: string) => boolean, UnknownScene> =>
  Option.match(only, {
    onNone: () => Result.succeed(() => true),
    onSome: (id) => Result.map(sceneOf(placed, id), (p) => (scene: string) => scene === p.spec.id),
  });

const lineOf = (p: Placed, events: EventTimes): string => {
  const marks = [...p.voice.marks].map(([k, v]) => `${k}@${(p.speechStart + v).toFixed(2)}`);
  const played = [...(events.get(p.spec.id) ?? new Map<string, number>())].map(
    ([k, at]) => `${k}@${at.toFixed(2)}`,
  );
  const speech = `${p.speechStart.toFixed(2)}–${(p.speechStart + p.voice.duration).toFixed(2)}`;
  const parts = [
    `${p.spec.id.padEnd(11)} start=${p.start.toFixed(2).padStart(7)} dur=${p.dur.toFixed(2).padStart(6)} speech=${speech} `,
  ];
  if (!p.voice.recorded) parts.push('(estimated) ');
  parts.push(marks.join(' '));
  if (played.length > 0) parts.push(` | events: ${played.join(' ')}`);
  return parts.join('');
};

/** Each scene's placement, marks and Events, in scene seconds. */
export const sceneReport = (
  placed: ReadonlyArray<Placed>,
  only: Option.Option<string>,
  events: EventTimes,
): Result.Result<ReadonlyArray<string>, UnknownScene> =>
  Result.map(sceneFilter(placed, only), (inScene) =>
    placed.filter((p) => inScene(p.spec.id)).map((p) => lineOf(p, events)),
  );

const anchorLabel = (cue: Cue): string =>
  Option.getOrElse(
    Option.orElse(Option.fromNullishOr(cue.event), () =>
      Option.map(Option.fromNullishOr(cue.mark), (mark) => `{${mark}}`),
    ),
    () => '',
  );
/** Each effect placement's film time. */
export const soundReport = (
  sound: Sound,
  placed: ReadonlyArray<Placed>,
  only: Option.Option<string>,
  events: EventTimes,
): Result.Result<ReadonlyArray<string>, SoundCueError> =>
  Result.gen(function* () {
    const inScene = yield* sceneFilter(placed, only);
    const lines: Array<string> = [];
    for (const [name, effect] of Object.entries(sound.effects))
      for (const cue of effect.at) {
        if (!inScene(cue.scene)) continue;
        const at = yield* cueTime(cue, placed, events);
        lines.push(
          `${name.padEnd(8)} ${cue.scene.padEnd(11)} ${at.toFixed(3).padStart(8)} ${anchorLabel(cue)}`,
        );
      }
    return lines;
  });
