# Animations

Narrated explainer films drawn in JavaScript: cut paper, torn edges, pastel
grain, handwriting, and ink that boils at 12 fps. Every frame is a pure
function of time drawn into a Canvas 2D context, so the same code drives the
scrubbable preview and a frame-exact MP4 export.

## Commands

```sh
bun run dev                                    # player at http://localhost:4400
bun run narrate <film>                         # record stale beats, verify, mix full.mp3
bun run score <film>                           # generate stale music + effects, mix full.mp3
bun run mix <film> [--stems]                   # remix full.mp3 + full.wav (no API); stems to out/<film>/stems
bun run cues <film> [scene]                    # scene times, {mark} times, named cues (fails if one overruns)
bun run cues <film> [scene] --sound            # every effect placement's film time
bun run doctor                                 # ffmpeg, headless Chromium, elevenlabs CLI + login: ok or how to fix
bun run check <film>                           # cues, sound cues, stale takes/sound, text collisions (fails on any)
bun run check <film> --static --allow-stale    # the no-browser leg, as the gate runs it
bun run render <film>                          # out/<film>.mp4 + out/<film>.vtt (parallel pages + ffmpeg)
bun run render <film> --contact 1 --from 0 --to 40   # contact sheet, a frame per second
bun run render <film> --stills 3,10.5          # PNG stills in out/<film>/stills/t0003.00.png ...
bun run render <film> --scene id[,id] ...      # any render, over those scenes
bun run lab <film>                             # the lab at http://localhost:4401/?film=<film>&lab (Ctrl-C stops it)
bun run notes <film> [--watch]                 # open lab notes, one line each; --watch streams new ones
bun run notes reply <film> <id> "text" [--still file.png]
bun run notes resolve <film> <id>
```

Every command is the `film` CLI from `@bible/film/tools`, run by this app's
`cli.ts` (`bun cli.ts --help`), which hands it the player server that `render`
loads and, for `lab`, the same server in development mode with the lab's
routes at `/lab/*` (`LAB_PORT`, default 4401). Lab notes and their stills are
written to `lab/<film>/` (git-ignored; `FILMS_LAB` moves it). Narrate flags: `--only id,id` (record these, current or not),
`--force` (every beat), `--dry-run` (print what is stale, record nothing),
`--accept-mismatch` (keep a take whose transcript differs). Score flags:
`--only music,<effect>` and `--dry-run`. The films are always `src/films`, the
folder the player imports (`cli.ts` hands it to the tools); `FILMS_OUT`
overrides `out`.

Check flags: `--static` (skip the browser leg), `--allow-stale` (stale takes,
sound and audio master are warnings), `--scene id,id` (probe only these
scenes' layout), `--workers n`. A scene id the film lacks (`--scene`, or
`cues <film> <scene>`) fails with `UnknownScene`, listing the film's scenes.
Once every take is recorded, the static leg also measures `narration/full.wav`:
missing is `AudioMissing`, and longer or shorter than the film is `AudioStale`
(a mix cut short, or made before a re-timing); `mix` fixes both. The app's `gate` runs the static leg with `--allow-stale`: it
is instant and needs no browser, and a script edit or a re-timing waiting on
a paid re-record must not block a commit; the layout leg is a review step.

Render flags: `--from/--to` seconds or `--scene id,id`, `--workers n`
(pages, default 4), `--scale 0.5`, `--no-captions`, `--tag name` (output
subfolder, so parallel renders don't collide), `--out file`. A video's audio
is encoded once from the lossless `narration/full.wav`, which must cover the
whole film to within a frame before a frame is drawn (`AudioMissing` or
`AudioStale` otherwise: run `mix`), and a video that comes out of the mux
without its audio stream fails with `AudioNotMuxed`. Its captions are also
written as WebVTT beside it. `mix` writes `full.partial.mp3` and
`full.partial.wav` and renames both only once ffmpeg finishes, so a failed or
interrupted mix leaves the previous pair as it was. Ctrl-C stops
a render cleanly: every page, the browser, the server and every ffmpeg child
close. Player keys: space play, ←/→ frame (shift = 1 s), `[` `]` scene,
`c` captions. In the lab (`bun run lab <film>`) a click on the frame pins a
note, a drag boxes one, the Pen draws on it and `n` notes the whole frame;
notes show as pink pins on the track and in the side list, where the
agent's replies arrive with their after-stills. The strip under the timeline shows the
current scene's cues: drag one (body = offset, edges = start/end; snaps to
words and frames, shift for free) and the release writes the new value into
the scene's `.ts` file, the page reloading at the same time and selection.
The inspector sets offset, dur and ease (each curve drawn) and knobs; a point
knob drawn untransformed gets a handle on the frame. `film check --static`
runs after each write and its findings show in the panel; Undo write puts the
last write back. Review with `git diff`. A striped timeline segment means that beat's narration is
estimated, not recorded. The track also marks every `{mark}` (a tick at its
foot), every named cue (a bar as long as the cue), every sound effect (a dot
along the top) and every music act's start (a line through it), from the film's
`sound` passed to `createFilm`; hover one for its name and time.

## How a film is built

```
src/films/<film>/
  script.ts        the screenplay: ordered beats — narration, citations, picture brief
  voice.ts         ElevenLabs voice + model (changing it re-records everything)
  scenes/index.ts  pairs every beat with its drawing; undrawn beats play as storyboard cards
  scenes/*.ts      one Drawing per beat: draw(frame) + timeline (named cues) + enter transition + timing
  kit.ts           the film's recurring props and type treatments
  sound.ts         music acts and sound effects, placed on scenes' named cues
  narration/       one take per beat + timings.json (word timings); full.mp3 + full.wav are derived
  sound/           generated score + effects, and manifest.json (their request hashes)
```

