# Prior art for faces and figures

A library of art studies for the paper-cut look, one section per source, in four groups: games; picture books and mid-century illustration; animation and cut-out film; and BibleProject, our house reference. The last section ties the sources to the kits.

Each source has five parts:

- how its faces and figures are built;
- how they carry emotion;
- what we take;
- what we never take;
- its sources.

Read it with [face-study.md](face-study.md), which covers what makes a minimal face characterful and the four face kits, and [director-vision.md](director-vision.md), the look's rules.

The older studies beside it are:

- [rimworld-study.md](rimworld-study.md): RimWorld's figures, line, colour and motion.
- [style-research.md](style-research.md): BibleProject's Holiness and Agape films, Kevin Ngo's collage, and a p5.js engine.
- [bibleproject-tone-art.md](bibleproject-tone-art.md): BibleProject's looks.

**The filter.** Every "never take" applies K1 and the house rules:

- **Colour.** White is the robe's (`#fcfefc`), scarlet is sin (`#ce0914`), and gold is God's word (`#e6b347`). Garments sit at saturation 0.20–0.35.
- **Shading.** Shade with colour, never with black or grey. Outlines may be dark ([CRAFT.md](../CRAFT.md) rule 12).
- **Lines.** There are no inner lines but the face's.
- **Hands.** Hands are circles, with no thumbs and no arms.
- **Speech.** The cast never speaks, so there is no lip-sync.
- **Faces.** A face is a few Rive shapes moved by numbers, never a new drawing for each expression.
- **Tone.** The tone is sincere and hopeful: no gore, no slapstick at a verdict, and no irony as a default.

Evidence labels:

- **[src]** is a fetched page; quotation marks mean verbatim.
- **[obs]** is a downloaded image, looked at.
- **[mem]** is from memory, not checked.

Translations from French and Russian, in parentheses, are ours.

## Games

### RimWorld, and its face mods

- **Construction:**
  - Flat vector "beans" with one heavy dark outline, a big round head and no limbs. Ludeon calls this "a simple, iconic style" and "the vector look".
  - Vanilla heads carry two dark dot eyes with a glint, and no mouth, brow or nose.
  - [NL] Facial Animation (804k subscribers) replaces the face with eyeballs, pupils, lids, brows and mouths. VTE's retexture of it keeps "vanilla black shapes" for the eyes and simple brows and mouths, with no nose.
- **Emotion:**
  - Vanilla shows mood as bubbles over the head and leaves the rest to the player: "room to subconsciously interpret".
  - The mods animate the face by mood and by job: blink, wear, eat, sleep, social, downed.
- **Take:**
  - Restraint, and identity by swapping parts.
  - From the mods: eyes that look about and blink, lids, brows and a few mouths. This is Kit B.
  - Its life stages scale a baby's eyes 1.4× against its head (the ages in face-study §3).
- **Never take:**
  - Mood bubbles and icons on the picture.
  - The anime eyes and coloured irises.
  - A face so blank that the meaning is left open.
  - Its gore and its comedy.
