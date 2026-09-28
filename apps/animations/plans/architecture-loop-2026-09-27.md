# Film architecture loop — 2026-09-27

Goal (owner, 2026-09-27): a performant framework with good guardrails and deep abstractions, a great lab, Effect-native tooling; prior art Remotion, three.js, R3F and pmndrs `math` (performance); fix what is in review. Guardrails that are syntactic go in the repo-local `film` oxlint plugin (`packages/film/lint/`), built with the `oxlint-plugin-effect/rule-bindings` builder. The previous loop is `architecture-loop-2026-09-25.md`.

## Baseline

- HEAD: `a215190a`
- Source lines (`packages/film`, `apps/animations` `.ts`): 32,527
- Film audio: unchanged since the last `mix`; the stems are not re-measured this pass (no batch touches sound).
- Cues: `<scratchpad>/film-pass1/cues-baseline.txt`, `cues-sound-baseline.txt`
- `check righteousness-by-faith`: 485 frames, 0 findings

## Performance

Medians of several runs on one machine (M-series Mac, 2026-09-27).

| Measure                  | Film / scene           | Before                                                                                             | After | Budget |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------- | ----- | ------ |
| Render wall time and fps | righteousness-by-faith | 160.6 s, 11,786 frames, 73.4 fps (50 chunks)                                                       |       |        |
| `check` wall time        | righteousness-by-faith | 6.8 s (485 frames probed)                                                                          |       |        |
| `cues` wall time         | righteousness-by-faith | 0.24 s                                                                                             |       |        |
| Draw ms per frame        | righteousness-by-faith | median 32.4 ms, ~426 s summed (scratch bench; `film bench` to build)                               |       |        |
| Where draw time goes     | righteousness-by-faith | 96% raster (cutout pastel 29%, grain 18%, shadow blur 10%, vignette 4.7 ms/frame); JS <4%, GC 0.2% |       |        |
| Allocation in draw path  | righteousness-by-faith | ~3.1 MB/frame (stroke, resample, tear, wobble): ≤3% of render time                                 |       |        |
| Heaviest scenes          | righteousness-by-faith | message 63 s, centurion 61 s (summed draw)                                                         |       |        |
| Render workers sweep     | righteousness-by-faith | 4 pages+share 91.6 fps; 6 → 100.6; 8 without share 168.5; `--workers 8` with share hangs (PF4)     |       |        |
| Lab                      | righteousness-by-faith | 60 fps step and scrub (2.5 / 1.9 ms JS), startup 178 ms, write round trip 0.45 s, onion 25 fps     |       |        |

## Coverage

| Directory                                               | Files | Mark                                  | Pass |
| ------------------------------------------------------- | ----- | ------------------------------------- | ---- |
| apps/animations                                         | 2     | swept-before                          | 1    |
| apps/animations/src, src/films                          | 2     | swept-before                          | 1    |
| apps/animations/src/films/righteousness-by-faith        | 11    | unswept (the rebuild, new 2026-09-27) | 1    |
| apps/animations/src/films/righteousness-by-faith/scenes | 18    | unswept                               | 1    |
| apps/animations/src/films/righteousness-by-faith-v1     | 29    | swept-before (as the first cut)       | 1    |
| apps/animations/test                                    | 6     | swept-before (3 new files unswept)    | 1    |
| packages/film/src/canvas                                | 15    | swept-before (4 new files unswept)    | 1    |
| packages/film/src/core                                  | 28    | swept-before (11 new files unswept)   | 1    |
| packages/film/src/player                                | 9     | swept-before (7 new files: the lab)   | 1    |
| packages/film/src/tools                                 | 45    | swept-before (16 new files unswept)   | 1    |

## Review

| ID  | Item                                                                     | Source                                         | Status                                              |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------- |
| R1  | `thesis` shows question and answer together (CRAFT rule 1)               | review.md seed                                 | open                                                |
| R2  | No seated pose in the kit's `person`                                     | review.md seed                                 | open                                                |
| R3  | `exchange` opens with ~6 s nearly static                                 | review.md seed                                 | open                                                |
| R4  | `person` has no smile or closed eyes (healed servant)                    | review.md seed                                 | open                                                |
| R5  | The two preachers in `message` look the same                             | review.md seed                                 | open                                                |
| R6  | `exchange` holy → most holy move timing against the sanctuary topic file | review.md seed                                 | open                                                |
| R7  | Three trees (garden `tree`, `shadeTree`, spoken dawn)                    | review.md seed                                 | open                                                |
| R8  | `probePlate` multi-line card trips `TextOverlap` on itself               | review.md seed                                 | open                                                |
| R9  | Local `REST` cameras and figure scales; callbacks that drift             | review.md seed                                 | open                                                |
| R10 | Complexity caps on scene `draw`                                          | review.md seed                                 | done `2211412f` `9d4b1f11` (lab locator `4baa842a`) |
| R11 | Frame review (20 findings): each answered by the rebuild?                | `plans/righteousness-by-faith-frame-review.md` | open (films sweep verifies)                         |
| —   | Lab notes: none open on either film (`notes` cursor 0)                   | `bun run notes`                                | none                                                |

