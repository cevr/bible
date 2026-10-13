# Rive rigs

A body that moves (a figure, a creature, a jointed prop) is a Rive rig: bones, skinned paths, constraints and a view model, generated from TypeScript, built to a `.riv` by the Rive CLI, and posed by our frame. Rive draws the picture; the clock, the narration, the cues and the probes stay ours. The contract is `packages/film/README.md` § Rive; this file is the map, the rules no type confesses, and the proof.

## Map

| Seam                                             | Where                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A rig as a drawing declares it, a pose, the draw | `canvas/rive.ts`: `RivePropSpec`, `RiveEngine`, `PoseOf`, `drawRig` (exported as `@bible/film/rive`)                                                                                                                                                  |
| `drawing({ rigs })` and `f.rive`, typed by name  | `canvas/film.ts` `Frame`; the compile errors in `canvas/drawing.types.ts`                                                                                                                                                                             |
| The load                                         | `rive/load.ts` `loadRigs`; the service `rive/runtime.ts` `RiveRuntime`; its layers `rive/runtime-browser.ts` `RiveRuntimeBrowser` (a page) and `rive/runtime-bun.ts` `RiveRuntimeBun` (`check --draw`, tests)                                         |
| A film's load and its owners                     | `player/narrated.ts` `narratedFilms`; `player/main.ts` `stageFilm`, `lab/review/options/stills.tsx` `useSceneStills` (the lab's Project) over `lab/review/options/draw-stills.ts` `drawStills`, `tools/draw-check.ts`                                 |
| The GL budget                                    | `canvas/gl.ts` `holdGl`, `dropGl`, `glCanvas`                                                                                                                                                                                                         |
| Load errors                                      | `core/errors.ts` `RigUnloadable`, `RigNameMissing`                                                                                                                                                                                                    |
| The fixture rig                                  | `rive/fixtures/arm/arm.rml` (built to `build/arm.riv` beside it), declared by `canvas/fixtures/arm.ts` `armRig`                                                                                                                                       |
| A look with a rig                                | `apps/animations/src/films/cold-studies/look.ts` `Look` (its `rigs`); `apps/animations/src/films/cold-studies/looks/rive/` (`index.ts` the looks, `accused.ts` the spec and pose, `rig.ts` the generator, `rml.ts` the printer, `build.ts` the build) |

## Declare and pose

- **A spec per engine.** `accusedProp(engine)` in `apps/animations/src/films/cold-studies/looks/rive/accused.ts` is the shape: the `.riv` imported `with { type: 'file' }`, the artboard, the timelines and view-model numbers a pose may name (typed by the generator's own `TIMELINES` and `KNOBS`), the engine, `key` (its name in errors), `origin` (the artboard point at our 0, 0) and `face` (the node `check` reads as the face).
- **The look declares it; the scene passes it on.** The look sets `rigs: { accused: accusedProp('canvas') }`; the court's drawing writes `rigs: lookOf().rigs`, so the film loads exactly what the look in play draws. A look that draws its figure itself leaves the name out.
- **The draw poses it from `f`.** `f.rive('accused', poseOf(f))`: each timeline `[name, seconds, mix?]`, applied in order, then the numbers by name. Seconds come from the cues: `cueTime` stretches a timeline's authored move over its cue's `dur`, so a lab edit to the cue reshapes the move. A misspelt rig, timeline or number fails typecheck; a name the `.riv` lacks fails the load (`RigNameMissing`, listing what the file has).

## Purity: a fresh instance every frame

`drawRig` makes, every frame, an artboard instance from the loaded file, a view-model instance, and an instance of each timeline the pose names; it applies them, advances by no time, draws, and deletes them all. A frame is a function of its pose by construction. Keep it so:

- **Write the pose from `f` alone.** A module scratch object is fine when the pose rewrites it each frame (`NUMBERS` in `accused.ts`); a pose, artboard or instance kept for the next frame is not.
- **No rest pass and no reset timeline.** Posing one instance again keeps what earlier frames left in it: Rive remakes a shape's paths only when they move past a tolerance, so they keep an earlier frame's rounding; a constraint solves from the last frame's bones; a bind writes back into the view model. The design that posed one instance from rest through an authored `fresh` timeline had 60 of 60 frames off; reusing an instance drew 22 of 60 fixture frames and 59 of 60 accused frames off.
- **No state machine.** It keeps its state and any transition in flight between frames, and Rive would own time. The binds apply on the artboard's own `advance(0)`.
- **The draw path stays synchronous:** no Effect, no Promise, no try/finally. A frame that throws leaves its instances in the rig's in-flight slot; the next frame or the load's scope frees them.

The fresh instance has a cost (89 µs a frame for the accused in Bun). A speed-up keeps it and finds its time elsewhere ([performance.md](../film-architecture-loop/performance.md), Where time goes).

## Loads are scoped Effects

- **The layers.** `src/rive/` imports `core` and `canvas` only; the player (`narratedFilms`) and the tools (`check --draw`) import it, and the engine never does, apart from its fixtures, which load a rig to draw it. `.oxlintrc.json` holds both directions (`packages/film/README.md` § The purity rule). A look reaches a rig only through `@bible/film/rive`: no package export resolves into `src/rive/`.
- `loadRigs(film)` needs `RiveRuntime` and a `Scope`. `narratedFilms` makes each film's load an `Effect<Film, FilmUnloadable, Scope>`, and whoever runs it owns the scope and closes it: the player page (`stageFilm`, the page's own scope), the lab Project's stills (`useSceneStills` running `drawStills` in a scope its cleanup closes, which stops a load in flight), and `check --draw` over `RiveRuntimeBun`.
- Run a load on the consumer's own fiber, inside its scope. Each wasm object a rig holds (the file, its renderers, its GL targets) belongs to that scope, so a rig handed out past a Promise (`Effect.runPromise` then a later use) is a use after free, and a top-level `await` of a runtime or a `.riv` holds a native lifetime no scope owns.
- Bun draws nothing (`paints: false`): the rig is posed for real and its face declared, so `check --draw` sees a throw, a pose naming what the rig lacks, and ink over a rig's face. A rig's pixels are proved only in a page (below).

