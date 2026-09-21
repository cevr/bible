# Decks — Verse-Driven Keynote Decks

Build a Keynote deck from a teaching document (`references/teachings.md`
output): oil-painting imagery + the KJV verses, nothing else. The deck is the
projection surface while Cristian teaches from the whiteboard and the
teaching doc — so slides carry **images and Scripture only**; no outline
text, no bullet points, no SOP/pioneer quotes on screen.

## When to use

The user asks for a deck/slides for a teaching document (reading, study,
message). Exemplar: `outputs/decks/reading-102/` (built from Reading 102,
"Origin, History, and Destiny of Satan") in the style of the _What is Truth_
series decks (`outputs/decks/what-is-truth/`).

## Deck grammar

- **Slide 1** — full-bleed title image + document title (66pt) + series line
  (30pt gray), text over the darkest region of the painting.
- **Per verse, two slides**:
  1. **Full-bleed** — the painting alone, edge to edge (the mood beat).
  2. **Split** — the _same_ painting as a 750×903 side panel + the verse
     (white) + reference line (gray) beside it. The panel side **alternates**
     verse to verse (right, left, right, …) for rhythm.
- Verse selection: **anchor passage per section + 1-2 load-bearing
  supports** — curate from the teaching doc, present the list, let the user
  veto before generating anything. ~35-40 verses ≈ 75-85 slides.

## Workflow

### 1. Manifest first

Pull every verse via `bible verse "<ref>" --json` (never memory). Clean the
KJV text for slides: strip `[...]` italics brackets (keep contents) and `¶`
pilcrows, collapse whitespace. Multi-passage slides (e.g. Mal 4:1, 3) join
with `" ... "`.

Write `outputs/decks/<slug>/manifest.json`:

```json
{
  "title": "...",
  "subtitle": "Bible Readings — Chapter 102",
  "titleConcept": "<image prompt subject for the title painting>",
  "canvas": { "w": 1920, "h": 1080 },
  "layouts": {
    "A_imageRight": { "text": [131, 408, 805, 264], "image": [1037, 75, 750, 903] },
    "B_imageLeft": { "image": [133, 75, 750, 903], "text": [984, 408, 805, 264] }
  },
  "slides": [
    {
      "id": "s01-2pet-2-4",
      "ref": "2 Peter 2:4",
      "section": 1,
      "sectionTitle": "...",
      "text": "<cleaned KJV>",
      "concept": "<prompt subject>",
      "side": "right"
    }
  ]
}
```

`id` = `sNN-book-ch-v` (zero-padded, sorts in deck order). `side` = which
side the **image panel** sits on; alternate strictly.

### 2. Generate the paintings (`okra image`)

One landscape painting per verse + one for the title. Prompt template
(the series style — keep it verbatim, swap only the Subject):

```
LANDSCAPE 3:2 horizontal devotional fine-art oil painting, classical
painterly style in warm muted earth tones, loose expressive brushwork with
visible canvas texture, dramatic natural chiaroscuro light, no hard digital
edges. Subject: <concept>. NO text, NO lettering, NO numbers, NO words.
```

```bash
okra image "<prompt>" --ref <existing series painting> --size 1536x1024 \
  -o outputs/decks/<slug>/images/<id>.png
```

- `--ref` an existing deck painting (e.g. a `what-is-truth/images/day1-v2`
  png) so the palette matches across decks.
- Concepts: reverent, figurative, scene-per-verse. Always end with the
  NO-text clause.
- **Character continuity** — recurring persons keep the series character
  canon; pass the canonical painting as `--ref` AND describe the features
  in the prompt ("matching the reference character exactly: ..."):
  - **Lucifer** (unfallen/angel-of-light): youthful beardless face, golden
    curly shoulder-length hair, jeweled gold armor, crimson mantle, great
    golden wings — ref `what-is-truth/images/day3/01-covering-cherub.png`.
  - **Jesus**: long dark brown hair, short beard, white robe with
    gold-trimmed sleeves and golden sash — ref
    `what-is-truth/images/day3/n20-father-and-son.png`.
  - **Satan fallen**: dark hooded/cloaked figure, face unseen.
- ~1-2 min per image. Run **3-4 background batches** in parallel with a
  skip-if-exists guard and one retry, logging failures — then rerun the
  batch script to sweep stragglers.

### 3. Crop two copies per painting (sips)

The generated ~1536×1024 painting becomes **two center crops**:

- `<id>-full.png` — 16:9 (1536×864) for the full-bleed slide.
- `<id>-panel.png` — 750:903 ratio (≈850×1024) for the split panel.

