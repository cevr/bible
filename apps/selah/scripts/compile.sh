#!/bin/zsh
# The debug build with its tests, warnings as errors: Selah's `typecheck`, and the
# step `test` depends on (apps/selah/turbo.json), so `swift test` finds every
# target built and only links and runs. The flags match test.sh's `swift test`
# exactly: SwiftPM rebuilds every target when its flags change.
set -euo pipefail
cd "${0:A:h:h}"
source scripts/toolchain.sh
swift build "${SELAH_SWIFT_ARGS[@]}" "${SELAH_TEST_ARGS[@]}" --build-tests -Xswiftc -warnings-as-errors
