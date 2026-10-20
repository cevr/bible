# @bible/film

The engine behind the cut-paper explainer films in `apps/animations`: a film
is an ordered list of narrated scenes, laid end to end on a clock set by the
recorded words, and every frame is a pure function of that film and a time.

## Entry points

| Import                      | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`          | The clock: easing and `progress` (`time`), seeded noise (`random`), `{mark}` narration timing, named cues (`timeline`), the sound plan, scene `layout`, a person's takes (`recording`, `align`, the reading `sheet`, the studio's wire `studio`), and the mix: `mixPlan` (what plays where) and `renderMix` over planar PCM (`audio`, `dsp`: the ffmpeg filters it replaced, ported), and the synth (`synth/`: a code sound is a graph of nodes, `synth/graph/nodes.ts` `CodeSound`, that `renderCode(sound, seed)` renders to the same samples on every host with its own transcendental maths, `synth/graph/math.ts`; `synth/graph/presets.ts` holds the families the app's code sounds are built from, the tones (`room`, `chime`, `drone`, `drain`, `bloom`, `notes`) and the shapes (`burst`, `thump`, `knock`, `scatter`, `whoosh`, `hiss`, `sizzle`, `breeze`, `rain`); `loudness` is an ITU-R BS.1770-4 meter, integrated, momentary max and peak; `sheet` draws a sound's spectrogram, waveform and loudness as one picture; `compare` sets a sound's numbers beside another's), the audit of which generated sounds code can make (`sfx-audit`), and the sound library's pure half (`sfx`: `family.thing` names, generated (each with its `why` and an optional code trial), code and recorded declarations, the lock's variants and the request hash that says a sound is current, which variant each placement plays and its seeded jitter, levels in dB relative to the voice). The entry names only what films, their kits, the app's sound library and tests import (the clock, `hash2`/`rng`, `defineScript` and the film schemas, `defineLibrary` and the sound families, `defineStore`); the framework reads every other module by its path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@bible/film/canvas`        | The Canvas 2D draw kit (ink, cutout, paper by meaning (`piece`: a figure cut and outlined, its line crawling, scenery torn with no ink and held still; `stroke`'s `boil`: tick, crawl or none), the `ground` contact shadow, paper fibre fixed to the backdrop plane (`planeFibre`), paper under a faint film grain, type, the one floating mitten hand with no arm (`hand.ts`: `floatingHand(ctx, root, { to, reach, grip }, style, hand)`, at rest beside its figure bobbing with the breath (`breathOf`), travelling toward its target on a soft arc about the shoulder, eased, with a settle, its grip forming from the open rest as it arrives; a hand at work that changes grip names the grip it `was` and morphs into the new one by `change`, point for point, never swapping in a frame (`handShape` its outline, for tests); `handAt` where it is, pure and allocation-free; `closeHand` the same hand close up, an open hand held out palm up seen from above, the palm the biggest shape, its middle on the origin, whose round finger block bends up toward the eye and back over the palm to cup (`closeShape` its outline at any `open`, continuous), with a lifeline and two soft joint lines; `CLOSE_SPAN` its length, no forearm; a gesture's `turn` turns its mitten palm up into the same shape at the mitten's size (`palmUpFrame`), so a push from the figure's hand into the close-up is one shape at two scales), figure, multiplane camera; every drawn scene breathes once by `DRIFT` (a scene's own `drawing({ drift })` in its place, `0` held still): through its outermost `camera` or `multiplane` when it frames one (a shot's `drift` is its share, `0` held still, `driftHeld`), as the outermost transform over its whole draw when it frames none, `shotPath`/`lerpCamera` shots (a deep push by `pushInto`, its target held in frame), `inset` for a picture in picture whose shots never take the scene's breath and `knobCamera` framings from knobs, storyboard), `createFilm`, which composites any `T` (a scene's full-screen cards, `drawing({ cards })` and `SceneSpec.cards`, more than one where a scene needs them, each the whole frame over its own cue on the film's paper, hard cut in, no caption over it; two whose cues hold at one instant stop the film and refuse the edit that would make them, `CardsOverlap`; the card that holds to the scene's end leaves as the card into a transition; a card's `flood` grows from the `Box` the scene's draw returns on the same frame (`floodBox`), within the look's own edge where its `mask` paints one, and a flood inside a transition stops the film and refuses the edit that would move it there, `FloodInTransition`), the card kit (`fullCard` with `CardStyle` and the take's `CardWord`s, `verse` with `Verse` and `VerseStyle`, whose `pad` joins a line's highlight into one bar, a phrase not in its verse stopping the frame; `TextStyle`; `floodBox`, where a flood stands at its eased progress), `glCanvas` (a WebGL 2 canvas for a look drawn in 3D: kept per key, a page-wide namespace a look names for its film, remade when its context is lost, 8 contexts kept live on the page, the keys' and the webgl2 rigs' together, so a frame asks for at most 8 and a look composites a canvas before asking for another key or size; none where WebGL 2 cannot be made, the look's fallback drawn), and the text probe (`probe.ts`) `film check` reads. The entry names only what films, their kits and their tests use, the credits roll (`creditRoll`), `glow`, `sky`, `wash`, `mix`, `clearOf`, `ramp` (a base colour's shade and light under a key light, CRAFT 12 as one function: the shade darker and turned toward the light's complement, the light lighter and leaning to the light's hue, neither ever grey; a look tunes it by its `Shading` knobs, a near-neutral's turn among them, and reads the result as a `Ramp`; `ramp` refuses knobs under CRAFT 12's floors, a chroma of 6 and a 10° turn, so no tuning shades grey), the `Hex` a colour is written as (a palette `satisfies Record<string, Hex>`, `Light`'s colours) and `reset` among them; the engine's own parts (`handShape`, `closeShape`, `palmUpFrame`, `lerpCamera`, `planeFibre`, the paper's sheets) are exported from their files for the framework and its tests. |
| `@bible/film/render`        | `mountRender(films)` (`player/render.ts`, the encoder's one importer; the only studio page that loads mediabunny is the review, and only where its compares play on WebCodecs panes: `browser/media-browser.ts` `panesMediaLayer` imports them when the browser allows, so a phone downloads none of it): the render page (a film's export page: the lab's `/films/<film>/export`, the PreviewServer's `/?film=<film>&export`), whose handle (`ExportHandle`, on `window.__film`) a renderer and the easel drive. Its own entry, never re-exported by `player`: every page imports its films through `player`, so a studio page built beside the render page would load the encoder too (`tools/page-graph.test.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `@bible/film/player`        | In `main.ts` the scrubbable preview (`mountPreview`) a film's studio mounts (`mountFilmStudio` in `@bible/film/play`), its bar up at once and its canvas drawn once the faces its film draws in have loaded (its loader asks for them and gives the film without waiting, `narratedFilms`; the preview, the stills and the render handle wait, `pictureFacesWait`; the engine names no family), whose track marks marks, cues, sound effects and score movements (`core/ticks.ts`), a click on its picture playing or pausing it, the narration as a typed state (`narration.ts`: `None`, `Loading` (a play asked then starts once it can, from the clock's time then), `Ready`, `Blocked` until a click, `Missing` when the master will not load or play, which the preview then never asks to play and says `no narration`), the one source of stills (`stills.ts`: drawn a frame apart, the last asked for first, none when a face the film draws in will not load, its `ready` and waiting `all` then rejecting; the look-book sheet draws through it), and the look-book sheet `film lookbook` writes (`lookbook-sheet.ts`), set in the film's own type (its shorts' hook and caption families). Framework-free, so the renderer's page never loads Solid. `player.css` styles it and the lab, over the studio's tokens (`tokens.css`, `@bible/film/tokens.css`). The entry exports only `narratedFilms`, the `Narrated` type, and the films’ faces (`pictureFaces`, `Face`, `SUBSETS`); the lab reaches the rest of `main.ts` by path. `src/exports.test.ts` guards this entry, `render`, `canvas`, `stand-in`, `core`, `@bible/film/style` and `@bible/film/style/build`: each names its exports, and each name has a user; and every module under `core/`, `lab/`, `tools/`, `canvas/`, `player/`, `browser/`, `command/`, `style/` and `lint/` exports only names another file imports (read by the parser, so a comment hides nothing; a `.types.ts` check, a fixture film and a lint fixture are not swept).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `@bible/film/play`          | `mountFilmStudio(pages)` (`lab/film-studio/mount.tsx`): a film's studio (`/films/<film>/studio?v=&sel=#t=`, `lab/film-studio/`), the one page a film is reviewed and edited on, under its own header (Films ⇧1, the film, the version chip, the stage, what waits), where the shell (`lab/page-shell.tsx`) heads Films and the review's pages. Its parts are compound components (`Studio.Root` in `context.tsx`, `Editing.Root` in `editing.tsx`), their state held by effect-machine machines: the timeline and the transport (`machine.ts`), the edit in flight (`edit.ts`), the note being filed (`note-save.ts`) and the Board's writes (`board-writes.ts`); the notes (`lab/notes/`: `<NotesFeed>` in `thread.tsx`, its feed in `feed.ts`) hold the feed. Every part is Solid; none mounts plain DOM into the page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@bible/film/review`        | `mountReview`: the review page (`film lab`'s `/`, `/sets/<folder>[/<point>]`, `/productions/<production>`), hydrating what `@bible/film/review-server` rendered, `<Root>`, `<SetProvider>` and its pages mounted: renders compared in sync, and a production's timeline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@bible/film/review-server` | `reviewRender`, the review's server entry (the default export of an app's `review.server.tsx`): the review rendered for one request over `ServerHosted`, each read through the render's own reads (`LabClient.layerRendering`) and sent with the page; it draws no film.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@bible/film/play-server`   | `studioRender`, the server entry of an app's `play.server.tsx` (`lab/film-studio/server.tsx`): a film's studio (`lab/film-studio/page.tsx`), its frame and the film's name; the body is the browser's (`SERVER_BODY`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@bible/film/solid-plugin`  | The Bun plugin that compiles `.tsx` with Solid's compiler (`@solidjs/compiler`): the lab's pages (`LabPage`: `solidPlugin` for each browser bundle, `solidPluginFor('ssr')` for each server entry) and the lab's browser tests bundle with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@bible/film/stand-in`      | The one stand-in 2D context for tests (bun has no canvas): `recorder` holds a canvas's drawing state from a canvas's defaults, saved and restored whole (the transform, which `setTransform` takes as six numbers, a matrix or nothing; an alpha kept within 0..1; the shadow, font, line width and every other property set), records each fill and image, answers a pixel read with the last hex fill over it (so a face's opacity read takes the canvas's branch and `cutout` draws pre-blended faces as a render does), and with `onCall` tells a test of every call and property set (how `check --draw`'s leg, `tools/draw-check.ts`, logs a frame to check it is pure); with `measure` it sets text with a test's own advances in the context's font; each canvas it makes carries its number (`isStandInCanvas`, `made`); `withDom`/`standInDom` put up a document whose canvases are stand-ins; it refuses what a real canvas refuses (a negative radius, a colour stop off 0..1, a stop colour made of NaN or undefined, a non-finite gradient coordinate). The framework's canvas tests and `check --draw` draw into it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@bible/film/rive`          | A Rive rig as a drawing declares it (`RivePropSpec`, `RiveEngine`, `PoseOf`; its `ink`, how it follows the shot, sets the number `INK_NUMBER` from the shot's scale) and the draw that poses it from rest (`drawRig`, `canvas/rive.ts`); its loader, `RiveRuntime` service and host layers are `src/rive/` (see Rive).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@bible/film/style`         | The house look as a scene reads it: a face acted from `EASE` toward an `Expression` (`acted`), the paper's boil (`boilTime`), a hand reached about a point (`reachAbout`), a tunic's outline as the house cuts it (`tunicOutline`), `smooth`, and the house's key light and shading knobs (`keyLight`, `shading`: K1), which a film ramps its own papers under (`rampedPaper`). A film's papers are checked as its module loads (`papers`), each rimmed as its concept lays it (the house's `RIM`, or a width of its own) or not at all; a film's canvas people and page read the house's two papers (`peoplePaper`, `parchment`). A figure is composed of parts (`figure`, its parts' kinds from `src/style/parts/`), cut from the house's outlines (`ellipse`, `roundedPolygon`, `shifted`), each checked under the house's rules (`src/style/rules.ts`) as it is made; one the owner locked carries its lock (`src/style/lock.ts`). A set creases its pieces under the same light (`boxOf`, `creaseOf`; a turn's `Crease`). A film lays its figures in one file (`figuresFile`, `src/style/figures-file.ts`): each artboard its name, its boil's seed and its place on the stage, drawing a composed figure, with the artboard its hands are drawn on, or a circle hand at its size (`HAND_ART` times it); a name laid twice, a figure's hands laid on a hand of another paper, or a figure `figure` did not return (a copy of one with a part changed, its parts never checked) is refused as the module loads, and the house draws no such figure. The house prints the file in its line at the file's weight (`figuresRml`: `src/style/rig/draw.ts` `drawFigure` and `drawHand`, in `DIRECTION`: K1, A3 in B1), each locked figure's print alone (`lockedPrints`), and every override its figures carry, whatever rule it frees, by the artboard it is laid on (`figureOverrides`, found by `src/style/override.ts` `overridesIn`), each saying what it cites, the owner's words or his pick on an ask (`citedBy`). Every ink stroke of a figure and its hands (the silhouette, each piece's line, and the face's brows and mouth line) binds its width to the artboard's number `ink` through a range mapper, 1 the line as cut, 0.75 three quarters of the ink that shows past its paper and light core; the file's rigs follow the shot (`shot`, spread into each spec), the line thinning from a head a fifth of the frame's height to 0.75 at three tenths (`src/style/house.ts` `CLOSE_SHOT`, `inkAt`); a file that bakes its ink (`baked`, RBF's, its locked prints as cut) binds none and follows no shot. A film writes no RML: the rig (`src/style/rig/`) is the house's alone. Its source is `src/style/` (see Rive).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@bible/film/style/build`   | `compile`: a figure project compiled by the Rive CLI, offline and unsigned, into its `.riv`, with the CLI's warnings and problems and the stamp of what it was built from; `unbuilt`: why a committed `.riv` is not the build of its rigs, read through that stamp with no CLI; `unlocked`: which locked figures' prints are not the ones their lock files hold, or whose locks name no decision on the production's ledger, and which an override backed by the owner's decision on that figure frees; `unsaid`: which overrides on a film's figures cite a word that is not the owner's on that figure: no decision on his production's ledger filed at the point `item:<item>` (after the lock, for a lock's override) says its quote, verbatim, or filed the pick its answer cites; a question or a note is never his word (see Rive).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@bible/film/tools`         | The `film` CLI (`runFilmCli`) and its Effect services: FilmFolder and FilmRepo (`film-repo.ts`: a film's paths, and its modules loaded), ContentStore, ElevenLabs, Media (mediabunny + mpg123 + WASM AAC and FLAC + FFmpeg in-process through NodeAV: durations, decode, WAV, a person's recordings loaded and their FLAC masters, joining a film; x264 in-process for a software share copy and the review's phone copies (`x264.ts`), `jpeg.ts` for its stills, `png.ts` for a sound's sheet, and `card`, a picture held over a sound as an MP4), Narrator, Takes (a person's recordings), Composer, Mixer, SoundLibrary (`library.ts`: an app's `sounds/`, its candidates made, kept, rejected, imported, auditioned, checked, its code sounds and trials rendered, compared and clipped for an ask, and its private `files/` synced through the app's private store), SoundRender (`sound-render.ts`: each code sound's seed rendered once and measured once), `MediaStoreService` (`media-store.ts`: the store interface, `put`/`get`/`hashOf`/`list`/`read` with a byte range, and the folder store), `r2-store.ts` (the R2 store, SigV4 in `sigv4.ts` through `HttpClient`), PrivateStore (`private-store.ts`: the store `library.ts` declares, reached with the `FILM_STORE_*` key read as `Config.Redacted`), Browser, Pages (`pages.ts`: the export page pool check, look and render share), PreviewServer, Renderer (`render-plan.ts` is its pure plan), RenderCatalogue (`catalogue.ts`: a film's `catalogue.json`; the domain is `core/catalogue.ts`), Stamps (`stamp.ts`: each scene's content key), `film project` (`project-cli.ts`), Checker (`check.ts` holds its pure detectors), NotesStore, the composition root (`film-services.ts`: `filmServices`, `labPages`, `startLab`, the one graph `runFilmCli` and `apps/animations/studio-harness.ts` run on; `film-services.test.ts` names the two and sweeps for a third), LabPage (`lab-page.ts`: each page's browser bundle and server entry, `PageBundler`) and PageRenderer (`page-render.ts`: a worker per build, its reads through the lab's own handler, `PageReads`), the lab's routes (`lab.ts`), its studio (`studio.ts`, StudioReadings) and its source editing: SceneSources, SourceWriter (every write, its undo and redo), SceneWriter, and BeatEdits (`beat-edits.ts`: the studio's edits of a script); FreshFilm (`fresh-film.ts`: the film CLI run again in a new process, its answer or refusal read back: options, takes, the project, the check, the studio's reading, a cue, the mix; `film read`, `read-cli.ts`); and the review (`review.ts`, `review-http.ts`): Review, and Choices (`choices.ts`, a film's options: listed, heard, picked, each read in a fresh process through `FreshFilm` and `film options`, `choices-cli.ts`); and the art-direction seeder (`core/art-seed.ts`: `drawBatch` draws looks from an app's `ArtDeck` of `ArtAxis` options by seed, the same seed the same look forever, keeping off incompatible picks and a distance from the existing looks and each other; `artBrief` writes one as a style brief; `conflicts` names the picks of a look that cannot stand together; `apps/animations`' `bun run seed-look`). The picks fill (`fill-picks.ts`: `runFillPicks`, over `ask-store.ts`' `fillPicks`) files the owner's picks onto each ledger decision that names its ask and carries none, from the ask's record in the lab's asks, and leaves one whose record is not there (`apps/animations`' `bun run fill-picks`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Data

`core/schema.ts` holds the Schemas for everything a film reads or writes:
`Timed` scenes, `Beat` (a script's beat: `Timed` plus `cite` and a `picture`
brief), `Voice`, `Timings` (`narration/timings.json`), `Sound`, and
`SoundManifest` (`sound/manifest.json`). The TypeScript types derive from them.
`TimingsJson` and `SoundManifestJson` decode a file's text and encode it back
byte for byte; the request hashes (`voiceKey`, `musicKey`, `requestKey`) are
taken over Schema-encoded requests, so a committed hash stays current.
The export page's handle and what its probe records (`ExportInfo`,
`TextBox`, `InkMark`, `FaceMark`, `HandMark`, `Probed`) are declared beside
the handle in `core/export-handle.ts`; a choice point's id in
`core/point.ts`; an address as data (`Address`, `addressKey` and its inverse
`addressOfKey`) in `core/address-schema.ts`, a leaf both `schema.ts` and
`address.ts` read (`address.ts` re-exports it beside `resolveAddress`). A scene's and a short's
id is one shape, `PartId` (lower case, digits and dashes, starting with a
letter or a digit), and an act's name (`ActName`) never starts with `-`: the
film is refused at load, naming the id, when one names no address, point or
argument. A short's id and an act's name are each declared once (`Shorts`,
`Look`), so `short:<id>` and `act:<name>` each name one part.

## Tools

`film narrate|takes import|script|score|mix|cues|check|render|lookbook|judge|project|chapters|options|read <film>` (and `film doctor`, `film lab` (the lab and the review, every film), `film lab <command>` (the lab's command set, its MCP tools: `notes`, `look`, `match`, `journal` and the rest, `tools/lab-cli.ts`), `film lab events` (the lab's events, a line each, `tools/events-cli.ts`), `film media …` over the private media store, `film sfx …` over the app's sound library, `tools/sfx-cli.ts`, and `film footage …` over its footage library, `tools/footage-cli.ts`, and `film talk words <talk>` over a talk's edit, `tools/talk-cli.ts`, and `film ask wait <ask>` (or `--page <ask>`, every ask on its page), which exits once the owner has answered an ask on the running lab, `tools/ask-cli.ts`) runs from the app that holds the
films. The app owns the entry: it calls `runFilmCli({ films, sounds, footage, folders, previewServer, lab, self, judge })`
with its films folder, its sound library folder, its footage library folder, its own `out` and `lab` folders
(where a run writes renders and notes, whatever directory it starts in; `FILMS_OUT` and
`FILMS_LAB` win when set) and its `productions` folder (the committed ledgers;
`FILMS_PRODUCTIONS` wins when set), a scoped `PreviewServer` layer that serves its
player page, `lab`: where the lab listens (`at`, a `LabAt`), its pages
(`pages`: the app's HTML entries, `pages`, and the server entries of those the
server renders, `servers`) and the roots it reviews; the framework's
server (`labServer`) answers there (see `apps/animations/cli.ts`); and
`judge`, the rule files `film judge` quotes. Logs (`Effect.log`, `event
key=value`) go to stderr, a failed command's report too (logged under the
same logger before the runtime exits, not by `runMain`'s own reporter, which
would print to stdout; a typed failure as its tag and message, a defect with
its stack); stdout carries only what a command prints, so a
failing `check --json` still prints only findings (a film that does not load is its one error finding). The player imports the same folder, so the tools
and the page never read two different films. Paid calls (ElevenLabs speech, music,
effects) go through the `ElevenLabs` service only; `mix`, `cues` and every
`--dry-run` make none. Assets are content-addressed: `ContentStore.ensure`
produces an asset only when its stored hash is stale, and every manifest
update is serialized. At most three paid jobs run at once. Failures are
tagged errors (`ApiKeyMissing`, `EncoderMissing`, ...) in `tools/errors.ts`,
and the refusals a page shows in their own words (`TakeMismatch`, ...) in
`core/refusals.ts`; `film check`'s findings, with their levels and addresses,
are in `tools/findings.ts`. Logs are `Effect.log` lines `event key=value`.
`tools/testing.ts` has the in-memory doubles the tool tests use.

`film sfx` is the app's sound library (`SoundLibrary`, `tools/library.ts`).
`make` is its one paid command: it prints each sound's candidates and
credits (40 a second), fails `PaidUnconfirmed` without `--yes`, and
`CreditsOverCap` when `--cap` is under the credits it would spend plus those
its `--tally` TSV already records; every generation is appended to the tally
as it lands. Candidates are FLAC under the git-ignored `files/<name>/`, named
by their hash, and wait in the lock until `keep` or `reject`; `keep --replace`
keeps them in place of the kept variants, and `unkeep` sends kept variants
back to wait (the lock is only ever written by these commands). `push` copies
each private file the store lacks, or holds with other bytes, reads it back by
hash (`StoreCopyFailed` otherwise), and names every file it sent (`--from
<folder>` sends a file this checkout lacks from an older folder store when its
hash matches the lock: a move between stores); `push` and
`pull` name each lock file they find nowhere (`missing`) rather than fail on
it. `try <name> --prompt/--secs/--influence --count n` is `make` for other
settings than the declaration's (paid, capped and tallied the same): its
candidates wait under their own request, and become keepable when the
declaration is changed to say the same (`TrialInvalid` for settings no
declaration could take). A sound that names no `influence` is made at its
use's default (`DEFAULT_INFLUENCE`: 0.7 for a one-shot, 0.3 for a bed) and
as `DEFAULT_CANDIDATES` (6 one-shots, 3 beds), both measured in the sweet-spot
trials (`apps/animations/sounds/PROMPTING.md`).

