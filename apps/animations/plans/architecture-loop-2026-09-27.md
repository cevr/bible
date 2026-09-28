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

Wave 2 merged: hold e6825c9a (StaticHold; counsel D1–D5 fixed 84d4630c), films-a 990aa747 (E7, E6, F5, R9, R9d, R7, R4, R2, R5; counsel D1 seated pose, D2 ranges, D3 sash, D4 closures fixed), look b2f2f0a6 (PF3 grain sheets, PF2 vignette once, PF1 pastel pre-blend: draw 421.0 s → 333.5 s, −21%; counsel found 10–11/255 under magnification, so a face under a transform stretching more than 1.05 keeps the two-pass draw, pixel test `cutout.pixel.test.ts`). Main fix 4f46add3: `declared` read a mark the script revision removed (layout check and renders threw); guardrail: a test that draws every scene of every film (pass 2).

Pass 2 performance candidates (framework, pixel-exact or not at all):

- A pre-magnified blended tile for faces under zoom (for example 320·zoom a whole number), to win back the ~64 s the magnification guard costs; needs its own pixel proof.
- Grain as one (w+size)×size strip per tile: pixel-exact (436 frame hashes match), grain memory 69.8 → 13.4 MB per page, draw +1.5%. Measure render fps at the default workers before adopting (memory per page bounds the worker count).

Merged to main: engine bf868773, render 0f361f18, lab d8dcb2da, guard 92ce9d80, script revision c7385458 (73e1c49b script, ecaeb114 takes: 10 beats, WER ≤ 2.7%, runtime 435.6 s, landing 86.2%, quotes 11.6%).

Wave 3 merged: films-b2 c1fe698d (message, daily, thesis, declared, name, centurion drawn; kit `openHand`), films-b1 acb1daca (exchange R6/R3, robe, within, daily fixes, R1 thesis answer where the question stood), films-b perf 94dc11ac/f263f362 (per-frame objects out of scenes). Guardrail from the 4f46add3 miss: `every scene of every registered film draws` 2db2a6e4, widened to each cue's midpoint into a stub canvas that refuses what a real one does cd648b08.

Merged after wave 3, all on main at 1955df10 (pushed to GitHub, owner OK 2026-09-28):

| Batch        | Merge / head             | What landed                                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| p1-framework | 592ff77e … ad313e59      | word pins `{ mark, word }` + `WordMissing` 6433321c, `WordPinFar` 58dcf7bd, `film/no-hand-timed-seconds` 0f7ee600 (widened e435ff83), `shotPath` bfaa949d, framings and figures as knobs d45ac8ed (`knobCamera` in the film kit), renderer temp folder e7d19e3a/3e9a14fa                                                                                                     |
| p1-script    | f81c680e, takes bb8d5242 | the owner-approved single-narrator script 82233641 (the narrator asks the viewer's question at each turn): 16 staging takes by Chris, 415.1 s, landing 86.7 % (over CRAFT's 84 %: owner keeps it; options if raised again are cuts or a longer coda), `check` 0/0                                                                                                            |
| p1-voice     | e42f0c62 … 1955df10      | the owner's voice replaces staging beat by beat a48f06b6; studio server cb56ffa0; 24-bit FLAC masters with the original kept cb8d2b47; one clean gain to −17.1 dBFS 990f0c3e; `:beat` checked first, 413, one write at a time 9976b5c7; lenient WER + `heardAs` 090a9d1d; `SttUntimed` 51efeddf; `--whole` cut at the quietest silence 999a0ac3; renamed beats kept b3fec541 |

Live check: pass 1's live check folds into pass 2's (below), run once after pass 2's merges.

## Pass 2

HEAD at start: `1955df10` (Workbox from here on: numbers taken on the Workbox do not compare with the Mac rows above).

Owner decisions (2026-09-28):

