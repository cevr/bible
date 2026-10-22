#!/bin/sh
# `bun run gate`: did a change break something plain? Two legs, side by side:
#
# 1. The lint (`lint-gate.ts`): every deterministic rule. The native rules run
#    over every file; the JS plugins' rules only over the files whose content
#    no earlier run passed. The judged rules are not here: `bun run lint`
#    runs them in the slow suite.
# 2. Every workspace's unit tests (`turbo run test`), cached by turbo on each
#    workspace's inputs (`turbo.json`): a workspace runs again only when a file
#    it or a dependency reads changed.
#
# The typecheck and the format run in pre-commit (`lefthook.yml`), on what a
# commit touches. Builds, browser checks, the slow tests, the full lint and
# the e2e are `bun run test:slow` (`test-slow.sh`), by hand and before each
# deploy. The gate prints its wall time last; it holds no lock, since a
# workspace's unit tests take under 1 s (`bun run test:budget`).
set -u
cd "$(dirname "$0")/../../.."

now() { perl -MTime::HiRes=time -e 'printf "%d", time * 1000'; }
started=$(now)

bun packages/scripts/src/lint-gate.ts &
lint_pid=$!
node_modules/.bin/turbo run test --output-logs=errors-only --ui=stream
tests=$?
wait "$lint_pid"
lint=$?

echo "gate: lint exited $lint, tests $tests, $(($(now) - started)) ms"
[ "$lint" -eq 0 ] && [ "$tests" -eq 0 ]
