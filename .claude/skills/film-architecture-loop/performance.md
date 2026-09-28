# Performance sweep

The framework renders a film as pure frames: every frame is `draw(frame)` at a time `T`, thousands of times per render, and again on every scrub and every lab tweak. The **objective** is less time per frame (render and lab) and less memory churn. The **constraint** is the look: art direction is never traded for speed (owner, 2026-09-27). By default a change keeps pixels identical, proved by stills compared with `cmp`; a change that moves pixels (an owner-approved look change) must be indistinguishable to the eye in side-by-side stills and is reverted if a still shows it. Pure frames win over speed: no cache that carries state from one frame to the next.

The **scope** is the framework, not a film (owner, 2026-09-27): speed is found in `@bible/film` (canvas primitives, compositor, kit-level helpers the framework offers, renderer, lab, tools) so every film inherits it. Films are the benchmark: a scene that is slow names the primitive to fix, and the fix lands in the primitive. A per-film tweak (fewer strokes in one scene, a scene-local cache, a simplified prop) is not a performance finding.

## Measure first

A number without an instrument is a guess. When an instrument below does not exist, building it is the first performance finding, and the batch that builds it records the baseline.

| Row                         | What                                                                            | How                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Draw ms per scene           | median and p95 ms of `draw` per frame, per scene, sampled every Nth frame       | a `film bench <film>` command: loads the film in one headless page, times `render(ctx, T)` over sampled frames with `performance.now()` inside the page, prints a table and writes JSON to `out/<film>/bench.json` |
| Allocation in the draw path | heap growth and GC count per 100 frames, per scene                              | the same page with `--js-flags=--expose-gc`, `performance.memory` or a CDP heap-sampling profile around the timed frames                                                                                           |
| Render fps                  | frames per second of the whole-film render, and wall time                       | `bun run render <film> --no-captions` already logs frames and time: read the log                                                                                                                                   |
| Lab frame time              | ms from a knob or cue change to the redrawn frame; ms per frame while scrubbing | the lab page timed with `agent-browser` (a scripted drag, then `performance` entries)                                                                                                                              |
| Check and cues time         | wall time of `bun run check <film>` and `bun run cues <film>`                   | `time`                                                                                                                                                                                                             |
| Startup                     | time from `bun run lab` to the first frame                                      | the lab log                                                                                                                                                                                                        |

Record each in the ledger's performance table with the HEAD hash. Budgets come from the baseline: once a row is measured, the bench fails when a later run is more than 10% slower on the same machine (a guardrail, see the SKILL's table).

## Where time goes in a canvas film (look here first)

1. **Per-point allocation.** `Pt` tuples built per point per frame (`[x, y]` in `quad`, `spline`, `line`, boil jitter, `blob`) are the usual cost. The pmndrs `math` answer: caller-owned scratch arrays and functions that write into `out`. Shapes that do not change with `T` (a `blob` with a fixed seed, a `rounded` rect) are built once at module scope, not per frame; `robe.ts` and the kit already do this for some.
2. **Path rebuilds.** A `Path2D` for a static shape can be built once and stroked many times; a boiling outline changes with the boil frame only (a few times a second), so it can be keyed by `(shape, boil frame)` inside one frame's work only if that keeps frames pure. Measure before adding any cache.
3. **Canvas state.** `save`/`restore` pairs, `filter` and `shadowBlur` are expensive in Chromium's Canvas 2D; `shadowBlur` especially. The cutout shadow (`raised`) and `multiplane` blur are the suspects: measure each on and off.
4. **Text.** `measureText` and font shaping per frame for text that does not change; wrap results can be computed once per text and style.
5. **Randomness and noise.** `hash2`, `rng` and boil jitter per point: compare with `math/random` (`mulberry32`) and `math/noise`, which are allocation-free and benchmarked.
6. **Render pipeline.** Pages, chunk size and encoder settings (`packages/film/src/tools/renderer.ts`, `render-plan.ts`): Remotion's concurrency and benchmark command are the prior art.

## Change directly, or propose

- **Change directly**, one revertible commit each with its before/after: hoisting a constant shape out of `draw`, out-params and scratch arrays in a hot helper, replacing a local helper with its `math` equivalent, dropping a redundant `save`/`restore`, a chunk-size change the bench proves.
- **Propose in the ledger**: anything that changes the look (a cheaper shadow, lower blur), a new dependency, a WebGL/OffscreenCanvas path, a worker split, a change to the render's output format.

## Traps

- Optimizing without the bench, or on a scene nobody watches: rank by (ms of that scene × its frames) ÷ risk.
- A cache that makes frame N depend on frame N−1 (breaks scrubbing and parallel chunks).
- Measuring the dev server instead of the headless render path, or one run instead of the median of several.
- A change that is faster but moves a pixel: `cmp` the stills.

## Report

The performance report adds, beyond the usual candidate table: the baseline table, each candidate's measured or estimated saving (how it was measured), the stills it compared, and its rollback. A candidate with no measurement is a question, not a finding.
