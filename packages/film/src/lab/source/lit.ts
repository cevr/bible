// What the Source view lights at a frame, from the cues playing then
// (`liveAt`, core/timeline.ts) and where the scene's code writes and reads
// them (`SceneCode`): lit by the clock, never by what ran, so a link with
// `#t=` lights what its sender saw. Pure; the browser paints the ranges
// (`browser/highlights.ts`) and the view scrolls to `followLine`.

import { Array as Arr, Option } from 'effect';
import type { CodeRange, SceneCode } from '../../core/schema.ts';
import type { liveAt } from '../../core/timeline.ts';

/** The cues playing, as `liveAt` answers. */
type Live = ReturnType<typeof liveAt>;

/** A live cue's meter: its name, the line its literal is written on, and how far through it the clock is. */
interface Meter {
  readonly name: string;
  readonly line: number;
  readonly progress: number;
}

/** What is lit at a frame. */
export interface Lit {
  /** The playing cues' literals in the `timeline`. */
  readonly literals: ReadonlyArray<CodeRange>;
  /** The calls that read a playing cue by name. */
  readonly reads: ReadonlyArray<CodeRange>;
  /** One meter per playing cue the code writes as a literal. */
  readonly meters: ReadonlyArray<Meter>;
  /** The playing cues' names the code writes, in the order they play: what the view says is live. */
  readonly names: ReadonlyArray<string>;
}

/** Where each line of `text` starts, as offsets (line 1 first). */
export const lineStarts = (text: string): ReadonlyArray<number> => {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  return starts;
};

/** The line (from 1) `offset` falls on, given where the lines `starts`. */
export const lineOf = (starts: ReadonlyArray<number>, offset: number): number =>
  Math.max(1, starts.findLastIndex((s) => s <= offset) + 1);

/** What `live` lights in `code`. A cue the code does not write as a literal lights nothing. */
export const litNow = (code: SceneCode, live: Live): Lit => {
  const starts = lineStarts(code.text);
  const found = live.flatMap((l) =>
    Option.match(
      Arr.findFirst(code.cues, (c) => c.name === l.name),
      { onNone: () => [], onSome: (site) => [{ site, progress: l.progress }] },
    ),
  );
  return {
    literals: found.map(({ site }) => site.at),
    reads: found.flatMap(({ site }) => site.reads),
    meters: found.map(({ site, progress }) => ({
      name: site.name,
      line: lineOf(starts, site.at[0]),
      progress,
    })),
    names: found.map(({ site }) => site.name),
  };
};

/**
 * The line the view follows to: where the first playing cue is written, else
 * the first call that reads one. None when nothing playing is in the code.
 */
export const followLine = (code: SceneCode, lit: Lit): Option.Option<number> => {
  const starts = lineStarts(code.text);
  return Option.map(
    Option.orElse(Arr.head(lit.literals), () => Arr.head(lit.reads)),
    (range) => lineOf(starts, range[0]),
  );
};
