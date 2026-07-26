import json, re, os

SCRATCH = os.path.dirname(os.path.abspath(__file__))
OUT = "/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/reading-102"

# (id, display ref, fetch refs, section#, section title, image concept)
SLIDES = [
 ("s01-2pet-2-4", "2 Peter 2:4", ["2-Peter-2-4"], 1, "Sin Before Eden",
  "distant shadowed angelic figures descending into a deep dark abyss beneath rolling storm clouds, faint shadow-chains, somber blue-grey depths with one shaft of cold light"),
 ("s02-eze-28-14", "Ezekiel 28:14", ["Ezekiel-28-14"], 2, "The Covering Cherub",
  "two golden winged cherubim with wings outstretched over a radiant golden ark of the covenant, glory light rising between the wings in a dark holy chamber"),
 ("s03-eze-28-13", "Ezekiel 28:13", ["Ezekiel-28-13"], 2, "The Covering Cherub",
  "an arrangement of glowing precious gemstones, ruby topaz emerald sapphire onyx, set in worked gold, catching warm candlelight against dark velvet"),
 ("s04-eze-28-15", "Ezekiel 28:15", ["Ezekiel-28-15"], 3, "Iniquity Found",
  "a radiant angelic figure standing in perfect light on a holy mountain summit, a faint thin shadow just beginning to pool at his feet"),
 ("s05-isa-14-12", "Isaiah 14:12", ["Isaiah-14-12"], 3, "Iniquity Found",
  "a brilliant morning star falling from a dawn sky, long trail of fading golden light, dark mountain ridges below"),
 ("s06-isa-14-13-14", "Isaiah 14:13-14", ["Isaiah-14-13-14"], 3, "Iniquity Found",
  "a grand staircase of storm clouds ascending toward a distant high throne of light above the stars, cold ambitious blues against warm throne gold"),
 ("s07-ps-2-6-7", "Psalm 2:6-7", ["Psalm-2-6-7"], 4, "The Convocation",
  "a vast assembly of angels in luminous ranks gathered before a blazing throne on a holy hill, a pillar of glory light declaring over the host"),
 ("s08-heb-1-5-6", "Hebrews 1:5-6", ["Hebrews-1-5-6"], 4, "The Convocation",
  "countless angels bowing low in concentric arcs of worship within a vast temple of golden light"),
 ("s09-rev-12-7-8", "Revelation 12:7-8", ["Revelation-12-7-8"], 5, "War in Heaven",
  "war in heaven, ranks of bright angels of light driving back dark winged forms through towering storm clouds, swords of light"),
 ("s10-luke-10-18", "Luke 10:18", ["Luke-10-18"], 5, "War in Heaven",
  "a single great bolt of lightning falling from the height of heaven down to a dark curved horizon, night sky, painterly"),
 ("s11-jude-6", "Jude 6", ["Jude-1-6"], 6, "Why Not Destroy Him Then?",
  "heavy ancient iron chains hanging in deep darkness, one faint cold shaft of light from far above, waiting stillness"),
 ("s12-rev-12-9", "Revelation 12:9", ["Revelation-12-9"], 7, "His Names, His Record",
  "a great red dragon cast down out of the heavens, falling toward a small distant blue earth, trailing darkness"),
 ("s13-matt-25-41", "Matthew 25:41", ["Matthew-25-41"], 7, "His Names, His Record",
  "a solitary great fire burning on a vast empty dark plain under a starless sky, prepared and unoccupied"),
 ("s14-gen-3-4-5", "Genesis 3:4-5", ["Genesis-3-4-5"], 8, "Eden: The First Lie",
  "a serpent coiled among the branches of a fruit-laden tree in a lush garden, golden dappled light, beauty with menace"),
 ("s15-gen-3-15", "Genesis 3:15", ["Genesis-3-15"], 8, "Eden: The First Lie",
  "a serpent's head beneath a descending human heel lit by a shaft of promise light in a garden clearing at dusk"),
 ("s16-john-8-44", "John 8:44", ["John-8-44"], 8, "Eden: The First Lie",
  "a dark hooded figure casting an impossibly long shadow across a beautiful garden at twilight"),
 ("s17-zech-3-1-2", "Zechariah 3:1-2", ["Zechariah-3-1-2"], 9, "The Accuser at Court",
  "a burning branch plucked out of a fire by a hand of light, sparks rising, deep darkness around the flame"),
 ("s18-rom-8-33-34", "Romans 8:33-34", ["Romans-8-33-34"], 9, "The Accuser at Court",
  "a risen figure of light with arms raised in intercession before a radiant throne, warm advocate light filling a high hall"),
 ("s19-matt-4-4", "Matthew 4:4", ["Matthew-4-4"], 10, "The Wilderness",
  "an open ancient book glowing with steady light in a barren stony wilderness at dusk, smooth stones in the foreground"),
 ("s20-heb-4-15", "Hebrews 4:15", ["Hebrews-4-15"], 10, "The Wilderness",
  "a high priest figure in white laying a hand on a kneeling weary traveler's shoulder, warm compassionate light in a desert"),
 ("s21-john-12-31", "John 12:31", ["John-12-31"], 11, "The Cross",
  "the hill of Calvary with three crosses against a darkened storm sky, one great shaft of light breaking from the center cross"),
 ("s22-heb-2-14", "Hebrews 2:14", ["Hebrews-2-14"], 11, "The Cross",
  "a shattered dark iron crown and broken chains lying at the foot of a rough wooden cross in early dawn light"),
 ("s23-rev-12-17", "Revelation 12:17", ["Revelation-12-17"], 12, "War on the Remnant",
  "a small faithful band of pilgrims on a mountain ridge holding two banners of light, vast dark storm clouds massing against them"),
 ("s24-rev-12-11", "Revelation 12:11", ["Revelation-12-11"], 12, "War on the Remnant",
  "a white lamb glowing on a height at dawn, a great multitude below lifting palm branches toward the light"),
 ("s25-2cor-11-14", "2 Corinthians 11:14", ["2-Corinthians-11-14"], 13, "Angel of Light",
  "a dazzling luminous angelic figure whose brilliant light casts a wrong deep shadow behind it, subtle unease in the glow"),
 ("s26-matt-24-24", "Matthew 24:24", ["Matthew-24-24"], 13, "Angel of Light",
  "a night crowd drawn toward a great deceptive glow on the horizon while a few figures turn instead to a small true lamplit open book"),
 ("s27-isa-8-20", "Isaiah 8:20", ["Isaiah-8-20"], 14, "The Crowning Act",
  "an open Bible radiating calm steady light on a stone table inside, a wild storm raging outside a window"),
 ("s28-matt-24-27", "Matthew 24:27", ["Matthew-24-27"], 14, "The Crowning Act",
  "brilliant lightning spanning the entire sky from east to west over a wide landscape, every cloud lit with glory, every field visible"),
 ("s29-1pet-5-8-9", "1 Peter 5:8-9", ["1-Peter-5-8-9"], 14, "The Crowning Act",
  "a lion prowling in darkness just beyond a campfire's circle of light, a watchful shepherd standing guard with a staff"),
 ("s30-rev-20-1-3", "Revelation 20:1-3", ["Revelation-20-1-3"], 15, "Bound in the Pit",
  "a mighty angel descending from heaven holding a great chain and a key, above a dark broken desolate earth"),
 ("s31-lev-16-21-22", "Leviticus 16:21-22", ["Leviticus-16-21-22"], 15, "Bound in the Pit",
  "a lone goat led away by a solitary figure into a vast uninhabited wilderness at dusk, long shadows, empty land to the horizon"),
 ("s32-rev-20-7-8", "Revelation 20:7-8", ["Revelation-20-7-8"], 16, "Loosed: The Last Campaign",
  "an innumerable dark host like the sand of the sea gathering across a broken plain toward a distant shining city descended from heaven"),
 ("s33-eze-28-18-19", "Ezekiel 28:18-19", ["Ezekiel-28-18-19"], 17, "Ashes: An Utter End",
  "grey ashes scattered on scorched earth with one last ember dying, clean dawn light rising beyond the burned ground"),
 ("s34-mal-4-1-3", "Malachi 4:1, 3", ["Malachi-4-1", "Malachi-4-3"], 17, "Ashes: An Utter End",
  "a burned field of stubble at sunrise, ashes underfoot, the sun rising with warm healing rays over a clean horizon"),
 ("s35-nah-1-9", "Nahum 1:9", ["Nahum-1-9"], 18, "A Clean Universe",
  "a calm brilliant field of stars over a peaceful new earth at night, still waters reflecting the heavens, no storm anywhere"),
 ("s36-rev-5-13", "Revelation 5:13", ["Revelation-5-13"], 18, "A Clean Universe",
  "vast concentric rings of angels and redeemed multitudes around one radiant central throne, the whole canvas filled with warm light"),
 ("s37-rom-16-20", "Romans 16:20", ["Romans-16-20"], 19, "Appeal",
  "a serpent crushed beneath a bare foot in dawn-lit grass, wide peaceful morning landscape beyond"),
 ("s38-james-4-7-8", "James 4:7-8", ["James-4-7-8"], 19, "Appeal",
  "a man kneeling in open-handed surrender in warm morning light on a hilltop, darkness retreating off the edge of the canvas"),
]

