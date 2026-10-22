/**
 * The chords over every compiled hymn, as the page shows them: each section
 * of the words (`virtual:hymnal`) against the hymn's chords as the bundle
 * carries them (`vite/chords.ts`, decoded as the page decodes them), and
 * against the compiled hymn itself. The domain is finite, so it is walked
 * whole: every hymn, every section, every syllable, every transpose from -12
 * to 12 and every capo fret. What is shown depends on a move only through the
 * key the chords are spelled in, so each hymn's symbols are spelled once per
 * key it reaches.
 */

import { describe, expect, it } from 'bun:test';
import * as Chord from '@bible/hymnal/chord';
import type { Hymn, Part } from '@bible/hymnal/hymn';
import { Match, Option } from 'effect';

import { readChords } from '../../vite/chords';
import { readHymns } from '../../vite/words';
import {
  chordBook,
  hasChords,
  type HymnChords,
  keyName,
  type SectionChords,
  sectionsOf,
  playedKey,
  soundingKey,
  still,
} from './chords';
import { hymns } from './hymns';
import type { HymnText, Section } from './text';

const book = chordBook(readChords());
const compiled = new Map(readHymns().map((hymn) => [hymn.number, hymn]));

interface Case {
  readonly hymn: Hymn;
  readonly text: HymnText;
  readonly chords: HymnChords;
  readonly sections: ReadonlyArray<SectionChords>;
}

const cases: ReadonlyArray<Case> = hymns.map((text) => {
  const chords = Option.getOrThrow(book.of(text.number));
  return {
    hymn: Option.getOrThrow(Option.fromUndefinedOr(compiled.get(text.number))),
    text,
    chords,
    sections: sectionsOf(text, chords),
  };
});

const partOf = (hymn: Hymn, section: Section): Part => {
  if (section.kind === 'refrain')
    return Option.getOrThrow(Option.fromUndefinedOr(hymn.refrain?.part));
  return Option.getOrThrow(Option.fromUndefinedOr(hymn.stanzas[section.n - 1]));
};

/** A syllable's guitar chords in `at` order, spelled in `key`. */
const guitarOf = (
  syllable: {
    readonly guitar?: ReadonlyArray<{ readonly chord: Chord.Chord; readonly at: number }>;
  },
  key: Chord.Key,
) =>
  (syllable.guitar ?? [])
    .toSorted((a, b) => a.at - b.at)
    .map((placed) => Chord.format(placed.chord, key));

/** Every chord a section shows, in order. */
const chordsIn: (section: SectionChords) => ReadonlyArray<Chord.Chord> =
  Match.type<SectionChords>().pipe(
    Match.tagsExhaustive({
      Words: () => [],
      Syllables: (section) => section.lines.flat(2).flatMap((box) => box.chords),
      Line: (section) => section.lines.flat(),
    }),
  );

/** Every chord the page shows, in page order, spelled in `key`. */
const shownIn = (sections: ReadonlyArray<SectionChords>, key: Chord.Key): ReadonlyArray<string> =>
  sections.flatMap(chordsIn).map((c) => Chord.format(c, key));

/** The symbols shown at each move of one hymn, spelled once per key: `at(T, C)`. */
const movesOf = (sections: ReadonlyArray<SectionChords>, key: Chord.Key) => {
  const byKey = new Map<string, string>();
  return (transpose: number, capo: number) => {
    const played = playedKey(key, { transpose, capo });
    const name = keyName(played);
    return Option.getOrElse(Option.fromUndefinedOr(byKey.get(name)), () => {
      const shown = shownIn(sections, played).join(' ');
      byKey.set(name, shown);
      return shown;
    });
  };
};

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => from + k);

const pc = (name: string) => Chord.pitchClass(name);
const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Every key a move reaches from `key`, and each move whose sounding or played key is wrong. */
const keysOf = (hymn: Hymn, key: Chord.Key) => {
  const faults: Array<string> = [];
  const reached = new Map<string, Chord.Key>();
  const tonic = pc(hymn.key.tonic);
  for (const transpose of range(-11, 11)) {
    const sounding = soundingKey(key, { transpose, capo: 0 });
    if (pc(sounding.tonic) !== mod12(tonic + transpose) || sounding.minor !== hymn.key.minor)
      faults.push(`${hymn.number}: sounds in ${keyName(sounding)} at ${transpose}`);
    for (const capo of range(0, 11)) {
      const played = playedKey(key, { transpose, capo });
      if (pc(played.tonic) !== mod12(tonic + transpose - capo) || played.minor !== hymn.key.minor)
        faults.push(`${hymn.number}: plays in ${keyName(played)} at ${transpose}, ${capo}`);
      reached.set(keyName(played), played);
    }
  }
  return { faults, reached: [...reached.values()] };
};