## Lab

| Check       | Finding                                                                                                                                                                                              | Status  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| reach       | L4: all 257 cues editable, 6 of 17 scenes have knobs; resting cameras and figure positions are constants. Decided by the Lab-first north star: promote them to point/number knobs (no new knob kind) | films-b |
| write-back  | L2: a write reloads the page and drops 0.5×, loop, onion, compare, play; one undo only                                                                                                               | lab     |
| notes       | L1: a lab page for one film talks to the other film's API (7 shared scene ids)                                                                                                                       | lab     |
| speed       | L3: the URL hash is rewritten every frame; Chromium throttles it and a reload lands up to 2 s off                                                                                                    | lab     |
| instruments | the lab parses `check`'s printed text with a regex; five refusal paths untested; lab tests list films by hand                                                                                        | lab     |

## Prior art

| Idea                                      | Source (slug, path)                   | North star  | Verdict (adopt / rejected: reason)                                                                                                     |
| ----------------------------------------- | ------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `math/random` mulberry32                  | pmndrs/math                           | Performant  | rejected: our `rng` is the same algorithm (identical on 9 seeds × 100k); nothing to gain                                               |
| `math` noise / fbm / lerp / easing        | pmndrs/math                           | Pure frames | rejected: moves every frame (fbm 0/1000 equal, 12% slower); 7 eases already bit-identical; our ease table keeps quad, outBack, outSoft |
| `math` spring                             | pmndrs/math                           | Pure frames | rejected: state across frames                                                                                                          |
| Allocation-free draw helpers (out-params) | pmndrs/math, three.js scratch objects | Performant  | deferred: JS is <4% of frame time; the raster is the cost (engine + performance sweeps)                                                |
| Render on demand (`invalidate`)           | R3F                                   | Performant  | already how the player works                                                                                                           |
| Adaptive resolution while scrubbing       | R3F `PerformanceMonitor`              | Lab-first   | open: lab already holds 60 fps; revisit with a heavier film                                                                            |
| `remotion benchmark` concurrency sweep    | remotion                              | Performant  | adopt as `film bench --workers` (render batch)                                                                                         |
| Decreasing chunk sizes (work stealing)    | remotion                              | Performant  | after the bench (render batch measures)                                                                                                |
| Props saved back to source                | Remotion Studio                       | Lab-first   | same model as ours; adopt its undo/redo stack and state kept through a write (lab batch)                                               |
| Schema-driven props panel                 | Remotion Studio, leva                 | Lab-first   | rejected: Remotion deprecated it for on-canvas drag, which knob handles already do                                                     |

## Pass 1

Reports: `<scratchpad>/film-pass1/<area>.md` (engine, core, tools, lab, performance, films, guardrails).

Verdict: no P1 outside the films; the framework is sound where the last loop swept it. The pass's weight is (1) the lab and its reach, (2) cues the lab shows but cannot move (keys and hand-timed spans), (3) the new film's review items and one doctrinal picture defect, (4) a bench and render tuning, (5) the first `film` lint rules. Performance: the raster is 96% of frame time, so allocation work is deferred and the cheap wins are text wrap, texture pattern reuse, audio encode once and the worker count.

Decisions (decided by redesign-from-first-principles unless noted):

- v1 is frozen: new lint rules scope to films after it (`righteousness-by-faith` and later); v1's 259 hand-timed sites stay.
- Look changes that save time (PF1 pastel pre-blend −22.7%, PF2 vignette −10.6%, PF3 grain sheet −9.8%): owner approved all three (2026-09-27), with the rule that art direction is never traded for speed: batch `look` after `engine` merges; each change is proved by the bench, the max pixel delta per frame, and side-by-side stills that read identical to the eye (the title frame PF1 moved by 18/255 must be fixed or left out of PF1).
- Pass 2 (owner, 2026-09-27): run a second pass after this one closes its batches, whatever the close rule says.
- G2: owner removed the film check from the app's `gate` entirely (`chore(animations)` on main); `film check` is a review step run by hand.
- Static holds (R3 class): owner chose a `film check` warning for more than 4 s with no cue or motion while the voice speaks; batch `hold` after `guard` merges.
- Script doctrine (owner, 2026-09-27): the spine "declares, clothes, changes" and the verdict open frame justification as a legal declaration; justification is faith, forgiveness and power, all gifts (made righteous), and sanctification is the daily choice. A draft revision with verified sources is in `<scratchpad>/script-revision/draft.md`; re-recording waits for the owner's approval of the draft. `films-b` starts after the revised script lands.
- One person model: the kit's `person` takes the engine `figure.ts` face features (smile, closed eyes) and the new pose knobs; `figure.ts` goes when v1 no longer needs it or moves into v1.