**Narration drives the clock.** A scene lasts `lead + speech + tail`. Put
`{mark}` cues in the narration before the word the picture should hit;
`f.mark('name')` returns that word's scene-local time from the recorded take
(or an estimate before recording). Marks are stripped before speech, so adding
one never re-records. `f.spoken(from, to)` is 0→1 in step with the words
between two marks — quotes reveal as they are read.

**A moment is declared once.** When something besides the drawing reads a
moment (a sound, another cue), name it in the scene's `timeline`, anchored to
a mark, another cue (`after` / `with`) or a scene landmark, and read it in
`draw` with `f.cue(name)` (scene-local `{ start, end, dur }`) or
`f.at(name)` (0→1 across it, eased by the span's `ease`). Wrap the drawing in `drawing({ timeline,
draw })` so an undeclared name fails to compile, in `f.cue`/`f.at` and in the
timeline's own `after`/`with`. `layout()` resolves every cue
once; `cues` prints them and fails when one ends after its scene. A span's
easing is data too (`{ mark: 'fiction', dur: 0.35, ease: 'inQuad' }`), and
only data: `f.at` takes no ease, so the lab's ease picker always changes the
frame. Ornament
(wobble, idle motion) stays inline.

**A tweakable value is a knob.** A position or an angle a review may ask to
move is declared on the drawing, `knobs: { palm: [960, 800] }`, and read with
`f.knob('palm')` (a number or an `[x, y]` point), never repeated as a
constant.

**Takes are content-addressed.** `narrate` hashes each beat's spoken text and
re-records only beats whose text changed, transcribes every new take back with
speech-to-text, and fails the run with `TakeMismatch` when the take doesn't say
what the script says (over 8% word error). A failed take never replaces the
current one; `--accept-mismatch` keeps it with a warning. A new take is saved
as `<id>.<audio hash>.mp3`, beside the take it replaces, and becomes current
only when `timings.json` is rewritten to name it, so a crash at any step
leaves every take the timings name on disk and matching them. The next
`narrate` removes what a crash or a failed take left (takes the timings no
longer name, `*.partial` writes). `timings.json` and `sound/manifest.json` are
Schema-decoded (`@bible/film/core` `schema.ts`: durations and word times are
non-negative, words run in order, and none ends after its take) and written
one writer at a time, so takes finishing together never lose entries.

**Sound follows the same clock.** `sound.ts` declares the score as acts, each
starting at a scene, and effects as prompts placed at a scene's named cue —
`{ scene, cue, edge }`, the cue's start or end — so the sound lands where the
picture does and a re-recorded line carries both. A sound with no picture event
(a page turn at a scene's start) takes `{ scene, offset }`; `{ scene, mark }`
still works for a sound on a word. `score` sends the
acts as one timed ElevenLabs composition plan (music v2 enforces the section
lengths, so the score turns where the film does) and generates each effect.
Assets are content-addressed like takes: re-timing a scene makes the score
stale; a gain change only needs `mix`. The mix ducks the music under the voice
with a sidechain compressor. Music works with the CLI's OAuth login; effects
need an API key in `ELEVENLABS_API_KEY` or the Keychain (service
`ELEVENLABS_API_KEY`) — without one they are skipped, not faked. Balance with
`mix --stems` and measure: speech sits near -23 dB mean, the bed ~16 dB under
it while speaking and ~7 dB under between lines.

## Engine (`@bible/film`)

The engine lives in [`packages/film`](../../packages/film); this app is its
first user. `src/main.ts` is the browser entry: it calls `mountPlayer(films)`
with the registry in `src/films/index.ts`. Scenes import from three entry
points:

| Entry point          | Module          | What it gives a scene                                                                                                     |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`   | `layout.ts`     | `layout` (scenes end to end, sized to their takes), transitions (`fade`, `pan`, `ink`, `cut`), `captionLines`             |
|                      | `timeline.ts`   | named cues: `Span` anchors (mark, `after`, `with`, scene landmark) and `resolveTimeline`                                  |
|                      | `narration.ts`  | `{mark}` parsing, take timings, word estimates                                                                            |
|                      | `time.ts`       | easing, `progress`, `keys`, `envelope`                                                                                    |
|                      | `random.ts`     | seeded hash and noise                                                                                                     |
|                      | `sound.ts`      | music acts → composition plan, effect cues → film times, asset hashes (read by `score`/`mix`)                             |
| `@bible/film/canvas` | `film.ts`       | `Frame` (t, dur, boil, mark, cue, at, knob, spoken, hand), `SceneSpec`, `drawing`, `createFilm`, the compositor, captions |
|                      | `ink.ts`        | path builders (line, quad, spline, ellipse, morph) and variable-width brush `stroke`, `fill`, `hatch`                     |
|                      | `cutout.ts`     | torn-paper `cutout` (rim, grain, shadow) and `at` placement                                                               |
|                      | `figure.ts`     | a poseable cut-paper person (`drawFigure`)                                                                                |
|                      | `type.ts`       | glyph-by-glyph lettering: `write` (write / rise / pop), `block`, `wrap`                                                   |
|                      | `paper.ts`      | the sheet under everything and the grain over everything                                                                  |
|                      | `camera.ts`     | pan/zoom over a scene's world                                                                                             |
|                      | `storyboard.ts` | placeholder card for a beat with no drawing yet                                                                           |
| `@bible/film/player` | `main.ts`       | `mountPlayer` (scrubbable preview, `?export` handle for the renderer) and `ExportHandle`                                  |

`core` is pure and DOM-free, so the scripts and tests read it without a
browser.

Rules that keep renders deterministic: never call `Math.random` (use
`f.hand(key)` seeds and `random.ts` from `@bible/film/core`), and never keep
state between frames — compute everything from `f.t`.
