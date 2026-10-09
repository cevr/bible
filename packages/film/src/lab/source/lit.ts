// What the Source view lights at a frame, from the cues playing then
// (`liveAt`, core/timeline.ts) and where the scene's code writes and reads
// them (`SceneCode`): lit by the clock, never by what ran, so a link with
// `#t=` lights what its sender saw. Pure; the browser paints the ranges
// (`browser/highlights.ts`) and the view scrolls to `followLine`.

import { Array as Arr, Option } from 'effect';
import type { CodeRange, NoteSource, SceneCode } from '../../core/schema.ts';
import { type LabSelection, cueOf, knobOf } from '../../command/selection.ts';
import type { liveAt } from '../../core/timeline.ts';

/** The cues playing, as `liveAt` answers. */
type Live = ReturnType<typeof liveAt>;

/** A live cue's meter: its name, the line its literal is written on, and how far through it the clock is. */
interface Meter {
  readonly name: string;
  readonly line: number;
  readonly progress: number;
}

/** What the lab has picked or the frame read, besides what plays: the Source view lights these too. */
export interface Picks {
  /** The cue selected, by name. */
  readonly cue: Option.Option<string>;
  /** The knob selected, by name. */
  readonly knob: Option.Option<string>;
  /** The knobs the frame shown read, by name (`player.knobReads()`). */
  readonly read: ReadonlyArray<string>;
}

/** Nothing picked, nothing read. */
const NO_PICKS: Picks = { cue: Option.none(), knob: Option.none(), read: [] };

/** What is lit at a frame. */
export interface Lit {
  /** The playing cues' literals in the `timeline`. */
  readonly literals: ReadonlyArray<CodeRange>;
  /** The calls that read a playing cue by name, and the literals and calls of the knobs the frame read. */
  readonly reads: ReadonlyArray<CodeRange>;
  /** The selected cue's or knob's literal. */
  readonly picked: ReadonlyArray<CodeRange>;
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

/**
 * The line (from 1) `line` of `code`, as a note cites it: its file, its
 * number and its text trimmed of the indent; none for a line the file does
 * not have or one that is blank.
 */
export const lineSite = (code: SceneCode, line: number): Option.Option<NoteSource> => {
  const starts = lineStarts(code.text);
  return Option.flatMap(Option.fromUndefinedOr(starts[line - 1]), (from) =>
    Option.map(
      Option.liftPredicate(
        code.text
          .slice(
            from,
            Option.getOrElse(Option.fromUndefinedOr(starts[line]), () => code.text.length),
          )
          .trim(),
        (text) => text !== '',
      ),
      (text): NoteSource => ({ file: code.file, line, text }),
    ),
  );
};

/**
 * What `live` lights in `code`, and `picks` besides: the selection's literal,
 * and the knobs the frame read. A cue the code does not write as a literal
 * lights nothing.
 */
export const litNow = (code: SceneCode, live: Live, picks: Picks = NO_PICKS): Lit => {
  const starts = lineStarts(code.text);
  const found = live.flatMap((l) =>
    Option.match(
      Arr.findFirst(code.cues, (c) => c.name === l.name),
      { onNone: () => [], onSome: (site) => [{ site, progress: l.progress }] },
    ),
  );
  const readKnobs = code.knobs.filter((k) => picks.read.includes(k.name));
  return {
    literals: found.map(({ site }) => site.at),
    reads: [
      ...found.flatMap(({ site }) => site.reads),
      ...readKnobs.flatMap((k) => [k.at, ...k.reads]),
    ],
    picked: [
      ...Option.toArray(
        Option.flatMap(picks.cue, (name) => Arr.findFirst(code.cues, (c) => c.name === name)),
      ),
      ...Option.toArray(
        Option.flatMap(picks.knob, (name) => Arr.findFirst(code.knobs, (k) => k.name === name)),
      ),
    ].map((site) => site.at),
    meters: found.map(({ site, progress }) => ({
      name: site.name,
      line: lineOf(starts, site.at[0]),
      progress,
    })),
    names: found.map(({ site }) => site.name),
  };
};

/**
 * The cue or knob whose literal `code` writes on `line`: what a tap on that
 * line selects. A cue wins a line a knob shares; none for any other line.
 */
export const selectionAt = (code: SceneCode, line: number): Option.Option<LabSelection> => {
  const starts = lineStarts(code.text);
  const on = (site: { readonly at: CodeRange }) => lineOf(starts, site.at[0]) === line;
  return Option.orElse(
    Option.map(Arr.findFirst(code.cues, on), (c) => cueOf(code.scene, c.name)),
    () => Option.map(Arr.findFirst(code.knobs, on), (k) => knobOf(code.scene, k.name)),
  );
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