- The lab UI is Solid 2 + effect-machine (effect-frame left the repo 2026-09-25); a machine for any control with several states; the lab stays in the browser (Electron only for a native need).
- Studio recording is unprocessed and lossless: getUserMedia with echoCancellation, noiseSuppression and autoGainControl false, PCM through an AudioWorklet → WAV. Never MediaRecorder or Opus (the server refuses lossy types with 415).
- Director's vision approved in all four parts: (1) the doc and its checks, (2) the paper treatment in the kit, (3) score and landing music, paid, after the owner's voiceover so it is generated once, (4) motion and the colour valley (scene work after p2-direction's framework). Pixel-moving commits wait for the owner's OK on before/after montages before merge.
- Shorts next after this pass's batches: the vertical camera (A2), pickup lines (A8), the cover (A9); the lab draws safe zones from `SAFE_ZONES` in `@bible/film/core`.

Triage:

| Batch        | Worktree                    | Items                                                                                                                                                       | State                                                         |
| ------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| p2-lab       | ../bible-tools-p2-lab       | the lab's controls on Solid 2 + effect-machine: shell, cue strip and inspector, knobs and handles, motion and compare, notes and findings (items 1–5)       | merged 0bf8295d (fixups below)                                |
| p2-shorts    | ../bible-tools-p2-shorts    | A1 shorts as data, A3 stacked 9:16 page, A4 burned word captions, A5–A7 short checks, CRAFT Shorts, two shorts (verdict 47.2 s, mirror 29.3 s)              | merged 7255cae8 (fixups below)                                |
| p2-direction | ../bible-tools-p2-direction | director-vision doc, CRAFT/SKILL rules; checks `DeadAir`, `HeldShare`, `ColourScript`, `FaceSmall`, `EndShort`, `chapters`; paper look C1–C6; scene drift D | apply done 51685291; counsel running; C1–C6, D await owner OK |
| p2-encoder   | ../bible-tools-p2-encoder   | a render with no hardware H.264 encoder (Linux) encodes in software: encoder choice as data, launch flags per platform, encoder budget per kind             | merged 97c93bf4 (fixups below)                                |
| p2-studio    | ../bible-tools-p2-studio    | the Studio panel in the Solid lab against the p1-voice server (recorder machine, AudioWorklet WAV, teleprompter, takes history)                             | merged 2305dd6b (fixups below)                                |

Counsel defects (pass 2):

| ID           | Defect                                                                                                | Red test                                        | Status                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| lab-1        | a knob at 0 had no inspector row (`<Show when>` truthiness)                                           | `knobs.dom.test.ts` 0-knob row writes           | done c670bef9                                                                                                                  |
| lab-2        | docs named a `knobCamera` only one film's kit had                                                     | `camera.test.ts` export                         | done 388fa387 (framework, film re-exports)                                                                                     |
| lab-3        | the editor could wedge in Writing                                                                     | TestClock actor test, `Effect.never` write      | done e07f7623 (20 s → Refused)                                                                                                 |
| lab-4        | providers exposed machine state unions; consumers matched other modules' tags                         | `findingsOf`, `layerOf`, `composerOpen`         | done d7158f60                                                                                                                  |
| lab-5        | pre-existing: canvas overflowed its row; notes overlay and onion covered the bar                      | `shell.dom.test.ts` boxes at 1400×480, 1100×420 | done 849c29a4 (`body.lab .stage` grid)                                                                                         |
| lab-6        | pre-existing: `audio.play()` rejected every loop on a film with no master (HMR overlay)               | `narration.test.ts`                             | done 26292ed3 (typed `NarrationState`)                                                                                         |
| lab-flake    | notes DOM tests raced their fake answers under the hook                                               | —                                               | done e8fdc104                                                                                                                  |
| shorts-D1/D2 | aligned word starts carry the pause before them: hook/loop passed wrongly, captions up to 2.8 s early | voiced/phrases/short-check/narrator tests       | done 5ce236f2, c2cfa722: `TakeWord.voiced` measured once from the take (−40 dBFS, 10 ms), backfilled locally, hashes unchanged |
| shorts-D3    | a phrase crossed a sentence end                                                                       | two phrases tests                               | done e4493d48                                                                                                                  |
| shorts-D4    | `check/cues --short` resolved at 30 fps                                                               | 24 fps fixture                                  | done 2e5a3091                                                                                                                  |
| shorts-D5    | an empty luma read passed the loop; band recomputed as 16:9                                           | 4:3 fixture, `lumaGrid`                         | done 99a1e741                                                                                                                  |
| shorts-D6    | verdict's third span opened on a fragment                                                             | —                                               | done 40d7fde9 (`{ mark: 'how' }`, 50.23 s)                                                                                     |
| shorts-D7    | CRAFT "Checked" wording; bench claim                                                                  | message test                                    | done 5d9f907e (parity ~0.92×)                                                                                                  |
| shorts-hook  | after D1 mirror failed ShortHook 0.50 s: a span opens 0.1 s before its word is heard                  | `openOnVoice` test                              | done 24b2b80d                                                                                                                  |
| studio-D1    | the capture context ran at the output device's rate, so Chromium resampled the mic silently           | 44.1 kHz fake mic into a 48 kHz context         | done 647407ce (context at the track's rate; processing read back)                                                              |
| studio-D2    | a stereo interface was mixed to 0.5·(L+R)                                                             | left-only stereo file, peak 0.25                | done 64b670ea (`channelInterpretation: 'discrete'`)                                                                            |
| studio-D3/D4 | 24-bit scale one LSB low; odd data chunk unpadded                                                     | byte tests                                      | done 18dd4f7b                                                                                                                  |
| studio-D5    | focus fell to `<body>` when a control was replaced: Space played the film mid-take                    | Record click then Space, no refocus             | done 4f2c9d7b (focus kept on the studio; rows keyed)                                                                           |
| studio-D6    | Importing had no bound; Retry could post a kept take again                                            | TestClock + attempts read-back                  | done f34a5615 (210 s wait → Checking reads the attempts; 240 s server hold)                                                    |
| studio-D7    | no take-length limit before a 413                                                                     | `takeLimit` tests                               | done 8587b06d (6 min 19 s at 44.1 kHz shown, warned, stopped)                                                                  |
| studio-D8/D9 | a gone mic read as Default; an unplugged mic unnoticed, flush could drop samples silently             | view + DOM tests                                | done f953c213, 1b5f6f3d (MicLost)                                                                                              |
| studio-msg   | TakeMismatch spoke CLI flags inside the panel                                                         | CLI + panel text tests                          | done 74b5d0e2                                                                                                                  |
| studio-drive | the drive found `server.timeout` called detached: every take 500                                      | fake server as a class                          | done c025eb80                                                                                                                  |
| encoder-1    | a Mac whose hardware check failed would render in software silently                                   | Mac with only software → EncoderMissing         | done 8ca1eb2d (`encoderCandidates`: darwin [Hardware], else [Software], `--encoder` names one)                                 |
| encoder-2    | the software encoder's first I-frame per chunk kept 0.27–0.48 of the grain (21 KB)                    | `SETTINGS.Software.preroll` tests               | done 8ca1eb2d (pre-roll 2 frames into a null target: 142–162 KB; frame 0 ≈ the chunk's 2 s key frame, mean −0.006)             |
| encoder-3    | the Linux share was 1.16 GB at 24 Mbps                                                                | `Media.shareCopy` tests                         | done 8ca1eb2d (x264 CRF 22 slow tune grain from the master: 616 MB, grain 0.78–0.89; +289 s, one pass)                         |
| encoder-4    | lows: `TooManyEncoders` untyped encoder, doctor printed only "port taken"                             | doctor red log                                  | done 8ca1eb2d (`EncoderName`; `PreviewServerFailed`, every doctor line)                                                        |

