/**
 * A verse's words laid on its melody: each syllable on the note it starts
 * on and the notes it holds through (a melisma), as a hymnal prints the
 * words under the notes.
 *
 * The placement is the cheapest of all that keep the words in order and
 * give every note a syllable. A note continues the syllable before it most
 * cheaply where the other voices hold (the tune moves alone), where it ends
 * an even pair of short notes, and off the bar's first beat; never across a
 * rest. The tune pauses (a rest or a long note) where the words do: after a
 * line, and less surely after a comma or a stop inside one. An unstressed
 * syllable (the, a-far) starts off the bar's strong beats. When the
 * words have more syllables than the tune has notes, a word sung shorter
 * (glo-rious) puts two of its syllables on one note.
 */

import type { Note } from './midi.js';
import type { Score } from './score.js';
import * as Syllables from './syllables.js';

export interface Syllable {
  /** The piece printed under the note, punctuation kept: "Al", "might", "y,". */
  readonly text: string;
  /** The word's place in its line. */
  readonly word: number;
  /** The first note it is sung on, by its place in the verse's melody. */
  readonly note: number;
  /** The notes it is sung on: more than one for a melisma, none when it shares the note before. */
  readonly notes: number;
}

export interface Alignment {
  readonly lines: ReadonlyArray<ReadonlyArray<Syllable>>;
  /** The verse's melody, one note per place. */
  readonly melody: readonly Note[];
  /** Notes that continue a syllable. */
  readonly melismas: number;
  /** Syllables sung on the note before them, within a word and across words. */
  readonly shared: { readonly inWord: number; readonly acrossWords: number };
  /** The placement's cost: lower is likelier. */
  readonly cost: number;
}

interface Planned {
  readonly line: number;
  readonly word: number;
  readonly text: string;
  readonly lineStart: boolean;
  /** Whether the words pause after it: its word ends in a comma or a stop. */
  readonly pauses: boolean;
  /** Whether it is stressed, when the dictionary knows. */
  readonly stressed: boolean | undefined;
  /** Whether it may share the note before: a later syllable of a word that may be sung shorter. */
  readonly mayShare: boolean;
}

const COST = {
  hold: 1,
  alone: -0.6,
  evenPair: -0.3,
  short: -0.2,
  repeat: 1,
  downbeat: 0.5,
  lineInPhrase: 0.8,
  pauseInPhrase: 0,
  breakInWords: 0,
  restInWords: 0.6,
  weakOnStrong: 0.2,
  shareInWord: 0.5,
  shareAcross: 3,
} as const;

/** A line's words: tokens with letters, punctuation-only tokens kept on the word before. */
const wordsOf = (line: string): string[] =>
  line
    .split(/\s+/)
    .filter((token) => token !== '')
    .reduce<string[]>((words, token) => {
      const last = words.length - 1;
      if (!/[a-z]/i.test(token) && last >= 0) words[last] = `${words[last]} ${token}`;
      else words.push(token);
      return words;
    }, []);

