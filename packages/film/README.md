# @bible/film

The engine behind the cut-paper explainer films in `apps/animations`: a film
is an ordered list of narrated scenes, laid end to end on a clock set by the
recorded words, and every frame is a pure function of that film and a time.

## Entry points

| Import                     | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`         | The clock: easing and `progress` (`time`), seeded noise (`random`), `{mark}` narration timing, named cues (`timeline`), the sound plan, scene `layout`, a person's takes (`recording`, `align`, the reading `sheet`, the studio's wire `studio`), and the mix: `mixPlan` (what plays where) and `renderMix` over planar PCM (`audio`, `dsp`: the ffmpeg filters it replaced, ported), and the procedural synth (`synth/`: `synthesize(recipe, seed)` makes room tone, chimes, drones, drains, blooms, notes, wind and rain as pure seeded functions; `loudness` is an ITU-R BS.1770-4 meter, integrated, momentary max and peak), and the sound library's pure half (`sfx`: `family.thing` names, generated, procedural and recorded declarations, the lock's variants and the request hash that says a sound is current, which variant each placement plays and its seeded jitter, levels in dB relative to the voice). The entry names only what films, their kits, the app's sound library and tests import (the clock, `hash2`/`rng`, `defineScript` and the film schemas, `defineLibrary`, `defineStore`); the framework reads every other module by its path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@bible/film/canvas`       | The Canvas 2D draw kit (ink, cutout, paper by meaning (`piece`: a figure cut and outlined, its line crawling, scenery torn with no ink and held still; `stroke`'s `boil`: tick, crawl or none), the `ground` contact shadow, paper fibre fixed to the backdrop plane (`planeFibre`), paper under a faint film grain, type, the one floating mitten hand with no arm (`hand.ts`: `floatingHand(ctx, root, { to, reach, grip }, style, hand)`, at rest beside its figure bobbing with the breath (`breathOf`), travelling toward its target on a soft arc about the shoulder, eased, with a settle, its grip forming from the open rest as it arrives; a hand at work that changes grip names the grip it `was` and morphs into the new one by `change`, point for point, never swapping in a frame (`handShape` its outline, for tests); `handAt` where it is, pure and allocation-free; `closeHand` the same hand close up, an open hand held out palm up seen from above, the palm the biggest shape, its middle on the origin, whose round finger block bends up toward the eye and back over the palm to cup (`closeShape` its outline at any `open`, continuous), with a lifeline and two soft joint lines; `CLOSE_SPAN` its length, no forearm; a gesture's `turn` turns its mitten palm up into the same shape at the mitten's size (`palmUpFrame`), so a push from the figure's hand into the close-up is one shape at two scales), figure, multiplane camera; every drawn scene breathes once by `DRIFT` (a scene's own `drawing({ drift })` in its place, `0` held still): through its outermost `camera` or `multiplane` when it frames one (a shot's `drift` is its share, `0` held still, `driftHeld`), as the outermost transform over its whole draw when it frames none, `shotPath`/`lerpCamera` shots (a deep push by `pushInto`, its target held in frame), `inset` for a picture in picture whose shots never take the scene's breath and `knobCamera` framings from knobs, storyboard), `createFilm`, which composites any `T`, and the text probe (`probe.ts`) `film check` reads. The entry names only what films, their kits and their tests use, the credits roll (`creditRoll`), `glow`, `sky`, `wash`, `mix`, `clearOf`, the `Hex` a colour is written as (a palette `satisfies Record<string, Hex>`, `Light`'s colours) and `reset` among them; the engine's own parts (`handShape`, `closeShape`, `palmUpFrame`, `lerpCamera`, `planeFibre`, the paper's sheets) are exported from their files for the framework and its tests. |
| `@bible/film/player`       | `mountPlayer(films)`: the scrubbable preview (`mountPreview`), drawn once every font face the page declares has loaded (`stageFilm`; the engine names no family), whose track marks marks, cues, sound effects and score movements (`core/ticks.ts`), the `?export` handle (`ExportHandle`) a renderer drives, the narration as a typed state (`narration.ts`: `None`, `Loading` (a play asked then starts once it can, from the clock's time then), `Ready`, `Blocked` until a click, `Missing` when the master will not load or play, which the preview then never asks to play and says `no narration`), and the look-book (`?lookbook`, `lookbook.ts`), set in the film's own type (its shorts' hook and caption families). Framework-free, so the renderer's page never loads Solid; an old `?lab` link goes to the lab's page (`labUrl`). `player.css` styles it and the lab. The entry exports only `mountPlayer`, `narratedFilms` and the `Narrated` type; the lab reaches the rest of `main.ts` by path. `src/exports.test.ts` guards this entry, `canvas`, `stand-in` and `core`: each names its exports, and each name has a user; and every module under `core/`, `lab/`, `tools/`, `canvas/`, `player/`, `browser/` and `lint/` exports only names another file imports (read by the parser, so a comment hides nothing; a `.types.ts` check, a fixture film and a lint fixture are not swept).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@bible/film/lab`          | `mountLab(films)`: the lab's own page (`/lab?film=<film>`), Solid 2 components around the same preview. `lab/shell.tsx` is the shell as compound components (`<Lab.Root>`, `<Lab.Overlay>`, `<Lab.Layer>`, `<Lab.Strip>`, `<Lab.Panel>`, `<Lab.Header>`, `<Lab.Section>`); the editor (`lab/editor/`: `<Editor.Provider>`, `<Editor.Strip>`, `<Editor.Section>`) writes through its effect-machine; Motion (`lab/motion/`: `<Motion.Provider>`, `<Motion.Section>`, `<Motion.Onion>`) and Compare (`lab/compare/`: `<Compare.Provider>`, `<Compare.Section>`, `<Compare.Layer>`, `<Compare.Divider>`) each hold one machine; the notes (`lab/notes/`: `<Notes.Provider>`, `<Notes.Pen>`, `<Notes.Section>`, `<Notes.Marks>`, `<Notes.Pins>`) hold the feed and the composer machines. Every panel is Solid; none mounts plain DOM into the shell.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `@bible/film/review`       | `mountReview`: the review page (served by `film lab` at `/`), `<Root>`, `<SetProvider>` and its pages mounted: renders compared in sync, a film's options and its project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@bible/film/solid-plugin` | The Bun plugin that compiles `.tsx` with Solid's compiler (`@solidjs/compiler`): the app's `bunfig.toml` (`[serve.static]`) and the lab's browser tests bundle with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@bible/film/stand-in`     | The one stand-in 2D context for tests (bun has no canvas): `recorder` holds a canvas's drawing state from a canvas's defaults, saved and restored whole (the transform, which `setTransform` takes as six numbers, a matrix or nothing; an alpha kept within 0..1; the shadow, font, line width and every other property set), records each fill and image, answers a pixel read with the last hex fill over it (so a face's opacity read takes the canvas's branch and `cutout` draws pre-blended faces as a render does), and with `onCall` tells a test of every call and property set (how `check --draw`'s leg, `tools/draw-check.ts`, logs a frame to check it is pure); with `measure` it sets text with a test's own advances in the context's font; each canvas it makes carries its number (`isStandInCanvas`, `made`); `withDom`/`standInDom` put up a document whose canvases are stand-ins; it refuses what a real canvas refuses (a negative radius, a colour stop off 0..1, a stop colour made of NaN or undefined, a non-finite gradient coordinate). The framework's canvas tests and `check --draw` draw into it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@bible/film/tools`        | The `film` CLI (`runFilmCli`) and its Effect services: FilmFolder and FilmRepo (`film-repo.ts`: a film's paths, and its modules loaded), ContentStore, ElevenLabs, Media (mediabunny + mpg123 + WASM AAC and FLAC + FFmpeg in-process through NodeAV: durations, decode, WAV, a person's recordings loaded and their FLAC masters, joining a film; x264 in-process for a software share copy and the review's phone copies (`x264.ts`), `jpeg.ts` for its stills), Narrator, Takes (a person's recordings), Composer, Mixer, SoundLibrary (`library.ts`: an app's `sounds/`, its candidates made, kept, rejected, imported, auditioned, checked, and its private `files/` synced through the app's private store), MediaStore (`media-store.ts`: the store interface, `put`/`get`/`hashOf`/`list`/`read` with a byte range, and the folder store), `r2-store.ts` (the R2 store, SigV4 in `sigv4.ts` through `HttpClient`), PrivateStore (`private-store.ts`: the store `library.ts` declares, reached with the `FILM_STORE_*` key read as `Config.Redacted`), Browser, Pages (`pages.ts`: the export page pool check, look and render share), PreviewServer, Renderer (`render-plan.ts` is its pure plan), RenderCatalogue (`catalogue.ts`: a film's `catalogue.json`; the domain is `core/catalogue.ts`), Stamps (`stamp.ts`: each scene's content key), `film project` (`project-cli.ts`), Checker (`check.ts` holds its pure detectors), NotesStore, the lab's routes (`lab.ts`), its studio (`studio.ts`, StudioReadings) and its source editing: SceneSources, SourceWriter (every write, its undo and redo), SceneWriter, SceneHead; FreshFilm (`fresh-film.ts`: the film CLI run again in a new process, its answer or refusal read back: options, takes, the project, the check, the studio's reading, a cue, the mix; `film read`, `read-cli.ts`); and the review (`review.ts`, `review-http.ts`): Review, and Choices (`choices.ts`, a film's options: listed, heard, picked, each read in a fresh process through `FreshFilm` and `film options`, `choices-cli.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Data

`core/schema.ts` holds the Schemas for everything a film reads or writes:
`Timed` scenes, `Beat` (a script's beat: `Timed` plus `cite` and a `picture`
brief), `Voice`, `Timings` (`narration/timings.json`), `Sound`, and
`SoundManifest` (`sound/manifest.json`). The TypeScript types derive from them.
`TimingsJson` and `SoundManifestJson` decode a file's text and encode it back
byte for byte; the request hashes (`voiceKey`, `musicKey`, `requestKey`) are
taken over Schema-encoded requests, so a committed hash stays current.
The export page's handle and what its probe records (`ExportInfo`,
`TextBox`, `InkMark`, `FaceMark`, `HandMark`, `Probed`) are declared beside
the handle in `core/export-handle.ts`; a choice point's id in
`core/point.ts`; an address as data (`Address`, `addressKey` and its inverse
`addressOfKey`) in `core/address-schema.ts`, a leaf both `schema.ts` and
`address.ts` read (`address.ts` re-exports it beside `resolveAddress`). A scene's and a short's
id is one shape, `PartId` (lower case, digits and dashes, starting with a
letter or a digit), and an act's name (`ActName`) never starts with `-`: the
film is refused at load, naming the id, when one names no address, point or
argument. A short's id and an act's name are each declared once (`Shorts`,
`Look`), so `short:<id>` and `act:<name>` each name one part.

## Tools

`film narrate|takes import|script|score|mix|cues|check|render|lookbook|project|chapters|notes|options <film>` (and `film doctor`, `film lab` (the lab and the review, every film), `film media …` over the private media store, and `film sfx …` over the app's sound library, `tools/sfx-cli.ts`) runs from the app that holds the
films. The app owns the entry: it calls `runFilmCli({ films, sounds, folders, previewServer, lab, self })`
with its films folder, its sound library folder, its own `out` and `lab` folders
(where a run writes renders and notes, whatever directory it starts in; `FILMS_OUT` and
`FILMS_LAB` win when set), a scoped `PreviewServer` layer that serves its
player page, and `lab`: where the lab listens (`at`, a `LabAt`), its pages
(`pages`, the app's HTML entries) and the roots it reviews; the framework's
server (`labServer`) answers there (see `apps/animations/cli.ts`). Logs (`Effect.log`, `event
key=value`) go to stderr, a failed command's report too (logged under the
same logger before the runtime exits, not by `runMain`'s own reporter, which
would print to stdout; a typed failure as its tag and message, a defect with
its stack); stdout carries only what a command prints, so a
failing `check --json` still prints only findings (a film that does not load is its one error finding). The player imports the same folder, so the tools
and the page never read two different films. Paid calls (ElevenLabs speech, music,
effects) go through the `ElevenLabs` service only; `mix`, `cues` and every
`--dry-run` make none. Assets are content-addressed: `ContentStore.ensure`
produces an asset only when its stored hash is stale, and every manifest
update is serialized. At most three paid jobs run at once. Failures are
tagged errors (`ApiKeyMissing`, `EncoderMissing`, ...) in `tools/errors.ts`,
and the refusals a page shows in their own words (`TakeMismatch`, ...) in
`core/refusals.ts`; `film check`'s findings, with their levels and addresses,
are in `tools/findings.ts`. Logs are `Effect.log` lines `event key=value`.
`tools/testing.ts` has the in-memory doubles the tool tests use.

`film sfx` is the app's sound library (`SoundLibrary`, `tools/library.ts`).
`make` is its one paid command: it prints each sound's candidates and
credits (40 a second), fails `PaidUnconfirmed` without `--yes`, and
`CreditsOverCap` when `--cap` is under the credits it would spend plus those
its `--tally` TSV already records; every generation is appended to the tally
as it lands. Candidates are FLAC under the git-ignored `files/<name>/`, named
by their hash, and wait in the lock until `keep` or `reject`; `keep --replace`
keeps them in place of the kept variants, and `unkeep` sends kept variants
back to wait (the lock is only ever written by these commands). `push` copies
each private file the store lacks, or holds with other bytes, reads it back by
hash (`StoreCopyFailed` otherwise), and names every file it sent (`--from
<folder>` sends a file this checkout lacks from an older folder store when its
hash matches the lock: a move between stores); `push` and
`pull` name each lock file they find nowhere (`missing`) rather than fail on
it. `try <name> --prompt/--secs/--influence --count n` is `make` for other
settings than the declaration's (paid, capped and tallied the same): its
candidates wait under their own request, and become keepable when the
declaration is changed to say the same (`TrialInvalid` for settings no
declaration could take). A sound that names no `influence` is made at its
use's default (`DEFAULT_INFLUENCE`: 0.7 for a one-shot, 0.3 for a bed) and
as `DEFAULT_CANDIDATES` (6 one-shots, 3 beds), both measured in the sweet-spot
trials (`apps/animations/sounds/PROMPTING.md`).

Preflights: `film doctor` checks headless Chrome (a page opened and closed
in Bun.WebView's Chrome: `BUN_CHROME_PATH`, else the Chrome Bun finds, else
Playwright's cached Chromium; `BrowserMissing` names `BUN_CHROME_PATH`), the `elevenlabs` CLI and its
login (`auth status`, free), the H.264 encoder a render would use (a page
chooses it as a render does; the line says `hardware` or `software`, the
default pages and the encoder budget), reports each, and fails if any is
missing. Nothing needs an ffmpeg on the machine: every media file is read and
written in-process (below), and `tools/no-ffmpeg.test.ts` fails on a source
that names `ffmpeg` or `ffprobe` as a command. `narrate`, `takes import` and `score` run the ElevenLabs check before their first paid call,
and the `ElevenLabs` service uses `ELEVENLABS_API_KEY` when the environment
or the Keychain holds one (effects need it) and the CLI's OAuth login
otherwise, one OAuth call at a time (concurrent refreshes race and fail);
and a video `render` asks a page which H.264 encoder it can encode the film's
size with (`EncoderMissing` when none) before it draws a frame.

Media files go through `Media` (`tools/media.ts`): mediabunny reads and writes
the containers in-process, and MP3 decodes through mpg123 (WASM), gapless, so
a take measures what it plays (`duration`). `join` writes a film: its H.264
segments' packets copied in order (never re-encoded; segments encoded unlike
the first fail), and its track encoded to AAC beside them through
`@mediabunny/aac-encoder` (FFmpeg's encoder built to WASM), one frame of
priming early so the MP4's edit list starts it on the first frame, into a
partial beside the film renamed over it once whole. Every byte
moves through the FileSystem service but the joined film's, which mediabunny's
`FilePathTarget` writes by position on Bun's file system (Effect's file handle
appends under Bun: its `fs.write` passes no offset, and Bun then ignores the
position). Failures are `MediaFailed`. A person's recordings arrive in
whatever format a recorder saves (WAV, FLAC, AIFF, M4A, MP3, at any rate) and
load in-process: `load` decodes any of them to one channel of 32-bit float at
the rate asked for. mediabunny opens the containers; FLAC and AAC decode through FFmpeg's own
decoders in-process (`@mediabunny/server`, NodeAV: Bun has no WebCodecs
audio decoder), an AAC's priming dropped as its edit list says; AIFF, which
mediabunny cannot read, is plain PCM read by `tools/aiff.ts`; the mixdown and
the rate change are libswresample's at its defaults (`tools/resample.ts`,
through NodeAV). `encodeFlac` writes a take as a
24-bit FLAC master through libFLAC (`@mediabunny/flac-encoder`, WASM, in a
worker; float in, one quantisation 144 dB down, no dither needed). A person's
take is the film's final voice, so it is never lossy after the recorder, and
the mix reads it as it reads a staging MP3. Staging takes stay the MP3s
ElevenLabs sends. mediabunny picks the first coder registered that can, so
the AAC and FLAC encoders and x264 (`tools/x264.ts`) register before
`@mediabunny/server`'s FFmpeg ones, which it registers with no hardware
context. Video is converted by mediabunny too: a software render's share
copy (x264, below) and the review's phone copy (720p, x264 at CRF 23,
preset medium, capped at 3 Mbps, on two threads so the review answers while
it encodes) re-encode the film with its track copied, and a review's still is a
frame mediabunny decodes, scaled by libswscale and written by FFmpeg's MJPEG
encoder (`tools/jpeg.ts`, through NodeAV).

`mix` plays `mixPlan` out through `renderMix` (the voice bus, a staging take
lifted to the speech level `takes import` sets and a person's take as
imported; the score option the film plays, `under` dB against the voice
wherever anyone speaks and `alone` dB where no one has for 3 s or more, each
levelled by BS.1770 loudness against the voice bus, ramped, and faded in and
out (`core/score.ts`); the library's beds looped over their spans, crossfaded
where they wrap, faded at each end and ducked unless the library says not,
the effects on their cues, summed and limited) and writes the film's
one track, `narration/full.wav` (16-bit), whole (a partial of its own,
renamed only once written): a failed or interrupted mix leaves the previous
track. The track's rename and its stamp are one step under `full.json`'s
store lock (`ContentStore.transact`), so two mixes finishing together never
leave one's track under the other's stamp. `full.json` stamps the key of the plan it played
(`mixKey`: every sound it plays by its file name, which carries its hash, or
its recipe, with where, how loud and at what pitch, the score option and its
levels, and the levels it masters, fades and ducks by). A bed or
effect names a library sound (`core/sfx.ts`) and a level in dB relative to
the voice; its gain comes from the level its variant measured when made
(one-shots by momentary max, beds by integrated loudness). An effect's
placements rotate through the sound's variants (never the same one back to
back while it has another), each nudged late, louder or quieter and up or
down in pitch by the sound's jitter, seeded by the film, the effect and the
placement, so a repeated sound never repeats exactly and a film always mixes
the same way. `sound.ts` may declare `seed: '<original-film>'` to preserve that
effect variant and jitter identity in another visual version; it defaults to
the current film's name. With the same resolved cues and assets, the inherited
seed gives the same effect placements and mix key. A procedural variant is its
recipe played with a seed. A
placement meets its cue with the variant's start, with its onset for an
effect that says `sync: 'onset'` (a sustained sound), or with its hit for
one that says `sync: 'hit'` (an impact): the lock's `Variant` carries
`onset` and `hit` (`describeSound` in `core/synth/analyse.ts`, recorded on
keep and by `SoundLibrary.describe`, `sfx describe`), a procedural one is
measured from its seed, and the mix starts each variant that much early
(`mix.unsynced` warns where a take has none recorded). `sfx check` warns
`TimingUnrecorded`; the film's check warns `LeadIn` on an effect placed from
its first sample whose kept take's onset is past `LEAD_IN`, 0.05 s (the
placement's finding, since only it can say `sync`). It logs
each bus's mean and peak dBFS (`mix.levels`), and `--stems` writes each bus
the film's length. A file at another rate fails as `SampleRateMismatch`: the
mix resamples only to repitch an effect's jitter. The
player streams the WAV (the preview server answers range requests);
`masterFinding` holds it to the film's length and to the plan the film
mixes to now (`AudioMissing`; `AudioStale`, `length` or `mixed for another
plan`, which an unstamped track is too): the renderer checks it before the
first frame and `check` in its static leg.