A `code` sound is a graph of nodes (`core/synth/graph/nodes.ts`), rendered from each of
its seeds whenever it is needed, through `SoundRender` (`tools/sound-render.ts`):
nothing of it is made, kept, stored or paid for. A film's load resolves its
sounds and renders none; what plays them measures them, once each: the mix,
the check and the options (`measuredFilm`). The library load refuses a
graph that cannot render (`core/synth/resolve.ts` `resolveCode`: a stream
named twice, `StreamDuplicate`; a sample of itself, `SampleCycle`; a sound
too long, `CodeTooLong`). A generated sound says `why` it needs ElevenLabs,
since code makes every simpler sound (the owner's rule), and may carry a code
trial, `code: { sound, variants }`, which no film places. The free
commands read them: `render <name> [--seed n] [--trial] [--sheet]` writes a
code sound's seeds, or a trial's, as WAVs under
`<FILMS_OUT>/sounds`, each with its sheet as a PNG under `--sheet`;
`audition <name> --trial` lines a trial's seeds up; `compare <name>` prints a
trial's numbers beside what plays, and how far each film's placement would
hear the hit move; `audit` reads from each generated sound's prompt whether
code can make it; `ab <name> --out <dir>` writes the clips an ask plays (what
plays now, the trial, and both; only what plays now for a sound with no
trial) as MP4s beside their sheets; `check` hears a
trial bed's seams. The loop they serve, and the bar a trial meets before the
owner hears it, are the film skill's
[sound reference](../../.claude/skills/film/reference/sound.md).

A `recorded` sound is a recording under a licence that may be public, kept
under the committed `public/<name>/`: CC0, or CC BY 3.0 or 4.0. Its
`licence` names the recording's `title`, `author`, `authorUrl` and `source`
page (and its `openverse` id when Openverse found it); a CC BY one must name
all four and say whether the file was `changed` (cut, trimmed, levelled).
`sfx import <file> <name> [--from s --to s]` folds the recording to one
channel at 44.1 kHz and takes the cut it is given (`CutEmpty` for seconds
that hold none of it), or, with no cut, the sound's `secs`: a one-shot's
from a fifth of them before its loudest moment, a bed's at the 2-second
offset whose loop seam is smallest, past its first 2 seconds when the
recording can spare them; no `secs`, the whole recording. A one-shot's quiet
ends are trimmed, a bed's ends kept, and a recording that peaks over
`TAKE_LEVEL.ceiling` (-1 dBFS) is scaled down to it. It records the cut in
the variant (`cut`, clipped to the recording), prints the gain and the share
of power under 30 Hz, filtered by nothing, and keeps the sound's variants made
for another request (a generated sound's takes, once it is recorded) as
candidates: its history, never offered again. A CC BY recording a film places owes a credit line
(`soundCredits(library, sound)`, one a source): `creditRoll` gives each
under a "Sound" head, a whole-film render writes each with its pages linked
into `<video>.description.txt` after the chapters (`videoDescription`), and
`film check` fails a film whose `credits.ts` roll does not give a line it
owes (`SoundCreditMissing`).

A recording's code trial is fitted, never written by hand: `sfx fit <name>
[--size small|full] [--from model.json]` runs earshot (`tools/earshot.ts`
`Earshot`) on its kept variant and writes the model it makes as code
(`core/synth/fit` `fitSound`) into `sounds/fits/<name>.json`, the trial
beside the file and hash it came from, the earshot commit, the size and what
the code leaves out (`SoundFit`). The library reads each fit as its
recording's trial (`codeTrialOf`), so `render --trial`, `compare`, `check`
and `ab` hear it as they hear a generated sound's; a fit for a name that is
not a recording, or code kept from one, is refused (`FitUnmatched`), and a
fit file that does not decode, `FitUnreadable`. A fit the owner keeps is the
entry's code: `library.ts` imports the fit file and declares
`{ kind: 'code', ...keptFit(fit), licence }`, the recording's licence kept
(a CC BY one `changed: true`), so `soundCredits` owes the same line for the
code as for the recording, and the fit file stays its one source. `fit`
refuses a generated or code sound, and code kept from a fit (`FitRefused`):
a generated take stays private. earshot is downloaded code,
so it runs as an external tool, trusted with nothing: pinned at one commit
(`Earshot.pin`), its clone and virtualenv outside the repo (`EARSHOT_HOME`,
else `~/.cache/bible-film/earshot`), its packages wheels only and none of
the describer's, run as `python -I -B` with Hugging Face offline under
macOS's sandbox with no network (`tools/sandbox.ts`, `offline`), reading its
clone, its virtualenv, the interpreter and the recording's folder and
writing only a scratch folder. A clone missing, off the pin or changed fails
`EarshotMissing` with the lines that install it; a run that fails,
`EarshotFailed`. It never runs in CI or the gate. The model it wrote is kept
under `<FILMS_OUT>/sounds/fits/<name>.model.json`, and `--from` translates a
model file in place of running earshot (`FitModelInvalid` when it does not
decode). `small` writes a graph a person can read: modes closer than their
bandwidth merged by their sum, the 16 heard loudest kept (their energy within
the loudness meter's 400 ms block), and the energy each third of an octave
sounded kept, sums and cancellations counted: a strike's kept modes scaled
down where the ones left out cancelled them, and what the left-out modes
carried added to their band as noise; noise bands merged by octave, each
coloured by its slope, their breakpoints thinned with their energy kept.
`full` keeps every part that fits; either merges further until the render's
work fits `MAX_CODE_WORK`. A bed is tilted so its loop seam is level, and a
recording with little rumble under 30 Hz is high-passed there, its lowest
band of noise starting at 30 Hz.

`film footage` is the app's camera footage (`FootageLibrary`,
`tools/footage.ts`, its schema in `core/footage.ts`), shared by its talks.
`import <file> --as <name> [--take]` keeps an original whole under the
git-ignored `files/<name>/<sha12><ext>`, by the hash of its bytes, once it is
probed (`FootageMedia`, `tools/footage-media.ts`: container, codec, displayed
size, rotation, rate and whether it varies, where its picture starts, its
sound) and found one the render can conform: HDR fails `FootageHdr`, naming
the iPhone's setting, and a take with no sound `FootageSilent`; a take whose
sound is lossy imports with `footage.lossy`. Importing the same bytes again
answers the name they have; a name holding other bytes fails
`FootageNameTaken` (a second recording is a second name). Both cameras a talk
is shot on import as they record: an iPhone's HEVC MOV and a Sony ZV-E10's
XAVC S (H.264 MP4, landscape, framed to 9:16 by the talk's `frame` knob).
`make [name…]` derives, under `<FILMS_OUT>/footage/<name>/<sha12>/`, the
mezzanine (H.264 at the original's size, CRF 16, a key frame every second)
and the proxy (1280 on its long side, never larger than the original, CRF 26,
a key frame every half second), each constant-rate at 30, its rotation baked
in, stamped from its first frame, and remade only when its recipe
(`FOOTAGE_RECIPES`, recorded in `stamp.json`) changes; a take's voice
(`voice.flac`, one channel at `MIX_RATE`, levelled by one gain and never
trimmed, laid on the picture's clock, so a frame and the voice at its time
are one moment, whatever the camera's rate: `e2e/tools/av-sync.test.ts`); and,
once per take, its transcript (`ElevenLabs.stt`, the one paid call, run only
when a take has none or `--hear-again` asks): its words, each voiced, and its
loudness every 10 ms in whole dB, under `transcripts/<name>.<sha12>[.n].json`,
committed. A second hearing is a second file, which the lock
(`library.lock.json`) then names; a transcript is never rewritten, and its
name is chosen and its file put in place under the library's lock, so two
`make` runs at once never take one name. Every field of the lock a path is
made of is checked, read and written, so no original, copy or transcript
lands outside the library: a footage name (`--as`, and every key) is a
lower-case slug, a transcript one file under `transcripts/`, an original's
`sha256` 64 lower-case hex digits and its `ext` none or a dot and lower-case
letters and digits. `--as` refuses a name that is not one
(`FootageNameInvalid`), an import a file whose extension is not one
(`FootageExtInvalid`), and a lock that breaks any of them is not read
(`FileInvalid`, so `make`, `pull` and `push` stop before they write) and
never written. A name is found only among the lock's own: `constructor`,
which every object answers to, is unknown until it is imported. The copies
are made frame by frame, not by a mediabunny `Conversion`, so each copy's
content hint reaches x264 (`FOOTAGE_HINTS`), which sets its key-frame
interval itself (`keyint`: node-av clears the key-frame flag mediabunny
asks for). `push` and `pull` keep the originals in the private store under
`footage/<name>/<sha12><ext>`, each read back by its hash; `list` prints the
lock.

A talk is a film cut from a take, not drawn: its folder holds `talk.ts`
(`export const talk = { … } satisfies Talk`, `core/talk.ts`) and no
`scenes/index.ts`. Its `takes` name
takes in the footage library by a key of the talk's own; each of its
`sections` plays words `from`–`to` of one take, but those its `cut` strikes
(`[i, j]`, both ends struck), and is one scene of the film. Its
`format` is `question` (45–65 s, the speaker on screen 40–55% of it) or
`episode` (135–170 s, 20–30%), as `TALK_FORMATS` holds them. `talkCut`, pure
and shared by the page and the tools, derives what the edit plays: each
section's kept words; its pieces of the take's voice, a new one after each
strike and each pause longer than the talk's `gaps` (0.25 s unless it says),
every seam on a frame of `TALK_FPS` (the mezzanine's 30) at the quietest
frame boundary in the silence around it and never inside a kept word's
voice (where that silence holds no boundary, the kept word plays whole and
its piece ends on the frame past it, under a frame of the struck word
faded out, and never past the take's end); the retimed `VoiceTiming` and
`Timed` of each section; and the film's `Timings`. A section that strikes
every word fails `TalkSectionSilent`, a word or a take the transcripts lack
`TalkWordMissing` or `TalkTakeMissing`. `FilmRepo.load` reads a talk's takes'
transcripts through the footage lock, plays the take's derived `voice.flac`,
and lays its sections out as a film's scenes, so `film cues` lists them.
A talk has no narrator (`LoadedFilm.voice` is none): what needs one (`narrate`,
`takes import`, `read voice`, the studio) refuses it with `TalkUnvoiced`.
`film mix` plays each section's voice as its pieces of the take
(`VoicePieces`; a `Take` played `from` a second of its sound for `dur`
seconds, each end faded over `fade`), each faded `CUT_FADE` (5 ms) at its
seams so a cut never clicks, and decodes each voice file once; a drawn
film's takes play whole and key its mix as before.

`film talk words <talk>` prints a talk as its edit plays it (`tools/talk-cli.ts`):
how long it plays against its format's length (under, within or over), then
each section's head (its take, its word range, its length and its pieces),
then its words with their indices, `[33]law`, a struck one `[34]~um~`, so
words are named by what they say; `--take <key>` prints that take's whole
transcript, every word the edit could play. A film that is not a talk fails
`NotATalk`.

A talk's takes come from the footage library by one derivation,
`talkTakes` (`core/talk.ts`): the lock names each take's source
(`<name>/<sha12>`) and its current transcript, and the transcript gives its
words and loudness; a take the lock lacks, a clip, a take not yet heard, a
transcript missing or heard from another source is refused, naming the
`film footage` step that mends it. Each `TalkTake` is the source, its
words, its envelope and its picture's displayed size. The tools read the
lock and transcripts from disk (`FilmRepo.load`); the page reads the same
files over the footage route, and both cut with `talkCut`, so the picture
and the mix play the same pieces (`tools/talk.test.ts` holds every frame of
the page to the moment of the take the mix plays under it). The voice the
mix plays is the take's `voice.flac` under its copies, keyed by its source
and `VOICE_RECIPE`, not by its path.

A talk's page is `canvas/talk.ts`: a `Film` of 1080×1920 at `TALK_FPS`,
built from the talk, its takes and its cut, each section a scene. Each
frame reads the frame of the take its cut names (`footageAt`: the piece of
its section playing, as many frames on from the piece's in-point as the
frame is from the piece's start; a time between frames reads the frame at
or before it, as the mix's voice does), and draws what the host decoded,
cropped 9:16 about the section's `frame` knob (a point in the take's
pixels; the picture's middle unless set) and `zoom` times in from the
largest 9:16 crop the picture holds, kept inside the picture; the lab drags
both. The crop is taken in the decoded picture's own pixels (the proxy's on
the lab, the mezzanine's in a render), so every page frames the same
picture; a frame the host did not decode fails loud. Over it, the hook
(`canvas/vertical.ts`, the same hook a short sets) and the burned captions:
each section's kept words as they are heard, spelt as the talk's `fixes`
spell them, a word inside one of its `quotes` gold (`talkPhrases`), all set
inside every platform's zone (`TALK_LAYOUT`): the hook centred where a
short's is, the captions centred in the room beside TikTok's buttons. The
app's films index lists its talks with `talkFilms` (`player/talks.ts`:
`() => import('./<talk>/talk.ts')`, read with the library's lock and
transcripts), beside its drawn films in `narratedFilms`, so the player, the
render and the checks open a talk as they open a film. A frame of a talk the
player cannot decode stops the film and says why in its place.

`film check <talk>` checks a talk as a vertical film as well as a film: the
static leg holds its length to its format's and reads its first word and
its loop's silence; the full check probes its page every half second and at
each phrase's first frame for text past every platform's zone
(`platforms`), and its open for motion (its footage moving is motion), over
only the seconds `--scene` or `--act` name when given (the open only where
it lies in them). Each finding is the talk's, named `talk "<id>"`: a line of
text or a hook at the film's scene and second, its length or loop of the
whole film; a talk is no short. `--draw` draws the talk as its page builds it
(`createTalk` over its edit, takes and cut, its footage left undrawn).

The words a talk is made in:

- **talk**: a film cut from the speaker's own take, not drawn.
- **take**: one recording of the speaker, kept whole in the footage library; a talk is cut on its transcript.
- **A-roll**: the speaker on camera, the take the talk's voice comes from.
- **B-roll**: footage cut in over the speaker (a clip, in the library's words), the voice running on.
- **paper edit**: the edit made on the words, not the picture: `talk.ts`'s sections and strikes, read with `film talk words`.
- **seam**: where one piece of a take meets the next, on a frame, in a silence.
- **jump cut**: a seam that shows: the same framing on both sides, the speaker jumping.
- **punch-in**: the framing moved closer at a seam, so a jump cut reads as a new shot.
- **cutaway**: a shot of something else laid over a seam, which hides it.
- **mezzanine**: the high-quality constant-rate copy a render reads (`make`'s H.264 at the original's size).
- **proxy**: the small copy the lab plays while editing.
- **conform**: bringing every original to one rate, way up and clock, as the mezzanine does.
- **media pool**: every original a film may draw on: the footage library.

Preflights: `film doctor` checks headless Chrome (a page opened and closed
in Bun.WebView's Chrome: `BUN_CHROME_PATH`, else the Chrome Bun finds, else
Playwright's cached Chromium; `BrowserMissing` names `BUN_CHROME_PATH`; on
macOS the renderer's Chrome runs its GPU, through the GPU launcher, see
"Encoders"), the `elevenlabs` CLI and its
login (`auth status`, free), the H.264 encoder a render would use (a page
chooses it as a render does; the line says `hardware` or `software`, the
default pages and the encoder budget), reports each, and fails if any is
missing. Nothing needs an ffmpeg on the machine: every media file is read and
written in-process (below), and `tools/no-ffmpeg.test.ts` fails on a source
that names `ffmpeg` or `ffprobe` as a command. `narrate`, `takes import` and `score` run the ElevenLabs check before their first paid call,
and the `ElevenLabs` service uses `ELEVENLABS_API_KEY` when the environment
or the Keychain holds one (effects need it) and the CLI's OAuth login
otherwise, one OAuth call at a time (concurrent refreshes race and fail);
and a video `render` asks a page which H.264 encoder it can encode the film's
size with (`EncoderMissing` when none) before it draws a frame.

Media files go through `Media` (`tools/media.ts`): mediabunny reads and writes
the containers in-process, and MP3 decodes through mpg123 (WASM), gapless, so
a take measures what it plays (`duration`). `join` writes a film: its H.264
segments' packets copied in order (never re-encoded; segments encoded unlike
the first fail), and its track encoded to AAC beside them through
`@mediabunny/aac-encoder` (FFmpeg's encoder built to WASM), one frame of
priming early so the MP4's edit list starts it on the first frame, into a
partial beside the film renamed over it once whole. Every byte
moves through the FileSystem service but the joined film's, which mediabunny's
`FilePathTarget` writes by position on Bun's file system (Effect's file handle
appends under Bun: its `fs.write` passes no offset, and Bun then ignores the
position). Failures are `MediaFailed`. A person's recordings arrive in
whatever format a recorder saves (WAV, FLAC, AIFF, M4A, MP3, at any rate) and
load in-process: `load` decodes any of them to one channel of 32-bit float at
the rate asked for. mediabunny opens the containers; FLAC and AAC decode through FFmpeg's own
decoders in-process (`@mediabunny/server`, NodeAV: Bun has no WebCodecs
audio decoder), an AAC's priming dropped as its edit list says; AIFF, which
mediabunny cannot read, is plain PCM read by `tools/aiff.ts`; the mixdown and
the rate change are libswresample's at its defaults (`tools/resample.ts`,
through NodeAV). `encodeFlac` writes a take as a
24-bit FLAC master through libFLAC (`@mediabunny/flac-encoder`, WASM, in a
worker; float in, one quantisation 144 dB down, no dither needed). A person's
take is the film's final voice, so it is never lossy after the recorder, and
the mix reads it as it reads a staging MP3. Staging takes stay the MP3s
ElevenLabs sends. mediabunny picks the first coder registered that can, so
the AAC and FLAC encoders and x264 (`tools/x264.ts`) register before
`@mediabunny/server`'s FFmpeg ones, which it registers with no hardware
context. Video is converted by mediabunny too: a software render's share
copy (x264, below) and the review's phone copy of a video over 40 MiB or
8 Mbps, drawn 2D renders too (720p at most, x264 at CRF 23, preset medium,
averaging 8 Mbps at most, a key frame every second, on two threads so the
review answers while it encodes: "Phone copies", below) re-encode the
film with its track copied, and a review's still is a
frame mediabunny decodes, scaled by libswscale and written by FFmpeg's MJPEG
encoder (`tools/jpeg.ts`, through NodeAV). A card (`card`) is a picture held over a
sound, the clip an ask plays (`sfx ab`): the picture a frame a second, each
a key frame, through x264 at the phone copy's settings, the last frame held
for what the sound has left, and the sound as AAC. `writePng` writes a
picture as a PNG (`tools/png.ts`), and `decodePng` reads one back (any
8-bit PNG with no palette, not interlaced: a concept a match reads).

`mix` plays `mixPlan` out through `renderMix` (the voice bus, a staging take
lifted to the speech level `takes import` sets and a person's take as
imported; the score option the film plays, `under` dB against the voice
wherever anyone speaks and `alone` dB where no one has for 3 s or more, each
levelled by BS.1770 loudness against the voice bus, ramped, and faded in and
out (`core/score.ts`); the library's beds looped over their spans, crossfaded
where they wrap, faded at each end and ducked unless the library says not,
the effects on their cues, summed and limited) and writes the film's
one track, `narration/full.wav` (16-bit), whole (a partial of its own,
renamed only once written): a failed or interrupted mix leaves the previous
track. The track's rename and its stamp are one step under `full.json`'s
store lock (`ContentStore.transact`), so two mixes finishing together never
leave one's track under the other's stamp. `full.json` stamps the key of the plan it played
(`mixKey`: every sound it plays by its file name, which carries its hash, or
a code sound by its renderer's version, its graph's hash and its seed, with
where, how loud and at what pitch, the score option and its
levels, and the levels it masters, fades and ducks by). A bed or
effect names a library sound (`core/sfx.ts`) and a level in dB relative to
the voice; its gain comes from the level its variant measured, a take's
when it was made and a code seed's when what plays it renders it
(one-shots by momentary max, beds by integrated loudness). An effect's
placements rotate through the sound's variants (never the same one back to
back while it has another), each nudged late, louder or quieter and up or
down in pitch by the sound's jitter, seeded by the film, the effect and the
placement, so a repeated sound never repeats exactly and a film always mixes
the same way. `sound.ts` may declare `seed: '<original-film>'` to preserve that
effect variant and jitter identity in another visual version; it defaults to
the current film's name. With the same resolved cues and assets, the inherited
seed gives the same effect placements and mix key. A code variant is its
data played with a seed. A
placement meets its cue with the variant's start, with its onset for an
effect that says `sync: 'onset'` (a sustained sound), or with its hit for
one that says `sync: 'hit'` (an impact): the lock's `Variant` carries
`onset` and `hit` (`describeSound` in `core/synth/analyse.ts`, recorded on
keep and by `SoundLibrary.describe`, `sfx describe`), a code one is
measured from its seed, and the mix starts each variant that much early
(`mix.unsynced` warns where a take has none recorded). `sfx check` warns
`TimingUnrecorded`; the film's check warns `LeadIn` on an effect placed from
its first sample whose kept take's onset is past `LEAD_IN`, 0.05 s (the
placement's finding, since only it can say `sync`), and refuses a placed code
sound with a seed that measures silent (`SeedSilent`, by seed:
nothing over BS.1770's −70 LUFS gate). It logs
each bus's mean and peak dBFS (`mix.levels`), and `--stems` writes each bus
the film's length. A file at another rate fails as `SampleRateMismatch`: the
mix resamples only to repitch an effect's jitter. The
player streams the WAV (the preview server answers range requests);
`masterFinding` holds it to the film's length and to the plan the film
mixes to now (`AudioMissing`; `AudioStale`, `length` or `mixed for another
plan`, which an unstamped track is too): the renderer checks it before the
first frame and `check` in its static leg.

`narrate` makes each new take, `<id>.<audio hash>.mp3`, in a temporary folder
of its own, and places it in `narration/` only under the timings' store lock,
in the same step as the `timings.json` rewrite that makes it current. No crash
leaves a take and its timings disagreeing, and another `narrate`'s sweep
never puts away a take still being made. The sweep removes a partial write
only when its writer, named in `<file>.<pid>-<n>.<host tag>.partial`, is a
pid on this host that no longer runs. It keeps every other partial: another
host's, and one whose name carries no host
or no writer, since a leftover partial blocks nothing and is
git-ignored while removing a live one loses its write. A mix landing its
track meanwhile, here or on another host, keeps its partial. A take's words come from the speech model's alignment and its
length from the encoded file; a word the alignment puts past the end is held
inside the take (`core/narration.ts` `heldInside`, with a `narrate.overrun`
warning past `TAKE_TOLERANCE`), so the timings always fit their audio. The
aligner puts the pause before a word into that word's start, so each word
also carries where it is heard (`voiced`, a `TakeWord`): the first and last
10 ms window inside its aligned span over a −40 dBFS gate, read from the take
itself when it is timed (`core/voiced.ts` `voicedWords`; `narrate`,
`takes import` and the studio alike; a span no window passes holds no
voice, since the aligner put it past the span, so it is heard from the span's
end, never sooner). A mark and the long film's captions read the aligned start;
what must meet the ear (a short's captions, its hook and its loop) reads the
voice (`heard`). Heard seconds are branded (`Heard`, made only by
`voicedAt`), so aligned seconds passed where the ear is met are a type
error. It removes the takes (`.mp3` or a person's `.flac`) the timings
no longer name, and partial writes, at the start and end of every run. A
replaced person's take loses only its copy in `narration/`: its master and
its original stay in `narration/attempts/`.

Each take in `timings.json` carries its `source`: `elevenlabs` (staged by
`narrate`; written as no `source` key, so a file from before sources reads
as this and a staged take never churns the committed file) or `recorded` (a
person's, by `takes import` or the lab's studio). `core/narration.ts`
`takeState` says where a beat's take stands: `Recorded`, `Staging`, or
`Stale` (missing, text changed, voice changed) with whether a person read it.
`narrate` never stages over a current recorded take and refuses a stale one
without `--replace-recorded`; a recorded take stays current across a change
of staging voice, since no staging voice made it; `check` fails a stale one
(`TakeStale`, `recorded: true`). A recorded take whose beat id the script no
longer has (a renamed or removed beat) stays in `timings.json` and on disk,
so no sweep deletes a person's reading; `narrate` warns
`narrate.orphaned id=… file=…` and `--dry-run` lists it as `orphaned`, for
the author to rename the entry or remove the file by hand.

`takes import` (`Takes`, `tools/takes.ts`) makes a person's recording a take:
`Media.load` at the mix rate, `prepareTake` (`core/recording.ts`: one
channel, trimmed, levelled, held under the ceiling; `RecordingInvalid` when
nothing in it reaches −60 dBFS), `Media.encodeFlac` (the take,
`<beat>.<hash>.flac`), then the same speech-to-text as `narrate`, whose words
time the script's words through an edit-distance line-up (`core/align.ts`
`timeScript`: a misheard word keeps its place, an unheard one shares the gap
its neighbours leave; a reply that heard words but timed none fails
`SttUntimed` rather than timing the take by nothing). The recording lands as an attempt in
`narration/attempts/<beat>/`: the recording itself, byte for byte
(`<beat>.<hash>.orig.<ext>`; a whole reading once, under `whole/`, each beat's
attempt naming the stretch it was cut from), its FLAC, and its
`attempts.json` ledger (what was heard, the word error, when). Keeping one
checks its word error again as the check reads now, then copies the FLAC
beside the other takes and rewrites `timings.json` to name it; the take it
replaced is put away into `narration/attempts/<beat>/` (`putAwayTake`: a
recorded take's attempt is already there, and any other take, a staging one
or a recorded one whose attempt this machine lacks, is copied there first;
an attempt of the same name with other bytes stays as it is, and the take
is kept beside it as `<file>.<sha12><ext>`, logged `takes.put-away.kept-aside`),
so no take's bytes are ever lost and git drops it from `narration/` as
before. Placing a take and naming it hold the timings' store lock (a keep's,
and a `narrate` staging take's), and a
take is put away only while the timings, read under that lock, do not name
it (`putAwayUnnamed`; narrate's sweep runs under it too), so a sweep in
another process never puts away a take a lab's Undo is naming. A
keep made in the lab is undoable: its change carries the takes the timings
name (`Takes.named`), so Undo brings the replaced take back into
`narration/` (a kept-aside copy first) before the timings name it again, and refuses when it is in
neither place. The check (`core/spoken.ts`
`lineError`, for narrate and takes alike) reads both sides as said
(`spokenWords`): a run of numbers is one token of digits however written or
spoken (`144,000`, "one hundred and forty-four thousand", a year in pairs),
"chapter" and "verses" before a number and "to" or "through" between two are
dropped (so "Zechariah 3:1-4" is read aloud either way), `Mrs.`, `Dr.`,
`St.` are the words they stand for, and a name spelt as `script.ts`'s
optional `heardAs` export lists it (`{ Ellet: ['Elliot'] }`, `HeardAs`,
loaded onto the film as `heardAs`) is the script's. `--accept-mismatch id,id`
keeps those beats' mismatched takes (`accept.ts`); bare, it means the
`--only` beats, and bare without `--only` fails `AcceptMismatchUnnamed`. A lossy recording (M4A,
MP3) still imports, with a `takes.lossy` warning: the master is lossless from
there on, but record WAV or FLAC for the final voice. `--whole` transcribes one recording of the script and
places every beat by the same line-up (`placeBeats`), with affine gap costs
(`GAP_OPEN`) so a beat's words pair with one reading of it: a beat the
reading skipped is the one named (under half its words heard fails
`BeatUnplaced`), and a line flubbed and read again belongs to the reading
that finished it, the false start to neither beat. Each beat is cut on its
own (`cutsAround`), at the quietest 10 ms of the silence before and after it,
and faded over 5 ms at both cuts (`cutPcm`), so a false start is cut out of
both beats beside it. Every beat is placed and cut before `--only` picks.

The padding and loudness a recorded take gets are measured, not chosen: over
the 30 committed staging takes (both films, 2026-09-28; mpg123 decode, 10 ms
RMS windows), the median speech level is −17.10 dBFS (−17.90 to −15.67;
`speechLevel`: the mean power of the 10 ms windows over −70 dBFS and within
10 dB of their mean, BS.1770's two-stage gate without K-weighting, so pauses
are left out), the median peak −1.28 dBFS (−0.4 to −3.0), and the median
silence 0.07 s before the first window within 40 dB of the take's loudest
(the loudest sits near −9.5 dBFS, so that is a −50 dBFS gate) and 0.00 s
after the last. So a take is made louder or quieter by one clean gain, to
`TAKE_LEVEL.speech` −17.1 dBFS or less when that would take its peak past
the −1 dBFS ceiling: min(target − speech level, ceiling − peak), with no
limiter, so the voice keeps its dynamics and a longer pause never changes
its level. `TAKE_PAD` is 0.07 s lead and no tail; a recording that starts on
its first word gets the lead in silence. Speech is sound over the gate that
lasts 0.1 s (`TAKE_MIN_SPEECH`) counting gaps under 0.25 s (`TAKE_HOLD`), so
a click or tap after the line is trimmed with its silence, and the take fades
over 5 ms (`TAKE_FADE`) at both ends so neither trim clicks.

`film script <film>` prints the reading sheet (`core/sheet.ts`), and
`--sheet` writes it to `out/<film>/script-sheet.md` and a page to print,
`script-sheet.html`: each beat with a line (from `script.ts` when the film
has one, with its `cite` sources; from its scenes when not), the file to save
its take as, marks stripped, each turn's reader named, each “quotation” set
apart with the `quotes.jsonl` record whose words hold it, and `/` at each
sentence end for a breath (not after an abbreviation such as `Mrs.` or `St.`,
the same list the take check reads out).

`render` opens the app's server, headless Chrome (`Browser`: tabs of the
process's one Chrome, `tools/chrome.ts`) and a pool of player pages (`Pages`, `tools/pages.ts`: the
one pool `check`, `look` and `render` open, bounded, a crashed page dropped
for a fresh one) in one scope; a failure in any page, or Ctrl-C, closes every
page, the browser and the server. The export page's handle is declared once
(`core/export-handle.ts`: each call's arguments and the schema its answer
crosses in): the player implements it (`player/render.ts`), the tools reach it
through one typed call (`FramePage.call`, `tools/browser.ts`), and the test
fake answers the same calls (`fakeRenderHost`, `tools/testing.ts`), so a new
call is a type error in each until it is written there. Every frame the
page draws is rastered before its clock stops (a one-pixel read), so the
draw is timed apart from the encoder: each `render.progress` line and
`render.done` say how many ms a frame went to drawing, encoding and carrying
the chunk out of the page (`draw_ms=… encode_ms=… transfer_ms=…`), and a
perf script times the draw alone with `drawTimes(frames)`. A video's
frames split into chunks (`planChunks`: about four per page, at least a second
and at most eight each, then a tail of `workers` chunks at half that size, a
quarter, and so on down to a second, so the last chunk each page pulls is its
smallest and the pages finish together) on a queue that idle pages pull from; each page draws
its chunk and encodes it with the browser's H.264 encoder through mediabunny
(`player/encode.ts`, a key frame every two seconds) into a segment of its own
(and, unless `--no-share`, a share copy from a second encoder in the same
pass), and a chunk whose page crashes is retried once on a new page. Which
encoder is data, chosen once (below). `Media.join` joins the segments in order with the track cut from
`full.wav` under the range and encoded to AAC, and the captions (`main.vtt`) are written
beside the MP4 from `captionCues`, the same line timing the burned-in captions
use. Segments are written to a temp folder of the render's own (`makeTempDirectory`), removed once joined;
a video leaves no segments under `out/<film>/`, whatever its variant. A
contact sheet is composed in one page (`player/contact.ts`). An
uncaught error in the page is a `PageError`, never a log line. A missing
browser is `BrowserMissing`, whose message is the install command.

## Project folder

A film's renders live in its project folder, `out/<film>` (git-ignored, never
under `~/film-media`), one folder per address and one name per variant:

```
out/<film>/
  catalogue.json                  what every file here is (RenderCatalogue)
  film/main.mp4                   the whole film: .share.mp4, .vtt, .chapters.txt, .description.txt beside it
  film/main/stills/t0003.00.png   its stills; contact.jpg and lookbook.jpg in the same folder
  acts/<act>/main.mp4
  scenes/<id>[+<id>]/<variant>.mp4
  shorts/<id>/main.mp4
```

`--variant <name>` (default `main`) renders beside `main` at the same address:
a look or score option, a lab note's `lab-<id>`. `--out file` writes a video
outside the folder and is not catalogued. A video's `--from/--to` on the film
or a short needs `--out` (`FlagsConflict` otherwise, before a browser opens):
a stretch is not the film's render, so it never replaces the address's clip
or its record. A contact sheet over a range records the seconds it drew as
its span. Every file a render leaves (the clip, its share copy, captions,
chapters, stills, a sheet) is written beside itself and renamed into place
once whole, so a failed or interrupted render leaves the last good file.

**The catalogue** (`core/catalogue.ts`, kept by `tools/catalogue.ts`) records
each render's address, variant, kind (video, stills, contact, look-book),
settings (scale, captions), files and **stamp**: the git commit (none outside
a checkout) and a content key. A render's slot is its address, variant and
kind; a new render of a slot replaces the record before it. **Stamps**
(`tools/stamp.ts`) keys each scene by what its frames are drawn from: its own
module and all it imports (relative and workspace imports; not packages under
`node_modules`), the film's frame (`film.ts`, the scene registry and all they
import, with the registry's imports of the other scenes cut, and
`@bible/film/player`), its beat as laid out and its take's timing, and, for a
scene entering on a transition, the previous scene's own modules. An
address's key hashes its scenes' keys. The key leaves out what a frame
fetches at run time, and the audio: a video's record says the sound it
carries instead (`sound`: the key of the plan its master was mixed from,
`mixKey`, and the pieces of the master it cut).

**`film project`** reviews a film scene by scene. `film project <film>
[--variant v] [--json]` prints the film's comments, then each act with its
comments and its scenes in film order: each scene's render `current`
(drawn from the sources as they are, carrying the mix the film makes now),
`stale` (its sources changed), `stale:sound` (only the film's mix changed: a
score pick, a level, a kept take, then `mix`) or `missing`; its approval
`approved`, `stale` (given on an earlier render) or `none`; and its comments,
each marked when it was made on an earlier render. `film project render
<film> [--scene id,id] [--scale s] [--variant v] [--force]` renders each scene
on its own into `scenes/<id>/`, every one through one probe and one pool of
pages (`Renderer.session`: 1 + workers page loads a run, not that a scene;
`pages.open` logs each), skips one whose render is current at the same
settings, and re-muxes one stale by its sound alone: its sound is cut again
from the master at the pieces it recorded (the renderer's master check
first), its pictures and its share copy's are copied, and no page opens
(`render.remux frames_drawn=0`, `remuxer`: media and the disk only). The run decides
every scene's need from the catalogue first; when it re-muxes any, the master is
checked and decoded once for all of them, and each scene cuts and encodes only its own piece.
Chrome starts with the first page a scene opens (`Browser.layer`), so a
run where every scene is current or re-muxed opens no browser. `film project
approve <film> --scene id,id | --act name | --all` approves the scenes'
renders, an act's current scenes, or every current scene. An approval is of
a render as it is now, so only a current one is approved: `--act` and
`--all` leave a stale or missing scene, and `--scene` naming one refuses it
and approves nothing (`VerbRefused`, 409 on the review's route, naming why it
is stale and the render that makes it current; `SceneNotRendered`, 404, for
one never rendered). Both name that render as a command to run,
`film project render <film> --scene id --variant v` (`renderCommand`). The rule is `approvalRefused` (`core/choice.ts`), which
the choices' say keeps too; `film project withdraw
<film> --scene id,id | --act name | --all` withdraws those scenes' approvals,
whatever version they were given on. `film project comment
<film> "text" [--scene id | --act name]` records a comment on a scene's render
as it is now (on the scene itself when it has no render yet), on an act, or
(with neither) on the whole film. With `--json`
each prints the project (`ProjectRead`) as one line, or its refusal as
itself (`SceneNotRendered`, `VerbRefused`, `UnknownScene`, `UnknownAct`, `CatalogueInvalid`:
a `FreshRefusal`), which is how the review runs it. Approvals and comments are keyed by address,
variant and the render's version (`renderVersion`: the stamp's key and the
mix it carries): a re-render or a re-mux leaves an approval in place, stale,
and a render that returns to the approved sources and sound is approved
again. The catalogue is a `ContentStore` manifest: each write reads the file,
changes it and writes it back whole, one writer at a time across processes
(the review, a `film project` child, a terminal's `project render`), so every
approval, comment and render record lands.

## Encoders

Segments are joined without re-encoding, so every chunk of a render must come
from one encoder. The platform names the candidates (`encoderCandidates`,
`core/encoder.ts`): the Mac asks for the hardware encoder and nothing else, a
box with no hardware path (Linux) for the software one, and `--encoder
hardware|software` for exactly the one named. The page tries them
(`encoderChoice`, `player/encode.ts`, `canEncodeVideo` with the master's
settings, and the share copy's only when it makes one in the page) and answers
`Hardware | Software | Missing{reason}` (`EncoderChoice`). The renderer opens
one page for that answer, logs `render.encoder kind=… workers=… encoders=…
cores=…`, and hands the same encoder to every chunk; `Missing` is
`EncoderMissing` before a frame is drawn. A Mac whose GPU encoder fails
therefore stops loudly instead of rendering a different look in software.
`film doctor` runs the same choice, and still prints its other lines when the
player server will not start (the encoder line then says so).

The Mac's hardware encoder lives in Chrome's GPU process, which Bun 1.4.3
turns off: it spawns every Chrome with `--disable-gpu`, hard-coded, which no
later flag undoes (the GPU process then runs with `--use-gl=disabled`, which
holds no hardware encoder). So on macOS a
Chrome whose flags ask for the GPU (`GPU_FLAG`, `--enable-gpu`) is spawned
through the GPU launcher (`tools/chrome-gpu.ts`, `gpuLauncher`): a shell script
written into the process's Chrome profile, which Bun spawns as its Chrome; it
drops `--disable-gpu`, keeps every other argument in order, and execs the real
Chrome in its own process, so Bun's DevTools pipe and its kill reach Chrome.
The real Chrome is `BUN_CHROME_PATH`, else the one Bun 1.4.3 would find,
searched here as Bun searches (`bunSearch`: the browsers it names on `$PATH`,
then its app bundles in `/Applications` and `~/Applications`, then
Playwright's headless shell), else Playwright's cached Chromium. Every later
view names the same launcher and profile, so a Chrome Bun spawns again after
the first one died runs its GPU too, in the same profile. The renderer asks
for it (`launchArgs`), so `render`, `doctor` and the lab's `look` and
look-book draw in one such Chrome; the browser tests do not, and no other
platform does. Both platforms ask for SwiftShader by name
(`--enable-unsafe-swiftshader`); the 2D canvas stays software
(`--disable-accelerated-2d-canvas`) and on macOS WebGL stays on SwiftShader
(`--use-angle=swiftshader`), so the GPU changes no pixel: RBF's `cold` and
`title` stills are byte-identical with and without it.
`e2e/tools/renderer-chrome.dom.test.ts` reads the renderer's Chrome from `ps`
on macOS: no `--disable-gpu`, exec'd by the launcher, and spawned again the
same way.

|                  | Hardware (macOS)                                                 | Software (Linux, any box without a GPU encoder)                         |
| ---------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Chromium flags   | `--enable-gpu --use-angle=swiftshader`, through the GPU launcher | neither: Bun's `--disable-gpu` stays (`launchArgs`, `tools/browser.ts`) |
| master           | quantizer 16 (~37 Mbps)                                          | 37 Mbps variable, 2-frame pre-roll (13.4 Mbps, 765 MB for 7.6 min)      |
| share            | quantizer 26, in the page (~160 MB)                              | x264 CRF 22 from the joined master (2.2 Mbps, 126 MB)                   |
| encoders at once | 14 (past it the encoder hangs)                                   | one per core                                                            |
| default pages    | 6                                                                | 8, or half the cores below 16                                           |

`SETTINGS` (`player/encode.ts`) holds both columns; the hardware one
(quantizer 16/26, prefer-hardware, a key frame every 2 s, latency mode
quality) is the look the films were made in.

### Software master: the pre-roll

Chromium's software H.264 (OpenH264) refuses quantizer rate control
("Unsupported bitrate mode"), so it encodes to a bitrate. Its first I-frame of
a session is coded at a coarse fixed quantizer, whatever the target: 21 KB
where the key frames two seconds on take 144–161 KB, keeping 0.22 of the
paper's grain against 0.62–0.66 (mean |x − blur(x)| of the frame over the
lossless still's). Every chunk is its own session, so every chunk opened on a
soft frame, one flash of flatness every few seconds. Pre-roll 8 and a 60 Mbps
target gave byte-identical I-frames, so neither the rate nor more warm-up
changes it; only being the session's first does.

So the software master pre-rolls (`SETTINGS.Software.preroll`, 2 frames):
each chunk's session first encodes the chunk's first frame twice at negative
timestamps, into a `NullTarget` output, then the chunk proper with a forced
key frame at `from`. `onEncodedPacket` drops the packets before `from` and
copies the rest, with the decoder config, into an `EncodedVideoPacketSource`
on the segment's real output. A chunk's first frame then comes out a settled
I-frame (142–162 KB), as good as the stream's own 2 s key frames. Over all 52
chunks of righteousness-by-faith, frame 0 keeps on average what the chunk's
own key frame two seconds on keeps (mean difference −0.01; 48 of 52 within
0.05 or above it; the rest are a fade from black, where the still has almost
no grain to keep, and cuts inside those two seconds). Where the paper sits
around 0.62 at every key frame (the tablets, the dark rooms), frame 0 does
too: the encoder's I-frames keep no more there whatever the rate, so no
chunk start can pass 0.75 in those scenes, and 34 of 52 do. At four chunk
starts the grain kept went 0.27→0.66, 0.30→0.62, 0.48→0.80 and 0.42→0.81.
Frames after the first are P-frames on a better reference, and measured the
same or better. The hardware path is untouched (preroll 0, the same
`CanvasSource` as before).

### Software share: x264 after the join

The share is x264's (`Media.shareCopy`, `SHARE_CRF`), since the in-page
software encoder kept the grain only at 24 Mbps (1.16 GB for 7 minutes): a
mediabunny conversion of the joined master, its video encoded again by x264
in-process (`tools/x264.ts`, libx264 through NodeAV, registered as
mediabunny's `avc` encoder): CRF 22, preset slow, tune grain, level 4.1
(preset slow's reference frames would raise it to 5.0), AAC copied, written
into a partial beside `<out>` and renamed over it once whole. The review's
derived files (a frame, a phone copy, a mix) are written whole too. It logs
`render.share by=x264 secs=…`.

x264 (core 165) spends 3.6 MB on 8 s of paper at 78–86 s and 4.0 MB at
158–166 s, the grain kept. The in-page software share at 6, 10 and 14 Mbps
(6.2, 10.1 and 12.7 MB for those 8 s) smoothed the paper flat.

Not `@mediabunny/server`'s libx264: it (through NodeAV) runs a fixed
`qp` with qmin = qmax on the default preset, with no CRF, preset or tune to
pass (`@mediabunny/server/src/video-encoder.ts`), and at equal size it kept far
less grain: q23 was 444 MB and kept 0.33–0.67, against x264 CRF 23 tune
grain's 487 MB at 0.75–0.83; over those 8 s of paper, 4 Mbps (4.3 MB) and
q22 (2.7 MB) both smoothed it flat.

The share at righteousness-by-faith's 7 review frames (grain kept / SSIM Y),
beside the master it came from, measured with the same settings on x264
core 164:

| t (s) | master      | x264 share  |
| ----- | ----------- | ----------- |
| 7.5   | 0.86 / 0.95 | 0.81 / 0.90 |
| 81.5  | 0.92 / 0.92 | 0.85 / 0.90 |
| 140.4 | 0.82 / 0.93 | 0.78 / 0.86 |
| 161.5 | 0.94 / 0.91 | 0.89 / 0.88 |
| 236.8 | 0.86 / 0.96 | 0.81 / 0.91 |
| 241.5 | 0.83 / 0.95 | 0.81 / 0.91 |
| 321.5 | 0.88 / 0.93 | 0.84 / 0.90 |

One pass after the join, not per-segment passes beside the render, measured
on the Workbox (16 cores): the one-pass render took 447.5 s (pages and join
158.9 s, x264 288.6 s). x264 over the 52 segments, 4 at a time, while a
`--no-share` render ran took 324.0 s, and the render beside it slowed from
158.9 s to 385.7 s, so about 388 s in all: 60 s saved, for share segments
to join (x264's parameter sets must then match across segments) and a render
that no longer measures alone. Decided by subtract-before-you-add: the one
pass stays.

The software default of 8 pages is the knee of renders of two scenes of
`righteousness-by-faith` without the share copy, timed at each page count
(1325 frames, 16 cores, the median of 3 runs; the share is x264's after the
join, so the pages carry one encoder each):

| pages | 4    | 6    | 8    | 10    |
| ----- | ---- | ---- | ---- | ----- |
| fps   | 62.4 | 84.2 | 97.9 | 104.3 |

With the fibre on the backdrop plane (the paper grain slides with the camera
instead of a fresh screen grain each frame) the film encodes far smaller than
the one-pass render timed above (6 pages, a fresh screen grain): righteousness-by-faith (457 s, 13712 frames) rendered in 293.5 s at
8 pages (pages and join about 142 s, x264 151.8 s), the master 765 MB at
13.4 Mbps and the share 126 MB at 2.2 Mbps, keeping 0.57–0.85 (master) and
0.56–0.80 (share) of the lossless stills' grain.

### Phone copies

On a phone the review plays a phone copy (`Media.phoneCopy`) in place of a
video it plays (a set's variant, a folder's video, a render's share copy or
master; never an image, captions or notes, which are never read for their
length) over 40 MiB or over 8 Mbps (`PHONE_RATE`, its bytes over its
length); a desktop plays the originals. 8 Mbps lies between what a phone was
seen to play and what it was not: of the looks study's 14.5 s cold opens
played as made on the owner's phone (2026-10-11), the 2D ones at 7.1 (cut
paper) and 7.8 Mbps (bold), both 1080p, were not reported choppy, and the 3D
ones at 14.0 (painterly, 540p) and 20.8 Mbps (ps1, 720p), both under 40 MiB,
were. The third 3D one, engraving (1080p, 27.4 Mbps, 50 MB), was already
copied.

The line is the rate, not the picture: a drawn 2D render over it plays as
its copy on a phone too. Decided for the owner's own concern, choppy phone
playback, on the five-up compare page and on a one-video page alike: a 21 or
28 Mbps master is the kind of file seen to stutter. On 2026-10-11 these
renders under 40 MiB crossed it (all 1080p): righteousness-by-faith's scenes
`declared` 8.07, `within` 8.52, `word` 8.66, `exchange` 10.06, `spoke` 10.16,
`cold` 10.37, `look` 11.50, `accuser` 12.60, `mirror` 13.38, `daily` 14.13,
`rain` 21.10 and `title` 28.10 Mbps, and `art3/declared.A-current` at 8.19.

A copy keeps a key frame every second at the video's own frame rate
(`PHONE_ENCODE`; at 25 frames a second, every 25). The review's player puts
a video that drifts 0.2 s from its clock back on it by a seek, and a seek
decodes from the key frame before it: the 3 Mbps copies before kept one every
145–250 frames (5–8 s), since NodeAV clears the picture type a frame carries
and mediabunny's key-frame requests never reached x264. x264 caps the copy
over a two-second buffer, and a copy asks under 8 Mbps by as much as that
buffer could add over its length (`phoneRateFor`: 7.0 Mbps for 14.5 s,
2.7 Mbps for 1 s), so even a short copy averages 8 Mbps at most. Where the
cap binds, x264 spreads the bits over every frame: no copy measured shows a
frame closer to the source's frame before it than to its own (luma PSNR
against the source scaled to the copy's size, still frames left out). A
copy's cache name carries every entry of `PHONE_ENCODE`, a `recipe` number
among them for what the code decides (the size rule, the rate and key-frame
sums), so a copy made any other way is never served.

The copies of the three study files over the rate and two drawn scenes
(x264 core 165, two threads, on a 16-core box at a load of 45–80 from other
work, so the times are loose):

| file          | source                | copy           | key frames | PSNR mean / min | encode |
| ------------- | --------------------- | -------------- | ---------- | --------------- | ------ |
| engraving     | 1080p, 27.4 Mbps      | 720p, 5.5 Mbps | every 30   | 38.4 / 29.8     | 75.7 s |
| ps1           | 720p, 20.8 Mbps       | 720p, 3.4 Mbps | every 30   | 42.6 / 36.6     | 50.4 s |
| painterly     | 540p, 14.0 Mbps       | 540p, 1.9 Mbps | every 30   | 40.2 / 35.3     | 26.3 s |
| scene `rain`  | 1080p, 21.1 Mbps      | 720p, 2.1 Mbps | every 30   | 44.2 / 41.6     | 77.9 s |
| scene `title` | 1080p, 28.1 Mbps, 3 s | 720p, 1.6 Mbps | every 30   | 43.2 / 41.3     | 18.1 s |

The 3 Mbps copy of the engraving was 2.6 Mbps at 36.2 / 27.5, a key frame
every 145 frames at most. A copy is never taller than 720 lines, and a
shorter video keeps its size.

A drawn film, copied for its size: righteousness-by-faith's share (1080p,
526 s, 185 MB at 2.8 Mbps) became a 92 MB copy at 1.4 Mbps, a key frame every
second, in 551 s; the 3 Mbps copy before was 68 MB at 1.0 Mbps, a key frame
every 8.3 s at most, in 624 s (one after the other, the box under other load).

## Shorts

A film's `shorts.ts` (optional; `Shorts` in `core/schema.ts`, decoded by
`FilmRepo`) declares vertical cuts: `{ id, title, spans: [{ scene, from, to }] }`,
each point a `ScenePoint`: a `{ mark }`, a named `{ cue, edge? }` or a scene
landmark `{ at }`, never a second. A span that opens on a word (a `{ mark }` or `{ at: 'speech' }`)
opens `SHORT_PREROLL` (0.1 s) before the word is heard, never before its
aligned start: the aligner gives a word the pause before it, and a short
opened on that pause starts on silence. A close stays where it is marked.
`core/shorts.ts` resolves a short against the layout on whole frames
(`resolveShort`: the spans back to back, each `{ scene, from, to, at }` in film
and short seconds), or fails with `UnknownScene`, `UnknownMark`,
`UnknownCue` (each `by: 'short "<id>"'`) or `ShortSpanEmpty` naming what the film has; `--short`
naming no short is `UnknownShort`. `shortPieces` maps a range of the short to
the film stretches under it.

The page is a `Film` of its own (`canvas/short.ts`, `createShort`), so the
player, the export handle and the worker pool serve it unchanged: the app
spreads `shortPages(name, load, shorts)` into its registry, one page per
short under `<film>/shorts/<id>` (`shortKey`). Each frame is the film's own
frame at the film time under it, drawn full size into a band and copied onto
a 9:16 page at the film's density (`shortPage(1920)`: 1920×3414), which the
encoder scales to 1080×1920 through the same `--scale` path; so a crop of the
band is, pixel for pixel, a `render --stills --no-captions` still at that film
time. The page is stacked by `SHORT_LAYOUT` (`core/shorts.ts`, 1080×1920 px,
data the checks and the lab read): the short's `hook` centred on y 445 at
most 800 px wide, set from frame 0 and faded out by 2.8 s (`hookAlpha`); the
band from y 620; the captions centred on y 1318. Round the band the page is
the film's paper under its own vignette, made once at the page's size, and
the film's grain laid over the paper only (`grainRect`), so nothing touches
the band. `Film.look` carries the film's paper, shade, finish and `short`
style (`ShortStyle` on `FilmSpec.short`: the hook's and captions' fonts and
colours, sizes in 1080×1920 px, checked by `createFilm`). The
renderer resolves the short again on the page's fps, cuts `full.wav` to its
pieces (`splice`, a `JOIN_FADE` of 10 ms each side of a join only), and
writes `out/<film>/shorts/<id>/main.mp4` and `main.vtt` (`shortCaptions`: the
phrases the page burns in, as it shows them).

A short's captions are phrases, not the film's lines (`core/phrases.ts`):
`shortPhrases` takes each span's words, timed by the voice (`heard`: a word
shows when it is heard, not when the aligner starts it), breaks them at
every sentence end (`.`, `?`, `!`) and voice turn, then at clauses (`,`,
dashes, `;`, `:`, `…`), and cuts each clause evenly into two to four words
(`PHRASE_MAX`). No phrase crosses a sentence end or a join, so a one-word
sentence ("Justified?") is a phrase of its own; a one-word clause joins a
neighbouring clause of its sentence unless the voice pauses over
`PHRASE_GAP` (0.3 s) between them. A phrase shows from its first word to the
next phrase's, or `PHRASE_HOLD` (0.6 s) after its last word, each moved half
a frame earlier so it shows from the frame nearest its first word. A word
between the script's “ and ” (which the take's words carry; `quotedWords`)
is quoted.
`canvas/short-captions.ts` (`burnedCaptions`) draws them centred on y 1318 in
the style's caption font, no plate, each phrase broken into as few lines of
at most 800 px as it needs and balanced (`breakLines`, so no word is left
alone); a quoted word gets a gold marker (`caption.highlight`) swept behind
it as it is read, so a quotation lights word by word. The phrases are set
once; a frame looks one up and draws it. The long film's captions are
untouched: they time each line by the aligner (`sceneCaptions`), and timing
them by the voice is one line in `core/captions.ts` (`filmCaptionTimes = heard`),
left for the owner since it moves burned-in pixels. `render --short --no-captions` leaves them out.

`film check <film> --short <id> [--zone default|ads|platforms]` holds a short to
`SHORT_RULES` (`core/shorts.ts`) instead of checking the film
(`tools/short-check.ts`, pure; `Checker.short` probes the page):

- `ShortUnsafeText`: a line of text past the safe zone, probed every half
  second and at each phrase's first frame. `SAFE_ZONES` (exported from
  `core/shorts.ts` with `safeRect` and `roomAcross`, so the lab draws the
  same zones) holds the margins in 1080×1920 px, and any column of buttons
  that takes more of the right from some row down: `default` top 270,
  bottom 520, right 140, left 65; `ads` the same with the bottom 35% (672);
  `platforms` the zone inside every platform's own, each edge the widest of
  YouTube Shorts', Instagram Reels' and TikTok's and every one's columns
  (`PLATFORM_ZONES`, each value with its source: top 288, bottom 672, left
  120, right 192, and TikTok's buttons 300 px from 840 px down), where a
  talk sets its words, a finding naming the platforms a line runs under. A
  line is held to the room across the rows it reaches (`roomAcross`): a
  caption reaching x 888 below y 840 runs under TikTok's buttons. The short's own lines
  (hook, captions; probed with the `caption` tag) are an error and fold into
  one finding per side; the film's lines in the band are a warning each,
  since the band is the film's frame and only another span moves them.
- `ShortHook` (error): the first word heard after 0.3 s; nothing in the picture
  moving by 0.5 s (probes of the open that hold still, the hook and captions
  left out, as `heldStill` does for holds); or the first frame showing the
  film's title (the film's page title, read from the film's own page). A logo
  drawn as ink is not told from other ink.
- `ShortLoop` (warning): the mean absolute per-cell luma difference on a
  64×36 grid (`SHORT_RULES.loopGrid`) of the band is over 0.08 between the
  last frame and the first (the export handle's `luma`: the frame drawn,
  then its band scaled down by the browser and read back as Rec. 709 luma),
  or more than 0.6 s of silence from the last word's voice round to the
  first's. The band is `bandOf` (`core/shorts.ts`) of the film's own page,
  the rectangle the short's page draws the film's frame into, whatever the
  film's aspect; a read with no value for every cell (no canvas to sample on)
  fails as `FrameFailed` (`lumaGrid`), never compared as clean.
- `ShortLength`: over 90 s is an error; outside 45–75 s a warning.

A talk is held to the same checks as a vertical film: its length is its
format's (`TALK_FORMATS`: over its most an error, under its least a
warning), and its open is still only while the take's frame holds too (the
probe records each footage frame a frame draws, `FootageMark`, so a talking
head is motion read from the edit, not the pixels).

A short resolves on its page's frame rate (`Checker.cut`: the rate the film
declares, read from the page's `info.fps`, as the renderer does), so
`check --short`, `cues --short` and the render cut the same frames.
`--static` runs only what the words tell (length, first word, the loop's
silence), probing no frames: it opens the page once, for its rate.
`film cues --short` prints `shortReport` at that rate. A short draws at about parity with the film per frame (~0.92× of the
same frames as a 16:9 render, measured against one contiguous range): the
9:16 page costs nothing extra, and saves nothing either.

## Lab

`film lab` is the one place a film is tweaked and reviewed: one server for
every film of the app, meant to run for days (on the laptop, port 8229). It
prints its links (`LabLinks`: the local one, `localhost` where it is bound,
and the phone's when it listens there; logged `lab.ready`) and runs until
stopped, which stops the server and the routes with the command's scope. The
server is Effect's over `Bun.serve` (`labServer` and `serveLab`,
`tools/api-server.ts`): no route or development server of Bun's, so every
request reaches the gate. It knows three pages, the
app's: the review (below); the player (`play.html`, `mountFilmStudio(pages)`), a
film's studio (**The film's studio**, below); and the render page
(`index.html`, `mountRender(pages)`) at a film's export place, which the
easel opens (`film lab look`). Its API is under
`/api/` (The HTTP API, below), and every other path a page serves is one of
the framework's places (`Places` in `core/api.ts`, each a `@bible/url-state`
Place; the app gives each page's HTML entry, `LabPageSpec.pages`, and its
server entry, `LabPageSpec.servers`), as
**Pages and links** (below) lists them. A link the lab does not serve as
asked answers a 302 (`servedPlace`, logged `lab.page.moved`), and the
browser keeps its `#…` across, unless the Location names a fragment of its
own (a beat's Script, Board or Lab names an empty one, below). A path with a
trailing slash answers with the path without it, and a parent path with
its nearest page: `/films/<film>` the film's studio, any other (`/films`,
`/series[/<series>]`, `/sets`, `/asks`, `/productions`) home. An old link answers with its place
(`legacyPlace`): `/?film=<film>` lands on the film's studio, `/?folder=…[&set=…]` on
the folder or the set, a render link (`/films/<film>/play?export` or
`/?film=<film>&export`, its build or wedge kept) on the export place, and
`/?project=<film>` and `/player?film=<film>[&lookbook]` on the film's
studio, and `/lab?film=<film>[&sel=…]` on the film's studio too, the
scene's beat selected when `sel` names a cue or a knob of it
(`sel=cue:<scene>:<name>`).
A film page the studio stands for answers with the film's studio
(`studioPlace`): `/films/<film>/play`, `/films/<film>/scenes[/<scene>]`,
`/films/<film>/project`, `/films/<film>/choices`, `/films/<film>/script[/<beat>]`,
`/films/<film>/board[/<beat>]` and `/films/<film>/lab[/<scene>]` go to
`/films/<film>/studio`, with
`?sel=beat:<id>` when the path names a beat or a scene (`?sel=panel:<beat>.<mark>`
for a Board link's `?panel=`, with its `?try=<n>`), or a scene render's
card (`?point=render:scenes:<scene>` on the project or the choices) names
one, the note open (`?note=<id>`) kept, and the film time kept (a scene of
the tape's `#t=` is film time, as the studio's is, and so is a film's
Lab's). A beat's Script, Board or Lab held time in the beat on its hash:
its Location ends in an empty fragment (`…#`, `NO_TIME`), so the browser
drops that hash and the studio opens at the beat's start, or at the
panel's mark. A path no place declares is a 404, never a page.
`LAB_HOST` (loopback by default) and `LAB_PORT` (8229) say where it
listens; `FILM_LAB_PHONE_URL` (a plain `http://` address by its IP, the
laptop's on the tailnet: the gate admits the bound IP, so a MagicDNS name
typed by hand would be refused) is a second listener with the same handler (`startLab`), logged
`lab.phone.unbound` and left out when it cannot bind. A loopback address it
cannot bind ends `film lab` with `LabUnbound`, whose message names the
address and Bun's words. A port is one lab's (`reusePort: false`): a second
lab started on a port another holds is refused, never served beside it.

**Pages and links.** Every view a reviewer would talk about is a URL, so a
pasted link opens what the sender saw and Back walks the views: the path
says what the view is about, the query what is selected in it or how it is
shown, the hash when (`#t=`, seconds). Each page reads and writes its place
through `@bible/url-state`, and every link is printed by `pageHref` over the
same places. Whether a move is a step Back walks is the place's declaration
alone (`pageMove`, `core/api.ts`): a new path or a cited key (a selection,
a view, a moment chosen, the compare's mode) is a history entry; a
refinement and the playhead replace the entry. Every write enters history
by that declaration (`Place.history`), through either of two doors. A page
that moves for a reason names only the reason (`addressOn`,
`browser/host.ts`): the viewer went somewhere (`go`, entered as the place
declares), or the URL follows what the page did on its own (`follow`: play,
a drag, a ←/→ step through the moments, a correction, a note gone from the
feed, an old link's redirect), which always rewrites the entry. The one
traversal a page makes is the bar's too (`dismiss`, a sheet's Close, Escape
or swipe): it goes Back over the entry the opening pushed only when that
entry is on screen and Back lands exactly where the Close writes (the same
path, query and hash), else it rewrites the entry; no page goes Back or
Forward itself (`film/history-through-host`). The review pages also set a place's value directly (`UrlState.set` and `update`,
`UrlAtom.place`'s setter: a sheet opened, the synced players' time).

| Place                    | Page   | Query                                                                                                                   | Hash                  |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `/`                      | review |                                                                                                                         |                       |
| `/sets/<folder>`         | review | `still` (the sheet or still open full size)                                                                             |                       |
| `/sets/<folder>/<point>` | review | `view`, `other`, `m`, `inspect` (the version whose sheet is open), `still` (the version whose moment is open full size) | `t` (the set's video) |
| `/films/<film>/studio`   | player | `v` (the version; 0 or none: the production's open one), `sel` (`beat:<id>`, the beat selected)                         | `t` (film time)       |
| `/films/<film>/export`   | render |                                                                                                                         |                       |

The lab serves no page at a film's `/play`, `/scenes[/<scene>]`,
`/project`, `/choices`, `/script[/<beat>]`, `/board[/<beat>]` or
`/lab[/<scene>]`: it sends each to the film's studio (`studioPlace`,
above).

A film's studio writes its own time (`tInUrl`, `player/t-in-url.ts`, from
`lab/film-studio/context.tsx`): `#t=` follows the playhead at most every
`TIME_EVERY_MS` and never makes a history entry; a selection and a note open
are history entries (Back undoes them). Back or Forward lands the player on the time the entry keeps
(`onTraverse`, `browser/host.ts`; the review's players too), a time still
waiting to be written for the entry left dropped. A bare `#<seconds>` (an old link's film time) opens on that frame.

A folder ref is one path segment (`bible-tools%2Frighteousness-by-faith`), as
is a short's name. The wipe's divider, the microphone and quality are this
viewer's own settings and stay in the browser's storage, never in a link; a
set's view (`?view=`) is the link's.

**The pages are built in the lab's process** (`LabPage`, `tools/lab-page.ts`):
`Bun.build` with `@bible/film/solid-plugin` (the `PageBundler` service, with a
test layer that reads each entry as its own page; each page with a server
entry, `*.server.tsx`, is built beside its browser bundle from the same
sources, in the same build), about a tenth of a second, so
there is no build step and nothing to rebuild by hand. A page is built when
first asked and again when asked after a file the last build read has
changed: the folder of every file the last build read (outside
`node_modules`) is watched, the set following each build: the entries'
folders from the start, and after a failed build also the folders of the
files the bundler named, so a first build that fails still hears its fix. A
folder still read keeps its watch; a file read in a newly watched folder
or new to what it read, that changed from a second before the build began
counts as a change. Each change to a
file a build read is one more build (a render or a note is none). A film's
mixed track (`narration/full.wav`) is no source, but the page plays the one
it loaded: once a page asks for one, there or not (a film before its first
mix gets a 404), its folder is watched too, or the nearest folder there on
the way to it until the mix makes it, and a mix landing it (last and whole,
by a rename, so the mix has finished) is one more change, with no new build,
that the film's open studio hears and no other film's (it waits with `&film=`),
so a score or level written on the review, a take kept, a first mix, or a
`film mix` run by hand loads that studio again once onto the new track; a take's
timings, saved before its mix, wake nothing. A page that never plays the
track arms the watch with its first wait on `&film=` (`filmWaited`). A write
that mixed answers the build its film's pages hear that very mix by
(`mixed`, `LabPage.heardAt`, from the track's mtime read under the writer's
lock). A page links its scripts and styles from the root (`/chunk-….js`,
`publicPath: '/'`), so a page served under a film's path finds them; a
request is answered as a narration file when it is one
(`/films/<film>/narration/<file>`), then as a built file, then as the page
its path serves. Every page is stamped with its build and the server that
built it (`<meta name="lab-build">`, `<meta name="lab-server">`, an id made at
start) and waits on `GET /api/review/build?since=&server=&film=` (`PageBuild`,
long-polled, at most 60 s; another server answers at once, so a page outlives
a restart); a film's studio loads again at its place when a later build or
another server answers (`reloadOnRebuild`, `lab/rebuilt.ts`), once no edit
is in hand, no frame is drawn on and the recorder is not over the page, so a
scene edited by hand or by an agent is on screen with no hand on the page.
The bundler resolves a workspace package's subpaths by the `exports` maps the
process read at start, so the lab reads every workspace `package.json`'s
`exports` as it starts and every 3 s after (`tools/exports-watch.ts`): once
one changes (a merge adds a subpath), the lab closes its servers and its
pages, ends their Chrome (`Bun.WebView.closeAll()`), and starts itself again
in the same process with the same command line (`relaunchOnExportsChange`,
`tools/relaunch-bun.ts`); an open
page sees another server answer and loads again at its place.
The review does not reload itself (a playing set
is not interrupted); its next load is the new code. A page that does not
build answers 500 with the bundler's words and reloads once a later build
or another server answers, pausing 2 s after every other answer; a
failed build is tried again on each request and, while a page waits, by its
wait every half second (a fix may land in a folder no build read, or the
bundler may still hold what the failed build read; the failed page asks
nothing but its wait), and one that then builds is a new build its page hears; the server
keeps serving.

Every page is rendered on the server: its server entry
(`LabPageSpec.servers`, whose default export is a `PageRender`,
`core/page-render.ts`) runs in a worker of its build (`PageRenderer`,
`tools/page-render.ts`), retired once a newer build has rendered and its own
last render ends; the render's head, body class and markup are spliced into
the built HTML and streamed, and the browser's copy of the same components
hydrates them. A render's reads of the API come back to the lab's own
handler (`PageReads`), so they pass `admit` and the same handlers; they are
sent with the page and adopted (`ssrSource: 'server'`), never read twice,
and a value only the browser knows (the viewport, quality, the viewer's
keys) is `ssrSource: 'client'` with a server value (the server answers as a
phone). The server draws no film: the studio's viewer, the scene code and
the stills are `clientOnly` (`lab/film-studio/page.tsx`); a film page whose
film does not start, or whose faces do not load, ends its page (`PageEnd`,
`lab/page-client.tsx`: the tree disposed, the notes feed and the keys with
it) and says why in its place, once. A film's studio whose film does not
stage shows its timeline alone, its viewer the Board panels and its clock
silent (`lab/film-studio/mount.tsx`). A build whose server entry reads
a film's or a scene's module or `player/stills.ts` fails, naming them
(`filmCode`). A render that fails before its head answers the page as built,
which the browser then renders. One that fails after its head, or still runs
`LONGEST_WAIT` and a few seconds after it (`END_WAIT`), is cut: the page ends
with what it wrote and `PAGE_CUT_MARK`, and the browser drops that markup
and renders the page anew (`mountPage`). A page's answer (its HTML, scripts and
styles) is compressed by the request's `Accept-Encoding` (br, else gzip;
`pageRoute`, `tools/api-server.ts`), a streamed page flushed chunk by chunk
(`NodeHttpCompression`), so its shell reaches the browser while its render
goes on. A build's scripts and styles are also compressed once at brotli's
best, in the background after the build, and sent so to a request that
takes br once made (`squeeze`, `tools/lab-page.ts`). A wedge's files are not: only the
easel's browser on the box asks for them, so each is compressed per request. A page's head preloads the UI faces' latin subsets (Geist's and Geist
Mono's) and declares every subset with `font-display: block` (`FACE_HEAD`,
`player/face.ts`), and keeps the page's root out of paint until the
preloaded faces have loaded, at most the hold's cap (1 s), past which it shows
in the fallbacks and logs `[lab] fonts.late` (`faceHold`): nothing on a page
moves when its faces land (`e2e/lab/touch-face.dom.test.ts`);
`tools/page-css-budget.test.ts` holds each place's render-blocking CSS, as
the lab answers it, to 64 KiB. Only the lab's server bundles Solid; the
render's server (`film render`, `check`) serves the player alone.

The framework owns the routes (the lab API, below: `labHandler` in `lab.ts`,
one web handler over NotesStore, the scene source, the studio, the review,
the choices and the project, with the pages behind the same gate):

| Route                                                 | What it does                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/films/<film>/notes`                         | the film's notes file; its `seq` is the cursor                         |
| `POST /api/films/<film>/notes`                        | a new note: `NotePost`, a `NoteDraft` plus the frame as a base64 PNG   |
| `POST /api/films/<film>/notes/:id/reply`              | the user replies (`ReplyPost`); the note opens again                   |
| `POST /api/films/<film>/notes/:id/resolve`            | resolves it (`{}`)                                                     |
| `POST /api/films/<film>/notes/:id/withdraw`           | takes it back while it is unanswered (`{}`); else a 409 `NoteAnswered` |
| `GET /api/films/<film>/notes/wait?since=<n>&timeout=` | the changes past cursor `n`, long-polled (at most 60 s)                |
| `GET /api/films/<film>/stills/:name`                  | a still (`n3.png`, `n3.r5.png`); any other name is a 404               |

A bad body is a 400, an unknown note a 404 `NoteNotFound`, an unknown still
a 404 `StillUnknown`, and every failure is logged.

**The studio** (`tools/studio.ts`, over `Takes`, `StudioReadings` and
`FreshFilm`) records takes from the lab through the same import as `takes
import`. The lab runs for hours and keeps each film module as it first
imported it, so the studio never loads the film in its own process: it reads
the voice, the script's `heardAs`, each beat's line and the reading sheet
fresh (`film read voice <film>`, `StudioReading` in `core/studio.ts`), kept
by `StudioReadings` under the film's source stamp (`FilmFolder.stamp`: one
fresh process after any file under the film changed, none before). A posted
recording is made an attempt here (`Takes.recordAttempt`); every keep, of
that attempt or an earlier one, is `keepVoice` (`choices.ts`), the one keep
a voice pick through the choices routes makes too: `film options keep-voice <film>
<beat> <file> [--accept-mismatch]` in a fresh process (it keeps the take and
remixes), recorded by `SourceWriter.around` with the take files the timings
name and the track mixed from them (`Follows`), so it holds the writer's
lock and the film's Undo and Redo walk it back and forth: each brings back
the take it lands from `attempts/`, remixes (`film mix <film>`, fresh; a
failed mix is logged `lab.remake.failed` and the step stands), and the
studio loads again at its place to play it (the timings and the
track are read at load, so no rebuild would). A step's request may carry an
id, under which the lab records the step in `GET …/check`'s `landed` before
it remixes, so an answer lost on the way back is read from there; Choices
sends its Undo and Redo with one. Undo and Redo are stepped back and on only with the
timings' takes brought back as the very files they name: a take's copy is
picked by the hash of its audio its name carries, and a name from before
takes were named by their audio, whose copies differ, is refused
(`TakeAmbiguous`) rather than guessed at. A keep answered by
an older film CLI (`{"_tag":"OptionsKept","mixed":true}`, no take) is still
recorded and answered from the timings. A reload onto a newer build never
takes work only the page holds: it waits while an edit is in hand, a frame
is drawn on or the recorder is over the page (**The film's studio**,
below). A take is kept against that reading
(`VoicedFilm`, `narrator.ts`: the film's paths, voice, `heardAs` and beats,
which `takes import` makes with `voicedOf`), so a line fixed while the lab
is open is on the sheet, and a take of it current, at the next read. Its
routes are the lab API's `studio` group, under `/api/films/<film>/studio/`, behind
the same gate and for any of the app's films (another name is a 404
`FilmUnknown`). Every body and answer is a Schema in `core/studio.ts`,
over the one reading the tools use too: a beat's `Line`s
(`core/narration.ts`) and the sheet's `Part` and `SheetBeat`
(`core/sheet.ts`):

| Route                                                     | Body → answer                                                                                                                                                              |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/films/<film>/studio/beats`                      | `StudioBeats`: per beat with a line, its sheet `parts`, the file name to record it as, `state` (`recorded`, `staging`, `stale`), its take, how many attempts               |
| `POST /api/films/<film>/studio/takes/:beat`               | `TakePost` (`audio` base64, `type` `audio/wav` or `audio/flac`, `acceptMismatch?`) → `StudioTake` (the take, its `transcript`, the word error, the new `timings`, `mixed`) |
| `GET /api/films/<film>/studio/takes/:beat/attempts`       | `StudioAttempts`, newest first: each `transcript`, its word error, when, whether it is the take and whether it reads the line as it is now                                 |
| `GET /api/films/<film>/studio/takes/:beat/attempts/:file` | the attempt's FLAC (`audio/flac`), to hear it again; a name the ledger does not hold is a 404 `AttemptUnknown`                                                             |
| `POST /api/films/<film>/studio/takes/:beat/keep`          | `KeepPost` (`file`, `acceptMismatch?`): an earlier attempt made the take → `StudioTake`                                                                                    |

A take not kept answers its failure as the whole API does (below): a
`TakeMismatch` carries the beat (`id`), the `script`, what was `heard`, the
`wer` and the `attempt` it saved, which `keep` with `acceptMismatch` makes
the take ("accept anyway"); the recorder holds the failure itself
and reads the attempt off the `TakeMismatch`.
A body that is not a recording, or of a media type the studio is not told how to
read (`AudioInvalid`), is a 400; a lossy one (`audio/webm`, `ogg`, `mp4`,
`aac`, `mpeg`: what MediaRecorder makes) a 415 `RecordingLossy`, since the
take is the film's master; the recorder records PCM (an AudioWorklet) and posts
WAV. `TakeMismatch`, `RecordingInvalid` (a beat
with no line, silence, an attempt never recorded) a 422; a failed
speech-to-text (or `SttUntimed`) or a recording the media tools could not
read (`MediaFailed`) a 502. `:beat` is decoded and must be one of the film's
beats before a route reads a body or writes a thing: any other name (an
encoded `/` or `..` included) is a 404 `UnknownScene`. A body over
`STUDIO_MAX_BODY` (64 MiB) is a 413 `BodyTooLarge`, counted as it streams (a
Content-Length over it is refused unread; one under it is not believed). The
upload is written to a scoped temp file (`recording.wav` or `.flac`), removed
when the request ends. Takes are kept one at a time with every other lab
write (the writer's lock): the keep, the timings write and the mix after it
finish before the next keep, pick or edit begins, and the keep is undoable
(Undo names `voice <beat> keep <file>`). After a take is kept the film remixes; `mixed: false` says the mix
failed (logged) and the take stands. The server keeps a connection open
with nothing sent for `LAB_IDLE_SECONDS` (255 s, Bun's longest), past the
page's wait for a take (`STUDIO_IMPORT_WAIT_S`), so the page stops waiting
before the socket closes. An attempt plays back through `serveFile`, by byte
ranges, as a phone's Safari asks. The recorder (**Studio**, below) records
through these routes.

### The film's studio

A film's studio page (`/films/<film>/studio`, `Places.studio`,
`pageHref.studio(film, {v, sel}, t)`) is the film on one timeline: the one
page a film is reviewed and edited on. Its recorder is the voice-recording
Studio (**Studio**, below), which it opens over itself. The player page
(`play.html`) mounts it in the browser (`mountFilmStudio(pages)`,
`lab/film-studio/mount.tsx`), and the lab renders its frame on the server
(`studioRender`, `lab/film-studio/server.tsx`). Its query `v` names the version (0
or none: the production's open one); `sel` names the beat selected
(`beat:<id>`: `beatSelection`, `selectedBeat` in `core/api.ts`), and a new
selection is a step Back walks; `pane=script` keeps the Script pane open
(below), a step Back walks too. Its hash `t` is film time.

The page reads its data from `GET /api/films/<film>/timeline[?v=<n>]`
(`FilmTimeline`, `core/timeline-schema.ts`; **Timeline**, below). A version
the ledger does not have is refused with `FilmVersionUnknown`, and an older
one kept in no folder with `FilmVersionUnkept`.

Its layout is layout C (the owner's pick, 2026-10-16): the inspector beside the viewer, the
timeline full width under them. The inspector's place is one grid template
(`lab/film-studio/style.ts`) and one part (`Inspector`).

- **The header**: the film, the version chip (`v2 ▾`, a menu of the
  versions), the stage, and `N wait on you` with a menu of what waits.
- **The viewer**: the scene drawn at the playhead when the staged film is
  this version, else the Board panel held there, else the beat's empty
  frame (`pictureAt`). A tag names what it shows (`Scene · two`,
  `Board · two`).
- **The transport**: the timecode in Geist Mono (`M:SS.t`, `timecode`),
  five keys (to the start, the previous beat, play, the next beat, to the
  end), Note on this frame, the line spoken at the playhead, and the Script
  key at its right end (a laptop's: a phone hides it, so the timecode keeps
  its room, and opens the pane from its reading block's head).
- **The Script pane** (S, the Script key; `?pane=script`): closed at rest.
  Open, it stands in the inspector's column and shows the studio's code view
  (`code.tsx` `ScriptPane`; the Code section's, below) of the beat at the
  playhead, the next beat's scene as the playhead crosses into it: the
  scene's code, lit as the playhead plays it, with the script's line and its
  marks over it. It follows the line the frame reads by the one Follow rule
  (`lab/follow.ts`): a reader's scroll takes the box, and Play or Follow
  gives it back. A selection's inspector covers it, and closing that shows
  it again; S under a selection shows it, the selection let go, a step Back
  walks. On a phone the reading block is its closed face: a tap on the
  block's head, the Script glyph at its end, opens it in the block's place.
- **The timeline**: a flag strip of the open asks and notes, a ruler that
  scrubs, the act bands, a lane for each stage with material, the Next row
  and the red playhead. Zoom −, Fit and + set its scale; ⇧Z fits the film.

The keys: Space plays or pauses, K pauses, L plays, J or ↑ goes to the
previous beat, ↓ to the next beat, Home to the start and End to the end.
← and → step a frame (⇧ a second). N draws on the frame (below). ⌘Z undoes
the film's newest change and ⇧⌘Z redoes it (while drawing, they are the
ink's). S shows or closes the Script pane. Escape lets an edit in hand go
(a clip carried, an edge pulled, a frame drawn on), else closes the
inspector, else the Script pane.

A click on any clip of a beat selects that beat (`?sel=beat:<id>`), and a
click on a Board clip selects its panel (`?sel=panel:<beat>.<mark>`:
`panelSelection`, `selectedPanel` in `core/api.ts`). Every clip of the beat
is outlined, and the inspector (`inspector.tsx`) opens beside the viewer:
its head (the beat, its span, Approve) and a section for each stage, in the
flow's order, each a disclosure with its count when shut
(`inspector-state.ts`: `95 words`, `3 of 3 kept`). The section of the kind
clicked opens with the selection (Words for a beat, Board for a panel); one
the owner opens or shuts stays so while the selection stands.

- **Words**: the beat's line as the one words reader reads a script
  (`lab/words/reader.tsx`, `film-script.tsx`), its delivery marks set by a
  tap and its staging take playable, following the playhead by the one
  Follow rule (`follow-rule.ts`). The words selected are the address's
  (`?words=<a>-<b>`), and under them stands the note on them
  (`words-note.tsx`): Note, Correct (the words to say instead) or Remove,
  saved through the inspector's note machine (`note-save.ts`) with the
  frame at the playhead while it is in the beat (else the beat's first) and
  its still. Only the film's own version takes one.
- **Board**: each panel at its mark with its tries, the kept one ringed; a
  try pressed shows in the viewer (`?try=<n>`, its tag `try n`), a second
  press shows the kept one again, and Keep keeps it. Mark up
  (`panel-markup.tsx`, on a picture panel of the film's own version) draws
  a pen over the try (`lab/sketch/surface.tsx`) and takes words, saved as a
  Tweak (what `film board tweak` acts on) or a Note, its still the try with
  the marks over it (`panel-still.ts`); the panel then lists its notes, each
  a link that opens it in Notes and asks. Approve and Withdraw act on the
  beat. The writes are one machine (`board-writes.ts`: Idle, Sending, Done,
  Failed; a write asked while one is on its way is not sent) over the lab's
  board routes (`POST /board/pick`, `/board/approve`, `/board/withdraw`); a
  version not the film's shows its board read only.
- **Voice**: the beat's take (`lab/take.ts` `takeHeard`: the take the
  beat's timings name, its kept attempt or its staging take), its facts and Hear, the page's one
  voice (`Media.hear`: the film's Play hushes it). Record shows the record
  studio (`lab/studio/`) over the page, a Dialog on a laptop and a Sheet on
  a phone (`RecordOver`); the recorder is the inspector's, so a beat selected or the
  recorder hidden never ends a take. Close, Escape or a swipe while it holds
  a take only this page has first asks to discard it (Discard, Keep).
- **Code**: the scene's file read only (`GET …/scenes/<scene>/code`), only
  when the beat has a scene: the studio's code view (`code.tsx`, the Script
  pane's too), a row to a
  line, lit while the playhead is in the beat (`code-lit.ts`): a playing
  cue's literal, a meter under its line, and each call that reads the clock
  while the frame read it and the clock plays it (`Player.hearClock`), its
  line glowing and fading after. The band over the code names the beat and
  what plays, and sets the beat's line as the script says it now (the
  reader's words, `lab/words/line.ts`) with a chip at each `{mark}`, the
  mark last said lit, three whole rows of it in sight (each as tall as a
  chip, the scroll on a row's top); a chip puts the playhead on
  its mark's word. The band says what plays, or that nothing does: a field
  the parse refuses lights nothing, and why is `film check`'s and the lab
  MCP's to say. A tap on a line, its number or its text (Enter on its
  number too), puts the playhead where the line next plays, once
  (`nextFiring`, over the scene's `firingsOf`, built once for the scene as
  staged, never per frame), and selects nothing. The number seeks whatever
  the page holds selected; a drag that selects a line's text seeks nothing.
  With no staged film (a version kept
  in its own folder) the code is the film's as it stands, unlit (`Lit for
  the open version`). A note cannot cite one of its lines.
- **Notes and asks**: the beat's open notes, each with its thread and a
  reply (`lab/notes/thread.tsx`), and the open asks at its time, each a link
  to its page. The note open is the address's (`?note=<id>`): a note's link
  selects its panel or beat and opens it here. Choices' picks are asks: no
  Choices page remains.

A section with nothing to show is a quiet row with no body: Board on a
beat with no panel and Code on a beat with no scene (`–`), Words on a
version kept in its own folder (`not read for past versions`: the reader
is the film's as it stands), and Concept (`to come`).

A film's script is read in the one words reader (`lab/words/reader.tsx`,
the film's in `film-script.tsx`): in the studio's inspector (its Words
section, the beat selected) and in an ask's script block. Each beat stands
under its id and label with its staging take (▶ and its pace once ready),
its line at the reading size with its delivery marks, what its picture does
(the script's brief, `GET …/script`) and its sources. A tap on a word
selects it (shift extends; a text selection across words selects them, and
a word held or right-clicked opens the page's menu, whose Select to here,
`lab/script/commands.ts`, extends it) and opens the box under its line:
Hear, Clear and the words' delivery, each written at once into `script.ts`
(`POST …/script/marks`); in the studio the box also holds the note on the
words (`words-note.tsx`: Note, Correct or Remove). A page with a playhead names the beat it is in,
which the reader marks and keeps in sight by the lab's one Follow rule
(`lab/follow.ts`) until a hand scrolls it.

The pages the inspector holds are links that land on the studio
(`Replaced` in `core/api.ts`): `/films/<film>/script`, `/films/<film>/board`
and `/films/<film>/lab` on the studio, `/films/<film>/script/<beat>`,
`/films/<film>/board/<beat>` and `/films/<film>/lab/<scene>` with the beat
selected, a Board link's
`?panel=<mark>` with that panel and its `?try=<n>` as the studio's `?try=`,
and `/films/<film>/choices` on the studio, its `?point=` a beat when it
names a scene render. A note open (`?note=<id>`) is kept as the studio's
`?note=`. A beat's scene time (`#t=`) is dropped (an empty fragment on the
Location, `NO_TIME`): the studio opens at the beat's start. A film's Lab's
`#t=` is film time, and kept.

The clock is the staged film's preview with its narration (`playerClock`,
`clock.ts`) when the version shown is the one the film registry holds. A
version kept in its own folder plays on a silent clock (`silentClock`).

On a phone (390 × 844) the timeline keeps three lanes (`lanesShown`: the
script, the newest picture lane and the voice), each target is 44 px, and
the words show below.

**Edits.** The studio writes two edits into a version's script itself
(`core/beat-edit.ts`, pure, which the lab's routes and the MCP tools judge
by too), on a version whose files the lab holds (its own folder, or the
film's registered files):

- **Reorder.** On a laptop a Script clip dragged past a drag's first pixels
  is lifted (at 60% opacity, its grips hidden) and carried over the gaps
  between the beats; the playhead steps aside, and a drop line in the
  accent runs through the lanes where it would land, its tag on the band
  saying what lands where (`three before one`). A drop on a gap that moves it
  moves its beat there; any other drop, or Escape, moves nothing. A move
  keeps every act and score movement on the beat it begins on, and one that
  would put a part before the part declared ahead of it is refused in words
  (`movedOrder`). On a phone a long-press on a clip opens its menu, whose
  Move before… lists a row for each beat it can go before (`Before two`), and
  To the end. The page
  posts `POST /api/films/<film>/beats/move`.
- **Trim.** On a laptop each edge of a Script clip with words is a grip
  (a beat with none has no hold to pull): pulled, it sets that beat's hold (`lead`, the time before its words, at the left
  edge; `tail`, the time after them, at the right), with a live readout
  over that edge (`hold +3.0 s · 7.7 s long`: the change and the beat's length after it,
  `trimReadout`, sized by the layout's own rule, `beatLength`, so a beat its
  `min` holds keeps its length). The hold snaps to 0.1 s and stays between its floor
  (`MIN_LEAD`, `DEFAULT_TAIL`, or the beat's own when it already holds
  less, kept as it is) and 30 s (`heldWithin`); a tail on `DEFAULT_TAIL` is
  written as none. The grip follows only once pulled past a tap's reach
  (`DRAG_PX`), from the hold as it stood on the 0.1 s grid; let go there,
  it writes nothing. The page posts
  `POST /api/films/<film>/beats/hold`; a hold that would change nothing the
  film plays (a beat with no words, a tail its `min` absorbs) is refused
  with `HoldUnchanged`, said in words (`holdUnchanged`). The phone has no
  trim.

Each edit is one write of the version's `script.ts` through the
SourceWriter (`tools/source-writer.ts`), made by `BeatEdits`
(`tools/beat-edits.ts`): formatted, read back, and written only over the
text it read. No persisted format changes. The timeline ripples at once
(`lab/film-studio/ripple.ts`: every later beat follows, with the panels,
takes, scenes and notes of each beat, and the movements and acts that
begin on it; a render stays) until the lab's read of the version holds the
edit, and the playhead comes back to the same moment of the same beat
(`anchorOf`, `anchoredT`). A version the staged film draws then loads again
at its place, its new order drawn. One edit is in flight at a time
(`lab/film-studio/edit.ts`: `Idle`, `Dragging`, `Trimming`, `Sending`,
`Landed`, `Done`, `Failed`): a write that changed the script is `Landed`
until the version's read holds it, and an ask, a carry or a trim while one
is on its way or unread is not taken (its grips say so,
`data-waiting`); a read that fails then keeps the timeline shown, and the
receipt says so. Its receipt
says what it did in the owner's words (`Moved two before one.`, `Held two
+3.0 s before its words.`), its Undo bound to the change it made. An edit
of a film with a production files the agents' work on its ledger while it
stands (`Re-time, re-check seams, re-render.`): once it lands, and again by
its redo; its undo withdraws it.

**One history.** ⌘Z and ⇧⌘Z, and a receipt's Undo or Redo, step the film's
one history through `POST /api/films/<film>/edits/undo` and `/edits/redo`
(`tools/edits-http.ts`), answered at once with the owner's words and the
steps, no check. It is the history the steps' `POST …/undo` and `/redo`
step too: the owner's edits and the agents' (a scene written, a voice kept,
an edit through the MCP tools) on one stack, each step its own. A
receipt's Undo steps only the change it names, while it is the newest
(`StepNotNewest` otherwise); a refused step reads the steps again, so the
next ⌘Z steps the newest change the page now knows. A ⌘Z or ⇧⌘Z pressed
while they are read waits for them (`Reading the film’s history…`).

**Notes for an agent.** What the page cannot write exactly it files as a
note, through the inspector's note machine (`note-save.ts`); none of them
writes the film:

- **Draw on a frame.** N, the transport's Note on this frame, or that row
  on a clip's or the page's context menu pauses the film and lays red ink
  over the viewer (`Editing.Ink`, on the markup surface
  `lab/sketch/surface.tsx`), the frame ringed in the note's colour under a
  crosshair and its tag saying `Draw here`. The note bar takes the transport's place: one
  line (`Say what to change`), File note and Cancel. File note files the line with the frame drawn
  on as its still (`frameStill`, `panel-still.ts`).
- **Split at the playhead**, on a beat's context menu while the playhead is
  inside it, files a note asking for the beat to be split there.
- **Move…**, on a Board panel's context menu, picks the beat the panel goes
  to and files that as a note.

A filed note's receipt has Withdraw, which takes the note back while no one
has answered it (`POST /api/films/<film>/notes/:id/withdraw`).

**The MCP tools.** The lab MCP serves the same edits to agents
(`tools/timeline-mcp.ts`): `beat_move`, `beat_hold`, and `undo` of the
film's newest change (or, given `change`, that change alone, refused while
another stands before it); `beat_hold` answers the seams into and out of
its beat as the version reads after it (`seamsAround`: from the end of a
beat's take to the next beat's words). `tweak` (`tools/tweak-mcp.ts`)
writes a scene's cue timing or knob value into the same history (The
tweak, below). `BeatEdits` makes them as the page makes them,
so the owner and the agents step one history, and the lab's change feed tells
each change, its undo and its redo as it lands (`source.written`,
`source.undone`, `source.redone`; The lab's events, below).

**A newer build.** The studio loads again at its place onto new code when
the lab answers a newer build of the pages (`reloadOnRebuild`,
`lab/rebuilt.ts`, wired in `lab/film-studio/editing.tsx`), once no edit is
in hand, no frame is drawn on and the recorder is not over the page.

Its modules are in `lab/film-studio/`:

- `view-state.ts`: pure derived state (the beat at the playhead,
  `pictureAt`, `lanesShown`, the zoom steps, the ruler's ticks,
  `timecode`).
- `machine.ts`: the effect-machine machines. The timeline machine reads
  version `v`, and reads again on a version change. The transport machine
  is Paused, Playing or Scrubbing.
- `edit.ts` (the edit in flight), `ripple.ts` (an edit laid on the
  timeline, and the playhead's place through it) and `editing.tsx` (the
  edits' provider, `Editing.Root`, and its parts: the ink, the note bar and
  the Move picker).
- `inspector.tsx` (the beat's pane), `inspector-state.ts`, `note-save.ts`,
  `board-writes.ts`, `words-note.tsx`, `panel-markup.tsx` and
  `panel-still.ts`.
- `clock.ts`: `playerClock` and `silentClock`.
- `context.tsx` (the provider and the keys), `parts.tsx` (the parts),
  `geometry.ts` (the sizes), `style.ts` (the styles), `page.tsx` (the page
  on both sides), `server.tsx` (the server entry) and `mount.tsx` (the
  browser entry).

**The lab's source routes.** Beside the edits' routes the lab keeps
the steps' undo, redo and check, a scene's code as the studio reads it, and a
talk's words read, cut, restored and marked. A scene's cue timing and knob
values are the agents' to set, by the lab's `tweak` command (below); no
page draws a control for them.

| Route                                         | What it does                                                                                                                                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/films/<film>/scenes/:scene/code`    | the scene file's text now and, as `[start, end)` ranges of it, where each cue and knob is written and every call that reads a cue, a knob or a mark by name, and why a field lists none (`SceneCode`; read-only: the studio's Code section reads its text)      |
| `POST /api/films/<film>/undo`, `/redo`        | puts the newest write's file back, byte for byte, or makes the newest undone write again (`{request?}`: an id the step is recorded under; `{change?}`: that change only, while it is the newest, else a 409 `StepNotNewest`)                                    |
| `POST /api/films/<film>/beats/move`           | `{ version?, beat, before? }`: the beat moved before `before` (to the end when none) in the version's `script.ts`, one write through the history; a move that breaks the acts or the movements a 422 (`StudioEdit`: the change, its words, the steps, no check) |
| `POST /api/films/<film>/beats/hold`           | `{ version?, beat, edge, seconds }`: the beat's `lead` or `tail` held, snapped to 0.1 s and kept at its floor, one write through the history (`StudioEdit`)                                                                                                     |
| `POST /api/films/<film>/edits/undo`, `/redo`  | Undo and Redo as `/undo` and `/redo` do them, answered at once with the owner's words and the steps (`StudioEdit`), no check                                                                                                                                    |
| `GET /api/films/<film>/check`                 | `film check --static` now, the latest change, what Undo and Redo would do (each with its `change` id), and the steps `landed` by request id                                                                                                                     |
| `GET /api/films/<film>/talk`                  | a talk's words (`TalkWords`): each section in play order, its take, every word from its first to its last with its text, whether the cut strikes it, when it is heard, and the section's marks; a film with no `talk.ts` a 422                                  |
| `POST /api/films/<film>/talk/cut`, `/restore` | `{ section, from, to }`: strike those words from the section's cut, or play them again, as one write of `talk.ts` judged by the cut (`LabWrite`; an edit the cut refuses a 422)                                                                                 |
| `POST /api/films/<film>/talk/mark`            | `{ section, word, name }`: mark that played word, as one write of `talk.ts` judged by the cut (`LabWrite`); a name the talk's decode would drop (`MarkName`) a 422, the mark read back from the talk decoded                                                    |

An undo with nothing to undo (or a file changed since) is a 409.

**The tweak.** The lab's `tweak` command (`tools/tweak-mcp.ts`; MCP, and
`bun run lab tweak` from a terminal) sets one value of a scene's
`drawing({...})` literal: a `cue`'s timing (`offset`, `dur` or `until`,
`untilOffset`, `ease`, `stagger`, the fields of `CuePatch`) or a `knob`'s
`value` (a number or `[x, y]`), by SceneWriter, through the film's one
history (the owner's Undo and the `undo` command step it). It answers
`LabWrite`: the change, the file, the cue's span and where it resolves (or
why it does not), or the knob read back, and `film check --static` run after
it. A scene that is not located, a value the lab will not rewrite (computed,
not a literal; a literal other scenes share) and a cue timing the scene's
timeline would not resolve with are refused, with the reason.
A cue write is judged, and answered with the cue resolved on its scene's
clock, as the film's files now declare it with the new spans in place, and
the write applied, as the file will hold it (`writtenPatch`: every number to
the millisecond, the writer's one rounding), to the cue's own span where its source computes part of it
(`until: MARK`, which no literal says)
(`film read cue <film> <scene> <cue> --spans <json> --patch <json>`, one fresh process,
before the file is touched): a line that moved or renamed a mark while the
lab runs moves the cue's answer and its judgement too. The lab's handlers run
with `LabContext` (`lab.ts`), which holds no `FilmRepo`, `SoundLibrary` or
`Mixer`, and SceneWriter's and SceneSources' layers are built on
none (`lab-context.types.ts`). No module the lab runs imports a film's module
by a function either (`importFilmModule`, `libraryModule`, a computed
`import()`): `lab.test.ts` follows `lab.ts`'s imports and fails on one.

A talk's write is judged by the cut before the file is touched (a section
left playing nothing, a strike over a marked word, a mark on a struck word,
a mark name the talk would drop: refused in the server's words, nothing
written). A write splices the one literal and
keeps the author's layout and comments, each by the key it is about, by the
formatter's own rule of whose a comment is: a key's comments are those above
it and those after it on its line. A write moves keys whole: a key added goes
between two keys and their comments, never inside (on a line of its own in a
section written over lines), and a key taken away goes with its own comments
and leaves every other (a Restore that empties a cut takes the comment about
the cut). A cut whose runs hold a comment is refused a rewrite of them, and
the server refuses any write that would move a comment off its key, so a
Restore gives back the text its Cut found, as a property over generated
sections, oxfmt-formatted, proves. Three layouts come back as the formatter
lays them out, and only Undo gives back their text: the break after a
section's `{` that oxfmt keeps once a cut of two runs broke it is let go by
the write that leaves the cut one run (a section its author broke there alone
comes back on one line), a one-line section a Cut pushes past the print width
stays broken, and a cut a Restore emptied comes back after `to`, without the
comments it had (`tools/talk-source.ts`). A mark is named from its word as the talk
keeps it (`MarkName`: `Café` is `cafe`).

**SceneSources** (`scene-sources.ts`) finds each scene's drawing by identity,
not by name: the parser (oxc) lists every exported `drawing({...})` call in
the film's folder, the film's registry (`scenes/index.ts`) is imported, and a
scene belongs to the call whose exported `timeline` or `knobs` is the very
object the scene reads. A renamed registry entry or two files exporting the
same name cannot point a scene at the wrong literal; a scene built without a
literal (a spread, a function) is reported as not located, with the reason.
The lab locates in a fresh process (`film read sites <film>`, `locateHere` in
`read-cli.ts`), kept while the film's source stamp stands, so a scene added
or made to share a drawing while the lab runs is located as the files now
say; a CLI command, a process of its own, locates in itself
(`scenesLocatedHere`).

**SceneWriter** (`scene-writer.ts`, splices in `scene-source.ts`) re-reads the
file, replaces only the value's text (missing timing fields are added after
the fields before them), formats the new text with `oxfmt` and
reads the value back from it, all before the file is touched; then
`SourceWriter` writes it whole, only if the file is still the text the edit
was made from (`SourceChanged` otherwise). If oxfmt fails or the value does
not read back, the write fails (`FormatFailed`, `WriteUnverified`) and the file
is as it was. It refuses what
it cannot prove is a literal (`SourceRefused`: `GAP * 2`, a spread, a
computed key, a shorthand) and names it. Literal `until` objects (`{ cue }`,
`{ cue, edge }`, `{ at }`) are editable ends: a `dur` written replaces the
whole `until` property (and its `untilOffset`), keeping the rest of the scene
intact; a right-edge edit writes `untilOffset` after the `until` and keeps it.
An `untilOffset` of 0, or a new `until` without one, takes the key away; one
asked of a cue that runs no `until`, or one in code that would be taken away,
is `SourceRefused`. Their members must be literal and unique, and decode against `Until`; a
computed member, spread, duplicate key or conflicting anchor is refused.
A cue write is also refused
(`TimelineUnresolved`) when the scene's timeline, read back from the new text,
does not resolve on the clock the film's files give now (the fresh `film read
cue --spans` above): an `until` cue's offset typed past its point, or a point
moved since, would end it before it starts. A film that does not load in that run is not the write's to judge:
it lands, and answers why the cue could not be resolved. Writes run one at a time and are
uninterruptible (the reload a write causes drops its request); their undo and
redo are `SourceWriter`'s (below, "How a pick lands").

**The check after a write** is `FreshFilm.check(film, 'static')`
(`fresh-film.ts`): `film check <film> --static --allow-stale --json` in a new
process (this one imported the scene modules at start), its findings each
with its address (`FindingAddress`: the `part` it is about, an `Address`,
the film's when it is about the whole, an act's for a colour script, a
short's for a short; and the film second it starts at, when it has one),
which the lab answers with the write. A film that does not lay out (a cue on a mark its line
lacks, a cycle, a duplicate mark) or a part the check names that it lacks
is the one finding the check reports, at its scene (`laidOut` in
`film-check.ts`), not a failed run. The static leg never mixes or opens a
browser. A film that does not load prints its failure as the one error
finding, in its own words (`FilmModuleInvalid`: `film "…": sound.ts is
invalid: …`; `answeringCheck`), as `film read voice` and `film read cue`
answer it as `ServerFailed` (`answering`). A check that does not run
otherwise (a line that does not decode, a crash, 30 s gone) is itself one
error finding, `FreshProcessFailed`, in its words.

### Commands and keys

Every action a page offers past its at-rest buttons is a **command**
(`src/command/command.ts`): an `id`, a `label` (or `labelIn` the context), a
`group`, a typed `when` over the **context** and a `run` that answers an
`Effect<Receipt>`. A command that is not available is not shown: no dimmed
rows. Each command names its keys (`keys`, `keysIn` the focus scopes it
answers in: `page`, `field`, `studio`, `slider`; a focused button or link,
`control`, hears the page's), whether a key is `stepped` (Shift
coarse, Alt fine), and its `touch` path, so every key has a way in on a
phone. The context (`src/command/context.ts`) is the page, its URL's
selection (`selectionOf`: one `Selection` union over the places' query keys,
`src/command/selection.ts`), what has focus, and what each section adds
(`refine`: the player's `playing`).

One **hub** per page (`makeHub`, `src/command/hub.ts`, built at each page's
root: a film's studio, `lab/studio-frame.tsx`, and the review) holds the
registry, the context and the **keymap**, and listens once through `Keys`
(`browser/keys.ts`). A press already handled, or inside an IME composition,
is never read. The press's focus picks the scopes: a field (an input, a
select, a player, an open dialog or menu) reads only commands that answer
there, the recorder reads its own keys first and owns them (a recorder key
never reaches the page; the page's others still run from it), a slider (a
wipe's grip, `role="slider"`) reads its own arrows, Home and End first and
owns them, then the page's, and anywhere else is the page. A part that
stands where the page's listener does not hear (the recorder's dialog,
which stops the arrows) hears its own presses (`Hub.listenWithin`). The
last available command bound to a chord runs; a key with no available
command passes to the browser (⌘Z with nothing to undo). Chords are written
`mod+shift+z` (`mod` is ⌘ on a Mac, Ctrl elsewhere); a letter is read by its
key in any case, Alt+letter by its physical key, and a symbol by the
character it types, so `?` and `]` work on any layout. A command's keys are
the ones it declares, the same for every viewer: nothing rebinds them.

Every page in the studio's shell (a film's studio through
`lab/studio-frame.tsx`, and the review) hosts three generated surfaces
(`src/lab/command/`): the **command menu** (⌘K) lists the commands
available here, filtered by every word typed, with their keys; the keys
**sheet** (`?`) lists every command by group with its keys and its touch
path; the **context menu** (`TargetMenu`, one per page) opens
on a right-click, or a touch held still for half a second, on a thing the
page marks as a `Target` (a beat's clip, a Board panel's, a note, a folder's,
set's, version's or film's card, a film's links, a choice, a variant): its commands about that thing (a command's `about`, in
`src/command/target.ts`: the kinds of thing whose menu shows it), the
thing's own first, then Copy link and the command menu, which every menu
has. The page itself is a target too: a press on no thing opens the page's
commands (`about: ['Page']`: Undo, Redo, Note on this frame, the transport's
frame and scene steps). A stepped command also has a
`×10` row, a finger's Shift (`steppedRows`); ⌘K and the keys keep the one
row. A touch that moves past @bible/ui's threshold first (a scrub, a drag) never
opens it, and starts the drag instead (one owner per press, `claimPress`);
a touch the menu took first is the menu's to its end: no drag starts
under it, and its release completes none (`liftHeldByOther`), so a finger
that slides after the menu opens draws no ink and carries no clip;
a field keeps the browser's own menu. The menus' rows
(and a chip's) are keyed by their command (`rowKey`, `src/command/menu.ts`):
they are made again whenever what they read moves (a command's `when` and
its label read the player, so each frame a film plays), and a row keeps its
element, so a press and its release on it are one click. Every page has
**Copy link** (⇧⌘C, `src/command/link.ts`): the page's URL (its place,
its selection, its time), or from a thing's menu that thing's citation
(`citeOf`), written whole through the host's `Clipboard`. A choice's card
cites its Choices link (`?point=`); an act and the film cite the film's
studio, and a scene the studio with its beat selected (`?sel=beat:<id>`),
read back by the one reader the page reads them with too (`selectionOf`); a
thing cited from its own page (another version of the set, the film's
studio) keeps how the page shows it and when. Their rules
(`src/lab/command/style.ts`) read the studio's tokens (`player/tokens.css`)
directly; `COMMAND_TOKENS` names only what no studio token holds: the
paddings and heights the surfaces compose, and their own widths, heights and
layer. The film's studio is the shell's too (`lab/studio-frame.tsx`), so
`?` is the keys sheet on every page, the one place the keys are listed: every command a key is bound to, one
found only by typing too. On a page whose player bar has stripes and
ticks, the `?` sheet ends on what they mean (`BAR_LEGEND`). No page keeps a
line of key hints at rest: the keys are the `?` sheet's, each with its
touch path.

**Go to** (`src/command/go.ts`): every place a page can go to by its
name is a command found only by typing (`typed`): ⌘K lists it once a word
is typed, the `?` sheet never, and a context menu only when the command is
`about` the thing it opened on (a point's marks, below). `/` opens ⌘K from the
page (a field keeps it for typing). On the review the places are the
folders (by title and ref), the sets (`Onset in Roofs at dusk`) and each
film's choices. A page registers its places while they
hold (`registerWhile`, `src/lab/command/changes.ts`).

On the review's pages the **inspector** is a sheet beside the page
(`src/lab/review/inspector.tsx`, on /ui's Sheet: the page stays live
under it, making room on a wide screen; swiped away, a swipe being the
sheet's own scroll (a finger, a trackpad), or closed with Escape)
for the selected variant, set version, act or film, one at a time: its Info
(every line of what it is; a version's file and notes), Approve and
Unapprove, what was said of it and the one comment box, whose unsent text
is kept per thing while the page lives. A page keeps the open one in its URL
(`useInspectorPlace`: Choices' and a set's `?inspect=`), so a link, Back
and Forward open and close it; on a phone it is a bottom sheet, its grip
lowering it to a peek. A row keeps at rest only what most
visits use: a variant's name, state, first line, Pick and the speaker, Approve on the
picked one (and on a scene's render, the project's goal), and a dot counting
its comments; the rest is one step away. Each thing registers itself while
it is shown (`src/lab/review/things.ts`), and its verbs are the page's
commands: Inspect (`i`) and Comment on (`m`) open the inspector, Approve
(`a`), Unapprove, Reject (`x`) and Unkeep (`u`) say what its buttons say,
and an act's or the film's approve of its current scenes is in its menu and
⌘K with no key. A tap on a thing's name or its comment dot opens it too. A
key reads the thing the keyboard's focus is in (`withFocused`, after the
URL's selection of its kind). On a stack (`src/lab/review/hear.ts`) `1`…`9` hear
option n, as its speaker does, while the view can play it. A stack's option says over
`POST /api/review/sets/<folder>/<point>/say`, its answer shown in
place. Its receipt says what the catalogue answers it gave or took
(`SetSaid`): an approve of a version approved already since says so and
offers no Undo, and an Undo whose approval was withdrawn since says
nothing was left to undo.

A **receipt** is one toast (`Receipts`, `src/lab/command/receipts.tsx`, on
@bible/ui's Toast) over every page in the shell, in place of a status
line (the studio's edits and notes, the choices' writes, a version's says,
the sound check while it runs). The hub hears every
receipt (`hub.receipts`) in its slot: a command's own id when it runs
(`hub.invoke`), or a page's slot when a write says one (`hub.announce`:
`studio-edit` and `studio-note` on a film's studio, `film`, `set`,
`production` and `sound-check` on the review). A slot shows one toast,
replaced in place: `busy` (`Moving two…`, `Filing the note…`) while its
write is out, then what it did, said once the write lands and never before
(`Moved two before one.`, `Picked piano · Score: strings → piano`,
`Rain: -12 → -6 dB`), or why it was refused. A receipt that can be undone
carries the command that undoes it as its button: Undo for a write, Redo
for an Undo, Undo for a Redo, bound to the change its write made (`Bound`:
the film, and the change by the id the lab's history gives it,
`HistoryStep.change`; an approve's, by its run's op and the scenes it gave
one to, `Project.gave`); a filed note's receipt carries Withdraw, bound to
the note. Each kind of id is its own
brand (`ChangeId`, `RequestId`, `OpId`), made by `uniqueId(<brand>)` or
decoded where it arrives, so a target's words, a time or another kind's id
in its place is a type error (`lab/identity.types.ts`). A bound receipt's button acts
on that change alone: its command says whether it can (`Command.fits`;
Undo and Redo through `stepWhyNot`) and sends the change's id with the step
(`{change}`), which the lab steps only while it is the newest that way,
else refuses (`StepNotNewest`, 409). A command with no `fits` acts on no
single change, so a bound receipt never runs it. There is no unbound Undo
(`said` takes an `Undoing`, the command with its change): a write that
made no change (a value already so, whose answer names no change) says so
and offers none, since a step that names no change steps whatever is
newest, an earlier write's or another film's. Undo and Redo by key name
the change at the top of the history the page last read, so a change
another client made since (a voice pick, an agent's edit) is refused
(`StepNotNewest`) rather than stepped in its place. A done receipt
shows 5 s, a refusal 10 s, a busy one until replaced. The receipts showing
as a page hides are kept in the tab (`film-receipts` in `TabStore`, for
the same page: the studio's film, or the review, whose receipts follow it
from film to film) and shown again once it has loaded. A receipt's Undo
pressed when it cannot act says why and is held: its command not available
(`Undo is not available now`), another film's change (`that was a change to
toy: open toy to undo it`), a newer change before it (undo that first), or
the change undone already and nothing else to undo (`it is undone
already`). Still offered and never expiring, it says again what it did once
it can act, unless a receipt in its slot supersedes it. One that never can
act is retired instead (`Command.fits` answers `Unfit.Never`, where a held
one is `Unfit.Now`): when the history the page has read has nothing to step
that way and the change is not the other way's newest, the lab no longer
has it (its history is in memory, so a lab restart loses it). The receipt
then says `the lab no longer has that change to undo: it was undone
already, or the lab restarted since`, loses its Undo and goes as a refusal
goes; a held receipt is retired the same way once the page reads such a
history. On the choices page, Undo and Redo are commands
(`review.undo` ⌘Z, `review.redo` ⇧⌘Z, in ⌘K, the `?` sheet and the page's
long-press menu, named for what they would undo: `Undo score play brass`),
shown only while there is a step to take. A say's receipt has no Undo (it
writes the catalogue, not the source), except an approve of a set's
version: its Undo (`project.undo-approve`, one
owner, `lab/review/options/receipt.ts` `undoApprove`) withdraws exactly the approvals it gave
(`Project.gave`, `Withdraw { given }`) and says what it took
(`Project.took`).

`.oxlintrc.json` refuses a raw `keydown`, `keyup`, `keypress` or
`contextmenu` listener (`film/keys-through-keymap`) outside the adapters and
`src/lab/command/`: a key is a binding in the hub. It also refuses a title
written with a key in brackets, and a read of the keymap (`keysOf`) outside
its followers (`film/keys-named-as-bound`): a title names its key as bound
now, through `hubKeys` in Solid,
so a command registered after the control reads with its key, as the
viewer's keyboard writes it.

**Terms**, as editing software uses them:

- **Header**: on Films and the review's pages, the
  shell's one row (`lab/page-shell.tsx`): the Films link (⇧1), the film
  switcher (a pick opens that film's studio), the Studio link (⇧2, the
  film's studio, `.sh-studio`; on a phone the film menu's Open the studio,
  the header having no room), the page's name (`.sh-page`; none
  on Films), the drill-down crumb, the tools, the timecode, Go to and the
  view menu. On a film's studio, the studio's own (44 px,
  `lab/film-studio/parts.tsx`): the Films link (⇧1, `.st-home`), the film,
  the version chip, the stage and, on the right, what waits and what the
  agents do now; its timecode is the transport's. Every move between pages
  is a header link, the film switcher, an inspector row or a command that
  lands on a page.
- **Project manager**: the studio's home, Films (`/`), named for Resolve's:
  a card per film (the stills of its renders' folder, its name; a tap opens
  its studio, a long press Open in the Studio, `filmCommands`), then the
  review's folders (Sets, Renders). A film a production makes shows once, as
  its production's card (**Production** below).
- **Timecode**: a time written `HH:MM:SS:FF`, hours, minutes, seconds and
  frames (`timecode`, `core/time.ts`; 30 fps, or a video's own rate: a
  1000/1001 rate such as 29.97 counts its whole rate's frames a second,
  non-drop-frame (NDF), and a rate that is neither, such as 12.5, counts
  the frame within its wall second), in a monospaced face so the
  digits never shift. The review shows its times this way: the header's
  (a tap copies the link to that frame), a note's or a finding's time. The
  film's studio writes its transport's `M:SS.t` (**The film's studio**,
  above). A `#t=` in a link stays in seconds, as does
  a finding's message, the sentence `film check` prints too.
- **Transport**: the play, pause, frame and beat controls, and their keys
  (Space, ←/→ a frame; `player/transport.ts`, and the studio's own in
  `lab/film-studio/context.tsx`). It belongs to the picture it drives,
  never to the header; on a phone the review's docks over the safe area
  (`.sh-dock`), where the thumb is.
- **Inspector**: the panel that shows the selected thing and what can be
  done with it: in a film's studio the beat's pane beside the viewer, a
  section a stage; on the review a sheet beside the page with its Info, its
  approval and its comments.
- **Command menu**: the searchable list of every available command (⌘K).
- **View menu**: the header's `⋯`, after Go to… on every page: the page's
  `View` commands available now (captions, quality, findings, a filter,
  Refresh), then Keyboard shortcuts (`lab/command/view-menu.tsx`).
- **Context menu**: the commands for what is under the pointer, opened by a
  right-click or a touch long-press.
- **Sheet**: a panel over the page that holds a surface, not one fixed in
  the layout: the review's inspector and a phone's recorder, on /ui's
  Sheet, swiped away or closed with Escape; the keys sheet, a Dialog,
  closed with Escape.
- **Receipt**: what a command answers when it runs: what moved, before →
  after, and Undo where it can be undone.

### The HTTP API

The lab's routes (the review's among them) are declared once, as one Effect
`HttpApi`, in `core/api.ts`: every path, its params, query, body and answer, and every
failure with its status. Both ends derive from that declaration: the
server's handlers (`HttpApiBuilder.group` in `tools/lab.ts`, `studio.ts`,
`steps-http.ts`, `edits-http.ts`, `review-http.ts`, `choices-http.ts`, `project-http.ts`)
and the pages' one client (`LabClient`, an `HttpApiClient` of `LabHttpApi`
in `lab/api.ts`, which `lab/studio/api.ts`, `lab/review/api.ts` and
`lab/review/options/api.ts` call through) with the URLs a page puts
in an `<img>` or `<audio>` (`stillUrl`, `attemptUrl`, `reviewFileUrl`,
`reviewPhoneUrl`, `reviewFrameUrl`, from
`urlBuilder`).

| API          | Served by                 | Groups                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LabHttpApi` | `film lab` (`labHandler`) | `notes`, `scenes` (code), `steps` (undo, redo, check, steps), `edits` (move, hold, undo, redo), `talk` (words, cut, restore, mark), `script` (beats), `studio`, `review` (index, file, phone, frame, duration, say), `choices`, `project`, `looks` (take), `page` (wait: the build counter) |

**A HEAD of a GET route** answers as the GET does, with its status and
headers and no body.

**Failures cross as themselves.** A failure a route answers is one of
`Refusals` (`core/api.ts`; the classes are `core/refusals.ts` and
`core/errors.ts`), each annotated with its status (`HttpApiSchema.status`):
the one status table (`statusOf` reads it). It crosses as its JSON with its
`_tag` (`{"_tag":"SourceRefused","file":…,"target":…,"reason":…}`), and the
page's client decodes it into the same class, so its `message` reads the
same on both ends. Existing failure fields remain wire contracts:
`TakeMismatch.heard` is the transcript, `SttUntimed.heard` the transcript's
word count, and `BeatUnplaced.heard` the fraction of a beat's words matched.
Changing their keys requires a compatible codec or a coordinated migration.
A handler's failure that is not a Refusal answers 500 as
`ServerFailed` (its tag and words), logged `api.request.failed`; a param, a
query or a body that does not decode is a 400 `RequestInvalid` naming the
part and the schema's words (`{"_tag":"RequestInvalid","part":"Payload",
"reason":"Expected \"pick\" | \"unpick\" | \"reject\" at [\"verb\"]"}`),
answered by the gate (HttpApi itself would answer an empty 400); an answer
that does not encode (a handler's value its schema refuses) is the server's
failure, a 500 `ServerFailed` tagged `AnswerUnencoded`; a path under
the API's own prefixes that no route declares is a 404 `RouteUnknown` naming
the path, so a page calling an endpoint the server does not have reads a
refusal, not "no answer". A refusal names a film's file relative to the film's
folder (`scenes/hand.ts`), never a path on the box. On the page a call
fails with `LabFailure`: the server's Refusal, or `LabUnreachable` (no
answer, or one that does not decode).

**One gate.** `serveApi` (`tools/api-server.ts`) composes an API's routes
behind one global middleware, the only place a request is admitted
(`admit`): the Host must be the listener's own name or a loopback one at
its port, a browser's `Sec-Fetch-Site`
same-origin or none, a write's Origin none (a tool) or `http://` one of those hosts, with a JSON body
when it carries one (a POST always: a form or a no-cors fetch posts one with no
preflight; `WriteNotJson`, 415) of at most `STUDIO_MAX_BODY` bytes, counted as it
streams (`BodyTooLarge`, 413). A DELETE, PUT, PATCH or OPTIONS with no body
meets the Host, `Sec-Fetch-Site` and Origin checks alone, with no body to judge,
as an MCP client's session end does (`carriesBody`). Anything else is a 403 `RequestRefused`,
logged `api.request.refused`. A new route is behind the gate by being a
route; every route answers a foreign Host 403 (`lab.test.ts` walks
`routesOf(LabHttpApi)`). Every film route names
its film, one of the app's films (`filmNamed`), and any other name is a 404
`FilmUnknown` before a handler reads a thing. The pages (`LabPage`) answer
every path outside the API's own prefix (`/api/`), behind the same gate, to a
GET or HEAD only (any other method is a 405, `Allow: GET, HEAD`). One
cross-site request passes: a link opened on another site (a GET or HEAD with
`Sec-Fetch-Mode: navigate` and `Sec-Fetch-Dest: document`) to a path of the
page table or an old link to one (`legacyPlace`); never the API, a script or a file. A fixture's own routes beside the API's
(`labHandler`'s `beside`: the studio harness's control) sit behind the same
gate. A page rendered on the server (`PageRenderer`, a worker per build)
reads the API through the server's own handler on the page's connection
(`PageReads`), so the gate admits its reads as it admitted the page.

**To add an endpoint:**

1. Declare it in its group in `core/api.ts` with `HttpApiEndpoint.get` or
   `.post(name, path, { params, query, payload, success, error: Refusals })`.
   A write takes a JSON `payload` (`NoBody` when it says nothing). A new
   failure class goes in `core/refusals.ts` and into `Refusals` with its
   status. A new group is `HttpApiGroup.make(name).add(…)`, added to
   `LabHttpApi`.
2. Handle it in the group's `HttpApiBuilder.group(api, name, …)` in tools:
   `.handle(name, ({ params, query, payload, request }) =>
   answered(Effect.gen(…)))`, naming the film with `filmNamed(params.film)` (`tools/film-repo.ts`).
   Return the success value (the API encodes it), or an
   `HttpServerResponse` for a file (`serveFile` answers byte ranges). A new
   group's layer joins `labHandler`, and a service its handlers need joins
   `LabContext` (`tools/lab.ts`), its layer built in the composition root
   (`tools/film-services.ts`), which the CLI and the studio harness share.
3. Call it from the page through the derived client
   (`client.<group>.<name>({ params, payload })`, wrapped in `called` for
   `LabFailure`), or put its URL in an element through `urlBuilder`.
4. The foreign-Host test covers it by itself; add a test of what it answers.

For example, the review's project routes (`GET /api/films/<film>/project?variant=`
and `POST /api/films/<film>/project/say` `{address, say, variant?}`, each
answering a `ProjectView`: the fresh `Project`, the project folder's ref and
the video this checkout's catalogue records for each rendered scene) are one
group: `ProjectGroup`
in `core/api.ts`, added to `LabHttpApi` (its paths, under a film's
`/api/films/<film>/`, fall under the API's prefix by themselves). The address is a `PartAddress` (the
film, an act, scenes: a short is no branch of the tree, so it does not
decode, 400). `projectGroup` (`tools/project-http.ts`) runs `film project …
--json` in a fresh process (`FreshFilm.project`) and decodes its `Project`,
or its refusal into the refusal's own class and status; any other failure
the run names (a film that does not load) it prints as `ServerFailed`, its
tag and words, which the page shows as one sentence (`answering`, as
`film options` does). A say (`Say`:
`Approve`, `Withdraw`, `Comment {text}`) runs `project approve`, `withdraw`
or `comment` once; a comment's text goes after `--`, so one starting with a
dash is never a flag. Its layer
joins the `Layer.mergeAll` in `labHandler`, and the page calls
`client.project.<name>` (`lab/review/options/api.ts`).

### Script

The studio's Words section reads a film's script beside its staged film. What the film
plays (each beat's line, its words and their times, its marks and cues) is
the staged film's; the reader lays each line out with its `{mark}`s kept by
the word each stands before (`lineRows`, `lab/words/line.ts`), drawing no
chip for them at rest, and the code view's band sets the line with a chip at
each (`piecesOf`). What it leaves out (`scenesOf` drops each beat's
`picture` and `cite`) the page reads from the script as it stands, through a
fresh process (`film read script <film>`, `FreshFilm.script`) kept under the
film's source stamp, so a brief fixed while the lab is open is read again
once.

| Route                                      | What it does                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/films/<film>/script`             | `ScriptBeats`: each beat of `script.ts` in order, its `picture` (when it has one) and its `cite`; none for no script                                                                                                                                                                                                                                                                                                        |
| `GET /api/films/<film>/script/voice`       | `ScriptVoice`: each spoken beat's staging take in the voice and marks it has now (`Ready` with its words' times, `Voicing`, `Unvoiced`, `Refused`), and the day's spend against its cap                                                                                                                                                                                                                                     |
| `GET /api/films/<film>/script/takes/:file` | a staging take's audio, by the name `Ready` gives it (immutable: named by its request's key); any other name a 404                                                                                                                                                                                                                                                                                                          |
| `POST /api/films/<film>/script/marks`      | `MarksPost` (`{ beat, marks, read: { spoken, marks } }`): the beat's delivery marks rewritten in its `say` as one write of `script.ts` (`LabWrite`), its words unchanged; `read` is the line as the page read it, words and marks, and a write whose line says other words or carries other marks now (marked elsewhere), a mark that does not fit, or a post with no `read` (a tab older than the lab: reload it) is a 422 |

Every spoken beat's staging take is kept ready (`tools/script-voice.ts`) in a lab started with `FILM_STAGING_FILL=true`, the owner's (off by default: the fill spends ElevenLabs characters, so a spare lab spends none). That lab voices each beat the staging cache keeps no take for, the films a reader has open first, two at a time, each charged against the day's cap (`FILM_STAGING_DAILY_CAP`) before it is sent; with the fill off a beat reads `Unvoiced`. A take that misread its line is read again only once the local day it was made (its record's `at`) has passed, so a restart or a second lab pays no more that day. A fill that dies is logged (`staging.fill.died`) and leaves the lab up. No film's timings or takes are written: `film narrate` makes a cached take the film's own at no cost.

### Series drafts

The app's series drafts (`series/<series>/scripts/<draft>.md`, the folder
`FilmApp.series` names) are read in the same reader beside the films:
`core/draft.ts` reads a draft's beats out of its Markdown (a talk's table, a
film's beat list) and writes a mark back byte for byte, `tools/series-drafts.ts`
(`SeriesDrafts`) lists, reads and marks them, and the review's
`/series/<series>/<draft>` (`lab/review/draft.tsx`) shows one, its staging
voice the film reader's (`lab/script/voice.tsx`, `VoiceOver`).

A new script that is no film's yet goes into an ask the same way: write it
as a series draft first (a Markdown file in the series' `scripts/` folder),
then name it in the ask's `script` block (`{kind: 'script', series, draft}`),
never a `document` of its Markdown nor a set.

| Route                                          | What it does                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/series`                              | `SeriesList`: every series by its folder and its plan's title, each draft by its file and its title; none for an app with no series                                                                                                                   |
| `GET /api/series/<series>/<draft>`             | `DraftRead`: the draft's beats as its Markdown reads now (each line with its marks and cues, its brief, its sources); 404 `DraftUnknown`, 422 `DraftUnread`                                                                                           |
| `GET /api/series/<series>/<draft>/voice`       | `ScriptVoice`: each spoken beat's staging take in the staging voice (`stagingVoice`) and the marks the draft has now, and the day's spend, as a film's                                                                                                |
| `GET /api/series/<series>/<draft>/takes/:file` | a staging take's audio, by the name `Ready` gives it; any other name a 404                                                                                                                                                                            |
| `POST /api/series/<series>/<draft>/marks`      | `MarksPost`: the beat's marks written into its line (refused, as a film's, once the line is not `read`: other words, or other marks) in the Markdown (that cell changed, not another byte; only over the text it was read from), answered `DraftRead` |

The fill voices every draft's spoken beats in the background, as it does
every film's, so a draft opened has its takes ready.

`film drafts` reads every draft as the reader does, through `SeriesDrafts`:
each one's spoken beats, words, marks and time at 155 wpm, or why it does not
read (`DraftsUnread` when any does not). The app's tests run it, so a draft
that stresses a word the Markdown way fails before the lab says so.

### Board

A film's storyboard (`core/board.ts`): the record, `src/films/<film>/board.json`
(committed), and its images in `src/films/<film>/board/` (git-ignored, each
recorded with its sha256). `film board` makes and keeps it from the terminal
(`tools/board-cli.ts`); the studio's inspector (its Board section) reads it
and writes a pick, an approval or a withdrawal through the same store
(`BoardStore`), so neither writes over the other. A note on a panel is a lab
note (`POST /api/films/<film>/notes`) carrying its `panel` and its `sketch`
(an agent's `request_tweak`, the terminal's `film board`).

| Route                                      | What it does                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `GET /api/films/<film>/board`              | `BoardFile`: the style, every panel in film order with its tries and the one kept, the approvals    |
| `GET /api/films/<film>/board/files/<file>` | A board image the record names; 404 `BoardFileUnknown` for one it does not, or not in this checkout |
| `POST /api/films/<film>/board/pick`        | `BoardPick` (panel, try, why): keep that try; 422 `BoardRefused` for a panel or try it lacks        |
| `POST /api/films/<film>/board/approve`     | `{ beat }`: approve the beat's board as it stands; 422 while a picture panel keeps no try           |
| `POST /api/films/<film>/board/withdraw`    | `{ beat }`: withdraw the beat's approval                                                            |

### Timeline

A film's timeline is one read model (`core/film-timeline.ts`, pure:
`timelineOf`), the one the studio page draws and the lab's MCP answers
(`timeline`). It reads one version of the film: the production's open one,
or one asked by number. A version kept in its own folder
(`<film>/v<n>/`, a `script.ts` in it) is read wholly from that folder with
the film's own loaders: its scenes, takes, acts (`acts.ts`), score, shorts
and Board (`FilmRepo.load(film, folder)`, `BoardStore.read(film, folder)`),
the film's voice and palette where it keeps none. The newest version without
a folder is the film's registered files; an older one without a folder is
refused (`FilmVersionUnkept`), and a number past the ledger too
(`FilmVersionUnknown`). Its clock is read fresh (`film read clock <film>
[--folder v<n>]`, `FreshFilm.clock`), kept under the film's source stamp
(`tools/film-timeline.ts`, `FilmTimelines`), so a script or a take changed
while the lab is open is read once after the change.

