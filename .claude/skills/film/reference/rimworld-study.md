# RimWorld in-game art: a study for the paper-cut look

Owner, 2026-10-13: "for paper cut art direction, maybe we can look at rimworld's ingame art style". Owner rulings received while this was written: **"outlines can be black, shading !== outlining"**, and **"dont worry about camera, just art direction"**. So this study covers figure construction, line, shape, colour, shading, texture, motion and charm. It does not cover the camera or top-down framing.

Evidence labels: **[src]** is a cited page. **[code]** is a decompiled RimWorld alpha (ILSpy, last pushed 2018; `github.com/josh-m/RW-Decompile`) or vanilla defs as copied in a modding-template repo, so the numbers may have drifted in 1.5; the faces bullet reads a 1.6 decompile (`github.com/32bitx64bit/RW-Decompiled-1.6`). **[obs]** is what a cited image shows. **[mem]** is from memory or inferred, not verified here. Two GitHub "vanilla texture" copies I sampled turned out to be other games' anime-style art, so no pixel measurements of vanilla sprites appear below.

The faces, the style's name and the face mods are studied further in [face-study.md](face-study.md), with the face kits they led to; the wider art library is [prior-art.md](prior-art.md).

## 1. What RimWorld does

### Why the style exists

- Ludeon's 2013 brief: the art "has to convey a lot of complex gameplay information in a really intuitive way". It "has to balance abstraction with specificity". "If it's too specific, it fills in too many gaps so players have no room to subconsciously interpret." And: "We'd rather have 100 kinds of characters with 3 frames of animation each than 3 characters with a hundred frames each." They kept "the vector look because it satisfies RimWorld's design constraints very well." [src: https://ludeon.com/blog/2013/12/rhopunzel-in-the-house/]
- Tynan Sylvester, by email: "be clear about what's happening, be very cheap to create, don't be ugly, don't overwhelm with details, and be abstract enough for players to make their own interpretation." He calls the style a "solution to a problem". [src: https://hickmandesign.co.uk/blog/history/art-behind-gameplay-journey-video-game-visual-styles/]
- The style follows Prison Architect's (Introversion, 2012; art by Ryan Sumo). Tynan, 2013: "I drew some inspiration from PA." "But they do look somewhat similar; that's my fault." "I'm not a good enough artist to come up with a really good original look." "We don't share any tools." The in-game art is by Rhopunzel (Rho Watson); Ricardo Tomé painted the storytellers' portraits and the key art. [src: https://en.wikipedia.org/wiki/RimWorld and its note 32 (Ludeon forums, 2013-09-16); http://ryansumo.blogspot.com/2012/01/on-introversion-and-prison-architect.html; https://ludeon.com/blog/2014/01/cassandra-portrait/; the Rhopunzel post above]

### Pawn construction

- **Parts, not a puppet.** A humanlike pawn is drawn as layered flat meshes: body, head (placed at the body type's head offset for each facing), hair, apparel and headgear layers, then the equipment. It has no arms, hands or legs. [code: `Verse/PawnRenderer.cs` RenderPawnInternal, BaseHeadOffsetAt]
- **Four facings from three drawings.** Textures are `_north`, `_east`, `_south`; west mirrors east when no `_west` exists. [code: `Verse/Graphic_Multi.cs`; src: https://rimworldwiki.com/wiki/Modding_Tutorials/Textures]. Turning is a swap of drawings, not a tween [mem].
- **Five body types** (male, female, thin, fat, hulk). Each apparel piece is drawn once for each body type, 15+1 textures in all. [src: Mod Textures page]. Head shapes come in a few variants (average or narrow × normal, pointy or wide) [mem, from vanilla file names].
- **Held things float.** An idle weapon sits at a fixed offset from the body's root, angled at 143° (217° facing west). A weapon in use sits 0.4 tile out along the aim angle and rotates to the target. The item does the pointing, and no arm is drawn. [code: PawnRenderer.DrawEquipment]. Mods such as "Show Me Your Hands" exist to add hands. [src: https://rimworldbase.com/show-me-your-hands-mod/]
- **Faces.** Vanilla heads have eyes and nothing else. From the front, a head has two small dark eye shapes with a tiny highlight; from the side, it has one. Female heads add small lash flicks. There is no mouth, brow or nose. [obs: the wiki's head textures, e.g. https://rimworldwiki.com/images/thumb/0/0f/Male_Average_Normal_south.png/120px-Male_Average_Normal_south.png; a 2013 Ludeon screenshot shows the same dot eyes, https://ludeon.com/blog/wp-content/uploads/2013/12/ss-2013-12-10-at-06.22.34.jpg]
  - In 1.6, the eyes are render nodes anchored on the head (for blinks and eye genes), and their size follows the life stage. A baby's eyes are 0.7 of an adult's in a head 0.5 the size, so against its head they are 1.4× larger. [code: 1.6 decompile; vanilla LifeStages.xml]
  - Ideology (2021) adds beards and face tattoos. Biotech (2022) adds genes for eye colour, ears, a heavy brow, a heavy jaw and a gaunt head. [src: https://rimworldwiki.com/wiki/Genes]
  - Mouths, brows, lids and blinks come only from mods. The largest, [NL] Facial Animation, has 804k subscribers. [src: https://steamcommunity.com/sharedfiles/filedetails/?id=1635901197]
  - An earlier draft of this study said vanilla heads had no eyes [mem]; that was wrong.
  - The head is large against the body, about as wide as the torso [mem].
- **State without a face.**
  - **Downed:** the same sprites rotate to a random 45–135° (or that plus 180°). An awake downed pawn wiggles about 0.35° a tick on a 300-tick cycle, and an "incapacitated" icon puffs up every 200 ticks. [code: `Verse/PawnDownedWiggler.cs`]
  - **In bed:** the bed can hide the body, leaving only the head. [code: `bed_showSleeperBody`]
  - **Mood:** shown as small bubbles, good or bad, carrying an icon, attached over the pawn (the mote maker's mood-thought bubble). Social interactions get symbol bubbles. [code: `RimWorld/MoteMaker.cs`]

### Line and shape

- **Outlines.** Story-relevant things (pawns, items, walls) get a thick, solid **black** outline, "2px of thickness per 64px of tile resolution". Pawns get a thicker one than items. Plants get a **green** outline or none, "so characters stand out in a field of trees". [src: https://spdskatr.github.io/RWModdingResources/artstyle.html; Mod Textures page]
- **Few interior lines.** "Use very few or no black inner lines; show form through shading or colour differences instead." [src: artstyle guide]
- **Detail floor.** "Detail narrower than 3 pixels is wasted unless it has strong colour contrast." The graphics are "abstract icons that leave room for the player's imagination". [src: artstyle guide]
- **Scale.** Vanilla art is 64 pixels per tile; the newer DLC uses 128. [src: Mod Textures page]
- **Silhouettes.** Pawns are chunky capsules and ovals with rounded corners, and nothing pointy or thin [mem].
- **The storyteller portraits (Tomé)** follow a separate register from the sprites:
  - the exterior outline is "very thick compared to the interior lines";
  - cel shading with hard edges;
  - "Pure black is never used for shadows";
  - hatching instead of an even darker fill in the deepest shade.

  [src: https://rimworldwiki.com/wiki/User:Paintsimmon/Storyteller_art (fan guide)]

### Colour and shading

- **One tint per texture.** Most textures are greyscale, and the game tints them by a multiply fill. A mask decides where the tint lands: red takes the primary colour, green the secondary, black stays untinted. [src: https://github.com/seraphile/rimshare/wiki/Colouring-in-Images; Mod Textures page]
- **Colour comes from material.** Apparel colour comes from the material it is made of [mem]. So identity is mostly colour on a shared shape: one sprite, endless recolours.
- **Form shading inside a sprite is a soft value step on the greyscale,** so after the tint the shaded side is a darker copy of the same hue [mem]. This is exactly what our CRAFT 12 forbids.
- **Sun shadows are tinted, not black.**
  - Shadows "change color slightly to complement the color of the sky" and "fade in and out based on time of day". People and small objects cast them as well as buildings. [src: https://ludeon.com/blog/2013/08/sun-shadows/]
  - They are drawn by stretching only an object's bottom and side edge vertices along one global sun vector; the vertex alpha sets each object's apparent height. [same post; code: `Verse/SectionLayer_SunShadows.cs`]
  - The shadow material's colour is the weather's `shadow` colour, lerped from white by the sun's strength. [code: `Verse/SkyManager.cs`]
  - Clear weather has a day shadow of **(0.718, 0.745, 0.757)**: blue-leaning under a white sky. Its dusk shadow is **(0.955, 0.886, 0.914)**: rose-violet under an orange sky (0.858, 0.650, 0.423). [code: vanilla `Clear` as copied in `RimWorldMod/RimworldModdingFiles/Defs/WeatherDefs/Examples.xml`]
- **Saturation follows the weather.** It is 1.25 on a clear day and 0.9 in other weathers, so the world's saturation is a mood dial. [same defs]

### Motion

- **Pawns slide.** Their position is spring-tweened tile to tile (tightness 0.09), with no walk cycle [code: `Verse/PawnTweener.cs`]. The motion is honest about being cut-outs, and nobody minds [mem].
- **Life comes from whole-body impulses and small effects, not limbs:**
  - a melee attack lunges the whole sprite 0.5 tile at the target;
  - a hit knocks it 0.17 tile along the blow, capped at 0.35, decaying 0.018 a tick [code: `Verse/JitterHandler.cs`, `Pawn_DrawTracker.cs`];
  - a hit flashes the pawn for 16 ticks [code: `Verse/DamageFlasher.cs`];
  - footprints every 0.632 tile in snow and mud, and breath puffs every 320 ticks in the cold [code: PawnFootprintMaker, PawnBreathMoteMaker].

### Why it works (synthesis, [mem] where not quoted)

- **Restraint gives charm.** A blank, armless bean is a vessel, and the player's imagination fills the face ("room to subconsciously interpret").
- **Variety beats detail.** Swapping parts (body, head, hair, apparel) and recolouring them gives endless distinct people from a small kit, so no crowd is ever cloned.
- **Hierarchy by line.** Black outlines mark what matters and green or no outline sinks the world, so the eye finds people first at any size.
- **Physical effects are cheap and readable.** Shadows, impulses, a tilt and a flash do the acting that limbs would cost hundreds of frames to do.

## 2. Transferable rules for the paper-cut figures

1. **Outline by story weight.** The figures carry the heaviest line in the frame. Props that act in the beat (the ledger, the gavel, the stamp) carry a lighter one. Scenery carries none, or its own paper's shade, like RimWorld's green plant outline.
   - _Map:_ the stroke width per piece in `packages/film/src/style/rig/parts.ts`, ranked figure > acting prop > scenery.
   - _Fit:_ this sharpens CRAFT 12's "scenery has no outline". It exposes the bench's inked panel lines in the current stills: the bench is scenery, yet it is lined like a figure.
2. **Outer line heavy, inner lines thin and few.**
   - The silhouette's outline is about 2–3× the weight of the face's marks. Nothing else inside is drawn as a line; form is the crease, not ink.
   - _Map:_ §11 rule 1 already says "no inner lines but the face's". The change is the ratio. Today the outer line is 3 units, and RimWorld's ratio suggests roughly 2–3 % of the figure's height [mem/inferred from 2px per 64 ppt on a pawn about 1.2 tiles tall].
   - _Fit:_ this matches the design language's "outer lines are heavier than inner ones", and its numbers are a trial (§5).
3. **A figure is a few parts; the pose lives in the parts' placement.** Head, body and two hand circles are separate pieces. A pose is where they sit and how they tilt, never a new drawing.
   - _Map:_ §11 rules 4 and 9.
   - _Fit:_ this is RimWorld's head-on-a-body at a fixed offset with floating equipment. Our circle hands with no arm are the same idea one step further: the hand floats, as RimWorld's weapon does.
4. **The held thing points, not the arm.** A prop rides a hand circle, at an offset from the body's root, rotated toward what it acts on: the gavel toward the bench, a scroll toward the reader.
   - _Map:_ the hand circle's reach arc, plus a rotation on the held prop toward its target.
   - _Fit:_ full fit with "no arm, ever".
5. **Variety by swapping parts and recolouring, never by drawing a new person.**
   - Keep a small body-type set, about 4–5 silhouettes (slight, broad, tall, child, elder), a few head shapes and a few hats or hair, plus the garment tint from a ramp.
   - _Map:_ Rive solo groups chosen by view-model numbers, and garment colours bound from the palette ramps.
   - _Fit:_ this gives CRAFT 12's "a crowd is never cloned" a mechanism, and §11 rule 9 ("a new figure adds a silhouette, not parts") holds.
6. **Grey paper plus one masked garment colour.** The base figure stays neutral paper, and identity is one masked region (robe, sash, mantle) drawn from a ramp.
   - _Fit:_ this tensions with the palette rules (see §3, conflict C).
7. **Act with the whole body first.** Every strong beat has a whole-figure impulse:
   - a recoil or a hop of a few percent of the figure's height, decaying linearly over about 0.3–0.5 s;
   - a lean or a tilt;
   - lying is the same pieces rotated.

   The face confirms the beat; it does not carry it alone.
   - _Map:_ a `jolt` timeline or view-model offset on the root bone; the host sets it on the cue (§11 rule 8).
   - _Fit:_ this matches director-vision's "emotion is in posture first, the face second", and it guards the spec's risk 3 (expression lost to minimalism).

8. **Travel by a glide, not a walk cycle.** A figure crossing the frame slides with an eased spring and at most a small step-bob. Its life comes from the breath, the hands' arcs and the contact shadow travelling with it.
   - _Fit:_ this fits paper-theatre puppetry and our "kit owns the reach" arcs. The owner judges whether a step-bob reads as paper or as a game.
9. **The shadow is the light's colour, from one shared vector.**
   - One light direction and one shadow colour per scene, from the scene's light: cool under a warm key, rose-violet under a sunset key. Every contact or lift shadow is that colour, stretched away from the light by each piece's height.
   - _Map:_ §11 rule 3 and the 4a ramps; the shade swatch comes from the scene's key, not from each piece.
   - _Fit:_ RimWorld independently confirms the owner's "shade with colour". Its shadows "complement the color of the sky", and our rule goes further in saturation.
10. **Turn by swapping facings, not by rotating.** A figure has a front, a side (mirrored for the other side) and a back. A turn is a one-frame swap on a cue, with the features sliding only for gaze (§11 rule 6).
    - _Map:_ a solo of facings per piece in Rive.
    - _Fit:_ this is how cut-out puppets turn (Reiniger), and it keeps the parts few.
11. **Detail floor.** No mark is thinner than about 1/40 of the figure's height unless it is ink on paper; anything finer vanishes in a wide.
    - _Fit:_ this agrees with "simplicity is the budget" and gives it a number to check in a quarter-size thumbnail [inferred from the 3px-per-64 floor].

## 3. Conflicts to settle (owner)

- **A. Outline colour.** Settled by the owner: shading is not outlining, so black or near-black outlines are allowed, and the colour-outline workaround is dropped.
  - What remains is a choice on merit: RimWorld's pure black against our warm ink `#2b2622`. At film size they read the same, and the warm ink sits better on parchment.
  - Proposal: keep `#2b2622` and test pure black only as variant B in the trial.
- **B. Outline weight against the paper edge.** A heavy dark outline turns a cut-out into a sticker. Real cut paper has no ink line, and director-vision gives a cut piece "a clean edge with a 1–2 px light core".
  - Proposal: heavier outer line on figures only, with the light core kept inside it, so the edge still reads as a cut sheet.
  - The owner decides from stills whether it stays paper.
- **C. Colour variety against three accents.** RimWorld gets identity from free recolouring. Ours holds every non-accent at saturation 0.2–0.35, with scarlet only for sin and white only for the robe.
  - Proposal: vary identity by hue and value inside the 0.2–0.35 band (and by silhouette, rule 5), never with a fourth accent.
- **D. Head proportion.** RimWorld's head is about as wide as the torso. Our design language says the head is about ¼ of the body's height; the current accused is nearer ⅓.
  - A bigger head helps a minimal face read in a wide. Settled: the owner's K1 pick (2026-10-13) makes the head about ⅓ of the figure's height.
- **E. In-sprite shading.** RimWorld shades a sprite's form by value (greyscale under a tint) [mem]. We take its tinted shadows and leave its value-shaded fills. This is not a real conflict, only a note that RimWorld is not a model for form shading.

## 4. What not to take

- **Game UI on the figure:**
  - mood and interaction bubbles with icons;
  - the "incapacitated" icon;
  - name labels, selection brackets, the damage flash.

  They are words or icons on the picture (CRAFT 1), and they tell emotion instead of acting it.

- **The near-blank face.** A mouthless head with dot eyes works for a sandbox where the player writes the story. The owner asked for "certain expressiveness", then for faces "more interesting — rimworld style", and our faces carry the turn ("astonished relief on 'righteous'"). Faces are minimal but characterful. **OWNER QUESTION:** which kit; the four are in [face-study.md](face-study.md) § The kits.
- **Interpretive ambiguity as a goal.** RimWorld wants room for the player to "make their own interpretation". Our figures can be everyman ("you"), but the meaning cannot be left open: the doctrine is source-checked. Abstraction is for the person, not the message.
- **The tone.** RimWorld leans on gore, harsh comedy, flailing downed pawns and organ harvesting [mem]. A Scripture film keeps its blows off-body: no wound flashes, no knockback played for laughs, and a fallen figure lies still, not twitching.
- **Art as a cheap placeholder.** RimWorld's look began as a borrowed stand-in. Our rule is art direction over speed, so take the restraint, not the excuse.
- **Pure-black blob shadows and grey in-sprite shading.** Both are covered by CRAFT 12.

## 5. A five-step trial (one figure pass in Rive)

1. **Baseline.** Copy `stills/papercut/` to `stills/papercut-prerim/`. Use the same six timestamps (4.00, 5.40, 6.60, 8.00, 8.27, 9.00) for every variant.
2. **Line hierarchy (rules 1, 2, 11).** In `packages/film/src/style/rig/parts.ts`, raise the accused's and the judge's outer stroke to about 2.5× today's (to about 2.5 % of figure height), keep the face marks and hand circles' inner weight as they are, and keep the light core inside the edge.
   - Variant A: ink `#2b2622`. Variant B: pure black.
   - Strip the bench's panel ink, or drop it to the bench's own shade hue.
3. **Whole-body acting (rule 7).** Add a root-bone `jolt` driven by the host:
   - a small hop back on "righteous", about 4 % of height, decaying over 0.4 s;
   - a lean in on the judge's "looks at you".

   Rebuild `figures.riv` with 0 problems and no thumbs.

4. **Tinted shadow from the key (rule 9).** Apply the 4a ramps first. Then set every lift and contact shadow from one scene shade swatch, cool violet-blue under the court's warm key, and stretch it away from the light by the piece's lift.
5. **Compare.** Build a match sheet, baseline | A | B, at full size and again at quarter size (a thumbnail, RimWorld's readability-at-a-glance test).

"Better" to the eye means:

- (a) at quarter size, the eye lands on the figures before the bench or the "Righteous" strip;
- (b) with the face hidden (crop it), the beat still reads from the silhouette, the jolt and the lean;
- (c) at 1:1 the figure's edge still reads as cut paper, not a sticker, which is the owner's call on conflict B;
- (d) the shadows read as coloured paper, not dirt;
- (e) the accused's astonishment and fear stay distinct.

If (a) and (b) improve and (c) holds, fold rules 1, 2, 7 and 9 into §11; otherwise keep the line as it is and take only rules 7 and 9.