const plan = (lines: readonly string[]): Planned[] =>
  lines.flatMap((line, l) =>
    wordsOf(line).flatMap((word, w) => {
      // The most syllables the word may take: the walk merges them where the tune has fewer notes.
      const counts = Syllables.counts(word);
      const pieces = Syllables.split(word, Math.max(1, ...counts));
      const shorter = counts.some((count) => count < pieces.length);
      const stresses = Syllables.stresses(word, pieces.length);
      return pieces.map((text, p) => ({
        line: l,
        word: w,
        text,
        lineStart: w === 0 && p === 0,
        pauses: p === pieces.length - 1 && /[,;:.!?]["'’”)]*$/.test(word),
        stressed: stresses?.[p],
        mayShare: shorter && p > 0,
      }));
    }),
  );

/**
 * How strong a beat a tick falls on: 2 the bar's first, 1 the middle of a
 * bar of two or four beats, 0.5 another beat, 0 between beats. The files
 * pad a pickup with silence, so bars count from the file's first tick, and
 * from each change of meter.
 */
const strength = (score: Score, tick: number): number => {
  const beat = score.ticksPerBeat;
  const meter = score.meters.findLast((m) => m.tick <= tick) ?? { ...score.meter, tick: 0 };
  const { numerator, denominator } = meter;
  const compound = denominator === 8 && numerator % 3 === 0;
  const pulse = compound ? 1.5 * beat : (4 / denominator) * beat;
  const pulses = compound ? numerator / 3 : numerator;
  const bar = (beat * 4 * numerator) / denominator;
  const near = (at: number) => Math.abs(at - Math.round(at)) * pulse < beat / 16;
  const place = ((tick - meter.tick) % bar) / pulse;
  if (!near(place)) return 0;
  const at = Math.round(place) % pulses;
  if (at === 0) return 2;
  return pulses % 2 === 0 && at === pulses / 2 ? 1 : 0.5;
};

/** A verse's notes and, for each, whether a phrase ends before it and what holding it costs. */
const notesOf = (score: Score, verse: number) => {
  const { start, end } = score.verses.spans[verse] ?? { start: 0, end: 0 };
  const beat = score.ticksPerBeat;
  const melody = score.melody.filter((note) => note.start >= start && note.start < end);
  const long = score.meter.denominator === 8 ? 1.5 * beat : 2 * beat;
  const rests = melody.map((note, j) => {
    const before = melody[j - 1];
    return before !== undefined && note.start - before.end >= beat / 4;
  });
  const breaks = melody.map((note, j) => {
    const before = melody[j - 1];
    return before === undefined || rests[j] === true || note.start - before.start >= long;
  });
  const hold = melody.map((note, j) => {
    const before = melody[j - 1];
    if (before === undefined || rests[j] === true) return Number.POSITIVE_INFINITY;
    // The files strike a chord's notes up to a few ticks apart.
    const alone = !score.harmony.some(
      (other) =>
        other !== note && Math.abs(other.start - note.start) <= beat / 16 && other.key < note.key,
    );
    const length = note.end - note.start;
    const even = length <= beat && Math.abs(before.end - before.start - length) < beat / 8;
    const downbeat = strength(score, note.start) === 2;
    return (
      COST.hold +
      (alone ? COST.alone : 0) +
      (even ? COST.evenPair : 0) +
      (length < beat ? COST.short : 0) +
      (before.key === note.key ? COST.repeat : 0) +
      (downbeat ? COST.downbeat : 0)
    );
  });
  const strong = melody.map((note) => strength(score, note.start));
  return { melody, rests, breaks, hold, strong };
};

type Step = 'hold' | 'start' | 'share';
type Notes = ReturnType<typeof notesOf>;

/**
 * What starting a syllable on note j costs, after the syllable before it:
 * the tune should pause there exactly when the words do, and its strong
 * beats carry stressed syllables.
 */
const startCost = (notes: Notes, before: Planned | undefined, syllable: Planned, j: number) => {
  const weak = syllable.stressed === false ? COST.weakOnStrong * (notes.strong[j] ?? 0) : 0;
  if (before === undefined) return weak;
  if (notes.breaks[j] !== true) {
    if (syllable.lineStart) return weak + COST.lineInPhrase;
    return weak + (before.pauses ? COST.pauseInPhrase : 0);
  }
  if (syllable.lineStart || before.pauses) return weak;
  return weak + (notes.rests[j] === true ? COST.restInWords : COST.breakInWords);
};

/**
 * The table of cheapest placements: cost(i, j) sings i syllables on j notes,
 * the i-th ending at note j - 1, and step[i][j] is the move that got there.
 */
class Table {
  readonly best: Float64Array[];
  readonly step: Array<Array<Step | undefined>>;
  constructor(syllables: number, notes: number) {
    this.best = Array.from({ length: syllables + 1 }, () =>
      new Float64Array(notes + 1).fill(Number.POSITIVE_INFINITY),
    );
    this.step = Array.from({ length: syllables + 1 }, () => new Array<Step | undefined>(notes + 1));
  }
  cost(i: number, j: number): number {
    return this.best[i]?.[j] ?? Number.POSITIVE_INFINITY;
  }
  /** Keeps the move when it is cheaper than the one there. */
  offer(i: number, j: number, cost: number, how: Step): void {
    const [row, steps] = [this.best[i], this.step[i]];
    if (row === undefined || steps === undefined || cost >= (row[j] ?? Number.POSITIVE_INFINITY))
      return;
    row[j] = cost;
    steps[j] = how;
  }
}

const fill = (planned: readonly Planned[], notes: Notes) => {
  const [S, N] = [planned.length, notes.melody.length];
  const table = new Table(S, N);
  table.offer(0, 0, 0, 'start');
  // From i syllables on j notes: hold the i-th over note j, start the next on it, or put the next on the i-th's note.
  const moves = (i: number, j: number, here: number) => {
    const syllable = planned[i];
    if (i > 0 && j < N)
      table.offer(i, j + 1, here + (notes.hold[j] ?? Number.POSITIVE_INFINITY), 'hold');
    if (syllable === undefined) return;
    if (j < N)
      table.offer(i + 1, j + 1, here + startCost(notes, planned[i - 1], syllable, j), 'start');
    if (i > 0 && j > 0) {
      table.offer(
        i + 1,
        j,
        here + (syllable.mayShare ? COST.shareInWord : COST.shareAcross),
        'share',
      );
    }
  };
  for (let i = 0; i <= S; i++) {
    for (let j = 0; j <= N; j++) {
      const here = table.cost(i, j);
      if (here !== Number.POSITIVE_INFINITY) moves(i, j, here);
    }
  }
  return { cost: table.cost(S, N), step: table.step };
};

/** Walks the table back from all syllables on all notes: each syllable's first note and how many it holds. */
const walk = (step: ReadonlyArray<ReadonlyArray<Step | undefined>>, S: number, N: number) => {
  const first = new Array<number>(S).fill(0);
  const held = new Array<number>(S).fill(0);
  let [i, j] = [S, N];
  for (let how = step[i]?.[j]; i > 0 && how !== undefined; how = step[i]?.[j]) {
    if (how !== 'hold') first[i - 1] = j - 1;
    if (how !== 'share') held[i - 1] = (held[i - 1] ?? 0) + 1;
    if (how !== 'hold') i -= 1;
    if (how !== 'share') j -= 1;
  }
  return { first, held };
};

/**
 * Lays one verse's lines (its refrain's after them, as sung) on that verse
 * of the score's melody, by its place among the score's verses.
 */
export const align = (score: Score, verse: number, lines: readonly string[]): Alignment => {
  const planned = plan(lines);
  const notes = notesOf(score, verse);
  const { cost, step } = fill(planned, notes);
  const { first, held } = walk(step, planned.length, notes.melody.length);
  const sung = planned.map((syllable, k) => ({
    ...syllable,
    note: first[k] ?? 0,
    notes: held[k] ?? 0,
  }));
  const shared = sung.filter((syllable) => syllable.notes === 0);
  return {
    lines: lines.map((_, l) => recut(sung.filter((syllable) => syllable.line === l))),
    melody: notes.melody,
    melismas: sung.reduce((n, syllable) => n + Math.max(0, syllable.notes - 1), 0),
    shared: {
      inWord: shared.filter((syllable) => syllable.mayShare).length,
      acrossWords: shared.filter((syllable) => !syllable.mayShare).length,
    },
    cost,
  };
};

/** A word two of whose syllables share a note is cut again into as many pieces as it has notes (glo-rious). */
const recut = (line: ReadonlyArray<Planned & { note: number; notes: number }>): Syllable[] => {
  const words = [...new Set(line.map((syllable) => syllable.word))];
  return words.flatMap((w) => {
    const pieces = line.filter((syllable) => syllable.word === w);
    const sounding = pieces.filter((syllable) => syllable.notes > 0);
    if (sounding.length === pieces.length || sounding.length === 0) {
      return pieces.map(({ text, word, note, notes }) => ({ text, word, note, notes }));
    }
    const whole = pieces.map((syllable) => syllable.text).join('');
    const again = Syllables.split(whole, sounding.length);
    return sounding.map((syllable, k) => ({
      text: again[k] ?? '',
      word: w,
      note: syllable.note,
      notes: syllable.notes,
    }));
  });
};
