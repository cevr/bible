"""Render the last-day-events line chronology (day-2 'Just Another Book' style):
black canvas, big title, one horizontal line, span labels above, event labels below.

Run: uv run --with pillow python3 render_chrono.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images", "chrono-last-days.png")
W, H = 1920, 1080
WHITE = (255, 255, 255)
LINE = (230, 230, 230)

TTC = "/System/Library/Fonts/HelveticaNeue.ttc"

def load(name, size):
    for idx in range(24):
        try:
            f = ImageFont.truetype(TTC, size, index=idx)
        except OSError:
            break
        if f.getname()[1].lower() == name.lower():
            return f
    raise SystemExit(f"font face not found: {name}")

title_f = load("Bold", 110)
span_f = load("Regular", 40)
event_f = load("Bold", 38)
sub_f = load("Regular", 29)

img = Image.new("RGB", (W, H), (0, 0, 0))
d = ImageDraw.Draw(img)

def center(text, font, cx, y, fill=WHITE, lh=1.25):
    for i, line in enumerate(text.split("\n")):
        w = d.textlength(line, font=font)
        d.text((cx - w / 2, y + i * font.size * lh), line, font=font, fill=fill)

# title
center("The Last Days", title_f, W // 2, 130)

BASE = 620          # the line
SPAN_TICK = 60      # span boundary ticks go up
EVENT_TICK = 80     # event ticks go down
TICKS = [240, 610, 980, 1390, 1720]

d.line([(TICKS[0], BASE), (TICKS[-1], BASE)], fill=LINE, width=3)

# span boundaries: every tick rises; events drop
for x in TICKS:
    d.line([(x, BASE - SPAN_TICK), (x, BASE + EVENT_TICK)], fill=LINE, width=3)

SPANS = [  # (from tick idx, to tick idx, label)
    (0, 2, "The Final Deception"),
    (2, 3, "1,000 Years"),
]
for a, b, label in SPANS:
    center(label, span_f, (TICKS[a] + TICKS[b]) // 2, BASE - SPAN_TICK - 62)

EVENTS = [  # (tick idx, bold line, sub lines)
    (0, "War on\nthe remnant", "Rev 12:17"),
    (1, "Angel of light —\npersonates Christ", "2 Cor 11:14"),
    (2, "Second Coming", "Matt 24:27"),
    (3, "Loosed —\nthe last siege", "Rev 20:7-9"),
    (4, "Ashes —\nutter end", "Eze 28:18 · Nah 1:9"),
]
for idx, name, sub in EVENTS:
    y = BASE + EVENT_TICK + 28
    center(name, event_f, TICKS[idx], y)
    center(sub, sub_f, TICKS[idx], y + name.count("\n") * event_f.size * 1.25 + 52)

img.save(OUT)
print(f"wrote {OUT}")
