# @bible/film

The engine behind the cut-paper explainer films in `apps/animations`: a film
is an ordered list of narrated scenes, laid end to end on a clock set by the
recorded words, and every frame is a pure function of that film and a time.

## Entry points

| Import                     | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`         | The clock: easing and `progress` (`time`), seeded noise (`random`), `{mark}` narration timing, named cues (`timeline`), the sound plan, scene `layout`, a person's takes (`recording`, `align`, the reading `sheet`, the studio's wire `studio`), and the mix: `mixPlan` (what plays where) and `renderMix` over planar PCM (`audio`, `dsp`: the ffmpeg filters it replaced, ported).                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@bible/film/canvas`       | The Canvas 2D draw kit (ink, cutout, paper, type, IK limbs, figure, multiplane camera, `shotPath`/`lerpCamera` shots and `knobCamera` framings from knobs, storyboard), `createFilm`, which composites any `T`, and the text probe (`probe.ts`) `film check` reads.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@bible/film/player`       | `mountPlayer(films)`: the scrubbable preview (`mountPreview`), whose track marks marks, cues, sound effects and music acts (`core/ticks.ts`), the `?export` handle (`ExportHandle`) a renderer drives, the narration as a typed state (`narration.ts`: `None`, `Loading`, `Ready`, `Blocked` until a click, `Missing` when the master will not load or play, which the preview then never asks to play and says `no narration`), and the look-book (`?lookbook`, `lookbook.ts`). Framework-free, so the renderer's page never loads Solid; an old `?lab` link goes to the lab's page (`labUrl`). `player.css` styles it and the lab.                                                                                                                                                                                                              |
| `@bible/film/lab`          | `mountLab(films)`: the lab's own page (`/lab?film=<film>`), Solid 2 components around the same preview. `lab/shell.tsx` is the shell as compound components (`<Lab.Root>`, `<Lab.Overlay>`, `<Lab.Layer>`, `<Lab.Strip>`, `<Lab.Panel>`, `<Lab.Header>`, `<Lab.Section>`); the editor (`lab/editor/`: `<Editor.Provider>`, `<Editor.Strip>`, `<Editor.Section>`) writes through its effect-machine; Motion (`lab/motion/`: `<Motion.Provider>`, `<Motion.Section>`, `<Motion.Onion>`) and Compare (`lab/compare/`: `<Compare.Provider>`, `<Compare.Section>`, `<Compare.Layer>`, `<Compare.Divider>`) each hold one machine; the notes (`lab/notes/`: `<Notes.Provider>`, `<Notes.Pen>`, `<Notes.Section>`, `<Notes.Marks>`, `<Notes.Pins>`) hold the feed and the composer machines. Every panel is Solid; none mounts plain DOM into the shell. |
| `@bible/film/solid-plugin` | The Bun plugin that compiles `.tsx` with Solid's compiler (`@solidjs/compiler`): the app's `bunfig.toml` (`[serve.static]`) and the lab's browser tests bundle with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@bible/film/tools`        | The `film` CLI (`runFilmCli`) and its Effect services: FilmRepo, ContentStore, ElevenLabs, Media (mediabunny + mpg123 + WASM AAC: durations, decode, WAV, joining a film; ffmpeg for recordings), Narrator, Takes (a person's recordings), Composer, Mixer, Browser, PreviewServer, Renderer (`render-plan.ts` is its pure plan), Checker (`check.ts` holds its pure detectors), NotesStore, the lab's routes (`lab.ts`), its studio (`studio.ts`) and its source editing: SceneSources, SceneWriter, SceneHead, StaticCheck.                                                                                                                                                                                                                                                                                                                     |

## Data

`core/schema.ts` holds the Schemas for everything a film reads or writes:
`Timed` scenes, `Beat` (a script's beat: `Timed` plus `cite` and a `picture`
brief), `Voice`, `Timings` (`narration/timings.json`), `Sound`, and
`SoundManifest` (`sound/manifest.json`). The TypeScript types derive from them.
`TimingsJson` and `SoundManifestJson` decode a file's text and encode it back
byte for byte; the request hashes (`voiceKey`, `musicKey`, `effectKey`) are
taken over Schema-encoded requests, so a committed hash stays current.

## Tools

`film narrate|takes import|script|score|mix|cues|check|render|lab|notes <film>` (and `film doctor`) runs from the app that holds the
films. The app owns the entry: it calls `runFilmCli({ films, previewServer, labServer })`
with its films folder, a scoped `PreviewServer` layer that serves its
player page, and `labServer`, which serves the same page in development
mode with the lab's routes mounted, because only the app can bundle its HTML
and films (see `apps/animations/cli.ts`). Logs (`Effect.log`, `event
key=value`) go to stderr; stdout carries only what a command prints. The player imports the same folder, so the tools
and the page never read two different films. Paid calls (ElevenLabs speech, music,
effects) go through the `ElevenLabs` service only; `mix`, `cues` and every
`--dry-run` make none. Assets are content-addressed: `ContentStore.ensure`
produces an asset only when its stored hash is stale, and every manifest
update is serialized. At most three paid jobs run at once. Failures are
tagged errors (`TakeMismatch`, `ApiKeyMissing`, `EncoderMissing`, ...) in
`tools/errors.ts`; logs are `Effect.log` lines `event key=value`.
`tools/testing.ts` has the in-memory doubles the tool tests use.

Preflights: `film doctor` checks headless Chromium (launched and closed;
`BrowserMissing` carries the install command), the `elevenlabs` CLI and its
login (`auth status`, free) and `ffmpeg` (`-version`), reports each, and fails
if any is missing. `narrate`, `takes import` and `score` run the ElevenLabs check before their first paid call,
and the `ElevenLabs` service uses `ELEVENLABS_API_KEY` when the environment
or the Keychain holds one (effects need it) and the CLI's OAuth login
otherwise, one OAuth call at a time (concurrent refreshes race and fail);
and a video `render` asks a page whether it can encode H.264 at the film's size
(`EncoderMissing`) before it draws a frame.

Media files go through `Media` (`tools/media.ts`): mediabunny reads and writes
the containers in-process, and MP3 decodes through mpg123 (WASM), gapless, so
a take measures what it plays (`duration`). `join` writes a film: its H.264
segments' packets copied in order (never re-encoded; segments encoded unlike
the first fail), and its track encoded to AAC beside them through
`@mediabunny/aac-encoder` (ffmpeg's encoder built to WASM), one frame of
priming early so the MP4's edit list starts it on the first frame. Every byte
moves through the FileSystem service but the joined film's, which mediabunny's
`FilePathTarget` writes by position on Bun's file system (Effect's file handle
appends under Bun: its `fs.write` passes no offset, and Bun then ignores the
position). Failures are `MediaFailed`. The ffmpeg binary is involved only
for a person's recordings, which arrive in whatever format a recorder saves
(M4A/AAC, Opus, WAV at any rate): `load` decodes any of them to one channel
of 32-bit float at the rate asked for, and `encodeFlac` writes a take as a
24-bit FLAC master (float in, one quantisation 144 dB down, no dither
needed), each through a scoped temporary directory. A person's take is the
film's final voice, so it is never lossy after the recorder: FLAC decodes back
in-process through libFLAC (`@wasm-audio-decoders/flac`, WASM; Bun has no
WebCodecs decoder for mediabunny), and the mix reads it as it reads a staging
MP3. Staging takes stay the MP3s ElevenLabs sends.