## Engines and the GL budget

- A `webgl2` rig draws on a 512 px tile where its box fits, else a frame-sized target, primed once with the rig at rest before its first real frame (the engine's own, so the Rive Renderer's buffers are never sized by earlier frames), then composited with `drawImage`.
- Its targets share `glCanvas`'s budget of 8 live WebGL contexts (`holdGl`). A target whose context is lost (the budget let it go, or the browser) is remade and primed before it draws; where no WebGL 2 context can be made, the draw fails naming why, never a blank frame.
- `canvas` draws with Rive's Canvas 2D renderer on our own context. Where WebGL has no pixel local storage (SwiftShader), the Rive Renderer falls back to 4× MSAA and feathers only a `clockwise` fill.

## Build a rig

- The rig is code: `rig.ts` (`accusedRml`) prints RML through `rml.ts` (`el`, `fragment`). `bun apps/animations/src/films/cold-studies/looks/rive/build.ts [--inspect] [--screenshot]` writes `project/` beside it (`rive.yaml` and the `.rml`, git-ignored), runs `rive <project> --once --quiet --format=json` (offline, unsigned), and copies the built `.riv` beside the look, where `accused.ts` imports it. Commit the generator and the `.riv` together.
- The fixture: `cd packages/film/src/rive/fixtures/arm && rive . --once`.
- The CLI is `rive` on the PATH (this Mac: the Homebrew cask `rive-app/tap/rive-cli`, 1.5.1), or the one `RIVE` names for `build.ts`.
- A `.riv` is served as a file import (`assets.d.ts`): a page build bundles it and the page reads its URL through `HttpClient`; the wedge (`tools/wedge.ts`) bundles the render page with `publicPath: '/'`, so `render --level` and `check --level` serve it too; in Bun, and in the wedge's own module (`tools/wedge-module.ts`), it is a path on disk.

## CLI and runtime quirks

- **`rive inspect` exits 1 when the project has an error, and still prints the whole JSON report.** Decode stdout whatever the exit code (`build.ts` does); warnings alone exit 0.
- **Every `.rml` is a fragment:** `<Rive version="1" kind="fragment">…</Rive>` (`rml.ts` `fragment`). Without it the build fails `missing <Rive> root`, and `inspect` adds `missing-backboard`; the wrapper fixes both.
- **A timeline instance has no length.** In the 2.43.1 runtime, `LinearAnimationInstance` has no `duration` or `fps`, though its types declare them. The rig module states each timeline's seconds (`TIMELINES` in `rig.ts`), and the pose computes time from them; an artboard's size is its `bounds`.
- **The WebGL 2 runtime has no `beginFrame`,** though its types say so: `clear` starts the frame (`canvas/rive.ts`).
- **The Mac's render Chrome has no WebGL.** Bun spawns Chrome with `--disable-gpu`, which no later flag undoes, and on darwin `launchArgs` (`tools/browser.ts`) asks for Metal for the encoder, not for SwiftShader. So in a Mac render a `webgl2` rig fails its load (`RigUnloadable`) and a `glCanvas` look draws its 2D fallback. The browser tests (`lab/fixtures/browsers.ts`) and every Linux render have WebGL 2 through SwiftShader. A `webgl2` rig is proved in the browser tests, or rendered on Linux.

## Prove a change

From `packages/film`:

```sh
bun test src/rive src/tools/draw-check.test.ts src/player/narrated.test.ts src/lab/review/options/draw-stills.test.ts src/canvas/gl.test.ts
lockf -k /tmp/bible-tools-e2e.lock bun src/lab/fixtures/run-suite.ts --timeout 60000 e2e/canvas/rive.pixel.test.ts   # flock on Linux
```

- `src/rive/rive.test.ts` proves purity path for path (60 shuffled frames against a newly loaded rig), and that a load stopped, failed or closed mid-way frees everything; `e2e/canvas/rive.pixel.test.ts` proves it in pixels (five times after two histories, against a fresh page) and past a lost context.
- A rig on a real look, in-process: from `apps/animations`, `bun run check cold-studies --draw --level style=rive --scene court` (`style=rivegl` for the `webgl2` engine). A rig error is the finding; in a worktree with no mix, `AudioMissing` and two `EndShort` are the film's sound, not the rig.
- Then `bun run gate`.
