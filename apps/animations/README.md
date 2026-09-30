# Animations

Narrated explainer films drawn in JavaScript: cut paper, torn edges, pastel
grain, handwriting, and ink that boils at 12 fps. Every frame is a pure
function of time drawn into a Canvas 2D context, so the same code drives the
scrubbable preview and a frame-exact MP4 export.

## Commands

```sh
bun run dev                                    # player at http://127.0.0.1:4400
bun run narrate <film>                         # stage stale beats with ElevenLabs, verify, remix full.wav
bun run script <film> [--sheet]                # the reading sheet; --sheet writes out/<film>/script-sheet.md + .html to print
bun run takes import <film> <folder|file>      # the owner's recordings as takes (trimmed, levelled, timed), remix full.wav
bun run score <film>                           # compose the stale score, remix full.wav
bun run sfx list [family] [--missing|--stale]  # the sound library (sounds/library.ts): kind, use, state, variants, level, loudness, source
bun run sfx plan [name…]                       # what make would generate and its credits (free)
bun run sfx make [name…] --yes [--cap n --tally f]  # generate candidates (paid; without --yes it prints the plan and stops)
bun run sfx try <name> [--prompt p --secs s --influence i --count n] --yes  # candidates with other settings (paid); keepable once library.ts says the same
bun run sfx audition <name> [--candidates]     # one WAV of the variants (or candidates), levelled, 0.5 s apart
bun run sfx keep|reject <name> <n…>            # curate candidates; a rejected one is never offered again
bun run sfx keep <name> <n…> --replace         # keep candidates in place of the kept variants (those wait again)
bun run sfx unkeep <name> <n…>                 # stop playing kept variants (by audition number); they wait again
bun run sfx import <file> <name>               # a CC0 recording into a declared recorded sound (public/)
bun run sfx render <name> [--seed n]           # a procedural sound's seeds as WAVs
bun run sfx check                              # unmade/stale sounds, missing or corrupt files, licences, loop seams
bun run sfx pull|push                          # sync sounds/files (generated, git-ignored) with the store in library.ts; push names each file it sends, read back by hash
bun run sfx push --from <folder>               # the same, sending files this machine lacks from an older folder store (a move; see The private store)
bun run media push <file…> [--under dir]       # review renders into the private store's renders/ (skips what it holds), read back by hash
bun run media pull <key…> [--to dir]           # renders back out (default out/renders), checked against their sha256
bun run media list [prefix]                    # what the private store holds under a prefix (default renders/)
bun run plan | deploy                          # the private store's Cloudflare stack (alchemy.run.ts), prod stage; deploy is the owner's call
bun run store:keys                             # the deployed store's key pair into ./.env (git-ignored)
bun run mix <film> [--stems]                   # remix full.wav in-process (no API): levels per bus; stems to out/<film>/stems
bun run cues <film> [scene]                    # scene times, {mark} times, named cues, seam= to the next voice (fails if a cue overruns)
bun run cues <film> [scene] --sound            # every effect placement's film time and sound, and each bed's span
bun run cues <film> --short <id>               # a short's spans: film time, time in the short, and its length
bun run doctor                                 # headless Chromium, elevenlabs CLI + login, ffmpeg (software share copy): ok or how to fix
bun run check <film>                           # cues, sound cues, stale takes/sound, text collisions, DeadAir (fails on any); warns StaticHold, HeldShare, FaceSmall, ColourScript, HandJump, HandFar, HandHidden, EndShort
bun run check <film> --static --allow-stale    # the no-browser leg (no StaticHold or look pass: they need the frames)
bun run check <film> ... --json                # each finding as one line of JSON {level,tag,message} (the lab reads this)
bun run check <film> --short <id> [--zone ads] # a short: text in the safe zone, a hook by 0.5 s, a clean loop, 45–75 s (--static: no frames probed)
bun run render <film>                          # out/<film>.mp4 + .vtt (+ .chapters.txt when film.ts declares a look) (parallel pages, each encoding H.264)
bun run render <film> --contact 1 --from 0 --to 40   # contact sheet, a frame per second
bun run render <film> --stills 3,10.5          # PNG stills in out/<film>/stills/t0003.00.png ...
bun run render <film> --scene id[,id] ...      # a video or contact sheet over those scenes (not --stills)
bun run render <film> --short <id> ...         # out/<film>/shorts/<id>.mp4 + .vtt at 1080×1920; --stills/--contact/--from/--to in its seconds
bun run lookbook <film> [--captions]           # out/<film>/lookbook.jpg: palette + every scene's stills at cue edges and 60%; prints per-scene and per-act luma, dark, saturation, hues, held share, largest face
bun run chapters <film>                        # the YouTube chapters film.ts's look.acts name, one `mm:ss title` a line
bun run lab <film>                             # the lab at http://127.0.0.1:4401/lab?film=<film> (Ctrl-C stops it)
bun run review                                 # the review at http://127.0.0.1:8229/: renders compared in sync; ?film=<film> picks its options (REVIEW_HOST, REVIEW_PORT, FILM_REVIEW_*)
bun run notes <film> [--watch [--since <seq>]] # open lab notes and `cursor seq=`; --watch streams changes past it, each with seq=
bun run notes reply <film> <id> "text" [--still file.png] [--since <seq>]  # then new notes + user replies since your last reply, and `cursor seq=`
bun run notes resolve <film> <id>
```

