import { HymnalService, HymnId } from '@bible/core/hymnal';
import { layerHymnalBun } from '@bible/core/hymnal/bun';
import * as BunServices from '@effect/platform-bun/BunServices';
import { ConfigProvider, Effect, Layer } from 'effect';
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
  extra: Partial<Pick<Source, 'held' | 'order'>> & { refrain?: string } = {},
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
  order: extra.order,
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

/** Twelve ticks: less than the few ticks the files strike a chord's notes off the tune's. */
const early = 1 / 32;

/**
 * Two lines of a note a syllable (beats 0-8 and 8-16), a chord each two
 * beats: C F G C, F C G C. The voices below change to F `early` before the
 * tune's third note, over a C the tune holds that F contains. The tune ends
 * a beat early, and the voices below play G in that last rest.
 */
const steps: Voices = [
  [
    [60, 1],
    [72, 1],
    [69, 1],
    [65, 1],
    [67, 1],
    [71, 1],
    [72, 1],
    [67, 1],
    [65, 1],
    [69, 1],
    [64, 1],
    [67, 1],
    [62, 1],
    [59, 1],
    [64, 1],
    [0, 1],
  ],
  [
    [55, 2 - early],
    [60, 2 + early],
    [62, 2],
    [64, 2],
    [60, 2],
    [55, 2],
    [62, 2],
    [55, 1],
    [59, 1],
  ],
  [
    [52, 2 - early],
    [57, 2 + early],
    [59, 2],
    [55, 2],
    [57, 2],
    [52, 2],
    [59, 2],
    [52, 1],
    [55, 1],
  ],
  [
    [48, 2 - early],
    [41, 2 + early],
    [43, 2],
    [48, 2],
    [41, 2],
    [48, 2],
    [43, 2],
    [48, 1],
    [43, 1],
  ],
];

const stepsFile = (verses: number) => file(steps, { verses, intro: 4, meter: [4, 4], fifths: 0 });

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

  it.effect('gives a chord struck a few ticks before a note to that note, not the one before', () =>
    Effect.gen(function* () {
      const words = 'Sing we all now to God of light,\nLord of all ye saints sing now';
      const hymn = yield* compile(source(stepsFile(2), [words, words]));
      expect(placed(hymn, sung(hymn.stanzas[0]))[0]).toBe(
        'Sing/1/1:C@0 we/1/1: all/1/1:F@0 now/1/1: to/1/1:G@0 God/1/1: of/1/1:C@0 light,/1/1:',
      );
    }),
  );

  it.effect("gives a change in the rest that ends a verse to the verse's last syllable", () =>
    Effect.gen(function* () {
      const words = 'Sing we all now to God of light,\nLord of all ye saints sing now';
      const hymn = yield* compile(source(stepsFile(2), [words, words]));
      expect(placed(hymn, sung(hymn.stanzas[0]))[1]).toBe(
        'Lord/1/1:F@0 of/1/1: all/1/1:C@0 ye/1/1: saints/1/1:G@0 sing/1/1: now/1/1:C@0,G@1',
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
      expect([...hymn.stanzas, hymn.refrain?.part]).toEqual([
        { _tag: 'Plain', lines: ['Sing we now to God,', 'Lord of all light now'], why: ['held'] },
        { _tag: 'Plain', lines: ['Sing we now to God,', 'Lord of all light now'], why: ['held'] },
        { _tag: 'Plain', lines: ['Sing now'], why: ['held'] },
      ]);
      expect(hymn.refrain?.order).toBe('after-each');
      const first = yield* compile(
        source(tuneFile(2), [words, words], {
          held: 'verse split misplaced',
          refrain: 'Sing now',
          order: 'first-and-after-each',
        }),
      );
      expect(first.refrain?.order).toBe('first-and-after-each');
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
      expect(placed(hymn, sung(hymn.refrain?.part))).toEqual([
        'Lord/1/1:G7@0 of/1/1:C@0 all/2/1:G@0,C@0.5 light/1/1:F@1 now/1/2:C@0',
      ]);
    }),
  );

  it.effect('shows chords per line when the syllables hold many notes', () =>
    Effect.gen(function* () {
      const words = 'Sing now to God of light,\nLord of saints now';
      const hymn = yield* compile(source(stepsFile(2), [words, words]));
      const stanza = sung(hymn.stanzas[0]);
      expect(stanza.fit).toMatchObject({ notes: 15, syllables: 10, shared: { acrossWords: 0 } });
      expect(stanza.fit.cost / stanza.fit.syllables).toBeLessThan(0.25);
      expect([stanza.level, stanza.why]).toEqual(['line', ['melismas']]);
    }),
  );

  it.effect('lays the refrain as stanza 1 sings it, though a later stanza lays it otherwise', () =>
    Effect.gen(function* () {
      const refrain = { refrain: 'Lord of all ye saints sing now' };
      const hymn = yield* compile(
        source(stepsFile(2), ['Sing we all now to God of light,', 'Praise ye the Lord,'], refrain),
      );
      const praise = 'Praise ye the Lord,';
      const later = yield* compile(source(stepsFile(2), [praise, praise], refrain));
      expect(placed(hymn, sung(hymn.refrain?.part))).toEqual([
        'Lord/1/1:F@0 of/1/1: all/1/1:C@0 ye/1/1: saints/1/1:G@0 sing/1/1: now/1/1:C@0,G@1',
      ]);
      expect(placed(later, sung(later.refrain?.part))).not.toEqual(
        placed(hymn, sung(hymn.refrain?.part)),
      );
    }),
  );

  it.effect(
    'lays a refrain sung first and last after the last stanza alone, and stores it from there',
    () =>
      Effect.gen(function* () {
        const refrain = { refrain: 'Lord of all ye saints sing now' };
        const stanzas = ['Sing we all now to God of light,', 'Praise ye the Lord,'];
        const each = yield* compile(source(stepsFile(2), stanzas, refrain));
        const ends = yield* compile(
          source(stepsFile(2), stanzas, { ...refrain, order: 'first-and-last' }),
        );
        const alone = yield* compile(source(stepsFile(2), stanzas));
        const lastWithIt = yield* compile(
          source(stepsFile(2), [stanzas[1] ?? '', stanzas[1] ?? ''], refrain),
        );
        expect(ends.refrain?.order).toBe('first-and-last');
        // Stanza 1 is laid without the refrain, as the file plays it; the refrain is laid after stanza 2.
        expect(ends.stanzas[0]).toEqual(alone.stanzas[0]);
        expect(ends.stanzas[0]).not.toEqual(each.stanzas[0]);
        expect(ends.stanzas[1]).toEqual(each.stanzas[1]);
        const notes = (part: Part | undefined) =>
          sung(part).lines.map((line) => line.map((s) => `${s.text}/${s.notes}`).join(' '));
        expect(notes(ends.refrain?.part)).toEqual(notes(lastWithIt.refrain?.part));
        expect(notes(ends.refrain?.part)).not.toEqual(notes(each.refrain?.part));
        expect(placed(ends, sung(ends.refrain?.part))).not.toEqual(
          placed(each, sung(each.refrain?.part)),
        );
      }),
  );
});

