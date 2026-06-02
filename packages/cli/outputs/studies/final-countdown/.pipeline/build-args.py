#!/usr/bin/env python3
"""Assemble the Workflow args array from studies-to-author.tsv + transcripts + ocr.

Writes workflow-args.json: [{order, vid, slug, seriesLabel, title, transcript, ocr}]
The Workflow is invoked with this JSON as its `args`.

Also derives a clean Study/Week label per study from the title.
"""
import os, re, json

BASE = os.path.dirname(os.path.abspath(__file__))
SERIES_LABEL = {
    "final-countdown": "The Final Countdown",
    "judgment-day": "Judgment Day Ten-Week Study",
}

def study_label(slug, title):
    m = re.search(r"Study\s+(\d+)", title)
    if m:
        return f"Study {m.group(1)}"
    m = re.search(r"Week\s+(\d+)", title)
    if m:
        return f"Week {m.group(1)}"
    m = re.search(r"Episode\s+(\d+)", title)
    if m:
        return f"Episode {m.group(1)}"
    return ""

def clean_title(title):
    # strip trailing "| The Final Countdown | Study N" style suffixes for readability
    t = re.split(r"\s*\|\s*", title)[0].strip()
    t = re.sub(r"\s*[-–]\s*The Final Countdown.*$", "", t).strip()
    return t

def main():
    out = []
    tsv = os.path.join(BASE, "studies-to-author.tsv")
    with open(tsv, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 5:
                continue
            order, vid, slug, w, title = parts[:5]
            tpath = os.path.join(BASE, "transcripts", f"{order}-{vid}.txt")
            opath = os.path.join(BASE, "ocr", f"{order}-{vid}.ocr.txt")
            if not os.path.exists(tpath):
                print(f"  WARN no transcript: {tpath}")
                continue
            transcript = open(tpath, encoding="utf-8").read().strip()
            ocr = open(opath, encoding="utf-8").read().strip() if os.path.exists(opath) else ""
            label = study_label(slug, title)
            ct = clean_title(title)
            disp = f"{ct} — {label}" if label else ct
            out.append({
                "order": order,
                "vid": vid,
                "slug": slug,
                "seriesLabel": SERIES_LABEL.get(slug, slug),
                "title": disp,
                "transcript": transcript,
                "ocr": ocr,
            })
    dest = os.path.join(BASE, "workflow-args.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    miss_ocr = sum(1 for s in out if not s["ocr"])
    print(f"Wrote {dest}: {len(out)} studies ({miss_ocr} without OCR)")

if __name__ == "__main__":
    main()
