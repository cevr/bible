---
name: verify-firsttheblade
description: >
  Launch, check and drive the First the Blade website (apps/firsttheblade,
  firsttheblade.com) as a visitor does, and keep the proof. Use to run the
  site locally (its preview, with the email list in memory and letters in an
  outbox), to drive a page or the email list (sign up, the confirm link and
  its in-place answer, the button with script off, Leave, privacy, the 404,
  redirects), to check a change to the site in the real app before review or
  merge, or to deploy and read a throwaway agent stage.
---

# Verify First the Blade

The site is prerendered pages behind an Effect Worker (README of
`apps/firsttheblade`). There are two launch models:

- **The local preview** (the default): `dist/` served through the Worker's
  own policy, the email list in memory, each letter written to an outbox file
  instead of sent. Everything below runs on it.
- **A throwaway stage** on Cloudflare (`agent-<name>`, its own `workers.dev`
  host). Use it only for what the preview cannot show: Cloudflare's asset
  handling (the 307s of `auto-trailing-slash`), D1, the queue. Its letters
  are real email, so the email list's journeys stay on the preview.

Never drive prod (firsttheblade.com) or the owner's own preview (port 8470).
A check may read prod with GET only.

Run every command from the repo root. `RUN` names this run (`ftb-<topic>`),
`ROOT=tmp/verify/$RUN` is its scratch root and `EVIDENCE=$ROOT/evidence`
its proof; `tmp/` is git-ignored. Pick a free port per run (`PORT`, never
8470).

## Launch

1. `bun install --frozen-lockfile` once per checkout, and again only when
   `bun.lock` changed.
