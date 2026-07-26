#!/bin/bash
# gen_images.sh <start> <end>   — generate slides [start..end] (1-based, inclusive; 0 = title)
set -u
DECK=/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/reading-102
REF=/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/what-is-truth/images/day1-v2/d1-10-gen.png
STYLE="LANDSCAPE 3:2 horizontal devotional fine-art oil painting, classical painterly style in warm muted earth tones, loose expressive brushwork with visible canvas texture, dramatic natural chiaroscuro light, no hard digital edges. Subject: %s. NO text, NO lettering, NO numbers, NO words."

START=$1; END=$2
python3 - "$START" "$END" <<'EOF' | while IFS=$'\t' read -r id concept; do
import json, sys
m = json.load(open("/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/reading-102/manifest.json"))
start, end = int(sys.argv[1]), int(sys.argv[2])
rows = []
if start == 0:
    rows.append(("title", m["titleConcept"]))
    start = 1
for i, s in enumerate(m["slides"], 1):
    if start <= i <= end:
        rows.append((s["id"], s["concept"]))
for rid, c in rows:
    print(f"{rid}\t{c}")
EOF
  out="$DECK/images/$id.png"
  if [ -s "$out" ]; then echo "skip $id"; continue; fi
  prompt=$(printf "$STYLE" "$concept")
  for attempt in 1 2; do
    if okra image "$prompt" --ref "$REF" --size 1536x1024 -o "$out" >/dev/null 2>>"$DECK/images/gen-errors.log"; then
      echo "ok $id"; break
    else
      echo "retry $id (attempt $attempt)"; sleep 5
    fi
  done
  [ -s "$out" ] || echo "FAIL $id"
done
echo "batch $START-$END done"
