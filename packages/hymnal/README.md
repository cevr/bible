# @bible/hymnal

Chords for the hymnal, read from each hymn's MIDI file: the harmony its four
voices sound, named and placed on the melody note where it changes.

- `Midi.parse` reads a Standard MIDI File into tracks of notes, with its
  meters and keys.
- `Score.fromMidi` finds the harmony tracks, the melody, the key, and where
  the intro ends and each verse begins: equal verses where the tune repeats
  note for note, else each verse at the phrase end where its opening recurs
  (a file may play each verse in its own rhythm).
- `Harmony.onNotes` gives each melody note of a verse its chord changes, at
  two levels: `full` (every chord of half a beat or more, inversions kept)
  and `guitar` (what a guitarist strums).
- `Syllables` counts the syllables a word may be sung in (the CMU dictionary,
  with sung contractions, elisions and archaic endings) and cuts it as a
  hymnal prints it under the notes: `Al-might-y`, `reign-eth`, `cre-a-tion`.
- `Syllables.stresses` marks which syllables a word stresses, from the
  dictionary or a stem and its ending.
- `Align.align` lays a verse's words on its melody: each syllable on the note
  it starts on and the notes it holds, the cheapest placement that keeps the
  words in order. Holds are cheapest on short even notes and on notes the
  other voices sustain, lines start after the tune pauses, unstressed
  syllables keep off strong beats, and a word sung shorter (glo-rious) puts
  two syllables on one note. The files carry no slurs, so a dotted note and
  its short neighbour can go either way.
- `Chord` keeps a root and bass as degrees above the tonic, so a hymn
  transposes by changing its key alone, and spells them in any key.

`bun run chart <file.mid> [verses] [full|guitar]` prints one verse's chords
note by note, to check a file by eye against the printed hymn. `bun run split
<line>…` (or lines on stdin) prints lines with their words cut. `bun run
align <file.mid> <verses> <verse> < lines.txt` prints a verse laid on its
notes, a melisma marked with the notes it holds (`is_2`).

The MIDI files and the hymn texts are copyrighted arrangements. They stay out
of this repository: the tests build their MIDI in code (`src/midi-fixture.ts`).