`mix` plays `mixPlan` out through `renderMix` (the voice bus, the score faded
and ducked under it, the effects on their cues, summed and limited: ported
from the ffmpeg graph it replaced, which it matched to a −98.8 dB residual)
and writes the film's one track, `narration/full.wav` (16-bit), to
`full.partial.wav`, renamed only once whole: a failed or interrupted mix
leaves the previous track. It logs each bus's mean and peak dBFS
(`mix.levels`), and `--stems` writes each bus the film's length. A sound at
another rate fails as `SampleRateMismatch`: the mix never resamples. The
player streams the WAV (the preview server answers range requests);
`masterFinding` holds it to the film's length (`AudioMissing`, `AudioStale`);
the renderer checks it before the first frame and `check` in its static
leg.

`narrate` writes each new take as `<id>.<audio hash>.mp3` and makes it current
only by rewriting `timings.json`, so no crash leaves a take and its timings
disagreeing. A take's words come from the speech model's alignment and its
length from the encoded file; a word the alignment puts past the end is held
inside the take (`core/narration.ts` `heldInside`, with a `narrate.overrun`
warning past `TAKE_TOLERANCE`), so the timings always fit their audio. It removes the takes (`.mp3` or a person's `.flac`) the timings
no longer name, and partial writes, at the start and end of every run. A
replaced person's take loses only its copy in `narration/`: its master and
its original stay in `narration/attempts/`.

Each take in `timings.json` carries its `source`: `elevenlabs` (staged by
`narrate`; written as no `source` key, so a file from before sources reads
as this and a staged take never churns the committed file) or `recorded` (a
person's, by `takes import` or the lab's studio). `core/narration.ts`
`takeState` says where a beat's take stands: `Recorded`, `Staging`, or
`Stale` (missing, text changed, voice changed) with whether a person read it.
`narrate` never stages over a current recorded take and refuses a stale one
without `--replace-recorded`; a recorded take stays current across a change
of staging voice, since no staging voice made it; `check` fails a stale one
(`TakeStale`, `recorded: true`). A recorded take whose beat id the script no
longer has (a renamed or removed beat) stays in `timings.json` and on disk,
so no sweep deletes a person's reading; `narrate` warns
`narrate.orphaned id=… file=…` and `--dry-run` lists it as `orphaned`, for
the author to rename the entry or remove the file by hand.

`takes import` (`Takes`, `tools/takes.ts`) makes a person's recording a take:
`Media.load` at the mix rate, `prepareTake` (`core/recording.ts`: one
channel, trimmed, levelled, held under the ceiling; `RecordingInvalid` when
nothing in it reaches −60 dBFS), `Media.encodeFlac` (the take,
`<beat>.<hash>.flac`), then the same speech-to-text as `narrate`, whose words
time the script's words through an edit-distance line-up (`core/align.ts`
`timeScript`: a misheard word keeps its place, an unheard one shares the gap
its neighbours leave; a reply that heard words but timed none fails
`SttUntimed` rather than timing the take by nothing). The recording lands as an attempt in
`narration/attempts/<beat>/`: the recording itself, byte for byte
(`<beat>.<hash>.orig.<ext>`; a whole reading once, under `whole/`, each beat's
attempt naming the stretch it was cut from), its FLAC, and its
`attempts.json` ledger (what was heard, the word error, when). Keeping one
checks its word error again as the check reads now, then copies the FLAC
beside the other takes and rewrites `timings.json` to name it; the take it
replaced is removed from `narration/`. The check (`core/spoken.ts`
`lineError`, for narrate and takes alike) reads both sides as said
(`spokenWords`): a run of numbers is one token of digits however written or
spoken (`144,000`, "one hundred and forty-four thousand", a year in pairs),
"chapter" and "verses" before a number and "to" or "through" between two are
dropped (so "Zechariah 3:1-4" is read aloud either way), `Mrs.`, `Dr.`,
`St.` are the words they stand for, and a name spelt as `script.ts`'s
optional `heardAs` export lists it (`{ Ellet: ['Elliot'] }`, `HeardAs`,
loaded onto the film as `heardAs`) is the script's. `--accept-mismatch id,id`
keeps those beats' mismatched takes (`accept.ts`); bare, it means the
`--only` beats, and bare without `--only` fails `AcceptMismatchUnnamed`. A lossy recording (M4A,
MP3) still imports, with a `takes.lossy` warning: the master is lossless from
there on, but record WAV or FLAC for the final voice. `--whole` transcribes one recording of the script and
places every beat by the same line-up (`placeBeats`), with affine gap costs
(`GAP_OPEN`) so a beat's words pair with one reading of it: a beat the
reading skipped is the one named (under half its words heard fails
`BeatUnplaced`), and a line flubbed and read again belongs to the reading
that finished it, the false start to neither beat. Each beat is cut on its
own (`cutsAround`), at the quietest 10 ms of the silence before and after it,
and faded over 5 ms at both cuts (`cutPcm`), so a false start is cut out of
both beats beside it. Every beat is placed and cut before `--only` picks.

