"""Crop each generated painting into a 16:9 full-bleed copy and a 750:903 panel copy."""
import json, os, subprocess, sys

DECK = "/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/reading-102"
IMG = os.path.join(DECK, "images")

def dims(path):
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
                         capture_output=True, text=True).stdout
    w = int(out.split("pixelWidth:")[1].split()[0])
    h = int(out.split("pixelHeight:")[1].split()[0])
    return w, h

def crop(src, dst, ratio):  # ratio = w/h of target
    w, h = dims(src)
    if w / h > ratio:
        cw, ch = int(h * ratio), h
    else:
        cw, ch = w, int(w / ratio)
    subprocess.run(["sips", "-c", str(ch), str(cw), src, "--out", dst],
                   capture_output=True, check=True)

m = json.load(open(os.path.join(DECK, "manifest.json")))
ids = ["title"] + [s["id"] for s in m["slides"] if s.get("type") != "diagram"]
done, missing = 0, []
for sid in ids:
    src = os.path.join(IMG, f"{sid}.png")
    if not os.path.exists(src) or os.path.getsize(src) == 0:
        missing.append(sid)
        continue
    full = os.path.join(IMG, f"{sid}-full.png")
    panel = os.path.join(IMG, f"{sid}-panel.png")
    if not os.path.exists(full):
        crop(src, full, 16 / 9)
    if sid != "title" and not os.path.exists(panel):
        crop(src, panel, 750 / 903)
    done += 1
print(f"cropped {done}/{len(ids)}; missing: {missing if missing else 'none'}")
