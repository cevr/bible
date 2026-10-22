#!/bin/sh
# `bun run test:slow`: everything the gate leaves out, by hand and before each
# deploy (each workspace's `deploy` runs its own `test:slow` first). Each step
# runs to its end whatever another answers; the suite fails when any fails.
#
# 1. Every workspace's typecheck, every build, then each workspace's
#    `test:slow` (its `*.slow.test.*` files and its own slow checks: browser
#    tests, the site's built-page checks, Selah's native gate, the film's e2e),
#    one task at a time: the browser checks hold time limits that hold only
#    with nothing else beside them.
# 2. The full lint (`bun run lint`): the judged rules, then every rule over
#    every file, no file kept.
# 3. The format check and the dead exports.
# 4. `bun run test:reads`: each file, module and native library a unit
#    test's bun processes open is one its cached `test` task hashes
#    (`test-reads.ts`).
#
# It runs under the host's test lock (`flock` where there is one, else
# `lockf -k`, on `$LOCK`), so two slow suites on one machine take turns.
set -u
cd "$(dirname "$0")/../../.."

LOCK=/tmp/manna-gate-tests.lock

if [ "${MANNA_TEST_SLOW_LOCKED:-}" != 1 ]; then
  export MANNA_TEST_SLOW_LOCKED=1
  if command -v flock >/dev/null 2>&1; then exec flock "$LOCK" sh "$0" "$@"; fi
  exec lockf -k "$LOCK" sh "$0" "$@"
fi

node_modules/.bin/turbo run typecheck build test:slow --concurrency=1 --ui=stream --output-logs=errors-only
turbo=$?
bun run lint
lint=$?
bun run fmt:check
fmt=$?
bun run dead-exports
dead=$?
bun run test:reads
reads=$?

echo "test:slow: turbo exited $turbo, lint $lint, fmt $fmt, dead-exports $dead, test:reads $reads"
[ "$turbo" -eq 0 ] && [ "$lint" -eq 0 ] && [ "$fmt" -eq 0 ] && [ "$dead" -eq 0 ] && [ "$reads" -eq 0 ]