The padding and loudness a recorded take gets are measured, not chosen: over
the 30 committed staging takes (both films, 2026-09-28; mpg123 decode, 10 ms
RMS windows), the median speech level is −17.10 dBFS (−17.90 to −15.67;
`speechLevel`: the mean power of the 10 ms windows over −70 dBFS and within
10 dB of their mean, BS.1770's two-stage gate without K-weighting, so pauses
are left out), the median peak −1.28 dBFS (−0.4 to −3.0), and the median
silence 0.07 s before the first window within 40 dB of the take's loudest
(the loudest sits near −9.5 dBFS, so that is a −50 dBFS gate) and 0.00 s
after the last. So a take is made louder or quieter by one clean gain, to
`TAKE_LEVEL.speech` −17.1 dBFS or less when that would take its peak past
the −1 dBFS ceiling: min(target − speech level, ceiling − peak), with no
limiter, so the voice keeps its dynamics and a longer pause never changes
its level. `TAKE_PAD` is 0.07 s lead and no tail; a recording that starts on
its first word gets the lead in silence. Speech is sound over the gate that
lasts 0.1 s (`TAKE_MIN_SPEECH`) counting gaps under 0.25 s (`TAKE_HOLD`), so
a click or tap after the line is trimmed with its silence, and the take fades
over 5 ms (`TAKE_FADE`) at both ends so neither trim clicks.

`film script <film>` prints the reading sheet (`core/sheet.ts`), and
`--sheet` writes it to `out/<film>/script-sheet.md` and a page to print,
`script-sheet.html`: each beat with a line (from `script.ts` when the film
has one, with its `cite` sources; from its scenes when not), the file to save
its take as, marks stripped, each turn's reader named, each “quotation” set
apart with the `quotes.jsonl` record whose words hold it, and `/` at each
sentence end for a breath (not after an abbreviation such as `Mrs.` or `St.`,
the same list the take check reads out).

`render` opens the app's server, headless Chromium (`Browser`, the only
Playwright code) and a pool of player pages in one scope; a failure in any
page, or Ctrl-C, closes every page, the browser and the server. A video's
frames split into chunks (`planChunks`: about four per page, at least a second
and at most eight each) on a queue that idle pages pull from; each page draws
its chunk and encodes it with the browser's hardware H.264 encoder through
mediabunny (`player/encode.ts`: quantizer 16, a key frame every two seconds)
into a segment of its own (and, unless `--no-share`, a share copy at
quantizer 26 from a second encoder in the same pass), and a chunk whose page
crashes is retried once on a new page. `Media.join` joins the segments in order with the track cut from
`full.wav` under the range and encoded to AAC, and `out/<film>.vtt` is written
beside the MP4 from `captionCues`, the same line timing the burned-in captions
use. Segments are written to a temp folder of the render's own (`makeTempDirectory`), removed once joined;
a video writes nothing under `out/<film>/`, whatever its tag. A
contact sheet is composed in one page (`player/contact.ts`). An
uncaught error in the page is a `PageError`, never a log line. A missing
browser is `BrowserMissing`, whose message is the install command.

## Lab

`film lab <film>` serves the lab's page in development mode (the bundle
rebuilds and hot-reloads as scenes change) at `/lab?film=<film>`, prints that
URL, and runs until Ctrl-C, which stops the server and the routes with the
command's scope. The page is the app's (`lab.html`, whose entry calls
`mountLab(films)`, bundled with `@bible/film/solid-plugin`); only the lab's
server serves it, so the render's server never bundles Solid. The framework
owns the routes (`lab.ts`, an `HttpRouter` web handler over NotesStore); the
app mounts them at `/lab/*`:

| Route                                    | What it does                                                         |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `GET /lab/notes`                         | the film's notes file; its `seq` is the cursor                       |
| `POST /lab/notes`                        | a new note: `NotePost`, a `NoteDraft` plus the frame as a base64 PNG |
| `POST /lab/notes/:id/reply`              | the user replies (`ReplyPost`); the note opens again                 |
| `POST /lab/notes/:id/resolve`            | resolves it                                                          |
| `GET /lab/notes/wait?since=<n>&timeout=` | the changes past cursor `n`, long-polled (at most 60 s)              |
| `GET /lab/stills/:name`                  | a still (`n3.png`, `n3.r5.png`); any other name is a 404             |

A bad body is a 400, an unknown note a 404, and every failure is logged.

**The studio** (`tools/studio.ts`, over `Takes`, `FilmRepo` and `Mixer`)
records takes from the lab through the same import as `takes import`. It
answers `/lab/<film>/studio/*` (`withStudio` routes that prefix to it and the
rest to the lab) with the same admission: same-origin JSON, and the film the
lab serves (another film is a 409). Every body and answer is a Schema in
`core/studio.ts`:

