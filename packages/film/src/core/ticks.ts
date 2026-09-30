// What the player marks on its timeline, in film seconds: every narration
// mark, every named cue's span, every sound effect placement and where every
// movement of the score begins. The same placements the renderer, the mixer and `film check`
// read, so the bar shows where things will land. Pure and DOM-free.

import { Option, Result } from 'effect';
import type { Placed } from './layout.ts';
import type { Sound } from './schema.ts';
import { cueTime } from './sound.ts';
import { stretchesOf } from './acts.ts';

export type TickKind = 'mark' | 'cue' | 'effect' | 'movement';

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
 * The film's ticks, in film order within each kind. An effect placement that
 * does not resolve is left off, and so are the movements when one names no
 * scene: `film check` reports them.
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
  const movements = Option.toArray(sound).flatMap((s) =>
    // The movements of the option the score plays, where their stretches start.
    Option.toArray(Option.fromNullishOr(s.score?.options[s.score.play])).flatMap((music) =>
      Result.match(stretchesOf(music.movements, placed), {
        onFailure: () => [],
        onSuccess: (stretches) =>
          stretches.map(({ part, from }): Tick => ({
            kind: 'movement',
            name: `movement ${part.name}`,
            at: from,
            dur: 0,
          })),
      }),
    ),
  );
  return [...movements, ...cues, ...marks, ...effects];
};
