#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
source scripts/toolchain.sh
swift run "${SELAH_SWIFT_ARGS[@]}" -c release SelahBenchmark Sources/SelahApp/Resources/kjv.json