2. Build the commit under test: `bun run --cwd apps/firsttheblade build`
   (one build at a time on a host; it writes the app's `dist` folder).
3. Start the preview in the scratch root, in the background (it holds until
   stopped):

   ```bash
   bun run --cwd apps/firsttheblade verify:launch --root "$PWD/$ROOT" --port $PORT
   ```

   Ready is its one JSON line, printed once the home page answers 200:
   `{"root":…,"port":…,"origin":"http://127.0.0.1:<port>","pid":…,"head":…,"outbox":…,"log":…}`.
   The record is kept at `$ROOT/launch.json`. The preview runs with the root
   as its directory: `dist` there links to the app's build, its letters go to
   `$ROOT/tmp/outbox/<n>.txt`, its log is `$ROOT/preview.log`, and no `.env`
   is read, so no secret of the app's enters a run. The list is empty at
   each launch.

A stage instead: build, then

```bash
bun run --cwd apps/firsttheblade verify:stage up --stage agent-<name> --root "$PWD/$ROOT"
```

It prints `{"stage":…,"action":"up","url":"https://….workers.dev","log":…}`
and refuses any stage not named `agent-<name>`. Deploying needs the Alchemy
Cloudflare profile and the app's `.env` (README, Commands).

## Doctor

Before the first drive, and again after any surprising result:

```bash
bun run --cwd apps/firsttheblade verify:doctor --root "$PWD/$ROOT"
```

It prints `{"ok":true,"checks":[…],"timingsValid":…}` or fails with
`DoctorFailed` naming the first check that does not hold: `record` (the
launch record reads), `port` (held by the recorded PID), `head` (the
checkout is at the launched commit, and the build is newer than every file
under `src/` and `public/`), `answers` (`/` and `/privacy` 200 with the
content policy, a missing page 404), `log` (no failure line in
`preview.log`), `outbox` (every letter reads), `audio` (on macOS, no test
browser holds the audio output). `load` is the load average against the
cores: when `timingsValid` is false, a timing measured now claims nothing.

A stage: `verify:doctor --origin <url>` runs `answers` and `load`, GET only.

## Drive

Every browser is muted and named for the run. Set once per shell:

```bash
export AGENT_BROWSER_SESSION=$RUN AGENT_BROWSER_ARGS=--mute-audio,--disable-audio-output
```

then `agent-browser open http://127.0.0.1:$PORT/`. The feature files write
`agent-browser` as `ab`.

- Find by ARIA role and accessible name with `--exact`
  (`ab find role button click --name "Email me new films" --exact`): a name
  match is a substring without it, so `Subscribe` also matches
  "Subscribe on YouTube". Never a class, a CSS path or a coordinate.
- Reach every state by the visitor's path: the form, the link in the
  letter, the browser's own reload. Never post to a route with `curl` to
  reach a state, and never build a token.
- The confirm journeys need what `agent-browser` lacks (script off, the
  skeleton's 600 ms, the page's own POST counted), so `verify:drive` runs
  them in Playwright on a preview of its own (Helpers).

The feature map is [features/README.md](features/README.md): read it, then
the feature file you need.

## Evidence

Proof goes to `$EVIDENCE/<feature>/`, outside the tree git tracks.

- **Video** of each journey: `verify:drive` records `<journey>.webm` by
  default (`--no-video` skips it) and proves it plays (`ffprobe` seconds
  above 0, in its JSON). With `agent-browser`, wrap the journey in
  `ab record start "$EVIDENCE/<feature>/<feature>.webm"` and `ab record stop`.
- **Each step**: the action, `ab get url` after it, `ab snapshot` into
  `<n>-<step>.aria.txt` and `ab screenshot <n>-<step>.png`. `verify:drive`
  writes these and a `steps.json` itself.
- **A write proved by a second view**: a confirm is proved by signing up
  again with the confirmed address: the log says `[mail] subscribe.quiet`
  and no second letter comes (`verify:outbox --to <address>`).
- **A flaky step** as n/n trials with the doctor's load.
- **A failure** rerun on the base commit, in its own worktree, on another
  port and root, to tell new from pre-existing.
- **An unreachable entry point** reported with its unmet precondition (Leave
  needs a film in a series' `episodes`), never passed through another path.

## Cleanup

- `bun run --cwd apps/firsttheblade verify:stop --root "$PWD/$ROOT"` stops
  the preview by its recorded PID, only once that PID is a preview running
  in that root, and waits for the port to be free. Never stop by name
  (`pkill -f`): that stops the owner's preview too.
- `verify:drive` stops its own preview and Chrome when it ends, failed or not.
- `ab close` closes the run's browser session.
- A stage: `bun run --cwd apps/firsttheblade verify:stage down --stage agent-<name> --root "$PWD/$ROOT"`.
- `trash $ROOT/tmp $ROOT/dist $ROOT/launch.json` once the evidence is read;
  the evidence stays.

## Helpers

Each is a script of the app (`apps/firsttheblade/scripts/verify/cli.ts`,
Effect on Bun). Each prints one JSON line on success; on failure a tagged
error (`Refused`, `NotBuilt`, `NotReady`, `DoctorFailed`, `JourneyFailed`,
`CommandFailed`) and exit 1. Their logic is tested by
`apps/firsttheblade/scripts/verify/verify.test.ts`.

| Command                                                                                                          | What it prints                                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `bun run --cwd apps/firsttheblade verify:launch --root <dir> --port <p>`                                         | the launch record, once ready; holds until stopped                                                            |
| `bun run --cwd apps/firsttheblade verify:stop --root <dir>`                                                      | `{"stopped":<pid>,"port":…,"root":…}`                                                                         |
| `bun run --cwd apps/firsttheblade verify:doctor --root <dir>` (or `--origin <url>`)                              | the checks, or the first that failed                                                                          |
| `bun run --cwd apps/firsttheblade verify:outbox --root <dir> [--to <address>]`                                   | `{"outbox":…,"letters":[{"n","to","subject","kind","link"}]}`; `kind` is `confirm`, `film` or `other`         |
| `bun run --cwd apps/firsttheblade verify:drive <journey>… --root <dir> --port <p> --evidence <dir> [--no-video]` | `{"passed":true,"doctor":…,"journeys":[{"journey","steps","video"}]}`; journeys `confirm`, `confirm-noscript` |
| `bun run --cwd apps/firsttheblade verify:stage up\|down --stage agent-<name> --root <dir>`                       | `{"stage","action","url","log"}`                                                                              |

`verify:drive` launches its own preview on `--port` in `--root` (so the
root must not hold a running one), runs the doctor, then each journey in its
own context of one muted Chrome (`channel: 'chrome'`, headless).

## Hosts

- **Laptop** (macOS): proven here. Google Chrome is installed; `pmset` checks
  the audio. The owner's preview, when he runs one, is on 8470.
- **Workbox** (Linux, `/workspaces/bible-tools`): unproven. It has no
  `pmset` (the doctor's `audio` reads "not checked"), and `verify:drive`
  needs Google Chrome there (`chrome` channel), as the app's `contrast`
  check does. The owner opens a Workbox preview over Tailscale, so bind no
  port he uses.
