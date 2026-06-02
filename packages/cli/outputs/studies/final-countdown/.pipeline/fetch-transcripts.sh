#!/usr/bin/env bash
# Fetch all transcripts from the two "Final Countdown" / "Judgment Day" playlists.
# Builds a manifest.json mapping videoId -> {title, playlist, order} and downloads
# each transcript to transcripts/<order>-<videoId>.txt
set -uo pipefail

cd "$(dirname "$0")"
BASE="$(pwd)"
TX="$BASE/transcripts"
mkdir -p "$TX"

PLAYLISTS=(
  "final-countdown|https://www.youtube.com/playlist?list=PL13eE2x3qhPkpD7i7Nxdq7RIRel2s30p9"
  "judgment-day|https://www.youtube.com/playlist?list=PL13eE2x3qhPkusBb1MHwrzNIT2KrcfRHM"
)

MANIFEST="$BASE/manifest.tsv"
: > "$MANIFEST"   # truncate

global=0
for entry in "${PLAYLISTS[@]}"; do
  slug="${entry%%|*}"
  url="${entry#*|}"
  echo ">>> Enumerating playlist: $slug"
  # id<TAB>title
  while IFS='|' read -r vid title; do
    [ -z "$vid" ] && continue
    global=$((global+1))
    order=$(printf "%03d" "$global")
    printf '%s\t%s\t%s\t%s\n' "$order" "$vid" "$slug" "$title" >> "$MANIFEST"
  done < <(yt-dlp --flat-playlist --print "%(id)s|%(title)s" "$url" 2>/dev/null)
done

total=$(wc -l < "$MANIFEST" | tr -d ' ')
echo ">>> Manifest built: $total videos"

ok=0; fail=0; skip=0
FAILED="$BASE/failed.txt"; : > "$FAILED"
while IFS=$'\t' read -r order vid slug title; do
  out="$TX/${order}-${vid}.txt"
  if [ -s "$out" ]; then
    skip=$((skip+1)); continue
  fi
  echo ">>> [$order] $vid  ($slug)  $title"
  if ytt "$vid" -o "$TX" >/dev/null 2>&1 && [ -s "$TX/${vid}.txt" ]; then
    mv "$TX/${vid}.txt" "$out"
    ok=$((ok+1))
  else
    echo "    !! FAILED: $vid"
    printf '%s\t%s\t%s\t%s\n' "$order" "$vid" "$slug" "$title" >> "$FAILED"
    fail=$((fail+1))
  fi
done < "$MANIFEST"

echo ""
echo "=== DONE: ok=$ok skip=$skip fail=$fail total=$total ==="
[ "$fail" -gt 0 ] && echo "Failed list -> $FAILED"
exit 0
