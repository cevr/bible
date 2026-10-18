/**
 * Compiles one hymn: its text laid on its MIDI file's tune, stanza by
 * stanza, each syllable with the chords that change while it is sung, and
 * each part judged for how far its placement can be trusted.
 *
 * Stanza n is laid, with the refrain's lines after it as it is sung, on the
 * file's verse n (its last verse when the file plays fewer). The refrain is
 * stored once, from stanza 1's placement.
 *
 * Where a chord goes, at both levels:
 * - A change belongs to the syllable sung when it comes: a syllable owns the
 *   time from its first note's start to the next syllable's start, so a
 *   change under a held note, on a later note of a melisma or in a rest
 *   after it sits on it, `at` quarter-note beats after it starts.
 * - A change after a syllable's start that lasts less than a quarter note is
 *   a passing chord: it folds into the chord before it. A change at a
 *   syllable's start is never folded.
 * - Each line's first syllable carries the chord sounding when it starts;
 *   changes in the rest before a line are dropped. Any other syllable
 *   carries the chord sounding at its start when it differs from the last
 *   one shown (a short chord folded away that runs on into it).
 * - A syllable sharing the note before it carries none.
 *
 * Pure: no file, Bun or Node access.
 */

import { Array as Arr, Effect } from 'effect';
import type { Mutable } from 'effect/Types';

import * as Align from './align.js';
import * as Chord from './chord.js';
import * as Harmony from './harmony.js';
import type { Fit, Hymn, Part, Plain, Reason, Syllable } from './hymn.js';
import * as Midi from './midi.js';
import * as Score from './score.js';

interface Source {
  readonly book: 'sdah-1985';
  readonly number: number;
  readonly title: string;
  /** The text's verses as hymnal.db keeps them: a negative id is a refrain. */
  readonly verses: ReadonlyArray<{ readonly id: number; readonly text: string }>;
  readonly midi: Uint8Array;
  /** Why the hymn is held back: every part is then plain text. */
  readonly held?: string | undefined;
}

/**
 * The bounds of trust, on the notes per syllable (`r`) and the cost per
 * syllable (`c`) of a part's placement. Words alone below the first set,
 * chords per line below the second.
 */
const TRUST = {
  text: { fewNotes: 0.8, manyNotes: 1.75, cost: 0.5, sharedAcross: 1 },
  line: { melismas: 1.3, cost: 0.25 },
} as const;

const REASONS: readonly Reason[] = [
  'held',
  'notes',
  'shared',
  'cost',
  'melismas',
  'inexact',
  'reused',
];

const ordered = (reasons: readonly Reason[]): Reason[] =>
  REASONS.filter((reason) => reasons.includes(reason));

const round = (n: number) => Math.round(n * 1000) / 1000;

const linesOf = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

type Placed = NonNullable<Syllable['full']>[number];

