# Architecture loop — 2026-10-02

Goal: "make our north stars and prior arts so we can do architecture loops for this as well" — the film lab as one studio: "make the urls use path instead of params, and also ensure we're using url state for all our lab work where it makes sense so we can share", "a way to view comb through scenes", with studio applications (DaVinci Resolve and others) as prior art and UI inspiration.

Project files: `NORTH_STAR.md`, `PRIOR_ARTS.md` (repo root, scoped to the lab). The film engine keeps its own loop (`.claude/skills/film-architecture-loop`, ledgers in `apps/animations/plans/`).

## Baseline

- HEAD: `a73730a9`
- Count: `git ls-files ':(glob)packages/film/src/lab/**/*.ts' ':(glob)packages/film/src/lab/**/*.tsx' ':(glob)packages/film/src/player/**/*.ts' ':(glob)packages/film/src/tools/lab*.ts' ':(glob)packages/film/src/tools/api-server.ts' ':(glob)packages/film/src/tools/review*.ts' ':(glob)packages/film/src/tools/choice*.ts' ':(glob)packages/film/src/tools/project-http.ts' ':(glob)packages/film/src/tools/studio*.ts' ':(glob)packages/film/src/tools/steps-http.ts' ':(glob)packages/film/src/tools/notes-*.ts' ':(glob)packages/film/src/tools/narration-route.ts' ':(glob)packages/film/src/tools/source-writer.ts' ':(glob)packages/film/src/tools/scene-*.ts' 'packages/film/src/core/api.ts' ':(glob)apps/animations/src/*.ts' 'apps/animations/cli.ts' 'apps/animations/server.ts' ':(exclude,glob)**/*.test.ts' ':(exclude,glob)**/*.test.tsx' ':(exclude,glob)**/fixtures/**' | xargs wc -l | tail -1`

| Package                   | Lines  | Files |
| ------------------------- | ------ | ----- |
| lab scope (both packages) | 19,948 | 104   |

## Coverage

No earlier ledger sweeps the lab under these north stars; every directory starts unswept for them (the film loop's 2026-09-25/27 ledgers swept `player` and the lab server under the framework's north stars).

| Directory                              | Files | Mark    | Pass |
| -------------------------------------- | ----- | ------- | ---- |
| `apps/animations`                      | 2     | unswept |      |
| `apps/animations/src`                  | 3     | unswept |      |
| `packages/film/src/core` (`api.ts`)    | 1     | unswept |      |
| `packages/film/src/lab`                | 7     | unswept |      |
| `packages/film/src/lab/compare`        | 5     | unswept |      |
| `packages/film/src/lab/editor`         | 9     | unswept |      |
| `packages/film/src/lab/motion`         | 4     | unswept |      |
| `packages/film/src/lab/notes`          | 6     | unswept |      |
| `packages/film/src/lab/review`         | 13    | unswept |      |
| `packages/film/src/lab/review/options` | 5     | unswept |      |
| `packages/film/src/lab/studio`         | 11    | unswept |      |
| `packages/film/src/player`             | 14    | unswept |      |
| `packages/film/src/tools` (lab files)  | 24    | unswept |      |

## Prior art

