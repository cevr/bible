#!/usr/bin/env bash
# Vendor effect-frame's packages as real copies.
#
# effect-frame is unpublished, so this repo consumes it from a sibling
# checkout. It must be a *copy*, not a symlink: module resolution walks the
# real path, and a symlink into the other checkout would make every frame
# file resolve `effect` from that checkout's own node_modules. The process
# would then hold two copies of the library, and a Schema built here fails
# to decode inside the frame (two class hierarchies). A copy keeps every
# real path under this repo, so `effect` resolves exactly once.
#
# Usage: scripts/vendor-effect-frame.sh [source-checkout]
# Default source: the effect-frame checkout named in vendor/effect-frame/SOURCE,
# else ~/Developer/personal/effect-frame.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/effect-frame"
DEFAULT_SOURCE="$HOME/Developer/personal/effect-frame"
SOURCE="${1:-}"
if [[ -z "$SOURCE" && -f "$DEST/SOURCE" ]]; then
  SOURCE="$(sed -n 's/^path: //p' "$DEST/SOURCE")"
fi
SOURCE="${SOURCE:-$DEFAULT_SOURCE}"

if [[ ! -d "$SOURCE/packages/actor" ]]; then
  echo "vendor-effect-frame: no effect-frame checkout at $SOURCE" >&2
  exit 1
fi

mkdir -p "$DEST"
for name in actor view router; do
  # Only what a consumer needs: sources and the manifest. Tests, build
  # output, the package's own tsconfig, and installed packages stay in the
  # checkout; the app's tsconfig types the sources it imports.
  rsync -a --delete \
    --exclude node_modules --exclude dist --exclude tests \
    --exclude tsconfig.json --exclude tsconfig.build.json \
    --exclude tsdown.config.ts --exclude '*.tsbuildinfo' \
    "$SOURCE/packages/$name/" "$DEST/$name/"
  # A vendored package is a library, not a workspace with tasks: no scripts
  # for turbo to run, no devDependencies for bun to install. The published
  # manifest exports built dist; the vendored copy ships sources, so every
  # export is pointed back at its source file, and the copy is never
  # published from here.
  jq '
    del(.scripts, .devDependencies, .files, .publishConfig)
    | .private = true
    | .exports |= with_entries(
        .value = (
          (if (.value | type) == "object" then .value.import.default else .value end)
          | sub("^\\./dist/"; "./src/")
          | sub("\\.js$"; ".ts")
        )
      )
  ' "$SOURCE/packages/$name/package.json" > "$DEST/$name/package.json"
done

COMMIT="$(git -C "$SOURCE" rev-parse HEAD)"
BRANCH="$(git -C "$SOURCE" rev-parse --abbrev-ref HEAD)"
{
  echo "# Written by scripts/vendor-effect-frame.sh. Do not edit the vendored"
  echo "# packages here; change effect-frame and run the script again."
  echo "path: $SOURCE"
  echo "branch: $BRANCH"
  echo "commit: $COMMIT"
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$DEST/SOURCE"

echo "vendored effect-frame $BRANCH@${COMMIT:0:7} from $SOURCE"