/** Places one level's chords on a verse's syllables, laid out as `align` gives them. */
const place = (
  score: Score.Score,
  span: Score.Span,
  alignment: Align.Alignment,
  level: Harmony.Level,
): Array<Array<Placed[]>> => {
  const tpb = score.ticksPerBeat;
  // The files strike a chord's notes up to a few ticks from the tune's.
  const slack = tpb / 16;
  const spans = Harmony.chords(score, span.start, span.end, level);
  const sung = alignment.lines.flatMap((line, l) =>
    line.map((syllable, k) => ({ syllable, line: l, k })),
  );
  const startOf = (s: Align.Syllable) => alignment.melody[s.note]?.start ?? span.start;
  const endOf = (s: Align.Syllable) => alignment.melody[s.note + s.notes - 1]?.end ?? span.end;
  const out = alignment.lines.map((line) => line.map((): Placed[] => []));
  let shown: Chord.Chord | undefined;
  let line = -1;
  sung.forEach(({ syllable, line: l, k }, i) => {
    if (syllable.notes === 0) return;
    const start = startOf(syllable);
    const next = sung.slice(i + 1).find((s) => s.syllable.notes > 0);
    // A line's last syllable owns no rest after it, unless it ends the verse.
    const end =
      next === undefined
        ? span.end
        : next.line !== l
          ? Math.min(endOf(syllable), startOf(next.syllable))
          : startOf(next.syllable);
    const placed: Placed[] = [];
    const show = (chord: Chord.Chord, at: number) => {
      placed.push({ chord, at: round(Math.max(0, at) / tpb) });
      shown = chord;
    };
    const atStart = spans.find((s) => Math.abs(s.start - start) <= slack);
    const sounding =
      atStart ?? spans.find((s) => s.start <= start + slack && s.end > start + slack);
    if (l !== line) {
      line = l;
      if (sounding !== undefined) show(sounding.chord, 0);
    } else if (
      sounding !== undefined &&
      (shown === undefined || !Chord.equals(shown, sounding.chord))
    ) {
      show(sounding.chord, 0);
    }
    for (const change of spans) {
      if (change.start <= start + slack || change.start >= end - slack) continue;
      if (change.end - change.start < tpb) continue;
      if (shown !== undefined && Chord.equals(shown, change.chord)) continue;
      show(change.chord, change.start - start);
    }
    const target = out[l]?.[k];
    if (target !== undefined) target.push(...placed);
  });
  return out;
};

interface Laid {
  readonly level: 'syllable' | 'line' | 'text';
  readonly why: Reason[];
  readonly fit: Fit | undefined;
  /** Each line of syllables, the stanza's and then the refrain's. */
  readonly lines: Syllable[][];
}

/** Judges a placement: words alone, chords per line, or chords on syllables. */
const judge = (
  fit: Fit | undefined,
  info: { readonly inexact: boolean; readonly reused: boolean },
): Pick<Laid, 'level' | 'why'> => {
  const notes: Reason[] = [
    ...(info.inexact ? (['inexact'] as const) : []),
    ...(info.reused ? (['reused'] as const) : []),
  ];
  if (fit === undefined) return { level: 'text', why: ordered(['notes', ...notes]) };
  const r = fit.notes / Math.max(1, fit.syllables);
  const c = fit.cost / Math.max(1, fit.syllables);
  const text: Reason[] = [
    ...(r < TRUST.text.fewNotes || r > TRUST.text.manyNotes ? (['notes'] as const) : []),
    ...(fit.shared.acrossWords > TRUST.text.sharedAcross ? (['shared'] as const) : []),
    ...(c > TRUST.text.cost ? (['cost'] as const) : []),
  ];
  if (text.length > 0) return { level: 'text', why: ordered([...text, ...notes]) };
  const line: Reason[] = [
    ...(r > TRUST.line.melismas ? (['melismas'] as const) : []),
    ...(c > TRUST.line.cost ? (['cost'] as const) : []),
    ...(fit.shared.acrossWords === TRUST.text.sharedAcross ? (['shared'] as const) : []),
    ...(info.reused && info.inexact ? (['reused'] as const) : []),
  ];
  if (line.length > 0) return { level: 'line', why: ordered([...line, ...notes]) };
  return { level: 'syllable', why: ordered(notes) };
};