Merge proofs: p2-lab stills t=2, 12.5, 40, 75 cmp-identical to main, player bundle has no Solid or effect-machine (494,721 B min). p2-shorts: `cues` identical and 10 stills (2 … 400 s, captions burned) cmp-identical to main. Shorts now: verdict 50.23 s, first voice 0.11 s, loop gap 0.35 s, worst caption lead 70 ms; mirror 29.10 s, 0.11 s, 0.24 s, 90 ms (was 860 ms). p2-studio: stills t=2, 12.5, 40, 75 cmp-identical; player bundle 769,224 B with no Solid, effect-machine, studio or worklet code; drive on the harness (fake STT): record → Space → K kept and mixed, reload at the same T and beat, mis-hear → Accept anyway, 44.1 kHz mic recorded at 44.1 kHz, left-only stereo unhalved; posted WAV pcm_s24le mono at the context rate.

Guard blind spot (found 4 times this pass): `@bible/cli#test:perf` millisecond budgets fail the commit hook under sibling load (load 13–37) and pass alone. It is a check that fails for the wrong reason; fix it in its own batch (budgets relative to a same-run baseline, or out of the hook).

p2-encoder counsel (SP/film-pass2/counsel-encoder.md): the software encoder's first I-frame of every chunk keeps 0.27–0.48 of the grain (0.73–0.90 settled) — high, art direction; a Mac whose hardware check failed would now render in software silently; the Linux share at 24 Mbps is 1.16 GB. Share candidates measured from the Linux master: x264 CRF 23 slow tune grain 487 MB at the current grain, CRF 20 862 MB at the master's; mediabunny-server (libx264 fixed qp, default preset, no CRF or tune) q26 153 MB but 0.21–0.47 grain, q23 444 MB 0.33–0.67: rejected at equal size (decided by art direction over speed and size). A Bun-side master encode is not viable (a raw 1080p frame costs ~77 ms over CDP, ~960 s for the film).