`narrate` writes each new take as `<id>.<audio hash>.mp3` and makes it current
only by rewriting `timings.json`, so no crash leaves a take and its timings
disagreeing. A take's words come from the speech model's alignment and its
length from the encoded file; a word the alignment puts past the end is held
inside the take (`core/narration.ts` `heldInside`, with a `narrate.overrun`
warning past `TAKE_TOLERANCE`), so the timings always fit their audio. The
aligner puts the pause before a word into that word's start, so each word
also carries where it is heard (`voiced`, a `TakeWord`): the first and last
10 ms window inside its aligned span over a −40 dBFS gate, read from the take
itself when it is timed (`core/voiced.ts` `voicedWords`; `narrate`,
`takes import` and the studio alike; a span no window passes holds no
voice, since the aligner put it past the span, so it is heard from the span's
end, never sooner). A mark and the long film's captions read the aligned start;
what must meet the ear (a short's captions, its hook and its loop) reads the
voice (`heard`). Heard seconds are branded (`Heard`, made only by
`voicedAt`), so aligned seconds passed where the ear is met are a type
error. It removes the takes (`.mp3` or a person's `.flac`) the timings
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
replaced is put away into `narration/attempts/<beat>/` (`putAwayTake`: a
recorded take's attempt is already there, and any other take, a staging one
or a recorded one whose attempt this machine lacks, is copied there first),
so no take is ever deleted and git drops it from `narration/` as before. A
keep made in the lab is undoable: its change carries the takes the timings
name (`Takes.named`), so Undo brings the replaced take back into
`narration/` before the timings name it again, and refuses when it is in
neither place. The check (`core/spoken.ts`
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

`render` opens the app's server, headless Chrome (`Browser`: tabs of the
process's one Chrome, `tools/chrome.ts`) and a pool of player pages (`Pages`, `tools/pages.ts`: the
one pool `check`, `look` and `render` open, bounded, a crashed page dropped
for a fresh one) in one scope; a failure in any page, or Ctrl-C, closes every
page, the browser and the server. The export page's handle is declared once
(`core/export-handle.ts`: each call's arguments and the schema its answer
crosses in): the player implements it (`player/main.ts`), the tools reach it
through one typed call (`FramePage.call`, `tools/browser.ts`), and the test
fake answers the same calls (`fakeRenderHost`, `tools/testing.ts`), so a new
call is a type error in each until it is written there. Every frame the
page draws is rastered before its clock stops (a one-pixel read), so the
draw is timed apart from the encoder: each `render.progress` line and
`render.done` say how many ms a frame went to drawing, encoding and carrying
the chunk out of the page (`draw_ms=… encode_ms=… transfer_ms=…`), and a
perf script times the draw alone with `drawTimes(frames)`. A video's
frames split into chunks (`planChunks`: about four per page, at least a second
and at most eight each, then a tail of `workers` chunks at half that size, a
quarter, and so on down to a second, so the last chunk each page pulls is its
smallest and the pages finish together) on a queue that idle pages pull from; each page draws
its chunk and encodes it with the browser's H.264 encoder through mediabunny
(`player/encode.ts`, a key frame every two seconds) into a segment of its own
(and, unless `--no-share`, a share copy from a second encoder in the same
pass), and a chunk whose page crashes is retried once on a new page. Which
encoder is data, chosen once (below). `Media.join` joins the segments in order with the track cut from
`full.wav` under the range and encoded to AAC, and the captions (`main.vtt`) are written
beside the MP4 from `captionCues`, the same line timing the burned-in captions
use. Segments are written to a temp folder of the render's own (`makeTempDirectory`), removed once joined;
a video leaves no segments under `out/<film>/`, whatever its variant. A
contact sheet is composed in one page (`player/contact.ts`). An
uncaught error in the page is a `PageError`, never a log line. A missing
browser is `BrowserMissing`, whose message is the install command.

## Project folder

A film's renders live in its project folder, `out/<film>` (git-ignored, never
under `~/film-media`), one folder per address and one name per variant:

```
out/<film>/
  catalogue.json                  what every file here is (RenderCatalogue)
  film/main.mp4                   the whole film: .share.mp4, .vtt, .chapters.txt beside it
  film/main/stills/t0003.00.png   its stills; contact.jpg and lookbook.jpg in the same folder
  acts/<act>/main.mp4
  scenes/<id>[+<id>]/<variant>.mp4
  shorts/<id>/main.mp4
```

`--variant <name>` (default `main`) renders beside `main` at the same address:
a look or score option, a lab note's `lab-<id>`. `--out file` writes a video
outside the folder and is not catalogued. A video's `--from/--to` on the film
or a short needs `--out` (`FlagsConflict` otherwise, before a browser opens):
a stretch is not the film's render, so it never replaces the address's clip
or its record. A contact sheet over a range records the seconds it drew as
its span. Every file a render leaves (the clip, its share copy, captions,
chapters, stills, a sheet) is written beside itself and renamed into place
once whole, so a failed or interrupted render leaves the last good file.

**The catalogue** (`core/catalogue.ts`, kept by `tools/catalogue.ts`) records
each render's address, variant, kind (video, stills, contact, look-book),
settings (scale, captions), files and **stamp**: the git commit (none outside
a checkout) and a content key. A render's slot is its address, variant and
kind; a new render of a slot replaces the record before it. **Stamps**
(`tools/stamp.ts`) keys each scene by what its frames are drawn from: its own
module and all it imports (relative and workspace imports; not packages under
`node_modules`), the film's frame (`film.ts`, the scene registry and all they
import, with the registry's imports of the other scenes cut, and
`@bible/film/player`), its beat as laid out and its take's timing, and, for a
scene entering on a transition, the previous scene's own modules. An
address's key hashes its scenes' keys. The key leaves out what a frame
fetches at run time, and the audio: a video's record says the sound it
carries instead (`sound`: the key of the plan its master was mixed from,
`mixKey`, and the pieces of the master it cut).