- **Lanes.** Each stage of the flow with material on the clock is a lane of
  clips: the script's beats, the Board's panels, the takes, the scenes
  drawn, the score's movements, the renders. A panel sits where the
  animatic shows it (`core/animatic.ts`, `shotsOf`, the one rule for
  when a panel shows): a beat's first panel from the beat's start, a later one from its
  mark, each held to the next panel of its beat or the beat's end. A clip
  says its state (made, kept, approved) and its clock: `estimated` while
  its beat has no take (words at the reading pace), `measured` once it has.
  A render records no version, so the catalogue (renders, scene approvals,
  shorts) shows on the registered files alone, and the notes too, timed on
  their clock.
- **The flow.** The nine stages (script, concept, Board, voice, animatic,
  Rive scenes, sound, render, shorts), each `reached`, a `gap` or `ahead`.
  The concept frames keep no record of their own yet, so the concept is
  reached when a decision filed in the version answers an ask that showed
  pictures alone, and a gap otherwise (the script is kept the same way, by
  an ask that showed it). The Next row is the first stage ahead and what
  starts it; when the stage before it is a gap, it names the gap and says
  so (`Board starts from kept concept frames, and none is kept yet`).
- **The stage.** The header's stage is the first, in the flow's order, whose
  "done when" is not met: the script and the concept once a later stage has
  material or a decision keeps them; the Board when every beat is approved;
  the voice when every spoken beat is the owner's take; the animatic and
  the sound once a later stage has material; the scenes when every beat is
  drawn and approved; the render when a render of the film is approved.