p2-encoder merge proof: Mac config pinned byte-identical by `encode.test.ts` (`SETTINGS.Hardware`, q16/q26, key frame 2 s). Workbox full render 447.5 s (pages + join 158.9 s at 6 pages, x264 share 288.6 s), max RSS 1.28 GB; master 1.65 GB 31.6 Mbps, share 616 MB 11.7 Mbps; software default raised 6 → 8 pages (sweep, `--no-share`: 4 62.4 fps, 6 84.2, 8 97.9, 10 104.3). Shorts rendered on the Workbox: verdict 1507 frames (50.23 s), mirror 873 frames (29.10 s). Renders on the review page.

Open for the owner (pass 2):

- The long film's captions on voiced onsets: `core/captions.ts` `filmCaptionTimes` → `heard` moves 186 of 248 lines later (mean 0.205 s, max 0.90 s). Pixel-moving: owner's call.
- Mirror short is 29.1 s (ShortLength warns under 45 s): another span, or keep it short.
- Linux software master: frame 0 of a chunk now matches its settled key frames, but in the tablet and dark-room scenes every software key frame keeps 0.60–0.65 of the grain (pre-roll 8 and 60 Mbps give byte-identical I-frames: the encoder's limit). Accepted for the Workbox as a working master; the Mac's hardware master is the release master. Owner may ask for another Linux master path.
- A `takes voiced` backfill command for other films' timings (the scratch script was not committed).
- Media stack (owner, 2026-09-28: read mediabunny's source before any encode/decode decision). mediabunny's own packages cover what the film shells out to ffmpeg for: `@mediabunny/server` (NodeAV/libav in Bun: libx264 in true `qp` quantizer mode, decoders for any take format), `@mediabunny/flac-encoder` (libFLAC WASM, 24-bit). Batch p2-media replaces the ffmpeg CLI in `tools/media.ts` (take decode, FLAC master) and decides the Linux share copy (Bun-side libx264 at `Quality({ quantizer: 26 })` vs the 24 Mbps in-page encode) from the p2-encoder counsel numbers.
- Bump `mediabunny` and every `@mediabunny/*` together to the first release carrying upstream 06e4709 (extension workers under Bun 1.4; npm latest is still 1.60.0) and drop `patches/@mediabunny%2Faac-encoder@1.60.0.patch`, which is the same fix for aac only. p2-media waits for it (flac-encoder has the same hang in 1.60.0).

## Close

- Unswept directories: —
- Open review items: —
- Largest sweep finding: —
- Performance: —
- Structural change named by the loop reader: —
