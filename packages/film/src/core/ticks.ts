// What the player marks on its timeline, in film seconds: every narration
// mark, every named cue's span, every sound effect placement and every music
// act boundary. The same placements the renderer, the mixer and `film check`
// read, so the bar shows where things will land. Pure and DOM-free.

import { Array as Arr, Option, Result } from 'effect';
import type { Placed } from './layout.ts';
import type { Sound } from './schema.ts';
import { cueTime } from './sound.ts';

export type TickKind = 'mark' | 'cue' | 'effect' | 'act';

export interface Tick {
  readonly kind: TickKind;
  /** What a hover shows: the scene and the moment's name. */
  readonly name: string;
  /** Film seconds. */
  readonly at: number;
  /** Seconds it lasts (a cue's span; 0 for an instant). */
  readonly dur: number;
}

/**
 * The film's ticks, in film order within each kind. An effect placement or an
 * act that does not resolve is left off: `film check` reports it.
 */
export const timelineTicks = (
  placed: ReadonlyArray<Placed>,
  sound: Option.Option<Sound>,
): ReadonlyArray<Tick> => {
  const marks = placed.flatMap((p) =>
    [...p.voice.marks].map(([name, at]): Tick => ({
      kind: 'mark',
      name: `${p.spec.id} {${name}}`,
      at: p.start + p.speechStart + at,
      dur: 0,
    })),
  );
  const cues = placed.flatMap((p) =>
    [...p.cues].map(([name, c]): Tick => ({
      kind: 'cue',
      name: `${p.spec.id} cue ${name}`,
      at: p.start + c.start,
      dur: c.dur,
    })),
  );
  const effects = Option.toArray(sound).flatMap((s) =>
    Object.entries(s.effects).flatMap(([name, effect]) =>
      effect.at.flatMap((cue) =>
        Result.match(cueTime(cue, placed), {
          onFailure: () => [],
          onSuccess: (at): Array<Tick> => [
            { kind: 'effect', name: `${name} · ${cue.scene}`, at, dur: 0 },
          ],
        }),
      ),
    ),
  );
  const acts = Option.toArray(sound).flatMap((s) =>
    // The acts of the option the score plays.
    Option.toArray(Option.fromNullishOr(s.score?.options[s.score.play])).flatMap((music) =>
      music.acts.flatMap((act, i) => {
        // The first act opens the film, wherever it names.
        const opening: Tick = { kind: 'act', name: `act ${act.name}`, at: 0, dur: 0 };
        if (i === 0) return [opening];
        return Option.toArray(
          Option.map(
            Arr.findFirst(placed, (p) => p.spec.id === act.from),
            (p): Tick => ({ kind: 'act', name: `act ${act.name}`, at: p.start, dur: 0 }),
          ),
        );
      }),
    ),
  );
  return [...acts, ...cues, ...marks, ...effects];
};
