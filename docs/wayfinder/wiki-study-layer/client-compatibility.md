# Wiki study layer client compatibility

This contract applies to every ticket in this map. It covers the web app, the
Electron desktop app, and the CLI.

## One portable core

The wiki domain model, phrase matcher, topic assembly, lookup routing, search
query parser, ranking, and corpus release policy belong in `@bible/core`.
Portable core modules can depend on Effect service interfaces and domain
values. They cannot import a host runtime, a concrete SQLite driver, Electron,
or a browser API.

Oxlint enforces this rule for `packages/core/src/`. It rejects `node:*`,
`bun:*`, Electron, `better-sqlite3`, `wa-sqlite`, concrete Effect platform
packages, and concrete Effect SQLite packages in portable core files. An
explicit `*-bun.ts`, `*-node.ts`, `*-browser.ts`, `platform-*` directory,
`sync/` entrypoint, or test file can own a host dependency.

Every portable service must expose typed failures. A missing optional artifact
or capability must have the same meaning in all three clients.

## Three composition roots

| Concern         | Web                                 | Desktop                      | CLI                                   |
| --------------- | ----------------------------------- | ---------------------------- | ------------------------------------- |
| SQLite          | wa-sqlite in a worker over OPFS     | sqlite-node in Electron main | sqlite-bun                            |
| File artifacts  | browser stream and generation store | native file installer        | native file installer                 |
| Core access     | typed procedures                    | typed procedures             | the same core service called directly |
| Presentation    | shared Solid application            | shared Solid application     | text and stable JSON                  |
| Optional powers | browser capability adapter          | Electron capability adapter  | Bun capability adapter                |

The web and desktop apps share routes, components, procedure definitions, and
cache rules through `@bible/app`. The CLI does not copy UI behavior. It exposes
the same domain operation, input rules, result identity, fallback, and typed
failure through a command. Commands must keep machine-readable JSON where the
result is useful to another program or agent.

Procedure handlers and CLI commands are transport adapters. They cannot own
wiki rules. Both call the same core service.

## Ticket application

- The topics artifact uses one core manifest, schema, verifier, and install
  policy. Each client supplies its storage and download adapter.
- Phrase matching and segment generation stay pure. Solid renders interactive
  links. The CLI can return typed matches and topic identities.
- Topic page composition and select-to-lookup routing stay in core. The shared
  app renders panes and cards. The CLI returns the same sections as text or
  JSON.
- The study service exposes Strong's data, cross-references, commentary, and
  parallel writings. The web and desktop use procedures. The CLI calls the
  same service directly.
- The hybrid search parser, lexical retrieval contract, vector scan, fusion,
  and fallback stay in core. Browser and native adapters produce query vectors
  for one pinned model fingerprint. All clients use the same ranking fixtures.
- The markdown compiler is Bun build tooling. Its output is a portable,
  versioned artifact. No client compiles topic markdown at runtime.
- The content update policy is one domain policy. Each client supplies its
  update prompt or command surface.

## Acceptance rules

Each implementation milestone must include these checks:

1. Run Oxlint to prove that portable core has no host imports.
2. Run core contract tests with test services.
3. Run adapter tests for the web worker, Electron main process, and Bun CLI.
4. Run the same search and topic fixtures in all three clients.
5. Build the web app, desktop app, and CLI.
6. Verify one web workflow, one desktop workflow, and one CLI JSON workflow.

UI-only decisions can apply only to web and desktop. The ticket must state the
equivalent CLI domain operation or state that no CLI operation applies.
