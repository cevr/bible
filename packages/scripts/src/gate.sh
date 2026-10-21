#!/bin/sh
# `bun run gate`: the feedback cycle, in two phases. Each phase runs to its
# end whatever the other answers, and the gate fails when either fails.
#
# 1. The checks, which hold no time limit (`gate:checks`): lint, the format
#    check, the dead exports and turbo's `gate` task (every package's
#    typecheck and build, then the packages' own `gate` scripts: Selah's
#    native gate, and firsttheblade's promise check over its built output),
#    all at once, at a lowered priority (`taskpolicy -c utility` on
#    macOS, `nice -n 19` elsewhere), so the tests of another gate on the
#    machine keep the cores they need.
# 2. The work that holds a time limit (`gate:tests`): each workspace's
#    `test` (bun's 5 s a case) and `gate:timed` (a package's own check that
#    waits on a browser with time limits: firsttheblade's built pages'
#    contrast), each alone, one after another, as `test:budget` measures a
#    test, then the film's guard tests, under the host's test lock (`flock`
#    where there is one, else `lockf -k`, on `$LOCK`), so two gates on one
#    machine take turns. Selah's tests are its native gate's, in the checks,
#    so its workspace is left out here.
#
# A case's limit holds on the machine its time was measured on, alone: beside
# every other workspace's tests, the typechecks and the native build, a case
# takes ten times as long or more (one of 0.47 s alone takes 6.1 s), and
# the contrast check's browser, at the checks' lowered priority beside a cold
# build, missed its 30 s screenshot limit, so the timed work runs with nothing
# else of the gate's beside it.
set -u
cd "$(dirname "$0")/../../.."

LOCK=/tmp/manna-gate-tests.lock

low() {
  if command -v taskpolicy >/dev/null 2>&1; then taskpolicy -c utility "$@"; else nice -n 19 "$@"; fi
}

locked() {
  if command -v flock >/dev/null 2>&1; then flock "$LOCK" "$@"; else lockf -k "$LOCK" "$@"; fi
}

low bun run gate:checks
checks=$?
echo "gate: the checks exited $checks; the tests wait for the host's test lock ($LOCK)"
locked bun run gate:tests
tests=$?
echo "gate: the checks exited $checks, the tests $tests"
[ "$checks" -eq 0 ] && [ "$tests" -eq 0 ]
