import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Chord from './chord.js';
import { compile } from './compile.js';
import type { Hymn, Part, Sung } from './hymn.js';
import * as Fixture from './midi-fixture.js';

type Voices = readonly [Fixture.Voice, Fixture.Voice, Fixture.Voice, Fixture.Voice];

/** The voices' first `beats` beats: an intro, as the hymnal's files open. */
const opening = (voice: Fixture.Voice, beats: number): Fixture.Voice => {
  const out: Array<readonly [number, number]> = [];
  let beat = 0;
  for (const note of voice) {
    if (beat >= beats) break;
    out.push(note);
    beat += note[1];
  }
  return out;
};

/** A file laid out as the hymnal's are: an intro of the tune's opening, then `verses` verses in full. */
const file = (
  voices: Voices,
  options: { verses: number; intro: number; meter: readonly [number, number]; fifths: number },
): Uint8Array =>
  Fixture.write({
    meter: options.meter,
    fifths: options.fifths,
    tracks: voices.map((voice, i) => ({
      name: i === 0 ? 'S A T B' : '',
      program: 5,
      voices: [
        [
          ...opening(voice, options.intro),
          ...Array.from({ length: options.verses }, () => voice).flat(),
        ],
      ],
    })),
  });

type Source = Parameters<typeof compile>[0];

const source = (
  midi: Uint8Array,
  stanzas: readonly string[],
  extra: Partial<Pick<Source, 'held'>> & { refrain?: string } = {},
): Source => ({
  book: 'sdah-1985',
  number: 1,
  title: 'Test',
  verses: [
    ...stanzas.map((text, id) => ({ id, text })),
    ...(extra.refrain === undefined ? [] : [{ id: -1, text: extra.refrain }]),
  ],
  midi,
  held: extra.held,
});

/** The part as sung, failing the test when it is plain. */
const sung = (part: Part | undefined): Sung => {
  expect(part?._tag).toBe('Sung');
  return part as Sung;
};

/** Each line's syllables' chords at a level: `at: 0` first, then `~` and each later one; `.` for none. */
const chordLines = (hymn: Hymn, part: Sung, level: 'full' | 'guitar') =>
  part.lines.map((line) =>
    line
      .map((s) => {
        const placed = s[level] ?? [];
        return placed.length === 0
          ? '.'
          : placed.map((p) => `${p.at > 0 ? '~' : ''}${Chord.format(p.chord, hymn.key)}`).join('');
      })
      .join(' '),
  );

/** Each line's syllables joined by `-` within a word and spaces between words. */
const cuts = (part: Sung, joint = '-') =>
  part.lines.map((line) =>
    line
      .map((s, i) => `${i === 0 ? '' : line[i - 1]?.word === s.word ? joint : ' '}${s.text}`)
      .join(''),
  );

// ----------------------------------------------------------------------------
// Hymn 1, "Praise to the Lord" (LOBE DEN HERREN), as the hymnal prints it
// ----------------------------------------------------------------------------

/** Bars 13 to 21, the third and fourth lines: soprano, alto, tenor, bass. */
const praiseLines3and4: Voices = [
  [
    [72, 1],
    [72, 1],
    [72, 1],
    [74, 3],
    [69, 1],
    [70, 1],
    [72, 1],
    [72, 1],
    [70, 1],
    [69, 1],
    [67, 3],
    [60, 1],
    [62, 1],
    [64, 1],
    [65, 1],
    [67, 1],
    [69, 1],
    [67, 3],
    [65, 3],
  ],
  [
    [65, 1],
    [67, 1],
    [65, 1],
    [65, 3],
    [65, 1],
    [65, 1],
    [67, 1],
    [65, 1],
    [62, 0.5],
    [64, 0.5],
    [65, 1],
    [64, 3],
    [60, 1],
    [58, 1],
    [58, 1],
    [57, 1],
    [62, 1],
    [61, 1],
    [62, 2],
    [60, 1],
    [57, 3],
  ],
  [
    [57, 1],
    [55, 1],
    [57, 1],
    [58, 3],
    [60, 1],
    [58, 1],
    [55, 1],
    [57, 1],
    [58, 1],
    [60, 1],
    [60, 3],
    [53, 1],
    [53, 1],
    [55, 1],
    [53, 1],
    [50, 1],
    [52, 1],
    [50, 1],
    [55, 0.5],
    [53, 0.5],
    [52, 1],
    [53, 3],
  ],
  [
    [53, 1],
    [52, 1],
    [53, 1],
    [46, 3],
    [53, 1],
    [50, 1],
    [52, 1],
    [53, 1],
    [55, 1],
    [57, 0.5],
    [53, 0.5],
    [48, 3],
    [45, 1],
    [46, 1],
    [43, 1],
    [50, 1],
    [46, 1],
    [45, 1],
    [46, 2],
    [48, 1],
    [41, 3],
  ],
];

