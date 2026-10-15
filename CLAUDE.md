# Bible

A monorepo for Bible study tools: the `bible` CLI, EGW search, and narrated
explainer films.

## Project Structure

```
bible/
├── apps/
│   ├── animations/     # Narrated cut-paper explainer films (@bible/animations, built on @bible/film)
│   ├── egw-search/     # EGW search: Solid 2 page over an Effect HttpApi server (@bible/egw-search; Railway, egw.cvr.im)
│   ├── firsttheblade/  # The First the Blade site: Solid 2 prerender behind an Effect Worker (@bible/firsttheblade; Alchemy → Cloudflare)
│   ├── selah/          # Native macOS Scripture memorization (@bible/selah; SwiftUI, FSRS)
│   └── triedgold/      # triedgold.com (@bible/triedgold, React Router 8 SSR on a Worker; brand tokens in src/brand.ts; Alchemy → Cloudflare)
├── packages/
│   ├── core/           # Shared business logic: corpora, search, study data (@bible/core)
│   ├── cli/            # The `bible` CLI (@bible/cli)
│   ├── film/           # The film engine, tools and lab (@bible/film)
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
bun run gate                   # What CI runs: lint, format check, typecheck, build, tests
bun run test:perf              # The CLI's performance budgets (local only; reads packages/core/data/bible.db)
bun run test:budget            # The tests' 10 s budget: `bun run test` and each workspace's (local only)
bun run --filter @bible/selah gate  # Native Swift gate on macOS
bun run ci [<commit>]          # Wait for a commit's CI run on main and print its verdict
```

## Workspaces

- Work on `main` directly, unless the work runs in parallel with other work.
- **Parallel work:** each unit gets its own workspace.
  - On the workbox, the warm source is `/workspaces/bible-tools`. Run `workrift create <branch>` inside it. Run `workrift deps` when `bun.lock` changed. After the merge, run `workrift remove <path>`. `workrift prune --dry-run` lists stale ones; run it before any `git status` inside a rift, which marks the rift recent.
  - On the laptop, run `rift create --name <name> --copy-all ~/Developer/personal/bible-tools`.
- **The film e2e** (`bun run test:e2e`) is heavy, and two at once on one machine time each other out. Check a change with `bun run test:e2e:check --base <log>`, unwrapped: it takes the host's e2e lock itself (`flock /tmp/bible-tools-e2e.lock` on the workbox, `lockf -k` on the laptop), so parallel workspaces queue, waits for the load to fall to the core count, reruns every failure alone three times, and writes `<log>.verdict.md`, each failure classed unit-caused, unresolved, green-alone or base; base only when the base's own check saw it red alone too (`packages/film/README.md`). A bare `bun run test:e2e` takes no lock.
- **Red first:** `bun run redfirst <base>` runs the test files a branch added or changed against the base's product sources, in a scratch worktree of the base, and names every new or changed case that passes there (`redfirst green on base: <file>:<line> <name>`): a test its defect cannot fail. A unit's review request carries its output, each green case with why. It installs and runs twice, so it is never a hook.
- **Doc lines:** `bun run doc-lines <base>` prints every line of the docs the docs test reads that names a file `<base>...HEAD` changed (`doc-lines <doc>:<line> <file>: <the line>`), read by the docs test's own anchor reader. A sentence's claim goes stale with no name in it changing, so the docs test cannot see it: a unit's review request carries this list, and the reviewer reads those lines.
- **Each commit green:** before a unit's fast-forward, `bun run merge-audit --each <base>` in the merge worktree runs `bun run guard` on every commit of `<base>..HEAD` in a scratch worktree, oldest first, and prints `merge-audit <sha> guard ok` (or `guard red` and the run's last lines) for each; it exits non-zero on a red one. The merge log carries its lines.
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

<!-- effect-solutions:start -->

## Web UI

New web UI loads the `ui`, `composition-patterns`, `react` (read as Solid), `effect` and `graphical-ui` skills, is built with Solid 2 and effect-machine, and reuses `@bible/atom-solid`, `@bible/url-state` and `@bible/ui` as egw-search does.

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
