# @bible/film

The engine behind the cut-paper explainer films in `apps/animations`: a film
is an ordered list of narrated scenes, laid end to end on a clock set by the
recorded words, and every frame is a pure function of that film and a time.

## Entry points

| Import                      | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`          | The clock: easing and `progress` (`time`), seeded noise (`random`), `{mark}` narration timing, named cues (`timeline`), the sound plan, scene `layout`, a person's takes (`recording`, `align`, the reading `sheet`, the studio's wire `studio`), and the mix: `mixPlan` (what plays where) and `renderMix` over planar PCM (`audio`, `dsp`: the ffmpeg filters it replaced, ported), and the procedural synth (`synth/`: `synthesize(recipe, seed)` makes room tone, chimes, drones, drains, blooms, notes, wind and rain as pure seeded functions; `loudness` is an ITU-R BS.1770-4 meter, integrated, momentary max and peak), and the sound library's pure half (`sfx`: `family.thing` names, generated, procedural and recorded declarations, the lock's variants and the request hash that says a sound is current, which variant each placement plays and its seeded jitter, levels in dB relative to the voice). The entry names only what films, their kits, the app's sound library and tests import (the clock, `hash2`/`rng`, `defineScript` and the film schemas, `defineLibrary`, `defineStore`); the framework reads every other module by its path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@bible/film/canvas`        | The Canvas 2D draw kit (ink, cutout, paper by meaning (`piece`: a figure cut and outlined, its line crawling, scenery torn with no ink and held still; `stroke`'s `boil`: tick, crawl or none), the `ground` contact shadow, paper fibre fixed to the backdrop plane (`planeFibre`), paper under a faint film grain, type, the one floating mitten hand with no arm (`hand.ts`: `floatingHand(ctx, root, { to, reach, grip }, style, hand)`, at rest beside its figure bobbing with the breath (`breathOf`), travelling toward its target on a soft arc about the shoulder, eased, with a settle, its grip forming from the open rest as it arrives; a hand at work that changes grip names the grip it `was` and morphs into the new one by `change`, point for point, never swapping in a frame (`handShape` its outline, for tests); `handAt` where it is, pure and allocation-free; `closeHand` the same hand close up, an open hand held out palm up seen from above, the palm the biggest shape, its middle on the origin, whose round finger block bends up toward the eye and back over the palm to cup (`closeShape` its outline at any `open`, continuous), with a lifeline and two soft joint lines; `CLOSE_SPAN` its length, no forearm; a gesture's `turn` turns its mitten palm up into the same shape at the mitten's size (`palmUpFrame`), so a push from the figure's hand into the close-up is one shape at two scales), figure, multiplane camera; every drawn scene breathes once by `DRIFT` (a scene's own `drawing({ drift })` in its place, `0` held still): through its outermost `camera` or `multiplane` when it frames one (a shot's `drift` is its share, `0` held still, `driftHeld`), as the outermost transform over its whole draw when it frames none, `shotPath`/`lerpCamera` shots (a deep push by `pushInto`, its target held in frame), `inset` for a picture in picture whose shots never take the scene's breath and `knobCamera` framings from knobs, storyboard), `createFilm`, which composites any `T`, and the text probe (`probe.ts`) `film check` reads. The entry names only what films, their kits and their tests use, the credits roll (`creditRoll`), `glow`, `sky`, `wash`, `mix`, `clearOf`, the `Hex` a colour is written as (a palette `satisfies Record<string, Hex>`, `Light`'s colours) and `reset` among them; the engine's own parts (`handShape`, `closeShape`, `palmUpFrame`, `lerpCamera`, `planeFibre`, the paper's sheets) are exported from their files for the framework and its tests.                                                                                                                                                                                                                |
| `@bible/film/player`        | `mountRender(films)` (`render.ts`, the encoder's one importer, so no studio page loads mediabunny): the render page, the `?export` handle (`ExportHandle`) a renderer drives; and in `main.ts` the scrubbable preview (`mountPreview`) the studio's pages mount (the lab, and a film's Scenes and Play pages through `mountPlay` in `@bible/film/lab`), its bar up at once and its canvas drawn once the faces its film draws in have loaded (its loader asks for them and gives the film without waiting, `narratedFilms`; the preview, the stills and the render handle wait, `pictureFacesWait`; the engine names no family), whose track marks marks, cues, sound effects and score movements (`core/ticks.ts`; on Play off until the viewer turns them on from the view menu, kept in the browser), on Play a HUD that fades 3 s into play with no input (`hud.ts`: any pointer move, key, tap or focus move brings it back, a tap on the track jumping there; a finger's tap on the picture while it plays toggles it; it never fades while the keyboard's focus is on one of its controls, and faded it keeps them in the accessibility tree and the tab order, fading only their look and taps), the narration as a typed state (`narration.ts`: `None`, `Loading` (a play asked then starts once it can, from the clock's time then), `Ready`, `Blocked` until a click, `Missing` when the master will not load or play, which the preview then never asks to play and says `no narration`), the one source of stills (`stills.ts`: drawn a frame apart, the last asked for first, none when a face the film draws in will not load, its `ready` and waiting `all` then rejecting; a film's Scenes' tape, the review's Choices and Project cards (`lab/review/options/draw-stills.ts`) and the look-book sheet all draw through it, in the browser only), and the look-book sheet `film lookbook` writes (`lookbook-sheet.ts`), set in the film's own type (its shorts' hook and caption families). Framework-free, so the renderer's page never loads Solid. `player.css` styles it and the lab, over the studio's tokens (`tokens.css`, `@bible/film/tokens.css`). The entry exports only `mountRender`, `narratedFilms`, the `Narrated` type, and the films’ faces (`pictureFaces`, `Face`, `SUBSETS`); the lab reaches the rest of `main.ts` by path. `src/exports.test.ts` guards this entry, `canvas`, `stand-in` and `core`: each names its exports, and each name has a user; and every module under `core/`, `lab/`, `tools/`, `canvas/`, `player/`, `browser/`, `command/` and `lint/` exports only names another file imports (read by the parser, so a comment hides nothing; a `.types.ts` check, a fixture film and a lint fixture are not swept). |
| `@bible/film/lab`           | `mountLab(films)`: the lab's own page (`/films/<film>/lab[/<scene>]`), Solid 2 components around the same preview; `mountPlay(pages)`: a film's Scenes and Play pages (`/films/<film>/scenes[/<scene>]#t=`, `/films/<film>/play#t=`), the tape (`lab/scenes/`) or the preview in the studio's shell (`lab/page-shell.tsx`, on every page). `lab/panel.tsx` is the Lab's panel (`<LabPage>`: the mode tray, each tool's section, the film's notes), which the server renders too; `lab/shell.tsx` is the staged film's shell as compound components (`<Lab.Root>`, `<Lab.Overlay>`, `<Lab.Layer>`, `<Lab.Strip>`, `<Lab.Fill>`: a tool's controls into its slot in the panel); the editor (`lab/editor/`: `<Editor.Provider>`, `<Editor.Strip>`, `<Editor.Section>`) writes through its effect-machine; Motion (`lab/motion/`: `<Motion.Provider>`, `<Motion.Section>`, `<Motion.Onion>`) and Compare (`lab/compare/`: `<Compare.Provider>`, `<Compare.Section>`, `<Compare.Layer>`, `<Compare.Divider>`, `<Compare.Hold>`) each hold one machine; the notes (`lab/notes/`: the page's `<NotesFeed>` and `<List>` in `list.tsx`, its feed started on the notes the page was sent; `<Notes.Provider>`, `<Notes.Section>`, `<Notes.Marks>`, `<Notes.Pins>` once staged) hold the feed and the composer machines. Every panel is Solid; none mounts plain DOM into the shell.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@bible/film/review`        | `mountReview`: the review page (`film lab`'s `/`, `/sets/<folder>[/<point>]`, `/films/<film>/{choices,project}`), hydrating what `@bible/film/review-server` rendered, `<Root>`, `<SetProvider>` and its pages mounted: renders compared in sync, a film's options and its project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@bible/film/review-server` | `reviewRender`, the review's server entry (the default export of an app's `review.server.tsx`): the review rendered for one request over `ServerHosted`, each read through the render's own reads (`LabClient.layerRendering`) and sent with the page; it draws no film (`noStills`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@bible/film/lab-server`    | `labRender` and `playRender`, the server entries of an app's `lab.server.tsx` and `play.server.tsx`: the studio's shell around a film's page (`film-page.tsx`) with the Lab's panel and its notes; the body is the browser's (`SERVER_BODY`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `@bible/film/solid-plugin`  | The Bun plugin that compiles `.tsx` with Solid's compiler (`@solidjs/compiler`): the lab's pages (`LabPage`: `solidPlugin` for each browser bundle, `solidPluginFor('ssr')` for each server entry) and the lab's browser tests bundle with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@bible/film/stand-in`      | The one stand-in 2D context for tests (bun has no canvas): `recorder` holds a canvas's drawing state from a canvas's defaults, saved and restored whole (the transform, which `setTransform` takes as six numbers, a matrix or nothing; an alpha kept within 0..1; the shadow, font, line width and every other property set), records each fill and image, answers a pixel read with the last hex fill over it (so a face's opacity read takes the canvas's branch and `cutout` draws pre-blended faces as a render does), and with `onCall` tells a test of every call and property set (how `check --draw`'s leg, `tools/draw-check.ts`, logs a frame to check it is pure); with `measure` it sets text with a test's own advances in the context's font; each canvas it makes carries its number (`isStandInCanvas`, `made`); `withDom`/`standInDom` put up a document whose canvases are stand-ins; it refuses what a real canvas refuses (a negative radius, a colour stop off 0..1, a stop colour made of NaN or undefined, a non-finite gradient coordinate). The framework's canvas tests and `check --draw` draw into it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@bible/film/tools`         | The `film` CLI (`runFilmCli`) and its Effect services: FilmFolder and FilmRepo (`film-repo.ts`: a film's paths, and its modules loaded), ContentStore, ElevenLabs, Media (mediabunny + mpg123 + WASM AAC and FLAC + FFmpeg in-process through NodeAV: durations, decode, WAV, a person's recordings loaded and their FLAC masters, joining a film; x264 in-process for a software share copy and the review's phone copies (`x264.ts`), `jpeg.ts` for its stills), Narrator, Takes (a person's recordings), Composer, Mixer, SoundLibrary (`library.ts`: an app's `sounds/`, its candidates made, kept, rejected, imported, auditioned, checked, and its private `files/` synced through the app's private store), `MediaStoreService` (`media-store.ts`: the store interface, `put`/`get`/`hashOf`/`list`/`read` with a byte range, and the folder store), `r2-store.ts` (the R2 store, SigV4 in `sigv4.ts` through `HttpClient`), PrivateStore (`private-store.ts`: the store `library.ts` declares, reached with the `FILM_STORE_*` key read as `Config.Redacted`), Browser, Pages (`pages.ts`: the export page pool check, look and render share), PreviewServer, Renderer (`render-plan.ts` is its pure plan), RenderCatalogue (`catalogue.ts`: a film's `catalogue.json`; the domain is `core/catalogue.ts`), Stamps (`stamp.ts`: each scene's content key), `film project` (`project-cli.ts`), Checker (`check.ts` holds its pure detectors), NotesStore, the composition root (`film-services.ts`: `filmServices`, `labPages`, `startLab`, the one graph `runFilmCli` and `apps/animations/studio-harness.ts` run on; `film-services.test.ts` names the two and sweeps for a third), LabPage (`lab-page.ts`: each page's browser bundle and server entry, `PageBundler`) and PageRenderer (`page-render.ts`: a worker per build, its reads through the lab's own handler, `PageReads`), the lab's routes (`lab.ts`), its studio (`studio.ts`, StudioReadings) and its source editing: SceneSources, SourceWriter (every write, its undo and redo), SceneWriter, SceneHead; FreshFilm (`fresh-film.ts`: the film CLI run again in a new process, its answer or refusal read back: options, takes, the project, the check, the studio's reading, a cue, the mix; `film read`, `read-cli.ts`); and the review (`review.ts`, `review-http.ts`): Review, and Choices (`choices.ts`, a film's options: listed, heard, picked, each read in a fresh process through `FreshFilm` and `film options`, `choices-cli.ts`).                                                                                                                                                                                                                                                   |

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

`film narrate|takes import|script|score|mix|cues|check|render|lookbook|look|judge|journal|project|chapters|notes|options|read <film>` (and `film doctor`, `film lab` (the lab and the review, every film), `film media …` over the private media store, and `film sfx …` over the app's sound library, `tools/sfx-cli.ts`) runs from the app that holds the
films. The app owns the entry: it calls `runFilmCli({ films, sounds, folders, previewServer, lab, self, judge })`
with its films folder, its sound library folder, its own `out` and `lab` folders
(where a run writes renders and notes, whatever directory it starts in; `FILMS_OUT` and
`FILMS_LAB` win when set), a scoped `PreviewServer` layer that serves its
player page, `lab`: where the lab listens (`at`, a `LabAt`), its pages
(`pages`: the app's HTML entries, `pages`, and the server entries of those the
server renders, `servers`) and the roots it reviews; the framework's
server (`labServer`) answers there (see `apps/animations/cli.ts`); and
`judge`, the rule files `film judge` quotes. Logs (`Effect.log`, `event
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

`narrate` makes each new take, `<id>.<audio hash>.mp3`, in a temporary folder
of its own, and places it in `narration/` only under the timings' store lock,
in the same step as the `timings.json` rewrite that makes it current. No crash
leaves a take and its timings disagreeing, and another `narrate`'s sweep
never puts away a take still being made. The sweep removes a partial write
only when its writer, named in `<file>.<pid>-<n>.<host tag>.partial`, is a
pid on this host that no longer runs. It keeps every other partial: another
host's, and one whose name carries no host (a writer from before partials
named it) or no writer, since a leftover partial blocks nothing and is
git-ignored while removing a live one loses its write. A mix landing its
track meanwhile, here or on another host, keeps its partial. A take's words come from the speech model's alignment and its
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
or a recorded one whose attempt this machine lacks, is copied there first;
an attempt of the same name with other bytes stays as it is, and the take
is kept beside it as `<file>.<sha12><ext>`, logged `takes.put-away.kept-aside`),
so no take's bytes are ever lost and git drops it from `narration/` as
before. Placing a take and naming it hold the timings' store lock (a keep's,
and a `narrate` staging take's), and a
take is put away only while the timings, read under that lock, do not name
it (`putAwayUnnamed`; narrate's sweep runs under it too), so a sweep in
another process never puts away a take a lab's Undo is naming. A
keep made in the lab is undoable: its change carries the takes the timings
name (`Takes.named`), so Undo brings the replaced take back into
`narration/` (a kept-aside copy first) before the timings name it again, and refuses when it is in
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
crosses in): the player implements it (`player/render.ts`), the tools reach it
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
pass (`@mediabunny/server/src/video-encoder.ts`), and at equal size it kept far
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
app's, cross-linked: the review (below), the lab (`lab.html`, `mountLab(films)`)
and the player (`play.html`, `mountPlay(pages)`): a film's Scenes and Play. Its API is under
`/api/` (The HTTP API, below), and every other path a page serves is one of
the framework's places (`Places` in `core/api.ts`, each a `@bible/url-state`
Place; the app gives each page's HTML entry, `LabPageSpec.pages`, and its
server entry, `LabPageSpec.servers`), as
**Pages and links** (below) lists them. An old link (`/?film=<film>`,
`/?project=<film>`, `/?folder=…[&set=…]`, `/lab?film=<film>[&sel=…]`,
`/player?film=<film>[&lookbook|&lab]`; never an `?export` page) answers a
302 to its place (`legacyPlace`, logged `lab.page.moved`), and the browser
keeps its `#…` across. A path no place declares is a 404, never a page.
`LAB_HOST` (loopback by default) and `LAB_PORT` (8229) say where it
listens; a box binds `0.0.0.0` with the names it is reached by in
`FILM_LAB_HOSTS`.

**Pages and links.** Every view a reviewer would talk about is a URL, so a
pasted link opens what the sender saw and Back walks the views: the path
says what the view is about, the query what is selected in it or how it is
shown, the hash when (`#t=`, seconds). Each page reads and writes its place
through `@bible/url-state`, and every link is printed by `pageHref` over the
same places. Whether a move is a step Back walks is the place's declaration
alone (`pageMove`, `core/api.ts`): a new path or a cited key (a selection,
a view, a moment chosen, the compare's mode) is a history entry; a
refinement and the playhead replace the entry. Every write enters history
by that declaration (`Place.history`), through either of two doors. A page
that moves for a reason names only the reason (`addressOn`,
`browser/host.ts`): the viewer went somewhere (`go`, entered as the place
declares), or the URL follows what the page did on its own (`follow`: play,
a drag, a ←/→ step through the moments, a correction, a note gone from the
feed, an old link's redirect), which always rewrites the entry. The review
pages also set a place's value directly (`UrlState.set` and `update`,
`UrlAtom.place`'s setter: a sheet opened, the synced players' time).

| Place                            | Page   | Query                                                                                                                   | Hash                                 |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `/`                              | review |                                                                                                                         |                                      |
| `/sets/<folder>`                 | review |                                                                                                                         |                                      |
| `/sets/<folder>/<point>`         | review | `view`, `other`, `m`, `inspect` (the version whose sheet is open)                                                       | `t` (the set's video)                |
| `/films/<film>/choices`          | review | `point` (the card revealed), `inspect` (its variant's sheet), `heard` (a point, or `own`), `variant`, `picture`, `only` | `t` (the picture)                    |
| `/films/<film>/project`          | review | `point` (the card in focus, its sheet open), `heard`, `variant`, `picture`, `only`                                      | `t` (the picture)                    |
| `/films/<film>/scenes[/<scene>]` | player |                                                                                                                         | `t` (film time)                      |
| `/films/<film>/play`             | player |                                                                                                                         | `t` (film time)                      |
| `/films/<film>/lab`              | lab    | `note`, `view` (Compare's mode)                                                                                         | `t` (film time), `loop`              |
| `/films/<film>/lab/<scene>`      | lab    | `cue` or `knob` (of the scene), `note`, `beat` (the studio's), `view`                                                   | `t` (from the scene's start), `loop` |

The lab writes a scene's place (`lab/place.ts`): the path names the
selected cue's or knob's scene, else the scene under the playhead, so play
or a seek across a scene's end moves the path and rebases `#t=` in one
write, and a write's reload comes back to the frame, the pick and the note.
A pick and a note are history entries (Back undoes them). Each time write
names its cause (`TimeInUrl.write(T, cause)`, `player/t-in-url.ts`): play,
a drag and a pause are `'play'` and rewrite the entry, even across a cut; a
jump (`]`, `[`, a frame step, ⌘K to a scene, Go to, a tap on the track:
a press lifted with no drag, so a drag from anywhere is never a jump)
is the viewer's move, so a jump into another scene is a step Back walks,
and one inside the scene rewrites the entry. Motion's A–B range is
`#loop=<a>,<b>` (film seconds on both places, so a scene change never
rebases it; an in point not before the out point reads as none): a pasted
link opens on its loop without playing, and a range set, moved or stopped
is a step Back walks. Back or Forward lands the player on the time the entry keeps
(`onTraverse`, `browser/host.ts`; the review's players too), a time still
waiting to be written for the entry left dropped. A bare `#<seconds>` (an old link's film time) opens on that frame.
A film's Scenes (`lab/scenes/`) is its **tape**: the whole film end to end
as stills, wrapped like lines of text (a still every 5 s; a line a minute
on a laptop, so the whole film is one screen, and half a minute on a phone;
⌘+ and ⌘− step it between 2.5, 5 and 10 s, kept in this browser; Finer
and Coarser tape name the step they go to, and ⋯ Info the one it is). A tape is
an editor's contact sheet read in film order: each still is the frame at
the middle of its step, drawn from the code as it stands by the one source
of stills (`player/stills.ts`, the lines on screen first; with captions
while the preview's are on, the tape drawn again as its toggle turns), each **cut** is a
thin rule at its scene's exact time carrying the scene's name, and a band
under each line says each scene's state. Over it the **tape bar** holds the
acts ruler, the preview's track (in two lanes: the scenes' names along its
top, its ticks below them, so no name runs over a tick), the legend (a
colour key: scenes out of date, not rendered and approved; the check's
findings on scenes by level, errors and warnings, and the film's own lines;
each with its count in ⋯ Info, each line once, adding up to Project's count
of findings, `lab/scenes/marks.ts` `checkCount`) and Follow (the
playhead's line stays in sight while it plays; a scrub turns it off). A
cut's name takes only its room: shortened with an ellipsis, set before the
row's last rule where it fits there, or dropped. A tap on a still selects its scene (the path; Back
steps through the selections) and moves the playhead there (`#t=`, film
time; a scene's link with no `#t=` opens at the scene's start, as its lab
does); a drag along a line scrubs. The selected scene's card
(`lab/scenes/card.tsx`, the card the Project shows) stands in the sheet the
Project's scene inspector stands in (`Sheet`, `lab/review/inspector.tsx`):
beside the tape, and on a phone a sheet over the tab bar that opens lowered
to the card in brief. It holds the live frame, in, out and length in
timecode, its marks, Open in Lab (E), Approve (A), its findings
(`SceneFindings`, the Project's too) and a comment; its Close (Escape, a
swipe) clears the selection and adds no entry, by the inspectors' rule
(`useSheetDismissal`): it goes Back over the tap that opened the sheet, else
the entry is rewritten to the tape. ⇧-click or ⌘-click adds scenes, and ⇧A approves them all in one
say; an approve's receipt offers Undo (`project.undo-approve`), as
Project's does. The palette and the film's counts are in
the view menu (⋯). A short's Open goes to its play page, as the lab opens
films.

A folder ref is one path segment (`bible-tools%2Frighteousness-by-faith`), as
is a short's name. Rate, onion, a looped cue, the wipe's divider, the lab's
mode, the microphone and quality are this viewer's own settings and stay in
the browser's storage, never in a link; the compare's mode (`?view=`) and
the A–B loop (`#loop=`) are the link's. Which points a film's choices or project page shows (`?only=`) is
in its link.

**The pages are built in the lab's process** (`LabPage`, `tools/lab-page.ts`):
`Bun.build` with `@bible/film/solid-plugin` (the `PageBundler` service, with a
test layer that reads each entry as its own page; each page with a server
entry, `*.server.tsx`, is built beside its browser bundle from the same
sources, in the same build), about a tenth of a second, so
there is no build step and nothing to rebuild by hand. A page is built when
first asked and again when asked after a file the last build read has
changed: the folder of every file the last build read (outside
`node_modules`) is watched, the set following each build: the entries'
folders from the start, and after a failed build also the folders of the
files the bundler named, so a first build that fails still hears its fix. A
folder still read keeps its watch; a file read in a newly watched folder
or new to what it read, that changed from a second before the build began
counts as a change. Each change to a
file a build read is one more build (a render or a note is none). A film's
mixed track (`narration/full.wav`) is no source, but the page plays the one
it loaded: once a page asks for one, there or not (a film before its first
mix gets a 404), its folder is watched too, or the nearest folder there on
the way to it until the mix makes it, and a mix landing it (last and whole,
by a rename, so the mix has finished) is one more change, with no new build,
that the film's open lab hears and no other film's (it waits with `&film=`),
so a score or level written on the review, a take kept, a first mix, or a
`film mix` run by hand reloads that lab once onto the new track; a take's
timings, saved before its mix, wake nothing. A film's choices page waits
with `&film=` too, from its first wait (it never plays the track, so the
wait itself arms the watch, `filmWaited`), and hears each newer mix once
(`hearMixes`): it asks every mix again and reads the steps again at once,
and reads the film's choices again and shows them if they changed (unless a
newer answer, a comment's, is shown by then), so a pick made in a second tab
shows in the first. A write that mixed answers the build its film's pages
hear that very mix by (`mixed`, `LabPage.heardAt`, from the track's mtime
read under the writer's lock); the page asks every mix again once per build,
so the wake for its own mix asks nothing more, and one past it (another
tab's fade remixed in the same settle) does, whatever the choices say. A page links its scripts and styles from the root (`/chunk-….js`,
`publicPath: '/'`), so a page served under a film's path finds them; a
request is answered as a narration file when it is one
(`/films/<film>/narration/<file>`), then as a built file, then as the page
its path serves. Every page is stamped with its build and the server that
built it (`<meta name="lab-build">`, `<meta name="lab-server">`, an id made at
start) and waits on `GET /api/review/build?since=&server=&film=` (`PageBuild`,
long-polled, at most 60 s; another server answers at once, so a page outlives
a restart); the lab reloads at the frame it shows when a later build or
another server answers
(`lab/rebuilt.ts`), so a scene edited by hand or by an agent is on screen
with no hand on the page. Every reload onto new code (the rebuild's, a
write's, a kept take's) marks the view (`landed`, `film-lab-view:<film>`),
and the page it lands on lights the picture's edge once and fades it
(`.stage[data-landed]`, PA-11): the eye knows the frame is the new code, not
the old one still standing. A page opened by hand does not flash. The review does not reload itself (a playing set
is not interrupted); its next load is the new code. A page that does not
build answers 500 with the bundler's words and reloads once a later build
or another server answers, pausing 2 s after every other answer; a
failed build is tried again on each request and, while a page waits, by its
wait every half second (a fix may land in a folder no build read, or the
bundler may still hold what the failed build read; the failed page asks
nothing but its wait), and one that then builds is a new build its page hears; the server
keeps serving.

Every page is rendered on the server (PA-12): its server entry
(`LabPageSpec.servers`, whose default export is a `PageRender`,
`core/page-render.ts`) runs in a worker of its build (`PageRenderer`,
`tools/page-render.ts`), retired once a newer build has rendered and its own
last render ends; the render's head, body class and markup are spliced into
the built HTML and streamed, and the browser's copy of the same components
hydrates them. A render's reads of the API come back to the lab's own
handler (`PageReads`), so they pass `admit` and the same handlers; they are
sent with the page and adopted (`ssrSource: 'server'`), never read twice,
and a value only the browser knows (the viewport, quality, the viewer's
keys) is `ssrSource: 'client'` with a server value (the server answers as a
phone). The server draws no film: the canvas, the scene code and the stills
are `clientOnly` (`lab/film-page.tsx`); a film the browser cannot start (one
the lab does not have, `/films/nope/lab`) ends its page (`PageEnd`,
`lab/page-client.tsx`: the tree disposed, the notes feed and the keys with
it) and says why in its place, once. A build whose server entry reads
a film's or a scene's module or `player/stills.ts` fails, naming them
(`filmCode`). A render that fails before its head answers the page as built,
which the browser then renders. One that fails after its head, or still runs
`LONGEST_WAIT` and a few seconds after it (`END_WAIT`), is cut: the page ends
with what it wrote and `PAGE_CUT_MARK`, and the browser drops that markup
and renders the page anew (`mountPage`). A page's answer (its HTML, scripts and
styles) is compressed by the request's `Accept-Encoding` (br, else gzip;
`pageRoute`, `tools/api-server.ts`), a streamed page flushed chunk by chunk
(`NodeHttpCompression`), so its shell reaches the browser while its render
goes on. A build's scripts and styles are also compressed once at brotli's
best, in the background after the build, and sent so to a request that
takes br once made (`squeeze`, `tools/lab-page.ts`; the Lab's main chunk
261 KB, against 313 KB per request). A wedge's files are not: only the
easel's browser on the box asks for them, so each is compressed per request. A page's head preloads and declares the UI face's latin subset
(`FACE_HEAD`, `player/face.ts`) and holds no other font;
`tools/page-css-budget.test.ts` holds each place's render-blocking CSS, as
the lab answers it, to 64 KiB. Only the lab's server bundles Solid; the
render's server (`film render`, `check`) serves the player alone.

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
track are read at load, so no rebuild would). The editor waits for such a
step as long as the studio waits for a keep (`STUDIO_IMPORT_WAIT_S`); with
no answer even then it reads `GET …/check`, whose `landed` the step is
recorded in, under the id its request carried, before it remixes, and says
whether it landed. Choices and Project send their Undo and Redo with an id
too, and an answer lost on the way back is read from the same `landed`
(`landedStep`, `lab/api.ts`). Undo and Redo are stepped back and on only with the
timings' takes brought back as the very files they name: a take's copy is
picked by the hash of its audio its name carries, and a name from before
takes were named by their audio, whose copies differ, is refused
(`TakeAmbiguous`) rather than guessed at. A keep answered by
an older film CLI (`{"_tag":"OptionsKept","mixed":true}`, no take) is still
recorded and answered from the timings. A reload never takes work only the
page holds: a take being recorded, under review, refused with its recording
or on its way, or a note being made, holds every reload (`lab/reload-gate.ts`),
which runs once it is submitted, discarded or saved; the panel says what it
waits for. A cue or a knob handle held in the editor holds it (the drag is
not lost under the finger), and an editor write on its way holds it too: a scene file is page
code, so the lab rebuilds the page as soon as the write is in, before it
answers (its check comes first), and the reload waits for that answer, so
the write's receipt and its Undo are said before the page goes and come back
with it. A take is kept against that reading
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

### Commands and keys

Every action a page offers past its at-rest buttons is a **command**
(`src/command/command.ts`): an `id`, a `label` (or `labelIn` the context), a
`group`, a typed `when` over the **context** and a `run` that answers an
`Effect<Receipt>`. A command that is not available is not shown: no dimmed
rows. Each command names its keys (`keys`, `keysIn` the focus scopes it
answers in: `page`, `field`, `studio`, `slider`; a focused button or link,
`control`, hears the page's), whether a key is `stepped` (Shift
coarse, Alt fine), and its `touch` path, so every key has a way in on a
phone. The context (`src/command/context.ts`) is the page, its URL's
selection (`selectionOf`: one `Selection` union over the places' query keys,
`src/command/selection.ts`), what has focus, and what each section adds
(`refine`: the player's `playing`).

One **hub** per page (`makeHub`, `src/command/hub.ts`, built at each page's
root: the Lab, a film's Scenes and Play, `filmPageOn` in `lab/film-page.tsx`,
and the review) holds the registry, the context and
the **keymap**, and listens once through `Keys` (`browser/keys.ts`). A press
already handled, or inside an IME composition, is never read. The press's
focus picks the scopes: a field (an input, a select, a player, an open
dialog or menu) reads only commands that answer there, the Studio reads its
own keys first and owns them (a Studio key never reaches the page; the
page's others still run from it), a slider (a wipe's grip, `role="slider"`)
reads its own arrows, Home and End first and owns them, then the page's, and
anywhere else is the page. The last available command bound to a chord
runs; a key with no available command passes to the browser (⌘Z with
nothing to undo). Chords are written `mod+shift+z` (`mod` is ⌘ on a Mac,
Ctrl elsewhere); a letter is read by its key in any case, Alt+letter by its
physical key, and a symbol by the character it types, so `?` and `]` work on
any layout. A viewer's rebindings are kept locally (`film-keymap` in
`ViewerStore`, a list of `{ key, command }`, `-<id>` removing a default) and
survive a reload; the `?` sheet changes and resets them.

Every page in the studio's shell (the Lab, a film's Scenes and Play through
`film-page.tsx`, and the review) hosts three generated surfaces
(`src/lab/command/`): the **command menu** (⌘K) lists the commands
available here, filtered by every word typed, with their keys; the keys
**sheet** (`?`) lists every command by group with its keys, its touch path,
and Change and Reset; the **context menu** (`TargetMenu`, one per page) opens
on a right-click, or a touch held still for half a second, on a thing the
page marks as a `Target` (a cue's bar, a knob's row, a note, a scene's card
on the Scenes, a folder's,
set's or version's card, a film's links, a choice, a variant, an act, the
project's film): its commands about that thing (a command's `about`, in
`src/command/target.ts`: the kinds of thing whose menu shows it), the
thing's own first, then Copy link and the command menu, which every menu
has. The page itself is a target too: a press on no thing opens the page's
commands (`about: ['Page']`: Undo, Redo, Show only…, Loop this scene, the
transport's frame and scene steps, the legend). A stepped command also has a
`×10` row, a finger's Shift (`steppedRows`); ⌘K and the keys keep the one
row. A touch that moves past @bible/ui's threshold first (a scrub, a drag) never
opens it, and starts the drag instead (one owner per press, `claimPress`);
a touch the menu took first is the menu's to its end: no drag starts
under it, and its release completes none (`liftHeldByOther`), so a finger
that slides after the menu opens draws no note and moves no cue;
a field keeps the browser's own menu. The menus' rows
(and a chip's) are keyed by their command (`rowKey`, `src/command/menu.ts`):
they are made again whenever what they read moves (a command's `when` and
its label read the player, so each frame a film plays), and a row keeps its
element, so a press and its release on it are one click. Every page has
**Copy link** (⇧⌘C, AA-1, `src/command/link.ts`): the page's URL (its place,
its selection, its time), or from a thing's menu that thing's citation
(`citeOf`), written whole through the host's `Clipboard`. A choice's card
cites its Choices link (`?point=`); a part's render, an act and the film
cite their project sheets (`?point=render:…`), read back by the one reader
the page reads them with too (`selectionOf`, `projectPartOf`); a thing cited
from its own page (another version of the set, another card of the film's
Choices or project) keeps how the page shows it and when. Their rules
(`src/lab/command/style.ts`) read the studio's tokens (`player/tokens.css`)
directly; `COMMAND_TOKENS` names only what no studio token holds: the
paddings and heights the surfaces compose, and their own widths, heights and
layer. The Play and Scenes pages are the shell's too
(`lab/play-mount.tsx`), so `?` is the keys sheet on every page, the one
place the keys are listed (UR2-11): every command a key is bound to, one
found only by typing too. The lab bar's legend (what the stripes and the
ticks mean, `BAR_LEGEND`) is hidden at rest (UR-114, `legendCommand`, no
key): ⌘K or the page's long-press menu shows it (Show the legend), and on a
film's page the `?` sheet ends on it. Play has no bar legend of its own:
the ticks' shows with the ticks (⋯ → Show the ticks).
The lab's transport reads in the scene's time and length while the header
keeps the film's, and on a laptop Play's one timecode is the header's
(SU-12); the lab's captions are the view menu's and `c`, Play's its bar's
CC (UR2-12). No page keeps a line of key hints at rest (UR-26,
UR-80, UR-98): the keys are the `?` sheet's, each with its touch path (Note
this frame's names the click and the drag that mark a frame, and the notes'
empty list says them too), and the gestures of the selection are the
inspector's footer.

**Go to** (AA-2, `src/command/go.ts`): every place a page can go to by its
name is a command found only by typing (`typed`): ⌘K lists it once a word
is typed, the `?` sheet never, and a context menu only when the command is
`about` the thing it opened on (a point's marks, below). `/` opens ⌘K from the
page (a field keeps it for typing). In the lab the places are the film's
scenes (`Go to scene cold`), the cues of the scene shown (`Go to cue rise in
one`: the player goes to its start and the cue is selected) and the notes
(by id and their first words); on the review, the folders (by title and
ref), the sets (`Onset in Roofs at dusk`) and each film's choices and
project (`Go to project of cold`). A page registers its places while they
hold (`registerWhile`, `src/lab/command/changes.ts`). The walks through
time (`src/command/walk.ts`, each the first thing a frame clear of the time
shown) are keys too: `.`/`,` the strip's cue edges, F/⇧F the findings of
the film's check that have a place on the time line (its own time, else the
start of the first scene it names; `findingTime`), and ⇧N/⌥⇧N the open
notes (`n` stays Note this frame).

The **inspector**'s number fields (`Field` in `src/lab/command/inspector.tsx`,
on @bible/ui's NumberField) read how they step from their schema: a number
schema carries a `field` annotation (`core/field.ts`: `unit`, `step`,
`coarse`, `fine`, `min`, `max`, `readOnly`, `why`; a step in the unit or in
`{ frames }` of the film), so a cue's `offset` and `dur`, or `end` on an
`until` cue (`CueOffset`, `CueDur`), step a frame, ten with Shift and a millisecond with Alt, a point
knob's x and y (`Pixel`) a pixel, ten and a hundredth, and a number knob
(`KnobNumber`) a hundredth, a tenth and a thousandth; a bare number steps as
every field did before (0.01), and no field's fine step is coarser. A
field's arrows step it, a drag across its label scrubs it, and typed
arithmetic (`+0.1`, `*2`, `0.42*2`) is read on Enter or on leaving it. The
editor's fields of a cue or knob (`fieldsOf`, `lab/editor/grip.ts`) write
through the same writes as a drag and refuse as a drag would. The nudges
step the selected cue or knob through those fields (⌥←/⌥→ a cue's offset, a
point's x or a number; ⌥↑/⌥↓ a cue's dur, on one that runs `until` a mark
its end, `untilOffset`, a point's y or a number; Shift ten), and their
write's receipt says what moved, before → after; S turns the viewer's Snap
off or on (`film-studio.snap`; Shift flips it for one move, `placesFreely`),
the strip's Snap toggle its touch path; `.` and `,` go to the next or
previous cue edge on the strip, Tab and ⇧Tab select the next or previous cue,
the playhead put at its start first as ⌘K's Go to does, so the strip (8 s of a
long scene on a phone) shows it (a focused button or link keeps Tab for focus). The inspector's footer
(`Hint`) names the keys of the commands about the selection and its
gestures, only while the pointer or focus is in the inspector, never on a
touch screen (`pointer: coarse`), where the long-press menu is the hint.

On the review's pages the **inspector** is a sheet beside the page
(`src/lab/review/inspector.tsx`, on /ui's Drawer: the page stays live
under it, making room on a wide screen; swiped away or closed with Escape)
for the selected variant, set version, act or film, one at a time: its Info
(every line of what it is; a version's file and notes), Approve and
Unapprove, what was said of it and the one comment box, whose unsent text
is kept per thing while the page lives. A page keeps the open one in its URL
(`useInspectorPlace`: Project's `?point=`, Choices' and a set's
`?inspect=`), so a link, Back and Forward open and close it; on a phone it
is a bottom sheet over the tab bar, its grip lowering it to a peek. A row keeps at rest only what most
visits use: a variant's name, state, first line, Pick and 🔊, Approve on the
picked one (and on a scene's render, the project's goal), and a dot counting
its comments; the rest is one step away. Each thing registers itself while
it is shown (`src/lab/review/things.ts`), and its verbs are the page's
commands: Inspect (`i`) and Comment on (`m`) open the inspector, Approve
(`a`), Unapprove, Reject (`x`) and Unkeep (`u`) say what its buttons say,
and an act's or the film's approve of its current scenes is in its menu and
⌘K with no key. A tap on a thing's name or its comment dot opens it too. A
key reads the thing the keyboard's focus is in (`withFocused`, after the
URL's selection of its kind). On the choices and the project (`src/lab/review/options/keys.ts`)
the selected point (a focused variant's, or `?point=`) auditions: ⌥→ and ⌥←
hear its next or previous variant in place, as its 🔊 does, skipping one
that cannot be heard, and move the focus to that row; Enter then picks it
(only while the selected variant is the one heard, so a focused Pick on
another row keeps its own Enter). The instants a point plays at are no
longer chips at rest: each is a `Jump to 00:00:02:00 · hush in open` in its card's
context menu (and in ⌘K once typed), and `.`/`,` jump to its next or
previous one. A voice's pick refused as heard as something else
(`TakeMismatch`) offers **Accept anyway** as its receipt's button, in its
row's context menu and in ⌘K, while that refusal stands and never at rest:
it sends the pick again with `acceptMismatch: true`, which `keepVoice` keeps
(`--accept-mismatch`, as the studio's Accept anyway does). A level's value is a field beside its slider (`Field`, typed
arithmetic committed on Enter, its arrows the knob's step, Shift ten,
Alt a tenth). On a version stack (`src/lab/review/hear.ts`) `1`…`9` hear
version n, as its 🔊 does, while the view can play it. A set's version says over
`POST /api/review/sets/<folder>/<point>/say` (UI-7), its answer shown in
place.

A **receipt** is one toast (`Receipts`, `src/lab/command/receipts.tsx`, on
@bible/ui's Toast) over every page in the shell, in place of the
status lines they had (the editor's, the choices' writes, the project's
and a version's says, the sound check while it runs). The hub hears every
receipt (`hub.receipts`) in its slot: a command's own id when it runs
(`hub.invoke`), or a page's slot when a write says one (`hub.announce`:
`edit` for the editor, `film`, `project`, `set` and `sound-check` on the
review, `scenes.comment` on the Scenes). A slot shows one toast, replaced in place: `busy` (`writing…`)
while its write is out, then what it did, said once the write lands and
never before (`cue rise offset 0 → 0.3 s`, `knob size 24 → 30`, `Picked
piano · Score: strings → piano`, `Rain: -12 → -6 dB`), or why it was
refused. A receipt that can be undone carries the command that undoes it as
its button: Undo for a write, Redo for an Undo, Undo for a Redo (the
editor's `Written` state names it, read from its step flow), bound to the
change its write made (`Bound`: the film, and the change by the id the
lab's history gives it, `HistoryStep.change`; an approve's, by its run's op
and the scenes it gave one to, `Project.gave`). Each kind of id is its own
brand (`ChangeId`, `RequestId`, `OpId`), made by `uniqueId(<brand>)` or
decoded where it arrives, so a target's words, a time or another kind's id
in its place is a type error (`lab/identity.types.ts`). A bound receipt's button acts
on that change alone: its command says whether it can (`Command.fits`;
Undo and Redo through `stepWhyNot`) and sends the change's id with the step
(`{change}`), which the lab steps only while it is the newest that way,
else refuses (`StepNotNewest`, 409). A command with no `fits` acts on no
single change, so a bound receipt never runs it. There is no unbound Undo
(`said` takes an `Undoing`, the command with its change): a write that
made no change (a value already so, whose answer names no change) says so
(`cue rise offset 0.433 → 0.433 s (already so)`) and offers none, since a
step that names no change steps whatever is newest, an earlier write's or
another film's. Undo and Redo by key or the editor's header name the
change their label names (the stack's top as the page read it), so a
change another client made since (a voice pick, a studio keep) is refused
(`StepNotNewest`) rather than stepped in its place, and the refusal reads
the history again, so the label and the change the next press names move to
the stack as it is now; once the page has
changed the stack itself since the history it holds was asked for (each
read carries the count it was asked at, each change the page made the
count it landed at), the label names none and the step is the newest. A done receipt
shows 5 s, a refusal 10 s, a busy one until replaced. The lab reloads after
a scene write; the receipts showing as the page hides are kept in the tab
(`film-receipts` in `TabStore`, for the same page: the lab's film, or the
review, whose receipts follow it from film to film) and shown again once it
has loaded. A receipt's Undo pressed when it cannot act says why and is
held: its command not available (the reloaded page still reading the step:
`Undo is not available now`), another film's change (`that was a change to
toy: open toy to undo it`), or a newer change before it (`cue fall offset
came after it: undo that first`), or the change undone already and nothing
else to undo (`it is undone already`). Still offered and never expiring, it says
again what it did once it can act, unless a receipt in its slot supersedes
it. One that never can act is retired instead (`Command.fits` answers
`Unfit.Never`, where a held one is `Unfit.Now`): when the history the page
has read has nothing to step that way and the change is not the other way's
newest, the lab no longer has it (its history is in memory, so a lab
restart loses it). The receipt then says `the lab no longer has that change
to undo: it was undone already, or the lab restarted since`, loses its Undo
and goes as a refusal goes; a held receipt is retired the same way once the
page reads such a history. The editor judges a change it made since it read
the history as unread, since the history it read cannot know it.
A drag's write and a field's carry what they move in an
optional `said` (`CueWrite`, `KnobWrite`: `cueSaid`, before → after). On
the choices page and the project, Undo and Redo are commands
(`review.undo` ⌘Z, `review.redo` ⇧⌘Z, in ⌘K, the `?` sheet and the page's
long-press menu, named for what they would undo: `Undo score play brass`),
shown only while there is a step to take. A say's receipt has no Undo (it
writes the catalogue, not the source), except an approve of the project's
scenes, on Project or on Scenes: its Undo (`project.undo-approve`, one
owner, `lab/review/options/receipt.ts` `undoApprove`) withdraws exactly the approvals it gave
(`Project.gave`, `Withdraw { given }`) and says what it took
(`Project.took`).

`.oxlintrc.json` refuses a raw `keydown`, `keyup`, `keypress` or
`contextmenu` listener (`film/keys-through-keymap`) outside the adapters and
`src/lab/command/`: a key is a binding in the hub. It also refuses a title
written with a key in brackets, and a read of the keymap (`keysOf`) outside
its followers (`film/keys-named-as-bound`): a title names its key as bound
now, through `hubKeys` in Solid or `titledNow` on `Hub.subscribe` outside it,
so a key rebound in `?` reads as rebound.

**Terms**, as editing software uses them:

- **Page bar**: the row of the studio's parts, as Resolve's Media · Cut ·
  Edit row: Films · Scenes · Lab · Choices · Project · Play, on ⇧1-⇧6
  (`lab/page-shell.tsx`). On a laptop it sits in the header; on a phone the
  five film parts are a tab bar along the bottom and Films is the header's
  leading square. Every move between parts is the page bar, the film
  switcher or a command that lands on a part. Between Scenes, the Lab and
  Play it keeps the frame: each opens at the header's playhead (`#t=`,
  `partHref`); Choices and Project open at their own.
- **Project manager**: the studio's home, Films (`/`), named for Resolve's:
  a card per film (the stills of its renders' folder, its name; a tap opens
  its Scenes, a long press its other parts, `filmCommands`), then the
  review's folders (Versions, Renders).
- **Timecode**: a time written `HH:MM:SS:FF`, hours, minutes, seconds and
  frames (`timecode`, `core/time.ts`; 30 fps), in a monospaced face so the
  digits never shift. The studio shows its times this way: the header's
  (film time on every page with a playhead; a tap copies the link to that
  frame), the lab's transport (scene time), a cue's start and length, a
  note's or a finding's time. A `#t=` in a link stays in seconds, as does
  a finding's message, the sentence `film check` prints too.
- **Transport**: the play, pause, frame and scene controls, and their keys
  (Space, ←/→ a frame, Shift ten, `[` `]` a scene; `player/transport.ts`).
  It belongs to the picture it drives, never to the header; on a phone it
  docks above the tab bar (`.sh-dock`), where the thumb is.
- **Timeline dock**: the lab's foot under the picture: the film's timeline
  (its scenes end to end, the playhead) and the cue strip (the scene under
  the playhead, zoomed: its words, a lane per cue). Not a dock of tabs: a
  mode's tools live in the inspector. The lanes and Snap are Edit's (and
  Motion's on a laptop, for its loop): in Note, Compare and Record, and on
  a phone in every mode but Edit, the strip folds to its words, so the
  mode's own controls start on the first screen and the picture keeps its
  room. A
  note begun shows Note once its mark is lifted, so the frame never moves
  under the drag.
- **Mode tray**: the segmented toolbar at the head of the lab's inspector,
  Edit · Note · Motion · Compare · Record (`lab/mode.ts`): one pressed, and
  the inspector shows that tool only, under no heading repeating it. Kept
  per viewer in the browser; a cited note opens on Note, and a cited beat
  the film lists on Record.
- **HUD**: the readout laid over or beside the picture: the player's bar
  (scene, time; its keys legend hidden until asked for).
- **Inspector**: the panel that shows and edits the selected thing: in the
  lab the editor's section for a cue or a knob, its fields stepped as their
  schema says; on the review a sheet beside the page with its Info, its
  approval and its comments.
- **Command menu**: the searchable list of every available command (⌘K).
- **View menu**: the header's `⋯`, after Go to… on every page: the page's
  `View` commands available now (captions, quality, findings, a filter,
  Refresh), then Keyboard shortcuts (`lab/command/view-menu.tsx`). The Lab's
  Undo and Redo sit in the header before the timecode in every mode
  (`ShellTools`).
- **Context menu**: the commands for what is under the pointer, opened by a
  right-click or a touch long-press.
- **Sheet**: a panel over the page that holds a surface, not one fixed in
  the layout: the Findings sheet and the review's inspector, on /ui's
  Drawer, swiped away or closed with Escape; the keys sheet, a Dialog,
  closed with Escape.
- **Nudge**: moving a value by its step with a key (⌥← ⌥→: a frame; ten with
  Shift).
- **In/out points**: the start and end of a range (Motion's loop: I sets
  the in point, O the out point, or a drag across a cue lane sets both); a
  note written while they are marked is about that range.
- **Receipt**: what a command answers when it runs: what moved, before →
  after, and Undo where it can be undone.

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

| API          | Served by                 | Groups                                                                                                                                                                                                                 |
| ------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LabHttpApi` | `film lab` (`labHandler`) | `notes`, `scenes` (source, head, cue, knob), `steps` (undo, redo, check, steps), `studio`, `review` (index, file, phone, frame, duration, say), `choices`, `project`, `looks` (take), `page` (wait: the build counter) |

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
same-origin or none, a write's Origin none (a tool) or one of those hosts', with a JSON body
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
page table or an old link to one (`legacyPlace`); never the API, a script or a file. A fixture's own routes beside the API's
(`labHandler`'s `beside`: the studio harness's control) sit behind the same
gate. A page rendered on the server (`PageRenderer`, a worker per build)
reads the API through the server's own handler on the page's connection
(`PageReads`), so the gate admits its reads as it admitted the page.

**To add an endpoint:**

1. Declare it in its group in `core/api.ts` with `HttpApiEndpoint.get` or
   `.post(name, path, { params, query, payload, success, error: Refusals })`.
   A write takes a JSON `payload` (`NoBody` when it says nothing). A new
   failure class goes in `core/refusals.ts` and into `Refusals` with its
   status. A new group is `HttpApiGroup.make(name).add(…)`, added to
   `LabHttpApi`.
2. Handle it in the group's `HttpApiBuilder.group(api, name, …)` in tools:
   `.handle(name, ({ params, query, payload, request }) =>
answered(Effect.gen(…)))`, naming the film with `filmNamed(params.film)` (`tools/film-repo.ts`).
   Return the success value (the API encodes it), or an
   `HttpServerResponse` for a file (`serveFile` answers byte ranges). A new
   group's layer joins `labHandler`, and a service its handlers need joins
   `LabContext` (`tools/lab.ts`), its layer built in the composition root
   (`tools/film-services.ts`), which the CLI and the studio harness share.
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
line, each with a dot in its take's state colour and shape (filled, a ring,
half filled; `recorded`, `scratch` for
a staging take, `stale: <why>`: the word in the beat's name and title, the
counts in the list's, the selected beat's under the list), then Record and
the meter over the teleprompter, so R is on a phone's first screen; it
reads the selected beat as a teleprompter (the sheet's lines, a
quotation set apart with who said it, marks stripped), and records it:

- **Capture** (`capture-browser.ts`, behind the `Capture` service in
  `capture.ts`): `getUserMedia` with echo cancelling, noise suppression and
  gain control off, one channel, the microphone picked from ⌘K (`Choose
microphone: …`, `micCommands`; named in the panel when it is not the
  default; `enumerateDevices`;
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
  `acceptMismatch`). The status line says how to act on a refusal (Accept
  anyway or Record again after a mismatch, Back to hear what a lost
  microphone kept), each control with its key as bound now (`statusOf`). Each beat's attempts (newest first: heard, word error,
  length, kept, recorded for an earlier line) play from their audio route
  and **Keep** makes one the take.
- **After a take is kept and mixed** the machine asks the stage to reload the
  page (`Stage.reload`: the lab's place held, written to the address bar,
  then the page loaded again through `PageLoad`, by way of the page's reload
  gate, `ReloadGate` in `lab/reload-gate.ts`, which holds any reload while a
  take under review or a note being written is the page's alone and says
  what it waits for): the player reads
  the timings and the track once, at load, so the film then plays the new
  take at the same T, back on the same beat (the link keeps it). A mix that
  failed reloads nothing and the status says so. The app serves the
  narration with `Cache-Control: no-cache`, so a reload never plays a take
  the browser cached.
- **Keys**, only while focus is in the Studio: R record (and retake), Space
  stop, K submit (or accept anyway), ←/→ the previous or next beat (at rest
  or after a refusal, never mid-take), Esc cancel, discard or back: the
  `studio.*` commands (`studio/commands.ts`), bound in the `studio` scope
  (Commands and keys, above). There those keys are the Studio's own, even
  with nothing to do now: Space never plays, ←/→ never step a frame, Esc is
  never the lab's. The page's other keys (`[` `]`, `c`, `n`, ⌘Z) still run
  from it; with focus anywhere else the lab's keys work as before. A key with a modifier is another chord and passes
  through, and a focused picker or player keeps its own keys.

The provider (`context.tsx`) builds the Studio's own runtime (the stage, the
studio's routes, the capture), so the shell knows nothing of it, and hands
the section derived values and actions (`view.ts`: the controls each state
offers with their keys, the status line, the meter, the badges), never the
machine's states. The beat is the link's (`beatAt`, `lab/place.ts`): the
one `?beat=` picks, else the path's scene (a beat is a scene's take), so
Record opens where the lab is and Copy link cites the beat. A pasted link
that names a beat the film lists opens in Record, as one naming a note opens
in Note, and leaves the viewer's own mode as it was (`lab/panel.tsx`). A beat picked is
a step Back walks and ←/→ follows in place; the link landing on another beat
(Back, Forward, play into the next scene with none picked) moves a recorder
at rest (`Idle`, `Failed`) to it, and never one mid-take.
`e2e/lab/studio/studio.dom.test.ts` drives the whole panel in
Chrome with a fake microphone.

**Notes** live in `lab/<film>/notes.json` (`NotesFileJson`) with their stills
in `lab/<film>/stills/` (`FILMS_LAB` moves the root; the app ignores it in
git). The file is the source of truth: the lab server and `film notes` both
go through NotesStore, so either works without the other. A note is `{ id,
film, scene, T, local?, frame, cue?: { name, edge }, mark?, range?: { from, to },
box?, ink?, text, status, still, thread, createdAt }`, plus `seq` (the change that made it) and
`changed` (the last change to touch it). `T` and `frame` are film time as
the film was laid out when the note was made; `local` is scene-local time,
how far into `scene` it was made. The lab seeks, marks, pins and labels a
note at `local` into its scene while the film has that scene (`noteT`,
`core/notes.ts`; held on the scene's last frame if a re-take made it
shorter), so a re-take of an earlier beat does not move a later note off
its frame. `local` is an additive, optional field: notes made before it
have none and read at `T`. `range` (`NoteRange`, scene-local seconds, `to`
after `from`) is the stretch of its scene the note is about: the in and out
points marked as it was written, cut to its scene; additive and optional
(a note without one is about its frame). `cue` is the edge nearest the
note of the cue selected as it was written, else of any cue in its scene. A click saves a pin as a zero-size
box. Every change takes the file's next `seq`, so `eventsSince(file, n)`
(`core/notes.ts`) returns each new note, reply and resolve exactly once past
a cursor (a file reset below the cursor, trashed or restored, replays its
log at its own `seq` and a wait over it answers at once, even when the log is
empty, so an open page and `--watch` keep hearing); `wait` polls the file for them (every 200 ms), so it sees a reply
the CLI wrote while the server was waiting. Each change is one
`ContentStore.transact`, as every manifest's is: written whole, one writer at
a time across processes (the operating system's lock on `.notes.json.lock`,
which the kernel lets go the moment its holder's process ends, a crash too,
and which a running holder keeps however long it holds it; a change that
waits past about 5 s fails with `StoreLocked`, and the log says so,
`store.lock.held`). A
note's still is written under the same lock, before the note that names it.

`nearestMoment(placed, T)` (`core/notes.ts`) names the scene at `T` and, in
it, the nearest named-cue edge and `{mark}`; the page computes it from the
layout it draws, so a note carries the cue the viewer saw.

**The page** (`lab/`, Solid 2 around the framework-free preview): the shell
(`lab/shell.tsx`) is compound components. `<Lab.Root>` holds what every panel
shares (the film, its player, the lab API's base, the view kept through a
reload, `T`, the frame drawn last, as a signal, and `scene`, the scene under
it, the selection and the note (the URL's, `lab/place.ts`), and a runtime for
the panels' machines: `Stage`, the preview as they drive it (`lab/stage.ts`:
edits shown in memory, the lab's place held for a write), and
`LabApi` and `NotesApi`, the scene-source and notes routes over the page's
one `LabClient`, a refusal being the server's own class (`lab/api.ts`)); `<Lab.Overlay>` and
`<Lab.Layer>` are pinned exactly over the film canvas and follow it as it
resizes; `<Lab.Strip>` is a slot right under the player's timeline;
the side panel is the page's (`lab/panel.tsx`: the mode tray, the Pen and
Note-this-frame, each tool's section and the notes, rendered on the server
too; the film's other pages are the studio shell's page bar, each tab named
by its `data-page`), and `<Lab.Fill>` puts a staged tool's controls in its
section's slot. Each tool's state lives in its own provider; the
shell knows none of it. A provider's context gives values derived from its
machine and actions, never the machine's state: the editor's receipt (said on the hub) and
`findings`, Compare's `mode`, `layer` (`hidden`, `head` or `now`) and
`split`, the notes' `composerOpen`, `composerTyping` and `draft`; so no
component matches a state's tag, and a renamed state touches only its
module. The browser E2E tests (`e2e/lab/**/*.dom.test.ts`, and
`e2e/player/` for the play page and the Scenes) open the real
page over a probe film in headless Chrome with the lab API faked
(`lab/fixtures/harness.ts`), or served (`openServed`: the page's server
entry rendered, failing any render that writes a signal or a store, then
hydrated with no mismatch; `e2e/lab/fixtures/served.test.ts` proves a
writing render fails), and the page's clock the test's
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
hears, allowed or refused per tab. A tab opened `coarse` has a phone's pointer
(touch emulation, so `(pointer: coarse)` matches), set in the same
uninterruptible step that lends the view and put back before the view is
given back; a view whose pointer cannot be put back is discarded, never lent
again (`lab/fixtures/lease.ts`, its own test over a fake view); a view
leaves the pool only inside that step, so a case interrupted before it
takes none. A view two fingers were down on at once is retired and closed
when given back: Chrome hears no touch on it after. Every other tab has a mouse's pointer (Blink's fine pointer and
hover, set as Chrome starts: headless Chrome has none, and `(pointer: none)`
would give a desk the phone's density). The
touch-target guard (`e2e/lab/touch.dom.test.ts`) opens every studio page
(the Folder with its loose videos among them),
at rest and with what it discloses open (Project's panels and dock, a
scene row's sheet, an act's long-press menu, an inspector, the editor's Snap
toggle and an `until` cue's End field, the Findings sheet, the command menu
with Go to…, the context menu, the keys dialog, the lab's modes, comment
counts, the Choices transport over a picture, a set's wipe and diff, a
film's Scenes with a scene selected), over a synthetic film (`lab/fixtures/studio-film.ts`), on a phone
(390 × 844, a finger, `--hit` 44 px) and on a laptop (1440 × 900, a mouse,
`--hit` 28 px), and fails naming each control whose usable hit area holds
no `--hit` square. The area is what a tap reaches (`lab/fixtures/touch-targets.ts`:
a 2 px grid of `elementFromPoint` over the control and a margin round it,
so padding and a hit-slop count and a covered part does not; a point is the
control's only when no other control is nearer, so a link inside a label is
the link's, never the label's field's); a layer is
measured within itself. The exceptions are WCAG 2.5.8's: a backing input
nothing of which can be seen or pressed, a link on a line of text, and a
target 24 px or more whose `--hit` circle reaches no neighbour's area
(`e2e/lab/fixtures/touch-targets.dom.test.ts` holds the measure to synthetic
shapes). Every page also fits a phone (G8, `fitsPhone`,
`lab/fixtures/phone-fit.ts`): no sideways scroll, each control inside the
width, its chrome at most a quarter of the height
(`e2e/lab/fixtures/phone-fit.dom.test.ts` holds the measure to synthetic
pages). The tab answers the page's requests itself (the
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
notes the whole frame, Escape drops the draft. The Pen and Note frame are
Note mode's, over its notes; `n` and ⌘K Note this frame work in any mode,
and the note begun shows Note. The composer shows
the scene, time, frame and the nearest cue and mark, and pauses playback.
A note written with a selection carries it as a **scope chip**
(`one · rise · t 0.5–1.0 s`: the scene, the cue selected and the in and out
points in scene seconds, the place the lab's link to it names), whose ×
writes that note about its frame alone; the next note starts scoped again.
A drag across a cue's lane on the strip (beside its bar) marks the in and
out points, shown there as a band and looped as Motion's I and O loop them;
a tap on a lane seeks.
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
note id=n1 seq=1 status=open scene=hand T=230.38 local=4.12 frame=6911 cue=topple:end mark=hand box=760,560,400x400 replies=0 still=/…/lab/<film>/stills/n1.png text="…"
```

`T=` is film time when the note was made; `local=` (on a note that has it) is
seconds into its scene, which an earlier scene's re-take does not move: the
note's frame now is the scene's `start=` (`film cues <film> <scene>`) plus
`local`. `range=3.20-4.00` (on a note that has one, its scope chip's range)
is the stretch of its scene the note is about, in the same scene seconds.

`--watch` prints each new note, and each reply from the user (`reply id=…
by=user … still=… text="…"`), once per run, starting past the current cursor
(`--since n` to start earlier): run it under a Claude Code Monitor and each
note arrives as a notification. `film notes reply <film> <id> "…" [--still
file.png]` answers as the agent (the still is copied to `stills/<id>.r<seq>.png`
and the note becomes `replied`); `film notes resolve <film> <id>` closes it.
An unknown id fails with `NoteNotFound`, listing the film's notes.

### Editing cues and knobs

The lab also edits the scene source: a cue's `offset`, `dur` (or an `until`
cue's end, `untilOffset`) and `ease` and a knob's value, each written into the
scene's `.ts` file on a drag's release or a field's commit. The lab
rebuilds its page (`LabPage`) and the open page reloads itself (`lab/rebuilt.ts`)
at the same frame and pick, kept in its place (`/films/<film>/lab/hand?cue=topple#t=…`,
`?knob=palm`); review the
change with `git diff`.

| Route                                              | What it does                                                                                                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/films/<film>/scenes/:scene/source`       | the scene's file and, per cue field and knob, `literal`, `absent` (added on write) or `computed`                                                                                                                             |
| `POST /api/films/<film>/scenes/:scene/cues/:cue`   | `CuePatch` (`offset?`, `dur?`/`until?`, `untilOffset?`, `ease?`, `stagger?`) → the span, the cue resolved, findings                                                                                                          |
| `POST /api/films/<film>/scenes/:scene/knobs/:knob` | `KnobPatch` (`{ value }`, a number or `[x, y]`); answers the value read back and findings                                                                                                                                    |
| `POST /api/films/<film>/undo`, `/redo`             | puts the newest write's file back, byte for byte, or makes the newest undone write again (`{request?}`: an id the step is recorded under; `{change?}`: that change only, while it is the newest, else a 409 `StepNotNewest`) |
| `GET /api/films/<film>/check`                      | `film check --static` now, the latest change, what Undo and Redo would do (each with its `change` id), and the steps `landed` by request id                                                                                  |
| `GET /api/films/<film>/scenes/:scene/head`         | the scene's timeline and knobs at HEAD (`HeadSource`), `codeChanged`, `sameData`                                                                                                                                             |

A scene that is not located is a 404, a value the lab will not rewrite a 422
(so is a cue timing the scene's timeline would not resolve with), an undo with nothing to undo (or a file changed since) a 409.
A cue write is judged, and answered with the cue resolved on its scene's
clock, as the film's files now declare it with the new spans in place, and
the write applied, as the file will hold it (`writtenPatch`: every number to
the millisecond, the writer's one rounding), to the cue's own span where its source computes part of it
(`until: MARK`, which no literal says)
(`film read cue <film> <scene> <cue> --spans <json> --patch <json>`, one fresh process,
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
`{ cue, edge }`, `{ at }`) are editable ends: a `dur` written replaces the
whole `until` property (and its `untilOffset`), keeping the rest of the scene
intact; a right-edge edit writes `untilOffset` after the `until` and keeps it.
An `untilOffset` of 0, or a new `until` without one, takes the key away; one
asked of a cue that runs no `until`, or one in code that would be taken away,
is `SourceRefused`. Their members must be literal and unique, and decode against `Until`; a
computed member, spread, duplicate key or conflicting anchor is refused.
A cue write is also refused
(`TimelineUnresolved`) when the scene's timeline, read back from the new text,
does not resolve on the clock the film's files give now (the fresh `film read
cue --spans` above): an `until` cue's offset typed past its point, or a point
moved since, would end it before it starts (a drag never does: its end is held
at its start, within the resolver's float tolerance, `CLOCK_EPSILON`). A film that does not load in that run is not the write's to judge:
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
current scene zoomed, its words and marks, and one row per cue. On a phone a
scene longer than 8 s shows the 8 s around the playhead, held inside the scene
(`stripWindow`, `lab/editor/grip.ts`), so a cue is a finger wide; a scrub keeps
the window it began in, and a cue's bar is clipped to it. Drag a cue's
body to move its offset, its left edge to move its start (offset and dur),
its right edge to move its end (dur): an edge is the bar's outer 6 px, 14 px
under a finger (`edgeFor`, `lab/editor/grip.ts`). A finger has no
Escape, so while a grip is held the strip's head shows **Cancel drag**,
which lets it go as Escape does (`edit.cancel-grip`). A cue that runs `until` a mark (or a
landmark, or another cue's edge) keeps following it (`dragPatch` in `core/timeline.ts`): its body and left edge move
only its offset, its start held a frame before its end, and its right edge (or
the inspector's End field) sets `untilOffset`, the end's seconds off the point
(negative before it; dropped back on the point, the key goes), never a `dur`,
so a re-take or a drag of the point still moves the end. While the viewer's
Snap is on (`edit.snap`: S, or the strip's Snap toggle; on by default, kept in
the browser as `film-studio.snap`), edges snap to word starts and ends, marks
and other cues' edges within 8 px, else move by whole frames; Shift inverts it
(`placesFreely`): with Snap on it places an edge freely, with Snap off it snaps. While dragging, the frame previews the edit in memory:
an edit is resolved once, where it is made: `film.edit(scene, edit)` resolves
its timeline on the scene's own clock, `sceneClock(p)`, as `layout()` does,
and returns a `Result`: the `ShownEdit` (its cues and knobs, and the literals
they came from) or why it does not resolve (`UnknownScene`, a `TimelineError`).
The lab's stage holds each scene's `ShownEdit` and hands them to the player
whole (`Player.showEdits`), which draws every frame with them (`film.render(…,
{ edits })`, which resolves nothing and never throws for an edit; the film
keeps nothing, so the next frame draws what it is handed); an edit that does
not resolve is not shown, and the status says why. Compare with the last
commit resolves its literals over today's the same way: when they name what today's
narration lacks, it draws no layer and its line says why. The release writes. The
inspector shows the selected cue's anchor (read-only), `offset` and `dur`
fields (the inspector's, stepped by frames; for an `until` cue, an `end`
field instead of `dur`, never before its start, which writes `untilOffset` as
the right edge's drag does, and its point as `until {mark}`, `until speechEnd`
or `until the end of cue "roll"`, with its offset when it has one,
`until {first} + 0.10 s`: `untilEndText`), and an ease picker drawing each curve (the ease is only ever data:
`f.at` takes none, so the picker always changes the frame); its buttons are off, titled with why, whenever a write of `ease` would be refused (`cueRefusal`, as a field's or a drag's is). Knobs take the inspector's fields (a number's name scrubs it, a point's x and y step by pixels); a point knob also gets a handle on the frame.
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
disabled. Undo (⌘Z) and Redo (⇧⌘Z), in the header (`<Editor.History>`) and on a
write's receipt (what it moved, before → after), step the newest write back
and on. Every write, a drag's, a
field's, a knob's, Undo's and Redo's, goes through one effect-machine
(`lab/editor/machine.ts`: `Idle`, `Pressed`, `Dragging`, `Writing`, `Checking`, `Written`,
`Refused`), so two writes never race for a file: a press or a step while
one is out is not taken, and a commit (a nudge, a field) waits as the
`Writing` state's `next`, shown at once (the next nudge moves on from it).
One to the same cue or knob as one waiting joins it (`joined`: a cue's
fields merged, the last asked value of each winning, so an offset nudge
and then a dur field write both); one to another thing waits after it.
Each is written in turn once the write before it lands, so the last value
asked of every field is the one that lands (those that waited on a step,
or on a write that did not land, are not written, and the receipt says
so); a write with no answer in 20 s
(`WRITE_TIMEOUT_S`) is refused and says so, so a hung server never wedges
the editor; an Undo or Redo, which may remix the track first, waits
`STUDIO_IMPORT_WAIT_S`, then `Checking` asks the lab by the id the step's
request carried (`stepRequest`, unique to it): the lab recorded a step
under it (written, with a note to reload once mixed), or did not (refused,
naming the latest change), never judged by a name two changes may share;
Escape during a drag puts the cue back.
The pure parts (`lab/editor/grip.ts`: where a press grabs, snapping, the
patch a drag makes, why a cue cannot be dragged) are shared by the machine
and its tests, which run every transition with no DOM. The knobs' rows
(`<Editor.Knobs>`) and handles (`<Editor.Handles>`, in the overlay) are Solid
(`lab/editor/knobs.tsx`): a handle's press grabs the knob as a `KnobGrip`, and
the same machine previews each move and writes on release; where a handle
sits is pure (`handleOf`, `lab/editor/handles.ts`), and so is how it drags
(`dragKnob`, `lab/editor/grip.ts`).

### Motion, compare and the look-book

**Motion** (`lab/motion/`, Solid 2; the onion painter is framework-free in `player/onion.ts`) never draws on the film canvas. The
onion skin renders the frames around the one shown (± 1–4, every 1–15
frames) at half size, keeps only the pixels that moved (darker than the
frame on a light page, lighter on a dark one) and paints them on a layer
over the film, warm before and cool after, fainter the further away; it
shows on a paused frame. Speed (0.25×, 0.5×, 1×) and loops drive the
player's clock (`Player.setRate`, `Player.setLoop`); narration plays only
at 1×. Each is one chip in Motion's section that opens its commands
(`CommandChip`, `lab/command/command-chip.tsx`, on @bible/ui's Menu: the
commands it names that are available now, `chipRows`): the rate chip (`1×`)
opens Play at each other rate (`rateCommands`, `player/transport.ts`; K plays
at 1×, J and L a rate slower or faster: an editor's shuttle keys, stepping
the rate, never playing backwards), and the loop chip opens Loop the
selected cue (⇧L, and on the cue's long-press menu), Loop this scene, Set
the in point here (I), Set the out point here (O) and Stop looping
(`lab/motion/commands.ts`). A cue loop follows the cue as it is edited; a
cue under 0.2 s loops with 0.4 s either side. The in and out points loop
any range (the machine's A and B; the section says `looping in 00:00:01:00 –
out 00:00:02:00`). The review's synced player has the same rate chip over its rates
(½×, 1×). The loop is one effect-machine (`lab/motion/loop.ts`): `Off | Marked | Range | Cue` on `MarkA | MarkB | LoopCue | Stop | Linked | Unlinked`; a B not after A stays `Marked`, and a range plays from A as it is made, its points kept to the millisecond inside the times marked (A rounded up, as `#t=` is, and B down: `core/time.ts` `onTheMs`, `offTheMs`), so Loop this scene starts in that scene. The range is the link's (`#loop=`): the provider and the link agree, each following the other only where they differ (`Linked` puts a range the link names in the machine without playing, `Unlinked` ends one), and the part of a range past the film's end is not looped (`linkedRange`). The provider plays the state through `rangeOf` each frame drawn.

**Compare** (`lab/compare/`, Solid 2) reads the scene's file at the last
commit (git's HEAD: the page says "last commit" wherever it names it)
(`GET /api/films/<film>/scenes/:scene/head`: `SceneHead` runs `git show HEAD:<file>`
and parses it with the locator and parser the writer uses; read once per
scene while a mode is on, and again after it is turned off and on, so a
commit made since shows) and draws the frame with the last commit's timeline and knobs
through today's code (`player.renderShown`, the frame as the lab shows it,
with the last commit's edit over whatever else the lab previews) on a layer over the
film: wipe (the last commit left of a draggable
divider, its grip a finger's `--hit` across however small the frame shows,
and a slider by the keyboard: `lab/wipe-keys.ts`), blink, or diff (a _difference matte_: the last commit laid over the frame in
the `difference` blend, so what did not change is black and what an edit
moved is lit). A blink is also flipped by hand: on the frame, a press held
shows the last commit until it lifts (a phone's way, where there are no keys). The mode
is one effect-machine (`lab/compare/machine.ts`): `Off | Wipe | Blink | Held | Diff`
on `Choose | Split | Flip | Hold`, a blink flipping itself every 450 ms by the
machine's timeout and waiting while held. The mode is the link's (`?view=off|wipe|blink|diff`
on `/films/<film>/lab[/<scene>]`: each mode the owner picks is an entry, so Back walks
the views; the machine moving on its own is written in place); the divider is the tab's, kept in `film-lab-view:<film>` (`TabStore`) and never in the link. Only data can differ that way; when the file's code
changed since the last commit the panel says so, and a last commit the server cannot give shows the server's reason.

**The look-book** (`player/lookbook-sheet.ts`) is one sheet of the whole film:
the palette (`createFilm({ palette })`) as swatches, then per scene a row of
stills at every cue's start and end and its 60% point (`sceneMoments`, the
moments `film check` samples, less the marks), each labelled with the cue
and timecode. Its stills come from the one source of stills
(`player/stills.ts`) the tape draws from, so the lab shows the film live
as a film's Scenes (`/films/<film>/scenes`, the tape, with the palette in
its view menu) and
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

### The easel: `film look`

A look is a still of a scene as its sources stand, drawn in about a second
with no render: the painter's step back from the easel after a passage. The
lab holds one export page per film open in its own process's Chrome
(`Easel`, `tools/easel.ts`, over the `Browser` a render uses: no second
launcher), at `/films/<film>/play?export` on the lab's own address, and a
look seeks it to the frame and takes the canvas through the view
(`ExportHandle.still`, composed by `player/still.ts`). `film look` is a thin
client of the route (`tools/easel-cli.ts`, an `HttpApiClient` of
`LabHttpApi` at `FILM_LAB_URL`, else `http://127.0.0.1:8229/`); an agent's
tool calls the route the same way.

| Route                          | What it does                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/films/<film>/looks` | `LookPost` `{scene, at: [place, …], view: {crop?, size?, mode, captions, format}, from?, levels?}` → `LookTaken` `{build, looks: [{file, scene, at, frame, time, width, height}]}` |

**Never stale.** Every look first asks the pages' build as it stands
(`LabPage.built`), judged by content, never by mtime: a build under way is
waited out, then the build about to be answered, kept or just made (its
watches and checks set), is judged last, at the moment it is answered: its
files must have printed alike before and after it read them, and print so
still (length and hash). A save no watch has heard yet, one in the build's
own second, one made while the build read, or one landing after it printed
what it read, is built first; files that keep moving through three builds
are a `PagesBroken` asking to look again once the saves settle. A failed
build is a 422 `PagesBroken` with the bundler's words and no still. The
answer names the build by its own number among those kept
(`PagesNow.kept`), and the look opens that build's export page
(`?export&build=<kept>`, served as it was made, unstamped, so it never
reloads itself), never one built after. The page is held per build
(`<server>.<kept>`): a new build closes it and opens a fresh one, so the
page always runs the code on disk; a page that fails a frame is closed too,
and the next look opens another. Looks run one at a time.

**Places and views** (`core/easel.ts`, pure). A place is seconds into the
scene (`2.5`), `mark:<name>` (the mark's word, as `scenesOf` places it) or
`cue:<name>[@<share>]` (0 the cue's start, 1 its end); it resolves to the
nearest frame inside the scene's own frames (`momentOf`) and answers that
frame's time. A mark or cue the scene lacks is a 404 `LookPlaceUnknown`
naming the ones it has, seconds past the scene's end a 422
`LookOutOfRange`, a scene the film lacks a 404 `UnknownScene`, words that
name no place or a crop off the frame a 400 `LookInvalid`. The view crops
(corners in canvas pixels, held to the frame, shown at 1:1), scales the long
side (`size`, 16 to 4096), and draws `plain`, `value` (greys) or `squint`
(greys blurred by 1.2% of the long side, at least 2 px, over the region's
edges stretched outward so the frame's border blurs into itself). A crop is
PNG and a whole frame JPEG at 0.95 unless the format is named
(`formatFor`): a 1920×1080 PNG of the paper is about 4 MB.

**Files.** Each still is written once, under `out/<film>/look/<scene>/`,
named by its time, mode, crop, size, captions and build
(`t0002.33.squint.crop0_0_700_500.b<build>.png`), so a path an agent was
handed keeps its pixels. `from`, the asker's films folder, guards a lab
serving another checkout: it refuses with a 409 `LabElsewhere` instead of
showing its own files. A look whose page fails is a 502 `LookFailed` with
the page's words. The CLI adds `LabDown` (no lab answered, or one too old to
know the route) and checks the request before sending it: one the route
would refuse unread (a `--size` under 16) is `LookInvalid`, asked of no
lab. A failure prints (`--json`, and `film judge --json`) exactly as the
route answers it, decoded by one schema, `ToolFailure` in `core/api.ts`:
the route's refusals, `LabDown`, the judge's own, and `ToolFailed`
(`{failed, reason}`) for any other. Each look logs `easel.look … ms= built_ms= page_ms=
draw_ms=`: the build asked, the page opened (0 when held), the frames drawn
and written.

**Wedges.** `levels` (`{ground: 'light'}`, `film look --level ground=light`)
draws a wedge, the printer's strip at several grades: each look named at
that level in place of the one it plays, the pick unwritten. The easel reads
the film's `palette.ts`, checks each look and level against the ones it
declares (`lookLevels`, `tools/choice-source.ts`; a 404 `LookLevelUnknown`
names them), and edits `play` exactly as a pick would (`editPick`), in
memory. `LabPage.wedge` builds the pages once more with that text in place
of the file (`PageBundler`'s `swaps`, a Bun plugin that also refuses a swap
the build never read), once per build and swap, the last few kept; the
wedge's page is answered at its usual path with `?wedge=<id>` and its files
under `/wedge/<id>/`. Its page is held beside the film's own (four at
most), and its stills carry the levels in their names
(`….wground-light.b<server>.<build>.<wedge>.jpg`).

### The judge: `film judge`

`film judge <film> --scene <id> [--point <id>]` (`tools/judge.ts`, its
words pure in `core/judge.ts`) is a blind second opinion on one picture
choice. A version is what the Choices view picks between for the picture:
a look point's levels (`look:<name>`, each drawn as a wedge through the look
route, so the lab at `FILM_LAB_URL` must run) and a render set's variants
(`render:<address>`, the catalogue's videos at an address that holds the
scene, each cut by `Media.still` at the same film seconds). A sound point
is `JudgePointUnjudged`; unnamed, the scene's one picture choice with two
versions or more is judged, several are `JudgePointAmbiguous`, none
`JudgeNothingToCompare`. The moments are the scene's marks and its cues'
middles, one per frame as a look resolves it (`momentOf` at the film's fps,
counted from the film's start), at most `JUDGE_MOMENTS` (12) spread evenly
(`judgeMoments`); stills are 1280-pixel JPEGs, drawn straight to
`stills/<label>-<nn>.jpg` in a folder of their own under the system's temp
folder, beside `packet.md` and nothing else (a look's stills are copied
there from the lab's own files, which stay the lab's, so judges at once
never take one another's). The labels are drawn
by `Random.shuffle`; the key (`JudgeKey`) stays in memory until the counsel
has answered, and is never in `packet.md` (`packetOf`): the beat's words, its picture's brief,
its register (`registersOf`, the head of the brief) and act, the app's rules
that bear on it (`FilmApp.judge.rules`, each a heading of a file, for every
beat or for a register; a heading its file lacks is `JudgeRuleMissing`),
the stills by label and moment (each by its path beside the packet), and
the form of the answer; it names no place (a rule's file by its name
alone). The counsel is a seam (`Counsel`, `tools/counsel.ts`) with two
adapters. `Counsel.layer` runs `okra counsel --deep --from claude -f
/judge/packet/packet.md -o /judge/answer` (Codex) in the counsel's sandbox
(`tools/sandbox.ts`, bubblewrap): a mount namespace that starts empty and
shows only `/usr` and its merged links, `/etc`, the resolver's folder, a
fresh `/proc`, `/dev` and `/tmp`, the packet's folder read-only at
`/judge/packet` (the working folder), a temp folder written at
`/judge/answer` (okra's prompt copy and run folder land there, copied into
`<run>/counsel/` once it is done), okra's program, Codex's package and
Node under `/judge/tools`, and a home of its own holding only Codex's
sign-in (written, so a refreshed token lands in place), its settings and
model lists (`okraRun`). The environment is cleared but for `PATH`, `HOME`
and `LANG`. So no earlier run's folder, no look file, no repo, no cache
and no home is there to read. The network is shared (Codex needs the
internet), so the lab's loopback port stays reachable, though nothing in
the sandbox names it. It reads the `codex.md` or `claude.md` written,
its sandbox paths said as the host's (a non-zero exit is
`CounselFailed`, 124 its time out); `Counsel.sandboxed` runs any command
so (the tests probe the sandbox with one); `Counsel.layerTest` answers
from a function of the packet. Its last `RANKING:` line is read (`rankingOf`: a
whole expression, every label once, `>` between tiers, `=` a tie, nothing
after; or exactly `no preference`; else `CounselUnreadable`) and unblinded
into `verdict.md` (`verdictOf`) in the run's own folder,
`out/<film>/judge/<scene>-<stamp>-<draw>/` (made by an exclusive mkdir, so
two runs never share one), beside the stills, the packet (as it was read)
and `key.json`: the ranking in real names beside the owner's pick
(the level the look plays, the render set's approved variant), the key, the
reasons with each label's heading named, and the counsel's answer and
packet by path. The judge writes no choice. It logs `judge.drawn label= stills=` per version and `judge.done
… ms=`.

## Review

The review is the lab's home page (`/`, served by `film lab`): every render
under the review's roots, compared in sync, and each film's options, picked
where they are heard. Each film on it is a card that opens its Scenes (its
other parts in its menu, `filmCommands`), its state as its Project's head
says it: the state band and `0/20 approved · 20 out of date` (`filmCounts`),
from the film's project read with the page; every move between parts is the
shell's page bar (Films · Scenes · Lab · Choices · Project · Play), the film
switcher or a command, never a link in a page's text. It is the lab's
server's (`tools/review.ts`, `review-http.ts`, `choices.ts`,
`choices-http.ts`, `project-http.ts`) and one Solid 2 page (`lab/review/`,
its options in `lab/review/options/`), rendered on the server first
(`lab/review/server.tsx`) and hydrated in the browser (`lab/review/mount.tsx`),
dark and made for a phone first.

**Terms.** The page uses the words of a film review room; the code keeps its
own names, and the stored and wire words stay as they are.

- **Versions** (a version stack): the renders of one address side by side on
  one clock. The code calls it a set (`ChoicePoint` of kind `render`), each
  version a variant.
- **Side by side**: the first version against one other (the view `pair`),
  offered only on a stack of two or more.
- **Wipe**: the same two stacked full width on the one clock, the first left
  of a divider and the other right of it (`?view=wipe&other=<id>`). The
  divider is dragged by its grip, or moved from the focused grip as a
  slider is (`lab/wipe-keys.ts`: ←/→ and ↓/↑ a hundredth of the frame, ⇧ ten, ⌥ a thousandth,
  Home and End its edges, through the keymap's `slider` focus, which owns
  those keys); where it sits is the page's, not the
  link's, since a different split shows the same comparison. Where the
  browser can, the two play as **WebCodecs panes** (`browser/frame-pane.ts`
  over mediabunny in `browser/webcodecs-browser.ts`, reached through
  `Media.compare`; only this page's host is built with them,
  `BrowserHost.withMedia(panesMediaLayer)`, so no other page loads the
  decoders): each master decoded to
  a canvas, both read from one monotonic clock (`media-clock.ts`) and drawn
  in lockstep (each frame, both show the frame their time asks for or
  neither moves on, so a slow decoder holds the pair), so they are frame
  for frame together rather than within the sync's 0.2 s, and a scrub shows
  the key frame at once and then the exact frame. The player is chosen by
  capability (`media-choice.ts`): `VideoDecoder`, the picture decodable, and
  the sound decodable (`AudioDecoder`), PCM, or absent. A phone, a browser without WebCodecs, or a
  master that will not open plays on `<video>`, which keeps every action;
  the frame says which in `data-engine` (`asking`, `webcodecs`, `video`) and,
  on `<video>`, why in its tooltip. The panes' sound plays through the page's
  one sound context (`media-browser.ts` `pageSound`, set to `playback` on Safari so it plays
  through the silent switch), only at 1× (another rate would change its
  pitch). A hidden page stands the panes (clock and sound stopped, decoders
  and frames still decoding let go) and, shown again, they draw afresh and
  play on as they were; the masters' inputs are the wipe's from the moment
  they open, so an opening that fails or is cut short lets every one go.
- **Difference** (a _difference matte_): the other's still laid over the
  first's at one moment in the `difference` blend, black where the two are
  the same and lit where they differ (`?view=diff&other=<id>&m=<n>`, ←/→
  between moments). It stands on stills the server cuts at the same instant,
  never on the playing videos, which the sync keeps only within 0.2 s.
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
A score's pick and a level's knob change what `full.wav` is mixed from, so
once the write of `sound.ts` lands the track is mixed again (`film mix
<film>`, fresh), and again on its Undo and Redo, as a kept voice's is (the
rewrite's `follows`, `Follows.remake` in `tools/source-writer.ts`, which
answers when its track landed, `Remade`); a failed mix is logged
`lab.remake.failed` and the write stands, naming no mix.

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

| Route                                                                           | What it answers                                                                                                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/review/index[?fresh]`                                                 | `ReviewIndex`: every folder with something to review, newest first                                                                                                             |
| `GET /api/review/files/<ref>`, `/api/review/phone/<ref>`                        | the file, or its phone copy, byte ranges answered 206                                                                                                                          |
| `GET /api/review/frame?ref=&t=&w=`, `/api/review/duration?ref=`                 | a JPEG of a video at `t` s, `w` px wide; its length                                                                                                                            |
| `POST /api/review/sets/<folder>/<point>/say`                                    | `SetSayPost` `{variant, say}` → `ReviewFolder`, written to the folder's `catalogue.json` (a montage refused; a version made again since it was shown is `VersionChanged`, 409) |
| `GET /api/films`                                                                | `ReviewFilms`: the app's films                                                                                                                                                 |
| `GET /api/films/<film>/choices`                                                 | `FilmChoices`: the film's renders (the pictures) and its points                                                                                                                |
| `POST /api/films/<film>/choices/pick`                                           | `PickPost` `{point, variant, verb, acceptMismatch?}` → `ChoiceWrite`                                                                                                           |
| `POST /api/films/<film>/choices/knob`                                           | `KnobPost` `{point, value}` → `ChoiceWrite`: the level written                                                                                                                 |
| `POST /api/films/<film>/choices/say`                                            | `SayPost` `{point, variant, say}` → `FilmChoices`, the say recorded                                                                                                            |
| `GET /api/films/<film>/choices/alone?point=&variant=`                           | the variant's own file (a take, a voice attempt)                                                                                                                               |
| `GET /api/films/<film>/choices/mix?point=&variant=`                             | the film's whole mix with that variant in place (m4a)                                                                                                                          |
| `GET /api/films/<film>/choices/check`                                           | `SoundCheck`: `film check --sound` as the film now stands                                                                                                                      |
| `GET /api/films/<film>/project`; `POST …/say`                                   | `ProjectView`, read or written by a fresh `film project` (above)                                                                                                               |
| `GET /api/review/build?since=&server=&film=&timeout=`                           | `PageBuild`: the pages' build, once past `since`, a mix of `film` among the changes (at most 60 s)                                                                             |
| `POST /api/films/<film>/undo`, `/redo`; `GET /api/films/<film>/check`, `/steps` | the lab's own, for the film named; `steps` its undo and redo alone                                                                                                             |

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
`UndoUnavailable`, a 409, touching nothing: the check, the takes brought
back, the write and the takes put away all hold the file's store lock); a new change drops what could be redone. The file a change
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
routes and the options'), where the page is (its place, read from the URL
through the host's `UrlState`, so a link, Back and a reload work; see Pages
and links), the index, the films, the quality (Proxy or Original) and the
lightbox. The header is the studio's shell (`PageShell`,
`lab/page-shell.tsx`): Films, the film switcher, the page bar, a drill-down
crumb and Go to… (⌘K: Go to finds a folder, a set, or a film's choices or
project by name, `destinationsOf`, and on a film's choices each choice
point, `pointDestinations`; home lists every folder, with no filter
field). Choices opens with a kinds strip once it shows two kinds (Score,
Looks, Sounds, Voice, Levels, each with its count): a tap goes to the kind's
first point as Go to does. Going to a point is one step Back walks: its
card in focus (`?point=`, a Show only that hides it cleared), in view, and
the keyboard on its first control, so the next audition is its own. A card in focus on Choices is its `?point=`, and the sheet open on
Choices or on a set is its `?inspect=` (`useInspectorPlace`), so a link
opens it and Back closes it.
Refresh (`review.refresh`) and the copy played (`review.quality`: Play the
proxies, Play the originals) are the page's commands, in ⌘K and the page's
long-press menu; a proxy still being made still offers its original in
place. A Folder's loose video shows its picture and name; its file is its
long-press menu's (`review.file-open` Open the file, Copy link to the file,
`review.file-info` Info: its size, age and proxy; UR-17). On a film's choices and its project, Show only… (`review.only-stale`,
`review.only-unapproved`, `review.only-comments`, and `review.only-all` to
show every point again; AA-14) keeps the points in one state: out of date (a
stale variant), awaiting approval (its picked variant, or any while none is
picked, not approved) or with comments. The state is the link's `?only=`,
each choice replacing the entry, and while it holds a line over the points
says so with Show every point. A point with a finding is not one of them:
a finding names an address, not a point. A set's page holds one effect-machine actor, the synced player
(`machine.ts`: `Paused`, `Playing`, `Scrubbing`, `Buffering`; one clock, the
first variant's; one sound heard; opened at the URL's `#t=`, which follows
it), and shows the view its URL keeps (`All`, `Pair` shown as Side by side,
`Wipe`, `Moments`, `Diff` shown as Difference, `Notes`; a set of one version has
no pair, wipe or difference, and a link asking for one opens All; the pair,
its wipe and its difference share the other chosen, and the moments and the
difference share the moment): a view chosen runs through the view machine (`stepView`)
and is written back, a new history entry for a view or a moment chosen,
the same entry for a pair's other cycled or a ←/→ step. `sync.ts` is the driver
that makes every `Playable` on the set's clock (a `<video>`, an `<audio>`,
or a wipe's WebCodecs pane) follow the player: it puts drifters back on the clock, holds all while one stalls, and
unmutes only the one heard. A film's page (`options/`, `<FilmProvider>`)
puts its newest render on that player, muted, and one `<audio>` of the mix
heard over it: 🔊 on a variant heard in place (a score option, a take) swaps
it, and it joins where the clock stands. What plays is the URL's
(`?heard= &variant= &picture= #t=`, each replacing the entry), so a link
opens the same sound over the same picture at the same time. A point's
marks jump the clock there. Every point is one card (`options/choice.tsx`): its variants with
their verbs (Pick at rest; Unkeep and Reject, as the state allows, in the
variant's menu and inspector), a hear-alone button (▶, ■ while it plays:
the page's one alone player, `audio.rv-alone`; starting one pauses the
film and stops any other, and playing the film stops it), approve (a current
variant only: `Choices.say` refuses a stale or missing one with
`VerbRefused`, 409; at rest on the picked one), unapprove once approved, and
the comment box (both in the inspector); a level point's knob is a slider, written on release. Every say is
one `POST …/choices/say`, answered by the film's choices with it recorded,
which the page shows as they are. Undo and Redo are the page's commands
(⌘Z, ⇧⌘Z, the receipt's button, the page's menu), naming what they would
undo or redo (`Undo score play brass`); the film's static check is the one
the write answered, and after a pick or a knob `film check --sound` runs
(`GET …/choices/check`): its receipt says it is running, then its findings
count. No chip counts them at rest on Choices (Project's film panel has
them): Show findings (⌘K, the page's long-press menu) opens the
**Findings** sheet (`options/findings.tsx`, `review.findings`): each
check's findings grouped, a timed one with its timecode, which seeks the
picture there; F and ⇧F walk the timed findings forward and back. A write is
shown from its answer: the page reads nothing again but the undo and redo
(`GET …/steps`, no check) and, after an undo or a redo, the choices. The
answer updates the player in place: the picture's `<video>` stays the same
element while the film has a picture, so a playing film plays on through a
pick, a knob or a say; only a source write asks for the mix heard again.

The project view (`/films/<film>/project`, `options/project.tsx`; its open
sheet is its `?point=`, a part's render point, `render:scenes:<id>`,
`render:act:<name>` or `render:film`, owned by the URL through
`useInspectorPlace`, so a link opens it and Back closes it; an old project
link to a choice's card goes on to that card on Choices, `legacyPlace`) is
the film by its address tree, laid out as a DAW's arrangement: the film's
panel (its name, length, `n/N approved · n out of date · n not rendered`, the check's findings
as a count chip, a state band of a segment a scene, and its picture), then
each act a panel (its name, scenes, length and approvals) holding its
scenes, then the scenes in no act. No choice's card is on it: Choices holds
every one. An act's and the film's say ("Approve all current", "Unapprove
every scene"; "Approve the act's current scenes", "Unapprove the act's
scenes") is in its inspector, its context menu (a long press or a
right-click on its panel) and ⌘K, and its inspector holds its counts, its
comments and comment box and the choices placed in it; an unapprove is
offered while a scene of the part holds an approval (an earlier version's
too). Each scene is the scene card a film's Scenes shows
(`lab/scenes/card.tsx`, One surface): at rest its picture is a still of its
middle drawn from the film's code in the browser (`options/stills.tsx` over
`player/stills.ts`'s `makeStills`, the tape's one source; the server's
render draws none); then its length (the project says where each scene sits,
`ProjectScene.span`), its name (a tap opens its sheet), its marks as chips (out
of date, not rendered, approved, approved earlier, its findings; each says
in full why as its title: stale by its sources or by the film's sound alone),
a comment dot when something was said of it, and Approve (`render first`
while not current). Its sheet is the same card at full size (in, out and
length in timecode, Approve and Unapprove), playing the video this
checkout's catalogue records for it (`ProjectView.videos`, never another
folder's of the same film), else the still; its findings, its comments and
comment box (a missing scene takes one too), Info (its state, its approval,
the command that renders it), Open in Lab, Versions (once rendered, when
the roots hold its folder), and "Choices in this scene": a link to each
choice that plays in it, placed there or a layer placed elsewhere. Each
point is placed once, at the narrowest part holding every scene it plays in
(a scene, an act, else the film), and listed in that part's sheet ("Choices
in this act", "Choices of the film"); a click runs **Open on Choices**
(`review.open-on-choices`, also in ⌘K), opening its card on Choices
(`/films/<film>/choices?point=`), and Back returns. An approve's receipt
offers Undo (`project.undo-approve`): a `Withdraw` `given` that approve's op,
so it takes back exactly the approvals it gave (`Project.gave`, each
`Approval.op`), never one given since, and says what it took
(`Project.took`). The film's transport is docked (`.sh-dock`: over the tab
bar on a phone, under the header on a laptop); while the film has no
render, the dock says "No render of the whole film yet" (its scenes'
renders may all be there: what is missing is the film's). Each say answers the fresh `ProjectView`, which the page
shows in place (a playing clip plays on, a half-typed comment stays); a
source write reads it again (`data-reading` on the film while it does). The
answers land in any order, so the page shows the newest asked
(`lab/review/asked.ts`): a read asked before a say and answered after it is
dropped, a say answered after a read asked later reads the project again, and
so does an approve refused (`VerbRefused`) because a scene went stale since
the page read it. The choices page keeps its choices the same way. Each control writes on a
run of its own (`useWrite` in `lab/review/loaded.tsx`: a verb, a knob, an
approve, a comment box, the Undo and Redo commands): it waits, disabled, until its own
answer lands, while every other control stays free, and a write sent
meanwhile neither cancels it nor hands it its answer. A write's answer
reaches the page only as `Landed` (`asked.ts`): what it says of the choices,
the check or the project shows only where no write asked after it has shown
its own, so a clean check landing late never hides a newer warning. The
page's receipt (`writeStatus`) says each write busy as it is sent, in the
words its control gave then (what it moves, before → after), and once
answered says the newest asked of those answered, so an older success never
hides a newer failure. A say box
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
`film/touches-serial` (`lint/touches-serial.ts`) holds the browser tests
(`e2e/`): a finger (`page.finger`, one or two) is read, and the touch gesture
(`touch`, `lab/fixtures/gestures.ts`) called, only inside a `test.serial(…)`
body, since while one tab's touches are under way Chrome drops, or lands as a
bare click, the touches a file's other cases send their own tabs at the same
time.
`film/no-history-comment` (`lint/no-history-comment.ts`) holds every comment
in `packages/film` and `apps/animations`: a comment says what the code does
today and why, and how it got here lives in the ledger and `git log`. It
refuses the forms history takes on its face: a loop pass by number, a batch
id, a commit hash, and "used to" said of what the code did (not "is used
to"). History told in other words is the sweep's to find.
`lint/plugin.test.ts` runs oxlint over the marked fixtures: every RED
location must report its rule, with no extra findings. Representative
diagnostics for all thirteen rules also assert the corrective message,
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
recording and pixel assertions. The gate does not run it; CI runs it in its
own `e2e` job beside the gate (`.github/workflows/gate.yml`), over the
runner's Google Chrome named by `BUN_CHROME_PATH`. The fake server answers
only paths `LabHttpApi` declares (`declares`, `core/api.ts`): a fake matching
any other path answers a 500 naming it, so no case passes over a route the
real server does not serve.

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
tests and the browser all read it; `tools` is Bun-only. `canvas` may import `core`; `player` may import both. `.oxlintrc.json` holds the import direction with `no-restricted-imports`: `core` imports no `canvas`, `player`, `tools`, `lab` or `browser`, `canvas` no `player`, `tools`, `lab` or `browser`, `player` no `tools` or `lab`, `browser` (the host's adapters) no `player`, `tools` or `lab`, and `command` (the commands, the keymap and the selection, shared by the player and the lab) no `player`, `tools` or `lab`.

**The host** (`src/browser/`): every browser API a page reaches goes through
an Effect service there, each with its live adapter (`*-browser.ts`) and a
test layer beside it. A page's root (`mountRender`, `mountPlay`, `mountLab`, `mountReview`) builds the
page's host once from `BrowserHost.layer` (`browser/host-browser.ts`,
`hostOf` in `browser/host.ts`) and hands it on: the lab's, the studio's and
the review's runtimes take it as a layer (`hostLayer`). A page the lab
renders on the server gets `ServerHost.layer(url)` instead
(`browser/host-server.ts`, through `ServerHosted` in `lab/page-server.tsx`):
the request's URL, read only and with no hash, and every other service
inert, answering as a phone held upright (`Viewport.layerPhone`). `browser/` is
framework-free, so the player may import it. Per-viewer settings go through
Effect's `KeyValueStore` (`browser/storage.ts`): `TabStore` over the tab's
session (the lab's view, `film-lab-view:<film>`, and the receipts,
`film-receipts`, each a `keptJson`) and `ViewerStore` over
local storage (the keymap, `film-keymap`, a `keptJson`; `film-lab-mic`,
`film-review.quality` and the `film-studio.*` conveniences, each a
`keptText` stored as plain text), each a store
in memory when the page may not use its storage. Every drag (the
player's track, the strip's scrub and its cue bars, a knob's handle, the
wipe's divider, a note's mark) follows its press through `Pointer`
(`browser/pointer.ts`), which ends it once: lifted, or ended by the browser
(`pointercancel`, `lostpointercapture`, or the page left mid-press: the
window's `blur`, the tab hidden). A surface (the strip, the notes,
the editor's grips, a divider, the blink, the tape) follows one press at a
time (`Pointer.press`): a second finger's press on it does nothing. The
lint refuses a press's end heard, or its capture taken, anywhere else
(`film/host-events-through-adapter`). Every key goes through one listener
per page, the hub's (Commands and keys, above), over `Keys.listen`
(`browser/keys.ts`), which hands each press with its key, its physical code
and its target, and drops one already handled or still composing. Every
animation frame (the player's play loop, the review's synced loop,
the compare and onion paints) goes through `Frames` (`browser/frames.ts`):
`loop` steps inside each frame's own callback, `coalesce` paints once a
frame. Every time read goes through Effect's `Clock` on the host
(`monotonicMs`, `timersOn` in `player/throttle.ts`), so a test's clock
reaches it. Every media element is driven through a `Playable` (`browser/media.ts`;
`playableOf` makes one of a `<video>` or an
`<audio>`): time is read from it, a seek is done once its frame is shown,
play and pause are effects. `Media` says what a refused play means
(`Blocked`, `Aborted`, `Failed`), plays muted when the browser refuses
sound (`playOrMute`, the review's players), makes the narration's audio,
and says which engine a compare plays on (`compare`: WebCodecs panes, or
`<video>` and why), its clock the host's `monotonicMs`.
Every copy goes through `Clipboard` (`browser/clipboard.ts`; the browser's in
`clipboard-browser.ts`): a link written whole, against the page's origin, and
a refusal (`ClipboardRefused`) in the browser's words.
A page's media queries go through `Viewport` (`browser/viewport.ts`;
`useMatches` in a component), whose live adapter is the window's
`matchMedia`, and the only reader of it: the WebCodecs player's
`(pointer: coarse)` probe asks the host's `Viewport` too.
Every request goes through Effect's `HttpClient`: a page's calls through its
one `LabClient`, built once at its root (the review's routes and its
choices' share it; on the server, `LabClient.layerRendering`, whose reads
come back to the lab's own handler, `PageReads`, and go with the page for
the browser to adopt), and a film's timings through `loadNarrated`
(`narratedFilms` takes the client's layer, the page's `fetch` client unless
given). Every link to a review place is the one `Go` (`review/context.tsx`):
a plain click goes there in the page, a modified click is the browser's.

The lint holds the host to its adapters in the lab, the player, `browser/`,
`command/` and the app's page entries (`.oxlintrc.json`): `no-restricted-globals` and
`no-restricted-properties` refuse the host's storage, frames, requests,
media and recording, media queries (`Viewport`), timers, clock and URL, bare or through `window`/`globalThis`/`self`,
each naming the service that owns it, and every chain of the global object
to itself (`globalThis.window`, `window.top`, `parent`, `document.defaultView`),
so no chain reaches a name past its ban; `effect/noReflectGet` refuses
`Reflect.get(window, …)`; `film/host-events-through-adapter`
(`lint/`) refuses a window or document listener for a navigation, key or
drag event; `effect/noGlobals` holds in the player as everywhere. The
fixtures and tests are the host's side and exempt; a live adapter
(`*-browser.ts`) is not: each line where it reaches the one host API it
adapts says so (`oxlint-disable-next-line`, with why), so an adapter that
reaches another's API is red as a page is. No page imports a live adapter's
module (`no-restricted-imports`): only a page's mount builds the host
(`BrowserHost`), the two stores are `storage-browser.ts`'s, and the review's
and the studio's mounts build theirs with an adapter of their own. The address bar is `Location`'s alone (`@bible/url-state`'s
`location-browser.ts`): no film file reads or writes the URL directly.

Frames stay pure: no `Math.random`, no wall clock, no state carried between
frames. Seed randomness by key (`f.hand(key)`, `random.ts`); another scene's paper, torn as it tore it, by `f.handsOf(drawing)`. Another scene's framing, as that scene reads it (a lab edit included), by `f.knobsOf(drawing)(knob)`: a callback reads the knob where it lives, so a drag moves both scenes.

```sh
bun run gate   # repo root, as CI: lint, format check, every package's typecheck, build and tests
```
