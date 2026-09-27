# Film architecture loop — 2026-09-25

## Baseline

- HEAD: `8d7f9e89`
- Source lines: `9175` (apps/animations, *.ts)
- Film audio (`mix --stems`, mean dB): voice `-23.4`, music under speech about 16 dB below the voice, music between lines about 7 dB below
- Frame sheet: scratchpad `baseline-sheet.jpg`; golden stills at 60% of each scene in scratchpad `golden/`; mark times in scratchpad `baseline-cues.txt`; mix in scratchpad `baseline-full.mp3`

## Coverage

| Directory                                               | Files | Mark    | Pass |
| ------------------------------------------------------- | ----- | ------- | ---- |
| apps/animations                                         | 2     | unswept | 2    |
| apps/animations/src                                     | 1     | unswept | 2    |
| apps/animations/src/films                               | 1     | unswept | 2    |
| apps/animations/src/films/righteousness-by-faith        | 6     | unswept | 2    |
| apps/animations/src/films/righteousness-by-faith/scenes | 23    | unswept | 2    |
| apps/animations/test                                    | 3     | unswept | 2    |
| packages/film/src/canvas                                | 11    | unswept | 2    |
| packages/film/src/core                                  | 17    | unswept | 2    |
| packages/film/src/player                                | 2     | unswept | 2    |
| packages/film/src/tools                                 | 29    | unswept | 2    |

Pass 1 moved every directory (engine → packages/film, scripts → tools). Source lines after pass 1: 15268 (from 9175): the framework, its tests (99 in @bible/film) and the Effect tooling.

Pass 1 is the framework build. Its findings come from the retro and the prior-art reports, which already carry receipts. Pass 2 sweeps the new package and the app. Decided by redesign-from-first-principles: sweeping the old layout just before it moves would spend the sweep on files that are about to change.

## Prior art

Settled comparisons live in `.claude/skills/film-architecture-loop/prior-art.md`. Reports: scratchpad `prior-art-motion-canvas-theatre.md`, `prior-art-r3f-motion.md`, `prior-art-remotion.md`, `effect-tooling.md`.

| Idea                                                           | Source                                                | North star                            | Verdict                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Named cues, anchored to marks, resolved once in `layout()`     | Motion Canvas `waitUntil`; Motion `calc-time.ts`      | declared once, narration is the clock | adopt (P1-2)                                                                                                   |
| `stagger` from/ease, springs baked into easing                 | motion-dom `stagger.ts`, `create-generator-easing.ts` | pure frames                           | deferred: adopt when a scene needs it (subtract-before-you-add); the coin tower is the first candidate, pass 2 |
| Scoped browser, pages, ffmpeg; chunk queue; drain backpressure | Remotion renderer                                     | Effect-native tooling                 | adopt (P1-3)                                                                                                   |
| Lossless audio master, AAC encoded once, cut with `-t`         | Remotion audio muxing                                 | checked not eyeballed                 | adopt (P1-3)                                                                                                   |
| Captions (SRT/VTT) from word timings                           | Remotion captions                                     | cheap iteration                       | adopt (P1-3)                                                                                                   |
| Schema-decoded `timings.json`, manifest, voice                 | effect-tooling                                        | explicit over implicit                | adopt (P1-3)                                                                                                   |
| Marks, cues and acts on the player timeline                    | Remotion Studio                                       | checked not eyeballed                 | adopt (P1-4)                                                                                                   |
| Local clock `f.from(mark)`                                     | Remotion `<Sequence>`                                 | narration is the clock                | pass 2, after cues land                                                                                        |
| Shared `kit/`, pure `float`/`bob`                              | drei                                                  | cheap iteration                       | pass 2                                                                                                         |
| Edge darkening, deckled edge, wash transition                  | ocarina                                               | — (look)                              | pass 3, a look pass                                                                                            |
| Generators, signals, keyframe JSON, useFrame, MotionValues     | MC, Theatre, R3F, Motion                              | pure frames                           | rejected (see prior-art.md)                                                                                    |

## Target design

Decided by redesign-from-first-principles and small-interface-deep-implementation.

- **`packages/film` (`@bible/film`)** is the framework. Films stay in `apps/animations/src/films/<film>`; the app is the framework's first user.
  - `src/core/`: pure and DOM-free. Time and easing, narration, random, the timeline (named cues), layout (placement), the sound plan. Runs in the browser, in the tools and in tests.
  - `src/canvas/`: the draw kit (ink, cutout, paper, type, figure, camera, storyboard) and the compositor that renders a film at any `T`. Plain synchronous code: the draw-path lint exceptions apply here only.
  - `src/player/`: the preview player and the export handle.
  - `src/tools/`: Effect. Schema for every file on disk, typed errors, services (FilmRepo, ElevenLabs, Ffmpeg, Browser, Renderer, Narrator, Composer, Mixer), and one Effect CLI, `film`, with `narrate`, `score`, `mix`, `render`, `cues`, `check`.