/** The whole tune: bars 1 to 6, the same again for the second line, then bars 13 to 21. */
const praise = Fixture.praiseToTheLord.map((voice, i) => [
  ...voice,
  ...voice,
  ...(praiseLines3and4[i] ?? []),
]) as unknown as Voices;

const praiseText = [
  'Praise to the Lord, the Almighty, the King of creation!\nO my soul, praise Him, for He is thy health and salvation!\nAll ye who hear, now to His temple draw near;\nJoin ye in glad adoration!',
  "Praise to the Lord, who o'er all things so wondrously reigneth,\nShieldeth thee under His wings, yea, so gently sustaineth!\nHast thou not seen how thy desires e'er have been\nGranted in what He ordaineth?",
];

const praiseHymn = compile(
  source(file(praise, { verses: 2, intro: 6, meter: [3, 4], fifths: -1 }), praiseText),
);

describe('compile: hymn 1', () => {
  it.effect('places each chord on the syllable sung when it comes, at both levels', () =>
    Effect.gen(function* () {
      const hymn = yield* praiseHymn;
      const stanza = sung(hymn.stanzas[0]);
      expect([...chordLines(hymn, stanza, 'full'), ...chordLines(hymn, stanza, 'guitar')]).toEqual([
        'F Dm C/E F C Dm Am Bb F Bb Edim/G Dm Gm7/Bb~C~C7 F',
        'F Dm C/E F C Dm Am Bb F Bb Edim/G Dm Gm7/Bb~C~C7 F',
        'F C/E F Bb F Bb/D C/E F Gm F/A C',
        'F/A Bb Edim/G Dm Gm/Bb A Gm/Bb~C F',
        'F Dm C F C Dm Am Bb F Bb C7 Dm Gm7~C~C7 F',
        'F Dm C F C Dm Am Bb F Bb C7 Dm Gm7~C~C7 F',
        'F C F Bb F Bb C F Gm F C',
        'F Bb C7 Dm Gm A Gm~C F',
      ]);
      const a = stanza.lines[0]?.[12];
      expect(a?.text).toBe('a');
      expect(a?.full).toEqual([
        { chord: { root: 2, quality: 'm7', bass: 5 }, at: 0 },
        { chord: { root: 7, quality: '' }, at: 1 },
        { chord: { root: 7, quality: '7' }, at: 2 },
      ]);
    }),
  );

  it.effect('cuts the words as the hymnal prints them, a note to each syllable', () =>
    Effect.gen(function* () {
      const hymn = yield* praiseHymn;
      const stanza = sung(hymn.stanzas[0]);
      expect(cuts(stanza)).toEqual([
        'Praise to the Lord, the Al-might-y, the King of cre-a-tion!',
        'O my soul, praise Him, for He is thy health and sal-va-tion!',
        'All ye who hear, now to His tem-ple draw near;',
        'Join ye in glad ad-o-ra-tion!',
      ]);
      expect(hymn.verses).toEqual({ text: 2, midi: 2, exact: true });
      expect(hymn.key).toEqual({ tonic: 'F', minor: false });
      expect(hymn.meter).toEqual({ numerator: 3, denominator: 4 });
      for (const part of hymn.stanzas) {
        const one = sung(part);
        expect(one.level).toBe('syllable');
        expect(one.why).toEqual([]);
        expect(one.lines.flat().every((s) => s.notes === 1)).toBe(true);
      }
    }),
  );

  it.effect("joins each sung line's syllables back into the text's line", () =>
    Effect.gen(function* () {
      const hymn = yield* praiseHymn;
      hymn.stanzas.forEach((part, n) => {
        const lines = (praiseText[n] ?? '')
          .split('\n')
          .map((line) => line.replace(/\s+/g, ' ').trim());
        expect(cuts(sung(part), '')).toEqual(lines);
      });
    }),
  );
});