`sips -c <height> <width> <src> --out <dst>` center-crops. Compute crop
dims from actual pixel size (codex output size varies slightly).

### 3b. Diagram slides (line chronologies)

Timelines/chronologies follow the _Just Another Book_ day-2 grammar: black
canvas, one big bold title, a single horizontal line, span labels above
("49 Years" / "1,000 Years"), bold event labels + refs below the ticks.
Render them as a full-slide 1920×1080 PNG with Pillow
(`uv run --with pillow python3 render_chrono.py` — see
`outputs/decks/reading-102/render_chrono.py`; Helvetica Neue from the
system .ttc, all white on black). In the manifest they are
`{"type": "diagram", "id": "..."}` entries — one slide, no full-bleed
pair, no crops.

### 4. Build the .key (stock Keynote AppleScript)

Generate `build-deck.applescript` from the manifest (script it — don't
hand-write 77 slides). Proven primitives:

```applescript
tell application "Keynote"
  set theDoc to make new document with properties ¬
    {document theme:theme "Basic Black", width:1920, height:1080}
  tell theDoc
    -- slide 1 arrives with the doc: reuse it for the title
    set the base slide of slide 1 to master slide "Blank"
    tell slide 1
      make new image with properties {file:(POSIX file "/abs/title-full.png"), ¬
        position:{0, 0}, width:1920, height:1080}
      set tx to make new text item with properties {object text:"..."}
      set the font of the object text of tx to "Helvetica Neue Light"
      set the size of the object text of tx to 66
      set the color of the object text of tx to {65535, 65535, 65535}
      set the width of tx to 1600
      set the position of tx to {160, 850}
    end tell
    set fb to make new slide with properties {base slide:master slide "Blank"}
    -- full-bleed: image at {0,0} 1920×1080 inside `tell fb`
    -- split: panel image at {1037,75} (or {133,75}) 750×903 + two text items
    save theDoc in POSIX file "/abs/<Deck Name>.key"
  end tell
end tell
```

Text styling that works: verse in "Helvetica Neue Light" white, size by
length (≤180 chars → 48pt, ≤300 → 40pt, ≤430 → 34pt, else 30pt), width 805,
x=131 (image right) / x=984 (image left), y vertically centered by estimated
wrapped height; reference line "Helvetica Neue" 30pt gray
(`{39321, 39321, 39321}`) below the verse.

### 5. Verify visually — always

```applescript
export theDoc to POSIX file "/tmp/deck-export" as slide images ¬
  with properties {image format:JPEG}
```

Read a sample of the JPEGs (title, first/longest/shortest verse, one of
each side). Check: text off the painting, verse not clipped, ref visible,
alternation correct.

## Keynote AppleScript gotchas (hard-won)

- `make new image`/`make new text item` **must** be inside `tell <slide>` —
  else error -10024.
- Image paths: `POSIX file "<abs>"` — never a plain string.
- `make new slide` inherits the previous slide's master — always pass
  `{base slide:master slide "Blank"}` explicitly.
- **Big Fact master is unusable** via AppleScript; Quote master's visible
  pair is `text item 2` (quote) + `text item 1` (attribution). For this
  deck grammar you only need **Blank**.
- Unfilled placeholders don't render in playback/export — harmless.
- Compile-check with `osacompile -o /dev/null <script>` before running.
- If editing an **existing** deck later: anchor-check slide content before
  touching it (Cristian reorders slides), and note the What-is-Truth decks
  live in the "Keynote Creator Studio" app, not stock Keynote.

## Output location

```
outputs/decks/<slug>/
├── .gitignore               # *.key + images/*-full.png + images/*-panel.png
├── <Deck Name>.key          # the deck (NOT committed — regenerable)
├── manifest.json            # verses + concepts + layout — the source of truth
├── build-deck.applescript   # regenerable from manifest
└── images/                  # <id>.png sources (committed) + crops (not)
```

`<slug>` matches the teaching doc's series prefix (`reading-102`). **Commit
manifest, build script, and the source paintings** (the irreplaceable okra
outputs); the crops and the `.key` are derived — regenerate with the crop
script + `osascript build-deck.applescript`.

## Anti-patterns

- **Don't put outline/SOP text on slides** — images + Scripture only; the
  teaching doc and whiteboard carry everything else.
- **Don't paraphrase or retype verses** — manifest text comes from
  `bible verse --json`, cleaned mechanically.
- **Don't generate images without the style template + `--ref`** — decks
  must stay visually one family.
- **Don't hand-write the AppleScript** — generate from the manifest so the
  deck is reproducible.
- **Don't skip the JPEG-export visual check** — text/image collisions and
  clipped verses only show up rendered.
