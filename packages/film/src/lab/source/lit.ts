// What the Source view lights at a frame, from its scene's clock then (the
// cues playing, `liveAt` in core/timeline.ts, and the marks said), the names
// the frame read off it (`Player.hearClock`), and where the scene's code
// writes and reads them (`SceneCode`). A cue's literal is lit by the clock
// alone, as the strip's lane is. A read of the clock fires while the frame
// read its name and the clock plays it (a cue's read while its cue is live,
// a mark's on its word's frame, a `spoken` read from its mark to its end),
// and its line glows while one fires and fades over `TRAIL` after; the band
// over the code names the beat the frame is on. Each is a pure function of
// the frame (the same frame reads the same names), so a link with `#t=`
// lights what its sender saw. The browser paints the ranges
// (`browser/highlights.ts`), the view scrolls to `followLine`, and a tap
// seeks to `nextFiring`.

import { Array as Arr, Option, Order } from 'effect';
import { lastLineOf, lineOf, lineStarts } from '../../core/lines.ts';
import type { CodeRange, NoteSource, ResolvedCue, SceneCode } from '../../core/schema.ts';
import { type LabSelection, cueOf, knobOf } from '../../command/selection.ts';
import { type SceneClock, liveAt, liveEnd } from '../../core/timeline.ts';

/** Film seconds a line glows on after what fired on it ends, fading to nothing. */
const TRAIL = 0.6;

/** A scene's voice as its clock reads it: each `{mark}`, from the start of speech, and where speech starts and ends (`sceneClock`). */
type Voice = Pick<SceneClock, 'marks' | 'speechStart' | 'speechEnd'>;

/** A frame as the code is lit at it: its scene's clock at the frame's time, and the names the frame read off it. */
interface CodeClock {
  /** Scene seconds of the frame. */
  readonly t: number;
  /** The film's frames a second: a cue of no length plays on one, and a mark is said on one. */
  readonly fps: number;
  /** The scene's cues as the preview draws them (`StageOps.cuesOf`). */
  readonly cues: ReadonlyMap<string, ResolvedCue>;
  readonly voice: Voice;
  /** The names the frame read off the scene's clock (`Player.hearClock`). */
  readonly heard: { readonly cues: ReadonlySet<string>; readonly marks: ReadonlySet<string> };
}

/** A live cue's meter: its name, the line its literal is written on, and how far through it the clock is. */
interface Meter {
  readonly name: string;
  readonly line: number;
  readonly progress: number;
}

/** A stretch of the scene's clock a read plays over, `[start, end)` in scene seconds. */
interface Span {
  readonly start: number;
  readonly end: number;
}

/** A call that reads the clock by name: where it is written, what it plays over, and whether the frame read the name. */
interface ClockRead {
  readonly at: CodeRange;
  readonly span: Span;
  readonly heard: boolean;
  /** Whether it plays over a stretch (a cue's read, a `spoken` read), not an instant (a mark's): what Follow follows. */
  readonly lasts: boolean;
}

/** The one frame an instant plays on, from `at`. */
const instant = (at: number, fps: number): Span => ({ start: at, end: at + 1 / fps });

/** How brightly a read playing over `span` glows at `t`: 1 inside it, fading over `TRAIL` after, nothing before. */
const glowOf = (span: Span, t: number): number => {
  if (t < span.start) return 0;
  if (t < span.end) return 1;
  return Math.max(0, 1 - (t - span.end) / TRAIL);
};

/** Where `voice` says mark `name`, in scene seconds; none for a mark it does not say. */
const saidAt = (voice: Voice, name: string): Option.Option<number> =>
  Option.map(Option.fromUndefinedOr(voice.marks.get(name)), (at) => voice.speechStart + at);

/**
 * Every call in `code` that reads the clock by a name its scene plays: a
 * cue's read over the cue (`liveEnd`), a mark's read on its word's frame, a
 * `spoken` read from its mark to the mark it names, else to the end of
 * speech. A `spoken` read whose end is not after its mark holds no word: it
 * reads 0 until that end and 1 from it, so it plays on the frame there, an
 * instant, as a mark's read. A name the scene does not play reads nothing.
 */
