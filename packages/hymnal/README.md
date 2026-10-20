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
order the hymnal sings it in, one of five:

- `after-each`: after every stanza.
- `first-and-after-each`: before stanza 1 and after every stanza (a page that
  prints the refrain first and marks D.C. al Fine).
- `before-each`: before every stanza and not after the last (349 prints its
  refrain first and no return to it).
- `first-and-last`: before stanza 1 and after the last (172's footnote).
- `after-last`: after the last stanza only (262's repeat, its first ending
  back to stanza 2, its second on to the refrain).

No other order can be written. `sung(hymn)` gives the lines in the order
they are sung, each with its stanza (or `refrain`), part and line. Stanzas
are numbered by position: 93's page numbers its refrain "1." and its stanzas
"2." to "5.", so its printed "3." is stanza 2.

The compiler reads the stanzas' order from the text's verse ids: stanzas 0,
1, … n − 1, at most one refrain with a negative id, and a letter in every
verse. A text laid out any other way is refused (`VerseLayoutError`, counted
as failed). The ids do not say where the refrain is sung, so
`data/fixes/refrains.json` gives the order of every hymn whose row has a
refrain (196), each with a `from` that says what on its page shows it: 188
`after-each`, five `first-and-after-each` (93, 121, 133, 362, 475), and one
each of `before-each` (349), `first-and-last` (172) and `after-last` (262).
There is no default: `sourceOf` refuses a refrain with no entry and an entry
for a hymn with no refrain (`RefrainPlaceError`), and the compiler refuses a
refrain with no order. The tune plays each verse as a stanza and the refrain
after it (a refrain sung first is the intro), so the compiler lays the
refrain after stanza 1 on the tune's first verse, or, for `first-and-last`
and `after-last`, after the last stanza alone on the last verse, and keeps
that one.

A hymnal.db row whose text contradicts its printed page is rewritten from
`data/fixes/<n>.json`: the page as printed, its `print` naming the source
and each line's `from` the page image, system and row it was read from.
`bun scripts/hymnal-fixes.ts [--db <hymnal.db>]` writes every fix into
hymnal.db and changes no other row: the stanzas as ids 0 to n − 1 and the
refrain as id -1. A refrain whose lines differ by stanza (`varies`, each
with the stanzas it follows) cannot be one refrain, so each stanza is
written with the refrain sung after it inline, and the row has no refrain
(593's last two lines after stanza 3; 220's middle lines, each stanza's
own; 140's, 145's and 258's last two lines). Seven fixes came before the
census, read off the engravings (138, 203, 220, 438, 593, 620 and 628,
`PRIOR_FIXES` in `scripts/census.ts`): their files stay, the census holds
their rows as base rows, and it refuses a fix file of the base commit that
is gone. Its own fixes keep the row they replace as `replaces`: 81, each
`row: "fixed"` in `data/census.json`, and three of `matches` hymns (140,
145 and 258) that change no word and write the refrain the page varies by
stanza as `varies`. A line the
page prints once and the music sings again is written where it is sung:
440's lines 3 and 4 again at the end of each of its three stanzas.
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
how many lines lay exactly as the key says, in all and per level, and names
each line that does not as `key inexact <hymn>:<line>`.

The MIDI files, the hand charts, the key and the compiled set are tracked
here (owner, 2026-10-18). Most tests build their MIDI in code
(`src/midi-fixture.ts`); `src/score.test.ts` reads three files that carry no
key signature (6, 162, 663). `src/fidelity.test.ts` compiles every hymn
fresh from hymnal.db, `data/fixes` and its MIDI file, as `bun run compile`
does (in four workers, `src/fidelity-worker.ts`, so the compiles share the
cores), and checks that `sung` gives exactly the printed lines in the order the
hymnal sings them: each stanza's lines, and the refrain where
`refrains.json` places it (a fix's varying refrain after each stanza),
compared word for word with case and punctuation set aside. It builds the
expected order from the text and the fixes alone, never from the compiler,
and refuses a refrain `refrains.json` does not place. The tests read no
chart, key or compiled file.

## The census

`bun run census` holds every hymn 1 to 695 against its printed page in the
1985 book, one entry each in `data/census.json`, prints a `problem` line for
each disagreement and exits 1 on any (`scripts/census.ts` names each check).

What the plain run reads and checks itself:

- `data/pages.json`, the page inventory: the page images that show each
  hymn. These are the owner's photos (`data/photos/sdah-1985/`), the
  hymnary.org scan of the 1985 book (the pages it shows and the pages it
  withholds), and the SDAHImages engravings at a pinned commit. A hymn's
  deciding page is its photo when the photos show it whole; else its scan,
  when hymnary.org shows every page of it; else its engraving, unless the
  engraving's credit line dates a words revision after 1985 (`revised`);
  else none. A photo that shows part of a hymn stands beside its deciding
  page and rules the places it shows. The hymns between two shown scan
  pages' starts are put on every withheld page between them (inferred, not
  seen), except a hymn a complete reading or a look at the page saw end on
  a shown page; that is why page 71 lists no hymn.
- `data/crops/NNN/`: crops of a deciding page cut at 1:1, and
  `rulings.json`. Each ruling names its crops by file, box and digest (the
  first 16 hex digits of the file's sha256), and the words a judge saw each
  crop print at the place. A committed crop no ruling names is a problem.
- The base row: hymnal.db at `base.commit`, read from git.
- `data/fixes/NNN.json` and hymnal.db: a `fixed` row is the base row with
  each ruling applied, and each fix line's `from` names a deciding image of
  its hymn.

What the plain run trusts: each entry's reading counts (`readings.reader`,
`readings.ocr`) and witness digest in `data/census.json`, which the builder
writes, and which scan pages `data/pages.json` says hymnary.org shows. A
hymn never read, with a written count of 1 and no rulings, passes the plain
run. Three runs hold these:

- `bun run census --readings <dir>`: every blind reading's runs against the
  rulings, and each entry's counts against the readings. The readings hold
  the hymns' texts, so they are not committed. It also holds the committed
  shapes to the shape readers' reports (`<dir>/shape/`), and a reading that
  prints a refrain varying by stanza to a shape reading that says how, or a
  `repeat` or `echo` ruling that says why the shape prints none.
- `bun run census --scans <dir>`: the inventory's scan pages against the
  fetched scans.
- `bun run census --witness <csycms>`: the rows against the csycms
  witness transcription, every refrain block compared.

A handoff carries the logs of these runs.

Readings find; crops decide. Every hymn is transcribed for comparison only,
whatever its credit lines say. A blind reading of the deciding page is never
shown the row: a model reader's transcription, or, for hymns whose words a
model will not transcribe, the page's machine OCR (Apple Vision; its rows
are ordered against the base row's parts, never changed by it). A script
compares each reading with the base row in sung units (each stanza with the
refrain after it). A run is a stretch of words where they differ; a word
split alone (`for ever` against `forever`) is no run. A fresh judge (an
Opus subagent at max effort that never saw a reading whole) rules each run
on 1:1 crops of the page, one for each system the run lies on, and writes
what each crop prints there. A ruling is `words`, `misprint`, `echo`,
`repeat`, `shared`, `layout`, `owner` or `unreadable`; a place no crop holds
is `unreadable`. An `owner` ruling holds words a judge saw the crop print and
would not transcribe, copied by the owner from his own book (584's stanzas 6
and 7, printed as text below the music). Applying every ruling to the base row gives the row. Two
readings can find runs of different extent at one place, and each is ruled:
a ruling inside a wider one is applied once and must agree with it, and
rulings of one stretch with neither inside the other must come from one
judge, so the row is never stitched from two readings of the page. Each
line of a fix names the image, system and row it is printed in, placed by
a reader that looked at the page, on an image the line's ruling has a crop
of.

The shape is read off the page alone. OCR lays the page's words over the
row's own stanzas, lines and refrain, so it cannot see a refrain, a line or
an order the row lacks. `data/shapes.json` holds a shape reading of every
hymn whose words only OCR read, and of every hymn a model reading prints
with a refrain that varies by stanza: a fresh Opus reader at max effort,
shown 1:1 strips of the deciding page and never the row, reports the
stanzas the page prints, each one's row under each system by its first and
last two words, the refrain (where it is printed, and the rows it prints
for some stanzas only), and any other row (an echo, a descant). It writes
counts, positions and anchors, never the lyrics. The plain run holds each
shape to the printed source (the fix, else the row), stanza by stanza on
what is sung (the stanza, then the refrain sung after it): as many stanzas;
each row's anchors in order, a stanza's last row ending before the refrain
sung after it; no three words sung that no row prints; no
refrain the page does not print; each group of refrain rows printed for
some stanzas only a `varies` part after those stanzas; and no other row the
source lacks but an echo or a descant. A hymn only OCR read, with no shape
reading, is a problem. A shape cannot see a line added inside one system's
row; the word runs of its reading do. Each difference goes to a fresh judge
on crops, and a ruling that finds the source right there `settles` the
difference's line (it needs no site); a ruling that settles a line the
census no longer prints is a problem.

The four states (2026-10-20: 695 hymns, 985 rulings):

| State       | Hymns | Deciding page                     | Blind readings of it                                                | Rulings that decided it                                                                                                                          |
| ----------- | ----- | --------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `matches`   | 608   | 366 scan, 180 engraving, 62 photo | 519 1 reader, 71 1 OCR, 15 2 reader, 2 1 reader + 1 OCR, 1 3 reader | 521 hymns with no ruling; 87 with 563 rulings: 0 change words, 563 keep the row (471 words, 38 layout, 36 echo, 10 shared, 7 repeat, 1 misprint) |
| `fixed`     | 81    | 55 photo, 26 scan                 | 30 1 OCR, 24 2 reader, 24 1 reader, 3 1 reader + 1 OCR              | 0 hymns with no ruling; 81 with 371 rulings: 160 change words (148 words, 10 repeat, 2 owner), 211 keep the row (211 words)                      |
| `unsettled` | 2     | 2 engraving                       | 2 1 OCR                                                             | 0 hymns with no ruling; 2 with 51 rulings: 21 change words (19 words, 2 shared), 30 keep the row (12 echo, 11 words, 7 layout)                   |
| `nopage`    | 4     | 4 none                            | 4 none                                                              | none: 4 hymns with no ruling                                                                                                                     |

A `fixed` row is the base row with each ruling applied, written from its
`data/fixes/NNN.json`. One reading is enough to fix a row: a reading only
finds a run, and the judge's crops decide it. An `unsettled` or `nopage` row
stays the base row, and the hymn waits on the owner's photo of its page;
`bun run census` prints each with its note.

`src/census.test.ts` reads the census, the inventory, the rulings, the
crops, the fixes and hymnal.db, and checks each entry against them: its
deciding page, its base row, its state from its rulings, and its committed
row as the base row with each ruling applied. Its mutant cases relabel an
entry, drop a ruling or a crop, swap a crop's bytes, change a row word or a
later refrain variant, move a page, and point a fix line at another page,
and the census catches each one.