| ID   | Idea                                                                                                                                                                                                                                                      | Source (slug, path)                                                                                                      | North star                                                                                                            | Verdict                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| PA-1 | Path-based places: `/films/<film>/{scenes[/<scene>],choices,project,lab/<scene>,play}`, `/sets/<folder>/<point>`; `?cue=                                                                                                                                  | knob=                                                                                                                    | note=`, `?view=&other=&m=`; `#t=`(scene-relative in a scene's lab link); one`legacyPlace(url)` redirect for old links | `cgwire/kitsu` `src/router/routes.js`; `remotion-dev/remotion` `packages/studio/src/helpers/url-state.ts`; Figma, Media Fragments | Addressable | adopt |
| PA-2 | The HttpApi under `/api/`; the server dispatches `/api/*`, `/films/<film>/narration/*`, built chunks, then pages; pages served by prefix, not exact path, with absolute asset URLs (`publicPath: '/'`)                                                    | Frame.io, Kitsu (pages and API apart)                                                                                    | Addressable, One gate                                                                                                 | adopt (the API paths are a wire format between our own page and server only; no persisted change)                                 |
| PA-3 | A scenes view (`/films/<film>/scenes`) that absorbs the look-book: a tape bar with scene boundaries, scene cards (cue-edge stills, scrub, state band, note dots, check count, version badge), a focus panel, phone rows with drag-scrub, `E` into the lab | DaVinci Resolve Cut page; Storyboard Pro Thumbnails; Descript Storyboard View; Frame.io version stacks; FCP keyword bars | Comb at a glance, Mobile-first                                                                                        | adopt                                                                                                                             |
| PA-4 | Citable lab state into the URL: the selected note (`?note=`), the inspector's scene (path), compare's pair; per-viewer state (rate, onion, mic, quality, filter) stays local                                                                              | Figma `?node-id=`, Notion `?p=`                                                                                          | Addressable                                                                                                           | adopt                                                                                                                             |
| PA-5 | Live-draw every scene card                                                                                                                                                                                                                                | Resolve hover-scrub                                                                                                      | Performant (framework)                                                                                                | rejected: ~25 canvases per frame; stills, and one shared canvas for the card being scrubbed                                       |
| PA-6 | Values in a JSON store the studio edits                                                                                                                                                                                                                   | Theatre.js; Remotion props editor                                                                                        | Lab-first (framework)                                                                                                 | rejected: a second copy of a value                                                                                                |

## Project sweeps

| Sweep     | Pass | Result | Done when met? |
| --------- | ---- | ------ | -------------- |
| url state |      |        |                |
| studio ui |      |        |                |
| one gate  |      |        |                |

## Owner questions

| Question                                                                                                                                                                                                    | Raised (pass) | North stars or rule involved | Answer                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Confirm **Comb at a glance** as worded (scan, scrub, compare and judge every scene in one view, each opening the lab at its time).                                                                          | 0             | Comb at a glance (drafted)   | yes (owner 2026-10-02)                                                                                               |
| Confirm **Phone-first review**, **One gate** and **Fresh reads** as north stars of the lab.                                                                                                                 | 0             | drafted rows                 | yes; renamed **Mobile-first**, phone-width design first (owner 2026-10-02)                                           |
| Confirm the tiebreaks: framework north stars over studio ones; Addressable over local convenience; path for what, query for how, hash for when; Phone-first over density; Live from source over cold start. | 0             | Tiebreaks (drafted)          | yes (owner 2026-10-02)                                                                                               |
| Should the HTTPS address (`https://bite-cristian.exe.xyz:8229`) be the one link handed out, and the plain-HTTP Tailscale names dropped from `FILM_LAB_HOSTS`?                                               | 0             | One surface, One gate        | yes: hand out `https://bite-cristian.exe.xyz:8229`; Tailscale names dropped from `FILM_LAB_HOSTS` (owner 2026-10-02) |

## Carried

| Decision                                                                                                                                                                                                    | From (batch)                    | Files                      | Status                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------- | --------------------------- |
| The lab e2e suite still pins old URLs: `shell.dom.test.ts:49` expects the look-book at `/?film=probe&lookbook` (now `/player?film=`). Run `bun run test:e2e`, fix, and move the fixtures to the PA-1 paths. | 2026-10-02 session (`1b66db79`) | `packages/film/e2e/lab/**` | in batch p1-places (pass 1) |

## Pass 1

HEAD `a6ae6359` (sweeps), `3af3fde4` (apply base). Reports: `~/.cache/architecture-loop/bible-tools/pass1/`.

Owner direction mid-pass (2026-10-02): **Effect-native adapters** joined the north stars ("ensure we build effect-native adapters for everything"), with its own sweep (`sweep-effect-adapters.md`); Solid 2's built-in SSR/frames went to To survey ("are we using solid v2's ssr?", `prior-art-solid-ssr.md`); questions are decided by principle first. Workspaces are Rifts from the warm source `/workspaces/bible-tools` (cloned from the local checkout, since main is ahead of origin); merge back by `git fetch <rift> <branch>`.

Verdict: not closable. P1s: no film at 390 px (LS-1 = PL-1 = UI-1 = F1), a lab link from another site answers 403 (S-1 = G1 = R1-lab-server-2), the lab reads scene files stale (R1-lab-server-1 = G2; fourth occurrence), project cards black (UI-2 = RV-3), the selected note, set view and lab selection miss the URL or Back (U1-U3), the e2e suite stale and run nowhere (Carried, G4).

### Project sweeps

| Sweep           | Pass | Result                                                                                             | Done when met? |
| --------------- | ---- | -------------------------------------------------------------------------------------------------- | -------------- |
| url state       | 1    | ~50 states classified; 9 citable states fail a pasted link or Back (U1-U6)                         | no             |
| studio ui       | 1    | 390/1440 matrix × 8 references; lab unusable at 390, project cards black, 22-row naming table      | no             |
| one gate        | 1    | every API route 403 on a foreign Host; G-1..G-4 polish; navigations from other sites refused (S-1) | no (S-1)       |
| effect adapters | 1    | running                                                                                            |                |

### Prior art (pass 1)

| ID    | Idea                                                                                                                                                                 | Source                                              | North star                                     | Verdict                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| PA-7  | One studio shell over a film's PA-1 places (Blender workspaces); at 390 px one workspace and one section at a time, full-screen with Back (Blender maximize)         | `blender/blender` `workspace_edit.cc`, `screen_ops` | One surface, Mobile-first                      | adopt                               |
| PA-8  | Review Pair: wipe and difference layouts (OpenRV)                                                                                                                    | `AcademySoftwareFoundation/OpenRV`                  | Comb at a glance                               | adopt                               |
| PA-9  | Lab compare: a difference mode beside wipe and blink; hold-to-flip as blink's touch path                                                                             | OpenRV `SwitchIPNode`, `Difference`                 | Comb at a glance, Mobile-first                 | adopt                               |
| PA-10 | One declared command and key registry feeding the keys, a `?` sheet, `⌘K` and on-screen buttons, each command with a touch path                                      | Motion Canvas `makeShortcuts` (MC-9), Linear, Rive  | Mobile-first                                   | adopt                               |
| PA-11 | Timecode display `HH:MM:SS:FF`; a flash after a live reload lands                                                                                                    | MC-14, MC-15                                        | Comb at a glance, Live from source             | adopt                               |
| NS-1  | A note's optional scene-relative time (additive, optional field)                                                                                                     | Frame.io comment links                              | Addressable                                    | adopt (additive)                    |
| —     | Free-form area split/join; layouts saved in a file; RV session files; dissolve; N-way wipes; HMR scene swap; frame in localStorage; GET links that act; label tracks | Blender, OpenRV, Motion Canvas                      | Mobile-first, Addressable, One gate, Lab-first | rejected (to NORTH_STAR → Rejected) |

### Decisions (decided by principle)

- A–B loop range → `#t=a,b` (Addressable; hash for when). Compare mode → `?view=`; wipe divider, speed, onion stay local (tiebreak: per-viewer settings local). Loop on/off, HEAD compare toggle, captions → local (url-state OQ-1; same tiebreak).
- Choices: `?point=&variant=&picture=`; studio beat → `?beat=` (url-state OQ-2; Addressable). A lab with no scene → `/films/<f>/lab` with absolute `#t=`; the lab's path follows the scene under the playhead (replace during play, push on a jump) (OQ-3; Back walks views).
- Folder refs are one encoded path segment (Explicit over implicit). API: one `/api/films/<film>/…` tree and `/api/review/…`; the three client adapters fold into one `HttpApiClient` (one adapter per seam).
- Page navigations (`Sec-Fetch-Mode: navigate`, `Dest: document`) to non-`/api` paths pass `admit` across sites; the API and subresources stay same-origin (Addressable within One gate).
- A server start id rides the build counter, so pages reload onto a restarted lab (Live from source).
- Shift+arrow steps 10 frames (industry convention, owner rule: name by convention). e2e runs in CI (prove it works; G4).
- Glossary (owner rule: industry naming; studio-ui naming table): Scenes (page), Contact sheet (export), Versions, Side by side, Comment, Out of date, Scratch VO, Proxy/Original, Needs review / Needs changes / Approved.

### Triage

| Batch       | Workspace                                  | Items                                                                                                                                                                                                                                                                                                                                                                                                                    | Wave |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| p1-server   | `/workspaces/.rifts/bible-tools/p1-server` | PA-2 (API under `/api/`, page prefixes for every PA-1 path, absolute assets, server half of the legacy redirect); S-1..S-16, G-1..G-4, G3 (real-server gate test), G6 + S-2 (watch set), R1-lab-server-1 + G2 (SceneSources fresh reads + guard), R1-lab-server-3..15, T1..T3 (server tests), NS-2, NS-3, NS-8, LS-2/S-3 + LS-3 (start id, reload test), F2/R1-lab-client-7 (one API client), S-8/PL-10 (one page table) | A    |
| p1-review   | `/workspaces/.rifts/bible-tools/p1-review` | RV-1, RV-2, RV-3/UI-2, RV-5..RV-8, UI-5, UI-7, UI-11, U8, R1-lab-client-15, T2                                                                                                                                                                                                                                                                                                                                           | A    |
| p1-notes    | `/workspaces/.rifts/bible-tools/p1-notes`  | NS-1 (additive scene-relative time), NS-4, NS-5, NS-6, NS-7, NS-10..NS-13                                                                                                                                                                                                                                                                                                                                                | A    |
| p1-adapters | after the adapters sweep                   | Effect services for URL/history, storage (NS-9, F6, R1-lab-client-8), clock/frames, pointer/keys, media, mic; lint rule against host globals                                                                                                                                                                                                                                                                             | B    |
| p1-places   | after p1-server, p1-adapters               | PA-1 client, PA-4, U1-U10, RV-4, C4/U5, PL-4..PL-7, PL-9, PL-11, LS-6, LS-8..LS-11, R1-lab-client-1/9..14, O-1..O-4, T3, legacy redirect client half, e2e fixtures + e2e in CI (Carried, G4, G5, G7, G9)                                                                                                                                                                                                                 | B    |
| p1-mobile   | after p1-adapters                          | LS-1/PL-1/UI-1 (PA-7 phone layout), PL-2/UI-3, PL-3/LS-4 (pointercancel, touch-action), LS-5, LS-7, UI-6, UI-8..UI-10, F4, F5/R1-lab-client-6, PA-10, G8 (Mobile-first check)                                                                                                                                                                                                                                            | C    |
| p1-scenes   | after p1-places                            | PA-3 scenes view absorbing the look-book (UI-4, PL-4), PA-8, PA-9, PA-11                                                                                                                                                                                                                                                                                                                                                 | C    |
