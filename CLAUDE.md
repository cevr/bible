# Bible

A monorepo for Bible study tools: the `bible` CLI, EGW search, and narrated
explainer films.

## Project Structure

```
bible/
├── apps/
│   ├── animations/     # Narrated cut-paper explainer films (@bible/animations, built on @bible/film)
│   ├── egw-search/     # EGW search: Solid 2 page over an Effect HttpApi server (@bible/egw-search; Alchemy → Cloudflare, egw.cvr.im)
│   ├── firsttheblade/  # The First the Blade site: Solid 2 prerender behind an Effect Worker (@bible/firsttheblade; Alchemy → Cloudflare)
│   ├── hymnal/         # The hymnal app: One 2.9 (React 19.3, React Native 0.88) for iOS, Android and web (@bible/hymnal-app)
│   ├── selah/          # Native macOS Scripture memorization (@bible/selah; SwiftUI, FSRS)
│   └── triedgold/      # triedgold.com (@bible/triedgold, React Router 8 SSR on a Worker; brand tokens in src/brand.ts; Alchemy → Cloudflare)
├── packages/
│   ├── core/           # Shared business logic: corpora, search, study data (@bible/core)
│   ├── cli/            # The `bible` CLI (@bible/cli)
│   ├── film/           # The film engine, tools and lab (@bible/film)
│   ├── hymnal/         # Hymn chords read from MIDI, and the compiled SDA Hymnal (1985) the app reads (@bible/hymnal; schema at @bible/hymnal/hymn)
│   ├── atom-solid/     # Solid 2 bindings for Effect atoms (@bible/atom-solid, used by the film lab and egw-search)
│   ├── url-state/      # Typed URL state: Effect Schema codecs, a Location service, an atom binding (@bible/url-state)
│   ├── ui/             # Base UI's unstyled parts ported to Solid 2 (@bible/ui; browser tests via its test:browser)
│   └── scripts/        # Corpus compilers and repo tooling (@bible/scripts)
```

## Package Manager

This project uses **Bun** as its package manager and runtime.

## Key Commands

```bash
bun install                    # Install dependencies
bun run typecheck              # Type check all packages
bun run fmt                    # Format code with oxfmt
bun run gate                   # The feedback cycle: oxlint (deterministic rules) + every workspace's unit tests, turbo-cached
bun run test:slow              # Typecheck, builds, slow tests, browser and built-page checks, full lint, e2e; by hand and before deploys
bun run test:perf              # The CLI's performance budgets (local only; reads packages/core/data/bible.db)
bun run test:budget [<ws>…]    # Each workspace's unit tests alone under 1 s, no total (local only)
bun run --filter @bible/selah gate  # Native Swift gate on macOS (also in test:slow)
```

## The gate is the feedback cycle

The local gate verifies a change; CI does not (owner, 2026-10-19: "CI is not a verification tool for us"). Agents never check or wait on CI, and never fix a test only CI sees red; this overrides the global "CI red: fix til green".

- **`bun run gate`** asks one thing: did the change break something plain? It runs oxlint's deterministic rules and every workspace's unit tests (`*.test.*`, not `*.slow.test.*`), turbo-cached on each workspace's inputs, and prints its wall time. Warm, it takes about a second. Each workspace's unit tests stay under 1 s alone (`bun run test:budget`). Run it between units and once at a unit's merge.
- **Pre-commit** (`lefthook.yml`) runs `oxlint --fix` and `oxfmt` on the staged files, then an incremental typecheck of the workspaces the staged files lie in.
- **`bun run test:slow`** runs the rest: every typecheck and build, each workspace's `*.slow.test.*` files, browser and built-page checks, Selah's native gate, the full lint with the judged rules, the format check and the dead exports. Run it by hand, and before a deploy: each workspace's deploy runs its own `test:slow` first.

A mistake found once becomes a guard only when the guard is cheap: an oxlint rule in `.oxlintrc.json` or a unit test, else a skill line. The lessons ledger, `docs/lessons.md`, records each guard, and its test holds each guard to what its file holds. A reviewer gives each finding its guard class and its cheapest guard; a finding with no cheap guard is classed `none` and needs no entry. `bun run merge-audit --review <file>` is an optional check of a unit's reviews against the ledger. How to add a guard: `packages/film/README.md`, **A mistake found once** and **Judged rules**. The film e2e is a tool a unit runs by hand, not a check of the gate.

## Workspaces

