# Prior art

Fetch a repo with `okra repo fetch <slug>`, then read it at `okra repo path <slug>`. A comparison below is settled: it comes back only with a new receipt.

| Slug                          | Read it for                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `motion-canvas/motion-canvas` | named time events (`waitUntil`), span combinators, and the audio-master player                                                                 |
| `theatre-js/theatre`          | a data-driven keyframe store, and why ours stays in code                                                                                       |
| `remotion-dev/remotion`       | the renderer: browser and ffmpeg lifecycle, chunked scheduling, frame transport, audio muxing. `okra repo fetch` is slow; a sparse clone works |
| `pmndrs/react-three-fiber`    | `frameloop:'never'` + `advance`, `invalidate`, portals                                                                                         |
| `pmndrs/drei`                 | how a prop kit is packaged: one file per prop, a barrel, a DOM-free core                                                                       |
| `motiondivision/motion`       | the sequence `at` grammar, `stagger`, springs baked into easing                                                                                |
| ocarina watercolour example   | the watercolour look. The source is a raw string in `https://examples.motion.dev/assets/index-*.js`, not a repo                                |

## Settled

The rule behind every rejection: a frame is a pure function of `T` (north star "pure frames"). A design that integrates a delta, replays from a scene start, or keeps state between frames breaks scrubbing and the parallel render workers.

**Timing**

- **Adopt: named cues, resolved once.** Each scene declares its timeline as named spans anchored to a mark or to another cue, never to an absolute second. `layout()` resolves them with no DOM; `draw` reads `f.cue(name)`; `sound.ts` references `{scene, cue, edge}`. Sources: Motion Canvas `waitUntil`, Motion `calc-time.ts:7-24` (number, `+n`, `-n`, `<`, labels; our marks are the labels).
- **Adopt:** `stagger` with `from` and `ease` (motion-dom `stagger.ts:21-39`); springs baked into closed-form easing (motion-dom `create-generator-easing.ts:8-26`).
- **Adapt:** Motion Canvas `all`/`chain`/`sequence`/`delay` as span constructors that resolve to times, not generators.
- **Rejected:** Motion Canvas generators and signals (a seek replays from the scene start, `PlaybackManager.ts:83-107`). Theatre's absolute-time JSON keyframes (a re-record strands them). Sounds collected by running the scenes (the mix must resolve from `layout()`). Motion's MotionValues, `springValue` and `threeEffect`, plus R3F `useFrame` and the zustand store (history-dependent). R3F's reconciler (diffing a retained graph buys nothing for stateless frames).

**Structure**

- **Adapt:** a shared `src/kit/` in drei's shape, with pure `float`/`bob`/`pulse` behaviours as functions of time. `layer()` as a public sub-scene with a time offset (R3F portals). `invalidate` for the player only, so it idles while paused.
- **Already better:** `render(ctx, T)` over R3F's `frameloop:'never'` + `advance`. Narration sizes scenes up front, where Motion Canvas recalculates to learn a duration.

**Rendering and audio (Remotion)**

Most of Remotion exists to make an async React page render the same frame every time (`delayRender`, premounting, media sync). A synchronous canvas that is a pure function of `T` needs none of it.

- **Adopt:** a lossless audio master: the `Mixer` writes `full.wav` (the player streams it too), and `Media.join` encodes AAC from the samples under the render's range. One scope for the browser and pages, with a chunk retried when a page crashes (`render-frame-and-retry-target-close.ts`). Chunks on a queue, about 4× the worker count. Captions (SRT/VTT) from the word timings.
- **Diverged (2026-09-26):** Remotion pipes frames into ffmpeg; here each page encodes its chunk with WebCodecs through mediabunny (`petergpt/painted-rickroll` does the same), so no frame leaves the page as an image and no ffmpeg binary is needed. The whole film renders in about two minutes, against about ten.
- **Adapt:** `<Sequence>`'s nested offsets as a local clock, `f.from(mark)`. Frame transport as JPEG capture, only after measuring fps. Marks, effect cues and music acts drawn on the player's timeline.
- **Rejected:** callback-array cancellation and errors matched by message text (Effect scopes and tagged errors replace them). The Studio props and keyframe editors. Per-frame audio registration (sound resolves from cues). Shortening the film for transitions (narration sets the length).

**Look (ocarina)**

The watercolour look is mostly pre-painted raster, not a simulation. Cheap Canvas 2D wins, in order: edge darkening inside cutouts (`paint*(1-paint)`), a deckled page edge baked once, and a brush-nib wash transition that re-stamps its mask from zero each frame. A WebGL post pass stays opt-in until headless GL throughput is measured. Rejected: Kuwahara per frame (too heavy, smears the boil) and global graphite hatching (it duplicates the drawn ink).

## Effect tooling

The repo pins one `effect@4.0.0-rc.115`. Copy the CLI shape of `packages/cli/src/main.ts:18-41` (`effect/unstable/cli`, `BunServices.layer`, `BunRuntime.runMain`). Run child processes through `effect/unstable/process`: its `stdin` takes a `Stream<Uint8Array>`, so frames pipe into ffmpeg with backpressure. Where the effect-solutions guides disagree with this version, the version wins: errors are `Schema.TaggedError`, and CLI flags are PascalCase (`Flag.String`).

- **Adopt:** `effect-bun-test` (`it.effect`, `it.scoped`) for the tool services against fake layers. Re-enable the 17 effect lint rules everywhere outside the draw path.
- **Adapt:** `effect-frame` for the player controls and a live studio page, not for the canvas or the export handle (it has its own JSX runtime).
- **Rejected:** `effect-encore` durable workflows, unless the pipeline becomes a long-running studio server.
- **Draw-path lint exceptions**, measured: noTernary, noNullish, noShapeInSymbolNames (a shape is a drawing word here), noThrowStatement, noNewError. The player tick and export also keep noGlobals, noAsyncFunction and noNewPromise off (`performance.now`, rAF).
