# Faces: a study, and four kits to choose from

Owner, 2026-10-13: "let's try to make the faces more interesting — rimworld style — what is this art style called? let's get more prior art and also art studies we can incorporate into our skill".

This study has three parts:

- §1 names RimWorld's style and settles what its faces are.
- §2 sets out what makes a minimal face characterful.
- §3 specifies four face kits, each buildable as Rive shapes on the figure rig ([RIVE.md](../RIVE.md)).

The art behind each choice, source by source, is in [prior-art.md](prior-art.md). RimWorld's figure construction, line, colour and motion are in [rimworld-study.md](rimworld-study.md). The cast the kits are fitted to is in [ensemble.md](../../../../apps/animations/docs/ensemble.md).

**Answered (owner, 2026-10-13): Kit A, three marks.** The eye stays three marks: two eyes and a mouth, with brows. Kit A's lid cut and mood range are the upgrades to build on it.

Evidence labels:

- **[src]** is a cited page.
- **[obs]** is what a cited image shows.
- **[code]** is RimWorld 1.6's decompiled code or its vanilla defs.
- **[mem]** is from memory, not verified here.

## 1. RimWorld's look, and its faces

### What the style is called

It has no formal name. These are the names people use for it:

- **Ludeon (Tynan Sylvester), 2013:**
  - "Up until now, I've done all the art in a simple, iconic style."
  - "We're sticking with the vector look because it satisfies RimWorld's design constraints very well."

  [src: https://ludeon.com/blog/2013/12/rhopunzel-in-the-house/]

- **Tynan, later, by email:** the art must "be clear about what's happening, be very cheap to create, don't be ugly, don't overwhelm with details, and be abstract enough for players to make their own interpretation." He calls the style a "solution to a problem". [src: https://hickmandesign.co.uk/blog/history/art-behind-gameplay-journey-video-game-visual-styles/]
- **Players** name it after Prison Architect, under the same 2013 post:
  - "pale copy of Prison Architect";
  - "it really looks like prison architect";
  - "Simplicity of Prison Architect is way more pleasing to the eye".

  One of them, in January 2014, adds the warning that matters most here: "Minimalism (no limbs) and overdetailed faces DO NOT mix." [src: the post's comments]

- **For our docs:** "RimWorld's vector look", or "the Prison Architect look". It has:
  - flat vector shapes;
  - one heavy dark outline;
  - big round heads on limbless capsule bodies (fans say "beans" [mem]).
  - Search terms that find it: "Prison Architect art style", "RimWorld vector art".

**Who drew it:**

- **The in-game art** is by Rhopunzel (Rho Watson), who "did pretty much everything for Gnomoria" before. [src: the Rhopunzel post]
- **The storytellers' portraits and the key art** are by Ricardo Tomé, a Portuguese digital painter: Cassandra Classic, Phoebe Friendly and Randy Random, painted in 2014. [src: https://ludeon.com/blog/2014/01/cassandra-portrait/; https://www.deviantart.com/ricardotomeart/art/RimWorld-Storytellers-427639280; Tynan crediting him, https://x.com/TynanSylvester/status/1534262636610736129]
- Wikipedia's infobox credits "Rho Watson, Ricardo Tomé". [src: https://en.wikipedia.org/wiki/RimWorld]

### Its relation to Prison Architect

- **The borrowing.** Wikipedia: "RimWorld was inspired by Dwarf Fortress and Firefly, and its art style by Prison Architect." Tynan, 2013, in its note 32 (Ludeon forums):
  - "I drew some inspiration from PA."
  - "But they do look somewhat similar; that's my fault."
  - "I'm not a good enough artist to come up with a really good original look."
  - "There are only so many ways to render characters on a tiny grid without using animations."
  - "We don't share any tools."

  [src: https://en.wikipedia.org/wiki/RimWorld; the forum thread is reproduced at https://forum.greenheartgames.com/t/rimworld-prison-architects-little-brother/18260]

- **Prison Architect's artist** is Ryan Sumo, who also drew SpaceChem: "Introversion were looking to me to provide the visual style". [src: http://ryansumo.blogspot.com/2012/01/on-introversion-and-prison-architect.html, 2012-01-12]
- **What the two share** is the top-down, limbless, flat-coloured, heavily outlined figure [obs: the 2013 screenshots]. RimWorld's own painted art (Tomé's portraits) is a different register: full faces, irises, lips and cel shading, in which "Pure black is never used for shadows". [src: https://rimworldwiki.com/wiki/User:Paintsimmon/Storyteller_art]

### The faces, settled

**Vanilla heads have eyes, and nothing else.**

- From the front, a head has two small dark eye shapes with a tiny highlight. Female heads add small lash flicks.
- From the side, a head has one eye.
- There is no mouth, no brow and no nose. [obs: the wiki's head textures, e.g. https://rimworldwiki.com/images/thumb/0/0f/Male_Average_Normal_south.png/120px-Male_Average_Normal_south.png]
- The 2013 alpha already drew the same dot eyes: two from the front, one in profile. [obs: https://ludeon.com/blog/wp-content/uploads/2013/12/ss-2013-12-10-at-06.22.34.jpg]
- The rimworld study's earlier "no eyes or mouth" [mem] was wrong and is corrected there.

**The 1.6 code.** [code: https://github.com/32bitx64bit/RW-Decompiled-1.6; vanilla LifeStages.xml]

- The eyes are their own render nodes, anchored on the head's left-eye and right-eye anchors. A head type carries an east/west eye offset.
- An eye's size is multiplied by the life stage's eye size factor, so a baby's eyes are drawn larger against its head than an adult's:

  | Life stage | Head size | Eye size | Body size |
  | ---------- | --------- | -------- | --------- |
  | Baby       | 0.5       | 0.7      | 0.2       |
  | Child      | 0.75      | 0.85     | 0.35      |
  | Teen       | 1         | 1        | 0.8       |

  Against its head, a baby's eye is 0.7/0.5 = 1.4× an adult's, and a child's is 0.85/0.75 ≈ 1.13×.

**What the expansions added.**

- **Ideology (1.3, 2021)** added:
  - beards and face tattoos ("Colonists also want new tattoos and beards and hairstyles related to their beliefs"). The Human page's gallery shows about 30 beards and 13 face tattoos, among them Tear, Warpaint and Worried (two pairs of short angled bars) [obs];
  - a styling station;
  - bionic and archotech eye textures (1.3.3066).

  [src: https://rimworldwiki.com/wiki/Ideology_DLC; https://rimworldwiki.com/wiki/Human; https://rimworldwiki.com/wiki/Bionic_eye]

- **Biotech (1.4, October 2022)** added babies, children and cosmetic genes:
  - red and grey eyes;
  - pointed, cat, floppy and pig ears, and a pig nose;
  - a heavy jaw, a heavy brow ("a prominent brow") and a gaunt head;
  - facial ridges, horns and furskin;
  - hair and skin colours.

  [src: https://rimworldwiki.com/wiki/Genes]

**Mouths, brows, lids and blinks come from mods.**

- **[NL] Facial Animation – WIP** (Nals; 26 January 2019, updated 18 October 2025; 804,111 subscribers):
  - It "replaces pawns' faces and adds facial animations that change depending on their mood or actions".
  - Its parts are face, head, eyeball, brow, lid, mouth and skin types.
  - Its animations follow the pawn's job: blink, wear and remove apparel, wait in combat, go to, lay down, lovin, ingest, social relax, socially active, downed and mine.
  - Its Experimentals add-on "Added a lid part" (2022) and a half-lid that partly hides the eyeball, and widened "the movable range of the eyes".

  [src: https://steamcommunity.com/sharedfiles/filedetails/?id=1635901197; https://rimworldbase.com/nl-facial-animation-mod/; https://github.com/sunshineydays/sd.fa.geneticheadsframework; https://steamcommunity.com/sharedfiles/filedetails/?id=2581693737]

- **Vanilla Textures Expanded – [NL] Facial Animation** (Oracle of Thessia, Oskar Potocki; 2022; 168,481 subscribers) redraws Facial Animation for players who "didn't want to commit to an anime artstyle": "Colorful anime eyes will be replaced by a more vanilla black shapes. Noses will be gone while mouths and eyebrows will become much more simple." [src: https://steamcommunity.com/sharedfiles/filedetails/?id=2816938779]
- **Facial Stuff** (Killface; last updated 2020) has:
  - "New eye shapes + various brows";
  - 30+ beards;
  - "Wrinkles for old colonists, visible by age";
  - greying hair and head rotations.

  [src: https://rimworldbase.com/facial-stuff-mod/]

- **Pawns Have Mouths** (2025): "my goal was to add mouths to stock pawns while retaining vanilla-style heads". [src: https://steamcommunity.com/sharedfiles/filedetails/?id=3458303799]
- **Simple Blinking Animation** (2025; 35,711 subscribers): blinks "in vanilla-looking style" on a "~4 seconds" idle loop, and the eyes close in sleep. Its lids are textures laid over the painted eyes: "be sure to fully cover the eye on the head texture". [src: https://steamcommunity.com/sharedfiles/filedetails/?id=3529626689]

### Which "RimWorld faces" the owner may mean

| Candidate                  | Eyes                         | Whites and pupils                                         | Brows              | Lids, blink              | Mouth              | Nose   | Acting                               |
| -------------------------- | ---------------------------- | --------------------------------------------------------- | ------------------ | ------------------------ | ------------------ | ------ | ------------------------------------ |
| (a) Vanilla 1.6            | two dark shapes with a glint | none                                                      | none               | none (blinks need a mod) | none               | none   | none: mood is a bubble over the head |
| (b) [NL] Facial Animation  | large, anime-like            | whites, coloured irises, moving pupils                    | yes                | lids and a blink         | several, by mood   | yes    | by mood and by job                   |
| (c) VTE's Facial Animation | "vanilla black shapes"       | black shapes in place of (b)'s colours; whites unverified | "much more simple" | (b)'s                    | "much more simple" | "gone" | (b)'s                                |
| (d) Tomé's portraits       | painted, irises              | full                                                      | full               | none (stills)            | painted lips       | yes    | none                                 |

- Most players see (a).
- "More interesting" than our three marks means (b) or (c): eyes that look about and blink, brows, and a mouth that follows the mood. Modded let's-plays show (b) most; (c) is (b) at our restraint.
- **Kit B is that construction cut in our paper.**

## 2. What makes a minimal face characterful

The cast never speaks ([ensemble.md](../../../../apps/animations/docs/ensemble.md)), so a face never moves to talk. It holds a shape for a beat, and the body acts first.

Every expression is a few shapes moved by view-model numbers and bones, never a new drawing (director-vision § Figures).

### Eyes: shape, size, spacing

- **Today's eye** is a solid ink oval:
  - 0.10W × 0.13W (W is the head's width);
  - centred 0.42 of the head's height from its top;
  - 0.36W apart.
- **Shape is a kit's choice, not a person's:**
  - tall ovals read alert and young;
  - wide almonds read knowing;
  - circles read open and surprised [mem].
- **Size and spacing are age cues** (the table in §3). Babies' eyes are larger, lower and wider set, as RimWorld's life stages draw them. Keep the cast's spacing within 0.36–0.40W: spacing used for personality turns into caricature.
- **Who someone is stays apart from what they feel.** A person owns their marks' sizes and their one feature. Every person shares one set of expressions, driven by the same numbers.
  - Oxygen Not Included picks an expression's frame by number, and each Duplicant's own eye and mouth art supplies it.
  - Nintendo built Animal Crossing's villagers so that feelings are "expressed similarly regardless of their species".
  - Paper Mario went the other way: one stock face for every Toad. Its producer said they "were no longer able to graphically represent individual characteristics, such as age, gender etc." Our silent films have no text to fall back on.

  ([prior-art.md](prior-art.md) § Games)

### Whites and pupils: the side-eye

- **Why whites read.** People's white sclera shows where an eye looks. The cooperative eye hypothesis holds that "the eye's distinctive visible characteristics evolved to make it easier for humans to follow another's gaze" (Tomasello and colleagues, 2007). [src: https://en.wikipedia.org/wiki/Cooperative_eye_hypothesis]
- **What whites add.** A solid eye can only look by moving. A pupil inside a white looks by itself, so a still head can glance aside: the side-eye. With the head still and the pupils pinned in the whites' corners, it reads as suspicion, guilt, wit or a passing thought, by context. Klassen's hat books rest whole jokes on it: "The only change in the main characters from page to page is their eyes" (The Horn Book; [prior-art.md](prior-art.md) § Picture books).
- **Pupil size:** a small pupil shows more white, which reads as alarm or astonishment; a larger one reads as attention and tenderness [mem].
- **The whites' colour** is the paper's light, `#f2e5d2`, never the robe's white (`#fcfefc`): white is the robe's ([CRAFT.md](../CRAFT.md) rule 12). An eye field need not be white. Haughton made a crab's eyes yellow because in white foam "the whiteness of their eyes would get lost", and Carle's eye fields are yellow tissue.
- **Far shots.** Under about 40 px of head width, whites and pupils blur into grey, so the kits fall back to solid eyes.

### Lids: the mark we lack

- **What FACS codes:**
  - the upper lid raiser (AU5): surprise, fear and anger's stare;
  - the lid tightener (AU7): anger, a squint;
  - the cheek raiser (AU6), which with the lip corner puller (AU12) makes the true, Duchenne smile;
  - eyes closed (AU43) and the blink (AU45).

  [src: https://en.wikipedia.org/wiki/Facial_Action_Coding_System]

- **A lid is a cut, not a line.** A piece of the head's own paper slides over the eye, so the eye's shape changes with no new mark (Kit A). Where there are whites, the lid's edge carries the lash line (Kits B, C). Lionni closes a mouse's eye this way, refilling the disc with a lid tone and one dark curve, and Kurzgesagt's flat-topped dots read weary.
- **The lid tilts as the brow does:** the inner end down for anger and resolve, up for sorrow.
- **Heavy lids** (half shut) read as shame, sleep, boredom or doubt. The gaze and the body say which.
- **Never a lidded deadpan at rest.** Night in the Woods cuts Mae's eyes flat with head-coloured lids, and its default face reads ironic. A hopeful film rests with open eyes; the lids come down only to act.
- **The lower lid rising** (AU6) is what separates a glad smile from a polite one.

### Brows: the main actor

- **What FACS codes:** the inner brow raiser (AU1), the outer brow raiser (AU2) and the brow lowerer (AU4).
  - Inner ends up: worry, sorrow, tenderness. The skill's gotcha already says that flat brows read cross, so `browTilt` rests above 0.
  - Both ends up: surprise.
  - Lowered and knit: anger and resolve.
- **One brow up on its own** is the skeptic (Max).
- **Brows are the cheapest mark that still reads at a distance.** Every kit keeps them but C, where the lids take their work.

### Mouth

- **Its shapes:**
  - a line, bent up (AU12) or down (AU15);
  - an "oh" (the jaw drop, AU26);
  - a grin;
  - a pressed, narrowed line.
- **Small is better.** Keep the mouth 0.13–0.19W wide. A large mouth reads loud and comic. Charley Harper refused advertising's "vacant faces smiling from ear to ear".
- **A face that withholds** hides its mouth at rest and shows it only when it means something (Kit C, after Klassen).

### Asymmetry

A perfectly mirrored face reads as a mask; a small asymmetry reads as a thought [mem]. Use it on purpose, never in every close-up:

- one brow higher in trouble;
- Max's raised brow;
- a mouth tilted when wry;
- a gaze aside.

### Cheeks and blush

- **Cheeks** are round discs below and outside the eyes. They read as youth and warmth: Mila always, Nina a little. Mary Blair's children, Hergé's Tintin and Song of the Sea all carry them.
- **A blush** carries shame and tenderness: "O my God, I am ashamed and blush to lift up my face to thee" (Ezra 9:6). It is rose, `#c99c97`, never scarlet. Scarlet is sin and stays on the cloth that carries it. Peppa Pig's characters "blush when embarrassed", as a disc whose opacity rises.
- **OWNER QUESTION:** blush on or off.

### Nose or no nose

- **No nose** gives a cleaner face. The features alone slide toward the gaze to turn the head, as today.
- **A nose** is an anchor that leads a turn: Kit D slides it 1.5× as far as the other features. It also gives adult faces weight.
  - It is cut from the skin's shade hue (`#9a92ab`), never drawn as an ink line.
  - Cartoon Saloon's faces carry a tiny hooked nose, and Jeffers's people are two dots and a long nose. Reiniger's and Ocelot's profiles cut the nose into the head's edge, and BibleProject's Agape figures have big ones ([prior-art.md](prior-art.md); [bibleproject-tone-art.md](bibleproject-tone-art.md)).
- **OWNER QUESTION:** nose or no nose.

### One feature for each person

Each cast member has one face feature that survives every kit, as Jeffers gives a person one identity mark instead of more face. The silhouette and the garment hue do the rest ([ensemble.md](../../../../apps/animations/docs/ensemble.md)). The table is in §3.

No feature may caricature a people. Every face, of every people, takes the same kit and the same dignity. Nancy Rose Hunt argues that readers who are not white may struggle to identify with Hergé's all-white leads set beside racist caricatures ([prior-art.md](prior-art.md) § Picture books).

### Age

- **Babies:** larger eyes, set lower and wider; faint brows; a small mouth; round cheeks. This is Lorenz's baby schema: "Konrad Lorenz argued in 1949 that infantile features triggered nurturing responses in adults", among them "chubby cheeks" and large eyes. [src: https://en.wikipedia.org/wiki/Cuteness]
- **Children:** the same, milder. Mary Blair's children have "big heads and large eyes", with the features clustered low (the eye line 0.55–0.6 of the way down) and a mouth smaller than an eye.
- **Teens:** narrower eyes and stronger, lower brows.
- **Elders:** smaller, heavier-lidded eyes; thin pale brows. Show age by proportion and posture first, as Old Man's Journey does: small eyes under a heavy brow, the head lower and forward, a stoop, a stick. The one crease at each eye is optional. Facial Stuff draws "Wrinkles for old colonists, visible by age", but a wrinkle is an inner line, which K1 keeps to the face's few. Charley Harper prized the "wrinkles and crow's feet that gave character" to real faces: one crease, not many.
- RimWorld's numbers fit the first two (§1). The table is in §3.

### How few marks carry eight expressions

| Expression | FACS [src]                            | The marks                                                                     | The one mark that tells it           | The body                              |
| ---------- | ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------- |
| rest       | none                                  | inner brows a little up, eyes open, mouth level                               | none                                 | weight even, hands low                |
| glad       | 6+12 (happiness)                      | lower lid up, mouth corners up                                                | the lower lid and the smile together | lifts, head up, hands open            |
| troubled   | 1+4 (sadness's brows), 1+2+4 (fear's) | inner brow ends up and uneven, mouth a little down                            | the brows' inner ends                | head tilts, a hand to the chest       |
| set        | 4+7 [mem]                             | brows low and level, lid a little down with its inner end down, mouth pressed | the lid's flat cut                   | still, chin level, hands closed       |
| astonished | 1+2+5B+26 (surprise)                  | brows high and level, eyes wide, an "oh"                                      | the "oh" under high brows            | head back, rises, freezes             |
| ashamed    | 1+4+15 (sadness), head down           | heavy lids, inner brows up and low, mouth down, gaze down                     | the heavy lid with the gaze down     | head down, turns away                 |
| tender     | 6+12, soft, with 1                    | soft lower lid, inner brows up, small smile                                   | inner brows up with a small smile    | head tilts toward the other, leans in |
| angry      | 4+5+7+23 (anger)                      | brows low and knit, lid's inner end down, mouth pressed down                  | the brows' knit                      | leans in, head forward                |

[src: FACS's emotion table, https://en.wikipedia.org/wiki/Facial_Action_Coding_System]

**What today's three marks can and cannot do.** With the body's help, they can carry all eight in a close-up. Three pairs are hard:

- tender and glad both smile;
- troubled and ashamed both grieve;
- set and angry both lower the brows.

The lids and the gaze separate them:

- **tender** is a soft squint with the inner brows up and the head tilted;
- **ashamed** is a heavy lid with the gaze down;
- **set** is a level lid with a still body, and **angry** a slanted lid with a lean.

That is why every kit adds lids. At full strength, glad's lower lid rises until only the eye's dome shows: the closed-arc smile of Blair, Keats and Cartoon Saloon.

**Three more rules from the games** ([prior-art.md](prior-art.md) § Games):

- **The rest face is the quietest.** Don't Starve's and Paper Mario's faces add brows, lids and open mouths only as a feeling grows.
- **Intensity is one more number.** LittleBigPlanet steps each emotion through three levels:
  1. the brows and lids;
  2. the mouth's shape;
  3. an open mouth, with the hands and shoulders.

  A beat's expression should take an intensity from 0 to 1 that brings the marks in that order, instead of a second preset. Bruna worked the same scale with two dots and a cross: "happy, or just a little bit happy".

- **The face never changes alone.** Paper Mario changes the pose with every face. Florence tells its argument with turned backs.

**Three rules from picture books and cut-out film** ([prior-art.md](prior-art.md)):

- **One change per beat, snapped and held.** Klassen: "when you change it just once, it becomes meaningful." Cut-out favours "swift, sudden movements" (Open Culture, summing up Gilliam's 1974 lesson). A face reaches its new shape in 2–4 frames and holds it, with at most a blink, instead of drifting.
- **Faces change on the narrator's breaks.** Kurzgesagt, Hey Duggee and Smallfilms let the narrator carry the inner life. A face changes at a phrase break and holds still under the words.
- **Detail follows the shot.** Keats gives a small Peter two dots and nothing else, and saves crescents, cheeks and brows for close shots. The far-shot rule under Whites and pupils is the same idea.

### Two people in a shot

- **They look at each other.** When two people share a shot, their heads and eyes turn toward each other within a set distance, unless the beat says otherwise.
- Untitled Goose Game's look-at "injected so much humanity into the game". [src: https://www.vice.com/en/article/honks-vs-quacks-a-long-chat-with-the-developers-of-untitled-goose-game/]
- The kits already have a look-at (the gaze and follow numbers); make it the default between two people.

### Blink

- **The human rate:** people blink about 17 times a minute (about every 3.5 s), and a blink lasts 100–150 ms. [src: https://en.wikipedia.org/wiki/Blinking]
- **RimWorld's blink mod** idles at about 4 s. [src: Simple Blinking Animation, above]
- **Oxygen Not Included** blinks at a random interval between a minimum and a maximum, and holds the blink back during big actions. [src: a 2022 decompile, https://github.com/undancer/oni-data/blob/main/Managed/main/BlinkMonitor.cs]
- **The rule for every kit:**
  - Shape: the eyes close to a line over 2 frames, hold 1, and open over 4 at 60 fps (about 115 ms).
  - Rhythm: every 2–6 s, from each figure's own seeded random, never in sync with another figure.
  - Also blink once on a large gaze jump and once at each change of expression.
  - Never blink during a held stare (astonished, set).

## 3. The kits

**Units.** The kits are drawn in the face kit's own units: the accused's head is 70 units wide (W) and 76 tall, and a bigger head scales the whole kit. Sizes and positions are given in units with fractions of W in brackets. Positions are from the face's centre (1 unit below the head's centre), x right, y down.

**Colours** ([CRAFT.md](../CRAFT.md) rule 12; K1):

| Name         | Value     | Used for                                                                                 |
| ------------ | --------- | ---------------------------------------------------------------------------------------- |
| ink          | `#2b2622` | lines, pupils and the mouth's hole                                                       |
| figure paper | `#b7b2a8` | the head's own paper; every lid is cut from it, so a lid shows only where it cuts an eye |
| eye white    | `#f2e5d2` | the paper's light                                                                        |
| shade        | `#9a92ab` | the figure ramp's violet shade, never grey                                               |
| rose         | `#c99c97` | cheeks; never scarlet                                                                    |
| hair shade   | `#83644b` | the chipboard hair's shade, for paper brows; Rosa's brows take her silver paper's shade  |

**Numbers.** These drive the kits. The first eight are on the papercut branch's kit today; the rest are new.

| Number                               | What it moves                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| gaze x, gaze y, follow               | where the eyes look, and how far the head follows                                                                 |
| eyes, eye width                      | the eye group's height (1 at rest, 0.1 a blink, over 1 wide) and width                                            |
| brow y                               | both brows' rise, in units, negative up                                                                           |
| `browTilt`                           | the brows' turn, in radians; above 0 the inner ends rise                                                          |
| mouth                                | the mouth line's middle, in units; above 0 a smile                                                                |
| mouth line, mouth open               | the line's opacity, and the "oh"                                                                                  |
| lid (NEW)                            | the upper lid's drop, from 0 open to 1 shut; the host sets its y to lid × the eye's height                        |
| lid tilt (NEW)                       | the lids' turn, mirrored like the brows; above 0 the inner ends rise (sorrow), below 0 they fall (anger, resolve) |
| low lid (NEW)                        | the lower lid's rise, from 0 to 1, where 1 covers the lower 60 %: the cheek raise of a true smile                 |
| left and right brow y and tilt (NEW) | one brow on its own, added to the pair's                                                                          |
| mouth tilt, mouth width (NEW)        | the mouth's turn (above 0 lifts the screen-left corner) and its width                                             |
| pupil (NEW)                          | the pupils' size (Kits B, C and D)                                                                                |
| blush (NEW)                          | the cheeks' opacity                                                                                               |
| grin (NEW)                           | Kit B's open smile                                                                                                |

**How an eye is built.** An eye is a group:

- The group carries the gaze and socket constraints and the eyes and eye-width scales.
- Its white, pupil and lids are children, and each lid is clipped to the white (or, in Kit A, to the solid eye).
- So a blink squashes the whole eye to a line, and the lids only act.

**Rive parts.** Every mark is an ellipse or a points path (straight or mirrored-cubic vertices) with a fill or a stroke. The lids use a clipping shape, the pupils and features use translation and distance constraints, and the head's look-at is an IK constraint. Each number is bound to x, y, rotation, scale, opacity or a vertex's y.

### Kit A, "Three marks"

**Conveys:** restraint. The body acts and the face confirms it. It is closest to what is built, and to BibleProject's ink characters ("strong brows and dot eyes", [bibleproject-tone-art.md](bibleproject-tone-art.md)).

Today's three marks, plus lids, a blink, one-sided brows, a mouth tilt and width, and optional cheeks.

| Mark                      | Shape                                                | Size                                          | Position                                  | Colour       | Moved by                                                                |
| ------------------------- | ---------------------------------------------------- | --------------------------------------------- | ----------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| eyes ×2                   | filled ellipse                                       | 6.8 × 8.8 [0.10 × 0.13W]                      | (−12, −7) and (13, −7) [±0.18W, −0.10W]   | ink          | the group: gaze (strength 0.03), a socket of 3 [0.04W]; eyes, eye width |
| upper lids ×2 (new)       | rectangle 12 × 9, clipped to the eye                 | from nothing to the whole eye                 | at lid 0, its lower edge on the eye's top | figure paper | lid (y down), lid tilt (about the eye's top centre)                     |
| lower lids ×2 (new)       | 12 × 7, its top edge arched up 2, clipped to the eye | up to the lower 60 %                          | at 0, its top edge on the eye's bottom    | figure paper | low lid (y up); near 1 the eye left above it is a ∩, the smiling eye    |
| brows ×2                  | arched three-point line, round caps                  | 16 long, 3.4 thick, arched 1.8 [0.23W, 0.05W] | (±13, −21) [±0.19W, −0.30W]               | ink          | brow y, `browTilt`; each side's own y and tilt (new)                    |
| mouth line                | straight, mirrored-cubic, straight                   | 13 wide, 3 thick [0.19W, 0.04W]               | (1, 15) [0.01W, +0.21W]                   | ink          | mouth (the middle's y), mouth line; mouth tilt and width (new)          |
| "oh"                      | filled ellipse, closed at rest                       | 8 × 10.5 [0.11 × 0.15W]                       | at the mouth                              | ink          | mouth open; the line gives way as it opens                              |
| cheeks ×2 (new, optional) | ellipse                                              | 9 × 5.5 [0.13 × 0.08W]                        | (±19, +5) [±0.27W, +0.07W]                | rose         | blush                                                                   |

| Expression | brow y                     | `browTilt` | eyes | eye width | lid  | lid tilt | low lid | mouth       | mouth width | mouth tilt | open | blush |
| ---------- | -------------------------- | ---------- | ---- | --------- | ---- | -------- | ------- | ----------- | ----------- | ---------- | ---- | ----- |
| rest       | 0                          | 0.12       | 1    | 1         | 0    | 0        | 0       | 0           | 1           | 0          | 0    | 0     |
| glad       | −1.5                       | 0.18       | 1    | 1.05      | 0    | 0        | 0.45    | 2.6         | 1.1         | 0          | 0    | 0.2   |
| troubled   | −1 (left −1.6, right −0.6) | 0.30       | 1    | 0.95      | 0.10 | 0.10     | 0       | −0.8        | 0.9         | 0.06       | 0    | 0     |
| set        | 1.5                        | −0.10      | 0.95 | 1         | 0.22 | −0.12    | 0.10    | −0.2        | 0.8         | 0          | 0    | 0     |
| astonished | −3                         | 0.04       | 1.5  | 1.3       | 0    | 0        | 0       | line hidden |             | 0          | 1    | 0     |
| ashamed    | 2.5                        | 0.22       | 0.9  | 1         | 0.45 | 0.12     | 0       | −1.6        | 0.85        | 0          | 0    | 0.5   |
| tender     | −0.8                       | 0.26       | 1    | 1         | 0.15 | 0.06     | 0.35    | 1.4         | 0.9         | 0          | 0    | 0.3   |
| angry      | 2.8                        | −0.35      | 0.95 | 1.05      | 0.30 | −0.30    | 0.15    | −1.5        | 0.8         | −0.05      | 0    | 0     |

**Gaze and body,** in every kit:

| Expression | Gaze                    | Body                                                  |
| ---------- | ----------------------- | ----------------------------------------------------- |
| rest       | ahead                   | weight even, hands low                                |
| glad       | at the other            | lifts, head up, hands open                            |
| troubled   | aside and down          | head tilts, a hand to the chest, weight back          |
| set        | level, on a fixed point | still, chin level, hands closed                       |
| astonished | at the thing            | head back, rises, freezes, hands up                   |
| ashamed    | down and aside          | head down, shoulders in, turns away                   |
| tender     | at the other, low       | head tilts toward them, leans in, a hand reaches      |
| angry      | hard at the other       | head forward and down, leans in, a hand lifts sharply |

**The papercut branch's beats map in** (the accused's and the judge's faces):

- worry → troubled;
- shame → ashamed;
- astonished → astonished;
- relief and kind → glad and tender.

Shame's squashed eye becomes a lid at 0.45, which reads as a heavy lid, not a flattened oval.

### Kit B, "Rim"

**Conveys:** liveliness. Whites, pupils, lids, brows and a set of mouths read every thought. This is the modded-RimWorld face (§1, candidates b and c) cut in our paper: Facial Animation's construction at VTE's restraint.

| Mark                            | Shape                                                                                              | Size                                         | Position                                                                   | Colour                            | Moved by                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| whites ×2                       | filled ellipse with an ink rim 1.6 [0.023W], the rim drawn over the lids                           | 11 × 9 [0.16 × 0.13W]                        | (±13, −7) [±0.19W, −0.10W], 0.37W apart                                    | eye white, ink rim                | the group: eyes, eye width; it roams only 1, since the pupils do the looking |
| pupils ×2                       | filled ellipse, clipped to the white                                                               | 5 × 5.6 [0.07 × 0.08W]                       | within 3 [0.04W] of the white's centre                                     | ink                               | gaze (strength 0.08), a socket of 3; pupil                                   |
| glints ×2 (optional)            | ellipse                                                                                            | 1.4 [0.02W]                                  | (−1.2, −1.4) from the pupil's centre, toward the light; it rides the pupil | eye white                         | none                                                                         |
| upper lids ×2                   | figure paper 14 × 10, its lower edge a shallow arc (sag 0.8) inked 1.8 thick, clipped to the white | lid × 9                                      | at lid 0, its lower edge on the white's top; at rest lid 0.12              | figure paper, ink edge            | lid, lid tilt                                                                |
| lower lids ×2                   | figure paper, its top edge arched up 1.5, no line, clipped                                         |                                              | at rest 0                                                                  | figure paper                      | low lid                                                                      |
| brows ×2                        | arched line, round caps                                                                            | 15 long, 4 thick, arched 1.6 [0.21W, 0.057W] | (±14, −23) [±0.20W, −0.33W]                                                | ink (pale hair: the hair's shade) | as Kit A                                                                     |
| mouth line                      | as Kit A, 14 wide, 3.2 thick                                                                       |                                              | (1, 15)                                                                    | ink                               | mouth, mouth line, mouth tilt, mouth width                                   |
| "oh"                            | as Kit A                                                                                           |                                              |                                                                            | ink                               | mouth open                                                                   |
| grin (new)                      | filled D: a flat top, a round bottom                                                               | 13 × 6 [0.19 × 0.086W]                       | its top on the mouth line                                                  | ink                               | grin; the line hides past 0.3                                                |
| nose (optional; OWNER QUESTION) | ellipse                                                                                            | 3 × 2.4 [0.043 × 0.034W]                     | (0, +5)                                                                    | shade                             | slides with the features                                                     |
| cheeks (optional)               | as Kit A                                                                                           |                                              |                                                                            | rose                              | blush                                                                        |

| Expression | brow y                     | `browTilt` | eyes | eye width | lid  | lid tilt | low lid | pupil | mouth       | mouth width | grin | open | blush |
| ---------- | -------------------------- | ---------- | ---- | --------- | ---- | -------- | ------- | ----- | ----------- | ----------- | ---- | ---- | ----- |
| rest       | 0                          | 0.12       | 1    | 1         | 0.12 | 0        | 0       | 1     | 0           | 1           | 0    | 0    | 0     |
| glad       | −1.5                       | 0.15       | 1    | 1.05      | 0.08 | 0        | 0.40    | 1.05  | 2.4         | 1.1         | 0.5  | 0    | 0.25  |
| troubled   | −1 (left −1.8, right −0.4) | 0.32       | 1    | 1         | 0.20 | 0.14     | 0       | 1     | −0.8        | 0.85        | 0    | 0    | 0     |
| set        | 1.5                        | −0.12      | 1    | 1         | 0.30 | −0.15    | 0.12    | 0.95  | −0.2        | 0.8         | 0    | 0    | 0     |
| astonished | −3.2                       | 0.05       | 1.3  | 1.15      | 0    | 0        | 0       | 0.7   | line hidden |             | 0    | 1    | 0     |
| ashamed    | 2.5                        | 0.24       | 0.95 | 1         | 0.50 | 0.14     | 0       | 1     | −1.5        | 0.85        | 0    | 0    | 0.5   |
| tender     | −0.8                       | 0.26       | 1    | 1         | 0.22 | 0.06     | 0.30    | 1.12  | 1.4         | 0.9         | 0    | 0    | 0.3   |
| angry      | 2.8                        | −0.38      | 1    | 1.05      | 0.35 | −0.32    | 0.18    | 0.85  | −1.6        | 0.8         | 0    | 0    | 0     |

- **Troubled is the side-eye.** The gaze goes aside and down with the head held still, so the pupils sit in the whites' corners.
- **Astonished** opens the lid to 0, which shows white all round a small pupil.

### Kit C, "Side-eye"

**Conveys:** knowing wit. Where the pupils sit and how far the lids fall tell the story, and the mouth speaks only when it must. After Klassen's hat books and Haughton's owls ([prior-art.md](prior-art.md) § Picture books).

| Mark          | Shape                                                                                                                       | Size                   | Position                                                                                    | Colour            | Moved by                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| whites ×2     | almond: straight corners at (±7.5, 0), mirrored-cubic top (0, −3.4) and bottom (0, +2.6), the top fuller; no rim            | 15 × 6 [0.21 × 0.086W] | (±13.5, −6) [±0.19W, −0.09W], 0.39W apart                                                   | eye white         | the group: eyes, eye width                                                                                                   |
| pupils ×2     | circle, clipped to the almond                                                                                               | 3.6 [0.05W]            | within ±5.5 across and ±1 up and down (the constraint's box), so a pupil reaches the corner | ink               | gaze (strength 0.12); pupil                                                                                                  |
| upper lids ×2 | figure paper, its lower edge matching the almond's top, inked 1.6 [0.023W] along it as the lash line; clipped to the almond |                        | at rest lid 0.15; the lash line rides the lid                                               | figure paper, ink | lid (× 6), lid tilt; the lids do the brows' work, so they tilt about 1.3× Kit B's                                            |
| lower lids ×2 | as Kit B                                                                                                                    |                        |                                                                                             | figure paper      | low lid                                                                                                                      |
| brows         | none                                                                                                                        |                        |                                                                                             |                   |                                                                                                                              |
| mouth line    | as Kit A, 9 wide [0.13W], 2.4 thick                                                                                         |                        | (0, +16)                                                                                    | ink               | mouth, mouth tilt, mouth width; hidden at rest, shown only in glad, troubled, astonished (an "oh" 6 × 7.5), tender and angry |
| nose, cheeks  | none (Mila keeps her cheeks; see Ages)                                                                                      |                        |                                                                                             |                   |                                                                                                                              |

| Expression | lid  | lid tilt | low lid | eyes | eye width | pupil | mouth shown | mouth | mouth width | mouth tilt | open |
| ---------- | ---- | -------- | ------- | ---- | --------- | ----- | ----------- | ----- | ----------- | ---------- | ---- |
| rest       | 0.15 | 0        | 0       | 1    | 1         | 1     | 0           | 0     | 1           | 0          | 0    |
| glad       | 0.05 | 0        | 0.55    | 1    | 1         | 1.05  | 1           | 2     | 0.9         | 0          | 0    |
| troubled   | 0.25 | 0.22     | 0       | 1    | 1         | 1     | 1           | −0.6  | 0.7         | 0.08       | 0    |
| set        | 0.35 | −0.15    | 0.15    | 1    | 1         | 0.9   | 0           | 0     | 1           | 0          | 0    |
| astonished | 0    | 0        | 0       | 1.35 | 1.05      | 0.7   | 0           | 0     | 1           | 0          | 1    |
| ashamed    | 0.55 | 0.18     | 0       | 1    | 1         | 1     | 0           | 0     | 1           | 0          | 0    |
| tender     | 0.30 | 0.12     | 0.40    | 1    | 1         | 1.1   | 1           | 1.2   | 0.7         | 0          | 0    |
| angry      | 0.42 | −0.40    | 0.20    | 1    | 1         | 0.85  | 1           | −0.8  | 0.7         | 0          | 0    |

The gaze is half of this kit's acting:

- **troubled:** the pupils are pinned in the almonds' corners, aside;
- **ashamed:** down and outward;
- **angry:** hard on the other.

### Kit D, "Paper pieces"

**Conveys:** handmade warmth. The face is cut and laid like the figure, nose and cheeks included. After Cartoon Saloon's three-piece eye, Carle's and Lionni's cut-paper eyes, and Reiniger's and Ocelot's jointed paper ([prior-art.md](prior-art.md)).

**Hand-cut variety.** Each person's pieces sit a seeded 2–3 % of W off the template, a little uneven. Tearaway's team found that squirrels built "from exactly the same template … all looked subtly different", and valued it.

| Mark                       | Shape                                                                                                                                          | Size                                                   | Position                                | Colour                           | Moved by                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| whites ×2                  | ellipse, a little egg-shaped; no rim                                                                                                           | 10 × 10.6 [0.14 × 0.15W]                               | (±14, −6) [±0.20W, −0.09W], 0.40W apart | eye white                        | the group: eyes, eye width                                                                                        |
| pupils ×2                  | ellipse, clipped                                                                                                                               | 5.6 [0.08W]                                            | within 2.2 of the centre                | ink                              | gaze (0.08), socket; pupil                                                                                        |
| lids ×2, upper and lower   | figure paper, clipped to the white; the upper lid's cut edge has a 0.8 light edge in the figure ramp's light `#d7cfc2` (K1's light inner edge) |                                                        | at rest lid 0.10                        | figure paper                     | lid, lid tilt, low lid, as in Kit B                                                                               |
| brows ×2                   | crescent sliver, concave down                                                                                                                  | 15 × 3 [0.21 × 0.043W]                                 | (±14, −21)                              | hair shade                       | brow y, `browTilt`, each side's own                                                                               |
| nose                       | rounded wedge (a half disc)                                                                                                                    | 6 × 4.5 [0.086 × 0.064W]                               | (0, +5) [0, +0.07W]                     | shade                            | slides 1.5× as far as the other features (a second translation constraint, 0.075, within 6): it leads a turn      |
| cheeks ×2                  | torn disc: ten points, the radius jittered ±6 % from a seed                                                                                    | 9 [0.13W]                                              | (±21, +7) [±0.30W, +0.10W]              | rose                             | opacity 0.45 at rest, up to 1 with blush                                                                          |
| mouth                      | closed lens: straight corners at (±6, 0), mirrored-cubic top and bottom                                                                        | 12 wide [0.17W]; 1.6 when closed, up to 7 open [0.10W] | (0, +16) [0, +0.23W]                    | ink                              | the top's and the bottom's y, which the host sets from mouth (the bend) and mouth open (the bottom drops up to 6) |
| contact shadows (optional) | a copy of each raised piece (whites, nose, brows, cheeks) offset (+0.6, +0.8)                                                                  |                                                        |                                         | shade at 0.6, a hue, never black | none                                                                                                              |

| Expression | brow y                     | `browTilt` | eyes | lid  | lid tilt | low lid | pupil | mouth | open | mouth width | cheeks |
| ---------- | -------------------------- | ---------- | ---- | ---- | -------- | ------- | ----- | ----- | ---- | ----------- | ------ |
| rest       | 0                          | 0.10       | 1    | 0.10 | 0        | 0       | 1     | 0     | 0    | 1           | 0.45   |
| glad       | −1.5                       | 0.15       | 1    | 0.05 | 0        | 0.40    | 1.05  | 2.6   | 0.35 | 1.1         | 0.7    |
| troubled   | −1 (left −1.8, right −0.4) | 0.30       | 1    | 0.18 | 0.14     | 0       | 1     | −0.9  | 0    | 0.85        | 0.45   |
| set        | 1.4                        | −0.12      | 1    | 0.28 | −0.14    | 0.10    | 0.95  | −0.3  | 0    | 0.8         | 0.45   |
| astonished | −3                         | 0.05       | 1.25 | 0    | 0        | 0       | 0.7   | 0     | 1    | 0.8         | 0.45   |
| ashamed    | 2.4                        | 0.24       | 0.95 | 0.48 | 0.12     | 0       | 1     | −1.4  | 0    | 0.85        | 0.9    |
| tender     | −0.8                       | 0.25       | 1    | 0.20 | 0.06     | 0.30    | 1.12  | 1.4   | 0    | 0.9         | 0.75   |
| angry      | 2.8                        | −0.36      | 1    | 0.32 | −0.30    | 0.15    | 0.85  | −1.5  | 0.2  | 0.8         | 0.45   |

### Ages (every kit)

One transform over any kit's marks. The cast spans all five ages.

| Age (cast)                      | Eye size                          | Eye line, from the head's top                                             | Spacing | Brows                                                                                              | Mouth                            | Cheeks                  | Also                                                                                                                                   |
| ------------------------------- | --------------------------------- | ------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| baby (Mila)                     | ×1.35 (RimWorld ×1.4)             | 0.52 of the height (adult 0.42): the features drop and the forehead grows | 0.40W   | ×0.6 long, ×0.7 thick, at half opacity, in the hair's shade                                        | ×0.7 wide, at 0.74 of the height | 0.4 at rest (Kit D 0.7) | pupils ×1.15; no lid at rest; Kit D's nose ×0.6; Kit C's almond rounds (width 0.85, height 1.3)                                        |
| child (Nina)                    | ×1.15 (RimWorld ×1.13)            | 0.47                                                                      | 0.38W   | ×0.85 long and thick                                                                               | ×0.85                            | 0.2 at rest             | pupils ×1.08                                                                                                                           |
| teen (Leo)                      | ×1, width 0.92 at rest (narrower) | 0.43                                                                      | 0.36W   | ×1.15 thick, 0.7 lower (nearer the eyes)                                                           | ×1                               | 0                       | none                                                                                                                                   |
| adult (Hugo, Clara, Max, Amara) | ×1                                | 0.42                                                                      | 0.36W   | as the kit                                                                                         | as the kit (0.71 of the height)  | 0                       | none                                                                                                                                   |
| elder (Rosa)                    | ×0.9                              | 0.42                                                                      | 0.36W   | ×0.9 long, ×0.7 thick, in her silver paper's shade; outer ends drooping (`browTilt` +0.08 at rest) | ×0.95, 1 lower                   | 0 (Kit D 0.3)           | lid +0.15 at rest (heavier); one crease at each eye's outer corner, angled down and out (an ink arc 5 long [0.07W], 1.4 thick, at 0.7) |

### One feature for each person (every kit)

| Person | The feature                                          | Built as                                                                                                                                                                                                                                  |
| ------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hugo   | the square beard                                     | a chipboard piece from jaw to chin that starts below the mouth, so the mouth stays ink on skin                                                                                                                                            |
| Clara  | nothing on the face (her plait)                      | a listening tilt of the head, 0.1 rad                                                                                                                                                                                                     |
| Leo    | the side-glance                                      | his gaze rests a little aside (in Kits B, C and D the pupils rest 1.5 toward his near side); the teen brows                                                                                                                               |
| Nina   | freckles                                             | three dots on each cheek, 1.4 [0.02W], in the shade hue, not ink                                                                                                                                                                          |
| Mila   | the baby schema                                      | cheeks always on                                                                                                                                                                                                                          |
| Rosa   | the creases and silver brows                         | the elder row above                                                                                                                                                                                                                       |
| Max    | the skeptic's brow                                   | the screen-right brow up at rest (its own y −2.5, tilt −0.06) and the lid 0.08 heavier: with his head tipped back ([ensemble.md](../../../../apps/animations/docs/ensemble.md)), "prove it"                                               |
| Amara  | half-moon reading glasses, worn low (OWNER QUESTION) | two ink half rings 1.4 thick under the eye line, with a bridge; she looks over them. The eyes never sit inside the lenses: Florence lost her glasses because her eyes in them "made it look like she was looking in different directions" |

### Owner questions

1. **Which kit:** A, B, C or D.
2. **Blush:** none, Mila only, or in every kit's ashamed and tender.
3. **Nose:** none (A, C), optional (B), or always (D).
4. **Amara's glasses:** yes or no.

The render agent builds the four kits as an options sheet on the cast, at the eight expressions and five ages. The owner picks from the stills.