- Work on `main` directly, unless the work runs in parallel with other work.
- **Parallel work:** each unit gets its own workspace.
  - On the workbox, the warm source is `/workspaces/bible-tools`. Run `workrift create <branch>` inside it. Run `workrift deps` when `bun.lock` changed. After the merge, run `workrift remove <path>`. `workrift prune --dry-run` lists stale ones; run it before any `git status` inside a rift, which marks the rift recent.
  - On the laptop, run `rift create --name <name> --copy-all ~/Developer/personal/bible-tools`.
- **The film e2e** (`bun run test:e2e`) is heavy, and two at once on one machine time each other out. Check a change with `bun run test:e2e:check --base <log>`, unwrapped: it takes the host's e2e lock itself (`flock /tmp/bible-tools-e2e.lock` on the workbox, `lockf -k` on the laptop), so parallel workspaces queue, waits for the load to fall to the core count, reruns every failure alone three times, and writes `<log>.verdict.md`, each failure classed unit-caused, unresolved, green-alone or base; base only when the base's own check saw it red alone too (`packages/film/README.md`). A bare `bun run test:e2e` takes no lock.
- **Red first** (optional tool): `bun run redfirst <base>` runs the test files a branch added or changed against the base's product sources, in a scratch worktree of the base, and names every new or changed case that passes there (`redfirst green on base: <file>:<line> <name>`): a test its defect cannot fail. Use it when a test's value is in doubt. It installs and runs twice, so it is never a hook.
- **Comments:** A comment says what the code does now and why; history told in words (what it used to do, which pass changed it) is a finding.
- **Doc lines** (optional tool): `bun run doc-lines <base>` prints every line of the docs the docs test reads that names a file `<base>...HEAD` changed (`doc-lines <doc>:<line> <file>: <the line>`), read by the docs test's own anchor reader. A sentence's claim goes stale with no name in it changing, so the docs test cannot see it; use the list to find the lines a change may have made untrue.
- **One gate at merge:** before a unit's fast-forward, run `bun run gate` once at its head in the merge worktree. The merge log carries its last line. Each commit's own pre-commit typecheck covers the workspaces it touched.
- **Renders:** a workspace's renders are found through `out/<film>/catalogue.json`. Moving render files without their catalogue records loses them.

## Runtime observability

The EGW search dev servers run through Agent Tail and keep one plain-text
session in `tmp/logs/`. `tmp/logs/latest` points at the active session.

```bash
bun run dev:egw-search         # web.log + api.log
bun run logs                   # last 200 lines from the active session
bun run logs:errors            # scan the active session for likely failures
bun run logs:follow            # follow every log in the active session
```

Before opening DevTools or adding temporary diagnostics, inspect
`tmp/logs/latest/combined.log` and run `bun run logs:errors`. Effect-native code
uses `Effect.log*` with stable event names and inline `key=value` context. Host
boundaries use one line per event in the form `[area] action key=value`. Never
log credentials, tokens, or private reading/note content. Do not introduce a
second development log directory or transport.

## Verifying an app

To run an app and check a change in it as its user does, use its verify
skill: the First the Blade site is `.claude/skills/verify-firsttheblade`
(launch, doctor, drive, proof); the hymnal, on its iOS simulator or the web,
is `.claude/skills/verify-hymnal`.

<!-- effect-solutions:start -->

## Web UI

New web UI loads the `ui`, `composition-patterns`, `react` (read as Solid), `effect` and `graphical-ui` skills, is built with Solid 2 and effect-machine, and reuses `@bible/atom-solid`, `@bible/url-state` and `@bible/ui` as egw-search does. The exception is `apps/hymnal`: it is React on One (React Native and web from one tree), with Effect atoms through `@effect/atom-react` (owner, 2026-10-17).

## Effect Best Practices

**Before implementing Effect features**, run `effect-solutions list` and read
the relevant guide.

Topics include: services and layers, data modeling, error handling,
configuration, testing, HTTP clients, CLIs, observability, and project
structure.

**Effect Source Reference:** Use the `repo-explorer` skill to explore the Effect
repository for real implementations when docs aren't enough.

<!-- effect-solutions:end -->

## Architecture

The project uses Effect's dependency injection pattern:

- **Services** defined with `Context.Service` in `@bible/core`
- **Adapters** provide platform-specific implementations. Bun is the only
  host: core's adapters are the `*-bun.ts` files and `src/platform-bun/`, and
  oxlint keeps `bun:*` and platform imports out of every other core module
- CLI provides `AppleScriptLive`, `ChimeLive` and `CliLoggerLive` over
  `BunServices` and `FetchHttpClient`
- egw-search provides its own server layers over `@bible/core`
