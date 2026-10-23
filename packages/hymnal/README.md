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

The compile also writes `data/sdah-1985/topics.json`: the hymnal's 62
sections as each page prints them at its foot, as ranges of hymn numbers
(`Topics` in `@bible/hymnal/hymn`, `{ id, name, first, last }`, ordered).
The schema refuses a table that is not a partition of 1–695, so every hymn
has exactly one topic, and `topicOf(topics, n)` gives it. `scripts/topics.ts`
builds it from hymnal.db's sections and `data/fixes/topics.json`, where the
print differs: a range filed under another section (421–437 print ETERNAL
LIFE), a name the print gives otherwise (HOLY SCRIPTURES, a trailing
carriage return), and each page foot read as a witness (an owner photo, a
hymnary.org scan page, or `contiguity` for a hymn no shown page prints,
between two printed witnesses of the same heading). A section split in two
with no move for it is refused (`TopicsError`), never repaired. The report
lists each topic with its witnesses and the topics no page witnesses.

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
`row: "fixed"` in `data/census.json`; three of `matches` hymns (140,
145 and 258) that change no word and write the refrain the page varies by
stanza as `varies`; and five of `matches` hymns (3, 18, 162, 207 and 402)
that change no word and divide their lines as the page does, where the
owner answered a `disputed` ruling for the page. A line the
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
key signature (6, 162, 663). `src/fidelity.slow.test.ts` compiles every hymn
fresh from hymnal.db, `data/fixes` and its MIDI file, as `bun run compile`
does (in four workers, `src/fidelity-worker.ts`, so the compiles share the
cores), and checks that `sung` gives exactly the printed lines in the order the
hymnal sings them: each stanza's lines, and the refrain where
`refrains.json` places it (a fix's varying refrain after each stanza),
compared word for word with case and punctuation set aside. It builds the
expected order from the text and the fixes alone, never from the compiler,
and refuses a refrain `refrains.json` does not place. The tests read no
chart, key or compiled file.

## Recordings

`bun run render --hymns 1,46` (or `--all`) plays the hymnal's MIDI files as
MP3 recordings in style C, "Warm band", the style the owner picked by ear from
the listening pilot. The code is `scripts/render/`; its numbers are data in
`scripts/render/style.ts`. The app plays the set `RECORDING_SET` from
`src/recordings.ts` (`warm-1`), uploaded by the app's `audio:upload`
(`apps/hymnal/README.md`).

- `voices` (`src/voices.ts`) reads a hymn's four parts through the score's own
  reading: S the melody, B the bass, A and T the inner voices. `Midi.secondsOf`
  gives a file's length from its tempo map.
- Each stem (piano; violas, cellos, contrabass and melody violins) is its own
  MIDI file on the hymn file's own clock: every tempo, meter and key event at
  its tick, the notes at their ticks, only the velocities humanised by a
  seeded ±5 (`scripts/render/stems.ts`), drawn as the listening pilot drew
  them (Python's `random`, `scripts/render/random.ts`), so each stem plays the
  velocities the owner heard. One key sounds once at a time. No onset moves,
  so the words stay synced to the MIDI.
- The sampler is sfizz_render 1.2.3, built from its tarball (pinned by sha256)
  with `sfizz-render-float.patch`, which writes float WAV. Each instrument is
  loaded whole before the first note (a `hint_ram_based` wrapper): streamed,
  two renders of one stem differ.
- The instruments are fetched into the cache from `instruments.lock.json`
  (made by `--lock` from GitHub's trees at pinned commits): each file by its
  raw URL, size and sha256.
- The mix levels each stem by the film's meter (`@bible/film/measure`), pans
  it and sums it. The master runs in-process through NodeAV's FFmpeg: the
  room (the listening pilot's impulse response, `scripts/render/room-C.wav`),
  a compressor, the fade, then −16 LUFS limited at −2 dBFS, LAME 192 kb/s
  bit-exact, the credits as the one comment.
- Each hymn is checked on the MP3 as a player decodes it
  (`scripts/render/checks.ts`): length, true peak, loudness, clipping, silence
  while notes sound, onset lag, every stem sounding through its own last
  note's release, and each process's peak memory. A hymn that fails gets a
  `<n>.png` sheet beside its record, gone once it passes.
- The silence check's numbers, −45 LUFS for 1.0 s, are calibrated on the
  pilot's six hymns (1, 46, 93, 108, 250, 462): their quietest momentary
  block while notes sound reads −20.0 to −21.9 LUFS, 23 dB or more above
  the threshold (2026-10-22).
  Measure the six again before changing the silence check or the sound.

The cache is `$HYMN_RENDER_CACHE` (default `~/.cache/manna-hymn-render`), and
the set goes to `sets/warm-1/` there unless `--out` names a folder: `<n>.mp3`,
`<n>.json` (its checks, memory, times and resume key) and `manifest.json`. A
hymn's resume key covers only what shapes its sound: its MIDI file, the style,
the lock, the sampler, NodeAV, the credits and the files the sound's code
reaches (`AUDIO_SOURCES` in `scripts/render/run.ts`). A rerun renders a hymn
whose key changed, and checks every other again from its record
(`scripts/render/record.ts`): it keeps one that passes and renders again one
that fails, so a change to the checks renders nothing. The manifest lists the
records that stand under today's key, each passed or failed by today's
checks. Before each hymn the run waits while swap
use is over 8 GB or the load over `--load` (12 by default), and stops under
3 GB of free disk. The
bytes are this Mac's: another host's sampler and FFmpeg give others, so a set
is rendered on one host and recorded with its tools' hashes.

`--transpose <t>` (-5 to 6) renders the same style in another key, as the
set `warm-1-up<t>` or `warm-1-down<-t>` (`keySet` in `src/recordings.ts`;
the stepper's order is `KEY_TRANSPOSES`). Every note moves t semitones; the
ticks, the tempo map and the velocities stay, so the words' timings hold.
A stem that would then play a note its instrument has no sample for moves
an octave as a whole (`scripts/render/keys.ts`, its ranges read from the
SFZ files by `keys.slow.test.ts`), and the hymn's line names it
(`moved bass +12`). A part wider than its instrument folds each note still
out of range by octaves into it. The manifest records the transpose. No
flag is the printed key, `warm-1`, unchanged. The app's `audio:stream`
renders and uploads the key sets (`apps/hymnal/README.md`, "The key sets").

The piano is the Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0; the
strings are VS Chamber Orchestra 2: Community Edition by Versilian Studios,
CC0 1.0. `RECORDING_CREDITS` holds the credit Settings → About shows.

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
`repeat`, `shared`, `layout`, `slip`, `assumption`, `disputed`, `owner` or `unreadable`; a place no crop holds
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

The shape of a hymn (its stanzas, lines and refrain) is held to its
deciding page apart from its words. `data/shapes.json` holds a shape
reading of every hymn with a deciding page: a fresh Opus reader at max
effort, shown 1:1 strips of the page and never the row, reports the header's
metre, the stanzas the page prints, each lyric row under each system (its
word count, its first, middle and last two words, and the places of the
words it prints with a capital), the refrain (where it is printed, where it
is sung, and the rows it prints for some stanzas only), and any other row
(an echo, a descant). It writes counts, positions and anchors, never the
lyrics. `--readings <dir>` holds the committed readings to the readers'
reports.

The printed source is the text the check holds (`printedTextOf`): the fix's
stanzas and refrain, else the row's, and the refrain's order from
`data/fixes/refrains.json`, read into lines of words by the census's reader
(`readText`, `layoutOf`). Each stanza is compared as
it is sung (the stanza, then the refrain after it): each row of the page is
placed at the word its count puts it at, its three anchors held there
within one word. An anchor that stands at the place its count gives is
found there, wherever else it stands (a phrase the hymn repeats in reach);
one that stands at two places in reach, neither the counted one, is
unresolved. A row
whose count is one off (a word the page elides or splits) places each word
on one side of the slip only: its first word where its first words stand,
and the side its middle words, found in place, leave the slip on. Each
property of the layout, the page's evidence for it, and the mutation of
`scripts/layout.ts` (`mutantsOf`) that a wrong row would be:

| Property          | The page's evidence                                                                       | Mutations                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| stanza count      | the stanzas the page prints                                                               | drop any stanza, repeat any stanza                                                                     |
| stanza order      | each stanza's rows, in their place                                                        | swap any two stanzas whose words differ                                                                |
| stanza split      | each stanza's rows, in their place                                                        | split a stanza at each line; join two neighbours; move a boundary one line either way                  |
| line presence     | each row's count and anchors                                                              | drop any line, repeat any line, put any line of another stanza in at any place of a stanza             |
| line order        | each row's count and anchors                                                              | swap two neighbouring lines whose words differ; swap a stanza's first and last lines                   |
| line break        | the capitals, the metre, a stanza printed as text, stanzas printed under the same systems | move a word over a line's end either way, join two neighbouring lines, split a line at its middle word |
| indent            | none: the row format holds no indent                                                      | indent any line                                                                                        |
| refrain presence  | the refrain the page prints                                                               | drop the refrain; make a stanza's last line a refrain                                                  |
| refrain placement | where the page prints and sings it                                                        | every other order; the refrain inside one stanza only                                                  |
| refrain varies    | refrain rows printed for some stanzas only                                                | drop one varying part (its siblings kept), drop the item whole; sing its parts as one                  |
| unnumbered rows   | the page's other rows, an echo or a descant                                               | drop the words of a row that is no echo and no descant                                                 |

The page prints no line breaks under the music, so the check reads a line
break five ways: each line of the source opens on a word the page prints
with a capital; a capital the page prints inside a line opens a line of the
source, a sentence (after `.`, `!` or `?`, or a quote), or is a word the
book capitalises inside a line elsewhere (`capitalsOf`: a name of God,
`I`, `O`), and the source's own capital there excuses nothing (two lines
joined keep the second's capital); stanzas printed under the same systems have as many lines; two
neighbouring lines never miss the header's metre by opposite amounts; and a
stanza printed as text below the music has its lines. A row whose words the
page prints but whose lines it divides otherwise (a long poem line written
as two lines, a stanza a line longer than its siblings) keeps its own
division: its ruling is a `layout` that settles the line.

`src/layout.slow.test.ts` runs the generated property over every hymn with a
deciding page (`domainOf`): each hymn's every mutation is made on its
printed text and read again by the census's reader (`readText`), so no mark
of the source is carried over, and held to its shape readings by the same check (`reachOf`, through `layoutLinesOf` and
`formatProblems`, never `problemsOf`), and the test prints how many
mutations each property makes, how many no layout line tells apart, and
how many each committed list holds. A mutation no check tells apart goes to
a fresh reach judge on 1:1 strips of the page, who rules it `cannot` (the
page cannot tell it from the row), `can` (the page shows it wrong) or
`unclear`. A `cannot` is on the unreachable list: a ruling's `unreachable`
names it, on crops of the page that show it cannot be told apart (a word
moved onto a word the page capitalises anyway, two lines joined where the
second opens on one, in a hymn whose header prints no metre that fixes
them; a stanza the page prints twice). A `can` or an `unclear` is on the
gap list: a ruling's `gaps` names it, on the crops that show it, a place
the check misses and the page does not. A mutation a list names that a
check reaches, one on both lists, and one it reaches not that no list
names, are each a failure. A stanza a mutation changes is placed again from
the hymn as committed: the rows before the first word it changes keep their
place (`placing`), so every line of another stanza is put in at every place
(234,540 mutations), each placing again only the rows from its change on. Each reach ruling holds the
fingerprint of the printed text it was ruled on (`layout`, `fingerprintOf`):
a row changed since leaves its list stale, a failure, since its names would
mean other mutations. The committed fixtures (`data/layout-mutants.json`)
each print a layout line too: the 115 mutants of the hymnrows review, made
from recipes, and the 619 line-break mutants the census let through at its
first review, by name and the fingerprint of the text they were found on.

What no check sees: a line break the page shows only by a capital it
prints anyway, where no metre or text stanza fixes the lines; the order of
two lines, or two stanzas, the page prints alike; a refrain the source
writes inside its stanzas that the page prints once, where the page has no
`refrains.json` order to hold it to. Each such mutation is on the
unreachable list.

What the check misses that the page shows (the gap list): a row it cannot
place, so no rule reads its words (a row counting echo words the source
keeps apart, a hymn whose rows the page prints in two passes, a row of a
hymn whose page lays it out otherwise and waits on the owner); a line that
opens on a word the book capitalises anyway, where the old line's opener is
a sentence's first word, and only the page's punctuation or its music shows
the break (the shape readings hold no punctuation); a metre missed within
the count's noise; and refrain lines, which the header's metre rarely
covers. Of the 480 (2026-10-20): 145 in rows it cannot place, 141 a line
opening on a word the book capitalises anyway, 118 in refrain lines, 16 of
line order, line presence and stanza order, 33 others, 17 a judge could not
tell, and 10 in 18, 32 and 319 (a one-word line put in within a row's
slack, a line put in at a stanza's end, a word moved over a line's end); 62 of them are 220's, which waits on the owner.

Each difference the check prints goes to a fresh judge on crops: a ruling
that finds the source right there (`slip`, `layout`, `assumption`, `echo`, `repeat`)
`settles` the difference's line (it needs no site). `assumption` is the
check's own rule misreading the page where the reader read it right: a
capital on a name, title or pronoun of God or on a quote's first word that
opens no poem line, or a metre the header names and the music does not
keep. A ruling that finds the
page lays the row out otherwise (`disputed`) settles it too, and leaves the
hymn `unsettled` for the owner; a ruling that settles a line the census no
longer prints is a problem. The owner's `answer` to a `disputed` ruling
names which the row keeps. `source`: the row keeps its words and layout,
and the ruling still settles its lines (58, 243 and 398). `page`: the
printed source is redivided at the page's line starts, each line's `from`
naming the system and row its first word is printed in, no word changed;
the ruling settles no line and stays as the record of the place (3, 18,
162, 207, 214 and 402). Either way the hymn takes the state its words give.

The four states (2026-10-22: 695 hymns, 1711 rulings; 1144 of the 362489
layout mutations unreached, 668 on the unreachable list and 476 on the gap
list, in 307 hymns):

| State       | Hymns | Deciding page                     | Blind readings of it                                                | Rulings that decided it                                                                                                                                                                                                        |
| ----------- | ----- | --------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `matches`   | 608   | 366 scan, 180 engraving, 62 photo | 519 1 reader, 71 1 OCR, 15 2 reader, 2 1 reader + 1 OCR, 1 3 reader | 272 hymns with no ruling; 336 with 1176 rulings: 0 change words, 1176 keep the row (471 words, 215 layout, 212 unreachable list, 118 gap list, 76 echo, 30 repeat, 15 disputed, 15 assumption, 13 slip, 10 shared, 1 misprint) |
| `fixed`     | 81    | 55 photo, 26 scan                 | 30 1 OCR, 24 2 reader, 24 1 reader, 3 1 reader + 1 OCR              | 0 hymns with no ruling; 81 with 432 rulings: 160 change words (148 words, 10 repeat, 2 owner), 272 keep the row (211 words, 19 layout, 16 gap list, 12 unreachable list, 9 repeat, 3 assumption, 1 disputed, 1 slip)           |
| `unsettled` | 2     | 2 engraving                       | 2 1 OCR                                                             | 0 hymns with no ruling; 2 with 103 rulings: 21 change words (19 words, 2 shared), 82 keep the row (44 disputed, 12 layout, 12 echo, 11 words, 2 unreachable list, 1 gap list)                                                  |
| `nopage`    | 4     | 4 none                            | 4 none                                                              | none: 4 hymns with no ruling                                                                                                                                                                                                   |

A `fixed` row is the base row with each ruling applied, written from its
`data/fixes/NNN.json`. One reading is enough to fix a row: a reading only
finds a run, and the judge's crops decide it. An `unsettled` or `nopage` row
stays the base row, and the hymn waits on the owner's photo of its page;
`bun run census` prints each with its note. A hymn whose page a judge found
laid out otherwise than its row (a `disputed` ruling: a poem line opened at
another word, a block sung where the page does not sing it) is `unsettled`
too, its row as it is, and waits on the owner's word, until he answers it.
220 waits on it: two judges read its engraving's 22 places, and the
database sings words there the engraving prints once.

`src/census.slow.test.ts` reads the census, the inventory, the rulings, the
crops, the fixes and hymnal.db, and checks each entry against them: its
deciding page, its base row, its state from its rulings, and its committed
row as the base row with each ruling applied. Its mutant cases relabel an
entry, drop a ruling or a crop, swap a crop's bytes, change a row word or a
later refrain variant, move a page, and point a fix line at another page,
and the census catches each one.