**`film project`** reviews a film scene by scene. `film project <film>
[--variant v] [--json]` prints the film's comments, then each act with its
comments and its scenes in film order: each scene's render `current`
(drawn from the sources as they are, carrying the mix the film makes now),
`stale` (its sources changed), `stale:sound` (only the film's mix changed: a
score pick, a level, a kept take, then `mix`) or `missing`; its approval
`approved`, `stale` (given on an earlier render) or `none`; and its comments,
each marked when it was made on an earlier render. `film project render
<film> [--scene id,id] [--scale s] [--variant v] [--force]` renders each scene
on its own into `scenes/<id>/`, every one through one probe and one pool of
pages (`Renderer.session`: 1 + workers page loads a run, not that a scene;
`pages.open` logs each), skips one whose render is current at the same
settings, and re-muxes one stale by its sound alone: its sound is cut again
from the master at the pieces it recorded (the renderer's master check
first), its pictures and its share copy's are copied, and no page opens
(`render.remux frames_drawn=0`, `remuxer`: media and the disk only). The run decides
every scene's need from the catalogue first; when it re-muxes any, the master is
checked and decoded once for all of them, and each scene cuts and encodes only its own piece.
Chrome starts with the first page a scene opens (`Browser.layer`), so a
run where every scene is current or re-muxed opens no browser. `film project
approve <film> --scene id,id | --act name | --all` approves the scenes'
renders, an act's current scenes, or every current scene. An approval is of
a render as it is now, so only a current one is approved: `--act` and
`--all` leave a stale or missing scene, and `--scene` naming one refuses it
and approves nothing (`VerbRefused`, 409 on the review's route, naming why it
is stale and the render that makes it current; `SceneNotRendered`, 404, for
one never rendered). Both name that render as a command to run,
`film project render <film> --scene id --variant v` (`renderCommand`). The rule is `approvalRefused` (`core/choice.ts`), which
the choices' say keeps too; `film project withdraw
<film> --scene id,id | --act name | --all` withdraws those scenes' approvals,
whatever version they were given on. `film project comment
<film> "text" [--scene id | --act name]` records a comment on a scene's render
as it is now (on the scene itself when it has no render yet), on an act, or
(with neither) on the whole film. With `--json`
each prints the project (`ProjectRead`) as one line, or its refusal as
itself (`SceneNotRendered`, `VerbRefused`, `UnknownScene`, `UnknownAct`, `CatalogueInvalid`:
a `FreshRefusal`), which is how the review runs it. Approvals and comments are keyed by address,
variant and the render's version (`renderVersion`: the stamp's key and the
mix it carries): a re-render or a re-mux leaves an approval in place, stale,
and a render that returns to the approved sources and sound is approved
again. The catalogue is a `ContentStore` manifest: each write reads the file,
changes it and writes it back whole, one writer at a time across processes
(the review, a `film project` child, a terminal's `project render`), so every
approval, comment and render record lands.

## Encoders

Segments are joined without re-encoding, so every chunk of a render must come
from one encoder. The platform names the candidates (`encoderCandidates`,
`core/encoder.ts`): the Mac asks for the hardware encoder and nothing else, a
box with no hardware path (Linux) for the software one, and `--encoder
hardware|software` for exactly the one named. The page tries them
(`encoderChoice`, `player/encode.ts`, `canEncodeVideo` with the master's
settings, and the share copy's only when it makes one in the page) and answers
`Hardware | Software | Missing{reason}` (`EncoderChoice`). The renderer opens
one page for that answer, logs `render.encoder kind=… workers=… encoders=…
cores=…`, and hands the same encoder to every chunk; `Missing` is
`EncoderMissing` before a frame is drawn. A Mac whose GPU encoder fails
therefore stops loudly instead of rendering a different look in software.
`film doctor` runs the same choice, and still prints its other lines when the
player server will not start (the encoder line then says so).

|                  | Hardware (macOS)                    | Software (Linux, any box without a GPU encoder)                    |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------ |
| Chromium flags   | `--enable-gpu --use-angle=metal`    | neither (`launchArgs`, `tools/browser.ts`)                         |
| master           | quantizer 16 (~37 Mbps)             | 37 Mbps variable, 2-frame pre-roll (13.4 Mbps, 765 MB for 7.6 min) |
| share            | quantizer 26, in the page (~160 MB) | x264 CRF 22 from the joined master (2.2 Mbps, 126 MB)              |
| encoders at once | 14 (past it the encoder hangs)      | one per core                                                       |
| default pages    | 6                                   | 8, or half the cores below 16                                      |

`SETTINGS` (`player/encode.ts`) holds both columns; the hardware one
(quantizer 16/26, prefer-hardware, a key frame every 2 s, latency mode
quality) is the look the films were made in.

### Software master: the pre-roll

Chromium's software H.264 (OpenH264) refuses quantizer rate control
("Unsupported bitrate mode"), so it encodes to a bitrate. Its first I-frame of
a session is coded at a coarse fixed quantizer, whatever the target: 21 KB
where the key frames two seconds on take 144–161 KB, keeping 0.22 of the
paper's grain against 0.62–0.66 (mean |x − blur(x)| of the frame over the
lossless still's). Every chunk is its own session, so every chunk opened on a
soft frame, one flash of flatness every few seconds. Pre-roll 8 and a 60 Mbps
target gave byte-identical I-frames, so neither the rate nor more warm-up
changes it; only being the session's first does.

So the software master pre-rolls (`SETTINGS.Software.preroll`, 2 frames):
each chunk's session first encodes the chunk's first frame twice at negative
timestamps, into a `NullTarget` output, then the chunk proper with a forced
key frame at `from`. `onEncodedPacket` drops the packets before `from` and
copies the rest, with the decoder config, into an `EncodedVideoPacketSource`
on the segment's real output. A chunk's first frame then comes out a settled
I-frame (142–162 KB), as good as the stream's own 2 s key frames. Over all 52
chunks of righteousness-by-faith, frame 0 keeps on average what the chunk's
own key frame two seconds on keeps (mean difference −0.01; 48 of 52 within
0.05 or above it; the rest are a fade from black, where the still has almost
no grain to keep, and cuts inside those two seconds). Where the paper sits
around 0.62 at every key frame (the tablets, the dark rooms), frame 0 does
too: the encoder's I-frames keep no more there whatever the rate, so no
chunk start can pass 0.75 in those scenes, and 34 of 52 do. At four chunk
starts the grain kept went 0.27→0.66, 0.30→0.62, 0.48→0.80 and 0.42→0.81.
Frames after the first are P-frames on a better reference, and measured the
same or better. The hardware path is untouched (preroll 0, the same
`CanvasSource` as before).

### Software share: x264 after the join

The share is x264's (`Media.shareCopy`, `SHARE_CRF`), since the in-page
software encoder kept the grain only at 24 Mbps (1.16 GB for 7 minutes): a
mediabunny conversion of the joined master, its video encoded again by x264
in-process (`tools/x264.ts`, libx264 through NodeAV, registered as
mediabunny's `avc` encoder): CRF 22, preset slow, tune grain, level 4.1
(preset slow's reference frames would raise it to 5.0), AAC copied, written
into a partial beside `<out>` and renamed over it once whole. The review's
derived files (a frame, a phone copy, a mix) are written whole too. It logs
`render.share by=x264 secs=…`.

x264 (core 165) spends 3.6 MB on 8 s of paper at 78–86 s and 4.0 MB at
158–166 s, the grain kept. The in-page software share at 6, 10 and 14 Mbps
(6.2, 10.1 and 12.7 MB for those 8 s) smoothed the paper flat.

Not `@mediabunny/server`'s libx264: it (through NodeAV) runs a fixed
`qp` with qmin = qmax on the default preset, with no CRF, preset or tune to
pass (`@mediabunny/server`'s `src/video-encoder.ts`), and at equal size it kept far
less grain: q23 was 444 MB and kept 0.33–0.67, against x264 CRF 23 tune
grain's 487 MB at 0.75–0.83; over those 8 s of paper, 4 Mbps (4.3 MB) and
q22 (2.7 MB) both smoothed it flat.

The share at righteousness-by-faith's 7 review frames (grain kept / SSIM Y),
beside the master it came from, measured with the same settings on x264
core 164:

| t (s) | master      | x264 share  |
| ----- | ----------- | ----------- |
| 7.5   | 0.86 / 0.95 | 0.81 / 0.90 |
| 81.5  | 0.92 / 0.92 | 0.85 / 0.90 |
| 140.4 | 0.82 / 0.93 | 0.78 / 0.86 |
| 161.5 | 0.94 / 0.91 | 0.89 / 0.88 |
| 236.8 | 0.86 / 0.96 | 0.81 / 0.91 |
| 241.5 | 0.83 / 0.95 | 0.81 / 0.91 |
| 321.5 | 0.88 / 0.93 | 0.84 / 0.90 |

One pass after the join, not per-segment passes beside the render, measured
on the Workbox (16 cores): the one-pass render took 447.5 s (pages and join
158.9 s, x264 288.6 s). x264 over the 52 segments, 4 at a time, while a
`--no-share` render ran took 324.0 s, and the render beside it slowed from
158.9 s to 385.7 s, so about 388 s in all: 60 s saved, for share segments
to join (x264's parameter sets must then match across segments) and a render
that no longer measures alone. Decided by subtract-before-you-add: the one
pass stays.

The software default of 8 pages is the knee of renders of two scenes of
`righteousness-by-faith` without the share copy, timed at each page count
(1325 frames, 16 cores, the median of 3 runs; the share is x264's after the
join, so the pages carry one encoder each):

| pages | 4    | 6    | 8    | 10    |
| ----- | ---- | ---- | ---- | ----- |
| fps   | 62.4 | 84.2 | 97.9 | 104.3 |

With the fibre on the backdrop plane (the paper grain slides with the camera
instead of a fresh screen grain each frame) the film encodes far smaller than
the one-pass render timed above (6 pages, a fresh screen grain): righteousness-by-faith (457 s, 13712 frames) rendered in 293.5 s at
8 pages (pages and join about 142 s, x264 151.8 s), the master 765 MB at
13.4 Mbps and the share 126 MB at 2.2 Mbps, keeping 0.57–0.85 (master) and
0.56–0.80 (share) of the lossless stills' grain.

## Shorts

A film's `shorts.ts` (optional; `Shorts` in `core/schema.ts`, decoded by
`FilmRepo`) declares vertical cuts: `{ id, title, spans: [{ scene, from, to }] }`,
each point a `ScenePoint`: a `{ mark }`, a named `{ cue, edge? }` or a scene
landmark `{ at }`, never a second. A span that opens on a word (a `{ mark }` or `{ at: 'speech' }`)
opens `SHORT_PREROLL` (0.1 s) before the word is heard, never before its
aligned start: the aligner gives a word the pause before it, and a short
opened on that pause starts on silence. A close stays where it is marked.
`core/shorts.ts` resolves a short against the layout on whole frames
(`resolveShort`: the spans back to back, each `{ scene, from, to, at }` in film
and short seconds), or fails with `UnknownScene`, `UnknownMark`,
`UnknownCue` (each `by: 'short "<id>"'`) or `ShortSpanEmpty` naming what the film has; `--short`
naming no short is `UnknownShort`. `shortPieces` maps a range of the short to
the film stretches under it.

The page is a `Film` of its own (`canvas/short.ts`, `createShort`), so the
player, the export handle and the worker pool serve it unchanged: the app
spreads `shortPages(name, load, shorts)` into its registry, one page per
short under `<film>/shorts/<id>` (`shortKey`). Each frame is the film's own
frame at the film time under it, drawn full size into a band and copied onto
a 9:16 page at the film's density (`shortPage(1920)`: 1920×3414), which the
encoder scales to 1080×1920 through the same `--scale` path; so a crop of the
band is, pixel for pixel, a `render --stills --no-captions` still at that film
time. The page is stacked by `SHORT_LAYOUT` (`core/shorts.ts`, 1080×1920 px,
data the checks and the lab read): the short's `hook` centred on y 445 at
most 800 px wide, set from frame 0 and faded out by 2.8 s (`hookAlpha`); the
band from y 620; the captions centred on y 1318. Round the band the page is
the film's paper under its own vignette, made once at the page's size, and
the film's grain laid over the paper only (`grainRect`), so nothing touches
the band. `Film.look` carries the film's paper, shade, finish and `short`
style (`ShortStyle` on `FilmSpec.short`: the hook's and captions' fonts and
colours, sizes in 1080×1920 px, checked by `createFilm`). The
renderer resolves the short again on the page's fps, cuts `full.wav` to its
pieces (`splice`, a `JOIN_FADE` of 10 ms each side of a join only), and
writes `out/<film>/shorts/<id>/main.mp4` and `main.vtt` (`shortCaptions`: the
phrases the page burns in, as it shows them).

A short's captions are phrases, not the film's lines (`core/phrases.ts`):
`shortPhrases` takes each span's words, timed by the voice (`heard`: a word
shows when it is heard, not when the aligner starts it), breaks them at
every sentence end (`.`, `?`, `!`) and voice turn, then at clauses (`,`,
dashes, `;`, `:`, `…`), and cuts each clause evenly into two to four words
(`PHRASE_MAX`). No phrase crosses a sentence end or a join, so a one-word
sentence ("Justified?") is a phrase of its own; a one-word clause joins a
neighbouring clause of its sentence unless the voice pauses over
`PHRASE_GAP` (0.3 s) between them. A phrase shows from its first word to the
next phrase's, or `PHRASE_HOLD` (0.6 s) after its last word, each moved half
a frame earlier so it shows from the frame nearest its first word. A word
between the script's “ and ” (which the take's words carry; `quotedWords`)
is quoted.
`canvas/short-captions.ts` (`burnedCaptions`) draws them centred on y 1318 in
the style's caption font, no plate, each phrase broken into as few lines of
at most 800 px as it needs and balanced (`breakLines`, so no word is left
alone); a quoted word gets a gold marker (`caption.highlight`) swept behind
it as it is read, so a quotation lights word by word. The phrases are set
once; a frame looks one up and draws it. The long film's captions are
untouched: they time each line by the aligner (`sceneCaptions`), and timing
them by the voice is one line in `core/captions.ts` (`filmCaptionTimes = heard`),
left for the owner since it moves burned-in pixels. `render --short --no-captions` leaves them out.

`film check <film> --short <id> [--zone default|ads]` holds a short to
`SHORT_RULES` (`core/shorts.ts`) instead of checking the film
(`tools/short-check.ts`, pure; `Checker.short` probes the page):

- `ShortUnsafeText`: a line of text past the safe zone, probed every half
  second and at each phrase's first frame. `SAFE_ZONES` (exported from
  `core/shorts.ts` with `safeRect`, so the lab draws the same zones) holds
  the margins in 1080×1920 px: `default` top 270, bottom 520, right 140,
  left 65; `ads` the same with the bottom 35% (672). The short's own lines
  (hook, captions; probed with the `caption` tag) are an error and fold into
  one finding per side; the film's lines in the band are a warning each,
  since the band is the film's frame and only another span moves them.
- `ShortHook` (error): the first word heard after 0.3 s; nothing in the picture
  moving by 0.5 s (probes of the open that hold still, the hook and captions
  left out, as `heldStill` does for holds); or the first frame showing the
  film's title (the film's page title, read from the film's own page). A logo
  drawn as ink is not told from other ink.
- `ShortLoop` (warning): the mean absolute per-cell luma difference on a
  64×36 grid (`SHORT_RULES.loopGrid`) of the band is over 0.08 between the
  last frame and the first (the export handle's `luma`: the frame drawn,
  then its band scaled down by the browser and read back as Rec. 709 luma),
  or more than 0.6 s of silence from the last word's voice round to the
  first's. The band is `bandOf` (`core/shorts.ts`) of the film's own page,
  the rectangle the short's page draws the film's frame into, whatever the
  film's aspect; a read with no value for every cell (no canvas to sample on)
  fails as `FrameFailed` (`lumaGrid`), never compared as clean.
- `ShortLength`: over 90 s is an error; outside 45–75 s a warning.

A short resolves on its page's frame rate (`Checker.cut`: the rate the film
declares, read from the page's `info.fps`, as the renderer does), so
`check --short`, `cues --short` and the render cut the same frames.
`--static` runs only what the words tell (length, first word, the loop's
silence), probing no frames: it opens the page once, for its rate.
`film cues --short` prints `shortReport` at that rate. A short draws at about parity with the film per frame (~0.92× of the
same frames as a 16:9 render, measured against one contiguous range): the
9:16 page costs nothing extra, and saves nothing either.

## Lab

`film lab` is the one place a film is tweaked and reviewed: one server for
every film of the app, meant to run for days (the box's `film-lab` user unit
on port 8229). It prints its link (the first `FILM_LAB_HOSTS` name over
`https://`, else where it is bound; logged `lab.ready`) and runs until
stopped, which stops the server and the routes with the command's scope. The
server is Effect's over `Bun.serve` (`labServer` and `serveLab`,
`tools/api-server.ts`): no route or development server of Bun's, so every
request reaches the gate. It serves three pages, the
app's, cross-linked: the review at `/` (below), the lab at `/lab?film=<film>`
(`lab.html`, whose entry calls `mountLab(films)`) and the player, its
look-book, at `/player?film=<film>&lookbook`. Its API is under `/api/` (The
HTTP API, below), and every other path a page serves is the framework's one
page table (`PAGE_PATHS` in `core/api.ts`; the app gives each page's HTML
entry, `LabPageSpec.pages`): the review at `/` and `/sets/*` and a film's
`/films/<film>/choices` and `/films/<film>/project`, the lab at
`/films/<film>/lab` and `/films/<film>/lab/*`, the player at
`/films/<film>/play` and a film's `/films/<film>/scenes[/*]` (its look-book),
and `/lab` and `/player` as before. A path no page declares is a 404, never
a page. `LAB_HOST` (loopback by default) and `LAB_PORT` (8229) say where it
listens; a box binds `0.0.0.0` with the names it is reached by in
`FILM_LAB_HOSTS`.

