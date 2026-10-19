#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
source scripts/toolchain.sh
swift format lint --strict --recursive Package.swift Sources Tests Benchmarks Tools
./scripts/compile.sh
./scripts/test.sh
