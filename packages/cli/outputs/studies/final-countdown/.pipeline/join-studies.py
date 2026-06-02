#!/usr/bin/env python3
"""Join authored per-study markdown files into one Bible-Handbook-format book.

Reads authored/<order>-<vid>.md (written by the Workflow) and studies-to-author.tsv
for ordering + series grouping, then emits final-countdown-studies.md:

  - Title page + intro (Haskell "Bible Handbook" homage)
  - Abbreviations key for EGW sources
  - Table of contents
  - Series 1: The Final Countdown (Studies 1-25)
  - Series 2: Judgment Day (Weeks 1-14)

Usage: python3 join-studies.py [authored_dir] [out_file]
"""
import sys, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
AUTHORED = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, "authored")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(BASE, "final-countdown-studies.md")

SERIES = {
    "final-countdown": "The Final Countdown",
    "judgment-day": "Judgment Day — Ten-Week Bible Study",
}

ABBREVIATIONS = """\
**Abbreviations for E. G. White references used in these studies**

- **GC** — The Great Controversy
- **DA** — The Desire of Ages
- **PP** — Patriarchs and Prophets
- **PK** — Prophets and Kings
- **AA** — The Acts of the Apostles
- **EW** — Early Writings
- **CL** — Country Living
- **T., v. _, p. _** — Testimonies for the Church (volume, page)
- **MH** — The Ministry of Healing
- **COL** — Christ's Object Lessons
- **CCh / 1888 / Mar** — other compilations as cited on screen
"""

INTRO = """\
# The Final Countdown — A Bible Handbook

*A topical compilation of Bible studies on the last-day events, in the style of
Stephen N. Haskell's "Bible Handbook": suggestive texts grouped under titled
separators, each with a short explanation.*

These studies were compiled from the **Amazing Discoveries** video series
"The Final Countdown" and the "Judgment Day" ten-week Bible study. Each scripture
reference and Ellen G. White citation is drawn from what was taught and shown on
screen in the studies. They are not exhaustive; they present the line of texts
each study walked through, so the reader can take Bible in hand and follow.

> "The Bible Handbook is not an exhaustive study; but contains suggestive texts
> on important lines of thought." — S. N. Haskell

---
"""

def load():
    studies = []
    tsv = os.path.join(BASE, "studies-to-author.tsv")
    with open(tsv, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 5:
                continue
            order, vid, slug, w, title = parts[0], parts[1], parts[2], parts[3], parts[4]
            md_path = os.path.join(AUTHORED, f"{order}-{vid}.md")
            if not os.path.exists(md_path):
                print(f"  WARN missing authored file: {md_path}", file=sys.stderr)
                continue
            md = open(md_path, encoding="utf-8").read().strip()
            studies.append(dict(order=order, vid=vid, slug=slug, title=title, md=md))
    return studies

def first_h2(md, fallback):
    for line in md.splitlines():
        m = re.match(r"^##\s+(.*)", line)
        if m:
            return m.group(1).strip()
    return fallback

def main():
    studies = load()
    by_series = {}
    for s in studies:
        by_series.setdefault(s["slug"], []).append(s)

    # build TOC
    toc_lines = ["## Contents\n"]
    for slug, label in SERIES.items():
        if slug not in by_series:
            continue
        toc_lines.append(f"\n### {label}\n")
        for s in by_series[slug]:
            h = first_h2(s["md"], s["title"])
            anchor = re.sub(r"[^a-z0-9]+", "-", h.lower()).strip("-")
            toc_lines.append(f"- [{h}](#{anchor})")
    toc = "\n".join(toc_lines)

    parts = [INTRO, "", ABBREVIATIONS, "\n---\n", toc, "\n---\n"]

    for slug, label in SERIES.items():
        if slug not in by_series:
            continue
        parts.append(f"\n# {label}\n")
        for s in by_series[slug]:
            parts.append(s["md"].strip())
            parts.append("\n---\n")

    out = "\n".join(parts).rstrip() + "\n"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"Wrote {OUT}  ({len(studies)} studies, {len(out.split())} words)")

if __name__ == "__main__":
    main()