**The pages are built in the lab's process** (`LabPage`, `tools/lab-page.ts`):
`Bun.build` with `@bible/film/solid-plugin` (the `PageBundler` service, with a
test layer that reads each entry as its own page), about a tenth of a second, so
there is no build step and nothing to rebuild by hand. A page is built when
first asked and again when asked after a file the last build read has
changed: the folder of every file the last build read (outside
`node_modules`) is watched, the set following each build: the entries'
folders from the start, and after a failed build also the folders of the
files the bundler named, so a first build that fails still hears its fix. A
folder still read keeps its watch; a file read in a newly watched folder
or new to what it read, that changed from a second before the build began
counts as a change. Each change to a
file a build read is one more build (a render, a mix or a note is none). A page links its scripts and styles from the root (`/chunk-….js`,
`publicPath: '/'`), so a page served under a film's path finds them; a
request is answered as a narration file when it is one
(`/films/<film>/narration/<file>`), then as a built file, then as the page
its path serves. Every page is stamped with its build and the server that
built it (`<meta name="lab-build">`, `<meta name="lab-server">`, an id made at
start) and waits on `GET /api/review/build?since=&server=` (`PageBuild`,
long-polled, at most 60 s; another server answers at once, so a page outlives
a restart); the lab reloads at the frame it shows when a later build or
another server answers
(`lab/rebuilt.ts`), so a scene edited by hand or by an agent is on screen
with no hand on the page. The review does not reload itself (a playing set
is not interrupted); its next load is the new code. A page that does not
build answers 500 with the bundler's words and reloads once a later build
or another server answers, pausing 2 s after every other answer; a
failed build is tried again on each request (a fix may land in a folder no
build read), and one that then builds is a new build its page hears; the server
keeps serving. The pages are not rendered on the server:
the lab's preview draws the film's own scene code in the browser, so the
scripts are the page. Only the lab's server bundles Solid; the render's
server (`film render`, `check`) serves the player alone.

The framework owns the routes (the lab API, below: `labHandler` in `lab.ts`,
one web handler over NotesStore, the scene source, the studio, the review,
the choices and the project, with the pages behind the same gate):

| Route                                                 | What it does                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /api/films/<film>/notes`                         | the film's notes file; its `seq` is the cursor                       |
| `POST /api/films/<film>/notes`                        | a new note: `NotePost`, a `NoteDraft` plus the frame as a base64 PNG |
| `POST /api/films/<film>/notes/:id/reply`              | the user replies (`ReplyPost`); the note opens again                 |
| `POST /api/films/<film>/notes/:id/resolve`            | resolves it (`{}`)                                                   |
| `GET /api/films/<film>/notes/wait?since=<n>&timeout=` | the changes past cursor `n`, long-polled (at most 60 s)              |
| `GET /api/films/<film>/stills/:name`                  | a still (`n3.png`, `n3.r5.png`); any other name is a 404             |

A bad body is a 400, an unknown note a 404 `NoteNotFound`, an unknown still
a 404 `StillUnknown`, and every failure is logged.

**The studio** (`tools/studio.ts`, over `Takes`, `StudioReadings` and
`FreshFilm`) records takes from the lab through the same import as `takes
import`. The lab runs for hours and keeps each film module as it first
imported it, so the studio never loads the film in its own process: it reads
the voice, the script's `heardAs`, each beat's line and the reading sheet
fresh (`film read voice <film>`, `StudioReading` in `core/studio.ts`), kept
by `StudioReadings` under the film's source stamp (`FilmFolder.stamp`: one
fresh process after any file under the film changed, none before). A posted
recording is made an attempt here (`Takes.recordAttempt`); every keep, of
that attempt or an earlier one, is `keepVoice` (`choices.ts`), the one keep
the Choices view's voice pick makes too: `film options keep-voice <film>
<beat> <file> [--accept-mismatch]` in a fresh process (it keeps the take and
remixes), recorded by `SourceWriter.around` with the take files the timings
name and the track mixed from them (`Follows`), so it holds the writer's
lock and the lab's Undo and Redo walk it back and forth: each brings back
the take it lands from `attempts/`, remixes (`film mix <film>`, fresh; a
failed mix is logged `lab.remake.failed` and the step stands), and the lab
page reloads at its frame to play it (`readAtLoad`: the timings and the
track are read at load, so no rebuild would). A take is kept against that reading
(`VoicedFilm`, `narrator.ts`: the film's paths, voice, `heardAs` and beats,
which `takes import` makes with `voicedOf`), so a line fixed while the lab
is open is on the sheet, and a take of it current, at the next read. Its
routes are the lab API's `studio` group, under `/api/films/<film>/studio/`, behind
the same gate and for any of the app's films (another name is a 404
`FilmUnknown`). Every body and answer is a Schema in `core/studio.ts`,
over the one reading the tools use too: a beat's `Line`s
(`core/narration.ts`) and the sheet's `Part` and `SheetBeat`
(`core/sheet.ts`):

| Route                                                     | Body → answer                                                                                                                                                              |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/films/<film>/studio/beats`                      | `StudioBeats`: per beat with a line, its sheet `parts`, the file name to record it as, `state` (`recorded`, `staging`, `stale`), its take, how many attempts               |
| `POST /api/films/<film>/studio/takes/:beat`               | `TakePost` (`audio` base64, `type` `audio/wav` or `audio/flac`, `acceptMismatch?`) → `StudioTake` (the take, its `transcript`, the word error, the new `timings`, `mixed`) |
| `GET /api/films/<film>/studio/takes/:beat/attempts`       | `StudioAttempts`, newest first: each `transcript`, its word error, when, whether it is the take and whether it reads the line as it is now                                 |
| `GET /api/films/<film>/studio/takes/:beat/attempts/:file` | the attempt's FLAC (`audio/flac`), to hear it again; a name the ledger does not hold is a 404 `AttemptUnknown`                                                             |
| `POST /api/films/<film>/studio/takes/:beat/keep`          | `KeepPost` (`file`, `acceptMismatch?`): an earlier attempt made the take → `StudioTake`                                                                                    |

A take not kept answers its failure as the whole API does (below): a
`TakeMismatch` carries the beat (`id`), the `script`, what was `heard`, the
`wer` and the `attempt` it saved, which `keep` with `acceptMismatch` makes
the take ("accept anyway"); the panel's recorder holds the failure itself
and reads the attempt off the `TakeMismatch`.
A body that is not a recording, or of a media type the studio is not told how to
read (`AudioInvalid`), is a 400; a lossy one (`audio/webm`, `ogg`, `mp4`,
`aac`, `mpeg`: what MediaRecorder makes) a 415 `RecordingLossy`, since the
take is the film's master; the panel records PCM (an AudioWorklet) and posts
WAV. `TakeMismatch`, `RecordingInvalid` (a beat
with no line, silence, an attempt never recorded) a 422; a failed
speech-to-text (or `SttUntimed`) or a recording the media tools could not
read (`MediaFailed`) a 502. `:beat` is decoded and must be one of the film's
beats before a route reads a body or writes a thing: any other name (an
encoded `/` or `..` included) is a 404 `UnknownScene`. A body over
`STUDIO_MAX_BODY` (64 MiB) is a 413 `BodyTooLarge`, counted as it streams (a
Content-Length over it is refused unread; one under it is not believed). The
upload is written to a scoped temp file (`recording.wav` or `.flac`), removed
when the request ends. Takes are kept one at a time with every other lab
write (the writer's lock): the keep, the timings write and the mix after it
finish before the next keep, pick or edit begins, and the keep is undoable
(Undo names `voice <beat> keep <file>`). After a take is kept the film remixes; `mixed: false` says the mix
failed (logged) and the take stands. The server keeps a connection open
with nothing sent for `LAB_IDLE_SECONDS` (255 s, Bun's longest), past the
page's wait for a take (`STUDIO_IMPORT_WAIT_S`), so the page stops waiting
before the socket closes. An attempt plays back through `serveFile`, by byte
ranges, as a phone's Safari asks. The lab's **Studio** section records
through these routes (below).

### The HTTP API

The lab's routes (the review's among them) are declared once, as one Effect
`HttpApi`, in `core/api.ts`: every path, its params, query, body and answer, and every
failure with its status. Both ends derive from that declaration: the
server's handlers (`HttpApiBuilder.group` in `tools/lab.ts`, `studio.ts`,
`steps-http.ts`, `review-http.ts`, `choices-http.ts`, `project-http.ts`)
and the pages' one client (`LabClient`, an `HttpApiClient` of `LabHttpApi`
in `lab/api.ts`, which `lab/studio/api.ts`, `lab/review/api.ts` and
`lab/review/options/api.ts` call through) with the URLs a page puts
in an `<img>` or `<audio>` (`stillUrl`, `attemptUrl`, `reviewFileUrl`,
`reviewPhoneUrl`, `reviewFrameUrl`, `choiceAloneUrl`, `choiceMixUrl`, from
`urlBuilder`).

