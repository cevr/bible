#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
swift format lint --strict --recursive Package.swift Sources Tests Benchmarks Tools
./scripts/compile.sh
./scripts/test.sh