const clockReads = (code: SceneCode, clock: CodeClock): ReadonlyArray<ClockRead> => [
  ...code.cues.flatMap((c) =>
    Option.match(Option.fromUndefinedOr(clock.cues.get(c.name)), {
      onNone: () => [],
      onSome: (cue) => {
        const span = { start: cue.start, end: liveEnd(cue, clock.fps) };
        const heard = clock.heard.cues.has(c.name);
        return c.reads.map((at) => ({ at, span, heard, lasts: true }));
      },
    }),
  ),
  ...code.marks.flatMap((m) =>
    Option.match(saidAt(clock.voice, m.name), {
      onNone: () => [],
      onSome: (said) => {
        const heard = clock.heard.marks.has(m.name);
        const once = instant(said, clock.fps);
        return [
          ...m.reads.map((at) => ({ at, span: once, heard, lasts: false })),
          ...m.speaks.flatMap((s) => {
            const end = Option.match(Option.fromUndefinedOr(s.to), {
              onNone: () => Option.some(clock.voice.speechEnd),
              onSome: (to) => saidAt(clock.voice, to),
            });
            return Option.toArray(
              Option.map(end, (e) =>
                Option.match(
                  Option.liftPredicate(e, (after) => after > said),
                  {
                    onSome: (after) => ({
                      at: s.at,
                      span: { start: said, end: after },
                      heard,
                      lasts: true,
                    }),
                    onNone: () => ({ at: s.at, span: instant(e, clock.fps), heard, lasts: false }),
                  },
                ),
              ),
            );
          }),
        ];
      },
    }),
  ),
];

/** Whether `read` fires at `t`: the frame read its name, and the clock plays it. */
const fires = (read: ClockRead, t: number): boolean =>
  read.heard && t >= read.span.start && t < read.span.end;

/** Where the view may follow to: a read of the clock or a cue's literal, where it is written, and when what it plays began. */
interface Lead {
  readonly at: CodeRange;
  readonly start: number;
  /** A read of the clock the frame made, not a literal. */
  readonly read: boolean;
}

/** What began last first; of two that began together, a read before a literal, then the one written first. */
const LATEST = Order.combine(
  Order.combine(
    Order.flip(Order.mapInput(Order.Number, (l: Lead) => l.start)),
    Order.flip(Order.mapInput(Order.Boolean, (l: Lead) => l.read)),
  ),
  Order.mapInput(Order.Number, (l: Lead) => l.at[0]),
);

/**
 * What the view follows at `clock`'s frame: of the reads the frame made that
 * play over a stretch (a cue's read, a `spoken` read; a mark's instant is one
 * frame and moves nothing) and the literals of the cues the code writes,
 * whichever began last by the frame, playing or not (`LATEST`). So the view
 * moves only as something begins: an end never takes it back to an older read
 * still firing, and a still frame (a pause, a step, a link) is placed where
 * the playing frame before it was. None before anything has begun.
 */
const leadOf = (
  code: SceneCode,
  clock: CodeClock,
  reads: ReadonlyArray<ClockRead>,
): Option.Option<CodeRange> =>
  Option.map(
    Arr.head(
      Arr.sort(
        [
          ...reads
            .filter((r) => r.heard && r.lasts && r.span.start <= clock.t)
            .map((r): Lead => ({ at: r.at, start: r.span.start, read: true })),
          ...code.cues.flatMap((c) =>
            Option.toArray(
              Option.map(
                Option.filter(
                  Option.fromUndefinedOr(clock.cues.get(c.name)),
                  (cue) => cue.start <= clock.t,
                ),
                (cue): Lead => ({ at: c.at, start: cue.start, read: false }),
              ),
            ),
          ),
        ],
        LATEST,
      ),
    ),
    (l) => l.at,
  );

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
  /** The playing cues' literals in the `timeline`: lit by the clock alone, as the strip's lanes are. */
  readonly literals: ReadonlyArray<CodeRange>;
  /** The reads of the clock firing: the frame read the name, and the clock plays it. */
  readonly reads: ReadonlyArray<CodeRange>;
  /** The literals and calls of the knobs the frame read. */
  readonly knobs: ReadonlyArray<CodeRange>;
  /** The selected cue's or knob's literal. */
  readonly picked: ReadonlyArray<CodeRange>;
  /** One meter per playing cue the code writes as a literal. */
  readonly meters: ReadonlyArray<Meter>;
  /** The playing cues' names the code writes, in the order they play: what the view says is live. */
  readonly names: ReadonlyArray<string>;
  /** Each line a read of the clock glows on, by its number, and how brightly: 1 while one fires, fading over `TRAIL` after. */
  readonly glows: ReadonlyMap<number, number>;
  /** The read the frame made, or the literal, that began last by the frame, playing or not: what the view follows (`leadOf`). */
  readonly lead: Option.Option<CodeRange>;
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

