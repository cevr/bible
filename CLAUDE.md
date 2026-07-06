# Bible

A monorepo for Bible study tools with CLI and web interfaces.

## Project Structure

```
bible/
├── apps/
│   ├── desktop/        # Desktop app
│   └── web/            # Web application (@bible/web, React/Vite)
├── packages/
│   ├── core/           # Shared business logic (@bible/core)
│   │   ├── adapters/   # Platform abstraction (storage, export)
│   │   ├── ai/         # AI model providers and service
│   │   └── sabbath-school/  # Sabbath School outline generation
│   ├── cli/            # CLI application (@bible/cli)
│   └── web/            # The Sure Word static site (@bible/site, Effect v4 + Bun.markdown)
```

### The Sure Word site (packages/web)

Static-site builder in Effect v4 (`effect@4.0.0-beta.x`, opencode-style domain
modules): `src/study.ts` + `src/comparison.ts` (Schema domain), `src/content.ts`
(comparisons manifest + studies dir), `src/builder.ts` (Context.Service that
discovers and renders studies), `src/build.ts` (BunRuntime entry), `src/render.ts`
(pure Bun.markdown templates + design system), `src/server.ts` (dependency-free Bun
static server — Effect is a devDependency only; the server must stay import-free
because Railway runs it directly against the committed `dist/`).

Studies are **discovered by frontmatter**: any markdown in
`packages/cli/outputs/studies/*.md` whose YAML frontmatter carries a `site:` block
(slug/title/subtitle/description/eyebrow/date — see `Study.Meta`) is published at
`/<slug>/`; no site block means unpublished. The index orders newest-first by
`site.date`. Old `/studies/<slug>/` URLs 301 to `/<slug>/`.

Deployed on Railway (project `bible-studies`, service `studies`, rootDirectory
`packages/web`, no build step — `dist/` ships prebuilt) at
https://studies-production.up.railway.app (custom domain: studies.cvr.im). To
publish content changes: `bun run build` in packages/web, commit dist, push (or
`railway up` with the `packages/web/` subpath staged).

## Package Manager

This project uses **Bun** as its package manager and runtime.

## Key Commands

```bash
bun install                    # Install dependencies
bun run typecheck              # Type check all packages
bun run format                 # Format code with Prettier
```

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
- **Adapters** provide platform-specific implementations
- CLI provides `FileSystemStorageLayer` and `AppleNotesExportLayer`
- Web can provide its own adapter implementations
