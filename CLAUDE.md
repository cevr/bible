# Bible

A monorepo for Bible study tools: the `bible` CLI, EGW search, and narrated
explainer films.

## Project Structure

```
bible/
├── apps/
│   ├── animations/     # Narrated cut-paper explainer films (@bible/animations, built on @bible/film)
│   ├── egw-search/     # EGW search: Solid 2 page over an Effect HttpApi server (@bible/egw-search; Railway, egw.cvr.im)
│   └── triedgold/      # triedgold.com (@bible/triedgold, React Router 8; brand tokens in src/brand.ts; Alchemy → Railway)
├── packages/
│   ├── core/           # Shared business logic: corpora, search, study data (@bible/core)
│   ├── cli/            # The `bible` CLI (@bible/cli)
│   ├── film/           # The film engine, tools and lab (@bible/film)
│   ├── atom-solid/     # Solid 2 bindings for Effect atoms (@bible/atom-solid, used by the film lab)
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
bun run ci [<commit>]          # Wait for a commit's CI run on main and print its verdict
```

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

- **Services** defined with `Context.Tag` in `@bible/core`
- **Adapters** provide platform-specific implementations. Bun is the only
  host: core's adapters are the `*-bun.ts` files and `src/platform-bun/`, and
  oxlint keeps `bun:*` and platform imports out of every other core module
- CLI provides `FileSystemStorageLayer` and `AppleNotesExportLayer`
- egw-search provides its own server layers over `@bible/core`
