# @bible/hymnal

Chords for the hymnal, read from each hymn's MIDI file: the harmony its four
voices sound, named and placed on the melody note where it changes.

- `Midi.parse` reads a Standard MIDI File into tracks of notes, with its
  meters and keys.
- `Score.fromMidi` finds the harmony tracks, the melody, the key, and where
  the intro ends and each verse begins.
- `Harmony.onNotes` gives each melody note of a verse its chord changes, at
  two levels: `full` (every chord of half a beat or more, inversions kept)
  and `guitar` (what a guitarist strums).
- `Chord` keeps a root and bass as degrees above the tonic, so a hymn
  transposes by changing its key alone, and spells them in any key.

`bun run chart <file.mid> [verses] [full|guitar]` prints one verse's chords
note by note, to check a file by eye against the printed hymn.

The MIDI files and the hymn texts are copyrighted arrangements. They stay out
of this repository: the tests build their MIDI in code (`src/midi-fixture.ts`).