/** Each line a heard read glows on, at the brightest of its reads there (`glowOf`). */
const glowsOn = (
  code: SceneCode,
  reads: ReadonlyArray<ClockRead>,
  t: number,
): ReadonlyMap<number, number> =>
  reads
    .filter((r) => r.heard)
    .reduce((glows, r) => {
      const glow = glowOf(r.span, t);
      if (glow <= 0) return glows;
      const line = lineAt(code, r.at[0]);
      const had = Option.getOrElse(Option.fromUndefinedOr(glows.get(line)), () => 0);
      return glows.set(line, Math.max(glow, had));
    }, new Map<number, number>());

/**
 * What `code` lights at `clock`'s frame, and `picks` besides: the playing
 * cues' literals, the reads of the clock firing and the lines they glow on,
 * the selection's literal, and the knobs the frame read. A cue the code does
 * not write as a literal lights no literal.
 */
export const litNow = (code: SceneCode, clock: CodeClock, picks: Picks = NO_PICKS): Lit => {
  const found = liveAt(clock.cues, clock.t, clock.fps).flatMap((l) =>
    Option.match(
      Arr.findFirst(code.cues, (c) => c.name === l.name),
      { onNone: () => [], onSome: (site) => [{ site, progress: l.progress }] },
    ),
  );
  const readKnobs = code.knobs.filter((k) => picks.read.includes(k.name));
  const reads = clockReads(code, clock);
  const firing = reads.filter((r) => fires(r, clock.t));
  return {
    literals: found.map(({ site }) => site.at),
    reads: firing.map((r) => r.at),
    knobs: readKnobs.flatMap((k) => [k.at, ...k.reads]),
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
    glows: glowsOn(code, reads, clock.t),
    lead: leadOf(code, clock, reads),
  };
};

/**
 * What the band over the code says plays in `code`: the playing cues' names; else,
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

/**
 * The beat the frame is on, as the band over the code names it: the scene,
 * and the mark its voice last said by scene time `t`, `cold · {job}`; the
 * scene alone before its first mark.
 */
export const beatWords = (scene: string, voice: Voice, t: number): string =>
  Option.match(
    Option.map(
      Arr.last(
        Arr.sort(
          [...voice.marks].filter(([, at]) => voice.speechStart + at <= t),
          Order.mapInput(Order.Number, ([, at]: readonly [string, number]) => at),
        ),
      ),
      ([name]) => name,
    ),
    { onNone: () => scene, onSome: (mark) => `${scene} · {${mark}}` },
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
 * The line the view follows to: where the read the frame made, or the
 * literal, that began last by the frame is written (`Lit.lead`: of two that
 * began together, a read before a literal, then the one written first), so
 * the view moves only as something begins, and between reads and after them
 * it keeps to the last, its trail fading in sight; else, before anything has
 * begun, where the selected cue or knob is written; else where the first knob
 * the frame read is written (or read). None when the code lights nothing.
 */
export const followLine = (code: SceneCode, lit: Lit): Option.Option<number> => {
  const lineOfRange = (range: CodeRange) => lineAt(code, range[0]);
  return Option.firstSomeOf([
    Option.map(lit.lead, lineOfRange),
    Option.map(Arr.head(lit.picked), lineOfRange),
    Option.map(Arr.head(lit.knobs), lineOfRange),
  ]);
};

/**
 * Where a tap on `line` of `code` seeks, in scene seconds: into the next
 * start after `clock`'s time of what the line reads or writes off the clock
 * (a cue's read or its literal, a mark's read, a `spoken` read), half a frame
 * in, or halfway through what plays there when that is shorter (a cue of a
 * few milliseconds), so the frame it lands on plays it whatever the sum's
 * rounding; past the last, the first, so taps go round. Heard or not, as a
 * frame to come may take a branch the frame shown did not. None for a line
 * that reads and writes nothing the scene plays.
 */
export const nextFiring = (
  code: SceneCode,
  line: number,
  clock: CodeClock,
): Option.Option<number> => {
  const on = (at: CodeRange) => lineAt(code, at[0]) === line;
  const spans = Arr.sort(
    [
      ...clockReads(code, clock)
        .filter((r) => on(r.at))
        .map((r) => r.span),
      ...code.cues
        .filter((c) => on(c.at))
        .flatMap((c) =>
          Option.toArray(
            Option.map(Option.fromUndefinedOr(clock.cues.get(c.name)), (cue): Span => ({
              start: cue.start,
              end: liveEnd(cue, clock.fps),
            })),
          ),
        ),
    ],
    Order.mapInput(Order.Number, (s: Span) => s.start),
  );
  return Option.map(
    Option.orElse(
      Arr.findFirst(spans, (s) => s.start > clock.t),
      () => Arr.head(spans),
    ),
    (s) => s.start + Math.min(0.5 / clock.fps, (s.end - s.start) / 2),
  );
};