| Route                                    | Body → answer                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /studio/beats`                      | `StudioBeats`: per beat with a line, its sheet `parts`, the file name to record it as, `state` (`recorded`, `staging`, `stale`), its take, how many attempts             |
| `POST /studio/takes/:beat`               | `TakePost` (`audio` base64, `type` `audio/wav` or `audio/flac`, `acceptMismatch?`) → `StudioTake` (the take, what was heard, the word error, the new `timings`, `mixed`) |
| `GET /studio/takes/:beat/attempts`       | `StudioAttempts`, newest first: what each heard, its word error, when, whether it is the take and whether it reads the line as it is now                                 |
| `GET /studio/takes/:beat/attempts/:file` | the attempt's FLAC (`audio/flac`), to hear it again; a name the ledger does not hold is a 404                                                                            |
| `POST /studio/takes/:beat/keep`          | `KeepPost` (`file`, `acceptMismatch?`): an earlier attempt made the take → `StudioTake`                                                                                  |

A take not kept answers `StudioRefusal` (`_tag`, `message`, and for a
`TakeMismatch` the `script`, what was `heard`, the `wer` and the `attempt` it
saved, which `keep` with `acceptMismatch` makes the take: "accept anyway").
A body that is not a recording, or of a media type ffmpeg is not told how to
read (`AudioInvalid`), is a 400; a lossy one (`audio/webm`, `ogg`, `mp4`,
`aac`, `mpeg`: what MediaRecorder makes) a 415 `RecordingLossy`, since the
take is the film's master; the panel records PCM (an AudioWorklet) and posts
WAV. `TakeMismatch`, `RecordingInvalid` (a beat
with no line, silence, an attempt never recorded) a 422; a failed
speech-to-text (or `SttUntimed`) a 502. `:beat` is decoded and must be one of the film's
beats before a route reads a body or writes a thing: any other name (an
encoded `/` or `..` included) is a 404 `UnknownScene`. A body over
`STUDIO_MAX_BODY` (64 MiB) is a 413 `BodyTooLarge`, counted as it streams (a
Content-Length over it is refused unread; one under it is not believed). The
upload is written to a scoped temp file (`recording.wav` or `.flac`), removed
when the request ends. Takes are kept one at a time (a semaphore per studio):
the keep, the timings write and the mix after it finish before the next post
begins. After a take is kept the film remixes; `mixed: false` says the mix
failed (logged) and the take stands. The lab's **Studio** section records
through these routes (below).

### Studio

**The Studio** (`lab/studio/`, Solid 2 + effect-machine) is the lab's panel
for recording the final voiceover beat by beat. It lists every beat with a
line and where its take stands (`recorded`, `staging`, `stale: <why>`, with
the counts), reads the selected beat as a teleprompter (the sheet's lines, a
quotation set apart with who said it, marks stripped), and records it:

- **Capture** (`capture-browser.ts`, behind the `Capture` service in
  `capture.ts`): `getUserMedia` with echo cancelling, noise suppression and
  gain control off, one channel, the microphone picked (`enumerateDevices`;
  the choice is remembered in this browser, `mic-choice.ts`), into an
  `AudioWorklet` (`worklet.ts`) on an `AudioContext` at the device's own
  rate. The worklet hands each block of float PCM over untouched with its
  peak and RMS (the meter: dBFS, a clip warning at −1 dBFS); the page keeps
  the blocks from the count-in's end and joins them on stop. Nothing is
  resampled or compressed, and there is no MediaRecorder: `wav.ts` encodes
  the PCM as a 24-bit mono WAV at that rate, which is what is posted
  (`audio/wav`). A microphone refused is `MicDenied`, shown in the panel in
  the owner's words.
- **The recorder** (`machine.ts`) is one machine: `Idle | CountIn | Recording
| Review | Importing | Failed` on `SelectBeat | Arm | Tick | CountDone |
Cancel | Stop | Retake | Submit | Discard | Imported | Refused |
AcceptAnyway | KeepAttempt | Retry`. Arm pauses the film and opens the
  microphone; the 3 s count-in is a state timeout; Stop encodes the WAV to
  review (play it back before submitting); Submit posts it as the state's
  task; the answer is the take kept (what was heard, its word error) or the
  server's refusal in its own words. A `TakeMismatch` with the attempt it
  saved offers **Accept anyway** (a guarded transition: `keep` with
  `acceptMismatch`). Each beat's attempts (newest first: heard, word error,
  length, kept, recorded for an earlier line) play from their audio route
  and **Keep** makes one the take.
- **After a take is kept and mixed** the machine asks the stage to reload the
  page (`Stage.reload`: `#T` held, then `location.reload()`): the player reads
  the timings and the track once, at load, so the film then plays the new
  take at the same T, back on the same beat (the view keeps it). A mix that
  failed reloads nothing and the status says so. The app serves the
  narration with `Cache-Control: no-cache`, so a reload never plays a take
  the browser cached.
- **Keys**, only while focus is in the Studio: R record (and retake), Space
  stop, K submit (or accept anyway), ←/→ the previous or next beat (at rest
  or after a refusal, never mid-take), Esc cancel, discard or back. There
  they are the Studio's alone, so the lab's own keys (Space play, ←/→ frame,
  `[` `]` scene, `c` captions, `n` note, Esc, ⌘Z/⇧⌘Z) never fire from it;
  with focus anywhere else the lab's keys work as before. Keys with ⌘, Ctrl
  or Alt pass through, and a focused picker or player keeps its own keys.

The provider (`context.tsx`) builds the Studio's own runtime (the stage, the
studio's routes, the capture), so the shell knows nothing of it, and hands
the section derived values and actions (`view.ts`: the controls each state
offers with their keys, the status line, the meter, the counts), never the
machine's states. `lab/studio/studio.dom.test.ts` drives the whole panel in
Chromium with a fake microphone.

**Notes** live in `lab/<film>/notes.json` (`NotesFileJson`) with their stills
in `lab/<film>/stills/` (`FILMS_LAB` moves the root; the app ignores it in
git). The file is the source of truth: the lab server and `film notes` both
go through NotesStore, so either works without the other. A note is `{ id,
film, scene, T, frame, cue?: { name, edge }, mark?, box?, ink?, text,
status, still, thread, createdAt }`, plus `seq` (the change that made it) and
`changed` (the last change to touch it). A click saves a pin as a zero-size
box. Every change takes the file's next `seq`, so `eventsSince(file, n)`
(`core/notes.ts`) returns each new note, reply and resolve exactly once past
a cursor; `wait` polls the file for them (every 200 ms), so it sees a reply
the CLI wrote while the server was waiting. Writes are atomic (a partial
file renamed into place, through ContentStore), serialized in the process
(a Semaphore) and across processes (a `notes.lock` directory held for each
change; a lock held past about 5 s fails with `NotesLocked`, naming it). A
note's still is written before the note that names it.