Wave-1 decisions (orchestrator):

- f.keys fractions written to 3 decimals move 10 stills by PSNR 61–87 dB, read identical by eye: kept (readable data; passes the art-direction rule).
- E10 torn-edge seam: real in the geometry (0.37–1.58 noise jump), invisible in stills at 3–4×: rejected until a still shows it (art direction beats a geometric nicety; a fix moves every cutout, v1 included).
- E10b rim normal points inward for ellipse/rect winding: only v1 draws rims (frozen): rejected for now, re-propose with a film that uses rims.
- PF7 texture pattern cache: pixel-exact but −0.1%: rejected (Performant: measured, not guessed).
- MAX_ENCODERS=14 is machine-measured; it fails fast with TooManyEncoders. A detection probe waits until another machine renders.
- The share copy costs ~40% of render fps (136 vs 81 at 8 pages): pass 2 measures a separate transcode before any change.
- Binary chunk transport (~520 ms per 56 MB CDP string): pass 2 designs the seam (POST route or exposeBinding).
- Flakes seen under sibling load: animations CLI spawns (fixed in lab with measured budgets), cli `test:perf` phrase matcher, app "keeps the plans query cached across a route change" (~1 in 3 alone): the last two are outside the film; pass 2 guardrails area.
- `bible egw study --pioneers` excludes Jones and Waggoner (the script draft had to use `--author`): a corpus-tool defect outside this loop; recorded for the bible CLI.

Triage (wave 1 in parallel from main `a215190a`; wave 2 after wave 1 merges; wave 3 after wave 2):

| Batch   | Wave                          | Worktree                  | Items                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ----------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| render  | 1                             | ../bible-tools-p1-render  | `film bench` + budget (PF bench design), PF4 encoder hang, PF5 default workers from the sweep, PF6 chunk transport, T2 audio encoded once, T3 segments cleaned, T6 `--from` negative, tools P3 (browser.ts call wrapper, ignored flags)                                                                                                                    |
| lab     | 1                             | ../bible-tools-p1-lab     | L1, L2 (+ undo/redo stack), L3, lab P3s (refusal tests, DOM helpers, check findings as data not regex, onion speed, stale knob note), G4 (tests list films from the registry), notes reply prints new notes                                                                                                                                                |
| guard   | 1                             | ../bible-tools-p1-guard   | the `film` oxlint plugin at `packages/film/lint/` (G3 `no-unprobed-ink` + its rain.ts hit, `drawing-literal`), R8 `probePlate` API + 9 call sites, G5 `SeamLong` + `cues` prints seams, G6 exceptions narrowed, G7 `TextOffPlate`                                                                                                                          |
| core    | 1                             | ../bible-tools-p1-core    | C1 cue-relative `f.keys` (+ migrate gavel/stamp/climb), F1 span `until` a mark, a `stagger` span (replaces dead `core.stagger`), dead `remap`/`planSounds`, one cue-timing type, one default ease, one FNV hash, `musicFindings` from `musicPlan`, golden tests for random/time, schema refuses negative lead/tail/dur, mix says when the score is missing |
| engine  | 1                             | ../bible-tools-p1-engine  | E1 dead ink helpers, E2 one-call `wrap`, texture pattern reuse (pixel-exact −1.7%), E9 one canvas helper, E10 torn-edge seam (verify in a still), E11 haze edge, `math/shapes` helpers where pixel-identical, E14 compositor look constants reachable                                                                                                      |
| films-a | 2                             | ../bible-tools-p1-films-a | the kit: person pose/face/build/beard + `onHead` (R2, R4, R5, E6), one tree (R7), sub-hand helper (E7), walk bob (F5), shared layouts into court/kit (R9)                                                                                                                                                                                                  |
| look    | 2                             | ../bible-tools-p1-look    | PF1 pastel pre-blend, PF2 vignette once, PF3 grain sheet (owner-approved look changes)                                                                                                                                                                                                                                                                     |
| hold    | 2                             | ../bible-tools-p1-hold    | `StaticHold` warning in `film check` (> 4 s, no cue or motion, while speaking)                                                                                                                                                                                                                                                                             |
| films-b | 3 (after the script revision) | ../bible-tools-p1-films-b | scenes: B1 exchange holy→most holy (R6), B2 rain ministry, B3 servant brows, R1 thesis, R3 exchange opening, F2-F4, G1 `film/no-hand-timed-seconds` + its 6 hits (with the stagger span), L4 knobs for resting cameras and figures, R11 5.5 flakes in frame                                                                                                |

