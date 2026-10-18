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
  transposes by changing its key alone, and spells them in any key as a
  score does: a bass that is one of the chord's notes on the letter its
  interval gives (G/B in E-flat, not G/Cb), and a diminished chord on a
  raised degree of a major key with a sharp (G#dim in G, not Abdim). A set of
  notes no chord names is named, when it can be, by the complete chord its
  notes above the bass make (`Db/Eb`), or by the one complete chord it makes
  with one note left out (a passing tone); `Harmony` drops a chord over a held
  bass that only neighbours the same chord on both sides. A key is one a
  signature writes, the 15 major and 15 minor keys from seven flats to seven
  sharps (`Key`; no E# major, no Db minor), so every degree spells with at
  most two accidentals. A member bass whose interval's letter would take three
  accidentals is spelled as its degree in the key instead.

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
its key, its meter, each stanza in order and its refrain once, with the
order the hymnal sings it in: `after-each` (after every stanza),
`first-and-after-each` (before stanza 1 and after every stanza, as a page
that prints the refrain first and marks D.C. sings it) or `first-and-last`
(before stanza 1 and after the last, as 172's Alleluias). No other order can
be written. `sung(hymn)` gives the lines in the order they are sung, each
with its stanza (or `refrain`), part and line.

The compiler reads the stanzas' order from the text's verse ids: stanzas 0,
1, … n − 1, at most one refrain with a negative id, and a letter in every
verse. A text laid out any other way is refused (`VerseLayoutError`, counted
as failed). The ids do not say where the refrain is sung, so
`data/fixes/refrains.json` lists, read off the printed pages, the six hymns
that sing it first: 93, 121, 133, 362 and 475 (`first-and-after-each`) and
172 (`first-and-last`); every other refrain is `after-each`. The tune plays
each verse as a stanza and the refrain after it (a refrain sung first is the
intro), so the compiler lays the refrain after stanza 1 on the tune's first
verse, or, for `first-and-last`, after the last stanza alone on the last
verse, and keeps that one.

Hymn 593 sings a different refrain ending after stanza 3 ("I'm very sure …
My anchor"), which one refrain cannot hold. `data/fixes/593.json` is the
printed page, each line with the system, row and bars it was read from:
three stanzas, the refrain, and its two endings (after stanzas 1 and 2, and
after stanza 3). `bun scripts/hymnal-593.ts [--db <hymnal.db>]` writes it
into hymnal.db as three stanzas, each with the refrain and its own ending
inline, and no refrain.
Each part says how far its placement can be trusted:

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
list in `scripts/sources.ts` and the fixes in `data/fixes` name hymns. The level is judged from the fit's
numbers alone, so it cannot see a line laid a note off: the key's section of
the report shows `syllable` parts with lines that do not match the score.

Where a chord goes, at both levels (`full` and `guitar`):

- A change belongs to the syllable sung when it comes: a syllable owns the
  time from its first note to the next syllable's. A change under a held
  note, on a melisma's later note, or in a rest after it sits on that
  syllable, `at` quarter-note beats after it starts (`at` at least its
  `beats` when it falls in the rest).
- A change after a syllable's start shorter than a quarter note is a passing
  chord: it folds into the chord before it.
- Each line's first syllable carries the chord sounding when it starts.
  Changes in the rest between lines are dropped. Where the file plays a
  line's pickup in unison or octaves no chord sounds, and the syllable
  carries none.
- A syllable sharing the note before it carries no chord.

`bun run golden <compiled.json> <chart.chordpro> [--level full|guitar|both]
[--allow <file>]` compares a compiled hymn with a hand chart
(`data/charts/sdah-001.chordpro`, `sdah-100.chordpro`, written in the dialect
`src/chordpro.ts` reads and writes), syllable by syllable, and prints each
difference (a `cut` difference prints the two syllables' texts where the
others print chords); `data/charts/allowed.txt` lists the four accepted
ones. The
chart reader fails on what it cannot read (a trailing escape, a directive
other than `title`, `subtitle`, `key`, `time` and `comment` outside a section
and the four section directives) rather than drop it.

`data/key/NNN.txt` is the alignment key: for fifteen hymns, stanza 1 and its
refrain as the score prints them, a syllable per token, `text_N` for one sung
on N notes and `text_0` for one sharing the note before. The compile reports
how many lines lay exactly as the key says, in all and per level.

The MIDI files, the hand charts, the key and the compiled set are tracked
here (owner, 2026-10-18). Most tests build their MIDI in code
(`src/midi-fixture.ts`); `src/score.test.ts` reads three files that carry no
key signature (6, 162, 663). `src/fidelity.test.ts` compiles every hymn
fresh from hymnal.db, `data/fixes` and its MIDI file, as `bun run compile`
does, and checks that `sung` gives exactly the printed lines in the order the
hymnal sings them: each stanza's lines, and the refrain where
`refrains.json` (or the fix) places it, compared word for word with case and
punctuation set aside. It builds the expected order from the text and the
fixes alone, never from the compiler. The tests read no chart, key or
compiled file.
