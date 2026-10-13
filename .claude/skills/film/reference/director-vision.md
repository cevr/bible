# Director's vision: our explainer films

How a film looks, moves and sounds, and why. [CRAFT.md](../CRAFT.md) keeps the rules and governs the argument (text, quoting, registers, shape and tone); this file keeps the reasons and the numbers behind them. Craft never outranks the frame, and neither does this.

Numbers in brackets (#n) are findings in [longform-research.md](longform-research.md), measured or sourced on 2026-09-28. "Ours" is the first cut of `righteousness-by-faith` measured the same way (research #1, #2, #4, #6, #7).

## The page

**Logline.** _A paper theatre lit from behind._ Cut paper on layered glass, where the Bible's stories are staged as a small warm world. One warm voice walks the viewer through an argument while the camera drifts toward each turn. Gold, the word of God, is the only light that comes from inside things.

**Seven pillars**

1. **Paper you could hold.** Every shape shows it is paper in three places: at its edge (torn or cut), under it (a soft shadow on the sheet behind) and in its fibre (grain that travels with the object). No ink outline goes around scenery. _(Tearaway, Three Brothers, Paperman #25, #26, #28.)_
2. **Light is the argument.** Colour and light carry the doctrine:
   - **Gold** is God's word and gift.
   - **Scarlet** is sin.
   - **White** is the robe.
   - Nothing else glows.
   - Motifs pay off in light: the hollow stamp comes back solid, and the heart is lit from inside. _(Feinberg #36; BibleProject gives each series one accent #3; Ocelot backlight #23.)_
3. **Always breathing, never busy.** A take can be long, but nothing is still for more than about 4 s. The camera drifts, the planes slide, and one element moves on the word. We push in on the turn and hold still only at the landing. _(Ours: 79 % of seconds held against 20–35 % at BibleProject #1; Katz: the push is identification #34; LEMMiNO's continuous travel #15.)_
4. **Story is cut, idea is moved.** STORY scenes are cut like film: angle, reverse, close-up. An IDEA scene is one continuous travel over a single page. _(TED-Ed: 16 cuts a minute for story, 2.4 for idea #14; CRAFT rule 3.)_
5. **One valley, then dawn.** The film is hopeful on average, but it earns its dawn. One act goes down to dusk and the single black moment, then the light comes back. _(BibleProject uib2 and b54d, Lost Sheep #4, #12; Block #35.)_
6. **Hands and posture act; faces are minimal but characterful.** A face is a few marks moved by numbers, never a new drawing, and each person has one feature of their own. Emotion lives first in the tilt of the head, the shoulders and the open or closed hand; the face confirms it. **OWNER QUESTION:** the face kit, one of the four in [face-study.md](face-study.md). _(Hibon, Ocelot, Reiniger #23, #26; BibleProject Redemption hides faces until "home" #18; owner, 2026-10-13: faces "more interesting — rimworld style".)_
7. **The ear gets room.** The score is written to the picture and sits under the voice. Effects land on concrete nouns. Silence is placed on purpose. The landing is 25–35 s of music alone. Dead air never happens. _(BibleProject 8–9 % music alone and a 30–36 s landing #6, #8; Thom and Chion #39, #40.)_

---

## Look bible

### Palette logic

- **Three grounds, one per world:**
  - **parchment** (`paper` #eeddc8) for IDEA;
  - **chipboard and sky gradients** (`board` #ab8163 under 2–3-stop skies) for STORY;
  - **night** (#1b150d) only for the one black moment and at most one IDEA stretch.

  _(CRAFT 3 and 11; BibleProject tone-art.)_

- **Per scene, 4–6 hues plus the accents.** Choose them from the film's palette; don't invent new ones in a scene. The first film's palette has 33 swatches, so each scene declares its own subset. _(Wolfwalkers, Tearaway #24, #28.)_
- **Three accents, each with fixed meaning:**
  - **Gold** #e6b347: God's word, gift and verdict. Only gold emits light.
  - **Scarlet** #ce0914: sin, only ever on the person or the cloth that carries it.
  - **Robe white** #fcfefc.

  Saturation stays at 0.2–0.35 everywhere else, so an accent always reads as the loudest thing in frame. _(Measured: BibleProject 0.16–0.33, Lost Sheep 0.18–0.24; ours 0.25–0.34.)_

- **Values:**
  - the film's mean luma is 140–150;
  - the valley act runs 90–110;
  - 5 % of frames or fewer are darker than 60;
  - the cross is the only frame that is fully black.

  _(CRAFT 11, extended by the 2025–26 BibleProject dips #4. Ours is 177 and has no dip.)_

### Colour script per act

The acts are the explainer's shape, and each has a tent-pole frame to paint first. _(Romano #36.)_

| Act                 | Share of runtime | Light                                        | Target luma / saturation                | Tent pole                               |
| ------------------- | ---------------- | -------------------------------------------- | --------------------------------------- | --------------------------------------- |
| Cold open           | 0–6 %            | a cool, even page, a room without sun        | 150–165 / 0.15–0.2                      | the verdict stamp, hollow               |
| Problem             | 6–30 %           | peach afternoon toward dusk                  | 140 → 120 / 0.25                        | the mirror that shows the stain         |
| Answer (the valley) | 30–65 %          | sunset → the one black moment → dawn relight | 150 → 60 (cross) → 130 / rising to 0.35 | the cross silhouette; the loom in light |
| Power / life        | 65–82 %          | early gold morning, warm cream               | 150–160 / 0.3                           | the heart lit from inside               |
| Landing             | 82–100 %         | teal day, the opening's layout returned      | 150–165 / 0.35, the most saturated act  | the stamp landing solid                 |

The last row is the rule that the landing is both the most saturated and the calmest act. _(Eggleston #36; the Kurzgesagt, TED-Ed and LEMMiNO bookends #13, #15, #16.)_

### Paper, light, texture

- **Planes.** Every STORY shot has 3–5 planes, with parallax of about 1 : 3 : 7 from far to near. Depth comes from a haze veil between the planes (10–30 %), not from blur. _(Ocarina, Norstein #29, #31.)_
- **Shadow colour.** Shade with hue, not black (owner, 2026-10-12): a shadow is the light's complement, darker and as saturated or more (warm parchment under a warm key takes a dusky violet-blue shadow; a cool night page takes a warm one), and a highlight leans to the light's hue. A dimmed copy of the base, a grey, or an alpha-black layer reads dead and muddy; shifting hue keeps the paper luminous, as cut-paper and gouache work does. Each palette colour keeps a named ramp (shade, base, light), the shade a neighbouring hue.
- **Contact shadow.** Every cut-out casts a shadow on the sheet behind it, in the sheet's shade hue (above), not a darkened brown: offset 2–6 px, blur 4–12 px, alpha 15–30 %. Nearer planes cast longer, softer shadows (the engine's `raised()`). Figures standing on ground get a contact shadow at their feet. _(Tearaway, Three Brothers #26, #28.)_
- **Edges.**
  - Cut pieces (people, furniture) have a clean edge with a 1–2 px light core.
  - Torn pieces (earth, clouds, the paper of the world) have a 2–4 px fibrous white rim.
  - Choose cut or torn for what the piece means, never at random.
- **Ink.**
  - Ink is warm near-black by default (`outline` #2b2622), and black is allowed: the never-black rule is for shading, not lines (owner, 2026-10-13).
  - Draw ink only for features: eyes, brows, mouths, hand creases, the letters of a prop.
  - Figures may keep a thin outline. Scenery keeps none.
  - Outer lines are heavier than inner ones.
  - Line weight can carry mood: a softer, lighter line in the valley. _(Moore #24.)_
- **Grain.** Grain is fixed to each plane and moves with it: a 1–2 px fibre plus a 50–150 px mottle at ±3–6 %. The vignette is the only screen-space layer. _(Paperman, Three Brothers #25, #26.)_
- **Boil.** No full redraw boil on scenery. On figures, at most a slow crawl of about 0.3 px. _(Paperman "one line intact through time" #25.)_ This changes pixels in every frame, so it needs the owner's approval and before/after stills first.
- **Light.** One key direction per scene drives every shadow. Glory, sanctuary and night scenes are lit from behind: a warm glow behind the planes, with thin paper glowing. God's presence is light, never a drawn figure. _(Ocelot, Reiniger #21, #23.)_

### Type

- One serif family for the title, the word cards and the credits' name and author heads: cream or gold on a torn paper strip, never on a plate over the picture. The credits roll their sources in the body face, ink on their own torn strip at the frame's side, clear of the landing's picture.
- Words appear on screen only as CRAFT rule 1 allows. The chapter titles live in YouTube's chapter list, not in the frame.

### Figures, scale, hands and faces

- **One figure grammar.** Paper bean figures in the K1 look: a hue per garment, with the head about ⅓ of body height (owner, 2026-10-13). What each colour and role means, and every figure's sheet: [character-design.md](character-design.md).
  - The face is minimal but characterful: a few marks (eyes, brows, a mouth; lids and eye whites in the richer kits) moved by view-model numbers and bones, never redrawn for an expression. It carries eight expressions (rest, glad, troubled, set, astonished, ashamed, tender, angry) at five ages, and each cast member has one feature of their own. **OWNER QUESTION:** which kit. The four, from today's three marks sharpened to the RimWorld mods' whites and pupils, are specified in [face-study.md](face-study.md); the art they come from is in [prior-art.md](prior-art.md).
  - `browTilt` > 0 is the default (SKILL gotcha: flat brows read as cross).
- **Scale.**
  - In a wide, the lead figure is at least ¼ of frame height.
  - Once per beat, a face fills at least ⅓ of frame height (CRAFT 5).
  - A crowd varies silhouette, height and hat. Never clone.
- **Hands.**
  - **No arms: floating hands.** A figure's two hands float near its body, and no arm is ever drawn, close up or wide. At rest they float beside the body at hip height and bob with the breath, so a figure is never a handless pillar and a hand never pops in (hidden until acting, a figure at rest reads as a handless stub, and every action begins with a hand growing out of nothing). A lying figure folds them on its middle.
  - **A hand travels on an arc.** On its action's named cue (the kit's `far`/`near`, `{ to, reach: f.at('<cue>'), grip }`) it swings about the shoulder along a soft arc bowed away from the head, eased, and settles on arrival; never a straight lerp and never a pop. Give a travel at least 0.6 s.
  - **The kit owns the reach.** A person's hand works within its reach (the kit's radius about the shoulder, scaled with the build); a target past it is a staging fault, not a stretch. Bring the prop or the figure closer.
  - **One hand at every scale, by the look.** In the paper-cut look that Rive draws, a hand is a plain circle of the figure's paper with no thumb (owner, 2026-10-12), and its close-up waits for the owner's design. In the Canvas kit it is a mitten with a thumb (`@bible/film/canvas`'s `floatingHand`). Close up (`handCloseUp`), it is the open hand palm up seen from above (the palm the biggest shape, the fingers one round block, the thumb low along the side) and adds a lifeline and two soft joint lines; the figure's own hand turns palm up into that shape before a push into it (`turn`). The close-up has no forearm: the push grows the figure's own hand into it and shrinks it back onto the hand.
  - **The kit owns draw order.** A far hand working in front of the body is drawn over it; at rest and anywhere else it tucks behind. `film check` warns `HandHidden` for a hand at work lost inside its own body, `HandJump` for a hand that moves more than 1.5 of its length, or changes size by a quarter, in one frame, and `HandFar` for a hand sent past its figure's reach.
  - A big insert of a hand (the "hand that takes hold") is a close-up of that figure's hand: push to it from the figure's hand, then match back. It is never a prop that floats in from nowhere. _(Hibon: "the hands do so much of the talking" #26.)_
- **Faces, staging and emotion.**
  - Use profile or three-quarter for dialogue.
  - Keep faces hidden or small in the problem, and give the close-up to the answer. _(BibleProject Redemption #18.)_
  - Emotion is in posture first, the face second.

## Paper-cut figures (Rive)

The films' people when Rive draws them (owner, 2026-10-12: "circles with no thumbs", "certain expressiveness, but keep its simplicity in minimalism"). The court of `cold-studies` is the reference: `style=papercut` (Canvas 2D) and `style=papercutgl` (WebGL 2). Every figure is generated from one set of parts, `apps/animations/src/films/cold-studies/looks/rive/parts.ts`, into one `.riv`; a rig adds only its own silhouette, bones and timelines. RimWorld's pawns (`apps/animations/docs/rimworld-study.md`) shaped rules 1, 4, 8 and 9.

The study's four open questions are knobs, the four fields of one value, `DIRECTION` in `looks/rive/direction.ts`: the edge (A), the ink (B), colour (C) and the head's size (D). **Provisional (2026-10-13), pending the owner's pick:** they stand at K1, the rimproto recommendation: A3 (a thick outline with a light core inside it), B1 (warm ink), C2 (garment hues) and D2 (the head as drawn, about ⅓). Where a rule below names a value an axis sets, it gives K1's. `direction.test.ts` beside it checks K1 and each option with the other axes at K1 (not every combination): every crease's direction, every light core, every cast against the surface it falls on, the hands' one closed circle, and which pieces are lined and in what ink. Each of those directions is also built into a `.riv` where the Rive CLI is installed (the check skips the build where it is not), and there the committed `figures.riv` must equal the build of `DIRECTION`. So any pick is one edit and a rebuild.

The rules, in the order a figure is built:

1. **Silhouette first, and the line by story weight.** A figure is a few flat pieces of paper from the palette's ramps (`ramps.figure`, grey; under C2 its garment from `hues`), each a smooth closed outline in warm ink (`ramps.ink`, `outline` #2b2622; black is allowed, since an outline is not shading). The silhouette's line is the heaviest in the frame: under A3 it lies outside the paper (`OUTSIDE`, 6 units at the court's scale on the head and body, about 3 % of the accused's height, 5 on a hand or a leg), with the paper's light core (`CORE`, a unit a side, in the paper's ramp light: the cut catching the room, leaning to the key's warm hue) along the cut inside it, so the edge reads as cut paper, not a sticker; trim (a sash, a band) is lighter, and the face's marks lighter still (3–3.4, the kit's own), so the eye finds the people first even in a thumbnail. A prop acting in the beat is lined lighter than a figure, and scenery not at all. A pose reads from the silhouette alone: no inner lines but the face's, since form is the crease.
2. **The signature: the crease.** Every piece is creased once, by a straight line square to the one light (from the upper left, `LIGHT.toward` 0.42 rad), 63 % of the way across the piece; past it the paper is its ramp's shade (`ramps.figure.shade` on grey, the robe's on the robe, `ramps.scarlet.shade` on the sash), a hue of its own turned toward the key's complement (a violet-blue; CRAFT 12), never the paper dimmed. Under C2 the robe is `hues.robe`, one of three provisional ramps in `robes` (navy drawn; slate and violet kept for the owner). It is a hard stop in the paint, never a gradient or a drawn line, so it reads as a fold catching the light, the same in both engines. One angle for the whole cast: a crease that disagrees with its neighbour reads as a mistake.
3. **Lift.** Each piece casts a faint shadow away from the light, down and to the right (offset (3, 5) units at full lift; a piece lifts 0.1–0.35), in the shade of the surface it falls on. A piece that lies over others of its figure (`PieceLook.over`: a hand on the tunic, the judge's head on his robe and bands) lays one cast per surface, clipped to that surface and drawn just over it, and one more behind the figure in `ramps.paper.shade` where it falls on the sheet; a piece over nothing lays a single cast in `PieceLook.cast` (the parchment's shade, or the bench's under the judge's hand). It is soft in WebGL 2 and hard in Canvas 2D (Rive's Canvas 2D drops feathers). A standing figure's contact shadow is the host's (`ground`), so both engines lay the same one.
4. **Hands are circles.** A plain disc of the figure's paper, radius about a quarter of the head's (10 on the accused, 15 on the judge), creased and outlined like every piece. No thumb, no fingers, no arm. A hand floats beside the body with a visible gap at rest, and says what it does by where it sits and how it travels: on an arc round the shoulder (`reachAbout`), never on a straight line. Two hands together in front are a clasp; flung out and up is surprise. A held thing rides its hand and points at what it acts on: the prop turns, not an arm.
5. **The face is three marks.** Brows (short arched strokes), eyes (ink ovals) and a mouth (one line, or an open "oh"), on one kit every figure wears at its own scale (`faceKit`, the judge at 1.62). Expression is numbers, never new drawings: brow height and tilt (inner ends up is worry or hope; level and high is surprise), eye height and width (lids heavy for shame, round for astonishment), the mouth line's bend (smile, frown) or the "oh". Brows stay inside the head's outline.
6. **A flat face turns by its features.** Looking somewhere moves the eyes inside their sockets (3 units) and slides the features together a little toward the gaze (4 units), and the head stays round. A head tilt reads as a question, so a look-at turns the head only where the beat means it (the accused looking up at the verdict), never for a plain look. A body turns by swapping its facing (front, side mirrored for the other side, back) on a cue, never by rotating.
7. **The boil crawls.** On the film's twelve ticks a second each outline point wanders within about a unit of where it was cut (0.6–1), moving at most a fifth of that a tick (about 0.3 px at the court's camera), on a four-second loop: it never jumps. The face never boils.
8. **Acting is the host's, and the body acts first.** Rive never owns the clock: the host sets each timeline's time and each view-model number from the scene's cues (`face.ts`, `acted`), one expression per beat, each beat moving the face from where the last left it, on the cue it reads. Every strong beat has a whole-figure move the face confirms: the accused bows, flinches on the stamp and lifts; the judge leans in. The court: worry as the evidence falls, shame on "you did it", fear as the judge leans in, astonishment on "righteous", relief as the lift settles; the judge reads until he looks up at the accused, then softens on the verdict. A figure crossing the frame glides on an eased spring with its breath, not a walk cycle.
9. **Simplicity is the budget.** A new figure adds a silhouette and bones, not parts: a part the kit lacks goes in `parts.ts` for every figure. A crowd varies by swapping parts (silhouette, head, hat) and by its garment's hue (`hues`), its saturation inside the film's 0.2–0.35 band, never with a fourth accent. Nothing gets a highlight but the cut edge's core, no texture and no second crease, and no mark but ink is finer than about 1/40 of the figure's height.

## Camera and staging grammar

1. **Screen direction is doctrine.** Fix each role to a side for the whole film:
   - the accused stands screen-left;
   - the Advocate stands screen-right of them;
   - the bench and the light sit centre-high.

   Cross the line only once, on purpose, when the verdict turns. _(Katz #34.)_

2. **Move with a motive, one move per thought.** A push starts on the turn word and ends on the sentence's last stressed word. A move never starts mid-word. _(Murch: cut or move on the finished thought #33.)_
3. **Push in on the turn and on the narrator's question** (CRAFT 6), and on every quotation's speaker (CRAFT 5). Pull back to the three-icon layout at each "gift" (CRAFT 8).
4. **No shot is held for more than 4 s without motion** ([CRAFT rule 5](../CRAFT.md#5-human-scale) says what counts). Drift does not count, because a 1–3 % breath is too slow for the eye to read as a move: seen small, the frame still holds, and `HeldShare` measures exactly that. A held shot needs a move the viewer sees, one that carries a thought. _(Ours 79 % held; benchmarks 20–35 % #1.)_
5. **The camera sits still only on the landing's last line and on the cross.** Stillness is punctuation, so it has to be rare.
6. **Stage in depth before you cut.** Put the accuser in a far plane and Joshua in the near one, and rack between them with a plane slide rather than a cut. _(Katz #34.)_
7. **Match cuts carry callbacks.** A callback enters on a graphic match from the earlier scene: the same shape in the same place, with new content. The film's last image rhymes with its first. _(Kon #41, CRAFT 8, Lost Sheep #12.)_
8. **The landing merges IDEA into STORY and pulls back to scale.** The final move is a slow pull-out from the pair to their world. _(BibleProject, LEMMiNO #6, #15.)_

## Editing and pace

- **STORY:** 4–8 cuts a minute, median shot 6–10 s.
- **IDEA:** 1–3 cuts a minute, with continuous travel.
- **The film:** median shot 6–15 s, held seconds 40 % or less, motion runs covering at least 40 % of runtime. _(BibleProject 2.4–5.1 cuts a minute, 6–17 s, 46–71 % #1, #2, #14.)_
- **Cut on a sentence end or on a mark,** never mid-word.
- **Seams and pauses** stay as CRAFT rule 9 sets them.
- **Narration pace 150–165 wpm.** Ours measured 171, the top of the benchmark band, and the owner's own recording sets it. The script keeps room for this with 5–8 % fewer words per minute of film. _(#7.)_
- **Cold open.** The hook is at 0:00 and the question is asked by 0:20. No logo or title card comes before the hook. The title lands at 4–10 %. _(#9, #42, #52.)_
- **Chapters.** 4–6 YouTube chapters, each titled with the narrator's question that opens its act, in the viewer's words. _(#10, #43.)_

## Sound and silence

- **Score.** Each act gets a cue composed to the cut (ElevenLabs `music_v2`, composed to the cut in movements that each start at a scene), rising and falling with the colour script. The bed sits 17–20 dB under the voice, and the low end swells on the problem and the climax (CRAFT 10). _(Zhou and Kurzgesagt compose to picture #19, #40.)_
- **Effects land on the frame of the noun:** the gavel, the stamp, cloth, the loom, the serpent, rain (synchresis #39). Page sounds come only at register switches.
- **Silence has three designed places:**
  - about 1 s after the key quotation;
  - the black moment at the cross: music drops out and one low tone holds;
  - the held beat before the landing's last word (CRAFT 7 and 9).

  Anywhere else, some sound always plays: room tone and paper foley at the least.

- **Landing.** 25–35 s of music alone, credits and sources over the final pull-back, and the last 5–20 s left clear for end screens. _(BibleProject #6; YouTube #44.)_
- **Deliverables.** Dry voice and M&E stems for multi-language audio. _(#51.)_

## What we never do

- Typeset the narration anywhere but a full-screen card, or put a logo or title card before the hook. _(CRAFT 1; #52.)_
- Outline scenery in ink, boil scenery, or fix grain to the screen. _(#25, #26.)_
- Use pure black, except the cross; use more than three accents, or let anything but gold glow.
- Hold a picture still for more than 4 s while someone speaks. _(#1.)_
- Clone a crowd, float a giant hand in from nowhere, or mix hand designs.
- Draw an arm or a forearm, anywhere, at any scale. Move a hand in a straight lerp, pop it to a new place in one frame, or send it past its reach.
- Gild a joint or a hand: gold is the word.
- Draw God the Father as a figure. Show anything the topic's MUST NOT SAY-OR-SHOW forbids. _(frame.)_
- Leave dead air: silence below −60 dBFS that no one designed. End on a 3 s card.
- Trade the look for speed. Performance and reuse live in the framework; a pixel-moving change needs the owner's approval. _(Owner rule.)_
