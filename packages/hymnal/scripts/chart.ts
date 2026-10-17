/**
 * Prints the chords a hymn's MIDI file gives one verse, a melody note at a
 * time (`bar:note[chord]`, a change under a held note marked `~`), to check
 * a file by eye against the printed hymn.
 *
 *   bun run chart <file.mid> [verses=3] [full|guitar]
 */

import { Effect } from 'effect';

import { Chord, Harmony, Midi, Score } from '../src/index.js';

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const [file, verses = '3', level = 'full'] = process.argv.slice(2);
if (file === undefined || (level !== 'full' && level !== 'guitar')) {
  console.error('usage: bun run chart <file.mid> [verses] [full|guitar]');
  process.exit(2);
}

const program = Effect.gen(function* () {
  const bytes = yield* Effect.promise(() => Bun.file(file).bytes());
  const score = Score.fromMidi(yield* Midi.parse(bytes), Number(verses));
  const { spans, exact } = score.verses;
  const { start, end } = spans[0] ?? { start: 0, end: 0 };
  const bar = score.ticksPerBeat * score.beatsPerBar;
  yield* Effect.log(
    `key=${Chord.format({ root: 0, quality: score.key.minor ? 'm' : '' }, score.key)}`,
    `meter=${score.meter.numerator}/${score.meter.denominator}`,
    `intro=${start / bar} bars`,
    `verses=${spans.length}${exact ? '' : ' (inexact)'}`,
  );
  const notes = Harmony.onNotes(score, start, end, level).map(({ note, changes }) => {
    const chords = changes.map(
      (c) => `${c.offset > 0 ? '~' : ''}[${Chord.format(c.chord, score.key)}]`,
    );
    return `${Math.floor((note.start - start) / bar) + 1}:${NAMES[note.key % 12]}${chords.join('')}`;
  });
  console.log(notes.join(' '));
});

await Effect.runPromise(program);
