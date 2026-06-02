#!/usr/bin/env python3
"""Collapse per-frame OCR into distinct, low-noise on-screen slides.

Input: TSV of "<seconds>\t<text>" (lines joined by \x1f). One row per sampled frame.
Output: formatted .ocr.txt — one block per distinct slide, [mm:ss] timestamped.

Strategy (tuned for talking-head Bible-study videos with slide overlays):
  1. Per line: drop channel chrome, drop OCR-garbage (low dictionary-likeness).
  2. Per frame: keep only "meaningful" lines (scripture refs, real words).
  3. Dedup: merge a frame into the running slide when content overlaps enough OR
     one is a subset of the other (handles word-by-word slide builds + OCR jitter).
     Keep the richest (most complete) version of each slide.
  4. Drop slides with no real signal (no verse ref AND < 3 real words).
"""
import sys, re

US = "\x1f"

CHROME = {
    "donate", "final", "countdown", "subscribe", "like", "share", "comment",
    "amazing discoveries", "live", "judgment day", "bible study", "follow me",
    "www finalcountdown amazingdiscoveries org",
}

# scripture book names (for ref detection)
BOOKS = (
    r"gen|genesis|ex|exod|exodus|lev|num|deut|josh|judg|ruth|sam|kings|kgs|chron|ezra|neh|"
    r"job|ps|psa|psalm|psalms|prov|eccl|song|isa|isaiah|jer|lam|ezek|eze|dan|daniel|hos|joel|"
    r"amos|obad|jonah|mic|nah|hab|zeph|hag|zech|mal|matt|matthew|mark|luke|john|acts|rom|"
    r"romans|cor|gal|eph|phil|col|thess|tim|tit|phlm|heb|jam|jas|pet|jude|rev|revelation"
)
REF_RE = re.compile(r"\b(%s)\.?\s*\d+\s*[:\.]\s*\d+" % BOOKS, re.I)
REF_RE_LOOSE = re.compile(r"\b(%s)\.?\s+\d+\b" % BOOKS, re.I)

WORD_RE = re.compile(r"[A-Za-z]{2,}")

# a small set of very common English words to gauge "is this real text"
COMMON = set("the of and to in that for is be as with by not are this his he they "
             "shall will have was were from them their him her you we our god lord "
             "jesus christ word earth heaven day time come unto upon thou thee thy "
             "which when who what where all one no who book beast mark seal angel "
             "people church world death life truth law sabbath".split())

def is_garbage(line):
    """True if a line looks like OCR noise rather than real on-screen text."""
    s = line.strip()
    if not s:
        return True
    low = s.lower()
    # keep anything that contains a scripture reference
    if REF_RE.search(s) or REF_RE_LOOSE.search(s):
        return False
    words = WORD_RE.findall(s)
    if not words:
        # purely numbers/punct unless it's a year/number-of-prophecy (keep short numeric)
        return len(re.findall(r"\d", s)) < 3
    # ratio of words that are real-ish: in COMMON, or length>=4 with vowels
    def realish(w):
        wl = w.lower()
        if wl in COMMON:
            return True
        if len(w) >= 4 and re.search(r"[aeiou]", wl):
            return True
        return False
    good = sum(1 for w in words if realish(w))
    ratio = good / len(words)
    # garbage if mostly short consonant clusters / random caps
    return ratio < 0.4

def clean_frame(raw):
    out = []
    for ln in raw.split(US):
        s = ln.strip()
        if not s:
            continue
        low = re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()
        low = re.sub(r"\s+", " ", low)
        if low in CHROME:
            continue
        if len(low) <= 2:
            continue
        if is_garbage(s):
            continue
        out.append(s)
    # de-dup identical lines within the frame, preserve order
    seen = set(); res = []
    for l in out:
        k = re.sub(r"[^a-z0-9]+", "", l.lower())
        if k and k not in seen:
            seen.add(k); res.append(l)
    return res

def key_set(lines):
    return set(re.sub(r"[^a-z0-9]+", "", l.lower()) for l in lines if l.strip())

def jaccard(a, b):
    if not a and not b: return 1.0
    if not a or not b: return 0.0
    return len(a & b) / len(a | b)

def subset(a, b):
    """True if smaller set is mostly contained in the larger."""
    if not a or not b: return False
    small, big = (a, b) if len(a) <= len(b) else (b, a)
    return len(small & big) / len(small) >= 0.8

def has_ref(lines):
    text = " ".join(lines)
    return bool(REF_RE.search(text) or REF_RE_LOOSE.search(text))

def is_slide_like(lines):
    """A 'real' slide: has a scripture ref, OR substantial prose (likely a quote slide).
    Pure lower-third chyron noise (a few short fragments, no ref) is rejected."""
    text = " ".join(lines)
    if has_ref(lines):
        return True
    realwords = [w for w in WORD_RE.findall(text) if len(w) >= 3]
    # require a real sentence's worth of words for a no-ref slide (quote/heading slides)
    return len(realwords) >= 12

def mmss(secs):
    secs = int(secs)
    return f"{secs//60:02d}:{secs%60:02d}"

def main():
    path, title, vid = sys.argv[1], sys.argv[2], sys.argv[3]
    frames = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if "\t" not in line: continue
            secs, txt = line.split("\t", 1)
            try: secs = int(secs)
            except ValueError: continue
            lines = clean_frame(txt)
            if lines and is_slide_like(lines):
                frames.append((secs, lines))

    slides = []
    for secs, lines in frames:
        keys = key_set(lines)
        if slides:
            prev = slides[-1]
            if jaccard(prev["keys"], keys) >= 0.35 or subset(prev["keys"], keys):
                # same evolving slide -> keep the more complete text version
                if len(keys) > len(prev["keys"]):
                    prev["lines"] = lines; prev["keys"] = keys
                prev["end"] = secs
                continue
        slides.append({"start": secs, "end": secs, "lines": lines, "keys": keys})

    print(f"# ON-SCREEN TEXT (OCR)  |  {title}")
    print(f"# video: https://www.youtube.com/watch?v={vid}")
    print(f"# {len(slides)} distinct slides\n")
    for sl in slides:
        print(f"[{mmss(sl['start'])}]")
        for l in sl["lines"]:
            print(l)
        print()

if __name__ == "__main__":
    main()
