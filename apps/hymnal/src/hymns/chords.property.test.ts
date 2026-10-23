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
import { simple } from './simple';
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

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => from + k);

const pc = (name: string) => Chord.pitchClass(name);
const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** `make()` once per `id`, kept in `cache`. */
const memo = <A>(cache: Map<string, A>, id: string, make: () => A): A =>
  Option.getOrElse(Option.fromUndefinedOr(cache.get(id)), () => {
    const made = make();
    cache.set(id, made);
    return made;
  });

/** A key and its name. */
interface Named {
  readonly key: Chord.Key;
  readonly name: string;
}

const TRANSPOSES = range(-12, 24);
const CAPOS = range(0, 11);

/**
 * The played key at every move a property reads (transpose -12 to 24, every
 * capo fret) from one printed key. A move's key depends on the printed key
 * alone, so the table is made once per key the set prints in.
 */
const playedTables = new Map<string, ReadonlyArray<ReadonlyArray<Named>>>();
const playedFrom = (key: Chord.Key) =>
  memo(playedTables, keyName(key), () =>
    TRANSPOSES.map((transpose) =>
      CAPOS.map((capo) => {
        const played = playedKey(key, { transpose, capo });
        return { key: played, name: keyName(played) };
      }),
    ),
  );

/**
 * The symbols shown at each move of one hymn, `at(T, C)`. A move changes only
 * the key the chords are spelled in, so each distinct chord is spelled once
 * per key and the page's sequence is read through its indices.
 */
const movesOf = (sections: ReadonlyArray<SectionChords>, key: Chord.Key) => {
  const table = playedFrom(key);
  const index = new Map<string, number>();
  const distinct: Array<Chord.Chord> = [];
  const order = sections
    .flatMap(chordsIn)
    .map((chord) => memo(index, Chord.format(chord, key), () => distinct.push(chord) - 1));
  const byKey = new Map<string, string>();
  return (transpose: number, capo: number) => {
    const played = Option.getOrThrow(Option.fromUndefinedOr(table[transpose + 12]?.[capo]));
    return memo(byKey, played.name, () => {
      const symbols = distinct.map((chord) => Chord.format(chord, played.key));
      return order.map((k) => symbols[k]).join(' ');
    });
  };
};

/**
 * Every key a move reaches from `key`, printed as `printed`, and each move
 * whose sounding or played key is wrong; made once per pair of keys.
 */
const reachTables = new Map<
  string,
  { readonly faults: ReadonlyArray<string>; readonly reached: ReadonlyArray<Chord.Key> }
>();
const keysOf = (printed: Chord.Key, key: Chord.Key) =>
  memo(reachTables, `${keyName(printed)} ${keyName(key)}`, () => {
    const faults: Array<string> = [];
    const reached = new Map<string, Chord.Key>();
    const tonic = pc(printed.tonic);
    for (const transpose of range(-11, 11)) {
      const sounding = soundingKey(key, { transpose, capo: 0 });
      if (pc(sounding.tonic) !== mod12(tonic + transpose) || sounding.minor !== printed.minor)
        faults.push(`sounds in ${keyName(sounding)} at ${transpose}`);
      for (const capo of CAPOS) {
        const played = playedKey(key, { transpose, capo });
        if (pc(played.tonic) !== mod12(tonic + transpose - capo) || played.minor !== printed.minor)
          faults.push(`plays in ${keyName(played)} at ${transpose}, ${capo}`);
        reached.set(keyName(played), played);
      }
    }
    return { faults, reached: [...reached.values()] };
  });

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

/**
 * A chord is its degrees, the same in every hymn: its symbol in C names it,
 * and each chord is checked once in each key, whichever hymns show it.
 */
const C_MAJOR: Chord.Key = { tonic: 'C', minor: false };
const symbolFaults = new Map<string, Option.Option<string>>();

