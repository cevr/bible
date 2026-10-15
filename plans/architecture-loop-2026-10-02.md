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

| Question                                                                                                                                                                                                                                                                                                                                                             | Raised (pass) | North stars or rule involved  | Answer                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Confirm **Comb at a glance** as worded (scan, scrub, compare and judge every scene in one view, each opening the lab at its time).                                                                                                                                                                                                                                   | 0             | Comb at a glance (drafted)    | yes (owner 2026-10-02)                                                                                                                                                                                                                                                                                                                                 |
| Confirm **Phone-first review**, **One gate** and **Fresh reads** as north stars of the lab.                                                                                                                                                                                                                                                                          | 0             | drafted rows                  | yes; renamed **Mobile-first**, phone-width design first (owner 2026-10-02)                                                                                                                                                                                                                                                                             |
| Confirm the tiebreaks: framework north stars over studio ones; Addressable over local convenience; path for what, query for how, hash for when; Phone-first over density; Live from source over cold start.                                                                                                                                                          | 0             | Tiebreaks (drafted)           | yes (owner 2026-10-02)                                                                                                                                                                                                                                                                                                                                 |
| Should the HTTPS address (`https://bite-cristian.exe.xyz:8229`) be the one link handed out, and the plain-HTTP Tailscale names dropped from `FILM_LAB_HOSTS`?                                                                                                                                                                                                        | 0             | One surface, One gate         | yes: hand out `https://bite-cristian.exe.xyz:8229`; Tailscale names dropped from `FILM_LAB_HOSTS` (owner 2026-10-02)                                                                                                                                                                                                                                   |
| Should setting an `until` cue's end (the edge drag, and now the lab's End field) keep `until` and store an offset from the mark, so the cue still follows its mark when the mark moves? Today it writes a `dur` and the cue stops following (the p1-mobile-rest live check turned `woman.writing`'s `until: 'first'` into `dur: 1.94`). An offset is a format change | 1             | Fresh reads, additive formats | yes, decided by derive-dont-sync (an `until` cue's end is derived from its point; a `dur` copies it out of sync): an optional end-offset key on `untilPoint`, additive, no film's cue times change; no "detach to a fixed length" verb, decided by subtract-before-you-add (batch p1-until; owner 2026-10-05: "make decisions based on my principles") |
| The p1-mobile-rest live check left `woman.ts` modified in its workspace (`writing: … dur: 1.94`, uncommitted, never merged); the agent's restore was denied. Restore it or keep it?                                                                                                                                                                                  | 1             | Owner data                    | restored, decided by correctness-over-pragmatism and the rule that a live check never writes: the edit was a test's accident, not an authoring choice; discarded with the merged workspace (`workrift remove`), its diff kept in `pass1/p1-mobile-rest-stray-woman.diff` (2026-10-05)                                                                  |

## Carried

Closed rows: [`archive/architecture-loop-2026-10-02-pass-5.md`](archive/architecture-loop-2026-10-02-pass-5.md).

| Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | From (batch)                                           | Files                                                           | Status                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| The whole-film render (`out/righteousness-by-faith/film/main.mp4`, `.share.mp4`, `.vtt`, stills) was moved into main's `out/` from the removed `bible-tools-p13-look` checkout, but its `catalogue.json` record was deleted with that checkout (`git worktree remove --force`); the choices and project pages say "No render of this film". A record's stamp is written only by a render, so the fix is a re-render of the film when the owner asks for scene review (owner rule) — never a hand-written record | 2026-10-02 cleanup (orchestrator's slip)               | `apps/animations/out/righteousness-by-faith/catalogue.json`     | open (owner: re-render on scene review)           |
| The lab's compare still plays on its own path, not the WebCodecs `Playable` the review's wipe uses; phones stay on `<video>` until an iPhone is measured (owner question: WebCodecs on iPhone)                                                                                                                                                                                                                                                                                                                  | p1-scenes report (Carried 5)                           | `packages/film/src/lab/compare/`, `src/browser/media-choice.ts` | open (a later pass)                               |
| `film lookbook` (the CLI export of `lookbook.jpg`) still composes 672 canvases (~155 MB) in one page, and a cold lab draws the Scenes tape's 106 stills in up to 20 s (9–11 s warm)                                                                                                                                                                                                                                                                                                                             | p1-scenes report (Carried 6), live check of `d415308f` | `packages/film/src/tools/renderer.ts`, `player/stills.ts`       | open (a later pass, performance in `@bible/film`) |

## Passes 1–4

Archived: [`archive/architecture-loop-2026-10-02-passes-1-4.md`](archive/architecture-loop-2026-10-02-passes-1-4.md).

## Pass 5

Archived: [`archive/architecture-loop-2026-10-02-pass-5.md`](archive/architecture-loop-2026-10-02-pass-5.md) (Triage, Batches, the interim retro). The run after the loop batches (rive, papercut, shade, the film units, nogent, voicedesk, seriesdesk) is `apps/animations/plans/p5-run.md`.

## Pass 6

Opened 2026-10-15 at `ea4b957d6` by the owner's `/architecture-loop`. Lead sweep: **harness** (NORTH_STAR → Agent-led harness, owner 2026-10-14; the row replaces `ui reduction`). Step 0 brought the owner rules up to date from memory: two lab links (local and Tailscale phone, no tunnel, no auth), asks offer choices first, Solid 2 + effect-machine and a simple-port `@bible/ui`, tests under 10 s, reviewers at max effort, deploys handed over as `!` commands, and the live check on the laptop (no systemd unit). PRIOR_ARTS → To survey gains agent-work review surfaces. Pass files: `tmp/architecture-loop/pass6/` in the run main.

### Baseline (pass 6)

Count, widened to the NORTH_STAR scope (`command/`, `browser/`, `page-render*`, `film-services.ts` joined it after pass 1; `*.types.ts` excluded): `git grep -c '' <rev> -- ':(glob)packages/film/src/lab/**/*.ts' ':(glob)packages/film/src/lab/**/*.tsx' ':(glob)packages/film/src/player/**/*.ts' ':(glob)packages/film/src/command/**/*.ts' ':(glob)packages/film/src/browser/**/*.ts' ':(glob)packages/film/src/tools/lab*.ts' ':(glob)packages/film/src/tools/api-server.ts' ':(glob)packages/film/src/tools/page-render*.ts' ':(glob)packages/film/src/tools/review*.ts' ':(glob)packages/film/src/tools/choice*.ts' ':(glob)packages/film/src/tools/project-http.ts' ':(glob)packages/film/src/tools/studio*.ts' ':(glob)packages/film/src/tools/steps-http.ts' ':(glob)packages/film/src/tools/notes-*.ts' ':(glob)packages/film/src/tools/narration-route.ts' ':(glob)packages/film/src/tools/source-writer.ts' ':(glob)packages/film/src/tools/scene-*.ts' ':(glob)packages/film/src/tools/film-services.ts' 'packages/film/src/core/api.ts' ':(glob)apps/animations/src/*.ts' 'apps/animations/cli.ts' 'apps/animations/server.ts' ':(exclude,glob)**/*.test.ts' ':(exclude,glob)**/*.test.tsx' ':(exclude,glob)**/*.types.ts' ':(exclude,glob)**/fixtures/**' | awk -F: '{s+=$NF;n++} END{print s, n}'`

| Rev                       | Lines  | Files |
| ------------------------- | ------ | ----- |
| `a73730a9` (pass 1 base)  | 19,908 | 103   |
| `8e36ccded` (pass 5 base) | 45,537 | 205   |
| `ea4b957d6` (pass 6 base) | 63,916 | 259   |

Pass 5 grew by 18,379 lines. Most of it was owner-asked features run beside the loop: Rive, talk shorts and the Transcript view, Board, the Script reader, asks, the lab MCP, voicedesk and seriesdesk. The loop batches added guards: lint bindings, test guards and cascade. Pass 6 is the first pass whose lead north star asks for less (Agent-led harness), so it should shrink. If it grows, the growth needs a reason row.

### Coverage (pass 6)

Unswept, so they go first: `lab/ask` (4), `lab/board` (8), `lab/script` (13), `lab/sketch` (2), `lab/transcript` (8), and `tools/lab-mcp.ts` with the newer `tools/lab-*` files. Every other directory was swept in an earlier pass (passes 1–5 reports).

### Sweeps (pass 6)

Launched 2026-10-15 from the brief `pass6/sweep-brief.md`, 14 read-only agents in one message at a load of 9 on 12 cores. Two of them drive browsers: harness and url state.

- harness, the lead sweep, which also fills the studio ui matrix (HARNESS6, STUDIO6).
- url state (URL6) and one gate (GATE6).
- design language, drift since pass 5 and the CSS budget (DL6).
- ui guidance (UIG6) and guardrails (GUARDS6).
- Architecture areas: new, the unswept dirs plus lab-mcp.ts (NEW6); review (REV6); edit (EDIT6); server (SRV6).
- Package review: client (R6-client) and server (R6-server).
- Prior art: agent-work surfaces (PA6).
- Pass 5's final retro, written to `pass5/retro-final.md`.