/** The tracked hymnal.db, read as the compile script reads it. */
const hymnal = layerHymnalBun.pipe(
  Layer.provide(BunServices.layer),
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromEnv({
        env: {
          HOME: '/',
          HYMNAL_DB_PATH: new URL('../../core/data/hymnal.db', import.meta.url).pathname,
        },
      }),
    ),
  ),
);

/** A part's first line as sung or printed. */
const firstLine = (part: Part | undefined) =>
  part?._tag === 'Sung' ? cuts(part, '')[0] : part?.lines[0];

describe('compile: verse layout', () => {
  it.effect('refuses a text whose stanzas and refrain it cannot read in printed order', () =>
    Effect.gen(function* () {
      const layouts = [
        { ids: [-3, -2, -1, 0, 1, 2], reason: 'more than one refrain' },
        { ids: [0, 2], reason: 'stanza ids are not 0, 1, … n - 1' },
        { ids: [1, 2], reason: 'stanza ids are not 0, 1, … n - 1' },
        { ids: [-1], reason: 'no stanza' },
        { ids: [0, 1], reason: 'a verse has no words', empty: 1 },
        { ids: [0, -1], reason: 'a verse has no words', empty: -1 },
        { ids: [0, 1], reason: 'a verse has no words', empty: 1, marks: true },
      ];
      for (const { ids, reason, empty, marks } of layouts) {
        const blank = marks === true ? '— . . . ,\n!' : ' \n ';
        const verses = ids.map((id) => ({
          id,
          text: id === empty ? blank : 'Sing we now to God,',
        }));
        const error = yield* Effect.flip(compile({ ...source(tuneFile(2), []), verses }));
        expect(error).toMatchObject({ _tag: 'VerseLayoutError', ids, reason });
      }
      const ordered = source(tuneFile(2), ['Sing we now to God,'], { order: 'first-and-last' });
      expect(yield* Effect.flip(compile(ordered))).toMatchObject({
        _tag: 'VerseLayoutError',
        ids: [0],
        reason: 'a refrain order with no refrain',
      });
    }),
  );

  it.effect(
    'reads hymn 593 from hymnal.db as three stanzas, each with the refrain ending the print sings after it',
    () =>
      Effect.gen(function* () {
        const text = yield* (yield* HymnalService).getHymn(HymnId.make(593));
        const hymn = yield* compile({ ...source(tuneFile(3), []), verses: text.verses });
        expect(hymn.refrain).toBeUndefined();
        expect(hymn.stanzas.map((stanza) => wordsOf(stanza).length)).toEqual([8, 8, 8]);
        expect(hymn.stanzas.map(firstLine)).toEqual([
          'In times like these you need a Savior,',
          'In times like these you need the Bible,',
          'In times like these I have a Savior',
        ]);
        expect(hymn.stanzas.map((stanza) => wordsOf(stanza)[6])).toEqual([
          'Be very sure, be very sure',
          'Be very sure, be very sure',
          "I'm very sure, I'm very sure",
        ]);
      }).pipe(Effect.provide(hymnal)),
  );
});

/** A part's lines as words: a sung line's syllables joined by word, its spaces collapsed. */
const wordsOf = (part: Part): string[] =>
  (part._tag === 'Sung' ? cuts(part, '') : [...part.lines]).map((line) =>
    line.trim().replace(/\s+/g, ' '),
  );
