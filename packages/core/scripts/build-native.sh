#!/usr/bin/env bash
#
# Builds the two optional accelerators for `scanVectorIndex`.
#
# Both are optional: `vector-accel.ts` falls back to the pure TypeScript loop
# when neither artifact is present, so a checkout that never runs this script
# is correct, only slower. That is why this is not wired into `bun run build`.
#
#   ./scripts/build-native.sh          # host native + wasm
#   ./scripts/build-native.sh wasm     # wasm only (portable, all hosts)
#   TARGET=aarch64-linux-gnu ./scripts/build-native.sh native   # cross-compile
#
# `zig cc` rather than `cc`: one toolchain cross-compiles to every target the
# deployment needs (the Railway container is linux/arm64) and to wasm32, and
# Apple's clang cannot target wasm32 at all.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$here/native"
out="$here/dist-native"
what="${1:-all}"

mkdir -p "$out"

build_wasm() {
  echo "wasm32 simd128 -> $out/vector-scan.wasm"
  # `--initial-memory=0` so the *host* decides how much linear memory to
  # provide. Without it the module declares a minimum of its own, and a host
  # that supplies a smaller `WebAssembly.Memory` — which is every host, because
  # the size depends on the corpus — fails to instantiate with a LinkError
  # rather than falling back cleanly.
  zig cc --target=wasm32-freestanding -msimd128 -O3 -nostdlib \
    -Wl,--no-entry -Wl,--import-memory -Wl,--initial-memory=0 \
    -o "$out/vector-scan.wasm" "$src/vector-scan-wasm.c"
}

build_native() {
  # The extension the platform's dynamic loader expects.
  case "$(uname -s)" in
    Darwin) ext="dylib" ;;
    *)      ext="so" ;;
  esac
  # A cross-compile names its own file, because a linux .so built on a mac
  # must not overwrite the mac's .dylib.
  if [ -n "${TARGET:-}" ]; then
    echo "$TARGET -> $out/vector-scan-$TARGET.so"
    zig cc --target="$TARGET" -O3 -shared -fPIC \
      -o "$out/vector-scan-$TARGET.so" "$src/vector-scan.c"
  else
    echo "host native -> $out/vector-scan.$ext"
    # -O3 only: never -march=native, which bakes in whatever the *build*
    # machine happens to support and faults on an older one. The source
    # selects NEON or AVX2 from the target's own feature macros.
    zig cc -O3 -shared -fPIC -o "$out/vector-scan.$ext" "$src/vector-scan.c"
  fi
}

case "$what" in
  wasm)   build_wasm ;;
  native) build_native ;;
  all)    build_native; build_wasm ;;
  *) echo "usage: $0 [all|wasm|native]" >&2; exit 2 ;;
esac

echo "done"