/** Lays stanza n with the refrain after it on its verse of the file. */
const lay = (score: Score.Score, n: number, lines: readonly string[]): Laid => {
  const played = score.verses.spans.length;
  const verse = Math.min(n, played - 1);
  const span = score.verses.spans[verse] ?? { start: 0, end: 0 };
  const info = { inexact: !score.verses.exact, reused: n > played - 1 };
  const alignment = Align.align(score, verse, lines);
  const syllables = alignment.lines.reduce((sum, line) => sum + line.length, 0);
  const fit: Fit | undefined = Number.isFinite(alignment.cost)
    ? {
        notes: alignment.melody.length,
        syllables,
        melismas: alignment.melismas,
        shared: alignment.shared,
        cost: round(alignment.cost),
      }
    : undefined;
  const { level, why } = judge(fit, info);
  if (level === 'text') return { level, why, fit, lines: [] };
  const full = place(score, span, alignment, 'full');
  const guitar = place(score, span, alignment, 'guitar');
  const tpb = score.ticksPerBeat;
  const out = alignment.lines.map((line, l) =>
    line.map((s, k): Syllable => {
      const first = alignment.melody[s.note];
      const last = alignment.melody[s.note + s.notes - 1];
      const beats =
        s.notes === 0 || first === undefined || last === undefined
          ? 0
          : round((last.end - first.start) / tpb);
      const f = full[l]?.[k] ?? [];
      const g = guitar[l]?.[k] ?? [];
      const syllable: Mutable<Syllable> = { text: s.text, word: s.word, notes: s.notes, beats };
      if (Arr.isArrayNonEmpty(f)) syllable.full = f;
      if (Arr.isArrayNonEmpty(g)) syllable.guitar = g;
      return syllable;
    }),
  );
  return { level, why, fit, lines: out };
};

/** A part from a placement's lines in [from, to), or the text's own lines when it is plain. */
const partOf = (laid: Laid, text: readonly string[], from: number, to: number): Part => {
  const plain: [string, ...string[]] = [text[0] ?? '', ...text.slice(1)];
  const why: [Reason, ...Reason[]] = [laid.why[0] ?? 'notes', ...laid.why.slice(1)];
  const lines = laid.lines.slice(from, to).filter(Arr.isArrayNonEmpty);
  if (laid.level === 'text' || laid.fit === undefined || !Arr.isArrayNonEmpty(lines)) {
    const part: Mutable<Plain> = { _tag: 'Plain', lines: plain, why };
    if (laid.fit !== undefined) part.fit = laid.fit;
    return part;
  }
  return { _tag: 'Sung', level: laid.level, lines, fit: laid.fit, why: laid.why };
};

const held = (lines: readonly string[]): Part => ({
  _tag: 'Plain',
  lines: [lines[0] ?? '', ...lines.slice(1)],
  why: ['held'],
});

/** Compiles a hymn from its text and its MIDI file. */
export const compile = (source: Source): Effect.Effect<Hymn, Midi.MidiParseError> =>
  Effect.gen(function* () {
    const stanzas = source.verses
      .filter((verse) => verse.id >= 0)
      .toSorted((a, b) => a.id - b.id)
      .map((verse) => linesOf(verse.text));
    // The refrain: the negative id nearest zero (a few texts keep more than one).
    const chorus = source.verses.filter((verse) => verse.id < 0).toSorted((a, b) => b.id - a.id)[0];
    const refrain = chorus === undefined ? undefined : linesOf(chorus.text);
    const score = Score.fromMidi(yield* Midi.parse(source.midi), stanzas.length);
    const head = {
      version: 1,
      book: source.book,
      number: source.number,
      title: source.title,
      key: score.key,
      meter: score.meter,
      verses: {
        text: stanzas.length,
        midi: score.verses.spans.length,
        exact: score.verses.exact,
      },
    } as const;
    if (!Arr.isArrayNonEmpty(stanzas)) {
      return yield* Effect.die(new Error(`hymn ${source.number} has no stanza`));
    }
    if (source.held !== undefined) {
      const plain: Mutable<Hymn> = { ...head, stanzas: Arr.map(stanzas, held) };
      if (refrain !== undefined) plain.refrain = held(refrain);
      return plain;
    }
    const tail = refrain ?? [];
    const laid = Arr.map(stanzas, (lines, n) => lay(score, n, [...lines, ...tail]));
    const parts = Arr.map(laid, (one, n) => {
      const lines = stanzas[n] ?? [];
      return partOf(one, lines, 0, lines.length);
    });
    const first = laid[0];
    const firstLines = stanzas[0].length;
    const hymn: Mutable<Hymn> = { ...head, stanzas: parts };
    if (refrain !== undefined) {
      hymn.refrain = partOf(first, refrain, firstLines, firstLines + refrain.length);
    }
    return hymn;
  });
