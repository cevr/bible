/**
 * Lays one verse's words on its notes in a hymn's MIDI file and prints each
 * line cut into its sung syllables, a melisma marked with the notes it holds
 * (`is_2`), to check the placement by eye against the printed hymn.
 *
 *   bun run align <file.mid> <verses> <verse> < lines.txt
 *
 * `verses` is the number of verses the text has, `verse` the one to lay (1
 * the first); the lines on stdin are that verse's, its refrain's after them.
 */

import { Effect } from 'effect';

import { Align, Midi, Score } from '../src/index.js';

const [file, verses = '1', verse = '1'] = process.argv.slice(2);
if (file === undefined) {
  console.error('usage: bun run align <file.mid> <verses> <verse> < lines.txt');
  process.exit(2);
}

const program = Effect.gen(function* () {
  const bytes = yield* Effect.promise(() => Bun.file(file).bytes());
  const score = Score.fromMidi(yield* Midi.parse(bytes), Number(verses));
  const lines = (yield* Effect.promise(() => Bun.stdin.text()))
    .split('\n')
    .filter((l) => l.trim() !== '');
  const aligned = Align.align(score, Number(verse) - 1, lines);
  for (const line of aligned.lines) {
    console.log(line.map((s) => `${s.text}${s.notes > 1 ? `_${s.notes}` : ''}`).join(' '));
  }
  yield* Effect.log(
    `notes=${aligned.melody.length}`,
    `melismas=${aligned.melismas}`,
    `shared=${aligned.shared.inWord}+${aligned.shared.acrossWords}`,
    `exact=${score.verses.exact}`,
  );
});

await Effect.runPromise(program);
