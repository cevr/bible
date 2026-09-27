# @bible/film

The tools behind the narrated explainer films in `apps/animations`. A film is
an ordered list of narrated beats, laid end to end on a clock the recorded
words set. Its pictures are a [Rive](https://rive.app) project: one artboard
per beat, drawn in RML or in the Rive editor, each on a timeline of its own.
The tools time every scene to the voice, nest them all in one Film artboard,
and render that artboard frame by frame to an MP4 with its mixed track.

## Entry points

| Import              | What it holds                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`  | Pure and DOM-free. The clock: `{mark}` narration timing, scene `layout`, captions, the sound plan and the mix (`mixPlan`, `renderMix` over planar PCM). The Rive project as data: RML (`rml.ts`), the inspected project (`rive.ts`), each beat's scene (`scenes.ts`), the warp (`warp.ts`), and the two artboards the tools write, the Film (`film-board.ts`) and a storyboard (`storyboard.ts`). |
| `@bible/film/tools` | The `film` CLI (`runFilmCli({ films })`) and its Effect services: FilmRepo, ContentStore, ElevenLabs, Media, Narrator, Composer, Mixer, Rive (the `rive` CLI), FilmProject, PageServer, Browser, Renderer (`render-plan.ts` is its pure plan) and the checks (`check.ts`, pure).                                                                                                                  |

The film's page (`src/page/`) is bundled by Bun from `PageServer` and runs the
Rive runtime (`@rive-app/canvas-advanced`) in headless Chromium.

## A film's pictures

Every beat is the artboard of its name in `<film>/rive/scenes/<beat>.rml`, a
component, with a `main` timeline: the scene's own clock, drawn at whatever
pace looks right. Each `{mark}` in the beat's narration is an Event of the same
name keyed on that timeline. The film plays the scene through a
piecewise-linear **warp** (`core/warp.ts`) that lands each Event on the word
it marks: between two marks the timeline runs at an even speed, and for
`ATTACK` (0.6 s) after each it runs at its drawn speed, so a motion a word sets
off keeps its drawn pace. A new take moves the pins and never the drawing.
Events that are not marks are cues a sound can play on (`sound.ts`,
`{ scene, event }`).

`film sync` (`FilmProject.sync`) keeps the project in step:

1. On the first run it scaffolds `rive.yaml`, `assets.rml` (the Inter font
   asset) and `fonts/`.
2. It seeds a **storyboard** for each beat with no artboard: a card showing
   the beat's `picture` brief and naming each mark as it is spoken, already
   carrying the `main` timeline and one Event per mark. Drawing the scene
   replaces the node named `storyboard` and keeps the Events. A seed never
   writes over a file (`SceneFileTaken`).
3. Once every take is recorded and `narration/full.wav` covers the film, it
   writes a preview `soundtrack.wav` the Film plays, so the editor plays the
   cut with sound.
4. It writes `film.rml`: the Film artboard, nesting every scene with its
   transition (`cut`, `fade`, `pan`) and a time remap keyed from the warp.
   Nobody edits it; its ids are stable per scene, so a rewrite moves only what
   changed.
5. It builds `build/*.riv`, and with `--push` uploads the project to its Rive
   file for the editor. `--pull` first brings the editor's drawing back, and
   is refused while git lacks the project's changes (`ProjectDirty`).

`FilmProject.build` is what a render plays. It refuses a film never synced
(`ProjectMissing`) and a Film out of date with the layout (`FilmStale`)
rather than render the old cut.

Computed looks are Luau scripts inside markup; the kit ships them in
`assets/scripts/`: `torn.luau` (a torn paper edge), `boil.luau` (outlines
redrawn at 12 fps from a keyed clock input) and `grain.luau` (paper flecks). The web
runtime drops the scripted elements of an unsigned file, so `Rive.build` signs
a project that holds any `.luau` file (`rive --publish`, which needs
`rive login`) and builds one without scripts offline (`--once`).

The `rive` CLI answers the questions these docs do not: `rive schema <Type>`
for an element's properties, `rive docs`, `rive inspect --json`, and
`rive <dir>` for a live preview window. `rive inspect` exits 1 when the
project has problems but still prints its report; the tools read the report.

## Data

`core/schema.ts` holds the Schemas for everything a film reads or writes:
`Beat` (`Timed` plus `cite` and `picture`), `Voice`, `Timings`
(`narration/timings.json`), `Sound` and `SoundManifest`
(`sound/manifest.json`). The TypeScript types derive from them. `TimingsJson`
and `SoundManifestJson` decode a file's text and encode it back byte for
byte; the request hashes (`voiceKey`, `musicKey`, `effectKey`) are taken over
Schema-encoded requests, so a committed hash stays current.

## Tools

`film narrate|score|mix|sync|cues|check|render <film>` and `film doctor` run
from the app that holds the films, which calls `runFilmCli({ films })`. Logs
(`Effect.log`, `event key=value`) go to stderr; stdout carries only what a
command prints. Paid calls (ElevenLabs speech, music, effects) go through the
`ElevenLabs` service only; `mix`, `sync`, `cues` and every `--dry-run` make
none. Assets are content-addressed: `ContentStore.ensure` produces an asset
only when its stored hash is stale, and every manifest update is serialized.
At most three paid jobs run at once. Failures are tagged errors in
`tools/errors.ts`. `tools/testing.ts` has the in-memory doubles the tool tests
use.

`film doctor` reports headless Chromium (`BrowserMissing` carries the install
command), the `elevenlabs` CLI and its login, and the `rive` CLI and whether it
is signed in (only `--push`/`--pull` need that). `narrate` and `score` check
the ElevenLabs login before their first paid call.

`narrate` writes each new take as `<id>.<audio hash>.mp3` and makes it current
only by rewriting `timings.json`, so no crash leaves a take and its timings
disagreeing; it removes the takes the timings no longer name, and partial
writes, at the start and end of every run.

Media files go through `Media` (`tools/media.ts`): mediabunny reads and writes
the containers in-process, and MP3 decodes through mpg123 (WASM), gapless, so
a take measures what it plays (`duration`). `join` writes a film: its H.264
segments' packets copied in order (never re-encoded), and its track encoded to
AAC beside them through `@mediabunny/aac-encoder`, one frame of priming early
so the MP4's edit list starts it on the first frame. No ffmpeg binary is
involved anywhere.

`mix` plays `mixPlan` out through `renderMix` (the voice bus, the score faded
and ducked under it, the effects on their cues, summed and limited) and writes
the film's one track, `narration/full.wav`, to `full.partial.wav`, renamed
only once whole. It logs each bus's mean and peak dBFS (`mix.levels`), and
`--stems` writes each bus the film's length. It reads the Rive project only
when an effect plays on an Event. A sound at another rate fails as
`SampleRateMismatch`: the mix never resamples. `masterFinding` holds the track
to the film's length (`AudioMissing`, `AudioStale`).

## Render

`render` builds the project, serves the page, the runtime's wasm and the
`.riv` on the loopback interface (`PageServer`), and opens headless Chromium
and a pool of pages, all in one scope: a failure in any page, or Ctrl-C,
closes every page, the browser and the server. The page draws frame `i` by
setting the Film's timeline to `i / fps` and applying and advancing it twice
(a scene a cut shows takes its remapped time on the second pass), so every
frame is a pure function of time and pages render chunks in any order. A
video's frames split into chunks on a queue that idle pages pull from; each
page encodes its chunk with the browser's hardware H.264 encoder through
mediabunny (`page/encode.ts`) into its own segment, plus a share copy unless
`--no-share`. `Media.join` joins them with the track cut from `full.wav`
(once every take is recorded), and `out/<film>.vtt` is written beside the MP4
from `captionCues`. `--contact` composes a sheet in one page
(`page/contact.ts`); `--stills` writes PNGs. An uncaught page error is a
`PageError`.

The runtime's typings are older than its behaviour: a
`LinearAnimationInstance` has no `duration` or `fps`, and an artboard's size
is its `bounds`. The page therefore takes `?fps=` and `?duration=` from the
renderer.

## Check

`film check <film>` reports every finding, then fails on any error:

- **Film:** a sound cue naming an unknown scene, Event or mark; a music act
  out of order or under 3 s (`ActTooShort`); a take missing or recorded for
  other text or voice (`TakeStale`); a generated sound whose hash moved
  (`AssetStale`); once every take is recorded, an audio master missing or not
  the film's length (`AudioMissing`, `AudioStale`).
- **Project:** no project (`ProjectMissing`); what `rive inspect` reports
  (`ProjectProblem`, at `file:line`); a beat with no artboard
  (`SceneMissing`), one that is not a component (`SceneNotComponent`), one
  with no `main` timeline (`TimelineMissing`), one still its storyboard
  (`SceneUndrawn`, a warning); a mark with no Event (`MarkUnpinned`) or
  Events out of the marks' order (`MarkOrder`); a Film out of date
  (`FilmStale`: run `sync`).

`--allow-stale` makes stale takes, sounds, master and Film warnings.
`--scene id,id` checks those beats only; an id the film lacks fails with
`UnknownScene`.
