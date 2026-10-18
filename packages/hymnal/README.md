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
  transposes by changing its key alone, and spells them in any key. A set of
  notes no chord names is named, when it can be, by the complete chord its
  notes above the bass make (`Db/Eb`), or by the one complete chord it makes
  with one note left out (a passing tone); `Harmony` drops a chord over a held
  bass that only neighbours the same chord on both sides.

`bun run chart <file.mid> [verses] [full|guitar]` prints one verse's chords
note by note, to check a file by eye against the printed hymn. `bun run split
<line>…` (or lines on stdin) prints lines with their words cut. `bun run
align <file.mid> <verses> <verse> < lines.txt` prints a verse laid on its
notes, a melisma marked with the notes it holds (`is_2`).

## The compiled hymnal

`bun run compile` compiles every hymn of the SDA Hymnal (1985), 1 to 695,
from its text (`packages/core/data/hymnal.db`, read through
`@bible/core/hymnal`) and its MIDI file (`data/midi/NNN.mid`) into
`data/sdah-1985/NNN.json`, one hymn each, and `data/sdah-1985/index.json`
(each hymn's number, title and lowest level). It decodes every file it wrote
back through the schema and writes a report beside the folder,
`data/sdah-1985.report.md` (not tracked: it names the time taken): the counts
by level, the reasons, the inexact verse splits, the held hymns and the
alignment key's result. The same inputs give the same bytes. Flags, each
relative to the repository root: `--db`, `--midi`, `--out`, `--key`.

The app reads a hymn through `@bible/hymnal/hymn`, which imports only
`effect` and `@bible/hymnal/chord` (no Bun, Node or dictionary). A hymn holds
its key, its meter, each stanza in order and its refrain once. Each part
says how far its placement can be trusted:

- `Sung` at `syllable`: the chords sit on the syllables they change on. The
  app shows each chord over its syllable.
- `Sung` at `line`: the syllables are less sure (many melismas, a costly fit,
  or one syllable sharing a note across words). The app shows each line's
  chords in order above it.
- `Plain` (`text`): the words alone, no syllables and no chords: the tune and
  the words do not fit (`notes`, `shared`, `cost`), or the hymn is held back
  (`held`).

`why` says what lowered a part, and also records `inexact` (the verse split
came from the phrase search, not exact repeats) and `reused` (the text has
more stanzas than the file plays: the extra ones are laid on its last
verse). The thresholds are constants in `src/compile.ts`; only the held
list in `scripts/compile.ts` names hymns.

Where a chord goes, at both levels (`full` and `guitar`):

- A change belongs to the syllable sung when it comes: a syllable owns the
  time from its first note to the next syllable's. A change under a held
  note, on a melisma's later note, or in a rest after it sits on that
  syllable, `at` quarter-note beats after it starts (`at` at least its
  `beats` when it falls in the rest).
- A change after a syllable's start shorter than a quarter note is a passing
  chord: it folds into the chord before it.
- Each line's first syllable carries the chord sounding when it starts.
  Changes in the rest between lines are dropped.
- A syllable sharing the note before it carries no chord.

`bun run golden <compiled.json> <chart.chordpro> [--level full|guitar|both]
[--allow <file>]` compares a compiled hymn with a hand chart
(`data/charts/sdah-001.chordpro`, `sdah-100.chordpro`, written in the dialect
`src/chordpro.ts` reads and writes), syllable by syllable, and prints each
difference; `data/charts/allowed.txt` lists the four accepted ones.

`data/key/NNN.txt` is the alignment key: for fifteen hymns, stanza 1 and its
refrain as the score prints them, a syllable per token, `text_N` for one sung
on N notes and `text_0` for one sharing the note before. The compile reports
how many lines lay exactly as the key says, in all and per level.

The MIDI files, the hand charts, the key and the compiled set are tracked
here (owner, 2026-10-18). The tests read at most a few of them; most build
their MIDI in code (`src/midi-fixture.ts`).
