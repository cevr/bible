# @bible/film

The engine behind the cut-paper explainer films in `apps/animations`: a film
is an ordered list of narrated scenes, laid end to end on a clock set by the
recorded words, and every frame is a pure function of that film and a time.

## Entry points

| Import               | What it holds                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`   | The clock: easing and `progress` (`time`), seeded noise (`random`), `{mark}` narration timing, named cues (`timeline`), the sound plan, scene `layout`.                                                                                |
| `@bible/film/canvas` | The Canvas 2D draw kit (ink, cutout, paper, type, figure, camera, storyboard) and `createFilm`, which composites any `T`.                                                                                                              |
| `@bible/film/player` | `mountPlayer(films)`: the scrubbable preview and the `?export` handle (`ExportHandle`) a renderer drives. `player.css` styles it.                                                                                                      |
| `@bible/film/tools`  | The `film` CLI (`runFilmCli`) and its Effect services: FilmRepo, ContentStore, ElevenLabs, Ffmpeg, Narrator, Composer, Mixer (`graph` is the pure ffmpeg graph), Browser, PreviewServer, Renderer (`render-plan.ts` is its pure plan). |

## Data

`core/schema.ts` holds the Schemas for everything a film reads or writes:
`Timed` scenes, `Voice`, `Timings` (`narration/timings.json`), `Sound`, and
`SoundManifest` (`sound/manifest.json`). The TypeScript types derive from them.
`TimingsJson` and `SoundManifestJson` decode a file's text and encode it back
byte for byte; the request hashes (`voiceKey`, `musicKey`, `effectKey`) are
taken over Schema-encoded requests, so a committed hash stays current.

## Tools

`film narrate|score|mix|cues|render <film>` runs from the app that holds the
films (`src/films/<film>`, or `FILMS_DIR`). The app owns the entry: it calls
`runFilmCli(previewServer)` with a scoped `PreviewServer` layer that serves its
player page, because only the app can bundle its HTML and films (see
`apps/animations/cli.ts`). Paid calls (ElevenLabs speech, music,
effects) go through the `ElevenLabs` service only; `mix`, `cues` and every
`--dry-run` make none. Assets are content-addressed: `ContentStore.ensure`
produces an asset only when its stored hash is stale, and every manifest
update is serialized. At most three paid jobs run at once. Failures are
tagged errors (`TakeMismatch`, `ApiKeyMissing`, `FfmpegMissing`, ...) in
`tools/errors.ts`; logs are `Effect.log` lines `event key=value`.
`tools/testing.ts` has the in-memory doubles the tool tests use.

`mix` writes `narration/full.mp3` for the player and its lossless master
`narration/full.wav` (16-bit) from one graph.

`render` opens the app's server, headless Chromium (`Browser`, the only
Playwright code) and a pool of player pages in one scope; a failure in any
page, or Ctrl-C, closes every page, the browser and the server and kills every
ffmpeg child. A video's frames split into chunks (`planChunks`: about four per
page, at least a second each) on a queue that idle pages pull from; each chunk
streams PNG frames into its own ffmpeg (`Ffmpeg.encode`, which waits for the
pipe to drain), and a chunk whose page crashes is retried once on a new page.
The segments join in order with the audio encoded to AAC once from
`full.wav`, cut with `-ss`/`-t`, and `out/<film>.vtt` is written beside the
MP4 from `captionCues`, the same line timing the burned-in captions use. An
uncaught error in the page is a `PageError`, never a log line. A missing
browser is `BrowserMissing`, whose message is the install command.

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
ease)` its eased progress; with `drawing(...)`, a name the timeline lacks is a
compile error. The sound plan's `cueTime` reads the same map, so picture and
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
