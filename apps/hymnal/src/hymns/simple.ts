/**
 * Simple chords: a beginner's reading of a hymn's full harmony. Each line is
 * read in sung order on its own, and each syllable shows at most one plain
 * chord (major, minor or seventh), so a line keeps its words' natural
 * spacing. The full harmony stays in the data (`chords.ts`); Simple is
 * derived from it as the page draws it, and Advanced is the decoded chords
 * themselves.
 *
 * The rule, per line:
 * - each chord is made plain: `m7` and `m6` are minor; `maj7`, `6` and `aug`
 *   are major on their root; `dim` and `dim7` are the seventh on the root a
 *   major third below (as `Chord.simplify` reads a diminished triad);
 *   `m7b5` is the minor on the root a minor third above; the bass is dropped;
 * - a `sus4`, `sus2` or `7sus4` takes the plain quality of the next chord in
 *   the line that is not a sus, when that chord has the same root; else it
 *   is major, major or seventh;
 * - a syllable shows the chord sounding when it starts (its own first chord,
 *   or the last one before it in the line), and only where that differs
 *   from the last chord shown in the line;
 * - a shown chord that sounds for one syllable only, between two shown
 *   chords that are the same, is a passing chord: it goes, and the second of
 *   the two is then not shown again.
 *
 * Chords stay degrees above the hymn's key, so a move spells Simple chords
 * as it spells Advanced ones (`Chord.format` in the played key).
 */

import type * as Chord from '@bible/hymnal/chord';
import { Array as Arr, Option, Schema } from 'effect';

import type { Box, HymnChords, Word } from './chords';

/** How chords are shown: `simple`, a plain chord per syllable at most, or `advanced`, every chord as compiled. */
export const ChordStyle = Schema.Literals(['simple', 'advanced']);
export type ChordStyle = typeof ChordStyle.Type;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

interface Plain {
  readonly root: number;
  readonly quality: '' | 'm' | '7';
}

/** A shown chord and the syllable of the line it is shown over. */
interface Change {
  readonly k: number;
  readonly chord: Plain;
}

const SUS: ReadonlySet<Chord.Quality> = new Set(['sus4', 'sus2', '7sus4']);

/** A chord's plain form, a sus read alone (with nothing to resolve to). */
const plain = (chord: Chord.Chord): Plain => {
  const { root } = chord;
  switch (chord.quality) {
    case '':
    case 'm':
    case '7':
      return { root, quality: chord.quality };
    case 'm7':
    case 'm6':
      return { root, quality: 'm' };
    case 'maj7':
    case '6':
    case 'aug':
    case 'sus4':
    case 'sus2':
      return { root, quality: '' };
    case '7sus4':
      return { root, quality: '7' };
    case 'dim':
    case 'dim7':
      return { root: mod12(root - 4), quality: '7' };
    case 'm7b5':
      return { root: mod12(root + 3), quality: 'm' };
  }
};

/** A line's chords in sung order, each made plain; a sus resolves to the next non-sus chord on its root. */
const plainLine = (chords: ReadonlyArray<Chord.Chord>): ReadonlyArray<Plain> =>
  chords.map((chord, k) =>
    Option.some(chord).pipe(
      Option.filter((c) => SUS.has(c.quality)),
      Option.flatMap(() => Arr.findFirst(chords.slice(k + 1), (later) => !SUS.has(later.quality))),
      Option.filter((next) => next.root === chord.root),
      Option.match({
        onNone: () => plain(chord),
        onSome: (next) => ({ root: chord.root, quality: plain(next).quality }),
      }),
    ),
  );

const same = (a: Plain, b: Plain) => a.root === b.root && a.quality === b.quality;

/** The chord sounding as each syllable starts: its own first, or the last before it in the line. */
const soundingAt = (boxes: ReadonlyArray<Box>): ReadonlyArray<Option.Option<Plain>> => {
  const plained = plainLine(boxes.flatMap((box) => box.chords));
  let next = 0;
  let sounding = Option.none<Plain>();
  return boxes.map((box) => {
    if (box.chords.length === 0) return sounding;
    const first = Arr.get(plained, next);
    next += box.chords.length;
    sounding = Arr.get(plained, next - 1);
    return first;
  });
};

/** Where the sounding chord changes, in order. */
const changesOf = (at: ReadonlyArray<Option.Option<Plain>>): ReadonlyArray<Change> => {
  const changes: Array<Change> = [];
  for (const [k, sounding] of at.entries())
    for (const chord of Option.toArray(sounding))
      if (!Option.exists(Arr.last(changes), (last) => same(last.chord, chord)))
        changes.push({ k, chord });
  return changes;
};

/** The changes less each passing chord (one syllable long, between two that are the same) and the second of the two. */
const withoutPassing = (changes: ReadonlyArray<Change>): ReadonlyArray<Change> => {
  const kept: Array<Change> = [];
  let skip = false;
  for (const [c, change] of changes.entries()) {
    const passing: boolean =
      !skip &&
      Option.exists(Arr.last(kept), (before) =>
        Option.exists(
          Arr.get(changes, c + 1),
          (after) => after.k === change.k + 1 && same(before.chord, after.chord),
        ),
      );
    if (!skip && !passing) kept.push(change);
    skip = passing;
  }
  return kept;
};

/** A line's words with each box's chords replaced by the one it shows. */
const simpleLine = (line: ReadonlyArray<Word>): ReadonlyArray<Word> => {
  const shown = new Map(
    withoutPassing(changesOf(soundingAt(line.flat()))).map(({ k, chord }) => [k, chord]),
  );
  let k = 0;
  return line.map((word) =>
    word.map((box) => {
      const chords = Option.toArray(Option.fromUndefinedOr(shown.get(k)));
      k += 1;
      return { text: box.text, chords };
    }),
  );
};

type PartChords = HymnChords['stanzas'][number];

const simplePart = (part: PartChords): PartChords => {
  if (part._tag === 'Plain') return part;
  return { ...part, lines: part.lines.map(simpleLine) };
};

/** A hymn's Simple chords: the same parts, lines, words and boxes, at most one plain chord over each. */
export const simple = (chords: HymnChords): HymnChords => ({
  ...chords,
  stanzas: chords.stanzas.map(simplePart),
  refrain: Option.map(chords.refrain, simplePart),
});

const byStyle: Record<ChordStyle, (chords: HymnChords) => HymnChords> = {
  simple,
  advanced: (chords) => chords,
};

/** A hymn's chords as `style` shows them: Simple, or the decoded chords themselves. */
export const styled = (chords: HymnChords, style: ChordStyle): HymnChords => byStyle[style](chords);
