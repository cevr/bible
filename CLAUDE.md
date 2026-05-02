# Bible

A monorepo for Bible study tools with CLI and web interfaces.

## Project Structure

```
bible/
├── packages/
│   ├── core/           # Shared business logic (@bible/core)
│   │   ├── adapters/   # Platform abstraction (storage, export)
│   │   ├── ai/         # AI model providers and service
│   │   └── sabbath-school/  # Sabbath School outline generation
│   ├── cli/            # CLI application (@bible/cli)
│   └── web/            # Web application (@bible/web)
```

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
