# @bible/film

The engine behind the cut-paper explainer films in `apps/animations`: a film
is an ordered list of narrated scenes, laid end to end on a clock set by the
recorded words, and every frame is a pure function of that film and a time.

## Entry points

| Import               | What it holds                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`   | The clock: easing and `progress` (`time`), seeded noise (`random`), `{mark}` narration timing, named cues (`timeline`), the sound plan, scene `layout`.                                                                                                                               |
| `@bible/film/canvas` | The Canvas 2D draw kit (ink, cutout, paper, type, figure, camera, storyboard), `createFilm`, which composites any `T`, and the text probe (`probe.ts`) `film check` reads.                                                                                                            |
| `@bible/film/player` | `mountPlayer(films)`: the scrubbable preview, whose track marks marks, cues, sound effects and music acts (`core/ticks.ts`), and the `?export` handle (`ExportHandle`) a renderer drives. `player.css` styles it.                                                                     |
| `@bible/film/tools`  | The `film` CLI (`runFilmCli`) and its Effect services: FilmRepo, ContentStore, ElevenLabs, Ffmpeg, Narrator, Composer, Mixer (`graph` is the pure ffmpeg graph), Browser, PreviewServer, Renderer (`render-plan.ts` is its pure plan), Checker (`check.ts` holds its pure detectors). |

## Data

`core/schema.ts` holds the Schemas for everything a film reads or writes:
`Timed` scenes, `Voice`, `Timings` (`narration/timings.json`), `Sound`, and
`SoundManifest` (`sound/manifest.json`). The TypeScript types derive from them.
`TimingsJson` and `SoundManifestJson` decode a file's text and encode it back
byte for byte; the request hashes (`voiceKey`, `musicKey`, `effectKey`) are
taken over Schema-encoded requests, so a committed hash stays current.

## Tools

`film narrate|score|mix|cues|check|render <film>` (and `film doctor`) runs from the app that holds the
films. The app owns the entry: it calls `runFilmCli({ films, previewServer })`
with its films folder and a scoped `PreviewServer` layer that serves its
player page, because only the app can bundle its HTML and films (see
`apps/animations/cli.ts`). The player imports the same folder, so the tools
and the page never read two different films. Paid calls (ElevenLabs speech, music,
effects) go through the `ElevenLabs` service only; `mix`, `cues` and every
`--dry-run` make none. Assets are content-addressed: `ContentStore.ensure`
produces an asset only when its stored hash is stale, and every manifest
update is serialized. At most three paid jobs run at once. Failures are
tagged errors (`TakeMismatch`, `ApiKeyMissing`, `FfmpegMissing`, ...) in
`tools/errors.ts`; logs are `Effect.log` lines `event key=value`.
`tools/testing.ts` has the in-memory doubles the tool tests use.

Preflights: `film doctor` checks ffmpeg and ffprobe (`FfmpegMissing`),
headless Chromium (launched and closed; `BrowserMissing` carries the install
command) and the `elevenlabs` CLI and its login (`auth status`, free),
reports each, and fails if any is missing. `narrate` and `score` run the
ffmpeg and ElevenLabs checks before their first paid call, and `render`
checks ffmpeg before it opens a page.

`mix` writes `narration/full.mp3` for the player and its lossless master
`narration/full.wav` (16-bit) from one graph, to `full.partial.mp3|wav`,
renamed together only once ffmpeg finishes: a failed or interrupted mix leaves
the previous pair. `masterFinding` holds the master to the film's length
(`AudioMissing`, `AudioStale`); the renderer checks it before the first frame
and `check` in its static leg.

`narrate` writes each new take as `<id>.<audio hash>.mp3` and makes it current
only by rewriting `timings.json`, so no crash leaves a take and its timings
disagreeing; it removes the takes the timings no longer name, and partial
writes, at the start and end of every run.

`render` opens the app's server, headless Chromium (`Browser`, the only
Playwright code) and a pool of player pages in one scope; a failure in any
page, or Ctrl-C, closes every page, the browser and the server and kills every
ffmpeg child. A video's frames split into chunks (`planChunks`: about four per
page, at least a second each) on a queue that idle pages pull from; each chunk
streams PNG frames into its own ffmpeg (`Ffmpeg.encode`, which waits for the
pipe to drain), and a chunk whose page crashes is retried once on a new page.
The segments join in order with the audio encoded to AAC once from
`full.wav`, cut with `-ss`/`-t` (the joined MP4 is probed for its audio
stream: `AudioNotMuxed` when it is missing), and `out/<film>.vtt` is written beside the
MP4 from `captionCues`, the same line timing the burned-in captions use. An
uncaught error in the page is a `PageError`, never a log line. A missing
browser is `BrowserMissing`, whose message is the install command.

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
  draws each sample with the **text probe** on and returns every line of text
  as a box in canvas pixels, turned with its transform. Two different lines
  both above 0.3 opacity that overlap by more than 4 px either way are a
  `TextOverlap`; a visible line cut off by the frame's edge is a
  `TextOffFrame` (a line wholly outside the frame has slid away and is not).
  Findings merge per scene and pair, at the worst sampled frame.

The probe lives in `canvas/probe.ts`. `write`, `block`, right-to-left text
and the captions record through it; a drawing declares the plate its text
sits on (a torn tag) with `probePlate`, because a plate hides what is under
it as the text does. With no probe attached a draw costs one WeakMap lookup,
and a probed frame is pixel for pixel the same (it only reads the transform
and `measureText`). The export handle exposes it as `probe(i)`.

A fade-out under a fade-in is not a collision (the 0.3 opacity floor), so
there is no per-drawing allow-list. Strokes over text (a thread crossing a
quote) are not probed yet: it needs `stroke` to record its path's bounds
through the same probe and a segment-versus-box test.

## Named cues

A moment is declared once. A drawing names the moments something else reads
(a sound, another cue) in its `timeline`, each anchored to a narration
`{mark}`, another cue (`after` its end, `with` its start) or a scene landmark,
never to an absolute second:

```ts
export const justified = drawing({
  timeline: { slam: { mark: 'fiction', offset: 0.9, dur: 0.35 } },
  draw: (f) => {
    const slam = f.at('slam', ease.inQuad); // progress(t, cue.start, cue.dur, ease)
  },
});
// sound.ts: the thud lands where the stamp lands.
{ scene: 'justified', cue: 'slam', edge: 'end' }
```

`layout()` resolves every timeline once (`Placed.cues`, scene-local
`{ start, end, dur }`); an unknown mark or cue, or a cycle, is an error naming
the scene and the cue. `f.cue(name)` reads a resolved cue and `f.at(name,
ease)` its eased progress; with `drawing(...)`, a name the timeline lacks, in
`f.cue`, `f.at` or a span's `after`/`with`, is a compile error
(`canvas/drawing.types.ts` holds the checks). The sound plan's `cueTime` reads the same map, so picture and
sound cannot drift apart. Ornament (wobble, idle motion) stays inline.

## The purity rule

`src/core` never touches the DOM at runtime (type-only DOM references are
fine) and never imports from `canvas`, `player` or `tools`. Bun scripts,
tests and the browser all read it; `tools` is Bun-only. `canvas` may import `core`; `player` may import both.

Frames stay pure: no `Math.random`, no wall clock, no state carried between
frames. Seed randomness by key (`f.hand(key)`, `random.ts`).

```sh
bun run gate   # typecheck + tests
```
