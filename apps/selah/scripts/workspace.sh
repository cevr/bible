#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ]; then
  echo "Selah: native macOS $1 skipped on $(uname -s); SwiftUI validation runs in the macOS CI job."
  exit 0
fi
case "$1" in
  build) exec ./scripts/build-app.sh ;;
  gate) exec ./scripts/gate.sh ;;
  typecheck) exec zsh -c 'source scripts/toolchain.sh; swift build "${SELAH_SWIFT_ARGS[@]}" -Xswiftc -warnings-as-errors' ;;
  *) echo "Unknown Selah task: $1" >&2; exit 1 ;;
esac
