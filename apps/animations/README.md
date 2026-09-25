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
bun run mix <film> [--stems]                   # remix only (no API); stems to out/<film>/stems
bun scripts/cues.ts <film> [scene]             # scene times and {mark} cue times
bun run render <film>                          # out/<film>.mp4 (parallel pages + ffmpeg)
bun run render <film> --contact 1 --from 0 --to 40   # contact sheet, a frame per second
bun run render <film> --stills 3,10.5          # PNG stills
```

Render flags: `--from/--to` seconds, `--workers n`, `--scale 0.5`,
`--no-captions`, `--tag name` (output subfolder, so parallel renders don't
collide). Player keys: space play, ←/→ frame (shift = 1 s), `[` `]` scene,
`c` captions. A striped timeline segment means that beat's narration is
estimated, not recorded.

## How a film is built

```
src/films/<film>/
  script.ts        the screenplay: ordered beats — narration, citations, picture brief
  voice.ts         ElevenLabs voice + model (changing it re-records everything)
  scenes/index.ts  pairs every beat with its drawing; undrawn beats play as storyboard cards
  scenes/*.ts      one Drawing per beat: draw(frame) + enter transition + timing
  kit.ts           the film's recurring props and type treatments
  sound.ts         music acts and sound effects, placed on scenes and marks
  narration/       one take per beat + timings.json (word timings); full.mp3 is derived
  sound/           generated score + effects, and manifest.json (their request hashes)
```

**Narration drives the clock.** A scene lasts `lead + speech + tail`. Put
`{mark}` cues in the narration before the word the picture should hit;
`f.mark('name')` returns that word's scene-local time from the recorded take
(or an estimate before recording). Marks are stripped before speech, so adding
one never re-records. `f.spoken(from, to)` is 0→1 in step with the words
between two marks — quotes reveal as they are read.

**Takes are content-addressed.** `narrate` hashes each beat's spoken text and
re-records only beats whose text changed, transcribes every new take back with
speech-to-text, and warns when the take doesn't say what the script says.

**Sound follows the same clock.** `sound.ts` declares the score as acts, each
starting at a scene, and effects as prompts placed at a scene's `{mark}` plus an
offset — so a re-recorded line carries its sounds with it. `score` sends the
acts as one timed ElevenLabs composition plan (music v2 enforces the section
lengths, so the score turns where the film does) and generates each effect.
Assets are content-addressed like takes: re-timing a scene makes the score
stale; a gain change only needs `mix`. The mix ducks the music under the voice
with a sidechain compressor. Music works with the CLI's OAuth login; effects
need an API key in `ELEVENLABS_API_KEY` or the Keychain (service
`ELEVENLABS_API_KEY`) — without one they are skipped, not faked. Balance with
`mix --stems` and measure: speech sits near -23 dB mean, the bed ~16 dB under
it while speaking and ~7 dB under between lines.

## Engine (`src/engine/`)

| Module                 | What it gives a scene                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `film.ts`              | `Frame` (t, dur, boil, mark, spoken, hand), layout, transitions (`fade`, `pan`, `ink`, `cut`), captions |
| `ink.ts`               | path builders (line, quad, spline, ellipse, morph) and variable-width brush `stroke`, `fill`, `hatch`   |
| `cutout.ts`            | torn-paper `cutout` (rim, grain, shadow) and `at` placement                                             |
| `figure.ts`            | a poseable cut-paper person (`drawFigure`)                                                              |
| `type.ts`              | glyph-by-glyph lettering: `write` (write / rise / pop), `block`, `wrap`                                 |
| `paper.ts`             | the sheet under everything and the grain over everything                                                |
| `camera.ts`            | pan/zoom over a scene's world                                                                           |
| `time.ts`, `random.ts` | easing, `progress`, `keys`, `envelope`; seeded hash and noise                                           |
| `storyboard.ts`        | placeholder card for a beat with no drawing yet                                                         |
| `sound.ts`             | music acts → composition plan, effect cues → film times, asset hashes (pure; read by `score`/`mix`)     |

Rules that keep renders deterministic: never call `Math.random` (use
`f.hand(key)` seeds and `random.ts`), and never keep state between frames —
compute everything from `f.t`.
