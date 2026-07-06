# Bible

A monorepo for Bible study tools with CLI and web interfaces.

## Project Structure

```
bible/
├── apps/
│   ├── desktop/        # Desktop app
│   ├── studies/        # Astro study site (@bible/studies) — legacy Sure Word site
│   └── web/            # Web application (@bible/web, React/Vite)
├── packages/
│   ├── core/           # Shared business logic (@bible/core)
│   │   ├── adapters/   # Platform abstraction (storage, export)
│   │   ├── ai/         # AI model providers and service
│   │   └── sabbath-school/  # Sabbath School outline generation
│   ├── cli/            # CLI application (@bible/cli)
│   └── web/            # The Sure Word static site (@bible/site, Bun.markdown)
```

### The Sure Word site (packages/web)

Dependency-free static-site generator in the korean-project pattern: `src/render.ts`
(Bun.markdown + design system + templates), `src/content.ts` (curated manifest of
handbook studies from packages/cli/outputs/studies), `src/build.ts` (emits committed
`dist/`), `src/server.ts` (Bun static server). Deployed on Railway (project
`bible-studies`, service `studies`, rootDirectory `packages/web`, no build step —
`dist/` ships prebuilt) at https://studies-production.up.railway.app. To publish
content changes: `bun run build` in packages/web, commit dist, push (or `railway up`
with the `packages/web/` subpath staged).

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