TITLE_CONCEPT = ("a golden ark of the covenant with one covering cherub of light above it, "
                 "and at the far edge of the canvas a drift of grey ashes on dark ground, "
                 "the whole arc from glory to ashes in one composition")

def clean(t):
    t = t.replace("¶", " ")
    t = re.sub(r"\[([^\]]*)\]", r"\1", t)
    return re.sub(r"\s+", " ", t).strip()

slides = []
for i, (sid, ref, files, sec, sectitle, concept) in enumerate(SLIDES):
    parts = []
    for f in files:
        with open(os.path.join(SCRATCH, f"verse-{f}.json")) as fh:
            data = json.load(fh)
        assert data["verses"], f"no verses for {f}"
        parts.append(" ".join(clean(v["text"]) for v in data["verses"]))
    text = " ... ".join(parts) if len(parts) > 1 else parts[0]
    slides.append({
        "id": sid, "ref": ref, "section": sec, "sectionTitle": sectitle,
        "text": text, "concept": concept,
        "side": "right" if i % 2 == 0 else "left",  # side the IMAGE panel sits on
    })

manifest = {
    "title": "Origin, History, and Destiny of Satan",
    "subtitle": "Bible Readings — Chapter 102",
    "titleConcept": TITLE_CONCEPT,
    "canvas": {"w": 1920, "h": 1080},
    "layouts": {
        "A_imageRight": {"text": [131, 408, 805, 264], "image": [1037, 75, 750, 903]},
        "B_imageLeft":  {"image": [133, 75, 750, 903], "text": [984, 408, 805, 264]},
    },
    "slides": slides,
}
with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
print(f"manifest: {len(slides)} verse slides")
for s in slides[:3]:
    print(s["id"], "|", s["ref"], "|", s["side"], "|", s["text"][:60])
