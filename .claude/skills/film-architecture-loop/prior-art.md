# Prior art

Fetch a repo with `okra repo fetch <slug>`, then read it at `okra repo path <slug>`. A comparison below is settled: it comes back only with a new receipt.

| Slug                          | Read it for                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `motion-canvas/motion-canvas` | named time events (`waitUntil`), span combinators, and the audio-master player                                                                                                                        |
| `theatre-js/theatre`          | a data-driven keyframe store, and why ours stays in code                                                                                                                                              |
| `remotion-dev/remotion`       | the renderer: browser and ffmpeg lifecycle, chunked scheduling, frame transport, audio muxing. `okra repo fetch` is slow; a sparse clone works                                                        |
| `pmndrs/react-three-fiber`    | `frameloop:'never'` + `advance`, `invalidate`, portals                                                                                                                                                |
| `pmndrs/drei`                 | how a prop kit is packaged: one file per prop, a barrel, a DOM-free core                                                                                                                              |
| `motiondivision/motion`       | the sequence `at` grammar, `stagger`, springs baked into easing                                                                                                                                       |
| ocarina watercolour example   | the watercolour look. The source is a raw string in `https://examples.motion.dev/assets/index-*.js`, not a repo                                                                                       |
| `pmndrs/math`                 | the hot-path style: plain arrays, out-params, no allocation, benchmarked; easing, springs, seeded random, noise, polygon and IK already written (installed at 0.1.0; it ships `skills/math/SKILL.md`) |
| `mrdoob/three.js`             | object reuse in the render loop (scratch `Vector3`s, `.set` over `new`), `Clock`, and what a retained scene graph costs us                                                                            |
| `pmndrs/react-three-fiber`    | performance: `frameloop="demand"` + `invalidate`, `performance.regress`, `<PerformanceMonitor>`, instancing                                                                                           |
| `pmndrs/leva`                 | typed controls declared from a schema, for the lab's inspector                                                                                                                                        |

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

## To survey (performance and lab)

Open questions for pass 1; each settles into a row above or below with a receipt.

- `pmndrs/math`: which of `packages/film/src/core` (ease, rng, `hash2`, noise, lerp, clamp) and the kit's point helpers it replaces with an allocation-free equivalent; benchmark ours against it on the bench.
- three.js and R3F: which render-loop habits (scratch objects, `invalidate`, adaptive resolution while scrubbing) fit a pure-frame canvas; which need retained state (rejected).
- Remotion: `remotion benchmark` (concurrency sweep) against our render plan; Studio's props-to-source save against the lab's write-back.
- leva and Theatre's studio: what a typed inspector declared from the scene's `knobs` would need.

## Effect tooling

The repo pins one `effect` in the root `package.json` catalog; read the version there and in `node_modules/effect` before trusting a guide. Copy the CLI shape of `packages/film/src/tools` (`effect/unstable/cli`, `BunServices.layer`, `BunRuntime.runMain`). Child processes run through `effect/unstable/process`. Where the effect-solutions guides disagree with the installed version, the version wins.

- **Adopt:** `effect-bun-test` (`it.effect`, `it.scoped`) for the tool services against fake layers. Re-enable the 17 effect lint rules everywhere outside the draw path.
- **Adapt:** Solid 2 (the repo's UI framework: `egw-search`, since it dropped effect-frame on 2026-09-25) for the lab's controls and the Studio page, never for the canvas or the export handle.
- **Rejected:** `effect-encore` durable workflows, unless the pipeline becomes a long-running studio server.
- **Draw-path lint exceptions**, measured: noTernary, noNullish, noShapeInSymbolNames (a shape is a drawing word here), noThrowStatement, noNewError. The player tick and export also keep noGlobals, noAsyncFunction and noNewPromise off (`performance.now`, rAF).