Guardrails added:

| Defect class                              | Check                                                                  | Red on                                                                                  | Hash               |
| ----------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------ |
| a timeline or knobs the lab cannot locate | `film/drawing-literal` (runs the lab locator's `unlocatable`)          | computed slot, aliased `drawing`, drawing in a factory, unexported, slot declared twice | 95039251, 85502d74 |
| ink drawn outside the probe               | `film/no-unprobed-ink` (scope-resolved `unprobed`)                     | rain's streaks; bracket/`.call`/destructured ink                                        | a171cb7d, 2962e464 |
| a text plate the probe cannot see         | `probePlate(ctx, shape, draw)` + `TextOffPlate`                        | a line running off its plate                                                            | 557c623f, 83654bdc |
| a seam longer than the default            | `SeamLong` in `film check`, seams in `cues`                            | a 1.2 s fade after a `min: 1` scene                                                     | 1fe01506, 236c3d59 |
| a plugin type error cached away           | turbo `typecheck.inputs` includes `lint/**/*.ts`                       | 0 of 100 inputs under `lint/`                                                           | 8983fb08           |
| a flag a render would ignore              | `FlagsConflict`, misspelt `--only` fails                               | `--contact` with `--stills`                                                             | 5d59e64e           |
| a scene slower than its budget            | `film bench --budget`, held against a hashed, caption-matched baseline | a baseline from other captions                                                          | f1f066ef, 60b817ce |

Counsel defects:

| ID       | Defect                                                                | Red test                                   | Status                                  |
| -------- | --------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------- |
| engine-1 | finish and caption values unbounded                                   | `createFilm` decode test                   | done c339d9bc                           |
| render-1 | track encode not fail-fast (chunks then aac)                          | bencher/encode test                        | done fbdb7d1e                           |
| render-2 | bench drew without captions; baseline compared across captions/hashes | `BaselineIncomparable`, `BaselineUnhashed` | done 60b817ce                           |
| render-3 | contact range ran past the film (frames repeat)                       | `frameSpan` test                           | done 82b5f72a                           |
| render-4 | encoder budget read as per page                                       | docs                                       | done 4db21e81                           |
| lab-L2   | stored A–B loop not read against the film; any rate decoded           | view-state tests                           | done f86cd577                           |
| lab-L3   | `#T` trailed seeks/scrubs; a write reload landed off the click        | t-in-url tests + live                      | done 285dd9a0                           |
| guard-1  | turbo typecheck missed `lint/`                                        | dry-run inputs                             | done 8983fb08                           |
| guard-2  | `no-unprobed-ink` misses and one false positive                       | real-oxlint fixture                        | done 2962e464                           |
| guard-3  | `drawing-literal` could disagree with the lab                         | fixture (5 cases)                          | done 85502d74                           |
| guard-4  | SeamLong miscounted `min`; `MAX_SEAM` duplicated defaults             | `min: 1` fade test                         | done 236c3d59                           |
| guard-5  | storyboard plate undisclosed                                          | docs                                       | done 745e5c30                           |
| core-D1  | an `until` drag past its mark wrote an unresolvable file              | scene-writer + 422 route tests             | fixed b0f296ba, 20ee47e3; merge pending |
| core-D2  | a left-edge drag swapped `until` for `dur`; inspector showed dur 0    | `dragPatch` test                           | fixed 20ee47e3; merge pending           |

Open from counsel: `bench --workers` leaves an empty `out/<film>/bench/` (pass 2).

Merged to main: engine bf868773, render 0f361f18, lab d8dcb2da, guard 92ce9d80, script revision c7385458 (73e1c49b script, ecaeb114 takes: 10 beats, WER ≤ 2.7%, runtime 435.6 s, landing 86.2%, quotes 11.6%).

Live check: —

## Close

- Unswept directories: —
- Open review items: —
- Largest sweep finding: —
- Performance: —
- Structural change named by the loop reader: —
