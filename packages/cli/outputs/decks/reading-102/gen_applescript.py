"""Generate build-deck.applescript from manifest.json.

Deck grammar: title full-bleed, then per verse: full-bleed image slide,
then split slide (same image as 750x903 panel, verse + ref beside it,
sides alternating). Stock Keynote, Basic Black, 1920x1080, Blank master.
"""
import json, math, os

DECK = "/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/reading-102"
IMG = os.path.join(DECK, "images")
m = json.load(open(os.path.join(DECK, "manifest.json")))

WHITE = "{65535, 65535, 65535}"
GRAY = "{39321, 39321, 39321}"

def esc(t):
    return t.replace("\\", "\\\\").replace('"', '\\"')

def verse_font_size(text):
    n = len(text)
    if n <= 180: return 48
    if n <= 300: return 40
    if n <= 430: return 34
    return 30

def text_block(slide_var, text, x, y, w, size, color, font):
    return f'''\t\t\ttell {slide_var}
\t\t\t\tset tx to make new text item with properties {{object text:"{esc(text)}"}}
\t\t\t\tset the font of the object text of tx to "{font}"
\t\t\t\tset the size of the object text of tx to {size}
\t\t\t\tset the color of the object text of tx to {color}
\t\t\t\tset the width of tx to {w}
\t\t\t\tset the position of tx to {{{x}, {y}}}
\t\t\tend tell
'''

lines = []
lines.append('tell application "Keynote"')
lines.append('\tactivate')
lines.append('\tset theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}')
lines.append('\ttell theDoc')
# title slide: reuse the default first slide
lines.append('\t\tset the base slide of slide 1 to master slide "Blank"')
lines.append('\t\ttell slide 1')
lines.append(f'\t\t\tmake new image with properties {{file:(POSIX file "{IMG}/title-full.png"), position:{{0, 0}}, width:1920, height:1080}}')
lines.append('\t\tend tell')
lines.append(text_block("slide 1", "Origin, History, and Destiny of Satan", 160, 850, 1600, 66, WHITE, "Helvetica Neue Light").rstrip())
lines.append(text_block("slide 1", "Bible Readings · 102", 160, 950, 1600, 30, GRAY, "Helvetica Neue").rstrip())

for s in m["slides"]:
    if s.get("type") == "diagram":
        lines.append(f'\t\t-- diagram: {s["id"]}')
        lines.append('\t\tset dg to make new slide with properties {base slide:master slide "Blank"}')
        lines.append('\t\ttell dg')
        lines.append(f'\t\t\tmake new image with properties {{file:(POSIX file "{IMG}/{s["id"]}.png"), position:{{0, 0}}, width:1920, height:1080}}')
        lines.append('\t\tend tell')
        continue
    sid, ref, text, side = s["id"], s["ref"], s["text"], s["side"]
    # full-bleed slide
    lines.append(f'\t\t-- {sid} ({ref})')
    lines.append('\t\tset fb to make new slide with properties {base slide:master slide "Blank"}')
    lines.append('\t\ttell fb')
    lines.append(f'\t\t\tmake new image with properties {{file:(POSIX file "{IMG}/{sid}-full.png"), position:{{0, 0}}, width:1920, height:1080}}')
    lines.append('\t\tend tell')
    # split slide
    if side == "right":
        img_x, txt_x = 1037, 131
    else:
        img_x, txt_x = 133, 984
    size = verse_font_size(text)
    # estimate wrapped height to vertically center the verse + ref pair
    chars_per_line = max(10, int(805 / (size * 0.52)))
    n_lines = max(1, math.ceil(len(text) / chars_per_line))
    block_h = int(n_lines * size * 1.25) + 90
    txt_y = max(90, min(540 - block_h // 2, 700))
    ref_y = min(txt_y + block_h, 960)
    lines.append('\t\tset sp to make new slide with properties {base slide:master slide "Blank"}')
    lines.append('\t\ttell sp')
    lines.append(f'\t\t\tmake new image with properties {{file:(POSIX file "{IMG}/{sid}-panel.png"), position:{{{img_x}, 75}}, width:750, height:903}}')
    lines.append('\t\tend tell')
    lines.append(text_block("sp", text, txt_x, txt_y, 805, size, WHITE, "Helvetica Neue Light").rstrip())
    lines.append(text_block("sp", ref, txt_x, ref_y, 805, 30, GRAY, "Helvetica Neue").rstrip())

lines.append(f'\t\tsave theDoc in POSIX file "{DECK}/Reading 102 - Origin History and Destiny of Satan.key"')
lines.append('\tend tell')
lines.append('end tell')

script = "\n".join(lines)
out = os.path.join(DECK, "build-deck.applescript")
with open(out, "w") as f:
    f.write(script)
n_verse = sum(1 for s in m["slides"] if s.get("type") != "diagram")
n_diag = len(m["slides"]) - n_verse
print(f"wrote {out}: {script.count(chr(10)) + 1} lines, {2 * n_verse + n_diag + 1} slides")
