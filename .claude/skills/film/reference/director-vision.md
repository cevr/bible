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
6. **Hands and posture act; faces stay simple.** Faces are a dot, a brow and a mouth. Emotion lives in the tilt of the head, the shoulders and the open or closed hand. _(Hibon, Ocelot, Reiniger #23, #26; BibleProject Redemption hides faces until "home" #18.)_
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
- **Contact shadow.** Every cut-out casts a warm shadow on the sheet behind it: offset 2–6 px, blur 4–12 px, alpha 15–30 %. Nearer planes cast longer, softer shadows (the engine's `raised()`). Figures standing on ground get a contact shadow at their feet. _(Tearaway, Three Brothers #26, #28.)_
- **Edges.**
  - Cut pieces (people, furniture) have a clean edge with a 1–2 px light core.
  - Torn pieces (earth, clouds, the paper of the world) have a 2–4 px fibrous white rim.
  - Choose cut or torn for what the piece means, never at random.
- **Ink.**
  - Use warm near-black (`outline` #2b2622 is right); never pure black.
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

- **One figure grammar.** Grey paper bean figures, with the head about ¼ of body height.
  - The face is two dot eyes, a brow line and a small mouth.
  - `browTilt` > 0 is the default (SKILL gotcha: flat brows read as cross).
- **Scale.**
  - In a wide, the lead figure is at least ¼ of frame height.
  - Once per beat, a face fills at least ⅓ of frame height (CRAFT 5).
  - A crowd varies silhouette, height and hat. Never clone.
- **Hands.**
  - **Arms appear only when a hand acts.** At rest a figure is an armless bean, its hands tucked in the garment. An arm is one tapered strip of the figure's paper, grown from inside the shoulder on its action's named cue and withdrawn after (the kit's `far`/`near` arm, `{ to, grow: f.at('<cue>'), grip }`). It has no elbow and bows to the gesture's side, down and away from the body.
  - **One hand at every scale.** A mitten with a thumb (`@bible/film/canvas`'s `arm`). Close up (`handCloseUp`), it adds three finger creases and a lifeline.
  - **A hand acting in front of the body is drawn over it.** The kit draws a far hand whose target lies across the garment's middle over the body; anywhere else a far arm sits behind it. `film check` warns `HandHidden` for a hand at work lost inside its own body, and `ArmPop` for an arm whose grow jumps more than 0.5 in one frame.
  - A big insert of a hand (the "hand that takes hold") is a close-up of that figure's hand: cut or push to it from the figure, then match back. It is never a prop that floats in from nowhere. _(Hibon: "the hands do so much of the talking" #26.)_
- **Faces, staging and emotion.**
  - Use profile or three-quarter for dialogue.
  - Keep faces hidden or small in the problem, and give the close-up to the answer. _(BibleProject Redemption #18.)_
  - Emotion is in posture first, the face second.

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

- **Score.** Each act gets a cue composed to the cut (ElevenLabs `music_v2` chunks aligned to the act starts), rising and falling with the colour script. The bed sits 17–20 dB under the voice, and the low end swells on the problem and the climax (CRAFT 10). _(Zhou and Kurzgesagt compose to picture #19, #40.)_
- **Effects land on the frame of the noun:** the gavel, the stamp, cloth, the loom, the serpent, rain (synchresis #39). Page sounds come only at register switches.
- **Silence has three designed places:**
  - about 1 s after the key quotation;
  - the black moment at the cross: music drops out and one low tone holds;
  - the held beat before the landing's last word (CRAFT 7 and 9).

  Anywhere else, some sound always plays: room tone and paper foley at the least.

- **Landing.** 25–35 s of music alone, credits and sources over the final pull-back, and the last 5–20 s left clear for end screens. _(BibleProject #6; YouTube #44.)_
- **Deliverables.** Dry voice and M&E stems for multi-language audio. _(#51.)_

## What we never do

- Typeset the narration, or put a logo or title card before the hook. _(CRAFT 1; #52.)_
- Outline scenery in ink, boil scenery, or fix grain to the screen. _(#25, #26.)_
- Use pure black, except the cross; use more than three accents, or let anything but gold glow.
- Hold a picture still for more than 4 s while someone speaks. _(#1.)_
- Clone a crowd, float a giant hand in from nowhere, or mix hand designs.
- Draw an arm with nothing to do, or pop an arm in or out in one frame.
- Gild a joint or a hand: gold is the word.
- Draw God the Father as a figure. Show anything the topic's MUST NOT SAY-OR-SHOW forbids. _(frame.)_
- Leave dead air: silence below −60 dBFS that no one designed. End on a 3 s card.
- Trade the look for speed. Performance and reuse live in the framework; a pixel-moving change needs the owner's approval. _(Owner rule.)_