- **Sources:** [face-study.md](face-study.md) §1, with every URL; [rimworld-study.md](rimworld-study.md).
- **Its forebear, Prison Architect** (Introversion, art by Ryan Sumo), has the same limbless top-down figures. Tynan: "I drew some inspiration from PA." [src: https://en.wikipedia.org/wiki/RimWorld; http://ryansumo.blogspot.com/2012/01/on-introversion-and-prison-architect.html]

### Klei: Don't Starve (2013) and Oxygen Not Included (2019)

- **Construction:**
  - **Don't Starve's** face is one symbol of 33 whole face drawings: blinks, profiles, sleep, scared, worried, angry and pain [src: a community template, https://github.com/DragonWolfLeo/extendedsamplecharacter-dontstarvetogether; obs].
    - Its eyes are ink-ringed ovals.
    - Brows appear only in the expressive frames; at rest the face is eyes, a nose and a small mouth [obs].
    - Jeff Agala's first, warmer concept had dot eyes and tilting brows. "We changed it to be a bit more creepy." [src: https://jeffagala.tumblr.com/post/49867903664/original-concept-art-for-dont-starves-look-and]
  - **Oxygen Not Included's** eyes and mouth are separate symbols swapped onto the head. An expression picks a frame number, and each Duplicant's own eye and mouth art supplies the drawing for it. 31 expressions share 28 faces, among them "Determined". [src: a 2022 decompile, https://github.com/undancer/oni-data/blob/main/Managed/main/FaceGraph.cs]
  - Duplicants have solid black dot eyes about 0.16 of the head wide, and a thin smile arc. Joy is a D-shaped open mouth or eyes squeezed to ^^. [obs: a Steam screenshot, https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/457140/ss_c5e20abaf2c82f9156da9c80b2ec7c0aefc46254.1920x1080.jpg]
- **Emotion:**
  - "Added mouth and eye movement to Duplicants independent of their current activity". Duplicants "visibly react when they gain new status effects". [src: https://kleiforums.com/game-updates/oni-alpha/279457-r525]
  - When feelings overlap, a priority picks one: anger and suffocation over happiness, with neutral as the floor.
  - Blinks come at random intervals and are held back during big actions. [src: the decompile]
- **Take:**
  - The split between who someone is (their marks' art and sizes) and what they feel (shared expression numbers).
  - A fixed priority when beats overlap.
  - A random blink, held during big actions.
  - Brows that join only as a feeling grows.
- **Never take:**
  - Dark eye rings, white eyes with no pupils, and hatching: Klei's turn to "creepy".
  - A flipbook of redrawn faces.
  - Rows of teeth.
- **Sources:** above, and https://www.gamedeveloper.com/design/road-to-the-igf-klei-entertainment-s-i-don-t-starve-i- ("we also wanted the style to be super-expressive and have lots of appeal").

### Tearaway (Media Molecule, 2013)

- **Construction:**
  - The messenger's head is an envelope. The default Atoi has two dark-navy disc eyes, about 0.22 of the head wide and set near its edges, each holding a pale disc, and a small open mouth.
  - There are no outlines: the edges are the paper's own [obs: https://www.mediamolecule.com/media/2014/uploads/screen_00550_thumb.png].
  - Players stack flat pieces (rings, irises, notched pupils, lips, noses, freckles) and can "remove any or all of their features". [src: https://www.mediamolecule.com/blog/article/tearaways_papery_challenges_and_character_customisation]
- **Emotion:**
  - The body acts. The first messenger was dropped because "a lot of their body was hidden away" [src: https://blog.playstation.com/2017/03/31/tearaway-eight-unseen-concepts-for-media-molecules-papercraft-adventure/].
  - The motion is "stop-frame-animation style, to make it look like the paper has partially come to life" [src: https://www.theaureview.com/games/video-games-interview-media-molecules-rex-crowle-talks-tearaway-unfolded/].
  - Hand-made variety mattered. Squirrels made "from exactly the same template … all looked subtly different". [src: https://www.destructoid.com/media-molecule-on-the-challenges-of-making-tearaway/]
- **Take:**
  - Eyes as filled cut pieces stacked on the head: an ink pupil disc on a tinted white (Kit D).
  - A seeded 2–3 % jitter per person, so one template looks hand-cut.
  - Optionally, face keys stepped on twos while the body moves smoothly.
  - Never hide the head's tilt or the hands.
- **Never take:**
  - The camera's real face in the sun.
  - Red cheek stickers, hearts and stars.
  - Eyes of many coloured rings.

### Paper Mario (Intelligent Systems; The Origami King, 2020)

- **Construction:**
  - A Toad's rest face is two black capsule eyes (about 1:3) and a short dash mouth, with no nose and no brows at rest. [obs: https://mario.wiki.gallery/images/3/31/Big_head_normal_Toad_PMTOK_sprite.png]
  - A heavy ink outline, with a white paper margin outside it ("All characters now have white outlines around them", https://www.mariowiki.com/Paper_Mario:_Color_Splash).
  - Each emotion is a whole new drawing:
    - happy: closed-arc eyes;
    - worry: brows up in the middle, a hand to the chin;
    - angry: brows down to the middle, a frown;
    - panicking: a round mouth, arms flung out.

    [obs: https://mario.wiki.gallery/images/5/5d/Chef_Toad_happy_PMTOK.png and its siblings]
- **Emotion:**
  - The face and the pose always change together.
  - The team "created mockups of the characters using actual paper" to choose each one's best view. [src: https://www.videogameschronicle.com/features/interviews/paper-mario-origami-king/]
  - The cost of one stock face: "we were no longer able to graphically represent individual characteristics, such as age, gender etc." [src: https://www.videogameschronicle.com/news/paper-marios-producer-elaborates-on-the-challenge-of-npc-restrictions/]
- **Take:**
  - A calm two-oval, one-dash rest face.
  - Brows only for troubled, angry and astonished: inner ends up for trouble, down for anger.
  - A pose with every face.
  - Mock each cast member up in cut paper to pick their view.
- **Never take:**
  - The white border (white is the robe's).
  - One stock face for many people.
  - A full redraw per emotion.

### Florence (Mountains, Ken Wong, 2018)

- **Construction:**
  - Comic line over flat colour, with one ink colour per scene.
  - Florence has two tiny dash eyes with no whites, a hooked nose and a short mouth arc, and her fringe hides her brows.
  - Krish has dot eyes and thick brow strokes. [obs: https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1102130/ss_7cd51d91b164dc46f5abfc76d16909ce233c20a9.1920x1080.jpg]
- **The glasses.** Florence's glasses were dropped because "the position of her eyes within the glasses" "made it look like she was looking in different directions". Her character went into her hair: "a little bit uncontrollable, kind of messy". [src: https://milanote.com/the-work/lead-designer-of-monument-valley-deconstructs-his-latest-game-florence]
- **Emotion:**
  - "Visual composition, color, and music" replace dialogue. [src: https://www.gamedeveloper.com/design/how-simple-mechanics-and-vignettes-inspired-i-florence-i-]
  - The argument is told by turned backs and lowered heads: Krish "walling up", Florence "breaking apart" [obs; src: Milanote].
- **Take:**
  - At mid shots, dot eyes and one mouth arc carry glad and tender.
  - Troubled, angry and ashamed are shown by the body first.
  - One gaze drives both eyes, kept symmetric.
  - Personality goes into the hair's silhouette.
  - Glasses never frame the eyes (Amara's half-moons sit below them).
- **Never take:**
  - A fringe over the brows.
  - Hatching and stubble dots.
  - Greying the whole scene for sadness.

### Old Man's Journey (Broken Rules, 2017)

- **Construction:**
  - In profile: a heavy pale brow block over a tiny dot eye (about 0.03–0.04 of the head), a large rosy nose, and a full beard that hides the mouth.
  - Front on, in a reflection: two dot eyes under blocky brows, and no mouth. He sits hunched with his forearms on his knees.

  [obs: https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/581270/ss_55450e50b640718b5ec4ab05afca2f7c0efcd3ca.1920x1080.jpg]

- **Emotion:**
  - "There is no dialogue in Old Man's Journey" [src: https://www.macstories.net/reviews/game-day-old-mans-journey/].
  - The team found "Clemens' drawings were better at evoking emotions" than 3D, and wanted players "to empathize with the character of the old man" [src: https://www.gamedeveloper.com/design/road-to-the-igf-broken-rules-i-old-man-s-journey-i-].
  - The brow, the head's angle and the posture act.
- **Take:**
  - Age shown by proportion, not wrinkles: smaller eyes under a heavier brow, a larger nose, the head lower and forward, a stoop, a stick (Rosa).
  - The elder acts mainly through the brow.
- **Never take:**
  - A white beard (use a pale tinted hue).
  - A beard that hides the mouth in a close-up (Hugo's beard starts below it).
  - Painterly grain and soft shading.

### Night in the Woods (Infinite Fall, 2017)

- **Construction:**
  - Flat shapes with no outlines.
  - Mae has two big pale eyes, each about 0.36 of the head wide, with large pupils that slide toward whoever she looks at.
  - Head-coloured lids cut the eyes' tops flat, which gives her deadpan.
  - She has a tiny mouth and no visible brows. [obs: https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/481510/ss_0750dea576c64a790a97b8ea5ce399d6ba5a42ec.1920x1080.jpg]
- **Emotion:** the script drives the face.
  - An emoticon in a line "triggers a corresponding animation action, such as animating from the neutral expression to a smile".
  - Commands set "where and how a character is looking" and "the dilation of their eyes".
  - "Every time you see a character do anything besides talk, it's the result of an action."

  [src: https://secretlab.games/blog/2017/11/14/how-night-in-the-woods-uses-yarn-spinner]

- **Take:**
  - Gaze and pupil size as numbers the beat sets (Kits B to D).
  - Rest as home: every expression is a timed move away and back.
  - Lid pieces that cut the eye, set by height and tilt.
  - Named gestures fired on the face's beat.
- **Never take:**
  - Eyes this large on adults (keep big eyes for Mila and Nina).
  - Pure white eyes.
  - The flat-lidded deadpan as a rest face: it reads ironic.

### LittleBigPlanet (Media Molecule, 2008)

- **Construction:** Sackboy has four emotions, "happy, sad, scared, and angry", each with "a degree of intensity" [src: https://en.wikipedia.org/wiki/LittleBigPlanet_(2008_video_game)].
- **Emotion:** each level adds marks [src: https://littlebigplanet.miraheze.org/wiki/Emotions]:
  - Happy, level 1: "They smile, their brow raises and body has a noticeable bounce to their step". Level 2: "They smile with an open mouth".
  - Angry: the "brow lowers in the middle", then "lowers more", then the mouth opens wide.
  - The hands "bunch up into fists" in anger.
- **Take:** an intensity number for each expression. The marks come in order:
  1. the brows and lids;
  2. the mouth's shape;
  3. an open mouth, with the hands and shoulders.
- **Never take:**
  - Finger gestures (our hands are circles).
  - Tongue-out joy and open sobbing.

### Animal Crossing: New Horizons (Nintendo, 2020)

- **Construction:**
  - One emotional language across all bodies: feelings "expressed similarly regardless of their species".
  - Identity comes from eye designs and markings on silhouettes that differ "by species".

  [src: https://nintendosoup.com/nintendo-shares-how-they-designed-animal-crossing-new-horizons-villagers/; obs: its slides]

- **Emotion:**
  - Happy is closed-arc eyes and an open smile.
  - Sad is eyes squeezed shut with flying tears.
- **Take:** the same expression numbers for baby, child, teen, adult and elder. Identity lives in the marks' sizes and the silhouette.
- **Never take:**
  - Pink blush.
  - Effect particles (petals, tears).

### Untitled Goose Game (House House, 2019)

- **Construction:** "The humans have a certain amount of character but are faceless save for their distinct blobby noses." "Everything is lineless." [src: https://www.gamedeveloper.com/design/an-untitled-i-untitled-goose-game-i-analysis]
- **Emotion:** a head-turn system made characters "turn their heads to look at each other when standing at a certain distance", which "injected so much humanity into the game". [src: https://www.vice.com/en/article/honks-vs-quacks-a-long-chat-with-the-developers-of-untitled-goose-game/]
- **Take:**
  - Look-at as the default between two people in a shot.
  - In a wide shot, the bodies alone act.
- **Never take:** faceless leads in a close-up.

## Picture books and mid-century illustration

### Jon Klassen (I Want My Hat Back, 2011; This Is Not My Hat, 2012; We Found a Hat, 2016)

- **Construction:** the faces are eyes only, with no brows, and the fish and the turtles have no mouth.
  - The big fish's eye is a white sliver squashed like a nearly shut lid, with the pupil pushed forward. The crab's pupils sit at the same edge of both stalked eyes: a side-eye. [obs: the This Is Not My Hat spread in the interview below]
  - The turtles' whites are lens shapes that imply half-lids, with a pupil filling most of the height. Both eyes face us on a head drawn in profile. [obs: https://i0.wp.com/www.themarginalian.org/wp-content/uploads/2016/12/wefoundahat_klassen21.jpg]
- **Emotion:**
  - "The only change in the main characters from page to page is their eyes, subtly encouraging a deadpan delivery." [src: https://www.hbook.com/story/this-is-not-my-hat]
  - Klassen: "when you change it just once, it becomes meaningful. It doesn't have to look very complicated." "You can give just the slightest indication, like if he was frustrated, he'd be looking at us by now." His animals are "always facing the audience". [src: https://web.archive.org/web/20210126102557/https://www.artofthepicturebook.com/-check-in-with/2014/10/15/interview-with-jon-klassen]
  - Where the eyes look is the timing. The animals look "right at you" for most spreads. When the bear despairs, "his eyes, and the eyes of the other characters, are looking at one another". [src: https://afuse8production.slj.com/2011/05/28/review-of-the-day-i-want-my-hat-back-by-jon-klassen/]
- **Take:**
  - An eye as a light field with a pupil clipped inside it; the gaze is only the pupil's x and y (Kit C).
  - A lid as the eye's height: about a third shut reads guarded or set.
  - One change per beat, with the rest frozen.
  - The gaze's target as an expression in itself: at us, at each other, or down. A look at us is kept for the key beat.
- **Never take:**
  - Deadpan menace and dark endings.
  - A kit that only moves the gaze: it cannot do glad or tender.
  - Pure white whites.

### Chris Haughton (A Bit Lost, 2010; Shh! We Have a Plan, 2014; Don't Worry, Little Crab, 2019)

- **Construction:**
  - Little Owl is one flat dark-blue shape. Two white ring eyes sit high and close, each about a quarter of the body's width, over a tiny beak, with no brow or mouth. [obs: https://blog.chrishaughton.com/wp-content/uploads/2013/03/Picture_150000-1024x509.png]
  - A deer's pupils are pushed to the top edge of white discs, and both eyes face us on a head in profile [obs: https://blog.chrishaughton.com/wp-content/uploads/2013/03/Screen_shot_2010-09-07_at_03.08.57.png].
  - "In order to give the bird a range of expressions, forward facing eyes is much better graphically so I chose an owl instead of a bird." "the only white on the page is the white of the eyes of the characters." [src: https://blog.chrishaughton.com/tag/ihanhukassa/]
  - "I made the crab's eyes yellow because there are many scenes where there needs to be white foam splashing the crabs and the whiteness of their eyes would get lost." [src: https://blog.chrishaughton.com/author/chrishaughton/]
  - His paper look is often digital: of his earlier books, "It was all pencil and digital." [src: https://blog.picturebookmakers.com/post/chris-haughton]
- **Emotion:**
  - "The most important part of these sequences are the eyes so they need to be immediately obvious on the page or the page turn effect is lost." [src: the author page, above]
  - A review he quotes: "Squirrel peers at Little Owl, his paws clasped in concern, his neck stretched out quizzically." [src: the A Bit Lost page, above]
- **Take:**
  - The eye field as the brightest mark on the figure, in a light that is not white where white is reserved: our `#f2e5d2`.
  - A pupil at the field's edge means looking. Paired with a body cue, a stretched neck or clasped hands, it means concern.
  - The more figures in the frame, the simpler each face.
- **Never take:**
  - Jewel-bright colour and shapes with no outline.
  - Both eyes facing us on a person's profile. It reads on his animals; on people it is Peppa Pig's cheat (below).

### Oliver Jeffers (Lost and Found, 2005; The Incredible Book Eating Boy, 2006; The Hueys, 2012)

- **Construction:**
  - "His trademark is for people to have pencil stick legs and their faces have no real details, just dots for eyes and long noses that begin above their eye line." [src: https://bookriot.com/oliver-jeffers/]
  - The Hueys are egg-shaped outlined bodies with a skin-tone face patch, small wide-set dot eyes, a long pink nose, a tiny mouth mark and round hands with no fingers [obs: https://assets.penguinrandomhouse.com/series-images/series-DPZ-triad.png].
  - Jeffers leaves "out as many details as possible so that people can apply their own sense of self and their own story to it", and lets one mark carry a person's identity. [src: https://www.printmag.com/podcasts/2024/design-matters-oliver-jeffers/]
- **Emotion:**
  - "we all understand body language. … And it's when it can do those things with just a couple of lines, there's just a charm that comes with that." [src: Design Matters, above]
  - In The Incredible Book Eating Boy, Henry's whole head shifts in steps from pink to green across one spread, as "He was beginning to feel a little ill" [obs: http://blaine.org/jules/bookeating1.jpg].
  - In Lost and Found's hug, the hat hides most of the face, and the two bodies carry the tenderness [obs: http://blaine.org/jules/lostandfoundend.jpg].
- **Take:**
  - Two dots and one strong nose make a whole adult face.
  - One identity mark for each person (a beard, a headcloth, a hair shape) instead of more face: our one feature each.
  - A hug or a turned back may hide the face entirely.
  - A hue shift across the whole face for a bodily state: one colour number, shaded with colour.
- **Never take:**
  - Bendy limbs and pencil or watercolour texture.
  - Red lips, or a reddening face as a sign.

### Dick Bruna (Miffy, 1955–)

- **Construction:**
  - Miffy has a "clean, simple little face (two dots for eyes, a cross for a mouth)" [src: Horatia Harrod's 2008 Telegraph interview, reprinted at http://losarciniegas.blogspot.com/2017/02/dick-bruna-creator-of-miffy-books-talks.html].
  - Her eyes are black ovals about 0.05–0.07 of the head's width and about 0.53 of it apart. The eye line sits about 0.57 of the way down the head and the mouth about 0.8, inside a thick black outline with no other inner line. [obs: https://cdn.shopify.com/s/files/1/0832/0503/0165/files/Dick-Bruna_102_article.jpg?v=1739360192]
  - The design grew toward the reader. At first "the eyes were a little askew, not yet communicating so directly with the reader"; later they were "bigger and wider apart". He drew "with scissors", in cut paper under painted black contours. [src: https://www.thamesandhudson.com/blogs/all-news-features/the-making-of-an-illustrator-dick-bruna-s-miffy-1]
- **Emotion:**
  - "With two dots and a little cross I have to make her happy, or just a little bit happy, a little bit cross or a little bit sad – and I do it over and over again. There is a moment when I think yes, now she is really sad. I must keep her like that." He worked by "a minute tilt of the head, a blink of the eye, or the relation of Miffy to a particular room or a landscape". [src: Thames & Hudson, above]
  - "I very often start with three or four tears. I take away one, and the next day I take away another one, and at the end I have one tear, and that's very, very sad." [src: the Telegraph interview, above]
  - "Because there is so little, that which is there needs to be perfect." [src: https://www.itsnicethat.com/features/dick-bruna-bruce-ingman-miffy-illustration-151020]
- **Take:**
  - Degrees as well as kinds: "a little bit sad" is the intensity number (face-study §2).
  - Feeling through a tilt, a blink, a small shift of the marks and where the figure stands.
  - If a tear is ever used, one drop, held.
  - Eyes level. Even a small difference in their height reads as askew.
  - Turning a figure away, face hidden, is a beat.
- **Never take:**
  - His pure primaries: "he only ever worked in red, blue, green, yellow, and sometimes brown" [src: It's Nice That, above].
  - The cross mouth, which can read as a silenced one [mem].
  - A fixed blank stare on adults.

### Leo Lionni (Little Blue and Little Yellow, 1959; Frederick, 1967)

- **Construction:**
  - Frederick's mice are torn grey wedges in profile, with one eye each and no mouth or brow. An open eye is a white disc with a thin dark rim and a black pupil set forward and up. A closed eye is the same disc filled with a pale lid tone and crossed by one dark curve. [obs: https://www.illustrationhistory.org/images/uploads/014_NEW_FRED-028-029.jpg]
  - He "turned bits of colored paper torn from a magazine into 'characters.'" [src: https://gallery.lib.umn.edu/exhibits/show/abc-of-it--why-children-s-book/art-of-the-picture-book/size-and-shape/little-blue-and-little-yellow]
  - "There are no eyes in Little Blue and Little Yellow. There are only lumpy forms that somehow convey through their contours and composition buildings, landscapes, joy, animation, anxiety, protectiveness, and love." [src: https://www.untappedjournal.com/issues/issue-7/leo-lionni-little-blue-little-yellow-graphic-design]
- **Emotion:** in Frederick, feeling comes from eyes open or shut, from the mice grouped and turned toward Frederick, and from coloured thought shapes [obs: the Frederick spread].
- **Take:**
  - Closing an eye by refilling it with the lid's tone and one curve: no new shape (Kit A's paper lid, Kit D).
  - A mouth is optional when the eyes, the grouping and the body's turn carry the beat.
  - Listening and tenderness staged as a group, bodies turned toward the one who matters.
  - Torn or cut edges on the head's pieces give the paper feel with no texture on the face.
- **Never take:** faceless shapes for the human cast. The films need people we can tell apart.

### Eric Carle (The Very Hungry Caterpillar, 1969; Brown Bear, Brown Bear, What Do You See?, 1967)

- **Construction:**
  - He builds a face piece by piece. The museum's step photos show a "hand placing yellow painted tissue paper eye on red oval tissue paper", then a green eyeball set into the yellow eye; "With a crayon, he added the final touches." [src: https://carlemuseum.org/about/about-eric-carle/artistic-process]
  - The purple cat's eyes are almonds: a white field, a green iris and a dark slit, with a flatter top edge that reads as a lid. They sit about 30 % and 70 % across the face, each about a fifth of its width, over a pink strip nose and a tiny curved mouth. [obs: https://carlemuseum.org/sites/default/files/styles/gallery_slide/public/2021-06/brown_bear_purple_cat.jpg?itok=l48U9YLX]
- **Emotion:** his faces present rather than act. "A bird is a bird, a house a house. The child in me likes to know very quickly what the image is. I have a missionary zeal to simplify." [src: https://tes.com/news/eric-carle-very-hungry-caterpillar-illustrator-interview-children-book]
- **Take:**
  - An eye laid in layers, field, then iris or pupil, with a flat top edge for the lid: Kit D's build.
  - A coloured eye field, like his yellow: precedent for our cream.
  - A face that reads at a glance before it acts.
- **Never take:**
  - Tissue texture, rainbow colour and crayon scribble.
  - Faces that only present: the cast must act.

### Ezra Jack Keats (The Snowy Day, 1962; Peter's Chair, 1967)

- **Construction:**
  - "With The Snowy Day I started all over again. My use of collage developed naturally." [src: https://gallery.lib.umn.edu/exhibits/show/techniquesandmedia/biographies/ezra-jack-keats]
  - In the snow-angel spread, Peter is small. His face is a brown oval in the red hood with two dot eyes and nothing else, and the suit's silhouette acts. [obs: https://www.skirball.org/sites/default/files/styles/max_2600x2600/public/2022-12/gallery1_32-the-snowy-day-2.jpg?itok=wIaviRCJ]
  - In Peter's Chair, the laughing father has closed crescent eyes, raised cheeks, a moustache and a tilted head. Peter has small downcast eyes, a tiny smile line and a warm shift of hue on his cheek, under hair that is one flat dark shape. [obs: https://www.skirball.org/sites/default/files/styles/max_2600x2600/public/2022-12/gallery17_28-peters-chair.jpg?itok=21DRNYca]
- **Emotion:** Keats: "Each drawing is considered not in itself, but in relationship to the rest of the book", with "drama, continuity, contrast, and mood" in mind. [src: https://thejewishmuseum.org/exhibitions/the-snowy-day-and-the-art-of-ezra-jack-keats/]
- **Take:**
  - Detail that follows the shot: two dots in a wide shot; crescents, cheeks and brows only close.
  - Adult laughter as closed crescents with the cheeks rising; a child lost in thought as low pupils and a tipped head.
  - Hair as one flat shape that frames the face.
  - Faces planned across the whole film, for contrast.
- **Never take:** painted modelling, and marbled or patterned paper on the skin.

### Mary Blair (Disney concept art, 1940s–60s; I Can Fly, 1951)

- **Construction:**
  - "The kids Blair painted are designed super cute, with big heads and large eyes." [src: https://www.wbur.org/news/2016/02/15/mary-blair] The It's a Small World dolls, "with their big heads and tiny features", came from her Hallmark cards [src: https://www.designingdisney.com/parks/disneyland-paris/disneyland-park/fantasyland/designing-its-small-world-mary-blair/].
  - The girl in I Can Fly tilts her head back. Her closed eyes are downward arcs with lashes, about 55–60 % of the way down the head, under tiny high brows. Her nose is a faint touch, her mouth smaller than one eye, and pink blush discs, larger than the eyes, sit below and outside them. [obs: https://media.wbur.org/wp/2016/02/WDFM_Blair_I-Can-Fly.jpg]
  - Her Italy concept art has round faces with two dots set low and close, a small smile and no nose or brows. On a head turned three-quarters, the whole cluster of features slides sideways. [obs: https://www.designingdisney.com/media/images/9.max-600x600_1fB3zra.jpg]
- **Emotion:** John Canemaker credits her with "taking stylized characters and giving them emotions that are believable" [src: WBUR, above]. Joy in I Can Fly is a backward tilt, closed arcs and blush, and nothing more [obs].
- **Take:**
  - For the baby and the child: a bigger head with small features clustered low, the eye line 0.55–0.6 of the way down, and a mouth smaller than an eye.
  - Glad and tender as closed arcs with a head tilt.
  - Blush as its own disc on an opacity number.
  - A turn as the cluster of features sliding inside the head, as the kits already do.
- **Never take:**
  - The red mouth, and "a faux naive use of pure primaries" [src: Designing Disney, above].
  - Big-eyed cuteness on adults and the elder.

### Charley Harper (mid-century wildlife prints)

- **Construction:**
  - "I don't try to put everything in; I try to leave everything out" [src: https://www.charleyharperartstudio.com/about-charley/faq.html].
  - "I saw forms as hard-edge shapes of flat or textured color with enough lines added to complete identification." He cut paper for the large shapes: "the paper makes it easy to think flat, try different placements of shapes, and make changes". [src: https://charleyharperprints.com/charley-harper/his-story-in-his-own-words/]
  - The burrowing owl's eyes are pale yellow discs, each about 0.18 of the head's width, with a dot in the middle. Two straight lines cross in an X between them and read as scowling brows in a V. A second owl shows only half its head above the burrow and reads watchful. [obs: https://ekostories.com/wp-content/uploads/2016/12/burrowing-owl.jpg]
- **Emotion:**
  - He refused the faces of advertising, "their vacant faces smiling from ear to ear with sparkling eyes wide open. Try it—it's unnatural." [src: the FAQ, above]
  - He "enjoyed painting real people with all the wrinkles and crow's feet that gave character to their faces". [src: his own words, above]
- **Take:**
  - Brows as two short straight strokes, their inner ends turned down into a V for angry or set.
  - His minimum test: add a mark only when the face no longer reads without it.
  - The view chosen per beat: frontal and symmetric to address or resolve, a profile for action, half the head hidden for watching.
  - For the elder, one crease at each eye (Rosa).
- **Never take:**
  - His black and white accents ("I began to include black and white in every full-color picture" [src: his own words, above]).
  - The ear-to-ear smile.

### Hergé (The Adventures of Tintin, 1929–76)

- **Construction:**
  - Tintin has "a round face and quiff hairstyle" [src: https://en.wikipedia.org/wiki/Tintin_(character)]. A critic notes "such babyish clarity to those round, rosy cheeks, that thumb-like nose, the expressive parentheses of his eyebrows" [src: https://lareviewofbooks.org/article/the-afterlife-of-tintin/].
  - Dot eyes, short curved brows set high, a small "o" mouth, a rounded nose out of the profile, a pink cheek patch and line of one weight [obs: https://assets.lareviewofbooks.org/uploads/2013071332982537.jpg].
- **Emotion:**
  - With dot eyes, the brows and the mouth carry the feeling. Scott McCloud argues that readers look to the eyes and mouth for emotion, and that a face of few marks leaves room to project. [src: https://en.wikipedia.org/wiki/Masking_(comics)]
  - The lead is plain: his neutrality allows "the reader to assume Tintin's position within the story" [src: Wikipedia, Tintin, above], while "many of Hergé's extras are given a surprising level of specificity" [src: LA Review of Books, above].
- **Take:**
  - With dot eyes, two short brow arcs are the main marks (Kit A), and a small "o" is astonished.
  - The plainest face for the lead, and more particular marks for the supporting and the old.
- **Never take:**
  - Caricature. Nancy Rose Hunt argues that readers who are not white may struggle to identify with an all-white cast set beside racist caricatures [src: Masking, above]. Every face, of every people, takes the same kit and the same dignity.
  - Saturated flat colour.

## Animation and cut-out film

### Cartoon Saloon (Tomm Moore: The Secret of Kells, 2009; Song of the Sea, 2014; Wolfwalkers, 2020)

- **Construction:**
  - Kells began "with a much more classical Disney look". The producer "really pushed us to have very flat characters, more like medieval icons", with "the 'stained glass' effect of thicker outer lines". [src: https://www.awn.com/animationworld/moore-illuminates-secret-kells]
  - Song of the Sea was to look "more like a picture book" [src: https://beforesandafters.com/2020/09/14/tomm-moore-on-his-distinctive-style-of-animated-filmmaking/].
    - An eye is an almond white almost filled by a big dark iris with a highlight, under a thick upper-lid line.
    - The nose is a tiny hook, the mouth is small, and the blush is soft pink discs. Ben adds one thick brow stroke.

    [obs: https://www.cartoonsaloon.ie/wp-content/uploads/2020/10/46_Saoirse-the-faries-ben-1536x864.webp; https://www.cartoonsaloon.ie/wp-content/uploads/2020/10/Cu-Ben-beach-1536x864.webp]

  - In Wolfwalkers, Mebh has a big eye with a heavy lid, freckle dots, a nose bump and a one-curve smile. Robyn has a heavy lid line, thin brows and a one-line nose; asleep, her eye is one ∪ lash arc. [obs: https://www.cartoonsaloon.ie/wp-content/uploads/2020/10/ww021_sc007_00363-1536x830.webp; https://www.cartoonsaloon.ie/wp-content/uploads/2020/11/Wolfwalkers_Robyn-1536x830.webp]
- **Emotion:**
  - "We are hoping to show how the characters feel with great acting, movement and facial expressions." [src: https://www.cartoonbrew.com/feature-film/first-look-wolfwalkers-tomm-moores-new-feature-trailer-exclusive-149399.html]
  - Shape carries the arc. "Robyn is much more square with sharp angles, she's constrained, older", and Mebh's shapes are round, "very free" [src: https://mande.net/crafts/visual-fx/wolfwalkers-animation/]. Robyn's design rounds as she bonds with Mebh [src: https://vfxvoice.com/cartoon-saloon-running-with-wolves-in-wolfwalkers/].
  - Wolves under a spell "don't have any pupils in their eyes and they're much more menacing" [src: https://www.animationforadults.com/2020/10/wolfwalkers-interview-with-directors.html]. In wolf form the wolfwalkers keep "their exact same eyes that they have as a human" [src: mande.net, above].
  - Glad old fairies close their eyes into ∩ arcs [obs: the Saoirse still].
- **Take:**
  - The eye as three pieces: a pale almond, a large dark iris, and a thick upper-lid stroke in the outline's ink. The lid's drop and turn are the main dial (Kits B to D).
  - One eye design per person, kept through every feeling and every costume.
  - Closed eyes as one arc switched in by opacity: ∩ for glad, ∪ for tender or asleep.
  - Shape across a story: angular cuts for the constrained, rounder ones for the free. A figure can round off as its story resolves.
  - A tiny nose, freckle dots and soft cheek discs (Kit D; Nina's freckles).
- **Never take:**
  - Eyes with no pupils on anyone in the cast: Moore keeps them for menace.
  - Line weight that changes with feeling, and watercolour texture. Our outline is fixed and our paper flat.
  - Pure white whites and pink blush: use the paper's light and rose.

### Kurzgesagt (2013–)

- **Construction:**
  - "We combine classic 2D flat animation with 3D elements" [src: https://kurzgesagt.org/what-we-do?visit=videos]. Its characters "are rigged with joints so they can be moved smoothly and naturally" [src: https://10.studio/the-incredible-amount-of-work-behind-kurzgesagts-beautiful-animated-videos/].
  - The bird has no outline and one big white eye. The dark body cuts off the eye's top, so the white is a crescent under the pupil, looking up. [obs: https://ksite.fra1.cdn.digitaloceanspaces.com/uploads/d8cae749f3f93dbe209496cee6fc4743.png]
  - People's closed eyes are filled half-discs, round side down, with lash ticks. Their brows are short rounded bars set high, the nose is soft, the mouth is a small filled bar, and there is a blush patch. A boy's eyes are dots with flat tops, half-lidded, over a dash mouth with no brows. [obs: https://i.ytimg.com/vi/n3Xv_g3g-mA/maxresdefault.jpg]
- **Emotion:**
  - One cut changes what a dot means: a flat top makes it weary, and a crescent of white under it makes it wonder [obs: both images].
  - "Steve is the voice of Kurzgesagt and he narrates every video in his signature tone that blends rationality and optimism." [src: kurzgesagt.org, above] The voice carries the meaning, and the faces punctuate it.
- **Take:**
  - A lid that cuts a solid dot: Kit A's lid. A third of the way down reads set or weary; half, with the gaze low, reads ashamed or tender.
  - Brows as short rounded bars that turn about 20° either way.
  - Faces that change on the narrator's phrase breaks and hold still while he talks.
- **Never take:**
  - Faces with no outline, colour on colour.
  - Its "vibrant colors" (garments stay at saturation 0.20–0.35).

### Hey Duggee (Grant Orchard, Studio AKA, 2014–)

- **Construction:**
  - Orchard began with "basic geometric shapes, only this time we threw in some eyeballs and mouths": "Initially I always start simple, and then make additions." [src: https://www.cartoonbrew.com/tv/interview-hey-duggee-creator-grant-orchard-creating-unconventional-preschool-show-149069.html]
  - It is "a minimalist style using filled shapes with no outlines" [src: https://en.wikipedia.org/wiki/Hey_Duggee].
  - At rest, Duggee has two tiny black oval eyes close together above a big black nose, a thin off-centre mouth curve and no brows [obs: https://studioaka.co.uk/wp-content/uploads/2017/01/39ffb229ac64e1a0133cdd91011b023a.png].
  - The Squirrels have plain dots or white circles with dot pupils, set high and close, and short arc smiles [obs: https://studioaka.co.uk/wp-content/uploads/2017/01/06dfa91bc0690409a5b81f8a9fd4272e.png].
- **Emotion:**
  - At a peak, the dot eyes become two touching white ovals with the pupils looking up, over a big D-shaped open mouth [obs: https://studioaka.co.uk/wp-content/uploads/2017/01/93a52c95189ec3f605b02c52dae128eb.png].
  - Orchard: "you only have to move the positions of their features slightly for them to go completely off-model." "we always take what we consider extraneous detail out wherever we can." [src: Cartoon Brew, above]
  - Duggee never speaks; he woofs [src: Wikipedia, above], and a narrator tells the story [src: https://studioaka.co.uk/hey-duggee/].
- **Take:**
  - Two eye states at one place: a dot at rest, and a white with a pupil at a peak (astonished, overjoyed), switched by opacity over 1–2 frames. This would give Kit A a peak.
  - One open mouth, kept for peaks.
  - Each person's face anchors fixed in their data, with clamps on how far marks move. "Off-model" is a few units away.
  - A lead who never speaks, beside a narrator: a precedent for our cast.
- **Never take:**
  - No outlines, saturated primaries and gradients.
  - A crimson open mouth: the mouth's inside is ink, never scarlet.

### Lotte Reiniger (The Adventures of Prince Achmed, 1926)

- **Construction:**
  - In her own 1936 text, she cut her figures with "every limb being cut separately and joined with wire hinges" [src: https://www.bfi.org.uk/sight-and-sound/features/scissors-make-films-lotte-reiniger-creating-her-magical-animations].
  - "Heads and legs were always in profile". Leading characters were cut in several sizes for "long shots and close-ups". [src: https://apollo-magazine.com/lotte-reiniger-silhouette-films/]
  - Faces are solid black profiles: the nose, lips and chin exist only as the edge, with no eye hole. Lace cut-outs fill costume and hair, never the face. [obs: https://upload.wikimedia.org/wikipedia/commons/b/b1/Lotte_Reiniger_Prinz_Achmed_001.jpg and the 002–004 stills beside it]
- **Emotion:**
  - "A study of natural movement is very important, so that the little figures appear to move just as men and women and animals do." [src: BFI, above]
  - The hands and spine carry feeling: raised open palms for astonishment or refusal, a bowed head with reaching hands for tenderness [obs: stills 001 and 002].
- **Take:**
  - Move the head before the face. A few degrees of tilt and a dipped chin do half the work of ashamed, tender and troubled.
  - Circle hands that act: raised palms for astonished, hands joined low for ashamed or tender, a hand near the chin for troubled.
  - The head's outline as a mark: design each person's profile once, and never change it.
  - One outline width from long shot to close-up, the problem her sized figures solved.
- **Never take:**
  - All-black faces.
  - Lavater's physiognomy, to which Apollo ties her, where "the outline of the face was the most reliable indicator of character" [src: Apollo, above]. A sharp nose must never mean a wicked heart.
  - Talon fingers.

### Michel Ocelot (Princes et Princesses, 2000; Kirikou, 1998; Les Contes de la nuit, 2011)

- **Construction:**
  - « Tout plat et on n'a pas honte d'être tout plat, parce qu'on joue. » (All flat, and not ashamed of it, because we're playing.) He filmed « des bouts de papier » (bits of paper) frame by frame on a light table. [src: https://guide.benshi.fr/news/entretien-avec-michel-ocelot/43]
  - He took the Egyptian pose, « la tête et les jambes placées de profil et le torse vu de face » (head and legs in profile, torso from the front). Later, digitally, he used « des éléments plats, des pantins articulés » (flat pieces, jointed puppets). [src: https://www.cnc.fr/cinema/actualites/lart-des-contes-animes-selon-michel-ocelot_1816418]
  - His silhouette films keep "a rigid use, excepting brief transitions between them, of the side-on, straight-on and ¾ viewpoints" [src: https://en.wikipedia.org/wiki/Michel_Ocelot].
  - In Tales of the Night, a black profile head carries one light almond eye with a pointed inner corner, halfway up and set back from the edge. The lips are cut into the profile. [obs: https://www.michelocelot.fr/images/films_images/les_contes_de_la_nuit/CDN-Elue-Lajoliefille_md.jpg]
  - Kirikou is drawn, not cut: the eye whites are the brightest value, with round dark pupils [obs: https://www.michelocelot.fr/images/films_images/kirikou_et_la_sorciere/KS-JesuisKirikou_md.jpg].
- **Emotion:**
  - In "The Kiss", two profiles touch noses; the feeling is in the lean and the gap [obs: https://www.michelocelot.fr/images/films_images/princes_et_princesses/PP-PrinceetPrincesse_md.jpg].
  - A narrower eye reads stern, and a rounder almond gentle [obs: the Tales of the Night still].
  - A whole crowd turns its pupils up at Kirikou: shared astonishment, with nothing else changed [obs: the Kirikou still].
- **Take:**
  - One pale eye in a strong head shape is enough. Scale it in height and turn its inner corner to move from stern to tender (Kit C's almond).
  - Three head views (side, front and three-quarter), each with its own placements, snapped between.
  - Staging with gaze: bystanders' pupils aim at the event, and a crowd turning its eyes is itself an expression.
  - Under-animate, and trust the viewer and the narrator.
- **Never take:** black silhouettes with grey eyes. The cast has skin hues.

### Yuri Norstein (Hedgehog in the Fog, 1975)

- **Construction:**
  - Francesca Yarbusova drew the hero in one line, and he at once gained "inner clarity". His eyes, paws and bundle were made separately and attached. [src, in Russian: https://ru.wikipedia.org/wiki/%D0%81%D0%B6%D0%B8%D0%BA_%D0%B2_%D1%82%D1%83%D0%BC%D0%B0%D0%BD%D0%B5]
  - An essay on the film: Norstein cuts "the individual body parts of his characters, one for every possible expression and articulation" [src: https://nccastaff.bournemouth.ac.uk/newhome/staff/cmoore/Myweb9/stillmov2/essays/hedgehog/hedgehog.htm].
  - Two small eyes sit close together at the top of a long pale muzzle, each about an eighth of the head wide. Each dark pupil sits high over a thin pale crescent, and the nose is a dark dot. [obs: the still in https://animationobsessive.substack.com/p/a-guide-to-yuri-norstein-hedgehog]
- **Emotion:**
  - The high pupil over its crescent is the hedgehog's lasting look of wonder and worry [obs].
  - "Norstein doesn't exaggerate to the extreme, to develop an emotion." "Observing a gesture at the smallest possible resolution." [src: the essay, above]
  - Rhythmic contrasts and the music carry his changes of mood [src: ru.wikipedia, above].
- **Take:**
  - Pupil height in a fixed white as a dial: high for wonder or worry, centred at rest, low for ashamed or tender.
  - Eyes in their own group, so the head can tilt while the gaze holds its target (face-study § How an eye is built).
  - For the baby and the child: small eyes, high pupils and slow blinks read innocent and attentive.
  - Capped extremes. A long hold, one small move and the score carry a change of mood.
- **Never take:** layered paint texture and fog blur.

### Terry Gilliam (Monty Python's Flying Circus, 1969–74)

- **Construction:**
  - "To make a character "talk", he just moved the lower jaw up and down." [src: https://www.lambiek.net/artists/g/gilliam_tery.htm]
  - "Each character has to be cut into multiple parts so they can move." [src: https://www.pixartprinting.co.uk/blog/terry-gilliams-unusual-animated-collages/]
  - Cutters "rim the edges with the black marker to prevent white 'flares'" [src: https://davidgoodwinmasters.wordpress.com/2021/11/11/monty-python-terry-gillams-cutout-animation/]. An ink rim hides the seams.
- **Emotion:**
  - Gilliam: "The whole point of animation to me is to tell a story, make a joke, express an idea." "The technique itself doesn't really matter." [src: https://www.openculture.com/2020/11/terry-gilliam-reveals-the-secrets-of-monty-python-animations-a-1974-how-to-guide.html]
  - Open Culture's summary of his advice: "Graceful, elegant movement à la Walt Disney is damned near impossible." "Swift, sudden movements, on the other hand, are much simpler." [src: https://www.openculture.com/2014/07/terry-gilliam-reveals-the-secrets-of-monty-python-animations.html]
- **Take:**
  - Snap, then hold: reach a new face in 2–4 frames, then hold it with at most a blink.
  - An ink rim on every face piece, so pieces overlap and turn without seams.
  - An "oh" held still for astonished, never flapped.
- **Never take:**
  - Photo-collage faces and grotesque surrealism.
  - A flapping jaw: it promises speech, and the cast never speaks.
  - Motion that is "deliberately jerky and unconvincing" [src: Lambiek, above] as a comic manner.

### Peppa Pig (Astley Baker Davies, 2004–)

- **Construction:**
  - "Peppa Pig is animated using CelAction2D." [src: https://en.wikipedia.org/wiki/Peppa_Pig]
  - Heads are in profile with the snout forward. Both eyes sit side by side on the visible side, white circles with black dots, with a darker cheek circle and a small mouth arc. [obs: https://upload.wikimedia.org/wikipedia/en/b/bf/Peppa_Bicycles.png]
  - The family share one kit and differ in size, colour and clothes [obs; partly mem].
- **Emotion:** "The characters blush when embarrassed and display happiness, irritation, or bewilderment." [src: Wikipedia, above]
- **Take:**
  - Blush as the cheeks' opacity, rising for ashamed (with the head down and the gaze low) and briefly for glad and tender.
  - One face kit for the whole cast, varied only by numbers.
- **Never take:**
  - Two eyes on one side of a profile head.
  - A scarlet flush, for shame or for anger.

### Smallfilms (Oliver Postgate and Peter Firmin: Ivor the Engine, 1959; Noggin the Nog, 1959–)

- **Construction:**
  - "Peter Firmin's beautiful watercolor painted cardboard cut-outs" [src: https://blog.animationstudies.org/recollecting-ivor-the-engine-1959/], their limbs attached "with tiny pieces of sticky-tape and cotton" [src: https://canterburymuseums.co.uk/collections/the-beaney/the-smallfilms-gallery/ivor-the-engine/].
  - "The appearance of the characters was influenced by that of the Lewis chessmen" [src: https://en.wikipedia.org/wiki/Noggin_the_Nog].
  - The chessmen have big round eyes set high, a long straight nose and a short down-turned mouth, and the beard is the lower face. The queen holds her open hand to her cheek. [obs: https://upload.wikimedia.org/wikipedia/commons/1/1c/NMSLewisChessmen28.jpg]
- **Emotion:**
  - "Postgate wrote the scripts, narrated the stories and animated the character" [src: animationstudies, above].
  - Noggin is "more static in animation", with "loads of silence" beside the narration [src: https://the-avocado.org/2017/11/14/animated-spotlight-smallfilms/].
  - The queen's hand on her cheek reads as sorrow while her face barely changes [obs].
- **Take:**
  - A hand at the face as an expression piece: at the cheek for grief, at the mouth for astonished, at the chest for tender.
  - Still figures under the narration, faces that change on its beats, and room for silence.
- **Never take:**
  - The chessmen's bulging stare on everyone.
  - Watercolour texture and wobbly taped joints.

### South Park (1992 paper shorts, then the show)

- **Construction:**
  - The 1992 short was "created with construction paper and filmed with an old 8 mm film camera" [src: https://en.wikipedia.org/wiki/The_Spirit_of_Christmas_(short_films)].
  - The paper was later scanned, and "most of the animation is done in Maya" [src: https://www.southparkstudios.com/news/712d55/faq-do-you-still-use-construction-paper-to-animate-the-show]. "they move the characters and props every 2 frames" [src: https://www.southparkstudios.com/news/78zs1w/fan-question-do-you-hand-draw-every-scene].
- **Take:** the proof that a paper look survives software when its tells are kept: flat pieces, hard cut edges and stepped timing.
- **Never take:** any of its marks. They carry its crude satire, which has made Jesus a comic character since that first short (the still is named "Jesus vs. Frosty" [obs]).

## BibleProject (our house reference)

- **Construction.** Each series has its own studio and its own faces:
  - **Faithful (HCLu, 2021):** "faces are one brow line and closed-eye strokes, no mouth", with disc hands.
  - **Hebrews and Galatians (2015–16):** "small comic ink characters with strong brows and dot eyes".
  - **Justice (A14T, 2017):** featureless grey beans, "round heads with a cross guideline for facing and no features".
  - **Desire (2026):** "detailed hatched ink faces".
  - **Agape:** mid-century figures with big noses.
  - **Redemption:** faces stay hidden until "home".

  [src: [bibleproject-tone-art.md](bibleproject-tone-art.md) § The looks; [director-vision.md](director-vision.md) #18]

- **Emotion:** "Emotion by posture only" in Justice: hands on hips, a hand to the chin, curled on the steps, a bowed head.
- **Take:**
  - The range itself: a face can be anything from no marks to a brow and dots and still carry a film, if the body acts.
  - The brow line as the first mark.
  - Faces kept small or hidden in the problem, with the close-up kept for the answer.
- **Never take:**
  - Hatched ink faces (inner lines).
  - The riso collage's pinks.
  - Faces so small in close-ups that a turn cannot read (CRAFT rule 5 wants a face at a third of the frame once a beat).

## From the sources to the kits

The sources behind each kit in [face-study.md](face-study.md) §3:

| Kit               | Its sources                                                                    | What they show                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| A, "Three marks"  | Hergé, Bruna, Florence, Paper Mario, Kurzgesagt, BibleProject's ink characters | dot eyes and brows carry a whole film when the body acts; a lid cutting a dot reads weary or set; degrees read |
| B, "Rim"          | RimWorld's face mods, Night in the Woods, Klei, Hey Duggee's peaks             | whites, pupils, lids, brows and a few mouths, moved by mood and by numbers                                     |
| C, "Side-eye"     | Klassen, Haughton, Norstein, Ocelot                                            | a light field and a moving pupil carry a story with no brows and little mouth                                  |
| D, "Paper pieces" | Cartoon Saloon, Carle, Lionni, Keats, Tearaway, Reiniger                       | an eye laid in cut layers, lids of cut paper, and hand-cut variety                                             |

What nearly every source agrees on:

1. **The gaze is the cheapest strong expression.** A pupil moving inside a light field does most of the acting (Klassen, Haughton, Norstein, Ocelot, Night in the Woods).
2. **One change per beat, snapped and held** (Klassen, Bruna, Gilliam, Norstein).
3. **Lids and closed eyes need no new drawing.** Cut, squash or refill the eye (Klassen, Lionni, Kurzgesagt, Blair, Cartoon Saloon).
4. **The body carries as much as the face:** the tilt, the gaze's target, the hands, a turned back, a group (Reiniger, Ocelot, Florence, Jeffers, Lionni, Bruna, Smallfilms).
5. **Detail follows the shot.** Two dots in a wide shot, the full kit close (Keats, Haughton, Hey Duggee).
6. **An eye field need not be white.** Haughton's yellow crab eyes and Carle's yellow tissue are precedent for our cream whites.
7. **No face caricatures a people** (Hergé, through his critics).
