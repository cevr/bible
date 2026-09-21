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
#   ./scripts/build-native.sh check    # committed wasm still matches its C
#   TARGET=aarch64-linux-gnu ./scripts/build-native.sh native   # cross-compile
#
# `vector-scan.wasm` is committed and the rest of dist-native/ is not: see the
# note in the repository .gitignore for why, and run `check` after editing
# `native/vector-scan-wasm.c`.
#
# `zig cc` rather than `cc`: one toolchain cross-compiles to every target the
# deployment needs (the Railway container is linux/arm64) and to wasm32, and
# Apple's clang cannot target wasm32 at all.
# `-g0` is deliberate: path-dependent debug data would break byte equality
# when the same C is built from different checkouts or working directories.

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
  zig cc --target=wasm32-freestanding -msimd128 -O3 -g0 -nostdlib \
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
    # A cross-compile must name the vector unit, because a target triple does
    # not imply one: `x86_64-linux-gnu` is baseline x86-64, which is SSE2, so
    # `__AVX2__` is undefined and `vector-scan.c` silently compiles its *scalar*
    # path. That builds and loads and then reports isa 0, which the loader
    # refuses on purpose — an artifact that ships, is ignored, and says nothing.
    #
    # This is not the `-march=native` hazard the note below warns about. That
    # one bakes in whatever the *build* machine happens to have; this is a
    # deliberate claim about the deployment, and it is checked: the Railway
    # container reports `avx2` on all 48 cores of an AMD EPYC 9655P. The claim
    # has to be right, because an unsupported vector instruction is a SIGILL
    # that kills the process rather than an error any fallback can catch.
    echo "$TARGET${TARGET_CFLAGS:+ $TARGET_CFLAGS} -> $out/vector-scan-$TARGET.so"
    # shellcheck disable=SC2086 -- TARGET_CFLAGS is a flag list, split on purpose.
    zig cc --target="$TARGET" ${TARGET_CFLAGS:-} -O3 -g0 -shared -fPIC \
      -o "$out/vector-scan-$TARGET.so" "$src/vector-scan.c"
    verify_isa "$out/vector-scan-$TARGET.so"
  else
    echo "host native -> $out/vector-scan.$ext"
    # -O3 only: never -march=native, which bakes in whatever the *build*
    # machine happens to support and faults on an older one. The source
    # selects NEON or AVX2 from the target's own feature macros.
    zig cc -O3 -g0 -shared -fPIC -o "$out/vector-scan.$ext" "$src/vector-scan.c"
  fi
}

# `vector-scan.wasm` is committed, so it can drift from `vector-scan-wasm.c`
# the moment someone edits the C and does not rebuild. Nothing would fail
# loudly: the stale module still loads and still returns scores, just not the
# ones the source now describes. This rebuilds into a scratch file and compares,
# which is only meaningful because `zig cc` is byte-reproducible here.
# What `vector_scan_isa` compiled to, read back out of the artifact.
#
# The build cannot run a cross-compiled library, so this disassembles the one
# function whose whole job is to answer that question. Without it a scalar build
# is indistinguishable from an accelerated one until it reaches production and
# is quietly refused.
verify_isa() {
  lib="$1"
  if ! command -v objdump >/dev/null 2>&1; then
    echo "  (objdump absent -- cannot verify the vector unit)"
    return 0
  fi
  # The function is a single `return <constant>`, so the constant is the only
  # immediate in its body. A zeroing idiom (`xor eax, eax` on x86, `mov w0, #0`
  # on arm64) is the scalar build returning 0.
  body="$(objdump -d "$lib" 2>/dev/null | sed -n '/<vector_scan_isa>:/,/ret/p')"
  isa=''
  case "$body" in
    *'$0x1'*|*'#0x1'*|*'#1'*) isa=1 ;;
    *'$0x2'*|*'#0x2'*|*'#2'*) isa=2 ;;
    *xor*|*'#0x0'*|*'#0'*)    isa=0 ;;
  esac
  case "$isa" in
    1) echo "  avx2" ;;
    2) echo "  neon" ;;
    0) echo "  SCALAR -- the loader refuses isa 0; pass TARGET_CFLAGS=-mavx2 (x86) or equivalent" >&2; exit 1 ;;
    *) echo "  (could not read the vector unit from $lib)" ;;
  esac
}

check_wasm() {
  # No toolchain is not a failure. This runs in `bun test` on every machine
  # that clones the repository, and most of them have no reason to have zig;
  # the committed artifact is what they use, and they cannot have changed it
  # without also changing the C, which review catches.
  if ! command -v zig >/dev/null 2>&1; then
    echo "zig not installed -- skipping the wasm freshness check"
    return 0
  fi
  committed="$out/vector-scan.wasm"
  if [ ! -f "$committed" ]; then
    echo "missing $committed -- run: $0 wasm" >&2
    exit 1
  fi
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  zig cc --target=wasm32-freestanding -msimd128 -O3 -g0 -nostdlib \
    -Wl,--no-entry -Wl,--import-memory -Wl,--initial-memory=0 \
    -o "$tmp/vector-scan.wasm" "$src/vector-scan-wasm.c"
  if cmp -s "$tmp/vector-scan.wasm" "$committed"; then
    echo "wasm matches vector-scan-wasm.c"
  else
    echo "$committed is stale -- rebuild and commit it: $0 wasm" >&2
    exit 1
  fi

  # The committed x86-64 library, checked the same way and for the same reason.
  linux="$out/vector-scan-x86_64-linux-gnu.so"
  if [ -f "$linux" ]; then
    zig cc --target=x86_64-linux-gnu -mavx2 -O3 -g0 -shared -fPIC \
      -o "$tmp/vector-scan-x86_64-linux-gnu.so" "$src/vector-scan.c"
    if cmp -s "$tmp/vector-scan-x86_64-linux-gnu.so" "$linux"; then
      echo "x86_64 avx2 matches vector-scan.c"
    else
      echo "$linux is stale -- rebuild and commit it:" >&2
      echo "  TARGET=x86_64-linux-gnu TARGET_CFLAGS=-mavx2 $0 native" >&2
      exit 1
    fi
  fi
}

case "$what" in
  wasm)   build_wasm ;;
  native) build_native ;;
  check)  check_wasm ;;
  all)    build_native; build_wasm ;;
  *) echo "usage: $0 [all|wasm|native|check]" >&2; exit 2 ;;
esac

echo "done"
