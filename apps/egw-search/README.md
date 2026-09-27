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

Run the owned browser regression fixture with:

```sh
bun run --cwd apps/egw-search test:browser
```

The command builds the page, starts a fixture server on port `3187` (set
`EGW_BROWSER_PORT` to use another) that serves the build and the app's own
`SearchApi` with deterministic answers, and runs Playwright against it. It
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
service. Failures retain Playwright traces under
`apps/egw-search/test-results/`.
