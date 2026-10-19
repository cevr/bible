#!/bin/zsh
# The debug build with its tests, warnings as errors: Selah's `typecheck`, and the
# step `test` depends on (apps/selah/turbo.json), so `swift test` finds every
# target built and linked: it plans the build, rebuilds only what changed, and
# runs the tests. Both read SELAH_DEBUG_ARGS (toolchain.sh).
set -euo pipefail
cd "${0:A:h:h}"
source scripts/toolchain.sh
swift build "${SELAH_DEBUG_ARGS[@]}" --build-tests