| API          | Served by                 | Groups                                                                                                                                                                   |
| ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LabHttpApi` | `film lab` (`labHandler`) | `notes`, `scenes` (source, head, cue, knob), `steps` (undo, redo, check), `studio`, `review` (index, file, phone, frame, duration), `choices`, `project`, `page` (build) |

**Failures cross as themselves.** A failure a route answers is one of
`Refusals` (`core/api.ts`; the classes are `core/refusals.ts` and
`core/errors.ts`), each annotated with its status (`HttpApiSchema.status`):
the one status table (`statusOf` reads it). It crosses as its JSON with its
`_tag` (`{"_tag":"SourceRefused","file":…,"target":…,"reason":…}`), and the
page's client decodes it into the same class, so its `message` reads the
same on both ends. Existing failure fields remain wire contracts:
`TakeMismatch.heard` is the transcript, `SttUntimed.heard` the transcript's
word count, and `BeatUnplaced.heard` the fraction of a beat's words matched.
Changing their keys requires a compatible codec or a coordinated migration.
A handler's failure that is not a Refusal answers 500 as
`ServerFailed` (its tag and words), logged `api.request.failed`; a param, a
query or a body that does not decode is a 400 `RequestInvalid` naming the
part and the schema's words (`{"_tag":"RequestInvalid","part":"Payload",
"reason":"Expected \"pick\" | \"unpick\" | \"reject\" at [\"verb\"]"}`),
answered by the gate (HttpApi itself would answer an empty 400); an answer
that does not encode (a handler's value its schema refuses) is the server's
failure, a 500 `ServerFailed` tagged `AnswerUnencoded`; a path under
the API's own prefixes that no route declares is a 404 `RouteUnknown` naming
the path, so a page calling an endpoint the server does not have reads a
refusal, not "no answer". A refusal names a film's file relative to the film's
folder (`scenes/hand.ts`), never a path on the box. On the page a call
fails with `LabFailure`: the server's Refusal, or `LabUnreachable` (no
answer, or one that does not decode).

**One gate.** `serveApi` (`tools/api-server.ts`) composes an API's routes
behind one global middleware, the only place a request is admitted
(`admit`): the Host must be the bound port on a loopback name or one the
server is told (`FILM_LAB_HOSTS`), a browser's `Sec-Fetch-Site`
same-origin, a write's Origin one of those hosts' with a JSON body
(`WriteNotJson`, 415) of at most `STUDIO_MAX_BODY` bytes, counted as it
streams (`BodyTooLarge`, 413). Anything else is a 403 `RequestRefused`,
logged `api.request.refused`. A new route is behind the gate by being a
route; every route answers a foreign Host 403 (`lab.test.ts` walks
`routesOf(LabHttpApi)`). Every film route names
its film, one of the app's films (`filmNamed`), and any other name is a 404
`FilmUnknown` before a handler reads a thing. The pages (`LabPage`) answer
every path outside the API's own prefix (`/api/`), behind the same gate, to a
GET or HEAD only (any other method is a 405, `Allow: GET, HEAD`). One
cross-site request passes: a link opened on another site (a GET or HEAD with
`Sec-Fetch-Mode: navigate` and `Sec-Fetch-Dest: document`) to a path of the
page table; never the API, a script or a file. A fixture's own routes beside the API's
(`labHandler`'s `beside`: the studio harness's control) sit behind the same
gate.

**To add an endpoint:**

1. Declare it in its group in `core/api.ts` with `HttpApiEndpoint.get` or
   `.post(name, path, { params, query, payload, success, error: Refusals })`.
   A write takes a JSON `payload` (`NoBody` when it says nothing). A new
   failure class goes in `core/refusals.ts` and into `Refusals` with its
   status. A new group is `HttpApiGroup.make(name).add(…)`, added to
   `LabHttpApi`.
2. Handle it in the group's `HttpApiBuilder.group(api, name, …)` in tools:
   `.handle(name, ({ params, query, payload, request }) =>
answered(Effect.gen(…)))`, naming the film with `named(params.film)`.
   Return the success value (the API encodes it), or an
   `HttpServerResponse` for a file (`serveFile` answers byte ranges). A new
   group's layer joins `labHandler`, and a service its handlers need joins
   `LabContext`.
3. Call it from the page through the derived client
   (`client.<group>.<name>({ params, payload })`, wrapped in `called` for
   `LabFailure`), or put its URL in an element through `urlBuilder`.
4. The foreign-Host test covers it by itself; add a test of what it answers.

For example, the review's project routes (`GET /api/films/<film>/project?variant=`
and `POST /api/films/<film>/project/say` `{address, say, variant?}`, each
answering a `ProjectView`: the fresh `Project`, the project folder's ref and
the video this checkout's catalogue records for each rendered scene) are one
group: `ProjectGroup`
in `core/api.ts`, added to `LabHttpApi` (its paths, under a film's
`/api/films/<film>/`, fall under the API's prefix by themselves). The address is a `PartAddress` (the
film, an act, scenes: a short is no branch of the tree, so it does not
decode, 400). `projectGroup` (`tools/project-http.ts`) runs `film project …
--json` in a fresh process (`FreshFilm.project`) and decodes its `Project`,
or its refusal into the refusal's own class and status; any other failure
the run names (a film that does not load) it prints as `ServerFailed`, its
tag and words, which the page shows as one sentence (`answering`, as
`film options` does). A say (`Say`:
`Approve`, `Withdraw`, `Comment {text}`) runs `project approve`, `withdraw`
or `comment` once; a comment's text goes after `--`, so one starting with a
dash is never a flag. Its layer
joins the `Layer.mergeAll` in `labHandler`, and the page calls
`client.project.<name>` (`lab/review/options/api.ts`).

### Studio

**The Studio** (`lab/studio/`, Solid 2 + effect-machine) is the lab's panel
for recording the final voiceover beat by beat. It lists every beat with a
line and where its take stands (`recorded`, `staging`, `stale: <why>`, with
the counts), reads the selected beat as a teleprompter (the sheet's lines, a
quotation set apart with who said it, marks stripped), and records it:

- **Capture** (`capture-browser.ts`, behind the `Capture` service in
  `capture.ts`): `getUserMedia` with echo cancelling, noise suppression and
  gain control off, one channel, the microphone picked (`enumerateDevices`;
  the choice is remembered in this browser as `film-lab-mic`, a `keptText` in
  `ViewerStore`, `browser/storage.ts`), into an
  `AudioWorklet` (`worklet.ts`) on an `AudioContext` at the device's own
  rate. The worklet hands each block of float PCM over untouched with its
  peak and RMS (the meter: dBFS, a clip warning at −1 dBFS); the page keeps
  the blocks from the count-in's end and joins them on stop. Nothing is
  resampled or compressed, and there is no MediaRecorder: `wav.ts` encodes
  the PCM as a 24-bit mono WAV at that rate, which is what is posted
  (`audio/wav`). A microphone refused is `MicDenied`, shown in the panel in
  the owner's words.
- **The recorder** (`machine.ts`) is one machine: `Idle | CountIn | Recording
| Review | Importing | Checking | Failed` on `SelectBeat | Arm | Tick | CountDone |
Cancel | Stop | MicLost | Submit | Discard | Imported | Refused |
ImportUnanswered | AcceptAnyway | KeepAttempt | Retry`. Arm pauses the film and opens the
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
machine's states. `e2e/lab/studio/studio.dom.test.ts` drives the whole panel in
Chrome with a fake microphone.

**Notes** live in `lab/<film>/notes.json` (`NotesFileJson`) with their stills
in `lab/<film>/stills/` (`FILMS_LAB` moves the root; the app ignores it in
git). The file is the source of truth: the lab server and `film notes` both
go through NotesStore, so either works without the other. A note is `{ id,
film, scene, T, local?, frame, cue?: { name, edge }, mark?, box?, ink?, text,
status, still, thread, createdAt }`, plus `seq` (the change that made it) and
`changed` (the last change to touch it). `T` and `frame` are film time as
the film was laid out when the note was made; `local` is scene-local time,
how far into `scene` it was made. The lab seeks, marks, pins and labels a
note at `local` into its scene while the film has that scene (`noteT`,
`core/notes.ts`; held on the scene's last frame if a re-take made it
shorter), so a re-take of an earlier beat does not move a later note off
its frame. `local` is an additive, optional field: notes made before it
have none and read at `T`. A click saves a pin as a zero-size
box. Every change takes the file's next `seq`, so `eventsSince(file, n)`
(`core/notes.ts`) returns each new note, reply and resolve exactly once past
a cursor (a file reset below the cursor, trashed or restored, replays its
log at its own `seq` and a wait over it answers at once, even when the log is
empty, so an open page and `--watch` keep hearing); `wait` polls the file for them (every 200 ms), so it sees a reply
the CLI wrote while the server was waiting. Each change is one
`ContentStore.transact`, as every manifest's is: written whole, one writer at
a time across processes (`notes.json.lock`, created only if there is none and
naming its holder; a lock whose holder is gone, or older than 30 s, is
broken; one held past about 5 s fails with `StoreLocked`, naming it). A
note's still is written under the same lock, before the note that names it.

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
module. The browser E2E tests (`e2e/lab/**/*.dom.test.ts`) open the real
page over a probe film in headless Chrome with the lab API faked
(`lab/fixtures/harness.ts`) and the page's clock the test's
(`lab/fixtures/clock.ts`): a count-in, a retry or a loop's playback is moved
on with `page.clock`, not waited out, and `canvas.toBlob` encodes at once
(Chromium's waits for idle time a busy page may not leave, up to 5 s). The
page is a tab (`lab/fixtures/tab.ts`) of the one Chrome Bun.WebView spawns
per test process (`lab/fixtures/browsers.ts`, with `tools/chrome.ts`). A
case's tab is a view lent from a pool and given back when the case ends, so
a case pays for a page load, not for a new renderer process and a cold
compile of the page's script (three to four times the CPU of the load): the
scripts load from one origin for every case (`asset`), so a view's renderer
compiles them once. Every tab is on an origin of its own, so cases share no
storage and no permission; between cases the view waits on an empty page,
its history, scripts for new pages and listeners dropped
(`e2e/lab/fixtures/browsers.dom.test.ts` dirties each and proves the next case
sees none of it). One fake microphone (a 440 Hz tone on input 1) every tab
hears, allowed or refused per tab. The tab answers the page's requests itself (the
protocol's `Fetch`), types and clicks with native input events, and waits in
the page on its real timers, so a file's cases run at once (`concurrentTestGlob` in `bunfig.toml`), three at a time per
worker (`--max-concurrency=3` in the E2E script: at most eight workers, one
per core on smaller hosts, and a case's timeout counts its own work, not its
siblings'). The E2E runner compiles and minifies each page's script once
per invocation, then workers read those immutable temporary files. The files
are removed after the workers exit; a direct `bun test` builds its own scripts.

**Notes** (`lab/notes/`, Solid 2): on the canvas a
click pins a point, a drag draws a box, and the Pen toggle draws freehand
ink; `n` or the **Note frame** button beside the Pen (its touch path)
notes the whole frame, Escape drops the draft. The composer shows
the scene, time, frame and the nearest cue and mark, and pauses playback.
Saving redraws the film canvas at that frame and sends it (`canvas.toBlob`)
as the still. Every lab mark lives on an SVG layer over the canvas, never on
the canvas, so a still, an export frame and a probe are the film's pixels
alone. Notes appear as pins through the timeline (the tick machinery, hover
for the text; a pin and the marks surface take native pointer listeners that go with their elements, never an `onCleanup` in a ref, which has no owner in Solid 2; a gesture the OS takes, `pointercancel`, drops the mark and writes nothing; one pointer marks at a time, a second finger is ignored until the first lifts) and in a side list with their status, still and thread,
newest first; clicking one seeks to its frame and draws its box and ink
there. The selected note takes a reply or a resolve. Two machines hold it. The
composer (`lab/notes/composer.ts`): `Closed | Marking | Open | Saving` on
`Press | Drag | Lift | Note | Cancel | Save | Saved | Failed`; the save is
the state's task (`Stage.still`, then `NotesApi.add`), so one is out at a
time, and a refusal comes back to the draft in the server's words. The feed
(`lab/notes/feed.ts`), the page's live connection to its server:
`Connecting | Live | Lost` on `Synced | Waited | Dropped | Retry | Refresh`;
it reads the notes, then long-polls `/api/films/<film>/notes/wait` past the
cursor, so the list changes the moment the agent replies; a failed read or
wait says so in the panel and connects again after 2 s (a state timeout);
a note, reply or resolve made on the page reads the notes at once. (A
scene edited on disk reloads the page at its frame through the lab's own
build counter, `lab/rebuilt.ts`; there is no HMR client.)

`film notes <film>` (`notes-cli.ts`) prints each unresolved note as one line:

```
note id=n1 seq=1 status=open scene=hand T=230.38 frame=6911 cue=topple:end mark=hand box=760,560,400x400 replies=0 still=/…/lab/<film>/stills/n1.png text="…"
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

