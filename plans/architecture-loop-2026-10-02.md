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

| Decision                                                                                                                                                                                                    | From (batch)                    | Files                      | Status |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------- | ------ |
| The lab e2e suite still pins old URLs: `shell.dom.test.ts:49` expects the look-book at `/?film=probe&lookbook` (now `/player?film=`). Run `bun run test:e2e`, fix, and move the fixtures to the PA-1 paths. | 2026-10-02 session (`1b66db79`) | `packages/film/e2e/lab/**` | open   |
