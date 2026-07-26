import json, re, os

OUT = os.path.dirname(os.path.abspath(__file__))
SCRATCH = os.path.join(OUT, "gather")

# (id, display ref, fetch refs, section#, section title, image concept)
SLIDES = [
 ("s01-2pet-2-4", "2 Peter 2:4", ["2-Peter-2-4"], 1, "Sin Before Eden",
  "distant shadowed angelic figures descending into a deep dark abyss beneath rolling storm clouds, faint shadow-chains, somber blue-grey depths with one shaft of cold light"),
 ("s02-eze-28-14", "Ezekiel 28:14", ["Ezekiel-28-14"], 2, "The Covering Cherub",
  "two golden winged cherubim with wings outstretched over a radiant golden ark of the covenant, glory light rising between the wings in a dark holy chamber"),
 ("s03-eze-28-13", "Ezekiel 28:13", ["Ezekiel-28-13"], 2, "The Covering Cherub",
  "an arrangement of glowing precious gemstones, ruby topaz emerald sapphire onyx, set in worked gold, catching warm candlelight against dark velvet"),
 ("s04-eze-28-15", "Ezekiel 28:15", ["Ezekiel-28-15"], 3, "Iniquity Found",
  "Lucifer the covering cherub before his fall: a youthful beardless angel with golden curly shoulder-length hair, ornate gold armor set with colored jewels, a crimson mantle, great golden wings, standing radiant on the holy mountain of God, a faint thin shadow just beginning to pool at his feet"),
 ("s05-isa-14-12", "Isaiah 14:12", ["Isaiah-14-12"], 3, "Iniquity Found",
  "a brilliant morning star falling from a dawn sky, long trail of fading golden light, dark mountain ridges below"),
 ("s06-isa-14-13-14", "Isaiah 14:13-14", ["Isaiah-14-13-14"], 3, "Iniquity Found",
  "a grand staircase of storm clouds ascending toward a distant high throne of light above the stars, cold ambitious blues against warm throne gold"),
 ("s07-ps-2-6-7", "Psalm 2:6-7", ["Psalm-2-6-7"], 4, "The Convocation",
  "a vast assembly of angels in luminous ranks gathered before a blazing throne on a holy hill, a pillar of glory light declaring over the host"),
 ("s08-heb-1-5-6", "Hebrews 1:5-6", ["Hebrews-1-5-6"], 4, "The Convocation",
  "countless angels bowing low in concentric arcs of worship within a vast temple of golden light"),
 ("s09-rev-12-7-8", "Revelation 12:7-8", ["Revelation-12-7-8"], 5, "War in Heaven",
  "war in heaven: Michael leading the host — Jesus with long dark brown hair and a short beard, in radiant white and gold, raising a sword of light at the front of ranks of bright angels driving back dark winged forms through towering storm clouds"),
 ("s11-jude-6", "Jude 6", ["Jude-1-6"], 6, "Why Not Destroy Him Then?",
  "heavy ancient iron chains hanging in deep darkness, one faint cold shaft of light from far above, waiting stillness"),
 ("s13-matt-25-41", "Matthew 25:41", ["Matthew-25-41"], 7, "His Names, His Record",
  "a solitary great fire burning on a vast empty dark plain under a starless sky, prepared and unoccupied"),
 ("s13b-gen-1-26-27", "Genesis 1:26-27", ["Genesis-1-26-27"], 8, "Created: The Third Party",
  "the creation of Adam: a noble man standing newly formed in a radiant garden at dawn, his whole body enveloped in a soft luminous robe of white-gold light that clothes him like a garment, a hand of divine light above him, animals and a wide new earth spread before him awaiting his dominion"),
 ("s13c-eph-3-9-10", "Ephesians 3:9-10", ["Ephesians-3-9-10"], 8, "Created: The Third Party",
  "a small luminous blue-green world suspended in deep space, vast concentric galleries of distant watching angelic hosts and far shining worlds encircling it in the darkness"),
 ("s13d-gen-2-16-17", "Genesis 2:16-17", ["Genesis-2-16-17"], 9, "Eden: The First Lie",
  "a single majestic fruit-laden tree standing alone in a radiant golden garden clearing, warm shafts of dawn light around it but its own shade deep and solemn, rich fruit glowing amber in the branches, inviting and forbidden at once"),
 ("s13e-gen-3-1", "Genesis 3:1", ["Genesis-3-1"], 9, "Eden: The First Lie",
  "the winged burnished-gold serpent-dragon leaning down from the branches of the fruit-laden tree toward a woman standing beneath it, her back to the viewer, its golden head bent close in a whispered question, the garden light dimming at the edges"),
 ("s14-gen-3-4-5", "Genesis 3:4-5", ["Genesis-3-4-5"], 9, "Eden: The First Lie",
  "a magnificent winged serpent-dragon with burnished-gold scales and dazzling brightness resting among the branches of the fruit-laden forbidden tree, wings half spread, lush garden, golden dappled light, beauty with menace"),
 ("s15-gen-3-15", "Genesis 3:15", ["Genesis-3-15"], 9, "Eden: The First Lie",
  "a serpent's head beneath a descending human heel lit by a shaft of promise light in a garden clearing at dusk"),
 ("s15b-2cor-10-4-5", "2 Corinthians 10:4-5", ["2-Corinthians-10-4-5"], 9, "Eden: The First Lie",
  "a lone man kneeling in an open field between two great opposing skies, warm golden light streaming toward his brow from one side and cold creeping darkness reaching toward his head from the other, the front line of a vast unseen battle running through his mind"),
 ("s16-john-8-44", "John 8:44", ["John-8-44"], 9, "Eden: The First Lie",
  "Lucifer matching the reference character exactly: a youthful beardless angel with golden curly shoulder-length hair, ornate gold armor set with colored jewels, a crimson mantle, great golden wings, standing in a beautiful garden at twilight and casting an impossibly long dark shadow across it, his beauty intact but the shadow wrong"),
 ("s16b-job-1-6-7", "Job 1:6-7", ["Job-1-6-7"], 10, "Dominion Usurped: Back at the Gate",
  "a vast heavenly assembly of luminous white-robed representatives in ordered ranks before a blazing distant throne of light, and standing among them Lucifer matching the reference character exactly: a youthful beardless angel with golden curly shoulder-length hair, ornate gold armor set with colored jewels, a crimson mantle, great golden wings, subtly out of place among the white ranks"),
 ("s17-zech-3-1-2", "Zechariah 3:1-2", ["Zechariah-3-1-2"], 11, "The Accuser at Court",
  "a burning branch plucked out of a fire by a hand of light, sparks rising, deep darkness around the flame"),
 ("s18-rom-8-33-34", "Romans 8:33-34", ["Romans-8-33-34"], 11, "The Accuser at Court",
  "Jesus the risen Advocate: long dark brown hair, short beard, white robe with gold-trimmed sleeves and a golden sash, arms raised in intercession before a radiant throne, warm advocate light filling a high hall"),
 ("s19-matt-4-4", "Matthew 4:4", ["Matthew-4-4"], 12, "The Wilderness",
  "an open ancient book glowing with steady light in a barren stony wilderness at dusk, smooth stones in the foreground"),
 ("s20-heb-4-15", "Hebrews 4:15", ["Hebrews-4-15"], 12, "The Wilderness",
  "Jesus with long dark brown hair, a short beard, gentle compassionate face, wearing a white robe with gold-trimmed sleeves and a golden sash, kneeling to lay a hand on a weary kneeling traveler's shoulder, warm compassionate light in a desert at dusk"),
 ("s21-john-12-31", "John 12:31", ["John-12-31"], 13, "The Cross",
  "the hill of Calvary with three crosses against a darkened storm sky, one great shaft of light breaking from the center cross"),
 ("s22-heb-2-14", "Hebrews 2:14", ["Hebrews-2-14"], 13, "The Cross",
  "a shattered dark iron crown and broken chains lying at the foot of a rough wooden cross in early dawn light"),
 ("s22b-rev-12-10", "Revelation 12:10", ["Revelation-12-10"], 13, "The Cross",
  "a dark cloaked figure hurled down from a great shining gate of heaven, the gate closing in light above him, falling toward a small distant blue earth far below"),
 ("s22c-luke-10-18", "Luke 10:18", ["Luke-10-18"], 13, "The Cross",
  "a single great bolt of lightning falling from the height of heaven down to a dark curved horizon, night sky, painterly"),
 ("s22d-rev-12-9", "Revelation 12:9", ["Revelation-12-9"], 13, "The Cross",
  "a great red dragon cast down out of the heavens, falling toward a small distant blue earth, trailing darkness"),
 ("s23-rev-12-17", "Revelation 12:17", ["Revelation-12-17"], 14, "War on the Remnant",
  "a small faithful band of pilgrims on a mountain ridge holding two banners of light, vast dark storm clouds massing against them"),
 ("s24-rev-12-11", "Revelation 12:11", ["Revelation-12-11"], 14, "War on the Remnant",
  "a white lamb glowing on a height at dawn, a great multitude below lifting palm branches toward the light"),
 ("s25-2cor-11-14", "2 Corinthians 11:14", ["2-Corinthians-11-14"], 15, "Angel of Light",
  "Satan transformed into an angel of light: a beautiful youthful beardless angel with golden curly shoulder-length hair, dazzling white and gold raiment, great luminous wings, whose brilliant light casts a wrong deep dark shadow behind him, subtle unease in the glow"),
 ("s26-matt-24-24", "Matthew 24:24", ["Matthew-24-24"], 15, "Angel of Light",
  "a night crowd drawn toward a great deceptive glow on the horizon while a few figures turn instead to a small true lamplit open book"),
 ("s26b-rev-16-13-14", "Revelation 16:13-14", ["Revelation-16-13-14"], 15, "Angel of Light",
  "pale luminous spirit figures drifting into a torchlit council chamber of earthly kings, crowned rulers leaning in to listen to the apparitions, a gathering storm visible beyond the pillars"),
 ("s26c-2thess-2-9-10", "2 Thessalonians 2:9-10", ["2-Thessalonians-2-9-10"], 15, "Angel of Light",
  "a night crowd gazing up at dazzling false wonders and streaks of deceptive light blazing across the sky, while below them an open Bible on a stone table lies ignored in shadow, its pages faintly glowing"),
 ("s27-isa-8-20", "Isaiah 8:20", ["Isaiah-8-20"], 16, "The Crowning Act",
  "an open Bible radiating calm steady light on a stone table inside, a wild storm raging outside a window"),
 ("s28-matt-24-27", "Matthew 24:27", ["Matthew-24-27"], 16, "The Crowning Act",
  "brilliant lightning spanning the entire sky from east to west over a wide landscape, every cloud lit with glory, every field visible"),
 ("s29-1pet-5-8-9", "1 Peter 5:8-9", ["1-Peter-5-8-9"], 16, "The Crowning Act",
  "a lion prowling in darkness just beyond a campfire's circle of light, a watchful shepherd standing guard with a staff"),
 ("s30-rev-20-1-3", "Revelation 20:1-3", ["Revelation-20-1-3"], 17, "Bound in the Pit",
  "a mighty angel descending from heaven holding a great chain and a key, above a dark broken desolate earth"),
 ("s31-lev-16-21-22", "Leviticus 16:21-22", ["Leviticus-16-21-22"], 17, "Bound in the Pit",
  "a lone goat led away by a solitary figure into a vast uninhabited wilderness at dusk, long shadows, empty land to the horizon"),
 ("s32-rev-20-7-8", "Revelation 20:7-8", ["Revelation-20-7-8"], 18, "Loosed: The Last Campaign",
  "an innumerable dark host like the sand of the sea gathering across a broken plain toward a distant shining city descended from heaven"),
 ("s33-eze-28-18-19", "Ezekiel 28:18-19", ["Ezekiel-28-18-19"], 19, "Ashes: An Utter End",
  "grey ashes scattered on scorched earth with one last ember dying, clean dawn light rising beyond the burned ground"),
 ("s34-mal-4-1-3", "Malachi 4:1, 3", ["Malachi-4-1", "Malachi-4-3"], 19, "Ashes: An Utter End",
  "a burned field of stubble at sunrise, ashes underfoot, the sun rising with warm healing rays over a clean horizon"),
 ("s35-nah-1-9", "Nahum 1:9", ["Nahum-1-9"], 20, "A Clean Universe",
  "a calm brilliant field of stars over a peaceful new earth at night, still waters reflecting the heavens, no storm anywhere"),
 ("s36-rev-5-13", "Revelation 5:13", ["Revelation-5-13"], 20, "A Clean Universe",
  "vast concentric rings of angels and redeemed multitudes around one radiant central throne, the whole canvas filled with warm light"),
 ("s37-rom-16-20", "Romans 16:20", ["Romans-16-20"], 21, "Appeal",
  "a serpent crushed beneath a bare foot in dawn-lit grass, wide peaceful morning landscape beyond"),
 ("s38-james-4-7-8", "James 4:7-8", ["James-4-7-8"], 21, "Appeal",
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
        "type": "verse",
        "id": sid, "ref": ref, "section": sec, "sectionTitle": sectitle,
        "text": text, "concept": concept,
        "side": "right" if i % 2 == 0 else "left",  # side the IMAGE panel sits on
    })

# diagram slides: rendered PNGs (render_chrono.py), placed full-slide, no crops
slides.insert(
    [i for i, s in enumerate(slides) if s["id"] == "s37-rom-16-20"][0],
    {"type": "diagram", "id": "chrono-last-days", "title": "The Last Days"},
)

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
