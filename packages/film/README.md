# @bible/film

The engine behind the cut-paper explainer films in `apps/animations`: a film
is an ordered list of narrated scenes, laid end to end on a clock set by the
recorded words, and every frame is a pure function of that film and a time.

## Entry points

| Import               | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`   | The clock: easing and `progress` (`time`), seeded noise (`random`), `{mark}` narration timing, named cues (`timeline`), the sound plan, scene `layout`, and the mix: `mixPlan` (what plays where) and `renderMix` over planar PCM (`audio`, `dsp`: the ffmpeg filters it replaced, ported).                                                                                                                                                   |
| `@bible/film/canvas` | The Canvas 2D draw kit (ink, cutout, paper, type, IK limbs, figure, multiplane camera, storyboard), `createFilm`, which composites any `T`, and the text probe (`probe.ts`) `film check` reads.                                                                                                                                                                                                                                               |
| `@bible/film/player` | `mountPlayer(films)`: the scrubbable preview, whose track marks marks, cues, sound effects and music acts (`core/ticks.ts`), the `?export` handle (`ExportHandle`) a renderer drives, and the lab (`?lab`, `lab.ts`): notes on frames, and cue and knob editing (`lab-edit.ts`), motion tools (`lab-motion.ts`), compare with HEAD (`lab-compare.ts`) and the look-book (`lookbook.ts`). `player.css` styles it.                              |
| `@bible/film/tools`  | The `film` CLI (`runFilmCli`) and its Effect services: FilmRepo, ContentStore, ElevenLabs, Media (mediabunny + mpg123 + WASM AAC: durations, decode, WAV, joining a film), Narrator, Composer, Mixer, Browser, PreviewServer, Renderer (`render-plan.ts` is its pure plan), Checker (`check.ts` holds its pure detectors), NotesStore, the lab's routes (`lab.ts`) and its source editing: SceneSources, SceneWriter, SceneHead, StaticCheck. |

## Data

`core/schema.ts` holds the Schemas for everything a film reads or writes:
`Timed` scenes, `Beat` (a script's beat: `Timed` plus `cite` and a `picture`
brief), `Voice`, `Timings` (`narration/timings.json`), `Sound`, and
`SoundManifest` (`sound/manifest.json`). The TypeScript types derive from them.
`TimingsJson` and `SoundManifestJson` decode a file's text and encode it back
byte for byte; the request hashes (`voiceKey`, `musicKey`, `effectKey`) are
taken over Schema-encoded requests, so a committed hash stays current.

## Tools

`film narrate|score|mix|cues|check|render|lab|notes <film>` (and `film doctor`) runs from the app that holds the
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
`BrowserMissing` carries the install command) and the `elevenlabs` CLI and its
login (`auth status`, free), reports each, and fails if any is missing.
`narrate` and `score` run the ElevenLabs check before their first paid call,
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
position). Failures are `MediaFailed`. No ffmpeg binary is involved anywhere.

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
disagreeing; it removes the takes the timings no longer name, and partial
writes, at the start and end of every run.

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
use. A contact sheet is composed in one page (`player/contact.ts`). An
uncaught error in the page is a `PageError`, never a log line. A missing
browser is `BrowserMissing`, whose message is the install command.

## Lab

`film lab <film>` serves the player in development mode (the bundle rebuilds
and hot-reloads as scenes change) at `?film=<film>&lab`, prints that URL,
and runs until Ctrl-C, which stops the server and the routes with the
command's scope. The framework owns the routes (`lab.ts`, an `HttpRouter` web
handler over NotesStore); the app mounts them at `/lab/*`:

| Route                                    | What it does                                                         |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `GET /lab/notes`                         | the film's notes file; its `seq` is the cursor                       |
| `POST /lab/notes`                        | a new note: `NotePost`, a `NoteDraft` plus the frame as a base64 PNG |
| `POST /lab/notes/:id/reply`              | the user replies (`ReplyPost`); the note opens again                 |
| `POST /lab/notes/:id/resolve`            | resolves it                                                          |
| `GET /lab/notes/wait?since=<n>&timeout=` | the changes past cursor `n`, long-polled (at most 60 s)              |
| `GET /lab/stills/:name`                  | a still (`n3.png`, `n3.r5.png`); any other name is a 404             |

A bad body is a 400, an unknown note a 404, and every failure is logged.

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

**The page** (`player/lab.ts`, plain DOM over the preview): on the canvas a
click pins a point, a drag draws a box, and the Pen toggle draws freehand
ink; `n` notes the whole frame, Escape drops the draft. The composer shows
the scene, time, frame and the nearest cue and mark, and pauses playback.
Saving redraws the film canvas at that frame and sends it (`canvas.toBlob`)
as the still. Every lab mark lives on an SVG layer over the canvas, never on
the canvas, so a still, an export frame and a probe are the film's pixels
alone. Notes appear as pins through the timeline (the tick machinery, hover
for the text) and in a side list with their status, still and thread,
newest first; clicking one seeks to its frame and draws its box and ink
there. The selected note takes a reply or a resolve. A long-poll on
`/lab/notes/wait` refreshes the list the moment the agent replies.

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

A scene that is not located is a 404, a value the lab will not rewrite a 422,
an undo with nothing to undo (or a file changed since) a 409.

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
computed key, a shorthand) and names it. Writes run one at a time and are
uninterruptible (the reload a write causes drops its request). The last write
can be undone once, only while the file is exactly as that write left it.

**StaticCheck** (`static-check.ts`) runs `film check <film> --static
--allow-stale` in a new process after each write (this one imported the
scene modules at start) and returns its findings, which the lab lists.

**The editor** (`player/lab-edit.ts`): a strip under the timeline shows the
current scene zoomed, its words and marks, and one row per cue. Drag a cue's
body to move its offset, its left edge to move its start (offset and dur),
its right edge to move its end (dur). Edges snap to word starts and ends,
marks and other cues' edges within 8 px, else move by whole frames; shift
places them freely. While dragging, the frame previews the edit in memory
(`film.preview(scene, edit)` resolves the edited timeline on the scene's own
clock, `sceneClock(p)`, as `layout()` does); the release writes. The
inspector shows the selected cue's anchor (read-only), `offset` and `dur`
inputs, and an ease picker drawing each curve (the ease is only ever data:
`f.at` takes none, so the picker always changes the frame). Knobs take number inputs; a point knob also gets a handle on the frame.
`RenderOptions.knobs` records each read with the canvas transform at the
read (`KnobRead.transform`, like the probe reads it), so the handle sits at
`transform · value` and a drag maps the pointer back through the inverse
(`core/affine.ts`), to whole units of the knob's own space: a knob read
inside `at(...)`, scaled or tilted, drags where it is drawn. Read inside a
transition's layer, or under two different transforms in one frame, it is
numbers only, and the inspector says why. A field computed in source is shown
disabled. Undo write reverts the last write.

### Motion, compare and the look-book

**Motion** (`player/lab-motion.ts`) never draws on the film canvas. The
onion skin renders the frames around the one shown (± 1–4, every 1–15
frames) at half size, keeps only the pixels that moved (darker than the
frame on a light page, lighter on a dark one) and paints them on a layer
over the film, warm before and cool after, fainter the further away; it
shows on a paused frame. Speed (0.25×, 0.5×, 1×) and loops drive the
player's clock (`Player.setRate`, `Player.setLoop`); narration plays only
at 1×. A cue loop follows the cue as it is edited; a cue under 0.2 s loops
with 0.4 s either side. A–B loops any range.

**Compare** (`player/lab-compare.ts`) reads the scene's file at HEAD
(`GET /lab/scenes/:scene/head`: `SceneHead` runs `git show HEAD:<file>`
and parses it with the locator and parser the writer uses) and draws the
frame with HEAD's timeline and knobs through today's code (`film.render(…,
{ edit })`) on a layer over the film: wipe (HEAD left of a draggable
divider) or blink. Only data can differ that way; when the file's code
changed since HEAD the panel says so.

**The look-book** (`player/lookbook.ts`) is one sheet of the whole film:
the palette (`createFilm({ palette })`) as swatches, then per scene a row of
stills at every cue's start and end and its 60% point (`sceneMoments`, the
moments `film check` samples, less the marks), each labelled with the cue
and time. The page composes it with `film.render`, so the lab shows it live
(`?film=<film>&lab&lookbook`, a still opening that frame in the lab) and
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
  sits still there, is a `PlateOffFrame`. Findings merge per scene and text
  (or pair), at the worst sampled frame.

The probe lives in `canvas/probe.ts`. `write`, `block`, right-to-left text
and the captions record their text through it; `stroke` records its drawn
centre line, `fill` and `cutout` their outlines (a `hatch` is texture and
does not record). A drawing declares the plate its text sits on (a torn tag)
with `probePlate`, because a plate hides what is under it as the text does.
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
the scene and the cue. `f.cue(name)` reads a resolved cue and `f.at(name)`
its eased progress. A span declares its easing as data, `ease: 'inQuad'` (one
of the names in `ease`, `EaseName`), and a span without one eases
`inOutCubic`, as `progress` does. `f.at` takes no ease of its own: the ease
lives in one place, so the lab's picker always changes the frame. With `drawing(...)`, a name the timeline lacks, in
`f.cue`, `f.at` or a span's `after`/`with`, is a compile error
(`canvas/drawing.types.ts` holds the checks). The sound plan's `cueTime` reads the same map, so picture and
sound cannot drift apart. Ornament (wobble, idle motion) stays inline.

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