Every command is the `film` CLI from `@bible/film/tools`, run by this app's
`cli.ts` (`bun cli.ts --help`), which hands it the player server that `render`
loads and, for `lab`, the same server in development mode with the lab's own
page at `/lab` (`lab.html`, whose entry `src/lab.ts` mounts `@bible/film/lab`;
`bunfig.toml` compiles its Solid JSX; the render's server never serves it) and
the lab's routes at `/lab/<film>/*` (`LAB_PORT`, default 4401; a page for any other film
is answered 409, so it cannot touch this film's notes or source). Lab notes and their stills are
written to `lab/<film>/` (git-ignored; `FILMS_LAB` moves it). Narrate flags: `--only id,id` (record these, current or not),
`--force` (every beat), `--dry-run` (print each beat `recorded`, `staging` or
`stale` with why, record nothing), `--accept-mismatch id,id` (keep these
beats' takes though their transcripts differ; bare, the `--only` beats, and
bare without `--only` fails), `--replace-recorded` (stage over a person's take whose
line changed). Takes import flags: `--only id,id` (just these beats; one file
not named for its beat imports as the one beat named), `--accept-mismatch id,id`,
`--whole` (the file is one reading of the whole script, cut at the quietest
point of the silence around each beat; a flubbed line read again keeps the
reading that finished it). Score flags: `--force`, `--dry-run` (each option's
acts and estimated credits), `--option <name>` (just that one), `--cap n` and
`--tally file`; `score` composes only the score, keeps each option in the
private store (as `sfx push` does) and remixes. Mix flags: `--stems` and
`--score <option>` (play another option; its stem is `music.<option>.wav`). A film's beds and effects name sounds in the app's
library (`sounds/library.ts`, shared by every film) with a level in dB
relative to the voice; `check` fails on a sound the library lacks
(`UnknownSound`), one placed for the other use (`SoundUseMismatch`) or one
not yet made (`SoundUnmade`), and warns on a stale one or an effect within
3 dB of the voice where it speaks (`EffectHot`). How to word a generated
sound's prompt and pick its length and influence, per kind (one-shot foley,
impacts, beds), is `sounds/PROMPTING.md`. The library's generated files sync
with the private store `library.ts` declares (below), never a folder under
`~/film-media`, whose index deletes files it did not mirror. A misspelt `--only` beat
fails narrate before anything is planned with `UnknownScene`. The films are
always `src/films`, the folder the player imports (`cli.ts` hands it and
`sounds/` to the tools); `FILMS_OUT` overrides `out`.

Check flags: `--static` (skip the browser leg), `--allow-stale` (stale takes,
sound and audio master are warnings), `--scene id,id` (probe only these
scenes' layout), `--workers n`. A scene id the film lacks (`--scene`, or
`cues <film> <scene>`) fails with `UnknownScene`, listing the film's scenes.
Once every take is recorded, the static leg also measures `narration/full.wav`:
missing is `AudioMissing`, and longer or shorter than the film is `AudioStale`
(a mix cut short, or made before a re-timing); `mix` fixes both. `check` is a
review step, run by hand: the app's `gate` runs typecheck and tests only. One
of those tests (`test/every-scene-draws.test.ts`) draws every scene of every
film in `src/films/index.ts` at its first frame, each cue's edges and midpoint, its 60% point
and its last frame, through the film's own compositor into the framework's
stand-in 2D context (`@bible/film/stand-in`, the one every canvas test draws into),
so a scene that reads a mark, cue or knob its film no longer has, or draws
what a real canvas refuses (a negative arc radius), fails the gate, not the
next render.

Render flags that would be ignored fail with `FlagsConflict` before a browser
opens: `--stills` goes with none of `--contact`, `--scene`, `--from/--to`,
`--scale`, `--out`, `--no-share`; `--contact` takes a range (clipped to the
film like a video's, so no frame repeats; a range wholly outside it is
`RangeEmpty`) but no video flag (`--workers` and `--encoder` included: one
page composes the sheet);
`--scene` goes with neither `--from` nor `--to`.

