/**
 * When each sung line and syllable comes, from the file the recordings are
 * rendered from (so the recordings keep the same times).
 *
 * The compiler lays each stanza, with the refrain's lines after it where the
 * file plays them, on a verse of the file (`Laying`). The timing walks the
 * lines in sung order (`sung`) and gives each the times of where the file
 * plays it:
 * - a stanza's lines, the times of its laying;
 * - a refrain's singing, the times of the refrain laid after the stanza sung
 *   just before it (in before-each order, the refrain sung before stanza 2 is
 *   the one the file plays after stanza 1);
 * - a refrain sung before any stanza (first-and-after-each, first-and-last,
 *   before-each), which the file plays in its intro, if anywhere: the
 *   refrain's times placed to end where the first stanza starts, or even
 *   shares from the file's start when the intro is shorter; not `played`;
 * - a stanza the file does not play (laid again on its last verse): that
 *   verse's times moved past the file's end, one such stanza after another;
 *   not `played`.
 * A laying the compiler gave words alone (no trusted notes) has even shares
 * of its verse, and a line whose syllables do not match its laid notes in
 * number has even shares of its own time: both are `even`, as is every
 * `Plain` line.
 *
 * Pure: no file, Bun or Node access.
 */

import { type Hymn, PER_BEAT, type Timing, sung } from './hymn.js';

/** What the compiler laid stanza n on. */
export interface Laying {
  /** False for a stanza the file does not play, laid again on its last verse. */
  readonly played: boolean;
  /** The verse it is laid on, in the file's ticks: its first note's start to the next verse's. */
  readonly span: { readonly start: number; readonly end: number };
  /** The lines laid: the stanza's (`stanza` of them), then the refrain's after it (`tail`). */
  readonly stanza: number;
  readonly tail: number;
  /** Each laid line's syllable starts, in ticks; absent when laid as words alone. */
  readonly starts: ReadonlyArray<ReadonlyArray<number>> | undefined;
}

/** The file's clock: its resolution, tempo map and last tick. */
export interface Clock {
  readonly ticksPerBeat: number;
  readonly tempos: ReadonlyArray<{ readonly tick: number; readonly microsPerQuarter: number }>;
  readonly lastTick: number;
}

/** A MIDI file with no tempo event plays at 120 quarters a minute. */
const DEFAULT_TEMPO = 500_000;

/** A laid line in ticks: its start, the next laid line's start, its syllables' starts when trusted. */
interface Raw {
  readonly start: number;
  readonly next: number;
  readonly syllables: ReadonlyArray<number> | undefined;
  readonly even: boolean;
}

/** `count` even shares of [from, until), as `Raw` lines with no syllables. */
const evenRaw = (from: number, until: number, count: number): Raw[] => {
  const share = (until - from) / Math.max(1, count);
  return Array.from({ length: count }, (_, i) => ({
    start: from + i * share,
    next: from + (i + 1) * share,
    syllables: undefined,
    even: true,
  }));
};

/** A laying's lines in ticks, moved by `shift`: its notes when it has them for every line, else even shares. */
const rawOf = (laying: Laying, shift: number): Raw[] => {
  const count = laying.stanza + laying.tail;
  const starts = laying.starts;
  if (starts === undefined || starts.length !== count || starts.some((line) => line.length === 0))
    return evenRaw(laying.span.start + shift, laying.span.end + shift, count);
  return starts.map((line, i) => ({
    start: (line[0] ?? 0) + shift,
    next: (starts[i + 1]?.[0] ?? laying.span.end) + shift,
    syllables: line.map((tick) => tick + shift),
    even: false,
  }));
};

/** A laying on the timeline: its lines, and where its verse ends there. */
interface Placed {
  readonly laying: Laying;
  readonly lines: Raw[];
  readonly end: number;
}

/** Each laying placed: a played one where the file plays it, the others after the file's end in turn. */
const place = (layings: ReadonlyArray<Laying>, lastTick: number): Placed[] => {
  let after = lastTick;
  return layings.map((laying) => {
    const shift = laying.played ? 0 : after - laying.span.start;
    if (!laying.played) after += laying.span.end - laying.span.start;
    return { laying, lines: rawOf(laying, shift), end: laying.span.end + shift };
  });
};

type Line = ReturnType<typeof sung>[number];

/** Each sung line with the laid line the file plays it as: none for a refrain sung before any stanza. */
const sourcesOf = (hymn: Hymn, placed: ReadonlyArray<Placed>) => {
  let stanza = 0;
  return sung(hymn).map((line) => {
    if (line.verse !== 'refrain') stanza = line.verse;
    const at = placed[stanza - 1];
    const index =
      line.verse !== 'refrain'
        ? line.line
        : at?.laying.tail === 0
          ? -1
          : (at?.laying.stanza ?? 0) + line.line;
    const raw = at?.lines[index];
    return { line, at: raw === undefined ? undefined : at, raw };
  });
};