- **Bands and markers.** The version's acts are `bands` over the clock. A
  marker (a flag on the page) is something that waits on the owner, at its
  time: an open ask at the first beat its material names, and a note of his
  not yet done.
- **The header.** The stage; what waits on the owner, counted: the asks
  open about the film or its production (less one whose set and choice a
  decision filed since has answered), the notes an agent replied to, and
  the beats the open version's Board holds ready (every picture kept, not
  approved as it stands), whichever version is shown; and the agents'
  "doing now" lines.

The `working` tool says an agent's line (`tools/working.ts`, `Working`): one
line per agent (`by`, which the tool needs) per film, replaced by its next,
cleared when the agent says `done` (no words needed) or after
`WORKING_HELD` (half an hour) of silence. The lab holds the lines in memory
only, so a restart clears them.

The studio page reads the same model over HTTP (`tools/timeline-http.ts`):

| Route                                  | Answers                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/films/<film>/timeline?v=<n>` | `FilmTimeline` at version `n`, else at the production's open version; 404 `FilmVersionUnknown`, `FilmVersionUnkept`, `FilmUnknown` |

### Studio

**The Studio** (`lab/studio/`, Solid 2 + effect-machine) is the film
studio's recorder for the final voiceover, beat by beat. The inspector's
Voice section's Record opens it over the page, a Dialog on a laptop and a
Sheet on a phone (`RecordOver`, `lab/film-studio/inspector.tsx`). It lists
every beat with a
line, each with a dot in its take's state colour and shape (filled, a ring,
half filled; `recorded`, `scratch` for
a staging take, `stale: <why>`: the word in the beat's name and title, the
counts in the list's, the selected beat's under the list), then Record and
the meter over the teleprompter, so R is on a phone's first screen; it
reads the selected beat as a teleprompter (the sheet's lines, a
quotation set apart with who said it, marks stripped), and records it:

- **Capture** (`capture-browser.ts`, behind the `Capture` service in
  `capture.ts`): `getUserMedia` with echo cancelling, noise suppression and
  gain control off, one channel, the microphone picked from ⌘K (`Choose
  microphone: …`, `micCommands`; named in the recorder when it is not the
  default; `enumerateDevices`;
  the choice is remembered in this browser as `film-lab-mic`, a `keptText` in
  `ViewerStore`, `browser/storage.ts`), into an
  [`AudioWorklet`](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) (`worklet.ts`) on an `AudioContext` at the device's own
  rate. The worklet hands each block of float PCM over untouched with its
  peak and RMS (the meter: dBFS, a clip warning at −1 dBFS); the page keeps
  the blocks from the count-in's end and joins them on stop. Nothing is
  resampled or compressed, and there is no MediaRecorder: `wav.ts` encodes
  the PCM as a 24-bit mono WAV at that rate, which is what is posted
  (`audio/wav`). A microphone refused is `MicDenied`, shown in the recorder in
  the owner's words.
- **The recorder** (`machine.ts`) is one machine: `Idle | CountIn | Recording
  | Review | Importing | Checking | Failed` on `SelectBeat | Arm | Tick | CountDone |
  Cancel | Stop | MicLost | Submit | Discard | Imported | Refused |
  ImportUnanswered | AcceptAnyway | KeepAttempt | Retry`. Arm pauses the film and opens the
  microphone; the 3 s count-in is a state timeout; Stop encodes the WAV to
  review (play it back before submitting); Submit posts it as the state's
  task; the answer is the take kept (what was heard, its word error) or the
  server's refusal in its own words. A `TakeMismatch` with the attempt it
  saved offers **Accept anyway** (a guarded transition: `keep` with
  `acceptMismatch`). The status line says how to act on a refusal (Accept
  anyway or Record again after a mismatch, Back to hear what a lost
  microphone kept), each control with its key as bound now (`statusOf`). Each beat's attempts (newest first: heard, word error,
  length, kept, recorded for an earlier line) play from their audio route
  and **Keep** makes one the take.
- **After a take is kept and mixed** the machine asks its page to load
  again (`RecordStage`: the studio's `reloadHere`, `lab/stage.ts`, at the
  frame it shows): the player reads
  the timings and the track once, at load, so the film then plays the new
  take at the same T, back on the same beat (the link keeps it). A mix that
  failed reloads nothing and the status says so. The app serves the
  narration with `Cache-Control: no-cache`, so a reload never plays a take
  the browser cached.
- **Keys**, only while focus is in the recorder's section: R record (and
  retake), Space stop, K submit (or accept anyway), ←/→ the previous or next
  beat (at rest or after a refusal, never mid-take): the `studio.*` commands
  (`studio/commands.ts`), bound in the `studio` scope (Commands and keys,
  above). There those keys are the recorder's own, even with nothing to do
  now: Space never plays and ←/→ never step a frame. The section hears its
  presses itself (`Hub.listenWithin`, `lab/studio/section.tsx`), since the
  dialog it stands in stops the arrow keys before the page would hear them.
  Escape is the dialog's: it asks before it drops a take only this page has
  (Discard, Keep), else hides the recorder. A key with a modifier is another
  chord and passes through, and a focused picker or player keeps its own
  keys.

The provider (`context.tsx`) builds the recorder's own runtime (its stage,
the studio's routes, the capture), so the page knows nothing of it, and
hands the section derived values and actions (`view.ts`: the controls each
state offers with their keys, the status line, the meter, the badges),
never the machine's states. The page it stands on (`RecordPage`) gives it
the beat selected: the recorder's beat follows the studio's selection while
it rests (`Idle`, `Failed`), never mid-take, and a beat it picks (←/→, a tap
in its list) selects that beat in the studio. The recorder is the
inspector's, not the dialog's, so a beat selected or the recorder hidden
never ends a take. `e2e/lab/studio/studio.dom.test.ts` drives the whole
recorder over the real studio page in Chrome with a fake microphone.

**Notes** live in `lab/<film>/notes.json` (`NotesFileJson`) with their stills
in `lab/<film>/stills/` (`FILMS_LAB` moves the root; the app ignores it in
git). The file is the source of truth: the lab server and `film lab notes` both
go through NotesStore, so either works without the other. A note is `{ id,
film, scene, T, local?, frame, cue?: { name, edge }, mark?, range?: { from, to },
box?, ink?, text, status, still, thread, createdAt }`, plus `seq` (the change that made it) and
`changed` (the last change to touch it). `T` and `frame` are film time as
the film was laid out when the note was made; `local` is scene-local time,
how far into `scene` it was made. The film's timeline places a
note at `local` into its scene while the film has that scene (`noteT`,
`core/notes.ts`; held on the scene's last frame if a re-take made it
shorter), so a re-take of an earlier beat does not move a later note off
its frame. `local` is an additive, optional field: notes made before it
have none and read at `T`. `range` (`NoteRange`, scene-local seconds, `to`
after `from`) is the stretch of its scene the note is about, cut to its
scene; additive and optional (a note without one is about its frame). `cue`
is the named-cue edge nearest the note in its scene. A note written on words of a beat's line carries them:
`words?: { beat, from, to, text }` (`NoteWords`: the beat, its first and last
word's index in the line, inclusive, and the words as they read), `kind?:
'note' | 'correction' | 'removal'` (`NoteKind`, what it asks of them; a note
on words without one is a `note`, `kindOf`) and, on a correction, `replace?`
(the words to say instead). All three are additive and optional; the frame's
still is taken where the first word is said. A correction or a removal whose
writer wrote nothing says what it asks (`say “…” for “…”`, `remove “…”`).
None of it writes `script.ts`: the agent reads the ask and edits the script.
Every change takes the file's next `seq`, so `eventsSince(file, n)`
(`core/notes.ts`) returns each new note, reply and resolve past a cursor,
once each (a file reset below the cursor, trashed or restored, replays its
log at its own `seq` and a wait over it answers at once, even when the log is
empty, so an open page and an events follower keep hearing); `wait` polls the file for them (every 200 ms), so it sees a reply
the CLI wrote while the server was waiting. Each change is one
`ContentStore.transact`, as every manifest's is: written whole, one writer at
a time across processes (the operating system's lock on `.notes.json.lock`,
which the kernel lets go the moment its holder's process ends, a crash too,
and which a running holder keeps however long it holds it; a change that
waits past about 5 s fails with `StoreLocked`, and the log says so,
`store.lock.held`). A
note's still is written under the same lock, before the note that names it.

`nearestMoment(placed, T)` (`core/notes.ts`) names the scene at `T` and, in
it, the nearest named-cue edge and `{mark}`; the page computes it from the
layout it draws, so a note carries the cue the viewer saw.

**The browser tests** (`e2e/lab/**/*.dom.test.ts`, and
`e2e/player/` for the render page) open the real
page over a probe film in headless Chrome with the lab API faked
(`lab/fixtures/harness.ts`), or served (`openServed`: the page's server
entry rendered, failing any render that writes a signal or a store, then
hydrated with no mismatch; `e2e/lab/fixtures/served.test.ts` proves a
writing render fails), and the page's clock the test's
(`lab/fixtures/clock.ts`): a count-in, a retry or a loop's playback is moved
on with `page.clock`, not waited out, and `canvas.toBlob` encodes at once
(Chromium's waits for idle time a busy page may not leave, up to 5 s). The
page is a tab (`lab/fixtures/tab.ts`) of the one Chrome Bun.WebView spawns
per test process (`lab/fixtures/browsers.ts`, with `tools/chrome.ts`). A
case's tab is a view lent from a pool and given back when the case ends, so
a case pays for a page load, not for a new renderer process and a cold
compile of the page's script (three to four times the CPU of the load): the
scripts load from one origin for every case (`asset`), so a view's renderer
compiles them once. Every tab is on an origin of its own, so cases share no
storage and no permission; between cases the view waits on an empty page,
its history, scripts for new pages and listeners dropped
(`e2e/lab/fixtures/browsers.dom.test.ts` dirties each and proves the next case
sees none of it). One fake microphone (a 440 Hz tone on input 1) every tab
hears, allowed or refused per tab. A tab opened `coarse` has a phone's pointer
(touch emulation, so `(pointer: coarse)` matches), set in the same
uninterruptible step that lends the view and put back before the view is
given back; a view whose pointer cannot be put back is discarded, never lent
again (`lab/fixtures/lease.ts`, its own test over a fake view); a view
leaves the pool only inside that step, so a case interrupted before it
takes none. A view two fingers were down on at once is retired and closed
when given back: Chrome hears no touch on it after. Every other tab has a mouse's pointer (Blink's fine pointer and
hover, set as Chrome starts: headless Chrome has none, and `(pointer: none)`
would give a desk the phone's density). The
touch-target guard (`e2e/lab/touch-targets.dom.test.ts`, its states in `e2e/lab/studio-states.ts`) opens every studio page
(the Folder with its loose videos among them),
at rest and with what it discloses open (a film's studio, a beat selected,
a panel selected, the inspector's sections, Record over the studio, the
version menu, the context menu, the keys dialog and a receipt with Undo;
Films with its view menu and the command menu's Go to…, a set's comment
counts, rate chip, wipe and diff, an ask, a series draft and a production's
timeline), over a synthetic film (`lab/fixtures/studio-film.ts`), on a phone
(390 × 844, a finger, `--hit` 44 px) and on a laptop (1440 × 900, a mouse,
`--hit` 28 px), and fails naming each control whose usable hit area holds
no `--hit` square. The area is what a tap reaches (`lab/fixtures/touch-targets.ts`:
a 2 px grid of `elementFromPoint` over the control and a margin round it,
so padding and a hit-slop count and a covered part does not; a point is the
control's only when no other control is nearer, so a link inside a label is
the link's, never the label's field's); a layer is
measured within itself. The exceptions are WCAG 2.5.8's: a backing input
nothing of which can be seen or pressed, a link on a line of text, and a
target 24 px or more whose `--hit` circle reaches no neighbour's area
(`e2e/lab/fixtures/touch-targets.dom.test.ts` holds the measure to synthetic
shapes). Every page also fits a phone (`fitsPhone`,
`lab/fixtures/phone-fit.ts`): no sideways scroll, each control inside the
width, its chrome at most a quarter of the height
(`e2e/lab/fixtures/phone-fit.dom.test.ts` holds the measure to synthetic
pages). Every design-language mock wears `tokens.css` and the kit, writes no
token, and sets each space, type size, line height and radius on its scale
(`e2e/design-language/mocks.dom.test.ts`, one case a mock, and planted pages
of each shape; the reader is `e2e/design-language/mock-lengths.ts`
`mockLengths`). The page is read as the browser lays it out and resolves
it, at 390 and 1440 px and each width from 200 to 4000 px its media queries
name (px, em or rem; `min-`, `max-` or a range; a `media` attribute is not
read), on a phone's pointer and a desk's: a red on
either is a red. A variable is read on each element and pseudo-element its
declaration applies to, so the cascade (nesting, `:is()`, a compound, a
media or container query, an alias, a losing declaration) is Chrome's; the
reader shadows each local with a variable of its own, beside it, and never
touches a property the page lays out by. Each selector of a list that gives
or reads a variable is reached on its own (a nested query's declarations
too): one that reaches no element on either pointer (a hover, a
colour-scheme query) is named, never passed unread, and a selector of
kit.css or lab.css is named only when no mock that links the sheet reaches
it. The tab answers the page's requests itself (the
protocol's `Fetch`), types and clicks with native input events, and waits in
the page on its real timers, so a file's cases run at once (`concurrentTestGlob` in `bunfig.toml`), three at a time per
worker (`--max-concurrency=3` in the E2E script: at most eight workers, one
per core on smaller hosts, and a case's timeout counts its own work, not its
siblings'). The E2E runner compiles and minifies each page's script once
per invocation, then workers read those immutable temporary files. The files
are removed after the workers exit; a direct `bun test` builds its own scripts.

**Notes** (`lab/notes/`, Solid 2): the studio files a note through its
inspector's note machine (`lab/film-studio/note-save.ts`: `Idle | Saving |
Saved | Failed`; one save at a time, a refusal coming back in the server's
words), on a beat's words, on a Board panel's try under its marks, or on a
frame drawn on (**The film's studio**, above), its still the frame or the
try with the marks over it. Every mark the studio draws lives on an SVG
layer over the canvas, never on the canvas, so a still, an export frame and
a probe are the film's pixels alone. The feed
(`lab/notes/feed.ts`), the page's live connection to its server:
`Connecting | Live | Lost` on `Synced | Waited | Dropped | Retry | Refresh`;
it reads the notes, then long-polls `/api/films/<film>/notes/wait` past the
cursor, so the list changes the moment the agent replies; a failed read or
wait says so on the page and connects again after 2 s (a state timeout);
a note, reply or resolve made on the page reads the notes at once. (A
scene edited on disk loads the studio again at its place through the lab's
own build counter, `lab/rebuilt.ts`; there is no HMR client.)

`film lab notes --film <film>` (the `notes` command, `notes-mcp.ts`; its
line is `notes-lines.ts`) prints each unresolved note as one line (`--status
all` every note), then `seq=<N>`, the note log's last change:

```
note id=n1 seq=1 status=open scene=hand T=230.38 local=4.12 frame=6911 cue=topple:end mark=hand box=760,560,400x400 replies=0 still=/…/lab/<film>/stills/n1.png text="…"
```

`T=` is film time when the note was made; `local=` (on a note that has it) is
seconds into its scene, which an earlier scene's re-take does not move: the
note's frame now is the scene's `start=` (`film cues <film> <scene>`) plus
`local`. `range=3.20-4.00` (on a note that has one)
is the stretch of its scene the note is about, in the same scene seconds.
`source=scenes/hand.ts:118 line="…"` (on a note about a line of its scene's
file) is the line of the scene's file the note is about, with its
text as it stood, so the line is found after the file moves.
`words=cold:3-4 said="a courtroom." kind=correction replace="a court of law."`
(on a note written on words of a beat's line) names the beat, its words' first
and last index in the line, the words as they read, what the note asks of
them, and a correction's words to say instead.

A note made, replied to, done or withdrawn arrives as an event (`note.added`,
`tweak.requested` for a note on a Board panel that asks for a new try,
`note.replied`, `note.resolved`, `note.withdrawn`) on `film lab events --follow --film <film> --name notes`: run it under a Claude Code Monitor and each arrives as a
notification ("The lab's events", below). `film lab reply --film <film> --note <id>
--text "…" [--still file.png]` answers as the agent (the still is copied to
`stills/<id>.r<seq>.png` and the note becomes `replied`); `film lab resolve
--film <film> --note <id>` closes it. An unknown id fails with `NoteNotFound`,
listing the film's notes.

### The look-book, light and chapters

**The look-book** (`player/lookbook-sheet.ts`) is one sheet of the whole film:
the palette (`createFilm({ palette })`) as swatches, then per scene a row of
stills at every cue's start and end and its 60% point (`sceneMoments`, the
moments `film check` samples, less the marks), each labelled with the cue
and timecode. Its stills come from the one source of stills
(`player/stills.ts`), and
`film lookbook <film> [--captions] [--variant v]` asks one export page for the
same sheet (`ExportHandle.lookbook`, `RenderJob.LookBook`), writes
`out/<film>/film/<variant>/lookbook.jpg` and records it in the catalogue. A sheet
laid out past Chromium's largest canvas side (32,767 px) is drawn scaled down
to fit it. It is the first page to read for a new film
and the consistency reference while its scenes are built. The command then
runs the look pass (below) and prints one line per scene (held share and
longest held run, largest face, mean luma, dark share, saturation and top
five colours), one per declared act against its target, and one for the
film.

**Light.** A scene brings its act's light into band with `light` on its
drawing (`scenesOf` lights a scene whose drawing brings none by the film's
`light(id)`, its act's), not by repainting its page: `{ color, edge?, amount? }` multiplies
the page and all drawn on it by `color` over the middle of the frame,
falling to `edge` at the corners (a pool keeps the subject lit while the
page around it dims), at `amount`. A function `(f) => Light` reads it each
frame, so dusk can deepen or dawn come up on a cue. It is laid per sheet,
before the vignette and grain, so a fade between two scenes crosses their
lights; each `color`/`edge` pair is drawn once and kept (the last
`SHEETS_KEPT`, so a light whose colour moves every frame never grows the
page), and it never reaches the probe (light is no ink). Outside a
transition a fixed light and the vignette go on as one multiply by their
product (`makeProduct`, kept by colour, edge and amount); a light read per
frame and the vignette go on in turn. A light's `vignette` is the share of
the film's vignette its scene takes (1 when it names none; 0 for a look whose
medium has none, a print), and a transition eases from the outgoing scene's
share to the incoming one's (a pan gives each side its own), as it does out
of a card, which takes none.

**Chapters.** An act of the film's `look` that names a `chapter` (the
narrator's question, in the viewer's words) starts a YouTube chapter at its
first scene. `film chapters <film>` prints them, `mm:ss title` a line, and a
whole-film `render` writes them beside the video as `main.chapters.txt`.
Fewer than three, a first past 00:00, or one under 10 s fail with
`ChaptersInvalid` (a render logs the reason and writes none). The whole film
also gets `main.description.txt`, the video's description: its chapters, then
one "Sound:" line, then a line for each CC BY recording it places, its pages
linked (`videoDescription`); none when it has neither.

### The lab's commands: `film lab <command>`

Every action an agent or a terminal takes on the lab is one command, defined
once (`labCommand`, `tools/lab-command.ts`: an Effect `Tool`, its parameters,
success and failure schemas, and the effect it runs), and both transports are
made from the one list (`tools/lab-commands.ts`): the lab's MCP serves each as
a tool (`tools/lab-mcp.ts`), and `film lab <command>` (`tools/lab-cli.ts`) as
a subcommand with a flag for each field of its parameters, by the field's own
name, read from the JSON Schema the tool is listed by: a word, a number, a
switch, a repeated flag for a list (`--at mark:a --at 2.5`; numbers also
comma-separated, `--crop 0,0,400,300`), and JSON text for the rest
(`--blocks '[…]'`, `--levels '{"ground":"light"}'`). `--input '<json>'` gives
the whole input as one object, a flag beside it winning; `--json` prints the
answer as its success schema encodes it, one line, and without it the
command's plain lines. The input is read by the command's own parameters on
both transports, so a terminal is refused in the words an MCP client is
(`Invalid parameters for tool '<name>': …`, or the command's refusal).
In `apps/animations`, `bun run lab <command>` runs it; `look`, `match`,
`critique`, `journal` and `notes` have scripts of their own.

Where a terminal runs a command follows from what it needs, and the types
hold it there:

| Where      | Commands                                                                                                                                                                                                                                           | Why                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| here       | `notes` `board` `reply` `resolve` `request_tweak` `keep_try` `approve_beat` `withdraw_beat` `catalogue` `sets` `set` `publish_set` `record_render` `ask_read` `asks` `close_ask` `decide` `note` `forward` `check` `cues` `journal` `journal_note` | over the lab's files alone, through the stores the lab writes through; each write holds its file's lock across processes (`ContentStore`), so no lab need run                                   |
| in the lab | `overview` `changes` `ask` `timeline` `working` `beat_move` `beat_hold` `tweak` `undo` `look` `match` `critique`                                                                                                                                   | over what only the running lab holds: its change feed, the agents' lines, the film's one history of edits, the asks' page lock (held in memory), the easel's warm page and the critic beside it |

An in-lab command is the lab MCP's own tool asked at `FILM_LAB_URL` (else
`http://127.0.0.1:8229/`, `tools/lab-client.ts`): its input checked here
first, its structured answer read back by the command's success schema, so a
lab that answers another shape is refused (`LabAnswerUnread`) rather than
misread. The test `tools/lab-command.test.ts` holds the two transports to one
set: every tool the lab lists is a `film lab` subcommand with the same fields
and the same required ones.

