---
name: verify-hymnal
description: >
  Launch, check and drive the hymnal app (apps/hymnal, One: React Native on
  iOS and react-native-web) as a reader does, and keep the proof. Use to run
  the hymnal on its own iOS simulator (verify-hymnal) or in a headless
  browser, to open a hymn by deep link or route, to tap and scroll the hymn
  list, a hymn, the player, search or settings, or to check a hymnal change
  in the real app before review or merge.
---

# Verify the hymnal

The hymnal is one One app (README of `apps/hymnal`): the same tree runs on
iOS from a Debug build that loads its JavaScript from a dev server, and on
the web from that dev server. Both launch models go through one helper,
`apps/hymnal/scripts/sim.ts`, an Effect CLI that prints one JSON line per
command:

- **iOS** (the default): the simulator named `verify-hymnal` (created when
  missing, never another one), a Debug build of this checkout installed on
  it, the dev server on a port of 8270-8279.
- **Web**: the same dev server, driven in a muted headless browser through
  `agent-browser`.

Never drive the owner's preview (ports 8191 and 8095) or the owner's
iPhone, and never boot, erase or drive another unit's simulator.

Run every command from the repo root. `RUN` names this run
(`hymnal-<topic>`), `EVIDENCE=$PWD/tmp/verify/$RUN` is its proof folder
(`tmp/` is git-ignored), and `PORT` is a free port of 8270-8279. The
helper keeps the drive's session in session.json under tmp/verify-hymnal; one
drive at a time per checkout, or give each its own `--state <dir>`.

## Launch

1. `bun install --frozen-lockfile` once per checkout, and again only when
   `bun.lock` changed.
2. Check the host first: a 1-minute load at most 12 (`sysctl -n vm.loadavg`),
   swap below 8 GB (`sysctl -n vm.swapusage`) and at least 10 GB free
   (`df -h /System/Volumes/Data`). A cold iOS build takes about 15 minutes
   and some GB of disk in the app's generated ios folder (git-ignored).
3. Boot. It starts the dev server (`one dev`, its output in
   `$EVIDENCE/server.log`) and, on iOS, boots `verify-hymnal` and points the
   app at the server:

   ```bash
   bun run --cwd apps/hymnal sim boot --platform ios --port $PORT --out "$EVIDENCE"
   ```

   Ready is `{"ok":true,"command":"boot",…,"detail":{"udid":…,"port":…,"serverPid":…}}`
   once the server answers. `--platform web` opens the app's `/` in the
   browser instead.

4. iOS only, build and install this checkout's app:

   ```bash
   bun run --cwd apps/hymnal sim install --prebuild
   ```

   It runs `one prebuild` (with `--prebuild`, or when the app's generated ios
   folder is missing), adds the `hymnal` URL scheme to that folder's
   Info.plist (git-ignored),
   builds Debug for the simulator (arm64 only), installs, launches, and
   waits for `label=Hymns`. The build log is `$EVIDENCE/build.log`. Leave
   `--prebuild` off while that folder is fresh: the build after the
   first is incremental. Pass it again when the folder's `build` was
   removed: it holds the codegen pod install wrote, and a build without it
   fails with "Build input file cannot be found". `--app <Hymnal.app>` installs a given build instead
   (a copy, the scheme added, signed ad hoc).

## Doctor

Before the first drive, and again after any surprising result:

```bash
bun run --cwd apps/hymnal sim doctor
```

It is read only. It prints `detail` with `head` (the commit the checkout is
at: compare it with the commit under test), `audioHolders` (lines of
`pmset -g assertions` that hold audio out), `load`, `cores` and
`timingsHold`; when `timingsHold` is false, no timing of this drive claims
anything. Or it fails with `Unhealthy` naming the first check that does not
hold: `server-pid` (the recorded `sim serve` runs), `port-owner` (the port
is held by that process or a child of it), `server-answers` (the server
answers), `server-log` (no failure line in `server.log`); on iOS a simulator
that is not booted fails as `SimulatorDown`.

## Drive

Each step is one `sim` command. The feature files write
`bun run --cwd apps/hymnal sim` as `sim`.

