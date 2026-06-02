#!/usr/bin/env bash
# Final cleanup: leave a clean top level (the .md + transcripts/ + ocr/),
# tuck the reproducible pipeline (scripts, raw OCR, OCR binary) into .pipeline/,
# and delete pure scratch (temp video/frame dirs, logs, empty dirs).
# Run ONLY after final-countdown-studies.md has been produced.
set -uo pipefail
cd "$(dirname "$0")"
BASE="$(pwd)"

FINAL="$BASE/final-countdown-studies.md"
if [ ! -s "$FINAL" ]; then
  echo "REFUSING to clean: $FINAL does not exist yet. Run the join first." >&2
  exit 1
fi

PIPE="$BASE/.pipeline"
mkdir -p "$PIPE"

# 1. move reproducible build assets into .pipeline/
for item in \
  author-workflow.js build-args.py dedupe-ocr.py fetch-transcripts.sh \
  join-studies.py ocr-videos.sh cleanup.sh \
  manifest.tsv studies-to-author.tsv workflow-args.json \
  .bin raw authored ; do
  if [ -e "$BASE/$item" ]; then
    rm -rf "$PIPE/$item" 2>/dev/null
    mv "$BASE/$item" "$PIPE/" 2>/dev/null && echo "  -> .pipeline/$item"
  fi
done

# 2. delete pure scratch / regenerable cruft
for junk in \
  frames-tmp video-tmp studies \
  manifest.tsv.bak failed.txt ocr-failed.txt ocr-run.log ; do
  if [ -e "$BASE/$junk" ]; then
    rm -rf "$BASE/$junk" && echo "  rm $junk"
  fi
done

echo ""
echo "=== final top-level contents ==="
ls -1 "$BASE"
echo ""
echo "transcripts: $(ls "$BASE/transcripts" 2>/dev/null | wc -l | tr -d ' ')   ocr: $(ls "$BASE/ocr" 2>/dev/null | wc -l | tr -d ' ')"