### The lab's events: `film lab events` and MCP Events

What happens in the lab is one catalogue of events (`LAB_EVENTS`,
`core/lab-events.ts`: 25 names, `note.added` to `source.redone`), each
with one payload (`LabChange`: what it is about, its words, a one-line
summary, its links, and `read`, the lab command that reads its whole record),
read off the lab's files by its change feed (`tools/lab-events.ts`). A change
to a film's source (`source.written`, `source.undone`, `source.redone`: a beat
moved, a hold trimmed, a cue or a knob set, a pick written or a take kept, in
the studio or by an agent, and each undo and redo)
is read off the lab's writer (`SourceWriter.landings`), which the page and the
agents write through alike. `changes` reads the feed by the catalogue (`name`,
globs over its names or the name of a record, which names every event that
record tells: `notes`, `board`, `catalogue`, `set`, `ask`, `production`,
`source`; `film`). The records tell: `notes` the `note.*` events and
`tweak.requested`; `board` `board.tried`, `board.kept`, `beat.approved` and
`beat.withdrawn`; `catalogue` the `render.*` events; `set`, `ask`,
`production` and `source` the events named for them. A note the owner
withdraws is told as `note.withdrawn`, read as a note the file held at the
last read and holds no more.

`film lab events` (`tools/events-cli.ts`) prints them from the running lab.
With `--follow` it keeps running and prints one line per event as the lab sees
it, so a Claude Code Monitor wakes on each without polling:

```
ask.answered cursor=k3x.12 at=… id=3f0c… film=f ask=a1 summary="…" read="bun cli.ts lab ask_read --ask a1" link=http://…
```

