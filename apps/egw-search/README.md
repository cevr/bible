# EGW Search

Build and run the app with:

```sh
bun run --cwd apps/egw-search build
bun run --cwd apps/egw-search start
```

Run the owned browser regression fixture with:

```sh
bun run --cwd apps/egw-search test:browser
```

The command builds the browser entry, starts a real Effect Frame
`ActorHost`/`HttpServer` fixture on port `3187` (set `EGW_BROWSER_PORT` to use
another), and runs Playwright against that server. The fixture uses deterministic search responses. It does not
read the private EGW corpus or use credentials. Playwright owns the fixture
process and closes it after the run. Install the browser once with:

```sh
bunx playwright install chromium
```

The fixture serves the same streamed page document as the app
(`server/document.ts`). It checks that a first load reads its queries on the
server and hydrates with no mismatch, then the HTTP batch transport, URL
history, row identity, typed query failures, recovery, request cancellation,
and query resource release. It does not prove production corpus retrieval or browser behavior in
the deployed service. Failures retain Playwright traces under
`apps/egw-search/test-results/`; save fixture output in the existing runtime
log tree when a run needs a durable receipt:

```sh
bun run --cwd apps/egw-search test:browser \
  2>&1 | tee tmp/logs/egw-frame-dx/browser.log
```