- `sim open <link> --expect <target>`: a screen by its route, as in
  `sim open hymns/100`. iOS opens `hymnal://hymns/100`, the web
  `http://127.0.0.1:$PORT/hymns/100`. `--expect` waits for a target.
- `sim tap <target>`, `sim fill <target> <text>`,
  `sim scroll <target|screen> <up|down|left|right>`, and `sim back` (the
  header's back button on iOS, the browser's Back on the web).
- A target is `label=<accessible name>` (the `aria-label`, or the text of
  a control) or `id=<testID>`, matched whole on both platforms. When a name
  matches more than one element (on iOS a row's link and its group share
  one name; the Search tab, its title and its back button share another),
  put the role first: `role=link label=100, Great Is Thy Faithfulness`,
  `role=button label=Search`. Never a coordinate or a style.
- On iOS, `sim open` answers the system's "Open in “Hymnal”?" prompt with
  Open, as a reader does; `detail.prompts` counts the prompts it answered.
- Reach a state the way a reader does: a tap, a scroll, a deep link the
  app answers. Never write the app's storage or call its atoms to get
  there.

The journeys, one file per feature: [features/README.md](features/README.md).

## Evidence

All of it goes under `$EVIDENCE`, outside the checkout's tracked files:

- `sim record start <journey>` before a journey and `sim record stop` after
  it: `video/<journey>.mp4` (iOS) or `.webm` (web, no sound: the browser is
  muted). Prove it plays: `ffprobe` reports a duration above 0. Skip it
  only when a run says why.
- For each step, its JSON line appended to `$EVIDENCE/results.jsonl`, then
  `sim snapshot <step>` (the accessibility tree, `snapshots/<step>.txt`)
  and `sim shot <step>` (`shots/<step>.png`).
- `sim log` at the end: `app.log` (the simulator's log for Hymnal since
  boot) or `console.log` (the page's console), beside `server.log`.
- A choice the app keeps (a setting) is proved by a second view: leave the
  screen and come back, or relaunch, and read it again.
- A flaky step is reported as n/n trials with the load.
- A failure is run again on the base commit, in its own checkout and port,
  to tell a new failure from an old one.
- A feature that is not on main (chords toggle, capo, about) is reported
  as `TargetMissing` with the reason from its feature file, never as passed
  through another path.

## Cleanup

```bash
bun run --cwd apps/hymnal sim down
```

It closes the driver session, shuts down `verify-hymnal` (iOS), stops the
dev server by its recorded PID (never by name), and moves the session file
into `$EVIDENCE`. Then check that nothing listens on the port
(`lsof -nP -iTCP:$PORT -sTCP:LISTEN` prints nothing). Evidence stays.

## Helpers

`apps/hymnal/scripts/sim.ts` (`bun run --cwd apps/hymnal sim <command>`;
`--help` on any command). Every command prints one JSON line on stdout,
`{"ok":true,"command":…,"platform":…,"paths":{…},"detail":{…},"ms":…}`, and
exits 0; or `{"ok":false,"command":…,"message":…,"error":{"_tag":…},"ms":…}`
and exits 1. The tags: `NoSession`, `SimulatorDown`, `ReadinessTimedOut`,
`TargetMissing` (with what the driver said), `ToolMissing`, `ToolFailed`,
`NotOnPlatform`, `HostFailed`, `Unhealthy`, `BadArguments` (an unknown
command or flag; the help goes to stderr). The commands: `boot`, `install`,
`doctor`, `open`, `tap`, `back`, `fill`, `scroll`, `shot`, `snapshot`, `record`, `log`,
`down`, and `serve` (the dev server's own process, which `boot` starts).
Its tests: `apps/hymnal/scripts/sim/sim.test.ts`, run by the hymnal's
`test:infra`.

## Hosts

- **The laptop** (macOS): iOS and web. The owner's previews hold 8191 and
  8095; this skill uses 8270-8279 only. The shell unit's simulator and
  ports 8260-8269 belong to another unit.
- **The Workbox** (Linux): no iOS simulator, so the web only. Unproven
  there: no run of this skill has been made on the Workbox.