| Route                                              | What it does                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /api/films/<film>/scenes/:scene/source`       | the scene's file and, per cue field and knob, `literal`, `absent` (added on write) or `computed`    |
| `POST /api/films/<film>/scenes/:scene/cues/:cue`   | `CuePatch` (`offset?`, `dur?`/`until?`, `ease?`, `stagger?`) → the span, the cue resolved, findings |
| `POST /api/films/<film>/scenes/:scene/knobs/:knob` | `KnobPatch` (`{ value }`, a number or `[x, y]`); answers the value read back and findings           |
| `POST /api/films/<film>/undo`, `/redo`             | puts the newest write's file back, byte for byte, or makes the newest undone write again (`{}`)     |
| `GET /api/films/<film>/check`                      | `film check --static` now, the latest change, and what Undo and Redo would do                       |
| `GET /api/films/<film>/scenes/:scene/head`         | the scene's timeline and knobs at HEAD (`HeadSource`), `codeChanged`, `sameData`                    |

A scene that is not located is a 404, a value the lab will not rewrite a 422
(so is a cue timing the scene's timeline would not resolve with), an undo with nothing to undo (or a file changed since) a 409.
A cue write is judged, and answered with the cue resolved on its scene's
clock, as the film's files now declare it with the new spans in place
(`film read cue <film> <scene> <cue> --spans <json>`, one fresh process,
before the file is touched): a line that moved or renamed a mark while the
lab runs moves the cue's answer and its judgement too. The lab's handlers run
with `LabContext` (`lab.ts`), which holds no `FilmRepo`, `SoundLibrary` or
`Mixer`, and SceneWriter's, SceneHead's and SceneSources' layers are built on
none (`lab-context.types.ts`). No module the lab runs imports a film's module
by a function either (`importFilmModule`, `libraryModule`, a computed
`import()`): `lab.test.ts` follows `lab.ts`'s imports and fails on one.

**SceneSources** (`scene-sources.ts`) finds each scene's drawing by identity,
not by name: the parser (oxc) lists every exported `drawing({...})` call in
the film's folder, the film's registry (`scenes/index.ts`) is imported, and a
scene belongs to the call whose exported `timeline` or `knobs` is the very
object the scene reads. A renamed registry entry or two files exporting the
same name cannot point a scene at the wrong literal; a scene built without a
literal (a spread, a function) is reported as not located, with the reason.
The lab locates in a fresh process (`film read sites <film>`, `locateHere` in
`read-cli.ts`), kept while the film's source stamp stands, so a scene added
or made to share a drawing while the lab runs is located as the files now
say; a CLI command, a process of its own, locates in itself
(`scenesLocatedHere`).

**SceneWriter** (`scene-writer.ts`, splices in `scene-source.ts`) re-reads the
file, replaces only the value's text (missing timing fields are added after
the fields before them), formats the new text with `oxfmt` and
reads the value back from it, all before the file is touched; then
`SourceWriter` writes it whole, only if the file is still the text the edit
was made from (`SourceChanged` otherwise). If oxfmt fails or the value does
not read back, the write fails (`FormatFailed`, `WriteUnverified`) and the file
is as it was. It refuses what
it cannot prove is a literal (`SourceRefused`: `GAP * 2`, a spread, a
computed key, a shorthand) and names it. Literal `until` objects (`{ cue }`,
`{ cue, edge }`, `{ at }`) are editable ends: a right-edge edit replaces the
whole `until` property with `dur`, keeping the rest of the scene intact.
Their members must be literal and unique, and decode against `Until`; a
computed member, spread, duplicate key or conflicting anchor is refused.
A cue write is also refused
(`TimelineUnresolved`) when the scene's timeline, read back from the new text,
does not resolve on the clock the film's files give now (the fresh `film read
cue --spans` above): an `until` span dragged past its mark would end before it
starts. A film that does not load in that run is not the write's to judge:
it lands, and answers why the cue could not be resolved. Writes run one at a time and are
uninterruptible (the reload a write causes drops its request); their undo and
redo are `SourceWriter`'s (below, "How a pick lands").

**The check after a write** is `FreshFilm.check(film, 'static')`
(`fresh-film.ts`): `film check <film> --static --allow-stale --json` in a new
process (this one imported the scene modules at start), its findings each
with its address (`FindingAddress`: the `part` it is about, an `Address`,
the film's when it is about the whole, an act's for a colour script, a
short's for a short; and the film second it starts at, when it has one),
which the lab lists. A film that does not lay out (a cue on a mark its line
lacks, a cycle, a duplicate mark) or a part the check names that it lacks
is the one finding the check reports, at its scene (`laidOut` in
`film-check.ts`), not a failed run. The static leg never mixes or opens a
browser. A film that does not load prints its failure as the one error
finding, in its own words (`FilmModuleInvalid`: `film "…": sound.ts is
invalid: …`; `answeringCheck`), as `film read voice` and `film read cue`
answer it as `ServerFailed` (`answering`). A check that does not run
otherwise (a line that does not decode, a crash, 30 s gone) is itself one
error finding, `FreshProcessFailed`, in its words.

**The editor** (`lab/editor/`, Solid 2): a strip under the timeline shows the
current scene zoomed, its words and marks, and one row per cue. Drag a cue's
body to move its offset, its left edge to move its start (offset and dur),
its right edge to move its end (dur). A cue that runs `until` a mark (or a
landmark, or another cue's edge) keeps ending on it (`dragPatch` in `core/timeline.ts`): its body and left edge move
only its offset, its start held a frame before the mark, and its right edge
sets a `dur` only when dropped off the mark. Edges snap to word starts and ends,
marks and other cues' edges within 8 px, else move by whole frames; shift
places them freely. While dragging, the frame previews the edit in memory:
an edit is resolved once, where it is made: `film.edit(scene, edit)` resolves
its timeline on the scene's own clock, `sceneClock(p)`, as `layout()` does,
and returns a `Result`: the `ShownEdit` (its cues and knobs, and the literals
they came from) or why it does not resolve (`UnknownScene`, a `TimelineError`).
The lab's stage holds each scene's `ShownEdit` and hands them to the player
whole (`Player.showEdits`), which draws every frame with them (`film.render(…,
{ edits })`, which resolves nothing and never throws for an edit; the film
keeps nothing, so the next frame draws what it is handed); an edit that does
not resolve is not shown, and the status says why. Compare with HEAD resolves
HEAD's literals over today's the same way: when they name what today's
narration lacks, it draws no layer and its line says why. The release writes. The
inspector shows the selected cue's anchor (read-only), `offset` and `dur`
inputs (for an `until` cue, `until {mark}`, `until speechEnd` or `until the end of cue "roll"` and its resolved end instead of
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
(`KnobRead.framed`); the handle sits at `framed · value`. `hearingCameras`
also takes the scene's breath (how far through its scene the frame is, and
its drift), which a camera's drift breathes by, and stamps the same
camera as authored, before its drift (`KnobRead.aimed`). A scene that frames
no camera breathes whole, the breath the outermost transform over its draw,
so a knob it reads carries the breath in its `transform` and its handle
drags in authored units all the same. A read before the
scene's first camera but drawn outside every camera would be misplaced, so
read a knob where it is drawn. A camera's target (a point knob `X` beside a
number knob `XZoom`, as `knobCamera` (`canvas/camera.ts`) reads them) is a reticle; while the
camera sits on it (the handle at the frame's centre under the framing as
authored, `aimed · value`, so the drift does not move it off) its drag moves the
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
(`GET /api/films/<film>/scenes/:scene/head`: `SceneHead` runs `git show HEAD:<file>`
and parses it with the locator and parser the writer uses) and draws the
frame with HEAD's timeline and knobs through today's code (`film.render(…,
{ edits })`, over whatever else the lab previews) on a layer over the film: wipe (HEAD left of a draggable
divider) or blink. The mode is one effect-machine (`lab/compare/machine.ts`): `Off | Wipe | Blink` on `Choose | Split | Flip`, a blink flipping itself every 450 ms by the machine's timeout. Only data can differ that way; when the file's code
changed since HEAD the panel says so, and a HEAD the server cannot give shows the server's reason.

**The look-book** (`player/lookbook.ts`) is one sheet of the whole film:
the palette (`createFilm({ palette })`) as swatches, then per scene a row of
stills at every cue's start and end and its 60% point (`sceneMoments`, the
moments `film check` samples, less the marks), each labelled with the cue
and time. The page composes it with `film.render`, so the lab shows it live
(`?film=<film>&lookbook`, a still opening that frame in the lab) and
`film lookbook <film> [--captions] [--variant v]` asks one export page for the
same sheet (`ExportHandle.lookbook`, `RenderJob.LookBook`), writes
`out/<film>/film/<variant>/lookbook.jpg` and records it in the catalogue. A sheet
laid out past Chromium's largest canvas side (32,767 px) is drawn scaled down
to fit it. It is the first page to read for a new film
and the consistency reference while its scenes are built. The command then
runs the look pass (below) and prints one line per scene (held share and
longest held run, largest face, mean luma, dark share, saturation and top
five colours), one per declared act against its target, and one for the
film.

**Light.** A scene brings its act's light into band with `light` on its
drawing (`scenesOf` lights a scene whose drawing brings none by the film's
`light(id)`, its act's), not by repainting its page: `{ color, edge?, amount? }` multiplies
the page and all drawn on it by `color` over the middle of the frame,
falling to `edge` at the corners (a pool keeps the subject lit while the
page around it dims), at `amount`. A function `(f) => Light` reads it each
frame, so dusk can deepen or dawn come up on a cue. It is laid per sheet,
before the vignette and grain, so a fade between two scenes crosses their
lights; each `color`/`edge` pair is drawn once and kept (the last
`SHEETS_KEPT`, so a light whose colour moves every frame never grows the
page), and it never reaches the probe (light is no ink). Outside a
transition a fixed light and the vignette go on as one multiply by their
product (`makeProduct`, kept by colour, edge and amount); a light read per
frame and the vignette go on in turn.

**Chapters.** An act of the film's `look` that names a `chapter` (the
narrator's question, in the viewer's words) starts a YouTube chapter at its
first scene. `film chapters <film>` prints them, `mm:ss title` a line, and a
whole-film `render` writes them beside the video as `main.chapters.txt`.
Fewer than three, a first past 00:00, or one under 10 s fail with
`ChaptersInvalid` (a render logs the reason and writes none).

## Review

The review is the lab's home page (`/`, served by `film lab`): every render
under the review's roots, compared in sync, and each film's options, picked
where they are heard. Each film on it links to its lab, and the lab to its
scenes and choices. It is the lab's server's (`tools/review.ts`,
`review-http.ts`, `choices.ts`, `choices-http.ts`) and one Solid 2 page (`lab/review/`, its
options in `lab/review/options/`), dark and made for a phone first.

**Terms.** The page uses the words of a film review room; the code keeps its
own names, and the stored and wire words stay as they are.

- **Versions** (a version stack): the renders of one address side by side on
  one clock. The code calls it a set (`ChoicePoint` of kind `render`), each
  version a variant.
- **Side by side**: the first version against one other (the view `pair`),
  offered only on a stack of two or more.
- **Comment**: a note on a version, kept in the catalogue (a `say`).
- **Out of date**: a version made for earlier sources or an earlier mix (the
  state `stale`).
- **Proxy / Original**: what a video plays. The proxy is a light 720p copy
  of a big video (the quality `phone`); the original is the file itself
  (`full`). While a proxy is still being made the page says so and offers
  the original; it never streams the original unasked.
- **Needs review / Approved**: a version's approval (`none` / `approved`);
  "needs review: an earlier version was approved" is `stale`. There is no
  "Needs changes" status yet: a comment carries it.

**A choice point** (`ChoicePoint`, `core/choice.ts`) is the one shape:
at an address in the film, variants to compare, pick, comment on and
approve. Which point it is is data (`ref`, a `PointRef`): decoded from its
id once, where the point crosses the wire, and encoded back as the id alone,
so a verb reads the ref and never parses the id back. Each variant has a state (`current`, `stale`, `missing`), whether
it is picked, the verbs its state allows (`pick`, `unpick`, `reject`), its
media (`Seen`: a video; `Heard`: alone and/or in the film's whole mix;
`Unseen`), the key the owner's say is given on, and that say (approval and
comments, from the catalogue). A level point has a knob instead of
variants. One adapter per kind lists them (`tools/choice-points.ts`, render
sets in `tools/review.ts`), and one dispatch lands each verb
(`tools/choices.ts`):

| Kind     | Id                                                   | Variants                                                            | A pick lands in                                               |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `render` | `render:<address>`                                   | an address's renders in the catalogue, or a montage's `review.json` | nothing: approved and commented only                          |
| `score`  | `score`                                              | `sound.ts`'s `score.options`, each heard as the whole mix           | `play` in `sound.ts`                                          |
| `take`   | `take:<sound>`                                       | a library sound's kept takes and candidates, at the scenes it plays | the library's keep, unkeep, reject (`library.lock.json`)      |
| `voice`  | `voice:<beat>`                                       | a beat's recorded attempts, newest first; the timings' take picked  | the timings, kept by `film options keep-voice` (then remixed) |
| `look`   | `look:<name>`                                        | `looks.<name>.options` in `palette.ts` (`ground`: now, light, …)    | `looks.<name>.play` in `palette.ts`                           |
| `level`  | `level:<bed\|effect\|score>:…`, `level:const:<name>` | none: a knob, in dB, per literal `sound.ts` writes a level with     | that literal (a constant layers share is one knob for all)    |

A look's options are levels a scene reads (`ground`: the paper's ground, `now`
at 0 drawing today's film); a render of another level is a render variant
(`--variant light`). A computed level (`PAPER - 2`) is a fixed knob, named why.

**Sets are found by record, never by name.** A folder is listed only when a
record says what its files are. A film's project folder (`out/<film>`) holds
`catalogue.json`: each address the catalogue has renders of is a set, its
variants that address's renders (`main` first, a share copy in place of its
master), each with its stamp, the owner's approval, and its state as the
record says it (`recordedNow`): stale by its `sources` when a newer render at
its address drew other sources, by its `sound` when a newer video carries
another mix (`ChoiceVariant.staleBy`; whether the newest is current against
the sources now is `film project`'s). The set page (Versions)
says it in every view, beside the variant's label: why a variant is stale
when its record proves it (`recordedStaleText`), and no state word
otherwise, never "current". A montage folder (say a
look explored by hand) holds `review.json` (`ReviewManifest`), which names its
files: `videos` and `images` (loose files to show), `docs`, and per set a title,
order, start, moments, and each variant's label, tag, verdict, notes and
`file` (by default `<clip>.<variant>.share.mp4`, then `<clip>.<variant>.mp4`).
Montage images follow their manifest order so staged scenes read in sequence;
missing images are skipped and each file path appears once. Videos and docs
remain newest first. A folder's `blurb` renders as escaped Markdown, like its
notes and docs, so scene lists and judging instructions stay readable.
Optional `downloads` names file links relative to the montage, in authored
order. Use it for a native master or another artifact to save: explicitly
declared downloads are served with byte ranges even above the 600 MiB
inline-video limit. Downloads alone get no player, poster or phone copy;
inline video declarations retain the existing video and phone-copy limits.
Missing downloads are skipped, duplicate paths appear once, and links retain
the review's root and symlink checks.
A file neither record names is not listed; nothing reads a file name back.
A film's page plays its newest whole-film render as the catalogue records it.

**The roots.** `FILM_REVIEW_ROOTS` (comma-separated, each `label=path` or a
bare path) replaces the app's own roots (every checkout's `out/`);
`FILM_REVIEW_EXTRA_ROOTS` adds to them. Every route names a file by its ref
(its root's label, then its path under the root), never a path on the box.
Derived files (frames, 720p phone copies of big videos, option mixes) are
kept in `FILM_REVIEW_CACHE` (`~/.cache/film-review`); `FILM_REVIEW_PHONE=off`
makes no phone copies.

| Route                                                                           | What it answers                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `GET /api/review/index[?fresh]`                                                 | `ReviewIndex`: every folder with something to review, newest first  |
| `GET /api/review/files/<ref>`, `/api/review/phone/<ref>`                        | the file, or its phone copy, byte ranges answered 206               |
| `GET /api/review/frame?ref=&t=&w=`, `/api/review/duration?ref=`                 | a JPEG of a video at `t` s, `w` px wide; its length                 |
| `GET /api/films`                                                                | `ReviewFilms`: the app's films                                      |
| `GET /api/films/<film>/choices`                                                 | `FilmChoices`: the film's renders (the pictures) and its points     |
| `POST /api/films/<film>/choices/pick`                                           | `PickPost` `{point, variant, verb}` → `ChoiceWrite`                 |
| `POST /api/films/<film>/choices/knob`                                           | `KnobPost` `{point, value}` → `ChoiceWrite`: the level written      |
| `POST /api/films/<film>/choices/say`                                            | `SayPost` `{point, variant, say}` → `FilmChoices`, the say recorded |
| `GET /api/films/<film>/choices/alone?point=&variant=`                           | the variant's own file (a take, a voice attempt)                    |
| `GET /api/films/<film>/choices/mix?point=&variant=`                             | the film's whole mix with that variant in place (m4a)               |
| `GET /api/films/<film>/choices/check`                                           | `SoundCheck`: `film check --sound` as the film now stands           |
| `GET /api/films/<film>/project`; `POST …/say`                                   | `ProjectView`, read or written by a fresh `film project` (above)    |
| `GET /api/review/build?since=&timeout=`                                         | `PageBuild`: the pages' build, once past `since` (at most 60 s)     |
| `POST /api/films/<film>/undo`, `/redo`; `GET /api/films/<film>/check`, `/steps` | the lab's own, for the film named; `steps` its undo and redo alone  |

**How a pick lands.** Every write goes through the one `SourceWriter`
(`source-writer.ts`), the lab's knob and cue writes included: it reads the
file, makes the new text, formats it with oxfmt through stdin, verifies it
(the edit reads back as meant), and swaps it in only if the file is still as
it was read (compare and swap, under the file's store lock, so another
process's store write, `sfx make` on the library's lock say, never lands
between the comparison and the write and is lost), then runs
`check --static`. A score or look
pick splices the one `play` string literal, and a knob its one level
literal (`choice-source.ts`, through oxc); a
take's act runs the library's own `keep`, `unkeep` or `reject` on the lock,
the writer recording the lock's bytes before and after and leaving the lock
as oxfmt does (the library's own JSON writer spreads short arrays the
formatter keeps on one line), so the diff is only the pick; when another
writer changed the lock after the act, its write stays and the lock is left
unformatted. A write that
changes nothing answers `(already so)` and records nothing. Each film keeps
its own undo and redo stacks (50 deep): Undo puts the newest change back byte
for byte, only while the file is exactly as that change left it (else
`UndoUnavailable`, a 409); a new change drops what could be redone. The file a change
touched is named relative to the film's folder (`sound.ts`,
`../../../sounds/library.lock.json` in the app).

**No per-placement pin.** A take is chosen for the whole sound, not for one
placement: the library's kept variants are the picks, and they rotate
through the sound's placements. Pinning one take to one placement would put
a second pick for the same sound in a second file (`sound.ts` beside the
lock), and the two could disagree: a take rejected in the lock while a film
still pins it. When one moment needs its own take, it is its own library
sound (`paper.page.hush`), placed there, and picked the same way.

**Mixes.** An option's mix is the film's whole mix (`Mixer.render`) with
that option playing (a score) or only that take at every placement of its
sound (`RenderOptions.take`), encoded AAC and cached under a key of the film,
the option, the take and the film's source stamp (the newest file under its
folder, the library's module and its lock). A mix renders the whole film (45–55 s for
righteousness-by-faith on the box under load), so mixes are made one at a time in the
service's scope, not the request's: a page that stops waiting leaves one
running, the next ask joins it or finds it made, and the page's `<audio>`
asks again when its load fails. Their URLs name the option, not the source, so they
are served `no-cache` and revalidated; the page asks again after each write
(`?v=`). The review imports no film itself: a process keeps the modules it
imported as they were, so each read of a film's options or checks, each mix,
and each keep, unkeep or reject of a take runs the film CLI again (`film
options list [--check]|mix|take|keep-voice`, `film check --json`, `film
project --json`: `FreshFilm` in `fresh-film.ts`, through the app's `self`),
and a hand edit to `sound.ts` or to a prompt in the sound library shows on
the next read. The type says so: the lab's handlers run with `LabContext`
(`lab.ts`) and `Choices` is built on `ChoicesNeeds`, neither of which holds
`FilmRepo` or `SoundLibrary` (`lab-context.types.ts` fails the typecheck if
one joins). The film's folder (`FilmFolder`: its paths, the
app's films, the sounds folder) is all the review reads of a film in
process. The points a film read at its source stamp are kept (`Choices`,
a cache keyed by film and stamp), so a pick checks its point against them
and a pick costs one fresh run, `options list --check` for the page's answer,
not three. A film is named in a route as one of the
app's films (`filmNamed`): any other name is a 404 listing the films, never
a path. `/api/review/files/<ref>` answers only what the index lists (a video, an
image or a doc where a walk looks, or a file a manifest names). Lengths,
frames and phone copies are the Media service's (`duration`, `still`,
`phoneCopy`), and a mix is written as an m4a by `writeAac`.

**The remote surface.** The lab is served where the owner reaches it from
a phone, so `LAB_HOST` defaults to loopback and a box's unit binds
`0.0.0.0` with the names it is reached by in `FILM_LAB_HOSTS`
(comma-separated Host values as the browser sends them, port included:
`bite-cristian.exe.xyz:8229`). Every request passes the API's one gate (The
HTTP API, above), the pages and their scripts included: the app's server has
no route of its own, only `labHandler`, which admits first and then hands what
is not `/api/*` to the pages (`LabPage`, above). A Host
that is neither the server's own nor one of those is a 403 (DNS rebinding),
and so is any request a browser marks cross-site (`Sec-Fetch-Site`), but a
link opened on another site to one of the pages. A write
must also carry an `Origin` of one of those hosts (`http://` or `https://`)
and a JSON body: another origin is a 403, a text/plain body a 415 (so a form
on another site cannot post), a bad body a 400. The scene editor, the notes and the studio are behind the
same gate: a write from a phone on one of those hosts is the lab's write. The
studio's microphone needs a secure context (`https://` or `localhost`), so a
recording is made on the box's own browser or through an HTTPS name.

**The page** (`lab/review/`): `<Root>` holds the runtime (the review's
routes and the options'), where the page is (`?folder=`, `&set=`, `&view=`,
`?film=`, `?project=`; kept in the URL, so Back and a reload work), the index, the films,
the quality (Proxy or Original) and the lightbox. A set's page holds two
effect-machine actors: the synced player (`machine.ts`: `Paused`, `Playing`,
`Scrubbing`, `Buffering`; one clock, the first variant's; one sound heard)
and the view (`All`, `Pair` shown as Side by side, `Moments`, `Notes`; a set of one
version has no pair, and a link asking for one opens All). `sync.ts` is the driver
that makes every media element (a `<video>` or an `<audio>`) follow the
player: it puts drifters back on the clock, holds all while one stalls, and
unmutes only the one heard. A film's page (`options/`, `<FilmProvider>`)
puts its newest render on that player, muted, and one `<audio>` of the mix
heard over it: 🔊 on a variant heard in place (a score option, a take) swaps
it, and it joins where the clock stands. A point's marks jump the clock
there. Every point is one card (`options/choice.tsx`): its variants with
their verbs (Pick, Unpick, Reject as the state allows), a hear-alone player,
approve (a current variant only: `Choices.say` refuses a stale or missing
one with `VerbRefused`, 409), withdraw once approved, and a line to
comment; a level point's knob is a slider, written on release. Every say is
one `POST …/choices/say`, answered by the film's choices with it recorded,
which the page shows as they are. Undo and Redo say what they would undo or
redo (`Undo score play brass`); the film's static check shows under them,
the one the write answered, and after a pick or a knob `film check --sound`
runs (`GET …/choices/check`) and its findings show beside it. A write is
shown from its answer: the page reads nothing again but the undo and redo
(`GET …/steps`, no check) and, after an undo or a redo, the choices. The
answer updates the player in place: the picture's `<video>` stays the same
element while the film has a picture, so a playing film plays on through a
pick, a knob or a say; only a source write asks for the mix heard again.

The project view (`?project=<film>`, `options/project.tsx`) is the film by its
address tree, film → acts → scenes → layers, with the same card, the same
say and the same words at every level: the film's comments, "Approve all
current", "Withdraw every approval" and its choice points, then each act (its
comments, "Approve the act's current scenes", "Withdraw the act's approvals",
its points) and its scenes; a withdraw is offered while a scene of the part
holds an approval (an earlier version's too). Each scene is a render
card: the video this checkout's catalogue records for it (`ProjectView.videos`,
never another folder's of the same film), showing a still of itself
(`/api/review/frame`, as a folder's cards do) until it is played, its state (current; stale by its
sources, or by the film's sound alone; missing, with the command that renders
it), its approval (approve a current render, withdraw an approval), its
comments (a missing scene takes one too), a link to its Versions, and
the points placed at it. Each point sits once, at the narrowest part holding
every scene it plays in (a scene, an act, else the film), folded under it; a
scene links the layers that play in it but sit elsewhere, and a link opens
where the card is. Each say answers the fresh `ProjectView`, which the page
shows in place (a playing clip plays on, a half-typed comment stays); a
source write reads it again (`data-reading` on the film while it does). The
answers land in any order, so the page shows the newest asked
(`lab/review/asked.ts`): a read asked before a say and answered after it is
dropped, a say answered after a read asked later reads the project again, and
so does an approve refused (`VerbRefused`) because a scene went stale since
the page read it. The choices page keeps its choices the same way. Each control writes on a
run of its own (`useWrite` in `lab/review/loaded.tsx`: a verb, a knob, an
approve, a comment box, Undo, Redo): it waits, disabled, until its own
answer lands, while every other control stays free, and a write sent
meanwhile neither cancels it nor hands it its answer. A write's answer
reaches the page only as `Landed` (`asked.ts`): what it says of the choices,
the check or the project shows only where no write asked after it has shown
its own, so a clean check landing late never hides a newer warning. The
status line counts them all ("writing…" while any is out, else the newest
asked of those answered, so an older success never hides a newer failure). A say box
empties only once its own say is said
(`SayBox`: each say answers whether it was): a comment whose say fails (the
film mid-edit and not loading) stays in its box beside the failure.

## Check

`film check <film>` fails (after reporting every finding, not the first) on
what a review used to find by eye. It runs in legs (`tools/film-check.ts`),
each typed by what it needs: the static leg (`staticLeg`: the film's files,
FileSystem and Media), the sound leg (`soundLeg`: the mix, Mixer), and the
layout and look legs (`layoutLeg`: the browser, Checker and Looker), and the
draw leg (`drawLeg`, `tools/draw-check.ts`: the film's `film.ts` built from
its committed timings and each scene drawn in this process into the stand-in
context at its moments, as every-scene-draws runs it in the gate).
`--static` runs the static leg alone, with no mix and no browser: it is what
the lab runs after each write. `--sound` adds the sound leg, still with no
browser. `--draw` adds the draw leg instead: `DrawThrew` (a scene that
throws), `FrameImpure` (a cue start or 60% point that, drawn after the frame
after it and after the frame before it, leaves different calls), and the
warning `InkOverFace` (a visible stroke or line of text drawn after a face the
viewer sees, `seenFace`: its scene's own, mostly opaque, centred on the frame,
the one rule `FaceSmall` measures by too; through `FACE_CORE` of its radius; a kit declares a face with `probeFace`
once its person is drawn, so the person's own features, headwear and hands
come before it; fills, the caption and a stroke that `marks` a line are not
read, and a gradient glow is invisible to the probe). With neither, all of them run. Every finding comes back in one
`Report` (`tools/findings.ts`): levelled by `levelOf` (one exhaustive
table, `--allow-stale` included) and addressed by `addressOf` (its scene and
the film second it starts at; a finding about the whole film has neither).
`--json` prints each as a `CheckLine`, `{ level, tag, message, address? }`.

- **Static** (no browser, `--static`): a named cue that ends after its scene
  (`CueLate`); a sound cue naming an unknown scene, cue or mark; a score movement
  out of film order or under 3 s (`MovementTooShort`); a take that is missing or
  was recorded for other text or another voice (`TakeStale`); a generated
  sound whose request hash has moved (`AssetStale`); once every take is
  recorded, an audio master that is missing (`AudioMissing`), not the
  film's length or mixed for another plan than the film's now (`AudioStale`:
  a score pick, a re-take or a moved effect since the last `mix`). `--allow-stale` reports stale takes, sounds
  and master as warnings. `--scene id,id` or `--act name` limits the
  layout leg to that address's scenes. Every command that takes a part of
  the film (`render`, `check`, `cues --short`, the look pass) names it as
  one `Address` (`core/address.ts`: `Film`, `Act`, `Scenes` or `Short`;
  `addressOf` from the flags, two at once an `AddressConflict`) and resolves
  it once with `resolveAddress` into a `Scope`: its placed scenes, its span
  in film seconds (an act or scenes; none for the film or a short), the acts
  it covers whole, and its short. A name the film lacks fails there with
  `UnknownAct`, `UnknownScene` or `UnknownShort`, and scenes the film does
  not play one after another (`--scene a,c` with `b` between) with
  `ScenesApart`: a part is one stretch, so its span, its render and its
  stamp cover exactly the scenes named. `sceneAt(placed, T)`
  (`core/layout.ts`) is the one rule for the scene playing at a time: the
  last to have started, within `SCENE_EPSILON`. A sound never generated
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
- **The ending and the air**: the stretch after the last word under 20 s, or
  an end card (a last scene that speaks nothing) under 5 s, is an `EndShort`
  warning (static). Once every take is recorded, the sound leg renders the
  mix the film makes now in memory (not read from `full.wav`, which may be
  stale) and reads it in 50 ms windows, its sides' power summed as a listener
  hears it (`windowPowers`): a run under −60 dBFS longer than
  1.5 s is `DeadAir`, an error, less any span a cue declares with
  `silence: true` (`{ at: 'start', offset: 2, dur: 3, silence: true }`),
  the designed silences the script means. The same mix is held to the
  balance, as warnings: a master more than 3 LU off −18 LUFS
  (`MasterLoudness`: a hot peak held the mastering lift back), and an effect
  whose loudest 50 ms comes within 3 dB of the voice around it (`EffectHot`).
- **The look pass** (headless pages, `looker.ts`, measures in `look.ts`):
  every scene drawn at 2 fps and shrunk to a 64×36 thumb (the research's
  measure). A second holds when both its half-second steps change the mean
  grey by under 2 (paper grain and boil alone score 0.5–2); a spoken, drawn
  scene held for over 40 % of its seconds is a `HeldShare` warning naming
  its longest held run. A kit's person declares its head with
  `probeFace(ctx, x, y, height)`; a spoken scene whose largest face (seen at
  over 0.5 opacity, its centre on the frame) never reaches a third of the frame's height is
  `FaceSmall`. A floating hand declares itself every frame, at rest or at
  work: `floatingHand(ctx, root, g, style, hand, { over, body })`, given
  whether it is drawn over its figure and the figure's silhouette (`HandBody`),
  calls `probeHand(ctx, { side, shoulder, at, to, size, radius, reach, grip,
formed, over, body })` from what it knows (its side from `root.away`, where it is, where
  it works (its rest, with no work), its mitten's size, the figure's reach
  radius, how far it has travelled, the grip it works with as shares of each
  grip (`GripShares`: `grip`, or `was` changing into it) and how far that
  grip is formed from the open rest), so any film's hands are checked; it
  is declared even while its alpha hides it. A kit builds the body only
  while `probesHands(ctx)`, so an unprobed frame pays one lookup. Then the hands pass: between two samples of a scene across
  which any hand travels to or from its work, changes its grip at work, or
  comes or goes at work, every frame is drawn again (`handSpans`); a hand
  (found a frame on by its shoulder, within 24 px) that moves about its
  shoulder by more than 1.5 of its length, changes size against its reach
  by more than a quarter, or, formed, swaps more than half of its grip
  (`GRIP_JUMP`: a grip written `raised < 0.5 ? 'hold' : 'palm'`, where
  `was` and `change` on a named cue would morph it) between adjacent frames
  while seen is a `HandJump` warning; each is measured in the figure's own
  reach, so a pan, a zoom or the whole figure scaled is no jump. A hand sent to a target farther from its shoulder than
  the reach, seen, is `HandFar`, one per scene and side. A hand at work
  (travelled 0.9 or more, seen at 0.5) inside its own body's silhouette and
  drawn behind it is a `HandHidden` warning, one per scene and side; a far
  hand passing behind the body on its way to work in front is travel, not
  hidden. `film.ts` may export a `look` (`Look`: acts in film order, each
  `from` a scene, with a `name`, a `chapter`, and `luma`, `saturation` ranges
  and a `dark` share ceiling); over the whole film each act's measure outside
  its target is a `ColourScript` warning. Which scenes an act holds is one
  rule in `core/acts.ts`: `membersOf(parts, ids)` gives each part its scene
  until the next part's, the first reaching back to the film's first scene,
  and fails with `UnknownScene` or `PartOutOfOrder`; `stretchesOf` adds their
  seconds (the first starting at 0), which the score's `movements` read too,
  so a misnamed or out-of-order movement fails as an act does. A film lights its scenes from the same
  acts. The look pass judges only the acts its address covers whole (the
  film: all of them; `--act`: that one; `--scene`: none): an act measured
  on part of itself is not the act.

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
declared card).
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
`{ start, end, dur, ease }`) and returns a `Result`: a film that does not lay
out fails as a value (`LayoutError`) naming the scene and the cue:
`UnknownMark` or `UnknownCue` (with `by`, the cue that named it, and `known`,
what the scene has), `CueCycle`, `UntilBeforeStart`, `WordMissing`,
`DuplicateScene`, or a line that does not parse (`DuplicateMark`,
`TurnInvalid`; `parse(scene, text)` returns a `Result` too). The browser
turns it into a thrown error once, at load (`createFilm`). Every point in a
scene resolves through one function: `pointOn` in `core/timeline.ts` (on a
`SceneClock`), and `pointIn(placed, point, by)` in `core/layout.ts` over a
placed scene. A timeline anchor becomes a `ScenePoint` (`anchorPoint`:
`after` a cue is its end, `with` it its start), as a short's span and a sound
cue already are. A span that `ends: true` ends at its anchor and starts its
`dur` before it. A mark anchor may pin to a word instead of the mark:
`{ mark: 'gift', word: 'faith', dur: 0.6 }` starts on the first word said at
or after `{gift}` that reads `faith` (`wordAfter`/`readsWord` in
`core/narration.ts`, normalised by `normalizeWords` as the take check's word error is: any case, apostrophes dropped, each hyphenated part, accents kept, NFC). `film check` warns `WordPinFar` when the pin lands more than `PIN_REACH` (one) sentence past its mark, where a re-take that lost the word would have moved it. It warns `DurOnWord` (`durOnWords`) where a `dur` of `DUR_MIN` (1 s) or more puts its hand-sized edge (its end, or with `ends` its start) within `DUR_ON_WORD` (80 ms) of a phrase edge of its take (a word heard after, or before, a pause of `PHRASE_GAP` or more, or the take's first or last word): a length sized to this take. It is a report only; the fix is `until` a mark or a word pin. It warns `CueTwin` (`cueTwins`) where a scene declares one moment twice: two cues with the same edges on the same anchors (each `with` and `after` followed to the mark or landmark under it, so `{ with: 'dark', dur: 0.9 }` at `dark`'s length and ease is `dark`) and the same ease, stagger and silence; read the first where both are read. A line that never says it
there fails the layout with `WordMissing` (`core/errors.ts`), which the tools'
`placeFilm` fails with as itself (`PlaceError = LayoutError`),
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
`film/span-ends-on-anchor` (`lint/span-ends-on-anchor.ts`) refuses a span
that lands on its anchor written as `offset: -0.5, dur: 0.5`: it is
`{ mark: 'true', dur: 0.5, ends: true }`, its length written once. It refuses
too a part that ends on another cue's end only because the numbers add up,
`{ with: 'speck', offset: 0.49, dur: 0.68 }` beside a `speck` of `dur: 1.17`
(a drag of `speck` leaves it behind): it is `{ after: 'speck', dur: 0.68,
ends: true }` (it keeps its length) or `{ with: 'speck', until: { cue:
'speck' } }` (it keeps its start).
`film/no-ease-on-cue` (`lint/no-ease-on-cue.ts`) refuses `ease.X(f.at(cue))`
(or a const bound to one): `f.at` is already eased by the span's `ease`, so a
second curve is one the lab's picker cannot change, and a push whose zoom
takes it runs on another clock than its x and y. A push is a `shotPath` stop
with `pushInto`; another curve is its own cue or `f.keys`.
`film/no-cue-remap` (`lint/no-cue-remap.ts`) refuses a cue split by a
fraction written in the draw, `clamp(x * 4)`, `Math.min(1, x * 4)`, `clamp(x / 0.6)`,
`clamp(3 * x - 2)` or `clamp((x - 0.75) / 0.25)` over a cue's progress `x`
(`f.at(cue)` or a const bound to one): the part is a cue of its own,
`{ with: 'answer', dur: 0.4 }` or `{ after: 'into', dur: 0.1, ends: true }`,
which the lab can reach; a part that runs to the cue's end, `(x - a) / (1 -
a)`, is told to land there, `{ after: cue, dur, ends: true }`. It refuses a step part way through a cue the same
way, `x < k` (`<=`, `>`, `>=`, either way round) with `k` between 0.02 and
0.98: the instant is a cue of no length, `{ with: 'sit', offset: 0.056, dur:
0 }`, read as `f.at('colour') > 0`. A comparison nearer 0 or 1 asks whether
the cue has begun, is seen or is done, and passes. An instant the drawing's
own shape makes (a card that flips shows its other side once edge on) is
read from the shape, `Math.cos(f.at('flip') * Math.PI) < 0`, which no
comparison of a share refuses and a drag cannot leave behind.
`film/framing-is-a-knob` (`lint/framing-is-a-knob.ts`), on a film's scene
files, refuses a framing written out (`{ x: 1060, y: 580, zoom: 1.18 }`) or
blended by hand (`zoom: lerp(1, 1.12, f.at('hold'))`, `cam.zoom = lerp(…,
ARK_IN, …)`, a camera spread from another with a field blended over it,
`{ ...cam, zoom: lerp(cam.zoom, 1, roof) }`): a framing is knobs read with `knobCamera`, a move a
`shotPath` of them, a held push `pushOn` with a number knob. The unmoved
frame (`UNMOVED`, `canvas/camera.ts`, whose numbers the rule reads) and a framing derived from the scene's geometry (a point that is not
two numbers) pass; one shared across scenes lives in a set file.
`film/no-point-free-log` (`lint/no-point-free-log.ts`) holds the tools too,
over all of `packages/film` and `apps/animations`: a variadic logger
(`Console.*`, `console.*`, `Effect.log*`) handed point-free to a callback that
is passed an index (`Effect.forEach(lines, Console.log)`, `xs.map(console.log)`)
prints the index after each line, so a reader of `film notes --watch` gets a
field that is not there. Write `(line) => Console.log(line)`.
`film/no-read-once` (`lint/no-read-once.ts`) holds the lab's browser tests
(`*.dom.test.ts`): a test waits for the value it asserts through
`src/lab/fixtures/settled.ts` (`textIs`, `textHas`, `textsAre`,
`attributeIs`, `attributesAre`, `valueIs`, `countIs`, `evaluates` for a
script's answer, `waitFor`, `attached`, `until`), and a read that times out
fails naming what it wanted and what the page last showed. A one-shot read
(`textContent()`, `inputValue()`, `$eval`, `$$eval`, `isVisible()`,
`getAttribute()` or `count()` on the page or a locator, and an `evaluate(…)`
whose answer `expect` asserts or a matcher compares with, followed through a
`const` bound to it, a local helper that answers it, a part of it, a
literal that holds it and a value computed from it, as `after - before`)
takes whatever the page had drawn at that instant, and
is refused. An `evaluate` run for what it does is an action, and so is one
whose kept answer only a wait reads (a baseline the page keeps).
`film/spawn-budget` (`lint/spawn-budget.ts`) holds every test of
`packages/film`: a test whose body spawns a process (`ChildProcess.make`,
`Bun.spawn`, `Bun.spawnSync`, or a function of the same file that does) gives
its timeout in milliseconds as its last argument: a cold start's time is the
machine's, and bun's default 5 s fails a loaded one.
A spawn inside a service the test provides is not seen.
`film/no-history-comment` (`lint/no-history-comment.ts`) holds every comment
in `packages/film` and `apps/animations`: a comment says what the code does
today and why, and how it got here lives in the ledger and `git log`. It
refuses the forms history takes on its face: a loop pass by number, a batch
id, a commit hash, and "used to" said of what the code did (not "is used
to"). History told in other words is the sweep's to find.
`lint/plugin.test.ts` runs oxlint over the marked fixtures: every RED
location must report its rule, with no extra findings. Representative
diagnostics for all eleven rules also assert the corrective message,
including the distinct anchor-end and cue-part repairs, so a rule that
fires but gives the wrong advice fails the fixture suite.

The package's `test` script runs the unit tests under `src/` and `lint/`.
The root `test` and `gate`, including the CI gate, run this browser-free
suite. E2E files live separately under `e2e/`, so those paths do not discover
or execute them. Their source remains linted and typechecked.

Run `bun run test:e2e` from the repository root or this package to exercise
the real browser workflows and canvas pixel checks. The E2E script uses
`src/lab/fixtures/run-suite.ts` to compile fresh browser bundles and run
`bun test --parallel --no-isolate --max-concurrency=3 --timeout 20000 e2e`.
The runner caps workers at eight, or the host's core count when smaller;
each keeps its module registry and Chrome across files. Test files restore
the global state they change. E2E cases retain native input, actual browser
recording and pixel assertions. This command is independent of the gate.

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

## Painted plates

A shot can be a moving painting rather than a cutout: plates at depth in a
`multiplane`, each painted once, and a slow eased camera through them.

- `canvas/paint.ts`: `drawPainting(ctx, painting, x, y)` paints a `Painting`
  (a `guide` drawn flat, then brushed over by its `Brush`: stroke layers from
  coarse to fine, laid along the guide's edges or the brush's `flow`, a
  `hatch` in the deep shade). Seeded and cached per declaration, so a frame
  only draws the finished plate.
- `canvas/atmosphere.ts`: `motes` (dust, embers: seeded, drifting, twinkling)
  and `rays` (soft light shafts from a point), plus seeded `rain` streaks and
  `stars`. Each is computed from the current time, with no frame history.
- `canvas/figure.ts`: `figure` dresses a posed skeleton, shades it with a
  warm key and cool shadow, and rims its silhouette on an isolated sheet.
  Robe folds, head coverings, facial expressions and arm targets vary a
  person; targets beyond the arm's reach are clamped. `figurePoint` locates
  the head, chest or a local point. `crowd` scatters varied figures without
  rows and returns them far to near for painting.
- `canvas/build.ts`: `house` and `column` draw lit architecture; a column
  casts its ground shadow away from the key. Both preserve caller state.
  These volumes and figures can move live over the cached plates.
- `canvas/camera.ts`: `planeView` is the view a plane at `z` sees through the
  shot; `planePoint` is where a point on that plane lands on screen, so a
  shaft or a sun's rays can join planes at different depths. A `multiplane`'s
  `haze` takes a sky of stops as well as one colour.
- `canvas/grade.ts`, through `finish` in `createFilm`: `bloom` (bright parts
  bleed light) and `grade` (an S curve, split toning of the shadows and the
  highlights, and saturation), applied before the grain.

## The purity rule

`src/core` never touches the DOM at runtime (type-only DOM references are
fine) and never imports from `canvas`, `player` or `tools`. Bun scripts,
tests and the browser all read it; `tools` is Bun-only. `canvas` may import `core`; `player` may import both. `.oxlintrc.json` holds the import direction with `no-restricted-imports`: `core` imports no `canvas`, `player`, `tools`, `lab` or `browser`, `canvas` no `player`, `tools`, `lab` or `browser`, `player` no `tools` or `lab`, and `browser` (the host's adapters) no `player`, `tools` or `lab`.

**The host** (`src/browser/`): every browser API a page reaches goes through
an Effect service there, each with its live adapter (`*-browser.ts`) and a
test layer beside it. A page's root (`mountPlayer`, `mountLab`, `mountReview`) builds the
page's host once from `BrowserHost.layer` (`browser/host-browser.ts`,
`hostOf` in `browser/host.ts`) and hands it on: the lab's, the studio's and
the review's runtimes take it as a layer (`hostLayer`). `browser/` is
framework-free, so the player may import it. Per-viewer settings go through
Effect's `KeyValueStore` (`browser/storage.ts`): `TabStore` over the tab's
session (the lab's view, `film-lab-view:<film>`, an `Atom.kvs` of its JSON)
and `ViewerStore` over local storage (`film-lab-mic`, `film-review.quality`,
`film-review.filter`, each a `keptText` stored as plain text), each a store
in memory when the page may not use its storage. Every drag (the
player's track, the strip's scrub and its cue bars, a knob's handle, the
wipe's divider, a note's mark) follows its press through `Pointer.drag`
(`browser/pointer.ts`), which ends it once: lifted, or ended by the browser
(`pointercancel`, `lostpointercapture`). Every key listener (the player's, the
notes' `n` and Escape, the editor's undo and Escape, the review's players and
its lightbox) goes through `Keys.listen` (`browser/keys.ts`), with one answer
to whether a press is typing: into an input, a textarea, a select or editable
text. Every animation frame (the player's play loop, the review's synced loop,
the compare and onion paints) goes through `Frames` (`browser/frames.ts`):
`loop` steps inside each frame's own callback, `coalesce` paints once a
frame. Every time read goes through Effect's `Clock` on the host
(`monotonicMs`, `timersOn` in `player/throttle.ts`), so a test's clock
reaches it. Every media element is driven through a `Playable` (`browser/media.ts`;
`playableOf` in `media-browser.ts` makes one of a `<video>` or an
`<audio>`): time is read from it, a seek is done once its frame is shown,
play and pause are effects. `Media` says what a refused play means
(`Blocked`, `Aborted`, `Failed`), plays muted when the browser refuses
sound (`playOrMute`, the review's players), and makes the narration's audio.
Every request goes through Effect's `HttpClient`: a page's calls through its
one `LabClient`, built once at its root (the review's routes and its
choices' share it), and a film's timings through `loadNarrated`
(`narratedFilms` takes the client's layer, the page's `fetch` client unless
given). Every link to a review place is the one `Go` (`review/context.tsx`):
a plain click goes there in the page, a modified click is the browser's.

The lint holds the host to its adapters in the lab, the player, `browser/`
and the app's page entries (`.oxlintrc.json`): `no-restricted-globals` and
`no-restricted-properties` refuse the host's storage, frames, requests,
audio, timers, clock and URL, bare or through `window`/`globalThis`/`self`,
each naming the service that owns it; `film/host-events-through-adapter`
(`lint/`) refuses a window or document listener for a navigation, key or
drag event; `effect/noGlobals` holds in the player as everywhere. The live
adapters (`*-browser.ts`), fixtures and tests are the host's side and
exempt. The files that still read and write the URL directly are a
commented allowlist there, until they move onto `@bible/url-state`'s
`Location`.

Frames stay pure: no `Math.random`, no wall clock, no state carried between
frames. Seed randomness by key (`f.hand(key)`, `random.ts`); another scene's paper, torn as it tore it, by `f.handsOf(drawing)`. Another scene's framing, as that scene reads it (a lab edit included), by `f.knobsOf(drawing)(knob)`: a callback reads the knob where it lives, so a drag moves both scenes.

```sh
bun run gate   # repo root, as CI: lint, format check, every package's typecheck, build and tests
```
