#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
mkdir -p .build
swiftc -O -parse-as-library Sources/SelahCore/*.swift scripts/benchmark.swift -o .build/selah-benchmark
.build/selah-benchmark Sources/SelahApp/Resources/kjv.json