- **Named cues.** A drawing declares `timeline: { stamp: { at: 'fiction', offset: 1.25, dur: 0.35 } }`. `layout()` resolves every cue once to scene-local `{start, end}`. `draw` reads `f.cue('stamp')`; `sound.ts` references `{ scene: 'justified', cue: 'stamp' }`. One time, two readers.
- **Checked, not eyeballed.** `film check <film>` fails on: a cue that ends after its scene, a sound cue naming an unknown cue, a stale take, and text that overlaps text or leaves the frame at the sampled marks.

## Pass 1

Worktree: `../bible-tools-film-pass1`, branch `film-pass1` (rift could not clone this repo: `Permission denied` on the copy-on-write clone). Apply batches in order; each commit compiles and passes the gate.

| ID   | Candidate                                                                                                                                                                             | North star             | Files                                                     | Lines removed | Risk | Status                                                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------- | ------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1 | Move the engine into `packages/film` (core / canvas / player), no behavior change                                                                                                     | explicit over implicit | `engine/`, `player/`, film imports                        | ~0            | med  | done `c61e888f` (cli fixes the gate needed) + `9c35d41e`                                                                                                                                                                                                                                        |
| P1-2 | Named cues: `timeline` on a drawing, resolved in `layout()`, `f.cue`; sound cues reference them; migrate every sound-referenced moment                                                | declared once          | core/timeline, core/layout, canvas/film, sound.ts, scenes | ~20           | med  | done `f29802db` + `d3bbfb67`; sound moved to match the picture: coins −0.80, shimmer(hand) +0.50, stamp(1888) −0.35, robe −0.30, stamp(witness) +0.25, stamp(justified) +0.05; picture unchanged (54 cue stills psnr=inf)                                                                       |
| P1-3 | Effect tooling: Schema boundaries, typed errors, services, `film` CLI; scoped renderer with a chunk queue; WAV master; captions; preflights; lint rules back on outside the draw path | Effect-native tooling  | scripts/* → packages/film/src/tools                       | tbd           | high | done `e0ae942d` `b9990cf6` `c3d6be24` (schema, services, CLI, lint split) + `32eb5eca` `7e199942` `5cf8a982` `bfedcf13` (WAV master, VTT, scoped renderer, 4% faster, interrupt leaves no process); full.mp3 byte-identical to baseline                                                         |
| P1-4 | `film check`: cue bounds, sound cue names, stale takes, text collisions at marks; marks/cues/acts on the player timeline                                                              | checked not eyeballed  | tools/check, player                                       | ~0            | med  | done `61951e90` + fixes `04107480` (justified: word strip over quote), `4f246f0b` (1888: cite tag over masthead) + `82bbaed2` (player ticks) + `a6274c57` (doctor/preflights); probe pixel-neutral (golden inf before fixes); after fixes only justified and 1888 stills differ; cues unchanged |

Counsel defects:

| ID  | Defect                                                                          | Red test                            | Status                                                                         |
| --- | ------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| C1  | Interrupted mix left a truncated `full.wav`; render muxed no audio and exited 0 | mixer + renderer + check tests (7)  | done `582aa4cb`                                                                |
| C2  | `check --scene` documented, flag was `--only`                                   | cli test                            | done `582aa4cb`                                                                |
| C3  | Misspelt scene ids passed `check`/`cues`                                        | cli tests                           | done `582aa4cb`                                                                |
| C4  | `FILMS_DIR` moved the tools but not the page                                    | film-repo test                      | done `582aa4cb` (knob removed)                                                 |
| C5  | Timings schema accepted negative/inverted times                                 | schema tests (4)                    | done `582aa4cb`                                                                |
| C6  | Take audio written before its timings (crash window)                            | narrator crash-at-every-step test   | done `582aa4cb` (content-named takes; timings rename is the only commit point) |
| C7  | `after:`/`with:` typos compiled                                                 | `drawing.types.ts` @ts-expect-error | done `582aa4cb`                                                                |

Live render: full film from `582aa4cb` — 10499 frames, video 349.967 s, audio 349.960 s, mean −23.2 dB (baseline −23.5), 569 s wall at 18.4 fps, VTT written; frame sheet matches the baseline scene for scene; golden: 14/16 inf, justified and 1888 changed only by the P1-4 fixes; `full.mp3` byte-identical to baseline; no process left running.

## Close

- Unswept directories: all ten (pass 2 sweeps them)
- Blind spot found: strokes over text (the rule through MINNEAPOLIS in 1888) — `check` cannot see it, so pass 1 is not the last (close rule)
- Largest sweep finding: —
- Structural change named by the loop reader: —
