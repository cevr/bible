import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Chord from './chord.js';
import * as Harmony from './harmony.js';
import * as Midi from './midi.js';
import * as Fixture from './midi-fixture.js';
import * as Score from './score.js';

const [S, A, T, B] = Fixture.praiseToTheLord;
const bars = (voice: Fixture.Voice | undefined, from: number, to: number): Fixture.Voice => {
  const out: Array<readonly [number, number]> = [];
  let beat = 0;
  for (const note of voice ?? []) {
    if (beat >= from * 3 && beat < to * 3) out.push(note);
    beat += note[1];
  }
  return out;
};
/** As the hymnal's files are laid out: an intro of the first two bars, then each verse in full. */
const played = (voice: Fixture.Voice | undefined, verses: number) => [
  ...bars(voice, 0, 2),
  ...Array.from({ length: verses }, () => voice ?? []).flat(),
];

const praise = (layout: 'voices' | 'pairs') =>
  Effect.gen(function* () {
    const v = [S, A, T, B].map((voice) => played(voice, 2));
    const tracks =
      layout === 'voices'
        ? v.map((voice, i) => ({ name: i === 0 ? 'S A T B' : '', program: 5, voices: [voice] }))
        : [
            { name: 'SA TB', program: 5, voices: [v[0] ?? [], v[1] ?? []] },
            { program: 5, voices: [v[2] ?? [], v[3] ?? []] },
          ];
    const midi = yield* Midi.parse(Fixture.write({ meter: [3, 4], fifths: -1, tracks }));
    return Score.fromMidi(midi, 2);
  });

const written = (score: Score.Score, level: Harmony.Level) =>
  Harmony.onNotes(score, score.verses.spans[0]?.start ?? 0, score.verses.spans[0]?.end ?? 0, level)
    .map(({ changes }) =>
      changes.map((c) => `${c.offset > 0 ? '~' : ''}${Chord.format(c.chord, score.key)}`).join(' '),
    )
    .join(' | ');

describe('Score.fromMidi', () => {
  it.effect('finds the intro and the verses after it, with one track per voice or per pair', () =>
    Effect.gen(function* () {
      for (const layout of ['voices', 'pairs'] as const) {
        const score = yield* praise(layout);
        expect(score.key).toEqual({ tonic: 'F', minor: false });
        expect(score.beatsPerBar).toBe(3);
        expect(score.verses).toEqual({
          spans: [
            { start: 2 * 3 * 384, end: 8 * 3 * 384 },
            { start: 8 * 3 * 384, end: 14 * 3 * 384 },
          ],
          exact: true,
        });
        expect(score.melody.length).toBe(6 + 2 * 14);
      }
    }),
  );
});

describe('Score.findVerses', () => {
  it.effect(
    'finds verses played each in its own rhythm, each after the pause that ends the last',
    () =>
      Effect.sync(() => {
        const tune = [60, 62, 64, 65, 67, 65, 64, 62, 60];
        // A verse's last note is long; verse 2 splits its third note for an extra syllable.
        const verse = (split: boolean): Fixture.Voice =>
          tune.flatMap((key, i): Fixture.Voice => {
            if (split && i === 2)
              return [
                [key, 0.5],
                [key, 0.5],
              ];
            return [[key, i === 8 ? 3 : 1]];
          });
        const intro: Fixture.Voice = [
          [64, 1],
          [62, 1],
          [60, 3],
        ];
        let beat = 0;
        const melody = [...intro, ...verse(false), ...verse(true)].map(([key, beats]) => {
          const note = { key, start: beat * 384, end: (beat + beats) * 384, channel: 0 };
          beat += beats;
          return note;
        });
        const found = Score.findVerses(melody, 2);
        expect(found.exact).toBe(false);
        expect(found.spans.map((span) => span.start / 384)).toEqual([5, 16]);
      }),
  );
});

describe('Harmony.onNotes', () => {
  it.effect(
    'puts each change on the note it falls on, and changes under a held note after it',
    () =>
      Effect.gen(function* () {
        const score = yield* praise('pairs');
        expect(written(score, 'full')).toBe(
          'F | Dm | C/E | F | C | Dm | Am | Bb | F | Bb | Edim/G | Dm | Gm7/Bb ~C ~C7 | F',
        );
        expect(written(score, 'guitar')).toBe(
          'F | Dm | C | F | C | Dm | Am | Bb | F | Bb | C7 | Dm | Gm7 ~C ~C7 | F',
        );
      }),
  );
});
