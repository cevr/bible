# EGW Search

A Solid 2 page over an Effect `HttpApi` server. Build and run the app with:

```sh
bun run --cwd apps/egw-search build
bun run --cwd apps/egw-search start
```

`build` is a Vite build into `dist/`; the server (`server/main.ts`) serves it
beside `/api/search`, `/api/search/batch` and `/health`. For development,
`bun run --cwd apps/egw-search dev` runs Vite on port 5273 with `/api`
proxied to the server on port 3101.

## Deploy

Production is a Cloudflare Worker (`server/cloudflare/Search.ts`) declared in
`alchemy.run.ts`. It answers the same `SearchApi` as `server/main.ts`, with the
corpus in D1, the vectors in Vectorize and the query embedder on Workers AI
(the table in `Search.ts` maps each one). `.github/workflows/deploy-egw-search.yml`
deploys `prod` from `main` and a `pr-<n>` preview per pull request. For local
work, deploy a throwaway stage and check it:

```sh
bun run --cwd apps/egw-search test:deploy
```

Every stage reads one shared corpus and index (`server/cloudflare/resources.ts`),
adopted and retained, so a teardown removes only its Worker. They were loaded
once from `egw-paragraphs.db` and `vectors.bvi`; the weekly sync still runs only
in the Bun server. `alchemy.railway.ts` is the Railway deployment the Worker
replaces, kept until the cutover holds.

The URL is the search state. `src/url-state.ts` declares the workspace as a
`@bible/url-state` place — each pane's keys, their defaults, and which changes
push a history entry (a new query, a pane added or closed) or replace it (a
filter, the limit) — and the page reads and writes it through the place atom.
`src/scroll.ts` keeps each history entry's scroll position. Links keep the
spelling they have always had (`?q=latter+rain&q2=loud+cry&section2=bible`);
`src/url-state.test.ts` holds a corpus of them.

Run the owned browser regression fixture with:

```sh
bun run --cwd apps/egw-search test:browser
```

The command builds the page, starts a fixture server on port `3187` (set
`EGW_BROWSER_PORT` to use another) that serves the build and the app's own
`SearchApi` with deterministic answers, and runs Playwright against it. CI
runs it in the gate workflow's browser job. It
does not read the private EGW corpus or use credentials. Playwright owns the
fixture process and closes it after the run. Install the browser once with:

```sh
bunx playwright install chromium
```

The suite checks the batched search transport, the workspace in the URL and
its history, row identity across panes, a pane's unsent draft, debounced
filter changes, typed failures and recovery, request cancellation when a pane
closes, the viewport on filter changes and new panes, the scroll position on
Back, the row labels and context disclosure, and the not-found page. It does
not prove production corpus retrieval or browser behavior in the deployed
service. Failures retain Playwright traces under this app's `test-results/`
(git-ignored, written by the run).