Render flags: `--from/--to` seconds or `--scene id,id`, `--workers n`
(pages; the measured knee on each encoder: 6 on the Mac's
hardware encoder, 8 in software, or half the cores on a software machine with
fewer than 16), `--scale 0.5`, `--no-captions`, `--tag name` (output
subfolder, so parallel renders don't collide), `--out file`, `--no-share`
(skip the smaller copy to send, `<out>.share.mp4`), `--encoder
hardware|software`.
A first page chooses the H.264 encoder once and every page uses it; the
render logs `render.encoder kind=…` and `bun run doctor` prints the same
choice on its `encoder` line. The Mac renders on its hardware encoder only:
if the GPU encoder fails the render stops with `EncoderMissing` rather than
changing the film's look (`--encoder software` renders there in software on
purpose). A Linux box (GPU launch flags are macOS-only) renders on Chromium's
software encoder, and its share copy is made after the join by x264 from the
master (`render.share by=x264`), which adds minutes but keeps the grain at
half the size the in-page encoder needed (`packages/film/README.md`,
"Encoders"). Each page runs one encoder, two on the Mac with the share copy.
On hardware past 14 at once the encoder hangs; on software more encoders than
cores only thrash. So a render that would need more fails with
`TooManyEncoders` before it draws (hardware: at most 7 pages with the share
copy, 14 without; software: one page a core). The count is per render: on the
Mac two renders at once (say two `--tag`s) share the hardware, so keep their
pages together within the same 14 or they can hang with no error. Each chunk lands in a folder of the render's own in the system's temp folder (`film-segments-*`, with `share/` on the hardware encoder)
until the film is joined, then it goes: a video makes nothing under `out/<film>/`, whatever its `--tag`
(so two renders at once never share segments); a failed join leaves them. A video's audio
is encoded to AAC once, beside the pages, and the video and its share copy
take the same packets. It comes from the film's track `narration/full.wav`, which must cover the
whole film to within a frame before a frame is drawn (`AudioMissing` or
`AudioStale` otherwise: run `mix`). Its captions are also
written as WebVTT beside it. `mix` runs in-process (`@bible/film/core`'s
`mixPlan` and `renderMix`, the filters ported from the ffmpeg graph it
replaced) and logs each bus's mean and peak dBFS (`mix.levels`), so balancing
needs no other tool; it writes `full.partial.wav` and renames it only once
whole, so a failed or interrupted mix leaves the previous track as it was. The
player streams the same WAV. Ctrl-C stops
a render cleanly: every page, the browser and the server close. Player keys: space play, ←/→ frame (shift = 1 s), `[` `]` scene,
`c` captions. In the lab (`bun run lab <film>`) a click on the frame pins a
note, a drag boxes one, the Pen draws on it and `n` notes the whole frame;
notes show as pink pins on the track and in the side list, where the
agent's replies arrive with their after-stills (if the page loses the lab server, the notes say so and connect again on their own). The strip under the timeline shows the
current scene's cues: drag one (body = offset, edges = start/end; a bar too short for edges is
all body, alt-drag for its end; snaps to words and frames, shift for free; Esc puts it back) and the release writes the new value into
the scene's `.ts` file, the page reloading at the same time and selection.
The inspector sets offset, dur and ease (each curve drawn) and knobs; a point
knob gets a handle on the frame, placed through the transform it was read
under (inside `at(...)`, scaled, tilted) or, read before a camera, through that
camera, so it drags where it is drawn. A camera's target (a point knob `face`
beside `faceZoom`) is a reticle; while the camera sits on it, dragging it moves
the picture with the pointer (the target moves the other way). `film check --static`
runs after each write and its findings show in the panel; Undo (⌘Z) puts the
newest write back and Redo (⇧⌘Z) makes it again, over the last 50 writes, never
over a change made since. One write is out at a time: a drag or a field set while one
is in flight is not taken. Review with `git diff`. The panel's Motion section ghosts the frames
around a paused one (Onion: warm before, cool after), slows the clock to
0.25× or 0.5× (narration mutes), and loops the selected cue or an A–B range (setting B after A plays from A; a B before A waits for a new one). A film with no mixed `full.wav` yet plays on its own clock and the time line says `no narration`; a browser that holds the narration until a click says `narration waits for a click`, and the next play tries again.
Compare draws the same frame as HEAD declared the scene's timeline and
knobs: wipe (HEAD left of a divider you drag) or blink; when HEAD cannot give the scene, the section says the server's reason. Speed, loop, onion,
compare and play are kept through the reload a write causes (the tab's
sessionStorage, per film). The panel's
Look-book link (`?film=<film>&lookbook`) composes `bun run lookbook`'s
sheet live; a click on a still opens that frame. The panel's **Studio**
section records the owner's voiceover beat by beat: pick a beat (its line is
the teleprompter), click into the section, then R records after a 3 s
count-in (the meter warns of clipping at −1 dBFS), Space stops, play it back,
K submits; what was heard and the word error show, or the server's refusal,
and a `TakeMismatch` offers Accept anyway (K). ←/→ step through the beats and
Esc cancels; those keys are the Studio's only while it has focus. Each beat's
attempts play again and Keep makes one the take. A kept take reloads the lab
at the same time, on the same beat, playing the new take (`/films/*` is served
uncached for that). Use Chrome or Firefox on the Mac and allow the
microphone for `127.0.0.1:4401`; pick the interface in the Studio's mic list
(it is remembered in the browser). The capture is raw PCM (no echo cancelling,
noise suppression or gain control) posted as a 24-bit WAV at the microphone's
own rate. `bun test/fixtures/studio-harness.ts` runs the same lab over a temp
copy of a film with a fake speech-to-text (no paid call; `POST
/lab/harness/mishear/<beat>` makes it mis-hear a beat, `POST
/lab/harness/stop` stops it and removes the copy), for driving the panel
without touching the real films. A striped timeline segment means that beat's narration is
estimated, not recorded. The track also marks every `{mark}` (a tick at its
foot), every named cue (a bar as long as the cue), every sound effect (a dot
along the top) and every music act's start (a line through it), from the film's
`sound` passed to `createFilm`; hover one for its name and time.

**The review** (`bun run review`; on the box, the `film-review` user unit on
port 8229) is where options are compared and picked. Its home lists the
films and every folder of renders under every checkout's `out/` (and any
`FILM_REVIEW_EXTRA_ROOTS`). Videos named `<clip>.<variant>.mp4` in one
folder are a comparison set, played on one clock (all of them, the first
against one other, every variant's frame at a few moments, or the notes;
space plays, ←/→ step 2 s, 🔊 picks whose sound is heard), titled and
annotated by an optional `review.json`. A film's page (`?film=<film>`) plays
its newest render with the film's whole mix heard over it: each score option
of `sound.ts`, and each take of each library sound the film places, in place
(or alone). **Pick** writes `play` in `sound.ts`; **Keep**, **Unkeep** and
**Reject** curate the take in `sounds/library.lock.json`, as `sfx keep`,
`unkeep` and `reject` do. Each write is checked and undoable (Undo, Redo);
review it with `git diff`. The review answers loopback, and the names in
`FILM_REVIEW_HOSTS` when `REVIEW_HOST=0.0.0.0`, on every path (the page too:
`server.ts` builds it in process and serves it behind the check); writes are
same-origin JSON.
It never edits a scene: that stays in the lab.