`id=` is the change's own id, made from its kind and the record it was read
from (a note's id, its time made and its log number; a try's number and
time made; an ask's step), so two labs that read one change give it one id, a
reader told it twice knows it, and a note made after its file was reset never
takes an older note's id. A kept try's id is made from the board file as the
lab read it, so two labs that read it across a later write give one keep two
ids. A word on a production's ledger is told by whoever said it: an ask and a
note with no quote of the owner's are `agent`'s. `--name` (repeated;
`--name notes` follows a film's notes, tweaks among them) and `--film` narrow it: the
lab narrows, and the follower narrows only a change with no `id` (an older
lab's, which reads no filter); a `--name` no event of the catalogue matches, or a film the
lab does not have, is refused before anything is followed. `--since <cursor>`
reads on from a line's cursor, and `--json` prints `{"cursor":…,"event":…}` a
line. An event of a kind this checkout does not know (a newer lab's), or of a
known kind in a shape it does not read (an older lab's, with no `id`), is
printed from the fields every event carries, and said once on stderr. What is not an event goes to stderr. The stream
(`tools/lab-stream.ts`) is what `film ask wait` and `film channel` read too: a
lab that stops answering is said once and asked again with backoff (250 ms
doubling to 10 s, started over after each session that answered), and the new
session reads on from the last cursor seen, so while the same lab runs nothing
is missed, unless a reader falls more than the 1000 changes the feed keeps
behind (its cursor comes back `reset`, the older ones gone), and a notes file
trashed or restored is told whole again (each change with the `id` it had); a
restarted lab no longer knows the cursor, which comes back `reset`,
and the stream prints every event that lab kept (one told before comes again
with its `id`); a change made while no lab ran is in the new lab's first read
and is never told. Only `--gone-after <dur>` (counted from
the first loss since the lab last answered), a refusal of the lab's, or an
answer this checkout cannot read (`LabAnswerUnread`) ends it, with a non-zero
exit and, with `--json`, a last `{"_tag","message"}` line on stdout.

The lab's MCP serves the same catalogue as MCP Events (protocol 2026-07-28,
OpenAI's MCP Events profile; `tools/mcp-events.ts`): `server/discover` says
`events`, `events/list` lists the catalogue, `events/subscribe` takes a
webhook and its `whsec_` secret, verifies the callback with a signed challenge
it must echo, and posts each event to it as it happens, signed as Standard
Webhooks signs, retried with the same `webhook-id`, until `events/unsubscribe`
or its `refreshBefore`. The subscriptions are kept in one file in the lab's
folder, each with its cursor, so a lab started again delivers on. Effect's McpServer serves none of this, so the lab serves it in a
middleware in front of its MCP route; [plans/lab-mcp.md](../../apps/animations/plans/lab-mcp.md),
"MCP Events", has the methods, codes and limits. ChatGPT reaches a server only
over public HTTPS, and the lab provides no public route: a ChatGPT subscriber
needs one made for it.

### The easel: `film lab look`

A look is a still of a scene as its sources stand, drawn in about a second
with no render: the painter's step back from the easel after a passage. The
lab holds one export page per film open in its own process's Chrome
(`Easel`, `tools/easel.ts`, over the `Browser` a render uses: no second
launcher): the app's render page (`LabPageSpec.pages.render`, its
`index.html`), at the film's export place (`/films/<film>/export`,
`pageHref.export`) on the lab's own address, and a look seeks it to the frame and takes the canvas through the view
(`ExportHandle.still`, composed by `player/still.ts`). `film lab look` is
the lab MCP's `look` asked of the running lab (`tools/lab-client.ts`, at
`FILM_LAB_URL`, else `http://127.0.0.1:8229/`; The lab's commands, above);
the judge and the review ask the route itself (`tools/easel-client.ts`, an
`HttpApiClient` of `LabHttpApi`).

| Route                          | What it does                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/films/<film>/looks` | `LookPost` `{scene, at: [place, …], view: {crop?, size?, mode, captions, format}, from?, levels?}` → `LookTaken` `{build, looks: [{file, scene, at, frame, time, width, height}]}` |

**Never stale.** Every look first asks the pages' build as it stands
(`LabPage.built`), judged by content, never by mtime: a build under way is
waited out, then the build about to be answered, kept or just made (its
watches and checks set), is judged last, at the moment it is answered: its
files must have printed alike before and after it read them, and print so
still (length and hash). A save no watch has heard yet, one in the build's
own second, one made while the build read, or one landing after it printed
what it read, is built first; files that keep moving through three builds
are a `PagesBroken` asking to look again once the saves settle. A failed
build is a 422 `PagesBroken` with the bundler's words and no still. The
answer names the build by its own number among those kept
(`PagesNow.kept`), and the look opens that build's export page
(`/films/<film>/export?build=<kept>`, or `?wedge=<id>` for a wedge, served
as it was made, unstamped, so it never
reloads itself), never one built after. The page is held per build
(`<server>.<kept>`): a new build closes it and opens a fresh one, so the
page always runs the code on disk; a page that fails a frame is closed too,
and the next look opens another. Looks run one at a time.

**Places and views** (`core/easel.ts`, pure). A place is seconds into the
scene (`2.5`), `mark:<name>` (the mark's word, as `scenesOf` places it) or
`cue:<name>[@<share>]` (0 the cue's start, 1 its end); it resolves to the
nearest frame inside the scene's own frames (`momentOf`) and answers that
frame's time. A mark or cue the scene lacks is a 404 `LookPlaceUnknown`
naming the ones it has, seconds past the scene's end a 422
`LookOutOfRange`, a scene the film lacks a 404 `UnknownScene`, words that
name no place or a crop off the frame a 400 `LookInvalid`. The view crops
(corners in canvas pixels, held to the frame, shown at 1:1), scales the long
side (`size`, 16 to 4096), and draws `plain`, `value` (greys) or `squint`
(greys blurred by 1.2% of the long side, at least 2 px, over the region's
edges stretched outward so the frame's border blurs into itself). A crop is
PNG and a whole frame JPEG at 0.95 unless the format is named
(`formatFor`): a 1920×1080 PNG of the paper is about 4 MB.

**Files.** Each still is written once, under `out/<film>/look/<scene>/`,
named by its time, mode, crop, size, captions and build
(`t0002.33.squint.crop0_0_700_500.b<build>.png`), so a path an agent was
handed keeps its pixels. `from`, the asker's films folder, guards a lab
serving another checkout: it refuses with a 409 `LabElsewhere` instead of
showing its own files. A look whose page fails is a 502 `LookFailed` with
the page's words. The CLI adds `LabDown` (no lab answered, or one too old to
know the route) and checks the request before sending it: one the route
would refuse unread (a `--size` under 16) is `LookInvalid`, asked of no
lab. A failure prints (`--json`, and `film judge --json`) exactly as the
route answers it, decoded by one schema, `ToolFailure` in `core/api.ts`:
the route's refusals, `LabDown`, the judge's own, and `ToolFailed`
(`{failed, reason}`) for any other. Each look logs `easel.look … ms= built_ms= page_ms=
draw_ms=`: the build asked, the page opened (0 when held), the frames drawn
and written.

**Wedges.** `levels` (`{ground: 'light'}`, `film lab look --levels '{"ground":"light"}'`)
draws a wedge, the printer's strip at several grades: each look named at
that level in place of the one it plays, the pick unwritten. The easel reads
the film's `palette.ts`, checks each look and level against the ones it
declares (`lookLevels`, `tools/choice-source.ts`; a 404 `LookLevelUnknown`
names them), and edits `play` exactly as a pick would (`editPick`), in
memory. `LabPage.wedge` builds the pages once more with that text in place
of the file (`PageBundler`'s `swaps`, a Bun plugin that also refuses a swap
the build never read), once per build and swap, the last few kept; the
wedge's page is answered at its usual path with `?wedge=<id>` and its files
under `/wedge/<id>/`. Its page is held beside the film's own (four at
most), and its stills carry the levels in their names
(`….wground-light.b<server>.<build>.<wedge>.jpg`).

### The match: `film lab match`

`film lab match --film <film> --scene <id> --at <place> [--figure <name>] [--json]`
holds each figure a frame draws against the concept it was painted from.
A rig declares its concept beside itself (`RivePropSpec.concept`, a
`ConceptRef` in `core/match.ts`: a set's image, `{set, file}` under
`out/<set>/`, or a Board try of the film's own, `{board}` under its
`board/`, and the figure's box in it, in the image's pixels); drawing the
rig declares its figure on the frame (`probeFigure`, `canvas/probe.ts`: its
key, its box on screen, its concept), and the export handle's `figures`
answers a frame's (`ExportHandle`, drawn under a probe like `probe`).
The easel draws the place as a look does (its never-stale build, its held
page), takes the frame plain, uncaptioned and as a PNG, crops each figure
with its own hands (`sceneBoxOf`) and its concept by its box, and measures
both (`measureFigure`, `core/figure.ts`, pure: RGBA in, numbers out).

| Route                            | What it does                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/films/<film>/matches` | `MatchPost` `{scene, at, figure?, from?}` → `MatchTaken` `{build, scene, at, frame, time, figures: [{figure, key, concept, rows, side, table, crops}], unmatched}` |

**The measure.** Every length is a share of the head's outer width, so a
concept and a scene compare whatever their sizes: the head's height, the
outline, the jaw, the body's width under the chin, at 0.35 and 0.7 of a
head under it and at the hem, the height in heads, the hand, the eyes, the
brows and the mouth, the feet's width and height; the interior ink (a line
of the hair's own between it and the skin: the owner's rule is none); the
inner rim (a light band just inside the edge of an inner part of the head,
an ear or the hair, where that edge is not the silhouette; the owner's
rule is the concept's); the head's and the body's shading (each lit and
shaded half's hue, saturation and value, the edge between them, colour or
grey); the face's pose as its mouth shows it (`mouth`: open, a filled
shape whose stroke is over 0.8 of the head's line, or closed, a line); and
the outline (`FigureSilhouette`): the head's outer radius at 72 angles from
its centre, the body's sides row by row, the feet's box. The head's top and
its outline are where the ground stops at its ink (`outerOf`): what the
ground off the head, walled by the ink and the dark masses, does not reach,
opened by a line and joined to the face, so dark hair whose grain specks it
with ink (no region of its own) is the head's still. A face whose fill
runs on down the neck with no line at the chin (`chin: 'open'`) is read
down to the chin, the first row of the neck within 1.15 of its width (the
neck under 0.8 of the face's width and at least 0.15 of it, widening again
to the face's width within 1.2 of it); the neck is shut from the ground, so
the head is not the shirt or the paper the fill runs on into. An open chin
(the face meets the neck by a shade step, as the owner's B2 lead is drawn)
is a design the owner may pick, never a fault: it is only said, in the
sheet's table and its lines (`said chin=open`), and it flags no try and
sends no redraw. A ratio the crop does not show is left out with why
(`missing`: a hem behind a rail, whose line runs on past the body; feet a
rail hides; feet that would lie past the crop's edge). The line is the
longest run of dark ink that holds half the ink of the most-inked run, and
no longer than a twelfth of the crop, so a wall's thin lines or a long
dark band behind the figure do not stand for it.

**Facing and artifacts.** The head's facing (`facing`): its `turn`, the
eyes' midpoint off the middle of the face's opening on the cheek row just
under them (a share of that opening, + to the viewer's right; the opening
is the skin, from between the eyes to its last pixel, lit or shaded, before
the hair, the ink, the head's edge or a fill that is not skin, such as a
headcloth: a light rim at the head's edge is the skin's own), its `roll`, the eye
line's slope in degrees, and `eyes`, the eye line's length, which says how
coarsely the roll was read. The render's artifacts on the head
(`artifacts`, `core/render-artifacts.ts`), at 1:1 only: a pixel whose
colour lies off the blend of its neighbours two or three pixels across it
is a thin line of a third colour (an antialiased edge is a blend and reads
as nothing), classed by what lies either side: a `seam` (two fills), a
`sliver` (the outline's ink and a fill, the fill's luma off the line's by
more than the house rim's lift), or `weather` (one fill, over the face's
box from the eyes to the chin: rain across the face). Its pixels join into
marks, and a mark shorter than two of the head's lines is grain.

**The table** (`compareFigures`, `matchTable`). A row per measure, the
concept's and the scene's numbers and their difference: a ratio is flagged
past 5% of the concept's; interior ink past 0.02 of a head; an inner rim
0.1 of a head longer than the concept's; the head's outline past a mean
gap of 0.03 of a head from the concept's (the widest gap named by its
side), the body's past 0.05; feet the concept shows and the scene does not
(or the other way); a shade's drop, turn, kept saturation and edge past
their tolerances, and a grey shade; the head's turn past 0.1 of the
face's opening from the concept's, and its roll past 6° and the grain of
each side's eye line (a concept's head angle is design, never information:
owner, 2026-10-17, ask `aab16c0cb70`); and any seam, sliver or weather on
the scene's head (the owner's rule is none; a concept is painted, so its
side is not read). Two kinds of row are information,
never flagged: the height in heads (a figure's height comes from the cast's
height band, and a concept is a design sketch:
`.claude/skills/film/reference/character-design.md`, "One height band for
the cast"), and, where the two mouths' poses differ (a shout against a
closed mouth), the marks an expression moves: the eyes' height, the brows
and the mouth (a row `face: its mouth` names both poses). It guides; it is
never a gate: a concept is painted.

**Files.** Under `out/<film>/match/<scene>/`, each figure's side-by-side
(`<figure>.t<time>.b<build>.png`: the concept, the scene at one head
height with each artifact ringed (a seam red, a sliver blue, weather
green), and the scene again under the concept's outline in magenta, laid
by the head's centre and width), its table (`….md`) and its two crops at
1:1 (`….concept.png`, `….scene.png`, the critique's input), written once, so
a path handed on keeps its pixels. A figure with no concept declared, one whose
box lies past the frame's edge, a concept not on disk or unreadable, or a
crop where no figure reads is
`unmatched` with why; a `--figure` the frame does not draw is a 404
`MatchFigureUnknown` naming those it does. The CLI prints a head line, then
per figure its files and its flagged rows. The match is the scene
painter's step after a passage that touches a figure
(`.claude/skills/film/reference/scene-painter.md`). Each match logs
`easel.match … figures= unmatched= ms=`.

### The critique: `film lab critique`

`film lab critique --film <film> --scene <id> --at <place> [--figure <name>] [--json]`
(`tools/critique.ts`, its words pure in `core/critique.ts`; the lab MCP's
`critique` tool beside `match`) takes the match, then shows each figure's
two crops at 1:1 to a fresh Opus (`Counsel`, as `film judge` asks it:
headless Claude at max effort, Read its one tool, sandboxed) beside the
match's flagged rows and the app's figure rules (`FilmApp.critique.rules`:
sections of its rule files, each by its heading line). It asks for each
difference in head angle and turn, face shape and features (and where the
hair meets the beard: the owner, 2026-10-18, on Christ's render), pose,
proportion (never the height in heads, which is the cast's band), palette
and artifacts, and reads the findings (`CritiqueFinding`
`{figure, aspect, what, where?}`) from the answer's last `json` block. Its
sheet mode (`Critic.critiqueSheet`, `film concept critique`) asks the same
of a cast sheet's views, each beside the concept it faces as.

- **Batched.** One counsel run answers every figure at the place.
- **Cached.** The answer is kept at `out/<film>/critique/<hash>.json`, the
  hash over the packet's words as sent (its place left out, which names the
  build) and each crop's bytes: the same prompt over the same crops is never
  asked twice, and a prompt reworded is asked again.
- **Rules read once.** The rule sections are read when the critic is
  built: a heading its file lacks fails the build (`CritiqueRuleMissing`),
  as the judge's run does (`JudgeRuleMissing`). The app's
  `apps/animations/rules.test.ts` holds every heading to its file.
- **Fails open.** A counsel that fails, an answer with no `json` block or
  one that is not `{"findings": [...]}`, crops that cannot be read, or a
  defect is a skip: logged (`critique.skipped scene= at= figures= reason=`;
  a sheet's `sheet=` for `scene= at=`),
  said in each figure's file and in the answer's `skipped`, never a
  failure. Each finding is read on its own: one that does not read, or names
  no figure asked about (names match in any case), is rejected and said in
  the answer's `rejected` and the files, never dropped in silence. A
  critique logs `critique scene= at= figures= findings= rejected= cached=
  ms=`.
- **Files.** Each figure's findings are written beside its match table, as
  `<stem>.critique.md`.

The critique is the scene painter's step before a figure is called done,
and its findings are what `film review` records before an owner look
(`.claude/skills/film/SKILL.md`, the review gate).

### The cast sheet's measure: `film concept`

A cast sheet is one painted image of a cast member in the house look: a
turnaround (six views, left to right: front, three-quarter and profile to
the viewer's left, the back, profile and three-quarter to the right), a
pose sheet or a heads sheet. `film concept brief --look <file> --references
<file> (--turnaround <who> | --layout <file> --kind poses|heads) [--house
<file>]` prints the
prompt one try is painted from (`tools/cast-sheet-brief.ts`): the house
block made a sheet's by two swaps (a model sheet, no place behind), each
refused as `HouseBlockMoved` when the block no longer says its phrase, then
the references' note, the member's look, the layout and the sheet rules (the
canon, one outline round each figure's silhouette with the head's outline
the one line inside it, the hair a shape behind the head and
the beard parted from it, each circle hand at the end of its arm in its
sleeve and never a bare arm, the glide, no lettering). A layout or a look
with a clause that names a hand and says it floats is refused as
`HandFloats`, naming the clause, so a prompt never asks for a sleeved hand
and a floating one at once; a test reads every cast record's layouts and
look, the library's and each film's, through it.

`film concept measure <try.png> --kind turnaround|poses|heads --count <n>
--anchor <view> [--slot <slot> ...] [--standing <view> ...] [--level <view>
...] [--headgear] [--concept <crop.png>:<view> ...] [--out <dir>]` measures
a try (`measureSheet`, `core/cast-sheet.ts`, pure; its pixel reads in
`core/cast-sheet-pixels.ts`). It finds the figures (ink rings at least 0.15
of the largest's box, each with its hands and feet) and reads the `count`
largest; a sheet that draws more says "N figures found, the sheet names M".
It reads each view's face with `measureFigure` where a `--concept` crop is held to
it, and with `readFigure` (the same numbers less the light rims, the shading
and the render artifacts, which the sheet's checks never read) where none is,
and checks, facing first:

| Check                                                   | Flags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `facing`, `sameWay`, `profileWay`, `roll`               | a head that does not face its slot (a turn past 0.06 off the front, or under 0.04 toward its side); a pair of partner views that face one way; a profile that faces away from the three-quarter on its side (it reads no face, so its head band, the top 0.3 of the figure, is held to that three-quarter's: it matches better flipped than not); a turnaround head tipped past 5°                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `squash`                                                | the anchor's trace to the canon (3.36 heads) would squash or stretch the body past 10 %; not read on a heads sheet, nor under headgear (the canon is read on the lock), nor when the anchor stands and its head reads over half its figure (under 2 heads tall: not a head, so the canon and the anchor's head are said unread, and no view is held to its head)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `height`, `head`, `hand`, `width`, `hairFall`, `ground` | a standing view's height, any view's head or hand (in head heights) off the anchor's past 5 %, but a view the sheet stands (each its `standing` names, or every view when it names none) whose head reads over half its figure (under 2 heads tall, not on a heads sheet) is said unmeasured for its head, and its head, hand and hair's fall are held to nothing, while a low pose it does not stand keeps its head; on a heads sheet, the head's height on the level heads, held to the anchor's, and the eyes' spacing among the heads of one turn, held to that turn's first level head (a lock of hair widens a head's box, never its eyes), and no hand; partners' body widths (the median row from 0.76 to 0.9 of the height, read on each row inside the span of the view's own body ring, so a neighbour's ink in its crop or its box and a hand floating beside it are left out) past 5 %; the hair's fall on level heads past 0.1 head; soles off the anchor's ground line past 2 % of its height |
| `papers`, `grey`, `lit`                                 | a paper farther than ΔE 12 from the anchor's; a grey paper (CRAFT 12); a view lit on its right (the key light is upper left)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `mirror`                                                | a partner view that is the other flipped (a mean difference under 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `sleeveReach`, `bareArm`                                | a hand that floats free: once its disc is cut out, no sleeve or arm crosses the circle round it, from any angle, met as flat colour or across the hand's ring, past a touch (half its radius), so every hand is a circle at the end of an arm in its sleeve (the owner, 2026-10-18, the look's v5 decision: "I actually like the style when they have sleeves and like arms, kind of like we have with Jesus and a lot of the characters so far in the cast. Let's make that kind of a standing role for the concept"); a joined hand held out (its middle past its radius from the body's side under it) or raised (above the shoulders, held out from the head's side) records the gap its sleeve closes as `reach`; skin below the neck that is not a hand, a hand being round (its sides within 0.75 to 1.33 of each other, filling 0.8 to 1.1 of its ellipse, 0.4 to 1.3 of the anchor's hand) or one clipped behind the body, hand-sized and meeting the robe's fill on under 0.35 of its ring         |
| `hairBeard`                                             | a beard (the first dark fill under the mouth, inside the head's line) that runs into the hair past the eyes with no line between them (the owner, 2026-10-18, on Christ's render); not read under headgear, which hides the hair                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

The face is found by its own read: the skin that holds the eyes, or lies
in the head's box down to the chin or under the mouth, is the face; the
neck is narrower than 0.6 of the head and shorter than 0.5. Where a check cannot be read it is
said, never passed: a view with no face (the back, the profiles, a figure
lying on a bed, a head bowed far) is unmeasured for facing, the sleeve, the
bare arm and the beard; a joined hand at rest against the body (or held
out from its side by under a tenth of its diameter, as a bare hand whose ring
touches the body's line is), raised in front of the head, or under the body's
last rows is unmeasured for the sleeve, since a sleeve to it is not told from a
touch; a round hand whose middle lies in the face's window (the
head's box widened by 0.1 of the head on each side, down to the chin or 0.3
of the head under the mouth) but which runs past the head's box, or one whose
middle lies in the neck's window under the chin (narrower than 0.6 of the
head, shorter than 0.5), its ring over the chin line or not, is unmeasured for the sleeve and the bare arm, never passed as a part
of the face or the neck; a view with no round hand, a head
with no dark hair at its crown and a face with no beard under its mouth
say so; a heads sheet says it draws no hands, and the canon, as a turnaround
under headgear does. Under headgear the head's box runs down the cloth, so
the face, the neck and the shoulders are read on the face opening's frame:
its chin the opening's foot, its width the silhouette's across the eyes.

Known gaps:

- A bowed head on a pose sheet can flag `facing`: the pose band is
  calibrated on the first kept pose sheet.
- `measureFigure` reads no face on a head rolled past about 7°.
- A round hand held wholly inside the head's box is not told from the
  face's skin, so it is read as a part of the face.
- An inked cuff on a hand at rest is not told from a touch, so it is
  unmeasured, never flagged.
- Under headgear with no face opening read, the head stays the cloth's
  box, so a hand hanging beside the cloth can be said as in front of the
  head or the neck: said, never passed, but its sleeve and arm go unread.

Each `--concept` crop is held to its view by `compareFigures`. It prints a
line for the sheet and one per flag, and writes `<stem>.measure.md`,
`<stem>.measure.json` (`SheetMeasure`) and `<stem>.overlay.png` (each view's
box, the anchor's top and sole, and where the canon puts a figure's top).
It guides the retry and the ask, as the match does; it keeps or drops
nothing.

### A cast member's sheet drawn: `film concept cast`

`film concept cast <film> <member> --kind turnaround|poses|heads [--tries 3]
[--lanes 3] [--dry-run] [--house <file>] [--house-image <png>]`
(`tools/cast-sheet-make.ts`) draws tries of one kind of the member's sheet
on the image route. The member's folder is its film's own role's,
`src/films/<film>/cast/<member>/cast-sheet/`, else the library's,
`src/library/cast/<member>/cast-sheet/` beside the films; neither is
`CastUnfound`. It holds `cast-sheet.json` (`CastSheetRecord`,
`core/cast-record.ts`, pure: the member's pronoun, its scope, each reference
image and what it is for, and per kind the anchor view and, for poses and
heads, the layout in words and each view's slot, the standing views and
the level heads (as `--standing` and `--level` name them), and the kept concepts its
views are held to: a reference's file, the member's box in it and the views
that face as it does), `look.md` and the reference images; the references
stay out of git, as a board's images do. A kind the record does not set up
is `CastKindUnset` before any draw, a concept whose box shows no figure is
`CastConceptUnread`, and the brief is built once before any draw, so a
house block that moved stops the run. Each concept is measured once and
held to its views (`compareFigures`, as `--concept` is).

Tries run `--lanes` at once (three at most, the route's own limit). Each
lands in `out/<film>/cast/<member>/` as `<kind>-<n>.png` with its
`.measure.md`, `.overlay.png` and `.preview.png` (`sheetPreview`,
`core/cast-preview.ts`, pure: each view cut out at one head height, a
standing view's body under the chin drawn to the canon with its head held,
as the trace will make it, the canon's band across), and is recorded in `cast-sheet.json` under
the record's lock (`ContentStore.transact`): its prompt, its references (as
the sheet's folder reaches them), whether the underlay rode along, the try
it draws again, the measure's flags and the anchor's squash. A flagged try
is drawn once more with each drift named in a sentence (a head, hand or
papers drift held to the anchor view as the try measured it, in numbers and
words: its head's pixels and share of its height, its hand's share of the
head, its papers' colours by name and hex, `colourWords` in
`core/cast-sheet-pixels.ts`; on a heads sheet a head is held by its eyes'
spacing, in pixels, to its turn's first head); on `facing`,
`sameWay`, `roll` or `squash` the retry also sends the underlay as its last
reference (`mannequinUnderlay`, `core/cast-underlay.ts`, pure: a blank
mannequin per standing view, their soles on one row with no line drawn
under them (a drawn line came back as a rule under every figure), each the
canon of its heads tall and turned to its slot by its eyes, its nose and its feet, each hand a circle at the end of its arm in its sleeve (a profile draws its near arm alone); a view that
does not stand leaves its column empty; a turnaround's profiles are its
third and fifth views), written fresh as `underlay-<kind>.png`. A sheet with
no standing view, as every heads sheet, is redrawn with no underlay. A retry that still drifts is recorded with its flags,
never dropped; a try that draws nothing is a line and the run goes on. A
try the measure cannot read is recorded with why (`unread`), said on its
line, and drawn once more. A sheet the route paints with no paper (its
ground transparent) is read on white (`opaqueOf`), as the CLI's measure
reads one.
`--dry-run` prints the prompt and the references and draws nothing.

`film concept critique <film> <member> --kind <kind> --try <n>`
(`tools/cast-sheet-critique.ts`) cuts each view a kept concept faces from
the try at 1:1 beside the concept's crop, and asks one counsel run of them
with the measure's flags on each view (`Critic.critiqueSheet`: the scene
critique's packet, its figures said to be a cast sheet's views, the face
aspect naming where the hair meets the beard). Each view goes with what the
layout asks of it (its numbered clause, "one, …; two, …", after the words
its group shares, as "One to three are turned …: one, …", or the whole
layout when it numbers none), and the packet holds a sheet's head angle and
gesture to those words, not to the concept: a bow or a raised hand the
layout asks for is never a finding. A view no concept faces is said, never
critiqued against another's. The crops and each view's `.critique.md` land
in `out/<film>/cast/<member>/critique/<kind>-<n>/`.

`film concept keep <film> <member> --kind <kind> --try <n> --why <words>
[--ask <id>]` (`tools/cast-sheet-keep.ts`) files the owner's keep: the try
as `kept/<kind>.png` in the member's folder, each view cut from it as
`views/<name>.png` (a turnaround's by the house's names, `front` …
`threeQuarterRight`; a poses or heads sheet's as `<kind>-<n>`), both
committed, and `kept.<kind>` in the record with his why and the ask. A kind
kept already, or a try the record does not hold, is `SheetKept`.

### The review: `film review`, and keep needs evidence

`film review <film> --set <name> --scene <id> --at <place> --at <place>
[--figure <name>]` (`tools/review-cli.ts`, its record pure in
`core/review-record.ts`) takes the evidence a keep is asked on. It reads the
scene's source key as `film project` reads it, then at each place (two
distinct or more, up to four at once) matches and critiques the scene's
figures and copies each figure's crops and side-by-side into the set
(`review/crops/<review>/<scene>.<place>.<figure>.{concept,scene,side}.png`),
then reads the key again: a scene changed between the two reads is
refused ("the scene changed during the review"). The run is appended to the
record (`review/evidence.json`: a list of reviews, each its id `r<n>`, the
film, the scene, its key, the figure it was narrowed to, when, its places,
the crops, every finding and each skipped critique), never written over
another, and the page (`review/evidence.md`, every review, newest first) is
written from them all; both are listed in the set's manifest. A finding's id
(`f` and eight hex digits) is the hash of its film, scene, place, figure,
aspect and words, so a finding read again keeps what was done about it.
`film review <film> --set <name> --done <id> --did "<what>"` answers finding
`<id>`: the fix made, or why it stands. A record that does not read is
refused, with its error. Each writes `review.written set= reviews= findings=
open=`.

The gate (`AskMaterials.evidence`, run by `AskStore.make`) reads an ask on a
production by its types, never its words (`core/review-record.ts`):

- **Typed.** An ask that shows scenes or figures (a `video`, an `image`, a
  `board`: `showsFigures`) gives every option an `outcome` (`keep`,
  `revise` or `other`) and every keep its `keeps` (`{film, scenes: [{scene,
  figures?}]}`, `scenes: []` for a script, a concept or a Board), or it is
  refused naming what to add (`untypedKeeps`): leaving the types out lets
  nothing by. A keep of another film than the production's ledger names is
  refused (`typingProblems`).
- **On the recommended way.** The keeps read are those on the way the
  ask's recommendations take (`recommendedPath`: from its start, each
  step's choices answered by their recommended options, on by the first way
  whose guard holds), whose `outcome` is `keep` and whose `keeps` names a
  scene (`keptOn`). A script keep, a revise and a keep only another answer
  reaches are not gated.
- **Evidence.** Each scene and figure kept needs, in the record its `set`
  lists, the newest review of that film's scene that crops the figure (a
  scene kept with no figures named: a review over every figure), its key
  the key `film project` reads now, every finding on what is kept answered
  (`evidenceProblems`). Otherwise the ask is refused, `AskInvalid` naming
  each missing review by the `film review` that takes it.

The one way past the evidence is the ask's `override: {quote}`, the owner's
own words verbatim, kept on the ask (`asks.evidence override production=
chars=`); it never passes an untyped ask.

### The judge: `film judge`

`film judge <film> --scene <id> [--point <id>]` (`tools/judge.ts`, its
words pure in `core/judge.ts`) is a blind second opinion on one picture
choice. A version is what an ask's picture choice picks between:
a look point's levels (`look:<name>`, each drawn as a wedge through the look
route, so the lab at `FILM_LAB_URL` must run) and a render set's variants
(`render:<address>`, the catalogue's videos at an address that holds the
scene, each cut by `Media.still` at the same film seconds). A sound point
is `JudgePointUnjudged`; unnamed, the scene's one picture choice with two
versions or more is judged, several are `JudgePointAmbiguous`, none
`JudgeNothingToCompare`. The moments are the scene's marks and its cues'
middles, one per frame as a look resolves it (`momentOf` at the film's fps,
counted from the film's start), at most `JUDGE_MOMENTS` (12) spread evenly
(`judgeMoments`); stills are 1280-pixel JPEGs, drawn straight to
`stills/<label>-<nn>.jpg` in a folder of their own under the system's temp
folder, beside `packet.md` and nothing else (a look's stills are copied
there from the lab's own files, which stay the lab's, so judges at once
never take one another's). The labels are drawn
by `Random.shuffle`; the key (`JudgeKey`) stays in memory until the counsel
has answered, and is never in `packet.md` (`packetOf`): the beat's words, its picture's brief,
its register (`registersOf`, the head of the brief) and act, the app's rules
that bear on it (`FilmApp.judge.rules`, each a heading of a file, for every
beat or for a register; a heading its file lacks is `JudgeRuleMissing`),
the stills by label and moment (each by its path beside the packet), and
the form of the answer; it names no place (a rule's file by its name
alone). The counsel is a seam (`Counsel`, `tools/counsel.ts`) with two
adapters. `Counsel.layer` runs headless Claude Code (`claude -p --model
opus --effort max --safe-mode --restricted --tools Read --strict-mcp-config
--no-session-persistence`, `claudeRun`), the packet on its stdin, from the
packet's folder, under macOS's sandbox (`tools/sandbox.ts`, `sandbox-exec`
with a Seatbelt profile, `profileOf`): every home, the system's temp
folders and other volumes are closed to reading, then an allow-list is
opened: the packet's folder, Claude's install (the native installer's
`…/claude`, its program's real path a version under `versions/`; any other
program, a wrapper script among them, is `CounselFailed` before anything
runs, `installOf`) and the user's keychains (its
sign-in) to read, and a scratch folder of the run's own to read and write,
which holds Claude's temp files (`TMPDIR`, `CLAUDE_CODE_TMPDIR`) and a
fresh state folder (`CLAUDE_CONFIG_DIR`; `CLAUDE_SECURESTORAGE_CONFIG_DIR`
empty keeps the keychain item of the default one, so the sign-in is
found). Nothing else is written, and none of `~/.claude` or
`~/.claude.json` is readable: no earlier run's folder, no look file, no
repo, no cache, no other session or transcript. What stays readable is the
system's own files outside the homes and temp folders. The environment is
`HOME`, `PATH`, those four and `DISABLE_AUTOUPDATER`, `LANG` and `USER`
alone, and the host's `ANTHROPIC_BASE_URL` when it has one (the owner's
teamclaude proxy), so the counsel asks the way the host's Claude does; its
`counsel.start` line names that route by the proxy's scheme and host alone
(`route=http://localhost:3456`; never its login, path, query or fragment,
where a token can sit), `route=proxy` for a value that is not an `http`
or `https` URL, or
`route=direct` with none, so a lab started without the proxy says so. The network is shared (the counsel needs the internet), so the
lab's loopback port stays reachable, though nothing names it. Its stdout
is the answer and its stderr the run's words, written as they arrive to
`claude.md` and `claude.err` in `<run>/counsel/` (a non-zero exit, or a
run past `COUNSEL_LIMIT`, 30 minutes, stopped with SIGTERM and killed 10 s later if it still runs, `COUNSEL_BOUNDS`, is `CounselFailed`, naming that
folder once the run printed there; off macOS the counsel fails so too); `Counsel.sandboxed` runs any command
so (the tests probe the sandbox with one); `Counsel.layerTest` answers
from a function of the packet. Its last `RANKING:` line is read (`rankingOf`: a
whole expression, every label once, `>` between tiers, `=` a tie, nothing
after; or exactly `no preference`; else `CounselUnreadable`) and unblinded
into `verdict.md` (`verdictOf`) in the run's own folder,
`out/<film>/judge/<scene>-<stamp>-<draw>/` (made by an exclusive mkdir, so
two runs never share one), beside the stills, the packet (as it was read)
and `key.json`: the ranking in real names beside the owner's pick
(the level the look plays, the render set's approved variant), the key, the
reasons with each label's heading named, and the counsel's answer and
packet by path. The judge writes no choice. It logs `judge.drawn label= stills=` per version and `judge.done
… ms=`.

## Review

The review is the lab's home page (`/`, served by `film lab`): every render
under the review's roots, compared in sync, and each film's options, picked
where they are heard. Each film on it is a card that opens its studio (Open in the
Studio in its menu, `filmCommands`), its state the band and
`0/20 approved · 20 out of date` (`filmCounts`), from the film's project
read with the page; every move between pages is the shell header's (Films,
the film switcher, Studio) or a command, never a link in a page's text. It is the lab's
server's (`tools/review.ts`, `review-http.ts`, `choices.ts`,
`choices-http.ts`, `project-http.ts`) and one Solid 2 page (`lab/review/`,
its project's client in `lab/review/options/`), rendered on the server first
(`lab/review/server.tsx`) and hydrated in the browser (`lab/review/mount.tsx`),
dark and made for a phone first.

**Terms.** The page uses the words of a film review room; the code keeps its
own names, and the stored and wire words stay as they are.

- **Production** (Kitsu's word, a film's or a track's): what the owner
  follows from start to finish, a film or a track such as the house look. Its
  page is its **timeline** (`/productions/<production>`, `?v=<n>` opens a
  past version): its **versions** (v1, v2, …) newest first, each with what
  it is for and the decision that opened it, and in each, newest first, the
  sets published into it, the owner's words given outside the lab, and the
  sets filed there that no root holds now. The current version is open, says
  what waits on the owner (each question asked of them about a set, a lab
  ask made by the lab's `ask` (`film lab ask`, or its MCP), that no pick in its
  choice, no later decision on it and no close of the ask has answered; an
  open one stays open across a move), and holds the
  page's one verb, Move forward: the decision, one of the owner's filed in the
  version (the newest pressed) or his own words in a line, and what the next
  version is for (`v<n>` when left out). Only the versions, the owner's words and the questions are
  kept (an ask on the production files its question as it is made and,
  closed, his decision: his answers in a line, his words as its quote and
  each choice's value as his picks, which an override may cite;
  `ProductionStore`: a ledger a production,
  `apps/animations/productions/<production>.json`, committed text, every
  image and render it reaches named by path, never copied; `FILMS_PRODUCTIONS`
  moves the folder); the rest is read from the sets (`core/production.ts`
  `historyOf`). On a production that names its film, the current version
  leads with the film's board as a stage, one line linked to the Board
  (`Board · 24 panels, 20 kept · 5 of 8 beats approved ›`, `boardStageOf`,
  read from `GET /api/films/<film>/board`). A set lands on a
  timeline when its `review.json` names the production (`film publish`); an
  older set is filed by hand (`film production file`). The front door lists
  the productions first (a production that makes one of the app's films is
  that film's only card: under its head, the film's state and its **Studio**
  and **Board** links), then the films no production makes, then the
  **Sets** and **Renders** no production holds; [the design](../../apps/animations/plans/lab-timeline.md).
- **Stack** (Frame.io's version stack; the page's heading **Stacks**): the
  renders of one address side by side on one clock, each an **option**
  (`Open option n`, `Hear option n`). The code calls it a set (`ChoicePoint`
  of kind `render`), each option a variant. "Version" on the page means only a
  production's v1, v2, … (**Production** above).
- **Side by side**: the first option against one other (the view `pair`),
  offered only on a stack of two or more.
- **Wipe**: the same two stacked full width on the one clock, the first left
  of a divider and the other right of it (`?view=wipe&other=<id>`). The
  divider is dragged by its grip, or moved from the focused grip as a
  slider is (`lab/wipe-keys.ts`: ←/→ and ↓/↑ a hundredth of the frame, ⇧ ten, ⌥ a thousandth,
  Home and End its edges, through the keymap's `slider` focus, which owns
  those keys); where it sits is the page's, not the
  link's, since a different split shows the same comparison. Where the
  browser can, the two play as **WebCodecs panes** (`browser/frame-pane.ts`
  over mediabunny in `browser/webcodecs-browser.ts`, reached through
  `Media.compare`; only this page's host is built with them,
  `BrowserHost.withMedia(panesMediaLayer)`, so no other page loads the
  decoders): each master decoded to
  a canvas, both read from one monotonic clock (`media-clock.ts`) and drawn
  in lockstep (each frame, both show the frame their time asks for or
  neither moves on, so a slow decoder holds the pair), so they are frame
  for frame together rather than within the sync's 0.2 s, and a scrub shows
  the key frame at once and then the exact frame. The player is chosen by
  capability (`media-choice.ts`): `VideoDecoder`, the picture decodable, and
  the sound decodable (`AudioDecoder`), PCM, or absent. A phone, a browser without WebCodecs, or a
  master that will not open plays on `<video>`, which keeps every action;
  the frame says which in `data-engine` (`asking`, `webcodecs`, `video`) and,
  on `<video>`, why in its tooltip. The panes' sound plays through the page's
  one sound context (`media-browser.ts` `pageSound`, set to `playback` on Safari so it plays
  through the silent switch), only at 1× (another rate would change its
  pitch). A hidden page stands the panes (clock and sound stopped, decoders
  and frames still decoding let go) and, shown again, they draw afresh and
  play on as they were; the masters' inputs are the wipe's from the moment
  they open, so an opening that fails or is cut short lets every one go.
- **Difference** (a _difference matte_): the other's still laid over the
  first's at one moment in the `difference` blend, black where the two are
  the same and lit where they differ (`?view=diff&other=<id>&m=<n>`, ←/→
  between moments). It stands on stills the server cuts at the same instant,
  never on the playing videos, which the sync keeps only within 0.2 s.
- **Comment**: a note on a version, kept in the catalogue (a `say`).
- **Out of date**: a version made for earlier sources or an earlier mix (the
  state `stale`).
- **Proxy / Original**: what a video plays. The proxy is a light copy (720p at most)
  of a video too big or too dense for a phone to play as made (over 40 MiB, or
  over 8 Mbps, a drawn 2D render too: the quality `phone`); the original is the file itself
  (`full`). While a proxy is still being made the page says so and offers
  the original; it never streams the original unasked.
- **Needs review / Approved**: a version's approval (`none` / `approved`);
  "needs review: an earlier version was approved" is `stale`. There is no
  "Needs changes" status yet: a comment carries it.

**A choice point** (`ChoicePoint`, `core/choice.ts`) is the one shape:
at an address in the film, variants to compare, pick, comment on and
approve. Which point it is is data (`ref`, a `PointRef`): decoded from its
id once, where the point crosses the wire, and encoded back as the id alone,
so a verb reads the ref and never parses the id back. Each variant has a state (`current`, `stale`, `missing`), whether
it is picked, the verbs its state allows (`pick`, `unpick`, `reject`), its
media (`Seen`: a video; `Heard`: alone and/or in the film's whole mix;
`Unseen`), the key the owner's say is given on, and that say (approval and
comments, from the catalogue). A sound layer's level is no choice point:
the agents set it in `sound.ts`, as every other literal. One adapter per kind lists them (`tools/choice-points.ts`, render
sets in `tools/review.ts`), and one dispatch lands each verb
(`tools/choices.ts`):

| Kind     | Id                 | Variants                                                                                                                                                                           | A pick lands in                                               |
| -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `render` | `render:<address>` | an address's renders in the catalogue, or a montage's `review.json`                                                                                                                | nothing: approved and commented only                          |
| `score`  | `score`            | `sound.ts`'s `score.options`, each heard as the whole mix                                                                                                                          | `play` in `sound.ts`                                          |
| `take`   | `take:<sound>`     | a library sound's kept takes and candidates, at the scenes it plays; a code sound's seeds (all play) and a code trial's (none does), which no verb reaches (`ChoiceVariant.fixed`) | the library's keep, unkeep, reject (`library.lock.json`)      |
| `voice`  | `voice:<beat>`     | a beat's recorded attempts, newest first; the timings' take picked                                                                                                                 | the timings, kept by `film options keep-voice` (then remixed) |
| `look`   | `look:<name>`      | `looks.<name>.options` in `palette.ts` (`ground`: now, light, …)                                                                                                                   | `looks.<name>.play` in `palette.ts`                           |

A look's options are levels a scene reads (`ground`: the paper's ground, `now`
at 0 drawing today's film); a render of another level is a render variant
(`--variant light`).
A score's pick changes what `full.wav` is mixed from, so
once the write of `sound.ts` lands the track is mixed again (`film mix
<film>`, fresh), and again on its Undo and Redo, as a kept voice's is (the
rewrite's `follows`, `Follows.remake` in `tools/source-writer.ts`, which
answers when its track landed, `Remade`); a failed mix is logged
`lab.remake.failed` and the write stands, naming no mix.

**Sets are found by record, never by name.** A folder is listed only when a
record says what its files are. A film's project folder (`out/<film>`) holds
`catalogue.json`: each address the catalogue has renders of is a set, its
variants that address's renders (`main` first, a share copy in place of its
master), each with its stamp, the owner's approval, and its state as the
record says it (`recordedNow`): stale by its `sources` when a newer render at
its address drew other sources, by its `sound` when a newer video carries
another mix (`ChoiceVariant.staleBy`; whether the newest is current against
the sources now is `film project`'s). The set page (Stacks) judges each
option again as an approve's write does: in the checkout's own folder for
the film (the project's `folder`, the server's ref of its out folder, names
the set's; that alone decides, never the folder's name, so the film's own
folder under a root of another label is judged by it too), once the film's
project answers, against the film's sources now (`projectNow`,
`versionState`, the rule `renderState` keeps), so Approve is offered for
just the options the write would take. Anywhere else, a copy of the film's
folder under another root among them, and until the project answers, it
judges as the record says; the Set's tools say which judges (`data-sources`:
`reading`, `project`, `record`). The page reads the project itself, once it
runs and only for a folder whose title is one of the app's films (a
montage's title is none, so its Set asks for no project; Refresh reads the
films again, so a film added while the page is open is one from then on);
the server's render never waits on it. The page has one owner of each film's project
(`FilmProject`, `meta.project` in `lab/review/context.tsx`), kept for the
page's life, which every page that shows it reads (`useProject`: a Films
card, a Set's judgement): a Films card and then a Set read it once. A say's answer lands on it in the
order asked (`asked.ts`); a Set's say, a source write and Refresh read it
again, now while a page shows it, else when one next does. A version's
approval and comments are the index's (`useIndexOwner`,
`lab/review/index-owner.ts`): a video's phone copy made or failed reads
the index again (`indexChanged`), and a Set's say puts its folder into the index's newest
answer, so a read again and a say landing together both stand. After any
project say (`Review.written`), as after a set's, the
server drops its cached index, and a walk that began before the say keeps
nothing, so its next read walks every root again and a Set opened after a
say shows it. A change made elsewhere shows at once
after a Refresh. A reload shows another tab's say at once; the CLI writes
without telling the server, so a reload shows a CLI change once the
server's last index read is older than its 15 s cache (`INDEX_FRESH`). It says it in every view, beside the
variant's label: why a variant is stale (`staleText`), and no state word
otherwise, never "current". A montage folder (say a
look explored by hand) holds `review.json` (`ReviewManifest`), which names its
files: `videos` and `images` (loose files to show), `docs`, and per set a title,
order, start, moments, and each variant's label, tag, verdict, notes and
`file` (by default `<clip>.<variant>.share.mp4`, then `<clip>.<variant>.mp4`).
Montage images follow their manifest order so staged scenes read in sequence;
missing images are skipped and each file path appears once. Videos and docs
remain newest first. A folder's `blurb` renders as escaped Markdown, like its
notes and docs, so scene lists and judging instructions stay readable.
Optional `downloads` names file links relative to the montage, in authored
order. Use it for a native master or another artifact to save: explicitly
declared downloads are served with byte ranges even above the 600 MiB
inline-video limit. Downloads alone get no player, poster or phone copy;
inline video declarations retain the existing video and phone-copy limits.
Missing downloads are skipped, duplicate paths appear once, and links retain
the review's root and symlink checks.
A file neither record names is not listed; nothing reads a file name back.
A film's page plays its newest whole-film render as the catalogue records it.

**The roots.** `FILM_REVIEW_ROOTS` (comma-separated, each `label=path` or a
bare path) replaces the app's own roots (every checkout's `out/`);
`FILM_REVIEW_EXTRA_ROOTS` adds to them. Every route names a file by its ref
(its root's label, then its path under the root), never a path on the box.
Cached files (frames, phone copies, option mixes) are
kept in `FILM_REVIEW_CACHE` (`~/.cache/film-review`); `FILM_REVIEW_PHONE=off`
makes no phone copies.

| Route                                                                           | What it answers                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/review/index[?fresh]`                                                 | `ReviewIndex`: every folder with something to review, newest first                                                                                                                                                                                                                                                                                                                                      |
| `GET /api/review/files/<ref>`, `/api/review/phone/<ref>`                        | the file, or its phone copy, byte ranges answered 206                                                                                                                                                                                                                                                                                                                                                   |
| `GET /api/review/frame?ref=&t=&w=`, `/api/review/duration?ref=`                 | a JPEG of a video at `t` s, `w` px wide; its length and its frames a second as its packets give them (`fps`, never rounded; none for a file with no video)                                                                                                                                                                                                                                              |
| `POST /api/review/sets/<folder>/<point>/say`                                    | `SetSayPost` `{variant, say, op?}` → `SetSaid` (the `ReviewFolder`, with `gave?` and `took?` as a project say answers them), written to the folder's `catalogue.json` (a montage refused; a version made again since it was shown is `VersionChanged`, 409)                                                                                                                                             |
| `GET /api/productions`                                                          | `Productions`: every production's ledger (`ProductionStore`), one that does not decode, or is kept in a file not named for its production, left out with a warning                                                                                                                                                                                                                                      |
| `POST /api/productions/<production>/versions`                                   | `MoveForward` `{after, title, because?}` → the ledger with version `after + 1` opened now; `VersionMoved` (409) when the production is past `after`                                                                                                                                                                                                                                                     |
| `GET /api/asks/<ask>`                                                           | `AskRecord`: an agent's ask (`AskStore`, `FILMS_LAB/asks/`): its machine, where its run is and every answer; `AskUnknown` (404)                                                                                                                                                                                                                                                                         |
| `GET /api/asks/<ask>/page`                                                      | `AsksPage` `{page, asks}`: the page of asks that ask is on (`AskStore.page`), its asks in the order made; an ask kept before pages is a page of one; `AskUnknown` (404)                                                                                                                                                                                                                                 |
| `POST /api/asks/<ask>/answer`                                                   | `{sections: [{step, values}, …]}` (the page's every section, in order, kept all or none; an older page's one `{step, values}` is one section; an empty `sections`, 400) → the `AskRecord` its machine leaves: each step's answers, typed; the same answers again answer it as it is; another answer to a step answered, one to a step the ask has left, past its deadline or closed, `AskRefused` (409) |
| `GET /api/films`                                                                | `ReviewFilms`: the app's films                                                                                                                                                                                                                                                                                                                                                                          |
| `GET /api/films/<film>/choices`                                                 | `FilmChoices`: the film's renders (the pictures) and its points                                                                                                                                                                                                                                                                                                                                         |
| `POST /api/films/<film>/choices/pick`                                           | `PickPost` `{point, variant, verb, acceptMismatch?}` → `ChoiceWrite`                                                                                                                                                                                                                                                                                                                                    |
| `POST /api/films/<film>/choices/say`                                            | `SayPost` `{point, variant, say}` → `FilmChoices`, the say recorded                                                                                                                                                                                                                                                                                                                                     |
| `GET /api/films/<film>/choices/alone?point=&variant=`                           | the variant's own file (a take, a voice attempt)                                                                                                                                                                                                                                                                                                                                                        |
| `GET /api/films/<film>/choices/mix?point=&variant=`                             | the film's whole mix with that variant in place (m4a)                                                                                                                                                                                                                                                                                                                                                   |
| `GET /api/films/<film>/choices/check`                                           | `SoundCheck`: `film check --sound` as the film now stands                                                                                                                                                                                                                                                                                                                                               |
| `GET /api/films/<film>/project`; `POST …/say`                                   | `ProjectView`, read or written by a fresh `film project` (above)                                                                                                                                                                                                                                                                                                                                        |
| `GET /api/review/build?since=&server=&film=&timeout=`                           | `PageBuild`: the pages' build, once past `since`, a mix of `film` among the changes (at most 60 s)                                                                                                                                                                                                                                                                                                      |
| `POST /api/films/<film>/undo`, `/redo`; `GET /api/films/<film>/check`, `/steps` | the lab's own, for the film named; `steps` its undo and redo alone                                                                                                                                                                                                                                                                                                                                      |

**How a pick lands.** Every write goes through the one `SourceWriter`
(`source-writer.ts`), the lab's knob and cue writes included: it reads the
file, makes the new text, formats it with oxfmt through stdin, verifies it
(the edit reads back as meant), and swaps it in only if the file is still as
it was read (compare and swap, under the file's store lock, so another
process's store write, `sfx make` on the library's lock say, never lands
between the comparison and the write and is lost), then runs
`check --static`. A score or look
pick splices the one `play` string literal, and a knob its one level
literal (`choice-source.ts`, through oxc); a
take's act runs the library's own `keep`, `unkeep` or `reject` on the lock,
the writer recording the lock's bytes before and after and leaving the lock
as oxfmt does (the library's own JSON writer spreads short arrays the
formatter keeps on one line), so the diff is only the pick; when another
writer changed the lock after the act, its write stays and the lock is left
unformatted. A write that
changes nothing answers `(already so)` and records nothing. Each film keeps
its own undo and redo stacks (50 deep): Undo puts the newest change back byte
for byte, only while the file is exactly as that change left it (else
`UndoUnavailable`, a 409, touching nothing: the check, the takes brought
back, the write and the takes put away all hold the file's store lock); a new change drops what could be redone. The file a change
touched is named relative to the film's folder (`sound.ts`,
`../../../sounds/library.lock.json` in the app).

**No per-placement pin.** A take is chosen for the whole sound, not for one
placement: the library's kept variants are the picks, and they rotate
through the sound's placements. Pinning one take to one placement would put
a second pick for the same sound in a second file (`sound.ts` beside the
lock), and the two could disagree: a take rejected in the lock while a film
still pins it. When one moment needs its own take, it is its own library
sound (`paper.page.hush`), placed there, and picked the same way.

**Mixes.** An option's mix is the film's whole mix (`Mixer.render`) with
that option playing (a score) or only that take at every placement of its
sound (`RenderOptions.take`), encoded AAC and cached under a key of the film,
the option, the take and the film's source stamp (the newest file under its
folder, the library's module and its lock). A mix renders the whole film (45–55 s for
righteousness-by-faith on the box under load), so mixes are made one at a time in the
service's scope, not the request's: a page that stops waiting leaves one
running, the next ask joins it or finds it made, and the page's `<audio>`
asks again when its load fails. Their URLs name the option, not the source, so they
are served `no-cache` and revalidated; the page asks again after each write
(`?v=`). The review imports no film itself: a process keeps the modules it
imported as they were, so each read of a film's options or checks, each mix,
and each keep, unkeep or reject of a take runs the film CLI again (`film
options list [--check]|mix|take|keep-voice`, `film check --json`, `film
project --json`: `FreshFilm` in `fresh-film.ts`, through the app's `self`),
and a hand edit to `sound.ts` or to a prompt in the sound library shows on
the next read. The type says so: the lab's handlers run with `LabContext`
(`lab.ts`) and `Choices` is built on `ChoicesNeeds`, neither of which holds
`FilmRepo` or `SoundLibrary` (`lab-context.types.ts` fails the typecheck if
one joins). The film's folder (`FilmFolder`: its paths, the
app's films, the sounds folder) is all the review reads of a film in
process. The points a film read at its source stamp are kept (`Choices`,
a cache keyed by film and stamp), so a pick checks its point against them
and a pick costs one fresh run, `options list --check` for the page's answer,
not three. A film is named in a route as one of the
app's films (`filmNamed`): any other name is a 404 listing the films, never
a path. `/api/review/files/<ref>` answers only what the index lists (a video, an
image or a doc where a walk looks, or a file a manifest names). Lengths,
frames and phone copies are the Media service's (`duration`, `still`,
`phoneCopy`), and a mix is written as an m4a by `writeAac`.

**The remote surface.** The lab is served where the owner reaches it from
a phone over the tailnet, so `LAB_HOST` defaults to loopback and the
lab listens at `FILM_LAB_PHONE_URL` itself (the laptop's Tailscale address,
`http://100.92.183.50:8230/`), the same handler on both. Every request passes the API's one gate (The
HTTP API, above), the pages and their scripts included: the app's server has
no route of its own, only `labHandler`, which admits first and then hands what
is not `/api/*` to the pages (`LabPage`, above). A Host
that is not the listener's own is a 403 (DNS rebinding),
and so is any request a browser marks cross-site (`Sec-Fetch-Site`), but a
link opened on another site to one of the pages. A write
must also carry an `Origin` of one of those hosts (`http://`)
and, when it carries a body (a POST always), a JSON one: another origin is a
403, a text/plain body a 415 (so a form on another site cannot post), a bad
body a 400. A DELETE, PUT, PATCH or OPTIONS with no body is the one write
with no JSON body, as an MCP client's session end is. The studio's edits, the notes and the recorder are behind the
same gate: a write from the phone at its address is the lab's write. The
studio's microphone needs a secure context, and the phone's plain `http://`
link is not one, so a recording is made on the local link (`localhost`); on
the phone the recorder says so (`MicDenied`).

**The page** (`lab/review/`): `<Root>` holds the runtime (the review's
routes and the options'), where the page is (its place, read from the URL
through the host's `UrlState`, so a link, Back and a reload work; see Pages
and links), the index, the films and the quality (Proxy or Original). A
still opens full size in a lightbox, the kit's Dialog over every layer of
the page, titled by its caption; the URL keeps it open (`?still=`), so a
link opens it, Back closes it, and Escape or a tap closes it by the
sheets' one rule, the address bar's dismissal (`addressOn(host).dismiss`;
`useSheetDismissal` tracks the opening). The header is the studio's shell (`PageShell`,
`lab/page-shell.tsx`): Films, the film switcher, the Studio link, a
drill-down crumb and Go to… (⌘K: Go to finds a folder or a set by name,
`destinationsOf`; home lists every folder, with no filter field). The
sheet open on a set is its `?inspect=` (`useInspectorPlace`), so a link
opens it and Back closes it.
Refresh (`review.refresh`) and the copy played (`review.quality`: Play the
proxies, Play the originals) are the page's commands, in ⌘K and the page's
long-press menu; a proxy still being made still offers its original in
place. A Folder's loose video shows its picture and name; its file is its
long-press menu's (`review.file-open` Open the file, Copy link to the file,
`review.file-info` Info: its size, age and proxy). A set's page holds one effect-machine actor, the synced player
(`machine.ts`: `Paused`, `Playing`, `Scrubbing`, `Buffering`; one clock, the
leading version's video (the first shown whose video plays here), whose ←/→
step is one frame of that video's own (its timecode counts them; Shift ten):
the rate `GET /api/review/duration` reads from the video's own packets
(`fps`, `Media.timing`: read from the start times of its first 120 frames,
on the clock those times sit on (the coarsest step each is a whole count
of, so a millisecond clock's times copied onto a finer timescale tell no
more than before); when that clock is half the frame of the whole or
1000/1001 rate near them or coarser (the frames' own spacing, as an exactly
timed 0.5 or 1.25 fps file's, or one's with frames dropped), it cannot tell
that rate from its neighbours and no rate is claimed: as measured, below;
else the whole or 1000/1001 rate whose frame grid alone holds
every start within one step of its time, with some two consecutive starts on
adjacent lines of it (a grid that holds them by skipping lines, as 1 fps's
holds 0.5 fps's, is none of theirs) (strictly within first; a whole step
apart, as halfway times rounded either way leave them, only when no grid
holds them strictly; a millisecond clock tells 30 from
29.97 over a second, not over a third of one; a last frame's own duration
names no rate), else as measured, frames over their span, never rounded to a
whole rate, so a 29.97 video steps on its own grid),
the film rate (`FILM_FPS`) only while that answer is pending or the video
names none; a seek (a step, a scrub, a `#t=`), or the clock's rate read
while the player is still (the clock's rate read while it plays or waits on
a video puts none back: they play on; the leading version's own rate read,
below, still lands the leader), lands every video at the
frame the clock's timecode reads, each a quarter of one of its own frames
into its own frame that holds that frame's start (`landing`, by the
rate each version's video as it is now is read at, the clock's while that
read is pending or names none, so a file written again with no rate forgets
its old one; that version's own rate read, or forgotten, lands its video
again in any state; Chrome
keeps some frames' starts a microsecond short, which shows the frame
before), so each shows its own frame's picture at the clock's time, at any
rate of either, and the picture is the timecode's (on a laptop the
header's, read at the clock's rate, `useShellTime`); a drifter is put back
on the clock's time itself; one sound heard;
opened at the URL's `#t=`, which follows it), and shows the view its URL keeps (`All`, `Pair` shown as Side by side,
`Wipe`, `Moments`, `Diff` shown as Difference, `Notes`; a set of one version has
no pair, wipe or difference, and a link asking for one opens All; the pair,
its wipe and its difference share the other chosen, and the moments and the
difference share the moment): a view chosen runs through the view machine (`stepView`)
and is written back, a new history entry for a view or a moment chosen,
the same entry for a pair's other cycled or a ←/→ step. `sync.ts` is the driver
that makes every `Playable` on the set's clock (a `<video>`, an `<audio>`,
or a wipe's WebCodecs pane) follow the player: it puts drifters back on the clock, holds all while one stalls, and
unmutes only the one heard.

