# Performance sweep

The framework renders a film as pure frames: every frame is `draw(frame)` at a time `T`, thousands of times per render, and again on every scrub and every lab tweak. The **objective** is less time per frame (render and lab) and less memory churn. The **constraint** is the look: art direction is never traded for speed (owner, 2026-09-27). A change is reviewed by its diff: one that keeps pixels says why in its diff (the mechanism, such as the same operations in the same order, or a float check that rounds to the same byte), with no stills compared with `cmp`; one that moves pixels is a look change, proposed to the owner with renders. Pure frames win over speed: no cache that carries state from one frame to the next.

The **scope** is the framework, not a film (owner, 2026-09-27): speed is found in `@bible/film` (canvas primitives, compositor, kit-level helpers the framework offers, renderer, lab, tools) so every film inherits it. Films are the benchmark: a scene that is slow names the primitive to fix, and the fix lands in the primitive. A per-film tweak (fewer strokes in one scene, a scene-local cache, a simplified prop) is not a performance finding.

## Measure first

A number without an instrument is a guess. When an instrument below does not exist, building it is the first performance finding, and the batch that builds it records the baseline. No measure renders, checks or cues a film (`render`, `check`, `cues`) until the owner asks for scene review (owner, 2026-10-01).

| Row                         | What                                                                                                  | How                                                                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Draw ms per scene           | median and p95 ms of `draw` per frame, per scene, sampled every Nth frame                             | a scratch script under the pass folder: loads the film in one headless export page, times `render(ctx, T)` over sampled frames with `performance.now()` inside the page, raster flushed (the `film bench` command was removed, owner 2026-09-29) |
| Allocation in the draw path | heap growth and GC count per 100 frames, per scene                                                    | the same page with `--js-flags=--expose-gc`, `performance.memory` or a CDP heap-sampling profile around the timed frames                                                                                                                         |
| Lab frame time              | ms from a knob or cue change to the redrawn frame; ms per frame while scrubbing                       | the lab page timed with `agent-browser` (a scripted drag, then `performance` entries)                                                                                                                                                            |
| Startup                     | time from `bun run lab` to the first frame                                                            | the lab log                                                                                                                                                                                                                                      |
| Work per frame              | counts per frame, per scene: fills, strokes, faces by path, tile builds, draws, full-frame composites | a census over sampled frames drawn into a counting context (or the export page with the calls counted); counts do not move with load, so they are the receipt on a busy box                                                                      |

Record each in the ledger's performance table with the HEAD hash. There is no standing budget: a batch that claims a speed-up measures the row before and after on the same machine, and the batch report carries both numbers.

**Load rule.** Record `uptime` with every time. At a load average over 4 a time claims nothing, neither a win nor a regression: on a busy box the same code measured 17 minutes apart moved 49 % in wall time, and CPU time did not remove it (the contention is in the cores). Claim with the work-per-frame counts instead, and take times again on a quiet box.

## Where time goes in a canvas film (look here first)

1. **Per-point allocation.** `Pt` tuples built per point per frame (`[x, y]` in `quad`, `spline`, `line`, boil jitter, `blob`) are the usual cost. The pmndrs `math` answer: caller-owned scratch arrays and functions that write into `out`. Shapes that do not change with `T` (a `blob` with a fixed seed, a `rounded` rect) are built once at module scope, not per frame; `robe.ts` and the kit already do this for some.
2. **Path rebuilds.** A `Path2D` for a static shape can be built once and stroked many times; a boiling outline changes with the boil frame only (a few times a second), so it can be keyed by `(shape, boil frame)` inside one frame's work only if that keeps frames pure. Measure before adding any cache.
3. **Canvas state.** `save`/`restore` pairs, `filter` and `shadowBlur` are expensive in Chromium's Canvas 2D; `shadowBlur` especially. The cutout shadow (`raised`) and `multiplane` blur are the suspects: measure each on and off.
4. **Text.** `measureText` and font shaping per frame for text that does not change; wrap results can be computed once per text and style.
5. **Randomness and noise.** `hash2`, `rng` and boil jitter per point: compare with `math/random` (`mulberry32`) and `math/noise`, which are allocation-free and benchmarked.
6. **Render pipeline.** Pages, chunk size and encoder settings (`packages/film/src/tools/renderer.ts`, `render-plan.ts`): Remotion's concurrency and benchmark command are the prior art.

## Measured and rejected

A candidate the numbers turned down stays here with its numbers, so it is not proposed again without new ones.

**`at(ctx, …)` / `camera(ctx, …)` closures → `atBegin`/`restore` pairs** (p1-framework item 6, 2026-09-28, HEAD `acb1daca`, this Mac; decided by measure-before-optimise):

| Measure                         | Value                                                                      | How                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Closures per frame, whole film  | 8.1 (6.5 `at` + 1.6 `camera`)                                              | `righteousness-by-faith`, 1311 sampled frames drawn into a null context with `at`/`camera` counted |
| Closures per frame, worst scene | 23.1 (20.9 `at` + 2.2 `camera`), `message`                                 | same run                                                                                           |
| Cost per call                   | 7.89 ns with the closure, 4.75 ns as `atBegin`/`restore`: 3.14 ns overhead | Bun micro-bench, 10^7 calls, median of runs                                                        |
| Overhead per frame, worst scene | ~73 ns                                                                     | 23.1 × 3.14 ns                                                                                     |
| Draw per frame, film median     | 22.9 ms (`message` 57.6, `centurion` 62.8)                                 | the former `film bench righteousness-by-faith` (headless Chromium, raster flushed)                 |
| Draw logic alone                | 2.53 ms/frame                                                              | the null-context run                                                                               |
| Saving ÷ frame time             | ~1e-6 (73 ns ÷ 57.6 ms)                                                    |                                                                                                    |

Counsel's cross-check agreed on the scale: 6–7 ns against 1.1–1.4 ns direct, across 105 `at(ctx,` and 11 `camera(ctx,` call sites. A 1e-6 saving is below any measurement's noise and would cost every call site its scoped form (a `restore` that can be forgotten), so the closures stay. Revisit only if a scene's closures per frame grow by three orders of magnitude.

## Change directly, or propose

- **Change directly**, one revertible commit each with its before/after timings (taken at a load under 4) or counts: hoisting a constant shape out of `draw`, out-params and scratch arrays in a hot helper, replacing a local helper with its `math` equivalent, dropping a redundant `save`/`restore`, a chunk-size change timed renders prove.
- **Propose in the ledger**: anything that changes the look (a cheaper shadow, lower blur), a new dependency, a WebGL/OffscreenCanvas path, a worker split, a change to the render's output format.

## Traps

- Optimizing without a measurement, or on a scene nobody watches: rank by (ms of that scene × its frames) ÷ risk.
- A cache that makes frame N depend on frame N−1 (breaks scrubbing and parallel chunks).
- Measuring the dev server instead of the headless render path, or one run instead of the median of several.
- A change that is faster because it draws something else: that is a change to the look, proposed in the ledger (above), and its diff shows it.

## Report

The performance report adds, beyond the usual candidate table: the baseline table, each candidate's measured or estimated saving (how it was measured, with `uptime`, or the counts it moves), and its rollback. A candidate with no measurement is a question, not a finding.
