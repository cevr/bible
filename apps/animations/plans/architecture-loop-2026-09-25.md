# Film architecture loop — 2026-09-25

## Baseline

- HEAD: `8d7f9e89`
- Source lines: `9175` (apps/animations, *.ts)
- Film audio (`mix --stems`, mean dB): voice `-23.4`, music under speech about 16 dB below the voice, music between lines about 7 dB below
- Frame sheet: scratchpad `baseline-sheet.jpg`; golden stills at 60% of each scene in scratchpad `golden/`; mark times in scratchpad `baseline-cues.txt`; mix in scratchpad `baseline-full.mp3`

## Coverage

| Directory                                               | Files | Mark    | Pass |
| ------------------------------------------------------- | ----- | ------- | ---- |
| apps/animations                                         | 1     | unswept | 2    |
| apps/animations/scripts                                 | 5     | unswept | 2    |
| apps/animations/src/engine                              | 14    | unswept | 2    |
| apps/animations/src/films                               | 1     | unswept | 2    |
| apps/animations/src/films/righteousness-by-faith        | 6     | unswept | 2    |
| apps/animations/src/films/righteousness-by-faith/scenes | 23    | unswept | 2    |
| apps/animations/src/player                              | 1     | unswept | 2    |

Pass 1 is the framework build. Its findings come from the retro and the prior-art reports, which already carry receipts. Pass 2 sweeps the new package and the app. Decided by redesign-from-first-principles: sweeping the old layout just before it moves would spend the sweep on files that are about to change.

## Prior art

Settled comparisons live in `.claude/skills/film-architecture-loop/prior-art.md`. Reports: scratchpad `prior-art-motion-canvas-theatre.md`, `prior-art-r3f-motion.md`, `prior-art-remotion.md`, `effect-tooling.md`.

| Idea                                                           | Source                                                | North star                            | Verdict                     |
| -------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------- | --------------------------- |
| Named cues, anchored to marks, resolved once in `layout()`     | Motion Canvas `waitUntil`; Motion `calc-time.ts`      | declared once, narration is the clock | adopt (P1-2)                |
| `stagger` from/ease, springs baked into easing                 | motion-dom `stagger.ts`, `create-generator-easing.ts` | pure frames                           | adopt (P1-2)                |
| Scoped browser, pages, ffmpeg; chunk queue; drain backpressure | Remotion renderer                                     | Effect-native tooling                 | adopt (P1-3)                |
| Lossless audio master, AAC encoded once, cut with `-t`         | Remotion audio muxing                                 | checked not eyeballed                 | adopt (P1-3)                |
| Captions (SRT/VTT) from word timings                           | Remotion captions                                     | cheap iteration                       | adopt (P1-3)                |
| Schema-decoded `timings.json`, manifest, voice                 | effect-tooling                                        | explicit over implicit                | adopt (P1-3)                |
| Marks, cues and acts on the player timeline                    | Remotion Studio                                       | checked not eyeballed                 | adopt (P1-4)                |
| Local clock `f.from(mark)`                                     | Remotion `<Sequence>`                                 | narration is the clock                | pass 2, after cues land     |
| Shared `kit/`, pure `float`/`bob`                              | drei                                                  | cheap iteration                       | pass 2                      |
| Edge darkening, deckled edge, wash transition                  | ocarina                                               | — (look)                              | pass 3, a look pass         |
| Generators, signals, keyframe JSON, useFrame, MotionValues     | MC, Theatre, R3F, Motion                              | pure frames                           | rejected (see prior-art.md) |

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

Rift: `.rifts/film-pass1`. Apply batches in order; each commit compiles and passes the gate.

| ID   | Candidate                                                                                                                                                                             | North star             | Files                                                     | Lines removed | Risk | Status  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------- | ------------- | ---- | ------- |
| P1-1 | Move the engine into `packages/film` (core / canvas / player), no behavior change                                                                                                     | explicit over implicit | engine/_, player/_, films/* imports                       | ~0            | med  | pending |
| P1-2 | Named cues: `timeline` on a drawing, resolved in `layout()`, `f.cue`; sound cues reference them; migrate every sound-referenced moment                                                | declared once          | core/timeline, core/layout, canvas/film, sound.ts, scenes | tbd           | med  | pending |
| P1-3 | Effect tooling: Schema boundaries, typed errors, services, `film` CLI; scoped renderer with a chunk queue; WAV master; captions; preflights; lint rules back on outside the draw path | Effect-native tooling  | scripts/* → packages/film/src/tools                       | tbd           | high | pending |
| P1-4 | `film check`: cue bounds, sound cue names, stale takes, text collisions at marks; marks/cues/acts on the player timeline                                                              | checked not eyeballed  | tools/check, player                                       | tbd           | med  | pending |

Counsel defects:

| ID  | Defect | Red test | Status |
| --- | ------ | -------- | ------ |

Live render: pending

## Close

- Unswept directories: all (pass 2)
- Largest sweep finding: —
- Structural change named by the loop reader: —
