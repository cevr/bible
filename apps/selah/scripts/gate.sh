#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
source scripts/toolchain.sh
swift format lint --strict --recursive Package.swift Sources Tests Benchmarks Tools
swift build "${SELAH_SWIFT_ARGS[@]}" "${SELAH_TEST_ARGS[@]}" -Xswiftc -warnings-as-errors
./scripts/test.sh