/**
 * The refrain sung before any stanza: the refrain as the file plays it
 * after its first stanza with one, moved to end at `intro`; even shares when
 * it does not fit there (of the intro's last refrain-length, or of all the
 * intro when that is shorter).
 */
const firstRefrain = (placed: ReadonlyArray<Placed>, count: number, intro: number): Raw[] => {
  const at = placed.find((one) => one.laying.tail > 0);
  const lines = at === undefined ? [] : at.lines.slice(at.laying.stanza);
  const head = lines[0];
  const length =
    at === undefined || head === undefined ? Number.POSITIVE_INFINITY : at.end - head.start;
  if (head === undefined || length > intro || lines.length !== count)
    return evenRaw(length > intro ? 0 : intro - length, intro, count);
  const move = (tick: number) => tick - head.start + intro - length;
  return lines.map((raw) => ({
    start: move(raw.start),
    next: move(raw.next),
    syllables: raw.syllables?.map(move),
    even: raw.even,
  }));
};

/** A sung line's syllables from its laid line: the laid notes when they match in number, else even shares. */
const syllablesOf = (line: Line, raw: Raw) => {
  if (line.part._tag === 'Plain') return { syllables: [], even: true };
  const count = line.part.lines[line.line]?.length ?? 0;
  if (!raw.even && raw.syllables !== undefined && raw.syllables.length === count)
    return { syllables: [...raw.syllables], even: false };
  return { syllables: evenRaw(raw.start, raw.next, count).map((one) => one.start), even: true };
};

/** The tempo map in `PER_BEAT` units: at each time the last event there, from time 0. */
const temposOf = (clock: Clock, unit: (tick: number) => number): Array<[number, number]> => {
  const out: Array<[number, number]> = [[0, DEFAULT_TEMPO]];
  for (const tempo of clock.tempos) {
    const at = unit(tempo.tick);
    const last = out.at(-1);
    if (last !== undefined && last[0] === at) last[1] = tempo.microsPerQuarter;
    else out.push([at, tempo.microsPerQuarter]);
  }
  return out;
};

/** A hymn's timing, from the clock of its file and what each stanza was laid on (by stanza). */
export const timingOf = (hymn: Hymn, clock: Clock, layings: ReadonlyArray<Laying>): Timing => {
  const unit = (tick: number) => Math.round((tick * PER_BEAT) / clock.ticksPerBeat);
  const placed = place(layings, clock.lastTick);
  const sources = sourcesOf(hymn, placed);
  const playedStarts = sources.flatMap(({ at, raw }) =>
    at?.laying.played === true && raw !== undefined ? [raw.start] : [],
  );
  const intro = playedStarts.length === 0 ? 0 : Math.min(...playedStarts);
  const first = firstRefrain(placed, hymn.refrain?.part.lines.length ?? 0, intro);
  const entries = sources.map(({ line, at, raw }) => {
    const from = raw ?? first[line.line] ?? evenRaw(intro, intro, 1)[0];
    const end = at === undefined ? intro : at.laying.played ? clock.lastTick : at.end;
    return {
      start: from?.start ?? intro,
      ...(from === undefined ? { syllables: [], even: true } : syllablesOf(line, from)),
      played: at?.laying.played ?? false,
      end,
    };
  });
  const lines = entries.map((entry, i) => {
    const start = unit(entry.start);
    return {
      start,
      until: Math.max(start, unit(entries[i + 1]?.start ?? entry.end)),
      syllables: entry.syllables.map(unit),
      played: entry.played,
      even: entry.even,
    };
  });
  return {
    perBeat: PER_BEAT,
    tempos: temposOf(clock, unit),
    intro: unit(intro),
    end: unit(clock.lastTick),
    lines,
  };
};

/**
 * Seconds from the file's start at a time in `PER_BEAT` units, through the
 * tempo map: each tempo holds from its time to the next.
 */
export const secondsAt =
  (timing: Pick<Timing, 'perBeat' | 'tempos'>) =>
  (time: number): number => {
    let micros = 0;
    let from = 0;
    let tempo = DEFAULT_TEMPO;
    for (const [at, us] of timing.tempos) {
      if (at > time) break;
      micros += (at - from) * tempo;
      from = at;
      tempo = us;
    }
    return (micros + (time - from) * tempo) / 1e6 / timing.perBeat;
  };