`nearestMoment(placed, T)` (`core/notes.ts`) names the scene at `T` and, in
it, the nearest named-cue edge and `{mark}`; the page computes it from the
layout it draws, so a note carries the cue the viewer saw.

**The page** (`lab/`, Solid 2 around the framework-free preview): the shell
(`lab/shell.tsx`) is compound components. `<Lab.Root>` holds what every panel
shares (the film, its player, the lab API's base, the view kept through a
reload, `T`, the frame drawn last, as a signal, the selection (kept in the URL as
`sel`), and a runtime for the panels' machines: `Stage`, the preview as they
drive it (`lab/stage.ts`: edits shown in memory, `#T` held for a write), and
`LabApi`, every lab route through `HttpClient` with its Schema, a refusal
being the server's own text (`lab/api.ts`)); `<Lab.Overlay>` and
`<Lab.Layer>` are pinned exactly over the film canvas and follow it as it
resizes; `<Lab.Strip>` is a slot right under the player's timeline;
`<Lab.Panel>`, `<Lab.Header>` (with the look-book link) and `<Lab.Section>`
lay out the side panel. Each tool's state lives in its own provider; the
shell knows none of it. A provider's context gives values derived from its
machine and actions, never the machine's state: the editor's `status` and
`findings`, Compare's `mode`, `layer` (`hidden`, `head` or `now`) and
`split`, the notes' `composerOpen`, `composerTyping` and `draft`; so no
component matches a state's tag, and a renamed state touches only its
module. The browser tests (`lab/**/*.dom.test.ts`) open the real
page over a probe film in headless Chromium with the lab API faked
(`lab/fixtures/harness.ts`).

**Notes** (`lab/notes/`, Solid 2): on the canvas a
click pins a point, a drag draws a box, and the Pen toggle draws freehand
ink; `n` notes the whole frame, Escape drops the draft. The composer shows
the scene, time, frame and the nearest cue and mark, and pauses playback.
Saving redraws the film canvas at that frame and sends it (`canvas.toBlob`)
as the still. Every lab mark lives on an SVG layer over the canvas, never on
the canvas, so a still, an export frame and a probe are the film's pixels
alone. Notes appear as pins through the timeline (the tick machinery, hover
for the text; a pin and the marks surface take native pointer listeners that go with their elements, never an `onCleanup` in a ref, which has no owner in Solid 2) and in a side list with their status, still and thread,
newest first; clicking one seeks to its frame and draws its box and ink
there. The selected note takes a reply or a resolve. Two machines hold it. The
composer (`lab/notes/composer.ts`): `Closed | Marking | Open | Saving` on
`Press | Drag | Lift | Note | Cancel | Save | Saved | Failed`; the save is
the state's task (`Stage.still`, then `NotesApi.add`), so one is out at a
time, and a refusal comes back to the draft in the server's words. The feed
(`lab/notes/feed.ts`), the page's live connection to its server:
`Connecting | Live | Lost` on `Synced | Waited | Dropped | Retry | Refresh`;
it reads the notes, then long-polls `/lab/<film>/notes/wait` past the
cursor, so the list changes the moment the agent replies; a failed read or
wait says so in the panel and connects again after 2 s (a state timeout);
a note, reply or resolve made on the page reads the notes at once. (Scene
hot reload is Bun's own HMR client, not the lab's.)

`film notes <film>` prints each unresolved note as one line:

```
note id=n1 status=open scene=hand T=230.38 frame=6911 cue=topple:end mark=hand box=760,560,400x400 replies=0 still=/…/lab/<film>/stills/n1.png text="…"
```

`--watch` prints each new note, and each reply from the user (`reply id=…
by=user … still=… text="…"`), once per run, starting past the current cursor
(`--since n` to start earlier): run it under a Claude Code Monitor and each
note arrives as a notification. `film notes reply <film> <id> "…" [--still
file.png]` answers as the agent (the still is copied to `stills/<id>.r<seq>.png`
and the note becomes `replied`); `film notes resolve <film> <id>` closes it.
An unknown id fails with `NoteNotFound`, listing the film's notes.

### Editing cues and knobs

The lab also edits the scene source: a cue's `offset`, `dur` and `ease` and a
knob's value, each written into the scene's `.ts` file on release. The dev
server rebuilds and reloads the page at the same `#T`, with the selection
kept in the URL (`&sel=cue:hand:topple`, `&sel=knob:hand:palm`); review the
change with `git diff`.

| Route                           | What it does                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /lab/scenes/:scene/source` | the scene's file and, per cue field and knob, `literal`, `absent` (added on write) or `computed`    |
| `POST /lab/cues/:scene/:cue`    | `CuePatch` (`offset?`, `dur?`, `ease?`, at least one); answers the span, the cue resolved, findings |
| `POST /lab/knobs/:scene/:knob`  | `KnobPatch` (`{ value }`, a number or `[x, y]`); answers the value read back and findings           |
| `POST /lab/undo`                | puts the last write's file back, byte for byte; once                                                |
| `GET /lab/check`                | `film check --static` now, and the write Undo would revert (`last`)                                 |
| `GET /lab/scenes/:scene/head`   | the scene's timeline and knobs at HEAD (`HeadSource`), `codeChanged`, `sameData`                    |

A scene that is not located is a 404, a value the lab will not rewrite a 422
(so is a cue timing the scene's timeline would not resolve with), an undo with nothing to undo (or a file changed since) a 409.

**SceneSources** (`scene-sources.ts`) finds each scene's drawing by identity,
not by name: the parser (oxc) lists every exported `drawing({...})` call in
the film's folder, the film's registry (`scenes/index.ts`) is imported, and a
scene belongs to the call whose exported `timeline` or `knobs` is the very
object the scene reads. A renamed registry entry or two files exporting the
same name cannot point a scene at the wrong literal; a scene built without a
literal (a spread, a function) is reported as not located, with the reason.

**SceneWriter** (`scene-writer.ts`, splices in `scene-source.ts`) re-reads the
file, replaces only the value's text (a missing `offset`, `dur` or `ease` is
added after the fields before it), writes the file whole through
ContentStore (a partial renamed into place), runs `oxfmt` on it and reads the
value back. If oxfmt fails or the value does not read back, the file is put
back and the write fails (`FormatFailed`, `WriteUnverified`). It refuses what
it cannot prove is a literal (`SourceRefused`: `GAP * 2`, a spread, a
computed key, a shorthand) and names it. A cue write is also refused
(`TimelineUnresolved`) when the scene's timeline, read back from the new text,
does not resolve: an `until` span dragged past its mark would end before it
starts. Writes run one at a time and are
uninterruptible (the reload a write causes drops its request). The last write
can be undone once, only while the file is exactly as that write left it.

**StaticCheck** (`static-check.ts`) runs `film check <film> --static
--allow-stale` in a new process after each write (this one imported the
scene modules at start) and returns its findings, which the lab lists.

**The editor** (`lab/editor/`, Solid 2): a strip under the timeline shows the
current scene zoomed, its words and marks, and one row per cue. Drag a cue's
body to move its offset, its left edge to move its start (offset and dur),
its right edge to move its end (dur). A cue that runs `until` a mark keeps
ending on it (`dragPatch` in `core/timeline.ts`): its body and left edge move
only its offset, its start held a frame before the mark, and its right edge
sets a `dur` only when dropped off the mark. Edges snap to word starts and ends,
marks and other cues' edges within 8 px, else move by whole frames; shift
places them freely. While dragging, the frame previews the edit in memory
(`film.preview(scene, edit)` resolves the edited timeline on the scene's own
clock, `sceneClock(p)`, as `layout()` does; an edit that does not resolve is
not shown, and the status says why); the release writes. The
inspector shows the selected cue's anchor (read-only), `offset` and `dur`
inputs (for an `until` cue, `until {mark}` and its resolved end instead of
`dur`), and an ease picker drawing each curve (the ease is only ever data:
`f.at` takes none, so the picker always changes the frame). Knobs take number inputs; a point knob also gets a handle on the frame.
`RenderOptions.knobs` records each read with the canvas transform at the
read (`KnobRead.transform`, like the probe reads it), so the handle sits at
`transform · value` and a drag maps the pointer back through the inverse
(`core/affine.ts`), to whole units of the knob's own space: a knob read
inside `at(...)`, scaled or tilted, drags where it is drawn. A knob read
outside every camera is drawn where the scene's next camera puts it: each
scene draws through `hearingCameras` (`canvas/camera.ts`), which tells the
recorder the transform inside each outermost `camera` or `multiplane` (its
focal plane) it applies, and the reads before it are stamped with it
(`KnobRead.framed`); the handle sits at `framed · value`. A read before the
scene's first camera but drawn outside every camera would be misplaced, so
read a knob where it is drawn. A camera's target (a point knob `X` beside a
number knob `XZoom`, as `knobCamera` (`canvas/camera.ts`) reads them) is a reticle; while the
camera sits on it (the handle at the frame's centre) its drag moves the
picture with the pointer, the target by the move taken back through the
camera, the other way. Read inside a
transition's layer, or under two different transforms in one frame, it is
numbers only, and the inspector says why. A field computed in source is shown
disabled. Undo write reverts the last write. Every write, a drag's, a
field's, a knob's, Undo's and Redo's, goes through one effect-machine
(`lab/editor/machine.ts`: `Idle`, `Pressed`, `Dragging`, `Writing`, `Written`,
`Refused`), so a press or another write while one is out is not taken and
two writes never race for a file; a write with no answer in 20 s
(`WRITE_TIMEOUT_S`) is refused and says so, so a hung server never wedges
the editor; Escape during a drag puts the cue back.
The pure parts (`lab/editor/grip.ts`: where a press grabs, snapping, the
patch a drag makes, why a cue cannot be dragged) are shared by the machine
and its tests, which run every transition with no DOM. The knobs' rows
(`<Editor.Knobs>`) and handles (`<Editor.Handles>`, in the overlay) are Solid
(`lab/editor/knobs.tsx`): a handle's press grabs the knob as a `KnobGrip`, and
the same machine previews each move and writes on release; where a handle
sits and how it drags are pure (`lab/editor/handles.ts`, `dragKnob`).

### Motion, compare and the look-book

**Motion** (`lab/motion/`, Solid 2; the onion painter is framework-free in `player/onion.ts`) never draws on the film canvas. The
onion skin renders the frames around the one shown (± 1–4, every 1–15
frames) at half size, keeps only the pixels that moved (darker than the
frame on a light page, lighter on a dark one) and paints them on a layer
over the film, warm before and cool after, fainter the further away; it
shows on a paused frame. Speed (0.25×, 0.5×, 1×) and loops drive the
player's clock (`Player.setRate`, `Player.setLoop`); narration plays only
at 1×. A cue loop follows the cue as it is edited; a cue under 0.2 s loops
with 0.4 s either side. A–B loops any range. The loop is one effect-machine (`lab/motion/loop.ts`): `Off | Marked | Range | Cue` on `MarkA | MarkB | LoopCue | Stop`; a B not after A stays `Marked`, and a range plays from A as it is made. The provider plays the state through `rangeOf` each frame drawn.

**Compare** (`lab/compare/`, Solid 2) reads the scene's file at HEAD
(`GET /lab/scenes/:scene/head`: `SceneHead` runs `git show HEAD:<file>`
and parses it with the locator and parser the writer uses) and draws the
frame with HEAD's timeline and knobs through today's code (`film.render(…,
{ edit })`) on a layer over the film: wipe (HEAD left of a draggable
divider) or blink. The mode is one effect-machine (`lab/compare/machine.ts`): `Off | Wipe | Blink` on `Choose | Split | Flip`, a blink flipping itself every 450 ms by the machine's timeout. Only data can differ that way; when the file's code
changed since HEAD the panel says so, and a HEAD the server cannot give shows the server's reason.

**The look-book** (`player/lookbook.ts`) is one sheet of the whole film:
the palette (`createFilm({ palette })`) as swatches, then per scene a row of
stills at every cue's start and end and its 60% point (`sceneMoments`, the
moments `film check` samples, less the marks), each labelled with the cue
and time. The page composes it with `film.render`, so the lab shows it live
(`?film=<film>&lookbook`, a still opening that frame in the lab) and
`film lookbook <film> [--captions] [--tag t]` asks one export page for the
same sheet (`ExportHandle.lookbook`, `RenderJob.LookBook`) and writes
`out/<film>/lookbook.jpg`. It is the first page to read for a new film
and the consistency reference while its scenes are built.

## Check

`film check <film>` fails (after reporting every finding, not the first) on
what a review used to find by eye:

- **Static** (no browser, `--static`): a named cue that ends after its scene
  (`CueLate`); a sound cue naming an unknown scene, cue or mark; a music act
  out of film order or under 3 s (`ActTooShort`); a take that is missing or
  was recorded for other text or another voice (`TakeStale`); a generated
  sound whose request hash has moved (`AssetStale`); once every take is
  recorded, an audio master that is missing (`AudioMissing`) or not the
  film's length (`AudioStale`). `--allow-stale` reports stale takes, sounds
  and master as warnings. `--scene id,id` limits the layout leg; an id the
  film lacks fails with `UnknownScene`. A sound never generated
  (`AssetMissing`) is always a warning: the mix plays without it.
- **Layout** (headless pages, like `render`): each scene is sampled at every
  mark, every cue's start and end, and its 60% point, pulled after its
  entering transition (mid-transition two scenes cross by design). The player
  draws each sample with the **probe** on and returns every line of text as
  a box in canvas pixels, turned with its transform, and every mark of ink
  (a brush stroke's centre line and width, a fill's outline, a declared
  plate) with its opacity and its place in the drawing order. Two different
  lines both above 0.3 opacity that overlap by more than 4 px either way are
  a `TextOverlap`; a visible line cut off by the frame's edge is a
  `TextOffFrame` (a line wholly outside the frame has slid away and is not).
  A visible stroke whose centre line runs through a visible line's box for
  more than 4 px, where no opaque plate drawn after the stroke covers it, is
  an `InkOverText`, measured along the crossing (a segment-versus-box
  clip, not the bounds). A line on a plate that the frame cuts off, and that
  sits still there, is a `PlateOffFrame`. A line drawn on a declared plate
  (`probePlate`) whose box leaves the plate's box by more than 4 px is a
  `TextOffPlate` (a brief overrunning its card). Findings merge per scene and
  text (or pair), at the worst sampled frame.
- **Holds** (a warning, found in two steps): the static step (`holdCandidates`)
  finds each stretch of a drawn scene over `HOLD` (4 s) inside its voice's
  spoken span (first word's start to last word's end, from the take's word
  timings) where no cue starts, ends or runs and the scene is not arriving.
  The layout leg then looks inside each candidate at one frame per boil tick
  (`holdTicks`, `BOIL_FPS` a second, so a sway slower than the boil is seen
  at more than one phase). It probes a grid tick every `HOLD / 2` first
  (`holdGrid`): a still run over `HOLD` spans two grid ticks in a row, so
  only where two in a row hold still does it probe the ticks around them,
  growing the run each way until a tick moves. Motion no cue declares ends a
  run; the still stretch after it is still found. The longest run over
  `HOLD` is a `StaticHold` with its scene and film `from`–`to`. A mark is at
  rest when its box moves no more than `STILL_DRIFT` of its own units (the
  screen drift over the `scale` the probe records, `sqrt(|det|)` of the
  transform it was drawn under) and its opacity no more than `STILL_FADE`
  (0.02). `STILL_DRIFT` is twice `STROKE_JITTER` (1.1), the most one boil
  tick moves a default stroke's box edge, so a boiling stroke is still at any
  zoom and a walk loop or drifting snow is motion. Glyph and torn-edge boil
  never reach the probe: `write` records its box from the unjittered glyphs,
  `cutout` the shape it was given. The caption line and its plate are the
  voice, not the picture: the caption probe tags them `caption`, and the diff
  leaves them out, whatever they say. Known limits: the diff sees boxes and
  opacity only, so a colour change (a dawn warming, a stain fading by
  `fillStyle`) and anything the probe does not see (`unprobed`, `drawImage`
  textures, raw canvas paths) read as still, giving a warning that asks for
  a look; a stroke drawn with a `jitter` over the default boils past
  `STILL_DRIFT` and reads as motion. `film check` stays
  green on it; `--static` skips it, since telling a still picture from
  undeclared motion needs the frames.

The probe lives in `canvas/probe.ts`. `write`, `block`, right-to-left text
and the captions record their text through it; `stroke` records its drawn
centre line and `cutout` its outline. A drawing declares the plate its text
sits on (a torn tag, a word card) with `probePlate(ctx, shape, () => write(…))`:
the shape it drew the plate with, and the lines on it drawn inside. A plate
hides what is under it as the text does, so it is measured as text too; the
lines drawn inside carry the plate's `order` (`on`), so a card never collides
with its own lines, while any other text over it does. The kit declares one
plate itself: a storyboard scene's card (`canvas/storyboard.ts`), so its id and
brief are checked against the card (`TextOffPlate`) and against each other
(`TextOverlap`). The films declare the rest (righteousness-by-faith: heaven's
banner, the court and cold labels, the thesis, message and word boards, the
declared card; v1: the cite tab and the justified strip).
With no probe attached a draw costs one WeakMap lookup, and a probed frame
is pixel for pixel the same (it only reads the transform, `measureText` and
the path it was going to draw). The export handle exposes it as `probe(i)`.

What the rules leave alone, and why:

- A fade-out under a fade-in is not a collision (the 0.3 opacity floor), so
  there is no per-drawing allow-list.
- A stroke drawn **under** a line at no more than 0.5 opacity is page texture
  the words read over (greeked copy on a newspaper); drawn over the line, or
  heavy, it strikes it.
- A stroke that marks a line on purpose (an underline, a highlighter swash,
  a ring, a strike) says so with `marks: '<the text>'` in its style; it may
  cross that line and no other. It changes nothing drawn.
- A plate's "plate" is the topmost fill under the line's centre, drawn before
  it. One half the frame wide or high is a backdrop or a panel (a sky, a
  split page) and may bleed; a plate whose line is itself past the edge, or
  that has moved by the next frame (the check draws that frame only for a
  candidate), is entering or leaving.
- A hold leaves out the caption line and its plate, by the `caption` tag the
  caption probe puts on them, not by their words: they are the voice, and
  change over a still picture, while a card writing the same words as they
  are heard is the picture and moves. A storyboard
  card (`storyboard: true` on its scene, set by `storyboard()`) holds still
  over its words by design and is never a candidate.

## Named cues

A moment is declared once. A drawing names the moments something else reads
(a sound, another cue) in its `timeline`, each anchored to a narration
`{mark}`, another cue (`after` its end, `with` its start) or a scene landmark,
never to an absolute second:

```ts
export const justified = drawing({
  timeline: { slam: { mark: 'fiction', offset: 0.9, dur: 0.35, ease: 'inQuad' } },
  draw: (f) => {
    const slam = f.at('slam'); // progress(t, cue.start, cue.dur, ease.inQuad)
  },
});
// sound.ts: the thud lands where the stamp lands.
{ scene: 'justified', cue: 'slam', edge: 'end' }
```

`layout()` resolves every timeline once (`Placed.cues`, scene-local
`{ start, end, dur, ease }`); an unknown mark or cue, or a cycle, is an error naming
the scene and the cue. A mark anchor may pin to a word instead of the mark:
`{ mark: 'gift', word: 'faith', dur: 0.6 }` starts on the first word said at
or after `{gift}` that reads `faith` (`wordAfter`/`readsWord` in
`core/narration.ts`, normalised by `normalizeWords` as the take check's word error is: any case, apostrophes dropped, each hyphenated part, accents kept, NFC). `film check` warns `WordPinFar` when the pin lands more than `PIN_REACH` (one) sentence past its mark, where a re-take that lost the word would have moved it. A line that never says it
there throws `WordMissing` (`core/errors.ts`) at layout, which the tools'
`placeFilm` fails with as itself (`PlaceError = WordMissing | LayoutInvalid`),
so `film check` and every tool refuse the film by name; there is no fall back
to the mark. `f.cue(name)` reads a resolved cue and `f.at(name)`
its eased progress. A span declares its easing as data, `ease: 'inQuad'` (one
of the names in `ease`, `EaseName`), and a span without one eases
`inOutCubic`, as `progress` does. `f.at` takes no ease of its own: the ease
lives in one place, so the lab's picker always changes the frame. With `drawing(...)`, a name the timeline lacks, in
`f.cue`, `f.at` or a span's `after`/`with`, is a compile error
(`canvas/drawing.types.ts` holds the checks). The sound plan's `cueTime` reads the same map, so picture and
sound cannot drift apart. Ornament (wobble, idle motion) stays inline.

The lint rule `film/no-hand-timed-seconds` (`lint/no-hand-timed-seconds.ts`)
holds a film to it: it refuses a literal second in a draw (`clamp(t / 2)`,
`(t - cue.end) / 1.5`, `progress(t, 1.2, 0.5)`, `keys(t, …)`,
`cue.end + 0.5`, `f.mark('x') - 0.4`, `f.dur - 1.5`, `t - 4.2`, `t > 3.5`,
`t - cue.start > 0.5`, and the same second held in a module `const`) and a
span offset over 1 s from its `mark` or the scene's `start`/`speech`, which
stands in for a word (pin the word) or for a pause (anchor it to `speechEnd`
or another cue and say why). A rate (`Math.sin(t * 7)`) is not a time. The
rule reads syntax only, so a product is taken for a rate and a local alias of
the clock or a helper hiding the subtraction pass; its doc comment lists the
limits.

## Knobs

A value a note might ask to tweak (where a hand rests, a tag's angle) is a
knob: declared once on the drawing, read by name.

```ts
export const hand = drawing({
  timeline: { ... },
  knobs: { palm: [960, 800], tagAngle: 0.12 },
  draw: (f) => {
    const [x, y] = f.knob('palm'); // a point
    const rot = f.knob('tagAngle'); // a number
  },
});
```

A knob is a number or a point (`Knob` in `core/schema.ts`, decoded with the
scene); `layout()` carries them into `Placed.knobs`. With `drawing(...)`,
`f.knob` names only declared knobs and returns the declared kind (a number
stays `number`, a point `readonly [number, number]`). Promoting a constant to
a knob draws the same frame; it is what lets the lab tweak it.

## The purity rule

`src/core` never touches the DOM at runtime (type-only DOM references are
fine) and never imports from `canvas`, `player` or `tools`. Bun scripts,
tests and the browser all read it; `tools` is Bun-only. `canvas` may import `core`; `player` may import both.

Frames stay pure: no `Math.random`, no wall clock, no state carried between
frames. Seed randomness by key (`f.hand(key)`, `random.ts`).

```sh
bun run gate   # typecheck + tests
```