/** Each distinct shown chord, spelled in every key a move reaches. */
const spellingFaults = (
  hymn: Hymn,
  keys: ReadonlyArray<Chord.Key>,
  sections: ReadonlyArray<SectionChords>,
): ReadonlyArray<string> => {
  const distinct = new Map(sections.flatMap(chordsIn).map((c) => [Chord.format(c, C_MAJOR), c]));
  return keys.flatMap((key) =>
    [...distinct].flatMap(([id, chord]) =>
      Option.toArray(
        Option.map(
          memo(symbolFaults, `${id} ${keyName(key)}`, () => symbolFault(chord, key)),
          (f) => `${hymn.number}: ${f}`,
        ),
      ),
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
      const keys = keysOf(hymn.key, chords.key);
      return [
        ...keys.faults.map((fault) => `${hymn.number}: ${fault}`),
        ...spellingFaults(hymn, keys.reached, sections),
      ];
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

// ----------------------------------------------------------------------------
// Simple chords (`simple.ts`) over the same hymns
// ----------------------------------------------------------------------------

/** Each hymn's Simple chords beside its Advanced ones, from the reads above. */
const simpleCases = cases.map((c) => {
  const chords = simple(c.chords);
  return { ...c, advanced: c.chords, chords, sections: sectionsOf(c.text, chords) };
});

type Parts = HymnChords['stanzas'];
const partsOf = (chords: HymnChords): Parts => [
  ...chords.stanzas,
  ...Option.toArray(chords.refrain),
];

/** Each sung line of a hymn, Advanced and Simple side by side, with a name for its faults. */
const linesOf = (c: (typeof simpleCases)[number]) => {
  const advanced = partsOf(c.advanced);
  return partsOf(c.chords).flatMap((part, p) => {
    const before = advanced[p];
    if (part._tag !== 'Sung' || before?._tag !== 'Sung') return [];
    return part.lines.map((line, l) => ({
      id: `${c.text.number} part ${p + 1} line ${l + 1}`,
      shown: line.flat(),
      advanced: (before.lines[l] ?? []).flat(),
    }));
  });
};

/** Decided 2's plain form, a sus read alone: the semitones the root moves and the quality kept. */
const PLAIN: Record<Chord.Quality, readonly [number, Chord.Quality]> = {
  '': [0, ''],
  m: [0, 'm'],
  '7': [0, '7'],
  m7: [0, 'm'],
  m6: [0, 'm'],
  maj7: [0, ''],
  '6': [0, ''],
  aug: [0, ''],
  dim: [-4, '7'],
  dim7: [-4, '7'],
  m7b5: [3, 'm'],
  sus4: [0, ''],
  sus2: [0, ''],
  '7sus4': [0, '7'],
};
const SUSPENDED = new Set<Chord.Quality>(['sus4', 'sus2', '7sus4']);
const plainOf = (chord: Chord.Chord): string => {
  const [by, quality] = PLAIN[chord.quality];
  return Chord.format({ root: mod12(chord.root + by), quality }, C_MAJOR);
};

/**
 * The plain form of the chord at `k` of a line's chords, `none` when there
 * is none: a sus takes the quality of the next non-sus chord when it is on
 * the same root.
 */
const plainAt = (chords: ReadonlyArray<Chord.Chord>, k: number): string =>
  Option.match(Option.fromUndefinedOr(chords[k]), {
    onNone: () => 'none',
    onSome: (chord) => plainResolved(chords, k, chord),
  });

const plainResolved = (chords: ReadonlyArray<Chord.Chord>, k: number, chord: Chord.Chord) => {
  if (!SUSPENDED.has(chord.quality)) return plainOf(chord);
  const next = chords.slice(k + 1).find((c) => !SUSPENDED.has(c.quality));
  return Option.match(
    Option.filter(Option.fromUndefinedOr(next), (n) => n.root === chord.root),
    {
      onNone: () => plainOf(chord),
      onSome: (n) => Chord.format({ root: chord.root, quality: PLAIN[n.quality][1] }, C_MAJOR),
    },
  );
};

/** Each box's Advanced chord sounding as its syllable starts, as an index into the line's chords. */
const soundingAt = (boxes: ReadonlyArray<{ readonly chords: ReadonlyArray<unknown> }>) => {
  let seen = 0;
  return boxes.map((box) => {
    const at = seen - Number(box.chords.length === 0);
    seen += box.chords.length;
    return at;
  });
};

describe('the Simple chords over every compiled hymn', () => {
  it('shows at most one plain chord over a syllable, with no bass (A1.1, A1.2)', () => {
    const faults = simpleCases.flatMap((c) =>
      linesOf(c).flatMap(({ id, shown }) =>
        shown.flatMap((box, s) => {
          const wrong = box.chords.filter(
            (chord) => !['', 'm', '7'].includes(chord.quality) || 'bass' in chord,
          );
          if (box.chords.length > 1 || wrong.length > 0)
            return [
              `${id} syllable ${s + 1}: ${box.chords.length} chords, ${wrong.length} not plain`,
            ];
          return [];
        }),
      ),
    );
    expect(faults).toEqual([]);
  });

  it('keeps the parts, lines, words and boxes of the Advanced chords (A1.3)', () => {
    const outline = (chords: HymnChords) => ({
      number: chords.number,
      key: chords.key,
      refrain: Option.isSome(chords.refrain),
      parts: partsOf(chords).map((part) => {
        if (part._tag === 'Plain') return 'Plain';
        return {
          level: part.level,
          lines: part.lines.map((l) => l.map((w) => w.map((b) => b.text))),
        };
      }),
    });
    const faults = simpleCases
      .filter((c) => !Bun.deepEquals(outline(c.chords), outline(c.advanced)))
      .map((c) => c.text.number);
    expect(faults).toEqual([]);
  });

  it('shows the plain form of the chord sounding as a syllable starts, never twice in a row (A1.4)', () => {
    const faults = simpleCases.flatMap((c) =>
      linesOf(c).flatMap(({ id, shown, advanced }) => {
        const chords = advanced.flatMap((box) => box.chords);
        const at = soundingAt(advanced);
        const symbols = shown.flatMap((box, s) =>
          box.chords.map((chord) => ({ s, symbol: Chord.format(chord, C_MAJOR) })),
        );
        return symbols.flatMap(({ s, symbol }, k) => {
          const found: Array<string> = [];
          const expected = plainAt(chords, at[s] ?? -1);
          if (symbol !== expected) found.push(`${id} syllable ${s + 1}: ${symbol} not ${expected}`);
          if (k > 0 && symbols[k - 1]?.symbol === symbol)
            found.push(`${id} syllable ${s + 1}: ${symbol} shown again`);
          return found;
        });
      }),
    );
    expect(faults).toEqual([]);
  });

  it('shows no more chords than Advanced, and none before a line’s first chord (A1.5, A1.6)', () => {
    const faults = simpleCases.flatMap((c) =>
      linesOf(c).flatMap(({ id, shown, advanced }) => {
        const count = (boxes: typeof shown) => boxes.reduce((n, b) => n + b.chords.length, 0);
        const found: Array<string> = [];
        if (count(shown) > count(advanced))
          found.push(`${id}: ${count(shown)} chords over ${count(advanced)}`);
        const first = advanced.findIndex((box) => box.chords.length > 0);
        const before = shown.filter((_, s) => first < 0 || s < first);
        if (count(before) > 0) found.push(`${id}: a chord before the line's first`);
        return found;
      }),
    );
    expect(faults).toEqual([]);
  });

  it('shows no passing chord: one syllable long between two of the same chord (A1.9)', () => {
    const faults = simpleCases.flatMap((c) =>
      linesOf(c).flatMap(({ id, shown }) => {
        const symbols = shown.flatMap((box, s) =>
          box.chords.map((chord) => ({ s, symbol: Chord.format(chord, C_MAJOR) })),
        );
        return symbols.flatMap((here, k) => {
          const around = Option.all([
            Option.fromUndefinedOr(symbols[k - 1]),
            Option.fromUndefinedOr(symbols[k + 1]),
          ]);
          const passes = Option.exists(
            around,
            ([before, after]) => after.s === here.s + 1 && after.symbol === before.symbol,
          );
          return Option.toArray(
            Option.liftPredicate(
              `${id} syllable ${here.s + 1}: ${here.symbol} passes`,
              () => passes,
            ),
          );
        });
      }),
    );
    expect(faults).toEqual([]);
  });

  it('moves as the Advanced chords do: twelve, rest, capo and spelling (P2, P3, P4 on Simple)', () => {
    const faults: Array<string> = [];
    for (const { hymn, chords, sections } of simpleCases) {
      const at = movesOf(sections, hymn.key);
      for (const transpose of range(-12, 12))
        for (const capo of range(0, 11))
          if (at(transpose + 12, capo) !== at(transpose, capo))
            faults.push(`${hymn.number} at ${transpose}, ${capo}`);
      if (shownIn(sections, chords.key).join(' ') !== at(0, 0))
        faults.push(`${hymn.number}: not spelled in its printed key at rest`);
      for (const n of range(0, 11))
        if (at(n, n) !== at(0, 0)) faults.push(`${hymn.number} capo ${n}`);
      const keys = keysOf(hymn.key, chords.key);
      faults.push(
        ...keys.faults.map((fault) => `${hymn.number}: ${fault}`),
        ...spellingFaults(hymn, keys.reached, sections),
      );
    }
    expect(faults).toEqual([]);
  });
});