## How a film is built

```
src/films/<film>/
  script.ts        the screenplay: ordered beats — narration, citations, picture brief
  voice.ts         who reads it: the film's one narrator (changing it re-records everything)
  scenes/index.ts  pairs every beat with its drawing; undrawn beats play as storyboard cards
  scenes/*.ts      one Drawing per beat: draw(frame) + timeline (named cues) + enter transition + timing
  kit.ts           the film's recurring props, its people and type treatments
  sound.ts         music acts and sound effects, placed on scenes' named cues
  shorts.ts        vertical shorts: spans of scenes, from a mark or cue to a later one (optional)
  narration/       one take per beat + timings.json (word timings); full.wav (the mixed track) is derived
  sound/           each score option (git-ignored, private store), and manifest.json (their request hashes, sha256)
```

**Narration drives the clock.** A scene lasts `lead + speech + tail`: `lead`
defaults to 70% of its entrance (at least 0.5 s) and `tail` to 0.1 s, so the
seam between two voices is about 0.6 s; set a longer `tail` only for a pause
the script means (rule 9 of the film skill's CRAFT.md). `cues` prints each
seam (`seam=0.60`), and `check` warns `SeamLong` where a seam runs over 0.6 s
with neither scene declaring it (no `tail` before it, and no `min` that
stretches that scene past its words; no `lead` after it): a long entrance stretching the default lead. A
seam is measured from the end of the take file, not from its last voiced word,
so silence a take carries after its line (staging takes are not trimmed as a
person's imports are) is heard as pause but not counted: `look`'s 2 s tail
reads as `seam=0.60` before `within`. Put
`{mark}` cues in the narration before the word the picture should hit;
`f.mark('name')` returns that word's scene-local time from the recorded take
(or an estimate before recording). Marks are stripped before speech, so adding
one never re-records. `f.spoken(from, to)` is 0→1 in step with the words
between two marks — quotes reveal as they are read. The picture keeps pace
with the voice too: `check` warns `StaticHold` where a drawn scene speaks for
more than 4 s with no cue running and nothing moving, probed a boil tick
apart (captions and boil aside, at any zoom; a storyboard card is exempt). A
flourish no cue declares does not hide the still stretch after it. Pin a
motion to a mark in that stretch, or cut it. A colour change, or drawing the
probe cannot see, reads as still: look before pinning.

**A film has one narrator.** `voice.ts` exports one reader
(`{ voiceId, model, settings }`, recorded through text-to-speech), and the
narrator asks the viewer's question too (the film skill's CRAFT.md, rule 6).
The engine can also read a cast
(`{ model: 'eleven_v4', settings: { stability, similarity? }, voices: [{ name, voiceId }, …] }`),
recording each beat as one text-to-dialogue take in which the first voice
reads until a line hands over with `{@name}` before a word. Like a mark, a
turn is not spoken, but moving one re-records the beat; a turn to a voice the
cast lacks fails `narrate` and `check` with `UnknownVoice`; captions never run
a line across two voices, and each voice's first line opens with a dash. A
one-voice cast is how a film reads through text-to-dialogue.

Settings are the model's own: `eleven_v4` has two sliders, `stability` and
similarity (`similarity` in a cast, `similarity_boost` for a reader), each
0–1, and no style or speed, so a film that names another setting on v4 fails
to load rather than paying for a slider the model ignores. A reader on v3 or
v4 reads each line alone; earlier models hear the neighbouring lines.

A staging take's tail is trimmed when it arrives: `narrate` cuts silence past
the last word the way `takes import` does (a trimmed take is kept as FLAC),
and `check`'s `SeamLong` and `cues` measure a seam from the last voiced word,
not the file's end.

**A moment is declared once.** When something besides the drawing reads a
moment (a sound, another cue), name it in the scene's `timeline`, anchored to
a mark, another cue (`after` / `with`) or a scene landmark. A beat on a word
that has no mark is a word pin: `{ mark: 'gift', word: 'faith', dur: 0.6 }`
starts on the first word said at or after `{gift}` that reads `faith` (read as
a take is checked: any case, apostrophes dropped, `cover` in `cover-up`, accents kept), so a re-take carries it; `check` warns `WordPinFar` when it lands more than a sentence past the mark; a line that never says
the word there fails the layout with `WordMissing` (`film check`, the player,
the gate's every-scene test), never falling back to the mark. It lasts its `dur`,
or runs `until` a mark (`{ mark: 'right', offset: -0.4, until: 'notes' }`), so
a re-take moves its end as well as its start; a span declares one or the
other, and a lab `dur` write replaces its `until`. Read it in
`draw` with `f.cue(name)` (scene-local `{ start, end, dur }`) or
`f.at(name)` (0→1 across it, eased by the span's `ease`), or keyframe a
motion across it with `f.keys(name, [[0, 0.35], [0.4, -0.2], [1, 1.5, 'outQuad']])`:
each key's time is a fraction of the cue, so a `dur` edit stretches the motion,
and a key that names no ease takes the span's. Items that follow one another
across a cue (sheets falling, stains spreading) read `f.stagger(name, i, n)`:
the span's `stagger` (0 to 1) is the share of the cue their starts spread over,
and each item lasts the rest, eased by the span's `ease`, so a `dur` edit
scales every item (`drop: { mark: 'evidence', dur: 1.4, ease: 'inCubic', stagger: 0.857 }`).
Plain `keys(t, …)` is for ornament. Wrap the drawing in `drawing({ timeline,
draw })` so an undeclared name fails to compile, in `f.cue`/`f.at`/`f.keys`/`f.stagger` and in the
timeline's own `after`/`with`. `layout()` resolves every cue
once; `cues` prints them and fails when one ends after its scene. A span's
easing is data too (`{ mark: 'fiction', dur: 0.35, ease: 'inQuad' }`), and
only data: `f.at` takes no ease, so the lab's ease picker always changes the
frame. Ornament
(wobble, idle motion) stays inline.

**A tweakable value is a knob.** A position or an angle a review may ask to
move is declared on the drawing, `knobs: { palm: [960, 800] }`, and read with
`f.knob('palm')` (a number or an `[x, y]` point), never repeated as a
constant. A framing is knobs too: a point and a zoom (and a tilt),
`face: [800, 610], faceZoom: 1.22`, made a camera in the draw with
`knobCamera(f.knob('face'), f.knob('faceZoom'))` (`@bible/film/canvas`, which
a film's kit re-exports); the lab gives that pair a reticle. Only the unmoved
frame (`{ x: 960, y: 540, zoom: 1 }`), a framing derived from another
constant and one shared across scenes stay code. Read a position knob
under the transform it is drawn with (inside the camera or the plane), so
its handle lands on it.

**Takes are content-addressed.** `narrate` hashes each beat's spoken text,
with its turns, and re-records only beats whose text or turns changed, transcribes every new take back with
speech-to-text, and fails the run with `TakeMismatch` when the take doesn't say
what the script says (over 8% word error, both read as said: numbers however
written or spoken, `144,000` and "one hundred forty-four thousand", a year in
pairs, "Zechariah 3:1-4" as "chapter three verses one through four", `Mrs.`
as "Missus", and a name spelt as `script.ts`'s `heardAs` lists it, e.g.
`export const heardAs = { Ellet: ['Elliot'] }`). A failed take never replaces
the current one; `--accept-mismatch <id,…>` keeps the named beats' takes
with a warning. A new take is saved
as `<id>.<audio hash>.mp3` (a person's, `.flac`), beside the take it replaces, and becomes current
only when `timings.json` is rewritten to name it, so a crash at any step
leaves every take the timings name on disk and matching them. The next
`narrate` removes what a crash or a failed take left (takes the timings no
longer name, `*.partial` writes). `timings.json` and `sound/manifest.json` are
Schema-decoded (`@bible/film/core` `schema.ts`: durations and word times are
non-negative, words run in order, and none ends after its take) and written
one writer at a time, so takes finishing together never lose entries.

**ElevenLabs stages; the owner's voice replaces it.** A film is staged with
ElevenLabs (`narrate`), then read by a person beat by beat:

1. `bun run script <film> --sheet`, and print `out/<film>/script-sheet.html`:
   each beat's line with its marks stripped, the file to save it as
   (`<beat>.wav`), quotations set apart with their source, `/` for a breath.
2. Record each beat into its own file (WAV or FLAC for the final voice; M4A
   or MP3 import with a warning; any rate, any room noise), or the whole
   script in one file.
3. `bun run takes import <film> <folder>` (or `<file> --whole`). Each
   recording is trimmed to the staging takes' padding and levelled to their
   loudness (numbers in `packages/film/README.md`), kept as a 24-bit FLAC
   master (`<beat>.<hash>.flac`: the owner's voice is the final voiceover,
   never lossy after the recorder), transcribed and timed by the words heard;
   `TakeMismatch` and `--accept-mismatch` work as for `narrate`. Every
   recording stays in `narration/attempts/<beat>/` (git-ignored), the original
   file byte for byte beside its FLAC; the kept FLAC is committed, with
   `source: "recorded"` in `timings.json`.
4. `bun run check`, `bun run cues` and `bun run mix` as for any take, then
   tighten each scene's `lead` and `tail` at the seams.

Staging never overwrites a recorded take: `narrate` skips it (even under
`--force` and `--only`); when its line changes the take is stale, `check`
fails it, and `narrate` refuses to stage over it without `--replace-recorded`.
A change of staging voice leaves recorded takes current.

**Sound follows the same clock.** `sound.ts` declares the score as one or more
options (`score.options`: each a whole score in its own musical language, in
acts that each start at a scene and last 3–120 s), `play` naming the one the
mix plays, with its `under` and `alone` levels; and effects and beds as library
sounds placed at a scene's named cue —
`{ scene, cue, edge }`, the cue's start or end — so the sound lands where the
picture does and a re-recorded line carries both. A sound with no picture event
(a page turn at a scene's start) takes `{ scene, offset }`; `{ scene, mark }`
still works for a sound on a word. `score` sends each option's
acts as one timed ElevenLabs composition plan (music v2 enforces the section
lengths, so the score turns where the film does). Assets are content-addressed
like takes: re-timing a scene makes every option stale; a level change only
needs `mix`. The mix holds the score `under` dB against the voice wherever
anyone speaks and lets it rise to `alone` where no one has for 3 s. Generated
music, like generated effects, never enters the repo: each option's file sits
git-ignored in the film's `sound/`, its manifest (committed) records its hash
and sha256, `sfx pull`/`push` sync it with the private store under
`scores/<film>/`, and the pre-commit guard refuses it and any copy of it.
Music works with the CLI's OAuth login; effects
need an API key in `ELEVENLABS_API_KEY` or the Keychain (service
`ELEVENLABS_API_KEY`) — without one they are skipped, not faked. Balance with
`mix --stems` against the levels in rule 10 of the film skill's
[CRAFT.md](../../.claude/skills/film/CRAFT.md).

**Shorts are cut from the film, not drawn again.** `shorts.ts` exports
`shorts`, each `{ id, title, hook?, spans }`, a span being `{ scene, from, to }`
where a point is a `{ mark }`, a named `{ cue }` (its start, or its end as a
span's `to`, or `edge` to say which) or a scene landmark
(`{ scene: 'start' | 'speech' | 'speechEnd' | 'end' }`), never a second, so a
re-timed scene carries its shorts. `render <film> --short <id>` plays the spans
back to back at 1080×1920 with the track cut from `full.wav` under the same
spans (a 10 ms fade either side of each join, so no join clicks), and writes
`out/<film>/shorts/<id>.mp4` and `<id>.vtt`. A scene, mark or cue the film
lacks fails before a page starts (`ShortUnknownMark` and kin, naming what the
scene has). `cues <film> --short <id>` prints each span's film time and the
short's length, on the frames at the rate the film declares (read from its page,
as the render and `check --short` do). The page is stacked: the film's 16:9 frame in a band 620 px
down, byte for byte the film's own frame at that time (a band crop of
`render --short <id> --stills T` equals `render --stills <film time> --no-captions`);
above it the short's `hook` (the narrator's question or claim, set from the
first frame, held 2.4 s, faded by 2.8 s); round it the film's paper, vignette
and grain made at the page's size; below it the captions, burned in two to
four words at a time as they are said, with no plate, and each quoted word
(between the script's “ and ”) marked gold as it is read. `check <film>
--short <id>` checks the short, not the film: `ShortUnsafeText` (text under
the platform's buttons: the `default` zone keeps 270 px top, 520 bottom, 140
right and 65 left clear, `--zone ads` the bottom 35%; the short's own lines
are errors, the film's a warning), `ShortHook` (a first word after 0.3 s,
nothing moving by 0.5 s, or the film's title card first), `ShortLoop`
(warning: the last frame far from the first, or over 0.6 s of silence round
the loop) and `ShortLength` (over 90 s an error, outside 45–75 s a warning).
The film's `short` style sets the hook's
and the captions' fonts and colours (`createFilm({ short: { hook, caption } })`).
`src/films/index.ts` keeps `films` (a key per film folder)
apart from `pages`, what the player mounts: the films plus each short's page
from `shortPages`, under `<film>/shorts/<id>`.

## The private store

Generated audio (ElevenLabs' terms forbid publishing it as files), composed
scores and review renders never enter the repo. They live in one private
store, declared by `store` in `sounds/library.ts` as a tagged union:

```ts
export const store = defineStore({ kind: 'folder', folder: '~/film-sounds' });
export const store = defineStore({ kind: 'r2', bucket: 'film-store' }); // jurisdiction?: 'eu' | 'fedramp'
```

Keys are prefixes in the one store: `files/<name>/<hash>.flac` (the library's
sounds), `scores/<film>/<option>.<ext>` (each score option) and
`renders/<…>` (review renders, `media`). The R2 store keeps each object's
sha256 as its `x-amz-meta-sha256` metadata, so `push` asks the store for a
hash with one `HEAD` and never downloads to compare; `pull` checks the bytes
against that hash before it renames them into place.

**The stack.** `alchemy.run.ts` (wiring only) deploys `infra/store.ts`: one R2
bucket, `film-store` on `prod` (`film-store-<stage>` on any other stage),
with no public access and no domain, and one account API token allowed to
read and write objects in that bucket only. The prod bucket is retained
(`RemovalPolicy.retain`): `alchemy destroy` forgets it and never deletes it;
a throwaway stage's bucket is emptied and deleted with the stage. State is
local, in the git-ignored `.alchemy/`, which also holds the token's value;
keep it.

**The key.** R2's S3 API takes the token as a key pair (the token's id, and
the sha256 of its value). `bun run store:keys` derives it from the stack's
outputs into `./.env` (mode 0600, only its `FILM_STORE_*` lines replaced,
nothing printed but the names):

```
FILM_STORE_ACCOUNT_ID  FILM_STORE_ACCESS_KEY_ID  FILM_STORE_SECRET_ACCESS_KEY
```

The tools read them as `Config.Redacted` (`PrivateStore`); a command that
touches an R2 store without them fails `StoreCredentialsMissing`, naming the
ones missing, and a command that does not touch the store never asks. Requests are signed
with SigV4 through Effect's `HttpClient` (no SDK) and retried on transient
failures. A dashboard R2 API token scoped to the bucket works the same: put
its account id, access key id and secret in `.env`.

**Moving from the folder.** Once the owner has deployed:

```bash
bun run deploy && bun run store:keys
# library.ts: store = defineStore({ kind: 'r2', bucket: 'film-store' })
bun run sfx push --from ~/film-sounds          # sounds and scores, each read back by hash; the folder is left as it was
bun run media push <render.mp4…> --under <dir> # renders
```

`push --from` is idempotent: a second run sends nothing. A lock file found in
neither this checkout nor the old folder is named `missing`, never
regenerated.

**For a review page.** `PrivateStore.store` (in `@bible/film/tools`) gives the
`MediaStore` interface a page needs without holding files locally:
`list(prefix)` → `{ key, size, modified }[]` sorted by key, and
`read(key, range)` → `Option<{ size, start, end, stream }>` (an inclusive byte
range, clamped to the object; `none` when the key is absent), which is what a
`206 Partial Content` answer to a `<video>`'s `Range` request needs. The page
itself is not wired yet.

## Engine (`@bible/film`)

The engine lives in [`packages/film`](../../packages/film); this app is its
first user. `src/main.ts` is the browser entry: it calls `mountPlayer(pages)`
with the registry in `src/films/index.ts` (the films and their shorts). Scenes import from three entry
points:

| Entry point          | Module          | What it gives a scene                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`   | `layout.ts`     | `layout` (scenes end to end, sized to their takes), transitions (`fade`, `pan`, `ink`, `cut`), `captionLines`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
|                      | `timeline.ts`   | named cues: `Span` anchors (mark, `after`, `with`, scene landmark) and `resolveTimeline`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
|                      | `narration.ts`  | `{mark}` and `{@turn}` parsing, a cast's lines, take timings, word estimates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|                      | `time.ts`       | easing, `progress`, `keys`, `envelope`, a walker's bob `gait`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
|                      | `random.ts`     | seeded hash and noise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
|                      | `sound.ts`      | music acts → composition plan, effect cues → film times, asset hashes (read by `score`/`mix`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@bible/film/canvas` | `film.ts`       | `Frame` (t, dur, boil, mark, cue, at, keys, stagger, knob, spoken, hand), `SceneSpec`, `drawing`, `createFilm`, the compositor and its finish (`FilmSpec.finish`: vignette, grain), captions (`CaptionStyle`: font, colours, plate); `createFilm` refuses a finish or plate value the canvas cannot draw                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
|                      | `ink.ts`        | path builders (line, quad, spline, ellipse) and shapes (`rectShape`, `ellipseShape`, a centred `plate`, `rounded`, a seeded `blob`), the variable-width brush `stroke` (its `boil`: `tick` redraws the wobble each boil tick, as ink does and by default; `crawl` lets a figure's line wander at most `CRAWL_MAX`, 0.3 px, a tick; `none` holds scenery's line; `closed` for a path that returns to its start: no end taper, and the wobble and swell run on round the seam, so an outline has no notch), and `sub(hand, k)`: a sub-hand on its own seed, so each piece of a drawing boils on its own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
|                      | `cutout.ts`     | torn-paper `cutout` (rim, grain, shadow; an opaque face under flat state takes its pastel pre-blended per colour, `preblends`, unless the transform magnifies it, `magnifies`), `at` placement, `raised` (longer shadows for a nearer layer)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|                      | `fibre.ts`      | the paper fibre fixed to the paper: one seamless tile (a 1–2 px fibre inside a 50–150 px mottle at ±3–6 %), soft-lit over a multiplane backdrop in its plane's space by `planeFibre(ctx, view, w, h)` so a pan or push carries the grain with the plane (the tile pre-scaled to the plane's period and laid at a whole-pixel offset, never resampled; a turned camera samples it through the plane's transform); faces keep their own pastel grain (`cutout.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
|                      | `ground.ts`     | the contact shadow under something standing: `ground(ctx, x, y, w)`, a flat warm ellipse at 28 % (the direction's 15–30 %), its gradient made once per context; fade it with `globalAlpha`. The film kit's `person` lays one under the feet (`ground: 0` for a figure with nothing under it)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|                      | `piece.ts`      | paper by meaning: `piece(ctx, shape, { color, role, outline, kind? }, hand)`; a `figure` is cut (thin light core) and outlined in ink, `scenery` torn (white fibrous rim) with no outline, `kind: 'ink'` a prop's letters (no core); a figure's edge and outline crawl, scenery's hold still (`boilOf`); a named `kind`/`line`/`boil` wins. The film kit's `piece(ctx, shape, color, hand, { role })` wraps it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
|                      | `hand.ts`       | `floatingHand`: the one hand (given its figure's `HandBody`, it declares itself to a check probing hands), a mitten with a thumb and no arm, floating by its figure (`HandRoot`: shoulder, rest, away side, breath); at rest it bobs with the breath, and toward `{ to, reach, grip }` it swings on a soft arc about the shoulder, eased, and settles; a grip changed mid-act names the grip it `was` and morphs by `change`; `handAt` where it is (pure, no allocation), `closeHand` (the same hand close up with no forearm, palm up from above, a lifeline and two joint lines; `turn` turns a figure's mitten into it)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|                      | `type.ts`       | glyph-by-glyph lettering: `write` (write / rise / pop), `block`, `wrap`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|                      | `paper.ts`      | the sheet under everything, the faint film grain over everything (`Grain`, 0.03 by default since the paper carries its own, `fibre.ts`: pre-drawn sheets copied at the boil tick's shift), the vignette drawn once (`makeVignette`, multiplied in by `shadeBy`), `offscreen` canvases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
|                      | `colour.ts`     | hex colours: `mix` (a colour between two), `clearOf` (a colour at alpha 0 for a gradient to fade into)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|                      | `glow.ts`       | soft light on the page: `sky` (a vertical gradient over the frame) and `glow` (a round light), each gradient made once per context at unit size by what it holds and placed by the transform, the last `GRADIENTS_KEPT` kept                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|                      | `scratch.ts`    | `Posed<T>` (a pose written in place every frame) and `reset(scratch, defaults)` (every default written back in one call, no allocation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|                      | `credits.ts`    | `creditRoll(title, cites, authors)`: the end roll from each beat's `cite`, scripture then each `Author`'s works, one entry a work, places merged, lines of at most `CREDIT_MEASURE` characters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
|                      | `camera.ts`     | pan/zoom over a scene's world; `multiplane`: planes at depth `z` (parallax, haze, blur off focus, shadows raised by nearness, `planeLift(z)`, unless a plane names its `lift`; the backdrop plane carries the paper fibre, `depth.fibre`, 0 for none); every drawn scene breathes once by `DRIFT` (3 % and 24 px), a push of `drift.zoom` and a slide of `drift.x` frame px that peak mid-scene and settle back (`sin(π·t/dur)`, pure in the frame's time), so a scene starts and ends as framed: through its outermost `camera` or `multiplane` when it frames one, as the outermost transform over its whole draw when it frames none (`hearingCameras`; `createFilm` draws a frame again the other way when a scene's last answer was wrong, so no pixel depends on the frame before); a scene may set its own in place of it, `drawing({ drift: 0, … })` (an end card that must not breathe); a shot's own `drift` is the share of it it takes, 0..1: `0` is designed stillness (the cross, the landing's last line) and `driftHeld(hold)` eases into it; a shot as data, `shotPath(REST, [[f.at('push'), FACE], [f.at('back'), REST]])` (each stop blends from where the earlier ones left the camera), over `lerpCamera(out, a, b, t)`; a deep push names `pushInto` as its stop's third element, `[f.at('through'), ICON, pushInto]`: zoom by a constant ratio about the one point both framings hold still, so its target never leaves the frame (every other leg stays a straight blend); a picture in picture (a callback in an icon) draws in `inset(ctx, draw)`, whose shots are its own and never the scene's outermost, so the scene breathes as it would without it |
|                      | `storyboard.ts` | placeholder card for a beat with no drawing yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@bible/film/player` | `main.ts`       | `mountPlayer` (scrubbable preview, `?export` handle for the renderer) and `ExportHandle`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

`core` is pure and DOM-free, so the scripts and tests read it without a
browser.

Rules that keep renders deterministic: never call `Math.random` (use
`f.hand(key)` seeds and `random.ts` from `@bible/film/core`), and never keep
state between frames — compute everything from `f.t`. A callback, or a shot
carried over a cut, draws another scene's paper with `f.handsOf('message')`:
that scene's hands as its own `f.hand` gives them, boiling on this frame's
tick; a scene the film lacks throws, naming it.

**Lint.** The repo's `film` oxlint plugin (`packages/film/lint/`, rules read
as `film/<rule>`) holds the rules a film's syntax can show, in `bun run lint`,
for every film:

| Rule                         | What it refuses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `film/drawing-literal`       | what the lab's locator (`unlocatable` in `packages/film/src/tools/scene-source.ts`, the same code the lab edits with) cannot locate: a `drawing(…)` that is not a module-level `export const x = drawing({…})` (a drawing built in a function, one no export names, `drawing` off a namespace), a `timeline` or `knobs` that is not an object literal (inline, or a same-file module `const`) or is declared twice, a spread, and a scene with a timeline built without `drawing()`                                                                                                                                                                                                                                                                                                                                                                                         |
| `film/no-unprobed-ink`       | `stroke`, `strokeRect`, `fillText` or `strokeText` read off the raw context however it is spelled (`ctx.stroke()`, `ctx['stroke']`, `.call`, destructured), which `film check` cannot see cross text: draw with the kit (`stroke`, `write`, `block`), or wrap texture that never crosses text in the kit's `unprobed(ctx, () => …)` (imported by name, aliased, or off a namespace import; a local function named `unprobed` exempts nothing)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `film/no-hand-timed-seconds` | a second written by hand, which the lab cannot reach, a sound cannot follow and a re-take leaves behind: `clamp(t / 2)` or `clamp((t - cue.end) / 1.5)` over the scene clock, `(t - cue.start) / 0.5`, `progress`/`envelope(t, …)` with a literal start or length, `keys(t, …)` on the scene clock, `cue.end + 0.5`, `f.mark('x') - 0.4`, `f.dur - 1.5` or `t - 4.2`, the clock compared with a second (`t > 3.5`, `t - cue.start > 0.5`), a second hidden in a module `const`, and a span whose literal `offset` sits over 1 s from its `mark` or the scene's `start`/`speech`. Declare a cue and read `f.at`/`f.keys`/`f.stagger`, anchored to a word pin, another cue (`after`/`with`) or the voice's end (`scene: 'speechEnd'`); a pause the script means is a named cue with its reason in a comment. A rate (`Math.sin(t * 7)`) and a lead-in under 1 s are not times |