// ----------------------------------------------------------------------------
// The placement rules, on an invented tune in C, 4/4
// ----------------------------------------------------------------------------

/**
 * Two lines of four bars' time. Line 1 (beats 0-8): C, then G and a quarter
 * of G7 under a held note, C, then Am with an eighth of Fmaj7 under a held
 * note, Dm. A beat's rest (8-9) where the voices below play G7, held on into
 * line 2 (beats 9-16): G7, C, two eighths over G then C, a note over C and a
 * beat's rest over F, C.
 */
const tune: Voices = [
  [
    [72, 1],
    [74, 2],
    [72, 1],
    [76, 2],
    [77, 2],
    [0, 1],
    [74, 1],
    [72, 1],
    [71, 0.5],
    [72, 0.5],
    [76, 1],
    [0, 1],
    [72, 2],
  ],
  [
    [64, 1],
    [67, 1],
    [65, 1],
    [64, 1],
    [69, 4],
    [65, 2],
    [64, 1],
    [62, 0.5],
    [64, 1.5],
    [69, 1],
    [64, 2],
  ],
  [
    [55, 1],
    [59, 2],
    [55, 1],
    [60, 2],
    [62, 2],
    [59, 2],
    [55, 3],
    [60, 1],
    [55, 2],
  ],
  [
    [48, 1],
    [43, 2],
    [48, 1],
    [45, 1],
    [41, 0.5],
    [45, 0.5],
    [50, 2],
    [43, 2],
    [48, 1],
    [43, 0.5],
    [48, 1.5],
    [41, 1],
    [48, 2],
  ],
];

const tuneFile = (verses: number) => file(tune, { verses, intro: 4, meter: [4, 4], fifths: 0 });

/** Each syllable as `text/notes/beats:` and its full chords, each `chord@at`. */
const placed = (hymn: Hymn, part: Sung) =>
  part.lines.map((line) =>
    line
      .map(
        (s) =>
          `${s.text}/${s.notes}/${s.beats}:${(s.full ?? []).map((p) => `${Chord.format(p.chord, hymn.key)}@${p.at}`).join(',')}`,
      )
      .join(' '),
  );

describe('compile: where a chord goes', () => {
  it.effect(
    'folds a change shorter than a quarter, keeps a longer one at its time, and carries a line its sounding chord',
    () =>
      Effect.gen(function* () {
        const words = 'Sing we now to God,\nLord of all light now';
        const hymn = yield* compile(source(tuneFile(2), [words, words]));
        const stanza = sung(hymn.stanzas[0]);
        expect(stanza.level).toBe('syllable');
        expect(placed(hymn, stanza)).toEqual([
          // "we": G7 a quarter in stays at beat 1; "to": the eighth of Fmaj7 folds into Am.
          'Sing/1/1:C@0 we/1/2:G@0,G7@1 now/1/1:C@0 to/1/2:Am@0 God,/1/2:Dm@0',
          // The G7 in the rest before line 2 is not God's; Lord carries it, sounding when it starts.
          // "all": the change on the melisma's second note, at the first note's length.
          // "light": the F in the rest after it, at its length (no change at its start: C still sounds).
          'Lord/1/1:G7@0 of/1/1:C@0 all/2/1:G@0,C@0.5 light/1/1:F@1 now/1/2:C@0',
        ]);
      }),
  );

  it.effect('shows no neighbour chord over a held bass between two equal chords', () =>
    Effect.gen(function* () {
      // Over a held G: C/G, then F/G for a beat (no chord names G A C F; the notes above G are F), then C/G.
      // A line over C first: a verse holds eight notes at least.
      const pedal: Voices = [
        [
          [60, 1],
          [64, 1],
          [67, 1],
          [72, 1],
          [67, 1],
          [64, 1],
          [60, 2],
          [72, 3],
          [71, 1],
          [72, 4],
        ],
        [
          [55, 4],
          [55, 4],
          [64, 1],
          [65, 1],
          [64, 1],
          [62, 1],
          [64, 4],
        ],
        [
          [52, 4],
          [52, 4],
          [55, 1],
          [57, 1],
          [55, 1],
          [55, 1],
          [55, 4],
        ],
        [
          [48, 4],
          [48, 4],
          [43, 4],
          [48, 4],
        ],
      ];
      const words = 'Come let us all sing to Him,\nSing now, Lord';
      const midi = file(pedal, { verses: 2, intro: 4, meter: [4, 4], fifths: 0 });
      const hymn = yield* compile(source(midi, [words, words]));
      expect(placed(hymn, sung(hymn.stanzas[0]))[1]).toBe(
        'Sing/1/3:C/G@0 now,/1/1:G@0 Lord/1/4:C@0',
      );
    }),
  );

  it.effect('gives no chord to a syllable sharing the note before it', () =>
    Effect.gen(function* () {
      const words = 'Sing we now to God,\nLord of all the light, sing now';
      const hymn = yield* compile(source(tuneFile(2), [words, words]));
      const stanza = sung(hymn.stanzas[0]);
      expect(stanza.fit.shared.acrossWords).toBe(1);
      expect(stanza.level).toBe('line');
      expect(placed(hymn, stanza)[1]).toBe(
        'Lord/1/1:G7@0 of/1/1:C@0 all/1/0.5:G@0 the/1/0.5:C@0 light,/1/1:F@1 sing/1/2:C@0 now/0/0:',
      );
    }),
  );
});