/** A shown symbol whose root or bass is not the chord's degree above `key`. */
const symbolFault = (chord: Chord.Chord, key: Chord.Key): Option.Option<string> => {
  const symbol = Chord.format(chord, key);
  const [root = '', bass = ''] = symbol.split('/');
  const rootName = /^[A-G][#b]*/.exec(root)?.[0] ?? '';
  const above = (degree: number) => mod12(pc(key.tonic) + degree);
  if (pc(rootName) !== above(chord.root)) return Option.some(`${symbol} in ${keyName(key)}`);
  const wrongBass = Option.exists(
    Option.fromUndefinedOr(chord.bass),
    (degree) => pc(bass) !== above(degree),
  );
  if (wrongBass) return Option.some(`${symbol}'s bass in ${keyName(key)}`);
  return Option.none();
};

/** Each distinct shown chord, spelled in every key a move reaches. */
const spellingFaults = (
  hymn: Hymn,
  keys: ReadonlyArray<Chord.Key>,
  sections: ReadonlyArray<SectionChords>,
): ReadonlyArray<string> => {
  const distinct = new Map(sections.flatMap(chordsIn).map((c) => [Chord.format(c, hymn.key), c]));
  return keys.flatMap((key) =>
    [...distinct.values()].flatMap((chord) =>
      Option.toArray(Option.map(symbolFault(chord, key), (f) => `${hymn.number}: ${f}`)),
    ),
  );
};

const CHORDLESS = [126, 181, 212, 220, 225, 262, 292, 305, 403, 453, 481, 580, 663, 664, 687, 693];
const MIXED = [69, 72, 172, 178, 208, 221, 269, 303, 391, 434, 445, 471, 474, 488, 578, 600, 601];

describe('the chords over every compiled hymn', () => {
  it('carries every hymn of the set, each decoded once', () => {
    expect(cases.map((c) => c.text.number)).toEqual(range(1, 695));
    expect(book.decodes()).toBe(695);
  });

  it('puts each syllable-level chord over its syllable, and the boxes make the plain line (P1)', () => {
    const faults: Array<string> = [];
    for (const { hymn, text, sections } of cases) {
      text.sections.forEach((section, p) => {
        const part = partOf(hymn, section);
        const shown = sections[p];
        if (part._tag !== 'Sung' || part.level !== 'syllable') return;
        if (shown?._tag !== 'Syllables') {
          faults.push(`${hymn.number} section ${p + 1}: ${shown?._tag} for a syllable part`);
          return;
        }
        if (shown.lines.length !== section.lines.length)
          faults.push(`${hymn.number} section ${p + 1}: ${shown.lines.length} chord lines`);
        shown.lines.forEach((line, l) => {
          const syllables = part.lines[l] ?? [];
          const boxes = line.flat();
          if (boxes.length !== syllables.length)
            faults.push(`${hymn.number} ${p + 1}.${l + 1}: ${boxes.length} boxes`);
          boxes.forEach((box, s) => {
            const expected = guitarOf(syllables[s] ?? {}, hymn.key).join(' ');
            const symbols = box.chords.map((c) => Chord.format(c, hymn.key)).join(' ');
            if (symbols !== expected)
              faults.push(`${hymn.number} ${p + 1}.${l + 1}.${s + 1}: ${symbols} not ${expected}`);
          });
          const joined = line.map((word) => word.map((box) => box.text).join('')).join(' ');
          if (joined !== section.lines[l])
            faults.push(`${hymn.number} ${p + 1}.${l + 1}: the boxes do not make the line`);
        });
      });
    }
    expect(faults).toEqual([]);
  });

  it('shows the same chords a transpose of twelve later, and the printed key at rest (P2)', () => {
    const faults: Array<string> = [];
    for (const { hymn, sections } of cases) {
      const at = movesOf(sections, hymn.key);
      if (keyName(playedKey(hymn.key, still)) !== keyName(hymn.key))
        faults.push(`${hymn.number}: rests in ${keyName(playedKey(hymn.key, still))}`);
      for (const transpose of range(-12, 12))
        for (const capo of range(0, 11))
          if (at(transpose + 12, capo) !== at(transpose, capo))
            faults.push(`${hymn.number} at ${transpose}, ${capo}`);
      const printed = Option.getOrThrow(book.of(hymn.number)).key;
      if (shownIn(sections, printed).join(' ') !== at(0, 0))
        faults.push(`${hymn.number}: not spelled in its printed key at rest`);
    }
    expect(faults).toEqual([]);
  });

  it('shows the printed chords under a capo and a transpose of the same frets (P3)', () => {
    const faults: Array<string> = [];
    for (const { hymn, sections } of cases) {
      const at = movesOf(sections, hymn.key);
      for (const n of range(0, 11))
        if (at(n, n) !== at(0, 0)) faults.push(`${hymn.number} at ${n}`);
    }
    expect(faults).toEqual([]);
  });

  it('raises the sound by the transpose and lowers the played key by the capo (P4)', () => {
    const faults = cases.flatMap(({ hymn, chords, sections }) => {
      const keys = keysOf(hymn, chords.key);
      return [...keys.faults, ...spellingFaults(hymn, keys.reached, sections)];
    });
    expect(faults).toEqual([]);
  });

  it('shows plain parts as words, line parts under a row of their chords (P5)', () => {
    const faults: Array<string> = [];
    for (const { hymn, text, sections } of cases) {
      text.sections.forEach((section, p) => {
        const part = partOf(hymn, section);
        const shown = sections[p];
        if (part._tag === 'Plain' && shown?._tag !== 'Words')
          faults.push(`${hymn.number} section ${p + 1}: ${shown?._tag} for a plain part`);
        if (part._tag === 'Sung' && part.level === 'line') {
          if (shown?._tag !== 'Line') {
            faults.push(`${hymn.number} section ${p + 1}: ${shown?._tag} for a line part`);
            return;
          }
          part.lines.forEach((syllables, l) => {
            const expected = syllables.flatMap((s) => guitarOf(s, hymn.key)).join(' ');
            const row = (shown.lines[l] ?? []).map((c) => Chord.format(c, hymn.key)).join(' ');
            if (row !== expected) faults.push(`${hymn.number} ${p + 1}.${l + 1}: ${row}`);
          });
        }
      });
    }
    expect(faults).toEqual([]);
    expect(cases.filter((c) => !hasChords(c.chords)).map((c) => c.text.number)).toEqual(CHORDLESS);
    for (const number of MIXED) {
      const found = cases.find((c) => c.text.number === number);
      const tags = new Set(found?.sections.map((s) => s._tag));
      expect({ number, words: tags.has('Words'), chords: tags.size > 1 }).toEqual({
        number,
        words: true,
        chords: true,
      });
    }
  });
});