A review page's write (a production's move, a comment box's say) runs on a
run of its own (`useWrite` in `lab/review/loaded.tsx`): it waits, disabled,
until its own answer lands, while every other control stays free, and a
write sent meanwhile neither cancels it nor hands it its answer. A write's
answer reaches the page only as `Landed` (`core/asked.ts`): what it says
shows only where no write asked after it has shown its own. The page's
receipt (`writeStatus`) says each write busy as it is sent, in the words its
control gave then (what it moves, before → after), and once answered says
the newest asked of those answered, so an older success never hides a newer
failure. A say box empties only once its own say is said (`SayBox` in
`lab/review/comments.tsx`: each say answers whether it was): a comment whose
say fails stays in its box beside the failure.

## Check

`film check <film>` fails (after reporting every finding, not the first) on
what a review used to find by eye. It runs in legs (`tools/film-check.ts`),
each typed by what it needs: the static leg (`staticLeg`: the film's files,
FileSystem and Media, and SoundRender for the derived sounds it places), the
sound leg (`soundLeg`: the mix, Mixer), and the
layout and look legs (`layoutLeg`: the browser, Checker and Looker), and the
draw leg (`drawLeg`, `tools/draw-check.ts`: the film's `film.ts` built from
its committed timings and each scene drawn in this process into the stand-in
context at its moments, as every-scene-draws runs it in the gate).
`--static` runs the static leg alone, with no mix and no browser: it is what
the lab runs after each write; with `--folder v<n>` it checks that version
folder's own files (its scenes, takes, sound and credits). `--sound` adds the sound leg, still with no
browser. `--draw` adds the draw leg instead: `DrawThrew` (a scene that
throws), `FrameImpure` (a cue start or 60% point that, drawn after the frame
after it and after the frame before it, leaves different calls), and the
warning `InkOverFace` (a visible stroke or line of text drawn after a face the
viewer sees, `seenFace`: its scene's own, mostly opaque, centred on the frame,
the one rule `FaceSmall` measures by too; through `FACE_CORE` of its radius; a kit declares a face with `probeFace`
once its person is drawn, so the person's own features, headwear and hands
come before it; fills, the caption and a stroke that `marks` a line are not
read, and a gradient glow is invisible to the probe). With neither, all of them run. Every finding comes back in one
`Report` (`tools/findings.ts`): levelled by `levelOf` (one exhaustive
table, `--allow-stale` included) and addressed by `addressOf` (its scene and
the film second it starts at; a finding about the whole film has neither).
`--json` prints each as a `CheckLine`, `{ level, tag, message, address? }`.

- **Static** (no browser, `--static`): a named cue that ends after its scene
  (`CueLate`); a sound cue naming an unknown scene, cue or mark; a score movement
  out of film order or under 3 s (`MovementTooShort`); a take that is missing or
  was recorded for other text or another voice (`TakeStale`); a generated
  sound whose request hash has moved (`AssetStale`); once every take is
  recorded, an audio master that is missing (`AudioMissing`), not the
  film's length or mixed for another plan than the film's now (`AudioStale`:
  a score pick, a re-take or a moved effect since the last `mix`). `--allow-stale` reports stale takes, sounds
  and master as warnings. `--scene id,id` or `--act name` limits the
  layout leg to that address's scenes. Every command that takes a part of
  the film (`render`, `check`, `cues --short`, the look pass) names it as
  one `Address` (`core/address.ts`: `Film`, `Act`, `Scenes` or `Short`;
  `addressOf` from the flags, two at once an `AddressConflict`) and resolves
  it once with `resolveAddress` into a `Scope`: its placed scenes, its span
  in film seconds (an act or scenes; none for the film or a short), the acts
  it covers whole, and its short. A name the film lacks fails there with
  `UnknownAct`, `UnknownScene` or `UnknownShort`, and scenes the film does
  not play one after another (`--scene a,c` with `b` between) with
  `ScenesApart`: a part is one stretch, so its span, its render and its
  stamp cover exactly the scenes named. `sceneIndexAt(placed, T)`
  (`core/layout.ts`; `sceneAt` its scene) is the one rule for the scene
  playing at a time: the last to have started, within `CLOCK_EPSILON`, and
  the first before the film starts. A sound never generated
  (`AssetMissing`) is always a warning: the mix plays without it.
- **Layout** (headless pages, like `render`): each scene is sampled at every
  mark, every cue's start and end, and its 60% point, pulled after its
  entering transition (mid-transition two scenes cross by design). The player
  draws each sample with the **probe** on and returns every line of text as
  a box in canvas pixels, turned with its transform, and every mark of ink
  (a brush stroke's centre line and width, a fill's outline, a declared
  plate) with its opacity and its place in the drawing order. Two different
  lines both above 0.3 opacity that overlap by more than 4 px either way are
  a `TextOverlap`; a visible line cut off by the frame's edge is a
  `TextOffFrame` (a line wholly outside the frame has slid away and is not).
  A visible stroke whose centre line runs through a visible line's box for
  more than 4 px, where no opaque plate drawn after the stroke covers it, is
  an `InkOverText`, measured along the crossing (a segment-versus-box
  clip, not the bounds). A line on a plate that the frame cuts off, and that
  sits still there, is a `PlateOffFrame`. A line drawn on a declared plate
  (`probePlate`) whose box leaves the plate's box by more than 4 px is a
  `TextOffPlate` (a brief overrunning its card). Findings merge per scene and
  text (or pair), at the worst sampled frame.
- **Holds** (a warning, found in two steps): the static step (`holdCandidates`)
  finds each stretch of a drawn scene over `HOLD` (4 s) inside its voice's
  spoken span (first word's start to last word's end, from the take's word
  timings) where no cue starts, ends or runs and the scene is not arriving.
  The layout leg then looks inside each candidate at one frame per boil tick
  (`holdTicks`, `BOIL_FPS` a second, so a sway slower than the boil is seen
  at more than one phase). It probes a grid tick every `HOLD / 2` first
  (`holdGrid`): a still run over `HOLD` spans two grid ticks in a row, so
  only where two in a row hold still does it probe the ticks around them,
  growing the run each way until a tick moves. Motion no cue declares ends a
  run; the still stretch after it is still found. The longest run over
  `HOLD` is a `StaticHold` with its scene and film `from`–`to`. A mark is at
  rest when its box moves no more than `STILL_DRIFT` of its own units (the
  screen drift over the `scale` the probe records, `sqrt(|det|)` of the
  transform it was drawn under) and its opacity no more than `STILL_FADE`
  (0.02). `STILL_DRIFT` is twice `STROKE_JITTER` (1.1), the most one boil
  tick moves a default stroke's box edge, so a boiling stroke is still at any
  zoom and a walk loop or drifting snow is motion. Glyph and torn-edge boil
  never reach the probe: `write` records its box from the unjittered glyphs,
  `cutout` the shape it was given. The caption line and its plate are the
  voice, not the picture: the caption probe tags them `caption`, and the diff
  leaves them out, whatever they say. Known limits: the diff sees boxes and
  opacity only, so a colour change (a dawn warming, a stain fading by
  `fillStyle`) and anything the probe does not see (`unprobed`, `drawImage`
  textures, raw canvas paths) read as still, giving a warning that asks for
  a look; a stroke drawn with a `jitter` over the default boils past
  `STILL_DRIFT` and reads as motion. `film check` stays
  green on it; `--static` skips it, since telling a still picture from
  undeclared motion needs the frames.
- **The ending and the air**: the stretch after the last word under 20 s, or
  an end card (a last scene that speaks nothing) under 5 s, is an `EndShort`
  warning (static). Once every take is recorded, the sound leg renders the
  mix the film makes now in memory (not read from `full.wav`, which may be
  stale) and reads it in 50 ms windows, its sides' power summed as a listener
  hears it (`windowPowers`): a run under −60 dBFS longer than
  1.5 s is `DeadAir`, an error, less any span a cue declares with
  `silence: true` (`{ at: 'start', offset: 2, dur: 3, silence: true }`),
  the designed silences the script means. The same mix is held to the
  balance, as warnings: a master more than 3 LU off −18 LUFS
  (`MasterLoudness`: a hot peak held the mastering lift back), and an effect
  whose loudest 50 ms comes within 3 dB of the voice around it (`EffectHot`).
- **The look pass** (headless pages, `looker.ts`, measures in `look.ts`):
  every scene drawn at 2 fps and shrunk to a 64×36 thumb (the research's
  measure). A second holds when both its half-second steps change the mean
  grey by under 2 (paper grain and boil alone score 0.5–2); a spoken, drawn
  scene held for over 40 % of its seconds is a `HeldShare` warning naming
  its longest held run. A kit's person declares its head with
  `probeFace(ctx, x, y, height)`; a spoken scene whose largest face (seen at
  over 0.5 opacity, its centre on the frame) never reaches a third of the frame's height is
  `FaceSmall`. A floating hand declares itself every frame, at rest or at
  work: `floatingHand(ctx, root, g, style, hand, { over, body })`, given
  whether it is drawn over its figure and the figure's silhouette (`HandBody`),
  calls `probeHand(ctx, { side, shoulder, at, to, size, radius, reach, grip,
  formed, over, body })` from what it knows (its side from `root.away`, where it is, where
  it works (its rest, with no work), its mitten's size, the figure's reach
  radius, how far it has travelled, the grip it works with as shares of each
  grip (`GripShares`: `grip`, or `was` changing into it) and how far that
  grip is formed from the open rest), so any film's hands are checked; it
  is declared even while its alpha hides it. A kit builds the body only
  while `probesHands(ctx)`, so an unprobed frame pays one lookup. Then the hands pass: between two samples of a scene across
  which any hand travels to or from its work, changes its grip at work, or
  comes or goes at work, every frame is drawn again (`handSpans`); a hand
  (found a frame on by its shoulder, within 24 px) that moves about its
  shoulder by more than 1.5 of its length, changes size against its reach
  by more than a quarter, or, formed, swaps more than half of its grip
  (`GRIP_JUMP`: a grip written `raised < 0.5 ? 'hold' : 'palm'`, where
  `was` and `change` on a named cue would morph it) between adjacent frames
  while seen is a `HandJump` warning; each is measured in the figure's own
  reach, so a pan, a zoom or the whole figure scaled is no jump. A hand sent to a target farther from its shoulder than
  the reach, seen, is `HandFar`, one per scene and side. A hand at work
  (travelled 0.9 or more, seen at 0.5) inside its own body's silhouette and
  drawn behind it is a `HandHidden` warning, one per scene and side; a far
  hand passing behind the body on its way to work in front is travel, not
  hidden. `film.ts` may export a `look` (`Look`: acts in film order, each
  `from` a scene, with a `name`, a `chapter`, and `luma`, `saturation` ranges
  and a `dark` share ceiling); over the whole film each act's measure outside
  its target is a `ColourScript` warning. Which scenes an act holds is one
  rule in `core/acts.ts`: `membersOf(parts, ids)` gives each part its scene
  until the next part's, the first reaching back to the film's first scene,
  and fails with `UnknownScene` or `PartOutOfOrder`; `stretchesOf` adds their
  seconds (the first starting at 0), which the score's `movements` read too,
  so a misnamed or out-of-order movement fails as an act does. A film lights its scenes from the same
  acts. The look pass judges only the acts its address covers whole (the
  film: all of them; `--act`: that one; `--scene`: none): an act measured
  on part of itself is not the act.

The probe lives in `canvas/probe.ts`. `write`, `block`, right-to-left text
and the captions record their text through it; `stroke` records its drawn
centre line and `cutout` its outline. A Rive rig declares its figure
(`probeFigure`: its key, its box on screen and its concept), which a
match crops by. A drawing declares the plate its text
sits on (a torn tag, a word card) with `probePlate(ctx, shape, () => write(…))`:
the shape it drew the plate with, and the lines on it drawn inside. A plate
hides what is under it as the text does, so it is measured as text too; the
lines drawn inside carry the plate's `order` (`on`), so a card never collides
with its own lines, while any other text over it does. The kit declares one
plate itself: a storyboard scene's card (`canvas/storyboard.ts`), so its id and
brief are checked against the card (`TextOffPlate`) and against each other
(`TextOverlap`). The films declare the rest (righteousness-by-faith: heaven's
banner, the court and cold labels, the thesis, message and word boards, the
declared card).
With no probe attached a draw costs one WeakMap lookup, and a probed frame
is pixel for pixel the same (it only reads the transform, `measureText` and
the path it was going to draw). The export handle exposes it as `probe(i)`.

What the rules leave alone, and why:

- A fade-out under a fade-in is not a collision (the 0.3 opacity floor), so
  there is no per-drawing allow-list.
- A stroke drawn **under** a line at no more than 0.5 opacity is page texture
  the words read over (greeked copy on a newspaper); drawn over the line, or
  heavy, it strikes it.
- A stroke that marks a line on purpose (an underline, a highlighter swash,
  a ring, a strike) says so with `marks: '<the text>'` in its style; it may
  cross that line and no other. It changes nothing drawn.
- A plate's "plate" is the topmost fill under the line's centre, drawn before
  it. One half the frame wide or high is a backdrop or a panel (a sky, a
  split page) and may bleed; a plate whose line is itself past the edge, or
  that has moved by the next frame (the check draws that frame only for a
  candidate), is entering or leaving.
- A hold leaves out the caption line and its plate, by the `caption` tag the
  caption probe puts on them, not by their words: they are the voice, and
  change over a still picture, while a card writing the same words as they
  are heard is the picture and moves. A storyboard
  card (`storyboard: true` on its scene, set by `storyboard()`) holds still
  over its words by design and is never a candidate.

## Named cues

A moment is declared once. A drawing names the moments something else reads
(a sound, another cue) in its `timeline`, each anchored to a narration
`{mark}`, another cue (`after` its end, `with` its start) or a scene landmark,
never to an absolute second:

```ts
export const justified = drawing({
  timeline: { slam: { mark: 'fiction', offset: 0.9, dur: 0.35, ease: 'inQuad' } },
  draw: (f) => {
    const slam = f.at('slam'); // progress(t, cue.start, cue.dur, ease.inQuad)
  },
});
// sound.ts: the thud lands where the stamp lands.
{ scene: 'justified', cue: 'slam', edge: 'end' }
```

