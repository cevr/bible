// What the Source view lights at a frame, from the cues playing then
// (`liveAt`, core/timeline.ts) and where the scene's code writes and reads
// them (`SceneCode`): lit by the clock, never by what ran, so a link with
// `#t=` lights what its sender saw. Pure; the browser paints the ranges
// (`browser/highlights.ts`) and the view scrolls to `followLine`.

import { Array as Arr, Option } from 'effect';
import { lastLineOf, lineOf, lineStarts } from '../../core/lines.ts';
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

/** Each code read's line starts, counted once however many frames, taps and links ask. */
const STARTS = new WeakMap<SceneCode, ReadonlyArray<number>>();

/** Where each line of `code`'s text starts, as offsets (line 1 first): counted once per code read. */
const startsOf = (code: SceneCode): ReadonlyArray<number> =>
  Option.getOrElse(Option.fromUndefinedOr(STARTS.get(code)), () => {
    const starts = lineStarts(code.text);
    STARTS.set(code, starts);
    return starts;
  });

/** The line (from 1) of `code` that offset `at` falls on. */
export const lineAt = (code: SceneCode, at: number): number => lineOf(startsOf(code), at);

/** The last line (from 1) of `code`'s file: what a held line past it holds. */
export const lastLine = (code: SceneCode): number => lastLineOf(code.text, startsOf(code));

/** One row of the file: its number, its text, and where the text starts in the whole. */
interface Row {
  readonly n: number;
  readonly from: number;
  readonly text: string;
}

/** `code`'s file a row to a line, to its `lastLine`: the newline that ends the file starts no row. */
export const rowsOf = (code: SceneCode): ReadonlyArray<Row> => {
  const text = code.text;
  const starts = startsOf(code);
  return starts.slice(0, lastLine(code)).map((from, i) => ({
    n: i + 1,
    from,
    text: text.slice(
      from,
      Option.getOrElse(Option.fromUndefinedOr(starts[i + 1]), () => text.length + 1) - 1,
    ),
  }));
};

/**
 * The line (from 1) `line` of `code`, as a note cites it: its file, its
 * number and its text trimmed of the indent; none for a line the file does
 * not have or one that is blank.
 */
export const lineSite = (code: SceneCode, line: number): Option.Option<NoteSource> => {
  const starts = startsOf(code);
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
      line: lineAt(code, site.at[0]),
      progress,
    })),
    names: found.map(({ site }) => site.name),
  };
};

/**
 * What the view's head says plays in `code`: the playing cues' names; else,
 * where the code lists no literal for a field (`refused`), why it lights
 * none, so a strip lit beside an unlit view is never called "nothing
 * playing"; else that nothing plays.
 */
export const liveWords = (code: SceneCode, lit: Lit): string =>
  Option.getOrElse(
    Option.orElse(
      Option.liftPredicate(lit.names.join(' · '), (words) => words !== ''),
      () =>
        Option.liftPredicate(
          code.refused.map((r) => `${r.field} not lit: ${r.reason}`).join(' · '),
          (words) => words !== '',
        ),
    ),
    () => 'nothing playing',
  );

/** Every meter of the playing literals written on `line`: a line that writes two playing cues wears both. */
export const metersOn = (meters: ReadonlyArray<Meter>, line: number): ReadonlyArray<Meter> =>
  meters.filter((m) => m.line === line);

/**
 * The cue or knob whose literal `code` writes on `line`: what a tap on that
 * line selects. A cue wins a line a knob shares; none for any other line.
 */
export const selectionAt = (code: SceneCode, line: number): Option.Option<LabSelection> => {
  const on = (site: { readonly at: CodeRange }) => lineAt(code, site.at[0]) === line;
  return Option.orElse(
    Option.map(Arr.findFirst(code.cues, on), (c) => cueOf(code.scene, c.name)),
    () => Option.map(Arr.findFirst(code.knobs, on), (k) => knobOf(code.scene, k.name)),
  );
};

/**
 * The line the view follows to: where the first playing cue is written; else,
 * with nothing playing, where the selected cue or knob is written; else the
 * first range lit as a read (with nothing playing, a knob the frame read,
 * where it is written or read). None when the code lights nothing.
 */
export const followLine = (code: SceneCode, lit: Lit): Option.Option<number> =>
  Option.map(
    Option.orElse(
      Option.orElse(Arr.head(lit.literals), () => Arr.head(lit.picked)),
      () => Arr.head(lit.reads),
    ),
    (range) => lineAt(code, range[0]),
  );