describe('compile: trust', () => {
  it.effect('keeps words alone when the text has far more syllables than the tune has notes', () =>
    Effect.gen(function* () {
      const words =
        'Holy, holy, holy, merciful and mighty, glorious evermore,\nAlleluia, alleluia, everlasting melody of heaven';
      const hymn = yield* compile(source(tuneFile(2), [words, words]));
      const [first] = hymn.stanzas;
      expect(first._tag).toBe('Plain');
      expect(first.why).toContain('notes');
      expect(first).toMatchObject({ lines: words.split('\n') });
    }),
  );

  it.effect('holds every part, the refrain too, as plain text', () =>
    Effect.gen(function* () {
      const words = 'Sing we now to God,\nLord of all light now';
      const hymn = yield* compile(
        source(tuneFile(2), [words, words], {
          held: 'verse split misplaced',
          refrain: '  Sing now  ',
        }),
      );
      expect([...hymn.stanzas, hymn.refrain]).toEqual([
        { _tag: 'Plain', lines: ['Sing we now to God,', 'Lord of all light now'], why: ['held'] },
        { _tag: 'Plain', lines: ['Sing we now to God,', 'Lord of all light now'], why: ['held'] },
        { _tag: 'Plain', lines: ['Sing now'], why: ['held'] },
      ]);
    }),
  );

  it.effect("lays a stanza the file does not play on its last verse's notes, and says so", () =>
    Effect.gen(function* () {
      const words = 'Sing we now to God,\nLord of all light now';
      const hymn = yield* compile(source(tuneFile(2), [words, words, words]));
      expect(hymn.verses).toEqual({ text: 3, midi: 2, exact: true });
      const parts = hymn.stanzas.map(sung);
      expect(parts.map((part) => [part.level, part.why])).toEqual([
        ['syllable', []],
        ['syllable', []],
        ['syllable', ['reused']],
      ]);
      expect(parts[2]?.lines).toEqual(parts[1]?.lines);
    }),
  );

  it.effect(
    "joins each sung line's syllables back into its line: apostrophes, dashes, quotes",
    () =>
      Effect.gen(function* () {
        const words = "Sing we — now to God's\n“Lord   of all” light now!";
        const hymn = yield* compile(source(tuneFile(2), [words, words]));
        expect(cuts(sung(hymn.stanzas[0]), '')).toEqual([
          "Sing we — now to God's",
          '“Lord of all” light now!',
        ]);
      }),
  );

  it.effect("stores the refrain once, laid after stanza 1, its lines after the stanza's", () =>
    Effect.gen(function* () {
      const hymn = yield* compile(
        source(tuneFile(2), ['Sing we now to God,', 'Praise Him, all ye saints,'], {
          refrain: 'Lord of all light now',
        }),
      );
      expect(placed(hymn, sung(hymn.stanzas[0]))).toEqual([
        'Sing/1/1:C@0 we/1/2:G@0,G7@1 now/1/1:C@0 to/1/2:Am@0 God,/1/2:Dm@0',
      ]);
      expect(placed(hymn, sung(hymn.refrain))).toEqual([
        'Lord/1/1:G7@0 of/1/1:C@0 all/2/1:G@0,C@0.5 light/1/1:F@1 now/1/2:C@0',
      ]);
    }),
  );
});