`layout()` resolves every timeline once (`Placed.cues`, scene-local
`{ start, end, dur, ease }`) and returns a `Result`: a film that does not lay
out fails as a value (`LayoutError`) naming the scene and the cue:
`UnknownMark` or `UnknownCue` (with `by`, the cue that named it, and `known`,
what the scene has), `CueCycle`, `UntilBeforeStart`, `WordMissing`,
`DuplicateScene`, or a line that does not parse (`DuplicateMark`,
`TurnInvalid`; `parse(scene, text)` returns a `Result` too). The browser
turns it into a thrown error once, at load (`createFilm`). Every point in a
scene resolves through one function: `pointOn` in `core/timeline.ts` (on a
`SceneClock`), and `pointIn(placed, point, by)` in `core/layout.ts` over a
placed scene. A timeline anchor becomes a `ScenePoint` (`anchorPoint`:
`after` a cue is its end, `with` it its start), as a short's span and a sound
cue already are. A span that `ends: true` ends at its anchor and starts its
`dur` before it. A mark anchor may pin to a word instead of the mark:
`{ mark: 'gift', word: 'faith', dur: 0.6 }` starts on the first word said at
or after `{gift}` that reads `faith` (`wordAfter`/`readsWord` in
`core/narration.ts`, normalised by `normalizeWords` as the take check's word error is: any case, apostrophes dropped, each hyphenated part, accents kept, NFC). `film check` warns `WordPinFar` when the pin lands more than `PIN_REACH` (one) sentence past its mark, where a re-take that lost the word would have moved it. It warns `DurOnWord` (`durOnWords`) where a `dur` of `DUR_MIN` (1 s) or more puts its hand-sized edge (its end, or with `ends` its start) within `DUR_ON_WORD` (80 ms) of a phrase edge of its take (a word heard after, or before, a pause of `PHRASE_GAP` or more, or the take's first or last word): a length sized to this take. It is a report only; the fix is `until` a mark or a word pin. It warns `CueTwin` (`cueTwins`) where a scene declares one moment twice: two cues with the same edges on the same anchors (each `with` and `after` followed to the mark or landmark under it, so `{ with: 'dark', dur: 0.9 }` at `dark`'s length and ease is `dark`) and the same ease, stagger and silence; read the first where both are read. A line that never says it
there fails the layout with `WordMissing` (`core/errors.ts`), which the tools'
`placeFilm` fails with as itself (`PlaceError = LayoutError`),
so `film check` and every tool refuse the film by name; there is no fall back
to the mark. `f.cue(name)` reads a resolved cue and `f.at(name)`
its eased progress. A span declares its easing as data, `ease: 'inQuad'` (one
of the names in `ease`, `EaseName`), and a span without one eases
`inOutCubic`, as `progress` does. `f.at` takes no ease of its own: the ease
lives in one place, so a cue's `ease` written always changes the frame. With `drawing(...)`, a name the timeline lacks, in
`f.cue`, `f.at` or a span's `after`/`with`, is a compile error
(`canvas/drawing.types.ts` holds the checks). The sound plan's `cueTime` reads the same map, so picture and
sound cannot drift apart. Ornament (wobble, idle motion) stays inline.

The lint rule `film/no-hand-timed-seconds` (`lint/no-hand-timed-seconds.ts`)
holds a film to it: it refuses a literal second in a draw (`clamp(t / 2)`,
`(t - cue.end) / 1.5`, `progress(t, 1.2, 0.5)`, `keys(t, …)`,
`cue.end + 0.5`, `f.mark('x') - 0.4`, `f.dur - 1.5`, `t - 4.2`, `t > 3.5`,
`t - cue.start > 0.5`, and the same second held in a module `const`) and a
span offset over 1 s from its `mark` or the scene's `start`/`speech`, which
stands in for a word (pin the word) or for a pause (anchor it to `speechEnd`
or another cue and say why). A rate (`Math.sin(t * 7)`) is not a time. The
rule reads syntax only, so a product is taken for a rate and a local alias of
the clock or a helper hiding the subtraction pass; its doc comment lists the
limits.
`film/span-ends-on-anchor` (`lint/span-ends-on-anchor.ts`) refuses a span
that lands on its anchor written as `offset: -0.5, dur: 0.5`: it is
`{ mark: 'true', dur: 0.5, ends: true }`, its length written once. It refuses
too a part that ends on another cue's end only because the numbers add up,
`{ with: 'speck', offset: 0.49, dur: 0.68 }` beside a `speck` of `dur: 1.17`
(a drag of `speck` leaves it behind): it is `{ after: 'speck', dur: 0.68,
ends: true }` (it keeps its length) or `{ with: 'speck', until: { cue:
'speck' } }` (it keeps its start).
`film/no-ease-on-cue` (`lint/no-ease-on-cue.ts`) refuses `ease.X(f.at(cue))`
(or a const bound to one): `f.at` is already eased by the span's `ease`, so a
second curve is one the lab's picker cannot change, and a push whose zoom
takes it runs on another clock than its x and y. A push is a `shotPath` stop
with `pushInto`; another curve is its own cue or `f.keys`.
`film/no-cue-remap` (`lint/no-cue-remap.ts`) refuses a cue split by a
fraction written in the draw, `clamp(x * 4)`, `Math.min(1, x * 4)`, `clamp(x / 0.6)`,
`clamp(3 * x - 2)` or `clamp((x - 0.75) / 0.25)` over a cue's progress `x`
(`f.at(cue)` or a const bound to one): the part is a cue of its own,
`{ with: 'answer', dur: 0.4 }` or `{ after: 'into', dur: 0.1, ends: true }`,
which the lab can reach; a part that runs to the cue's end, `(x - a) / (1 -
a)`, is told to land there, `{ after: cue, dur, ends: true }`. It refuses a step part way through a cue the same
way, `x < k` (`<=`, `>`, `>=`, either way round) with `k` between 0.02 and
0.98: the instant is a cue of no length, `{ with: 'sit', offset: 0.056, dur:
0 }`, read as `f.at('colour') > 0`. A comparison nearer 0 or 1 asks whether
the cue has begun, is seen or is done, and passes. An instant the drawing's
own shape makes (a card that flips shows its other side once edge on) is
read from the shape, `Math.cos(f.at('flip') * Math.PI) < 0`, which no
comparison of a share refuses and a drag cannot leave behind.
`film/framing-is-a-knob` (`lint/framing-is-a-knob.ts`), on a film's scene
files, refuses a framing written out (`{ x: 1060, y: 580, zoom: 1.18 }`) or
blended by hand (`zoom: lerp(1, 1.12, f.at('hold'))`, `cam.zoom = lerp(…,
ARK_IN, …)`, a camera spread from another with a field blended over it,
`{ ...cam, zoom: lerp(cam.zoom, 1, roof) }`): a framing is knobs read with `knobCamera`, a move a
`shotPath` of them, a held push `pushOn` with a number knob. The unmoved
frame (`UNMOVED`, `canvas/camera.ts`, whose numbers the rule reads) and a framing derived from the scene's geometry (a point that is not
two numbers) pass; one shared across scenes lives in a set file.
`effect/noPointFreeLog` (from `oxlint-plugin-effect`) holds the tools too,
over all of `packages/film` and `apps/animations`: a variadic logger
(`Console.*`, `console.*`, `Effect.log*`) handed point-free to a callback that
is passed an index (`Effect.forEach(lines, Console.log)`, `xs.map(console.log)`)
prints the index after each line, so a reader of `film lab events --follow` gets a
field that is not there. Write `(line) => Console.log(line)`.
`film/no-read-once` (`lint/no-read-once.ts`) holds the lab's browser tests
(`*.dom.test.ts`): a test waits for the value it asserts through
`src/lab/fixtures/settled.ts` (`textIs`, `textHas`, `textsAre`,
`attributeIs`, `attributesAre`, `countIs`, `evaluates` for a
script's answer, `waitFor`, `attached`, `until`), and a read that times out
fails naming what it wanted and what the page last showed. A one-shot read
(`textContent()`, `$eval`, `$$eval`,
[`isVisible()`](https://playwright.dev/docs/api/class-locator#locator-is-visible),
`getAttribute()` or `count()` on the page or a locator, and an `evaluate(…)`
whose answer `expect` asserts or a matcher compares with, followed through a
`const` bound to it, a local helper that answers it, a part of it, a
literal that holds it and a value computed from it, as `after - before`)
takes whatever the page had drawn at that instant, and
is refused. An `evaluate` run for what it does is an action, and so is one
whose kept answer only a wait reads (a baseline the page keeps).
`effect/requireSpawnBudget` (from `oxlint-plugin-effect`) holds every test of
`packages/film`: a test whose body spawns a process (effect's
`ChildProcess.make`, the global `Bun`'s `spawn` or `spawnSync`, `spawn`
imported from `bun`, `node:child_process`, or a function of the same file
that does) gives its timeout in milliseconds as its last argument, its
spawn budget, at least 20 s (its `minimum`): a cold start's time is the
machine's, and a shorter budget fails a loaded one sooner than none.
A spawn inside a service the test provides is not seen.
`film/tests-keep-their-strength` (`lint/tests-keep-their-strength.ts`) holds
every test, fixture and preload of the repo: a test runs every time at its
full strength. It refuses a runner member that runs a test less (`.skip`,
`.only`, `.todo`, `.failing`, `.skipIf`, `.todoIf`, `.if`, `.runIf`, and the
`x`- and `f`-prefixed runners), a `retry` in a test's options, a timeout of
a test's own over bun's 5 s or of 0, which sets none (or one it cannot read),
unless the test starts a process (its body, a function or a module `const`
of the file it reads, the same starters as above), and a `setDefaultTimeout`
over 5 s or of 0. oxlint's own
jest and vitest rules see no runner imported from `bun:test` or
`effect-bun-test`, so they are not used. The browser suite (`e2e/`) sizes
its own timeouts (`{ "timeouts": false }`). A spawn the rule cannot see (one
inside a provided service) is said where it stands, by a disable comment
that names it.
`film/no-lazy-test-fixture` (`lint/no-lazy-test-fixture.ts`) holds every
test file of the repo: a fixture the file's cases share is not a memo made
as the file loads (`Effect.cached` and its TTL forms, outside every function
but a `describe` body), which the first case to ask builds inside its own
time limit, so the case that pays moves with the order the cases run in. It
is built as the file loads (`const x = await Effect.runPromise(…)`, beside
an `effect/noAsyncFunction` disable that says so), or in each case.
`film/touches-serial` (`lint/touches-serial.ts`) holds the browser tests
(`e2e/`): a finger (`page.finger`, one or two) is read, and the touch gesture
(`touch`, `lab/fixtures/gestures.ts`) called, only inside a `test.serial(…)`
body, since while one tab's touches are under way Chrome drops, or lands as a
bare click, the touches a file's other cases send their own tabs at the same
time.
`film/told-after-answer` (`lint/told-after-answer.ts`) holds the browser
tests (`e2e/`): a fake route tells the case it was asked only through the
harness's `told(tell, then)` (`src/lab/fixtures/harness.ts`), which runs the
tell once `then` is made: a `madeBy` once its effect has run, a `later`
before its gate. A completed `Deferred` runs the fiber waiting on it at once,
inside the call, so a case told before the answer is made runs its next step
(another hand's write, a line put back) first, and the answer made after
reads what that step changed: the read the case was told of never reaches
the page. Refused is a call of effect's `Deferred` that completes one
(`done`, `doneUnsafe`, `succeed`, `fail`, …) anywhere in the answer handed to
the harness's `route(…)` (a condition, an expression body, an effect it
makes), but inside `told`'s first argument, or on a `Deferred` the answer
makes itself; `route`, `told` and `Deferred` are read by their bindings.
`film/no-history-comment` (`lint/no-history-comment.ts`) holds every comment
in `packages/film`, `apps/animations`, `packages/ui`, `packages/url-state`
and `packages/atom-solid`: a comment says what the code does now and why, and
how it got here lives in the ledger and `git log`. It refuses only the forms
history takes on its face: a loop pass by number, a batch id, a ledger id and
a commit hash, each outside a quoted literal and a URL. History told in words
(what the code used to do, which pass changed it) is a review finding
(`CLAUDE.md`, **Comments**), since no pattern can read it.
**A mistake found once** becomes a check, so the gate (`bun run gate`, the
feedback cycle) finds it the next time: a mistake a syntax tree shows is a
deterministic rule; one only a reader can see is a judged rule with its
labelled corpus; one of taste or process that no item shows is a line in a
skill. For example, a review found a `describe.skip` and a test's timeout
raised to 120 s, which a tree shows, so `film/tests-keep-their-strength` is
a rule of the house plugin (`lint/tests-keep-their-strength.ts`, its cases in
`lint/fixtures/` held by `lint/plugin.test.ts`, on in `.oxlintrc.json`). The
owner twice took Ellen White, the pioneers and 1888 out of a film's
narration; no pattern tells a pioneer named from his idea told unnamed, so
`judged/scriptSpeech` is an entry in `.oxlintrc.json`, its corpus of the
removed beats and their clean rewrites in
`packages/scripts/src/judged/fixtures/script-speech.json`, its threshold set
from `judged:measure`. A film that ended somewhere else than it opened is no
item of any file, so it is a line of the film skill
(`.claude/skills/film/CRAFT.md`, **Bookend the setting**).
**Judged rules** are the rules a pattern cannot decide, decided by a model
and reported by oxlint. Each is an entry `judged/<id>` in `.oxlintrc.json`,
its options its whole definition (`packages/scripts/src/judged/rule.ts`): a
selector (which items it reads), the subject, the classify instructions and
criteria, the label that reports, a threshold and a message;
`settings.judged` names the model by its exact id (`jev-1.13.0`), whose
measurements set the thresholds, and where the answers are kept. Its
severity is its gate: `warn` reports, `error` fails the lint, `off` judges
nothing. The rules are `historyComment` (a comment's history), `testOracle`
(a test whose oracle is its code), `silentDrop` (a function that drops what
it cannot handle unsaid), all at `warn`, `scriptSpeech` (a film beat that
names its sources or church history), at `error`, and `commentClaimsCode` (a
comment that claims more than its code), `off`: reviewers found none of its
findings over the repo true (`docs/lessons.md`); over each,
`.oxlintrc.json` says what its corpus measured. To add one: write its entry
in `.oxlintrc.json` (at `warn`), add its id to `RULE_IDS` in
`packages/scripts/lint/judged.ts` (the plugin defines each rule by name, and
`packages/scripts/src/judged/config.test.ts` holds the two lists equal, an entry at `off` too), write its labelled
corpus in `packages/scripts/src/judged/fixtures/`, and measure it. `bun run
lint` (and so the gate) runs the runner (`packages/scripts/src/lint-judged.ts`,
`bun run lint:judged`) first and oxlint after it. The runner reads every item
of every rule in the working tree, tracked or new (git's ignored files and
the config's `ignorePatterns` aside; a series script's Markdown in its tables
and its `**say:**` and `**picture:**` paragraphs), and asks TypeSafe's model
about all those the store does not answer in one request, split past 200
items, about 60,000 estimated input tokens, or 30,000 for the state and any
one question (TypeSafe holds a question to 32,768; each rule's
`charsPerToken` is what Jev counted over its items), a part the model still
refuses as too long asked again in halves. The store (`settings.judged.store`, in
git's common dir, which every checkout and worktree of the repo shares, a
merge audit's scratch worktrees too) is keyed by content: a hash of the words the
model reads for the rule (subject, instructions, criteria), the model, and
the item's key: what of it a formatter does not change, code by its parsed
form (each node's type and fields, not where it stands or how a number or
a string is spelt; a template's raw text stays) and comments and prose by their words, each run of whitespace one
space (`packages/scripts/src/judged/items.ts`). So a rerun asks only for an
item or rule words it has not seen, an edit a parser sees or to a rule's
words asks again, a threshold or a message changes no
answer, and a moved, copied or re-indented item keeps its answer; a run
marks each answer its tree reads seen that day, and drops an answer no
checkout has read for 30 days (`MAX_AGE_DAYS`), never one another tree reads.
Two runs that ask one item at once keep the answer kept first, and each
reports by the store's answer.
The checkout keeps its own two files beside (`settings.judged.checkout`,
`tmp/judged`): a memo of each file's items and their keys by the file's
hash (`items.json`), so a run parses only the files changed since, and the
run's findings by file (`findings.json`). The plugin (`packages/scripts/lint/judged.ts`)
reports a file's findings from the last run when the file hashes as it did
then, the rule's words, selector, label, threshold and model are the same,
the code that makes the items is the run's, the run read the store the
settings name now, and the run is no older than `MAX_AGE_DAYS`; otherwise it hashes each item of the file the same way the runner does and
reports the kept answer at or over its rule's threshold at its line,
wherever the text now lives. It asks no model, so a checkout with no store
reports nothing. The runner
prints, and gates on, only the findings oxlint cannot report (a Markdown
series script, an answer the store could not keep), and one line a rule;
`--strict` prints every finding and fails on any. It never fails on its
model or its host: no key (`TYPESAFE_API_KEY`, else the keychain item
`typesafe-api-key` within 2 s), a part past 5 s, an account with no
credits left, a rate limit or an overloaded host (a 429 or a 529, each sent
again up to three times inside the part's 5 s, after the wait the refusal
names or a backoff from 250 ms), an HTTP error, one item alone past the
input limit or an answer that misses items passes (after no key, no
credits, a rate limit or an overloaded host past its retries, or a part
past 5 s, no part not yet sent is sent), and prints
`[judged] skipped rule=<rule> reason=<reason> items=<n>`; any other failure
(git, the lint config, a defect) is `rule=* reason=error` with
`detail=<tag>`, a store that does not decode is read as empty with one
`[judged] store unread` line, and answers the store cannot keep are asked
again next run. Two runs keep their answers under one lock, SQLite's write
lock on a file beside the store (`.store.json.lock`, never removed), held
from the read to the write: the kernel lets it go when its run ends, so a
run that dies leaves none to take. The store is written whole through a
temporary file, removed if the write fails, so neither run loses the
other's answers. The key goes only to
TypeSafe's own host, and the runner reads no `.env` file (`bun
--no-env-file`): none in a checkout sets its key or a proxy. A rule stays at
`warn` until its labelled corpus shows the precision a gate needs; `bun run
--cwd packages/scripts judged:measure --rule <id>` measures it there and
prints its precision and recall at its threshold and at others. Before a
change of the runner's request form, its packing or its model lands, `bun
run --cwd packages/scripts judged:quality` asks a seeded sample of the
repo's answered items again as the runner now asks (300 drawn at random and
100 kept findings a rule, about 0.7M input tokens) and prints, a rule, how
many kept their label and their finding and how far the answers moved; it
keeps nothing, and no gate runs it.
`film/drawing-literal` and `film/no-unprobed-ink` hold a film's scenes to
what the lab can locate and what `film check` can probe; the films' README
(`apps/animations/README.md`, **Lint**) says what each refuses.
`film/one-breakpoint` (`lint/one-breakpoint.ts`) holds the pages' TypeScript
(`lab/`, `player/`, `browser/`, `command/`) to the studio's one breakpoint: a
media query width written out
(`(max-width: 899px)`, `(width >= 900px)`, in any unit, or built from a number
in a template) is refused, and the window is asked through `PHONE` or `WIDE`
(`lab/viewport.ts`). A feature query (`@supports (width: 900px)`) passes.
`film/booleans-through-pressed` (`lint/booleans-through-pressed.ts`) holds
the lab's components: a boolean a control shows (`aria-pressed`,
`aria-expanded`, a `data-*` flag the source proves a boolean) is written by
`pressed(on)` (`lab/pressed.ts`), never by hand as `String(x)`,
`x.toString()`, `JSON.stringify(x)` or `` `${x}` ``. The player, which may
not import the lab, is outside its reach.
`film/one-clock-epsilon` (`lint/one-clock-epsilon.ts`) holds the code that
computes times to one owner of the grid, `core/time.ts`: a nudge written
beside a time (`Math.ceil(t * fps - 1e-6)`, `m - 1e-3`, a const holding one)
is refused, and so is `CLOCK_EPSILON` inside a rounding call, which judges two
times one and puts none on a grid (`frameAtOrAfter`, `frameAtOrBefore`,
`onTheMs`, `heardAtOrAfter` and `justBefore` do).
`film/lock-through-sqlite` (`lint/lock-through-sqlite.ts`) holds all of `src`
but the lock itself, the tests and the fixtures: a manifest's lock file is
opened by SQLite alone
(`tools/manifest-lock-bun.ts`), so its `lockFile` is called, and a lock
file's name (`.catalogue.json.lock`) written, nowhere else; closing any other
handle on the file lets go of the process's lock.
`film/no-test-seam` (`lint/no-test-seam.ts`) holds every package's `src`: a
package's test-only doubles live in its `testing.ts` seam (`core/testing.ts`,
`tools/testing.ts`, `@bible/url-state/testing`, `@bible/core/<area>/testing`),
and product code imports none, by a relative path, a package export, a type
import, a re-export or a dynamic `import('…')`. The tests, the fixtures, the
seams and the type tests are let off.
`film/synth-own-math` (`lint/synth-own-math.ts`) holds the sound graph
(`core/synth/graph/`) to the same samples on every host: a host's `Math.sin`,
`exp`, `log`, `pow` and `tanh` are approximations its engine chooses, so the
graph's are its own (`core/synth/graph/math.ts`), built from + − × ÷ and
`Math.sqrt`, which IEEE 754 rounds alike everywhere. It refuses a read of the
global `Math` but its exact members (rounding, sign, comparison, `sqrt` and
the constants), `**` and `**=`, and a value imported from outside the graph's
folder but the seeded generator (`core/random.ts`) and `effect`'s
`Predicate`, `Schema` and `Match`, so no helper brings the host's maths in.

Every name a rule reads a meaning into is read by its binding where it is
written, through one reader, `lint/nodes.ts` (`bindings`: `definitionOf`,
`importsAs`, `readsImport`, `callsImport`, `isGlobal`, `framePart`,
`readsCue`, `takenFrom`, `readsOf`, `isRunner`): an import
under an alias or read off its module imported whole (`clamp as cap`,
`Core.clamp`) is the import, and a parameter or a local of the same spelling
(`Math`, `t`, `window`, `test`) is its own name. A module is told by the path
a relative specifier resolves to from the importing file, so core's own
`./time.ts` is `core/time.ts` as `../core/time.ts` is. A global is the global only
where the file binds that name nowhere; the frame's `t`, `T` and `at` are the
frame's only when read off the parameter a drawing's `draw` or `light` is
handed, or one typed `Frame`. A member read off
a value handed in (`page.finger`, `page.evaluate`, `hub.keysOf`) is read by
its member's name, since the rule cannot type the value. `.oxlintrc.json`
refuses the scope tree's own readers to every module of `lint/` but
`nodes.ts`: the imports (`Scope`, `SourceCode`, `Variable`, `sourceCode` and
their kin, from `oxlint-plugin-effect/rule-bindings` or from the package root,
whose `ruleBindings` is refused too) and, through a rule's own context, the
properties `getScope`, `getDeclaredVariables`, `scopeManager`,
`isGlobalReference` and `markVariableAsUsed`, so a rule cannot grow a second
reader.
`lint/plugin.test.ts` runs oxlint over the marked fixtures: every RED
location must report its rule, with no extra findings. Each of the plugin's
twenty-five rules (`lint/plugin.ts`) also has a diagnostic whose corrective
message is asserted, including the distinct anchor-end and cue-part repairs,
so a rule that fires but gives the wrong advice fails the fixture suite; the
test holds that list to the plugin's rules.

The package's `test` script runs the unit tests under `src/` and `lint/`.
The root `test` and `gate`, including the CI gate, run this browser-free
suite. Each run writes its files' times to a timings file in the package's
installed modules (the script's `--timings` and `--update-timings`), and the
next run starts the slowest files first, so a long file does not begin last
and run alone. A fresh checkout, CI's among them, has no times yet and runs
the files in their usual order. The suite stays inside the repo's ten-second
budget (`bun run test:budget`). E2E files live separately under `e2e/`, so
those paths do not discover or execute them. Their source remains linted and typechecked.

Run `bun run test:e2e` from the repository root or this package to exercise
the real browser workflows and canvas pixel checks. The E2E script uses
`src/lab/fixtures/run-suite.ts` to compile fresh browser bundles and run
`bun test --parallel --no-isolate --max-concurrency=3 --preload ./e2e/preload.ts --timeout 20000 e2e`.
Its folder (the bundles, the workers' Chrome profiles) is removed once every
process whose command line names a path in it has ended
(`src/lab/fixtures/run-folder.ts`): Bun's recursive remove fails when an
entry goes from under it.
A browser-free film test that sets no timeout of its own has bun's own 5 s,
so the `test` script names no `--timeout`, and a browser test has 20 s
(`E2E_TIMEOUT_MS`, `src/lab/fixtures/test-timeout.ts`);
`test-timeout.test.ts` holds the scripts to both. The preload `bunfig.toml`
names (`src/lab/fixtures/preload.ts`) passes the first to effect-bun-test's `setDefaultTimeout`: the
deadline its runners hold for the whole process, at which they interrupt a
concurrent case, since a test cannot read `--timeout`. So a runner case that
times out has its scope closed, its tabs and its lab, at its limit. The
`test:e2e` script preloads `e2e/preload.ts` after it (bun runs a
`--preload` after bunfig's), which passes the second, and passes it as
`--timeout 20000` too: bun keeps a preload's default for a process's first
file only, and the script runs several files in one process
(`--no-isolate`), so plain `test(...)` calls and hooks in the later files
take theirs from `--timeout`. A browser-free test is never given more time
than bun's 5 s, but a test that spawns names its spawn budget
(`film/tests-keep-their-strength`, `effect/requireSpawnBudget`): a slow test
is made fast. A browser test given more time gives it a timeout of its own: a
different `--timeout` on the command line reaches only plain tests and hooks
in files after a process's first, never
the runner cases. On CI the runner takes eight workers, or the host's core count when smaller;
on a shared machine (the laptop, the workbox) it takes the cores free when it
starts, the core count less the one-minute load, at least two and at most the
cores (`src/lab/fixtures/workers.ts`), and prints the count it took. Each
worker keeps its module registry and Chrome across files. Test files restore
the global state they change. E2E cases retain native input, actual browser
recording and pixel assertions. Neither the gate nor CI runs it: a unit runs
it by hand, through `test:e2e:check`, when its change touches the pages. The fake server answers
only paths `LabHttpApi` declares (`declares`, `core/api.ts`): a fake matching
any other path answers a 500 naming it, so no case passes over a route the
real server does not serve.

`bun run test:e2e:check [--base <log>] [--log <log>]` runs the same suite
and says what the change under test caused. It takes the host's e2e lock
itself for the whole run (`flock /tmp/bible-tools-e2e.lock` on the workbox,
`lockf -k` on a Mac, which has no `flock`), so two workspaces on one machine
queue; it says so before it waits. Do not wrap it in `flock` or `lockf`: run
inside an outer lock on that file, it sees the lock in its ancestors and runs
in that hold rather than wait on itself. Holding the lock, it waits for the
host's one-minute load to fall to its core count, at most twenty minutes,
saying each minute how long it has waited; then it runs, and the verdict
records the load it started at and the wait.

The suite's output prints as it runs and is kept in `<log>` (by default
`tmp/e2e/<time>.log` at the repository root). The check reads three kinds of
failure from it: a failed case, a worker that crashed with its file, and an
error bun caught between tests, under the file printed above it (bun's
` N error` count beside them: an error the log does not place is a failure
of its own). It also reads whether the suite finished, by bun's
`Ran N tests across M files` line. Every failure reruns alone three times
(a case by its name, a file's failure as the whole file) in one worker, at
the suite's own `--max-concurrency`, its output in `<log>.alone.log`. Bun's
own summary of a rerun (` N fail`, ` N error`) says whether it passed: an
exit that is not 0 after bun passed the case is the runner's, not the case's.

`<log>.verdict.md` then classes each failure:

- **green-alone**: green in all three reruns. The suite failed it only beside
  the rest of the suite. That is load, or order (a case another case left
  running, since `--no-isolate` shares a worker); the reruns do not tell which,
  and do not rule out a slowdown the change caused that shows only under load.
- **base**: red alone, and the base's own check saw the same failure (same
  file, same name) red alone too.
- **unit-caused**: red alone, where the base passed it: the base's suite
  finished without failing it, or its check saw it green alone.
- **unresolved**: anything else. It was red alone with no base given, or the
  base's log failed it with no rerun to say why (a loaded base proves nothing),
  or a rerun ran no test (its filter matched none), or the log placed it in no
  file.

The base (`--base`) is a log of the suite on the change's base: an earlier
check's `<log>`, or a plain `bun run test:e2e` log. A check also writes `<log>.verdict.json`,
its reruns as data, and a later check given that `<log>` as its base reads it
from beside the log. So to resolve a failure red alone at the head, run the
check at the base and pass its log. The check exits 1 when a failure is
unit-caused or unresolved, when the suite never finished, or when it failed and
named no failure; otherwise 0. `src/lab/fixtures/e2e-verdict.ts` holds the
reading and classing.

A case that fails only on a loaded runner is a race: something it waits on
lands in another order there. `FILM_E2E_CPU_THROTTLE=<rate>` slows every tab's
page that many times (Chrome's CPU throttling, set as `openTab`
lends the tab and set back before the view returns to the pool; read once
from the process's environment in `src/lab/fixtures/browsers.ts`), as a slow
phone or a loaded runner runs it. Throttle one case, by its file and `-t`,
under the e2e lock the check takes, never bare and never the suite: at 20 the
page's own work takes seconds, and a suite of them only times out. From
`packages/film` on a Mac:

```sh
FILM_E2E_CPU_THROTTLE=20 lockf -k /tmp/bible-tools-e2e.lock \
  bun src/lab/fixtures/run-suite.ts --max-concurrency=3 --preload ./e2e/preload.ts --timeout 20000 <file> -t '<case>'
```

On the workbox, `flock /tmp/bible-tools-e2e.lock` in place of `lockf -k …`.

## Knobs

A value a note might ask to tweak (where a hand rests, a tag's angle) is a
knob: declared once on the drawing, read by name.

```ts
export const hand = drawing({
  timeline: { ... },
  knobs: { palm: [960, 800], tagAngle: 0.12 },
  draw: (f) => {
    const [x, y] = f.knob('palm'); // a point
    const rot = f.knob('tagAngle'); // a number
  },
});
```

A knob is a number or a point (`Knob` in `core/schema.ts`, decoded with the
scene); `layout()` carries them into `Placed.knobs`. With `drawing(...)`,
`f.knob` names only declared knobs and returns the declared kind (a number
stays `number`, a point `readonly [number, number]`). Promoting a constant to
a knob draws the same frame; it is what lets the lab tweak it.

## Plates at depth

A shot can be plates at depth in a `multiplane` with a slow eased camera
through them, rather than a flat cutout.

- `canvas/camera.ts`: `planeView` is the view a plane at `z` sees through the
  shot. A `multiplane`'s
  `haze` takes a sky of stops as well as one colour.
- `canvas/grade.ts`, through `finish` in `createFilm`: `bloom` (bright parts
  bleed light) and `grade` (an S curve, split toning of the shadows and the
  highlights, and saturation), applied before the grain.

## Rive

A figure can be a Rive rig: bones, skinned paths, constraints and a view
model built in Rive and drawn in our frame, under the frame's own transform.
Rive draws the picture; the clock, the narration, the cues, the probes and
the checks stay ours.

- **Declared by its drawing.** A drawing names its rigs as it names its knobs
  (`drawing({ rigs: { accused: spec }, draw: (f) => f.rive('accused', pose) })`).
  A spec (`RivePropSpec`, `@bible/film/rive`) is the rig's built file
  (`import riv from './x.riv' with { type: 'file' }`), its artboard, the
  timelines and view-model numbers a pose may name, its engine, which
  artboard point stands at our origin, its
  face node, and how it follows the shot (`ink`: the number `ink` at the
  shot's scale, frame heights per unit, set each frame before the pose's
  numbers, so a pose that names `ink` sets it itself). `f.rive` takes only a declared
  name, and a pose (`timelines`: each `[name, seconds, mix?]`; `numbers` by
  name; `size`: how many times the space it stands in it is drawn, its shot
  read before it, so a hand drawn larger than the hand rig follows its
  figure's shot) names only that rig's timelines and numbers: anything else
  does not compile (`canvas/drawing.types.ts`).
- **Loaded by its film.** The film's rigs are the ones its drawings declare
  (`film.rigs.declared`), never listed a second time. `loadRigs`
  (`src/rive/load.ts`) loads them through the `RiveRuntime` service before
  the first frame and stands them on that film value: `narratedFilms` with
  the page's layer (`rive/runtime-browser.ts`: each engine's wasm from the
  package's asset URL, the `.riv` through the page's `HttpClient`),
  `check --draw` with Bun's (`rive/runtime-bun.ts`: the wasm and the `.riv`
  from the filesystem; the stand-in document stands only while the runtime
  starts). A loaded rig is its file, parsed once; every wasm object it holds
  (the file, the artboard its names were checked on, the scratch matrix,
  renderers, GL targets) belongs to the load's scope. Two films never share
  a rig.
- **Owned by whoever loaded it.** The consumer that loads a film owns its
  rigs and closes them: a film's load is a scoped Effect (`Films`,
  `player/main.ts`: `Effect<Film, FilmUnloadable, Scope>`; `narratedFilms`
  loads the rigs into the scope it runs in, a short's page into its
  film's), run on the consumer's own fiber, so no lifetime crosses a
  Promise and stopping the consumer stops the load where it is. The
  player's page (`stageFilm`) runs it in the page's own scope, which lives
  as the page does. `loadRigs` holds what it acquires in a
  scope only it can close while it runs, and hands that scope to the
  caller's once done: a load that fails or is stopped frees what it had
  made, with the caller's scope still open (`player/narrated.test.ts`), and
  a caller's scope closed mid-load frees the load's objects only after the
  load is done with them, standing no rig (`src/rive/rive.test.ts`, which
  counts every call on a file after its unref). A film value loaded into
  two scopes draws with whichever load still stands, in any order of
  closing.
- **One GL budget.** A `webgl2` rig's targets are held in the page's
  context budget with `glCanvas`'s keys (`holdGl`, 8 live; `dropGl` when the
  rig's scope closes), so rigs and a 3D look never pass the browser's cap
  between them. A target whose context is lost (the budget let it go, or the
  browser did) is made anew and primed before the frame draws on it; where
  no context can be made the draw fails, naming why, and is never a blank
  frame (`e2e/canvas/rive.pixel.test.ts`: past Chrome's cap and past the
  budget, every frame's pixels are a fresh page's). A name the file lacks fails the load (`RigNameMissing`, listing
  what the file has; a rig that follows the shot lacking the number `ink`
  among them), a file that cannot be read fails it (`RigUnloadable`),
  and a frame that draws a rig its film has not loaded throws: there is no
  fallback picture.
- **A frame of its own.** A frame is a function of its pose, whatever was
  drawn before it, by construction (`canvas/rive.ts` `drawRig`): each frame
  makes an artboard instance of its own from the loaded file and a
  view-model instance of its own (the model's defaults), binds them, sets the
  pose's numbers, applies the pose's timelines in order (an instance of each,
  made and deleted), advances the artboard by no time (which applies the
  binds, with no state machine) and draws, then deletes both. No instance
  outlives its frame, so nothing an earlier frame did reaches it:
  - Rive keeps a shape's paths in the shape's own space and remakes them only
    when a path's geometry changes or the shape-to-path transform moves past
    16 float epsilons
    ([`PathComposer`](https://github.com/rive-app/rive-runtime/blob/main/src/shapes/path_composer.cpp)
    in rive-runtime), so an instance posed
    again keeps the paths an earlier frame made, with that frame's rounding
    (rigs with no boil too: the fixture arm 22 of 60 shuffled frames, the
    cold-studies accused 59 of 60);
  - a state machine keeps its state and a transition in flight, so the rigs
    have none: the binds apply on the artboard's own advance;
  - a constraint never solves from the last frame's bones, and a bind that
    writes back into the view model never reaches the next frame.

  `src/rive/rive.test.ts` proves it number for number: Rive's Canvas 2D
  runtime draws the arm into a context that writes down every path's
  commands, and through 60 shuffled times, each after poses with the IK held
  full on and let go, every frame's paths are a newly loaded rig's. The same
  test, run on the earlier design (one instance posed from rest, made afresh
  by an authored `fresh` timeline) with that timeline emptied, has 60 of 60
  frames off. Cost (this Mac): posing a frame in Bun, 9.2 µs for the fixture
  arm and 89 µs for the cold-studies accused; a page's draw of the accused,
  0.60 ms a frame on `canvas` (0.35 ms posed from rest) and about 19 ms on
  `webgl2` under SwiftShader, either way. The draw path allocates the frame's
  own Rive instances (made and deleted within it) and, on `webgl2`, the one
  `getTransform` it reads. Every instance a frame makes is held in the rig's
  in-flight slot until the frame ends: the draw path runs no Effect and no
  try/finally, so a frame the runtime throws in leaves its instances there,
  and the rig's next frame deletes them as it starts, or the rig's scope as
  it closes (`rive.test.ts` injects the runtime's own throw three frames
  running and counts nothing left).

- **Two engines.** `canvas` (`@rive-app/canvas-advanced`) draws with Rive's
  Canvas 2D renderer on our own context. `webgl2` (`@rive-app/webgl2-advanced`)
  draws with the Rive Renderer on a WebGL 2 canvas off the page and
  composites its box in: a 512 px tile where the box fits, else the frame's
  size, each primed with the rig at rest before its first real frame, so no
  buffer is sized by the frames before. A page with no WebGL 2 fails the
  `webgl2` load, naming why. Every Chrome draws WebGL 2 on SwiftShader: the
  browser tests' (`--enable-unsafe-swiftshader`, `lab/fixtures/browsers.ts`),
  which Bun spawns with `--disable-gpu`, and the renderer's, whose GPU runs on
  macOS for the encoder while `--use-angle=swiftshader` keeps WebGL off it
  ("Encoders").
- **In Bun** nothing is drawn (`paints: false`): the rig is posed for real and
  its face node declared to the probe (`probeFace`), so `check --draw` finds
  ink over a rig's face and a frame that is not pure.
- **Written in the house look.** A film's figure rigs are TypeScript that
  the house prints as RML: the film lays its figures in one file
  (`figuresFile`, `@bible/film/style`), drawn by the generator's parts
  (`src/style/rig/`, the house's alone: no package export reaches it) in
  the house's line, compiled offline and unsigned by the Rive CLI
  (`compile`, `@bible/film/style/build`) into the film's committed `.riv`.
  RBF's build (`apps/animations/src/films/righteousness-by-faith/rigs/build.ts`)
  writes its `figures.riv` and the stamp of what it was built from, and its
  test holds the file to the rigs through that stamp (`unbuilt`) with no CLI;
  both hold first each override on a figure to the owner's word on that
  figure, a decision on his production's ledger filed at the point
  `item:<item>`, after the lock it frees, in its words or with the pick it
  cites (`unsaid`), then each figure he locked to its lock and the lock to
  the decision it names (`unlocked`). An override in words he never said, in
  his words on another matter or citing a pick he never made stops them, and
  so does a locked figure whose print is not the one its lock file holds:
  the hash is the lock file's alone, so a review reads every change to one;
  cold-studies' file
  (`apps/animations/src/films/cold-studies/looks/rive/figures.riv`) is frozen,
  never rebuilt.

The fixture rig is `src/rive/fixtures/arm/arm.rml`, built to
`build/arm.riv` with `cd src/rive/fixtures/arm && rive . --once` (Rive CLI
1.5.1); `canvas/fixtures/arm.ts` declares it, `src/rive/rive.test.ts` and
`e2e/canvas/rive.pixel.test.ts` prove the invariants above. The ink
fixture, `src/rive/fixtures/ink/ink.rml` (built the same way), is a stroke
bound through a range mapper to the number `ink` over a light core and a
centred one: `src/rive/rive.test.ts` draws it with Rive's Canvas 2D runtime
and reads each stroke's width, as cut at 1, three quarters of the ink past
the core at 0.75, and set from the shot's scale for a rig that follows it.

## The purity rule

`src/core` never touches the DOM at runtime (type-only DOM references are
fine) and never imports from `canvas`, `player` or `tools`. Bun scripts,
tests and the browser all read it; `tools` is Bun-only. `canvas` may import `core`; `rive` (the Rive loader and its runtimes) may import both; `player` may import all three. `style` (the house look: its numbers, the figure generator and the rig build) may import `core` and `canvas`, and a film's scenes and rigs import it. `.oxlintrc.json` holds the import direction with `no-restricted-imports`: `core` imports no `canvas`, `rive`, `style`, `player`, `tools`, `lab` or `browser`, `canvas` no `rive` (its fixtures, which load a rig to draw it, excepted), `style`, `player`, `tools`, `lab` or `browser`, `rive` no `style`, `player`, `tools`, `lab`, `browser` or `command`, `style` no `rive`, `player`, `tools`, `lab`, `browser` or `command`, `player` no `tools` or `lab`, `browser` (the host's adapters) no `player`, `tools` or `lab`, and `command` (the commands, the keymap and the selection, shared by the player and the lab) no `player`, `tools` or `lab`. Each block reads a layer's `.ts` and `.tsx`, and keeps a folder out whether a path names a file in it (`../tools/index.ts`) or the folder itself (`../tools`). An app reaches the film through its package exports (`@bible/film/rive`); lint refuses a relative path into `packages/film/src/` from `apps/animations/src/` (an app file outside `src/`, or another app, is not checked yet).

**The host** (`src/browser/`): every browser API a page reaches goes through
an Effect service there, each with its live adapter (`*-browser.ts`) and a
test layer beside it. A page's root (`mountRender`, `mountFilmStudio`, `mountReview`) builds the
page's host once from `BrowserHost.layer` (`browser/host-browser.ts`,
`hostOf` in `browser/host.ts`) and hands it on: the studio's and
the review's runtimes take it as a layer (`hostLayer`). A page the lab
renders on the server gets `ServerHost.layer(url)` instead
(`browser/host-server.ts`, through `ServerHosted` in `lab/page-server.tsx`):
the request's URL, read only and with no hash, and every other service
inert, answering as a phone held upright (`Viewport.layerPhone`). `browser/` is
framework-free, so the player may import it. Per-viewer settings go through
Effect's `KeyValueStore` (`browser/storage.ts`): `TabStore` over the tab's
session (the receipts, `film-receipts`, a `keptJson`) and `ViewerStore` over
local storage (`film-lab-mic`,
`film-review.quality` and the `film-studio.*` conveniences, each a
`keptText` stored as plain text), each a store
in memory when the page may not use its storage. Every drag (the
player's track, the studio's ruler, a Script clip carried or its edge
pulled, the ink on a frame, the wipe's divider) follows its press through `Pointer`
(`browser/pointer.ts`), which ends it once: lifted, or ended by the browser
(`pointercancel`, `lostpointercapture`, or the page left mid-press: the
window's `blur`, the tab hidden). A surface (a clip carried, an edge
pulled, the ink, a divider, the studio's ruler) follows one press at a
time (`Pointer.press`): a second finger's press on it does nothing. The
lint refuses a press's end heard, or its capture taken, anywhere else
(`film/host-events-through-adapter`). Every key goes through one listener
per page, the hub's (Commands and keys, above), over `Keys.listen`
(`browser/keys.ts`), which hands each press with its key, its physical code
and its target, and drops one already handled or still composing. Every
animation frame (the player's play loop, the review's synced loop)
goes through `Frames` (`browser/frames.ts`):
`loop` steps inside each frame's own callback, `coalesce` paints once a
frame. Every time read goes through Effect's `Clock` on the host
(`monotonicMs`, `timersOn` in `player/throttle.ts`), so a test's clock
reaches it. Every media element is driven through a `Playable` (`browser/media.ts`;
`playableOf` makes one of a `<video>` or an
`<audio>`): time is read from it, a seek is done once its frame is shown,
play and pause are effects. `Media` says what a refused play means
(`Blocked`, `Aborted`, `Failed`), plays muted when the browser refuses
sound (`playOrMute`, the review's players), keeps the page's one voice
heard (`hear`: a take or a reader's Hear pauses the one before it; `hush`:
the film's Play pauses it), makes the narration's audio,
and says which engine a compare plays on (`compare`: WebCodecs panes, or
`<video>` and why), its clock the host's `monotonicMs`.
Every copy goes through `Clipboard` (`browser/clipboard.ts`; the browser's in
`clipboard-browser.ts`): a link written whole, against the page's origin, and
a refusal (`ClipboardRefused`) in the browser's words.
A page's media queries go through `Viewport` (`browser/viewport.ts`;
`useMatches` in a component), whose live adapter is the window's
`matchMedia`, and the only reader of it: the WebCodecs player's
`(pointer: coarse)` probe asks the host's `Viewport` too.
Every request goes through Effect's `HttpClient`: a page's calls through its
one `LabClient`, built once at its root (the review's routes and its
choices' share it; on the server, `LabClient.layerRendering`, whose reads
come back to the lab's own handler, `PageReads`, and go with the page for
the browser to adopt), and a film's timings through `loadNarrated`
(`narratedFilms` takes the client's layer, the page's `fetch` client unless
given). Every link to a review place is the one `Go` (`review/context.tsx`):
a plain click goes there in the page, a modified click is the browser's.

**Footage** (`browser/footage.ts`): a film that reads camera frames (a talk)
says, for each frame, which source frames it reads (`Film.footageAt(T)`,
pure: a source `<name>/<sha12>` and a second in it, aimed at the middle of
the source frame); the host decodes them and hands them to the draw as
`RenderOptions.footage`, so `film.render` stays synchronous and keeps
nothing between frames. Every caller of `film.render` asks first: a still,
a seek, a probe, a look or a contact sheet decodes one frame's reads
(`Footage.ready`), and an export chunk decodes its frames as one run
(`Footage.run`, each source's packets at most once while its times rise).
A frame the host cannot decode fails as `FootageFrameMissing`, never drawn
black. The player's `renderShown` (the frame a still reads) resolves only
once that frame is painted, so nothing reads the canvas before its footage
is on it. The preview asks for frames faster than it may decode; it paints
a frame only while it is the newest it asked for (an `Ask` of
`newestAsked`, `paintedIfNewest`), so a decode that lands late neither
paints over a newer frame nor says it failed. A drawn film has no
`footageAt` and is drawn at once, as it always was, and its page never
loads the decoder. The live adapter (`footage-browser.ts`) opens each
source with mediabunny over a ranged `UrlSource` at
`/footage/<name>/<sha12>/<copy>.mp4` (`core/footage.ts`): the render page
reads the mezzanine, every other page the proxy. Every decoder it opens is
closed when its run ends, however it ends (done, stopped partway, failed,
interrupted), and a read that outlives its run (each frame's runs on a
fiber of its own) opens no decoder and holds no frame. It is given
mediabunny as a service (`FootageDecoders`, the page's own provided where
its host is built, `host-browser.ts`), loaded with the first read. One module answers that URL for the render's server (the
app's player) and the lab's alike (`tools/footage-route.ts`): a copy of a
name the footage library's lock lists now, of its original's hash, made and
on disk under the outputs folder, whole or by the byte range asked; the
library's lock (`/footage/library.lock.json`) and a transcript the lock
names (`/footage/transcripts/<file>`), for a talk's page to cut by;
anything else under `/footage/` is a 404. The server's host, and a test, give frames of their own (`Footage.layerOver`;
`Footage.none` has none). A footage film's probe also records each footage
frame it drew (`FootageMark`: its source and second), and a drawn film's
probe has no such field, as before. The browser test `e2e/player/footage-exact.dom.test.ts` holds
the seam frame-exact over a synthetic numbered clip, a still and an export
chunk alike; `e2e/player/talk-render.dom.test.ts` holds a talk's page so over
every seam of its cut, its probe captions to its phrases, and fails a chunk
whose mezzanine cannot be fetched.
`e2e/tools/talk.test.ts` runs a talk on real media (import, `make`, the mix
from its voice); `src/tools/talk.test.ts` runs it with none, in the
framework suite.

The lint holds the host to its adapters in the lab, the player, `browser/`,
`command/` and the app's page entries (`.oxlintrc.json`): `effect/noGlobals`'
`members` list refuses the host's storage, frames, requests,
media and recording, media queries (`Viewport`), timers, clock and URL,
each naming the service that owns it, however a page reaches it: bare,
through any name of the global object and any chain of them
(`window.`, `globalThis.window.`, `top.`, `parent.`, `document.defaultView.`),
an alias or a destructure (`const perf = performance; perf.now()`); and a host
global held where the rule cannot follow it (`{ w: window }`, `[document]`,
`() => performance`) is refused too, while handing it to a call builds an
adapter and passes; `effect/noReflectGet` refuses
`Reflect.get(window, …)`; `film/host-events-through-adapter`
(`lint/`) refuses a window or document listener for a navigation, key or
drag event however it is spelled (an event named by a const or a loop, an
alias of the window, a handler property such as `onpopstate`, a bare or a
borrowed `addEventListener`), a host listener whose event it cannot read,
and a press's end heard on any element, a JSX handler included;
`effect/noGlobals` holds in the player as everywhere. The
fixtures and tests are the host's side and exempt; a live adapter
(`*-browser.ts`) is not: each line where it reaches the one host API it
adapts says so (`oxlint-disable-next-line`, with why), so an adapter that
reaches another's API is red as a page is. No page imports a live adapter's
module (`no-restricted-imports`): only a page's mount builds the host
(`BrowserHost`), the two stores are `storage-browser.ts`'s, and the review's
and the studio's mounts build theirs with an adapter of their own. The address bar is `Location`'s alone (`@bible/url-state`'s
`location-browser.ts`): no film file reads or writes the URL directly.

Frames stay pure: no `Math.random`, no wall clock, no state carried between
frames. Seed randomness by key (`f.hand(key)`, `random.ts`); another scene's paper, torn as it tore it, by `f.handsOf(drawing)`. Another scene's framing, as that scene reads it (a lab edit included), by `f.knobsOf(drawing)(knob)`: a callback reads the knob where it lives, so a drag moves both scenes.

```sh
bun run gate   # repo root, as CI: lint, format check, every package's typecheck, build and tests
```
