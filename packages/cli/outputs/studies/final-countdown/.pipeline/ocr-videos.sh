#!/usr/bin/env bash
# For each video in manifest.tsv: download 480p, sample frames, OCR with macOS Vision,
# dedupe consecutive slides, and emit ocr/<order>-<vid>.ocr.txt with [mm:ss] timestamps.
# Idempotent: skips a video whose .ocr.txt already exists.
set -uo pipefail

cd "$(dirname "$0")"
BASE="$(pwd)"
OCR_BIN="$BASE/.bin/ocr"
OUT="$BASE/ocr"
VID="$BASE/video-tmp"
FR="$BASE/frames-tmp"
mkdir -p "$OUT" "$VID" "$FR"

MANIFEST="$BASE/manifest.tsv"
FPS_DIV=6   # one frame every 6 seconds

total=$(wc -l < "$MANIFEST" | tr -d ' ')
n=0; ok=0; skip=0; fail=0
FAILED="$BASE/ocr-failed.txt"; : > "$FAILED"

RAW="$BASE/raw"; mkdir -p "$RAW"

while IFS=$'\t' read -r order vid slug title <&9; do
  n=$((n+1))
  raw="$RAW/${order}-${vid}.raw.tsv"        # persisted, re-runnable for dedup
  final="$OUT/${order}-${vid}.ocr.txt"
  # OCR (the expensive step) is idempotent on the raw file; always (re)dedup from raw.
  if [ -s "$raw" ]; then
    skip=$((skip+1))
    python3 "$BASE/dedupe-ocr.py" "$raw" "$title" "$vid" > "$final"
    continue
  fi

  echo ">>> [$n/$total] $order $vid  $title"
  vfile="$VID/${vid}.mp4"

  # 1. download 480p (video only is enough for OCR; fall back to muxed)
  if [ ! -s "$vfile" ]; then
    yt-dlp -f "bestvideo[height<=480][ext=mp4]/best[height<=480]/best" \
      --no-playlist -o "$vfile" "https://www.youtube.com/watch?v=$vid" \
      </dev/null >/dev/null 2>&1 || true
  fi
  if [ ! -s "$vfile" ]; then
    echo "    !! download failed"; printf '%s\t%s\tdownload\n' "$order" "$vid" >> "$FAILED"; fail=$((fail+1)); continue
  fi

  # 2. extract frames at 1/FPS_DIV fps
  rm -f "$FR"/*.png 2>/dev/null
  ffmpeg -hide_banner -loglevel error -i "$vfile" -vf "fps=1/${FPS_DIV}" "$FR/f_%05d.png" >/dev/null 2>&1

  # 3. OCR each frame IN PARALLEL -> "<seconds>\t<text...escaped>", then sort by time
  NPROC=$(sysctl -n hw.ncpu 2>/dev/null || echo 8)
  ls "$FR"/f_*.png 2>/dev/null | xargs -P "$NPROC" -I {} sh -c '
    img="$1"; bin="$2"; div="$3"
    idx=$(basename "$img" | sed -E "s/f_0*([0-9]+)\.png/\1/")
    secs=$(( (idx - 1) * div ))
    txt=$("$bin" "$img" 2>/dev/null | tr "\n" "\037")
    printf "%s\t%s\n" "$secs" "$txt"
  ' _ {} "$OCR_BIN" "$FPS_DIV" | sort -n > "$raw"

  # 4. dedupe + format -> final (re-runnable any time from the persisted raw)
  python3 "$BASE/dedupe-ocr.py" "$raw" "$title" "$vid" > "$final"

  # 5. clean up the big video + frames to save disk (raw is kept)
  rm -f "$vfile"
  rm -f "$FR"/*.png 2>/dev/null
  ok=$((ok+1))
  echo "    ok -> $(basename "$final")  ($(grep -c '^\[' "$final") slides)"
done 9< "$MANIFEST"

echo ""
echo "=== OCR DONE: ok=$ok skip=$skip fail=$fail total=$total ==="
[ "$fail" -gt 0 ] && echo "Failures -> $FAILED"
exit 0
