# Lessons

One entry per correction the owner made to the films' work: the day, his
words as he said them, where they are kept, what was wrong, why it went
wrong when the record says, and what now keeps it from happening again.

A guard is either code that catches the mistake (a check, a test, a
refusal, a match row: its file and the name it lives under), or "judgement
only", with why no code can hold it and the line of a skill, a rule file or
a production ledger that carries it. The owner's rule of 2026-10-09 sets the
line between them: what a film says (doctrine, quoting, tone, wording) is
guidance for the agent, never a lint, a test or a check ("we dont need to
encode these rules in codes or tests or lints, just for the skill guidance is
enough"). The guards here are visual and process checks only.

**After any owner revise, add his entry here, and its guard, before
redrawing** (`.claude/skills/film/SKILL.md`, "The lessons ledger").
`apps/animations/lessons.test.ts` holds every entry to its fields, every
guard's file to the name it cites, and every judgement to the line it
quotes.

The form of an entry, each field on its own line:

- **Date:** the day he said it (YYYY-MM-DD).
- **Said:** his words verbatim, in double quotes; or, when he chose without words, `chose:` and the option's words.
- **Source:** the ask, the note, the ledger or the memory that keeps it.
- **Wrong:** what the work did.
- **Cause:** why, when the record says; "Not recorded." when it does not.
- **Guard:** `` `file` `name` `` pairs (and the commit), or `judgement only: <why>. Carried by `file`: "<the line>"`.

## Process and tooling

### open-renders-after-render

- **Date:** 2026-09-25
- **Said:** "after rendering, use the open cli to open it so i can view it"
- **Source:** memory feedback_open_renders.md; apps/animations/plans/film-flow-audit.md #3
- **Wrong:** Renders were reported in text; the owner could not watch them.
- **Cause:** Not recorded.
- **Guard:** judgement only: opening a file on the owner's screen is an agent's step at the end of a render, not a property of the render. Carried by `.claude/skills/film/SKILL.md`: "On the Mac, `open` the MP4 too, so he can watch it at once"

### no-film-check-in-gate

- **Date:** 2026-09-27
- **Said:** "remove the film gate completely, not needed"
- **Source:** memory feedback_animations_gate_no_new_films.md
- **Wrong:** The agent put `film check` into the apps/animations gate.
- **Cause:** Not recorded.
- **Guard:** judgement only: the gate is what CI runs, and a rule about what it leaves out has no test that is not the gate itself. Carried by `.claude/skills/film/SKILL.md`: "`bun run check <film>` reviews it by hand, never in a gate"

### art-direction-over-speed

- **Date:** 2026-09-27
- **Said:** "the goal is to not sacrifice artistic merit and direction for performance either, but keep performance top of mind for sure"
- **Source:** memory feedback_art_direction_over_performance.md; apps/animations/plans/film-flow-audit.md #13
- **Wrong:** Look-changing speed-ups (pastel pre-blend, vignette once, grain sheet) moved pixels for draw time.
- **Cause:** Not recorded.
- **Guard:** judgement only: whether a change moves pixels to the eye is the owner's call on stills. Carried by `.claude/skills/film/SKILL.md`: "Art direction beats performance: a change that moves pixels needs the owner's OK and stills identical to the eye"

### speed-in-framework-not-films

- **Date:** 2026-09-27
- **Said:** "we want to improve performance of the framework, not specific films in general as a rule"
- **Source:** memory feedback_art_direction_over_performance.md; apps/animations/plans/film-flow-audit.md #14
- **Wrong:** Speed work was aimed at single films (scene-local simplification or cache).
- **Cause:** Not recorded.
- **Guard:** judgement only: where a speed-up lives is a design choice a reviewer reads in the diff. Carried by `.claude/skills/film/SKILL.md`: "Speed lives in the framework (`@bible/film`), never in one film's scenes."

### content-rules-not-in-code

- **Date:** 2026-10-09
- **Said:** "we dont need to encode these rules in codes or tests or lints, just for the skill guidance is enough"
- **Source:** apps/animations/plans/film-flow-audit.md #40
- **Wrong:** Content (script and doctrine) rules were being encoded as code checks, tests or lints.
- **Cause:** Not recorded.
- **Guard:** judgement only: this is the rule that keeps content out of code, so no code can hold it. Carried by `.claude/skills/film/SKILL.md`: "**Content rules are guidance, not gates.**"

### prototypes-not-on-laptop

- **Date:** 2026-10-12
- **Said:** "dont see it running on the laptop, prototype so we can choose by looking at the renders"
- **Source:** apps/animations/plans/film-flow-audit.md #60
- **Wrong:** The skill pointed the owner at the Workbox host; the prototypes could not be seen and picked on the laptop.
- **Cause:** Not recorded.
- **Guard:** judgement only: which host the owner looks on is where the lab runs, an operating choice. Carried by `.claude/skills/film/SKILL.md`: "on the laptop's port 8229 (owner, 2026-10-13: the laptop hosts it while the Workbox is read-only)"

### max-effort-render-critique

- **Date:** 2026-10-13
- **Said:** "when it comes to rendering and critiquing and whatnot, launch subagents with the max reasoning effort."
- **Source:** memory feedback_max_effort_render_critique.md; apps/animations/plans/film-flow-audit.md #67
- **Wrong:** Render, critique and review subagents ran at their usual effort.
- **Cause:** Not recorded.
- **Guard:** `packages/film/src/tools/counsel.ts` `'--effort'` (the judge's and the critique's counsel run Opus at max effort); for subagents an agent launches by hand, judgement, carried by the SKILL's Judge line.

### taste-review-by-fresh-opus

- **Date:** 2026-10-13
- **Said:** "lets not use okra counsel for a reviewer when it comes to taste/style/art - let a fresh opus do that"
- **Source:** apps/animations/plans/film-flow-audit.md #75; memory feedback_reviews_via_counsel_review.md
- **Wrong:** The film's taste and art judge was `okra counsel` (the other model family).
- **Cause:** Not recorded.
- **Guard:** `packages/film/src/tools/counsel.ts` `'opus'`; `packages/film/src/tools/counsel.ts` `Counsel` (asked by `tools/critique.ts`; cec4b84a2)

### choices-not-visible

- **Date:** 2026-10-13
- **Said:** "i dont see any choices or anything"
- **Source:** tmp/orchestrate/p5/log.md:1
- **Wrong:** The open choices lived in docs and branches; nothing in the lab showed them to pick from.
- **Cause:** Not recorded.
- **Guard:** judgement only: whether a choice is put before him is the agent's step, and the lab shows whatever is published. Carried by `.claude/skills/film/SKILL.md`: "**Ask, don't chat.**"

### local-url-with-links

- **Date:** 2026-10-14
- **Said:** "add a local url as well when giving the urls"
- **Source:** memory feedback_set_links_three_urls.md; apps/animations/plans/film-flow-audit.md #94
- **Wrong:** Lab links were given without the local URL.
- **Cause:** Not recorded.
- **Guard:** `packages/film/src/tools/asks-mcp.ts` `linksOf` (an ask answers its local and phone links); a link pasted in chat by hand is judgement, carried by the SKILL's "give him the page's local and phone links once".

### ask-text-fields-optional

- **Date:** 2026-10-14
- **Said:** "in general we should make textfields optional, required text fields usually are a burden, multiple choice etc is better"
- **Source:** memory feedback_asks_prefer_choices.md; apps/animations/plans/film-flow-audit.md #115, #116
- **Wrong:** An ask's "Anything else (optional)" box blocked Send; asks leaned on typed answers.
- **Cause:** Not recorded.
- **Guard:** `packages/film/src/core/ask.ts` `requiredOf` (words are optional unless asked for, and a required one is refused on a step with a choice); `packages/film/src/core/ask.ts` `unrecommended` (labmcp a8d71faf0)

### ask-shows-material-in-place

- **Date:** 2026-10-15
- **Said:** "this one here is asking about the script, but where is the script? I'd have to go look for it."
- **Source:** memory feedback_lab_agent_led_harness.md; ask ad1157de05b (withdrawn); tmp/orchestrate/p5/guidedask/log.md
- **Wrong:** The RBF v3 "keep the script?" ask pointed elsewhere for the script instead of showing it.
- **Cause:** Not recorded.
- **Guard:** `packages/film/src/core/ask.ts` `materialsIn`; `packages/film/src/tools/ask-materials.ts` `problems` (an ask's material is found where its views find it, or the ask is refused; guidedask 1a6c698b1)

### ask-one-page

- **Date:** 2026-10-15
- **Said:** "lets always make it one page no need for multiple pages"
- **Source:** memory feedback_lab_agent_led_harness.md; ask ad3aebb0697 (withdrawn, replaced by a086603ff6a)
- **Wrong:** The guided script ask split its material and questions over steps behind Send.
- **Cause:** Not recorded.
- **Guard:** `packages/film/src/core/ask.ts` `oneQuestion`; `packages/film/src/core/ask.ts` `pageIdOf` (asks in a row join one scrolling page)

### ask-script-is-script-reader

- **Date:** 2026-10-15
- **Said:** "this doesnt seem like the script editing component, where can we play the sound?"
- **Source:** memory feedback_lab_agent_led_harness.md
- **Wrong:** The script in the ask was prose, not the Script reader with playable takes and editable marks.
- **Cause:** Not recorded.
- **Guard:** `packages/film/src/core/ask.ts` `scriptSource` (a script under review is a script block, read by the Script reader; test 68917913c)

### code-first-sound

- **Date:** 2026-10-15
- **Said:** "the control and consistency of code-based sound fx + realistic sounds when I absolutely need them"
- **Source:** memory feedback_code_first_sound.md
- **Wrong:** Simple sound effects were generated ElevenLabs takes (drift, credits) rather than code.
- **Cause:** Not recorded.
- **Guard:** judgement only: whether code can reach a sound is heard, not measured; the synth gives code its means (unit p6-synth). Carried by `.claude/skills/film/SKILL.md`: "**Effects are code first**"

### sound-remakes

- **Date:** 2026-10-16
- **Said:** chose: "Remake the code sound" (for book.close and snake.hiss, no words; he kept the remakes in ask af1a97fa4ea)
- **Source:** ask a67404e1eae
- **Wrong:** The code versions of book.close and snake.hiss did not pass his ear.
- **Cause:** Not recorded.
- **Guard:** judgement only: an ear's verdict on one sound; no film plays a code trial until he chooses it. Carried by `.claude/skills/film/SKILL.md`: "No film plays a code trial until he chooses it."

### wait-on-asks-not-owner

- **Date:** 2026-10-18
- **Said:** "also lets make the lab cli have a latch or something we can use that you can wait on an answer instead of asking me"
- **Source:** memory feedback_wait_on_asks.md
- **Wrong:** Agents asked the owner to say "answered" after each ask.
- **Cause:** Not recorded.
- **Guard:** `packages/film/src/tools/ask-cli.ts` `wait` (`film ask wait`; 8db69f813; `--page` 76f991de4)

## The look

### floating-circle-hands-no-arms

- **Date:** 2026-09-29
- **Said:** "lets remove arms and just have floating hands, circular like it is now"
- **Source:** apps/animations/plans/film-flow-audit.md #23 (canvas-era RBF, before v3)
- **Wrong:** Figures were drawn with arms.
- **Cause:** Not recorded.
- **Guard:** judgement only: superseded on 2026-10-18 by `hands-at-sleeve-end`, which gives every hand a sleeve; a hand's design is a figure's design, held against the sheet by the critique's pose and proportion. Carried by `.claude/skills/film/CRAFT.md`: "**One hand design per look: a circle at the end of an arm in its sleeve, never a hand floating free of the body**"

### shade-with-colour-not-grey

- **Date:** 2026-10-12
- **Said:** "use complementary colors for shading rather than blacks or darker grays"
- **Source:** apps/animations/plans/film-flow-audit.md #56; memory feedback_shade_with_colour.md; tmp/orchestrate/p5/papercut/log.md, replan.md
- **Wrong:** Figure shading used black, grey or a darker copy of the base; the K1 skin crease was the base dimmed.
- **Cause:** A director-vision rule contradicted his, and hand-written shade hexes let it fail review three rounds running (papercut/replan.md).
- **Guard:** `packages/film/src/core/match.ts` `shade: colour, not grey` (73c436c69); CRAFT rule 12 (0b1f4c364)

### outlines-may-be-black

- **Date:** 2026-10-12
- **Said:** "outlines can be black, shading !== outlining"
- **Source:** apps/animations/plans/film-flow-audit.md #57; memory feedback_shade_with_colour.md
- **Wrong:** The shading rule was read as banning black outlines: ink is not shading.
- **Cause:** Not recorded.
- **Guard:** judgement only: a clarification of the shading rule, which the match's grey row already reads on the shade alone. Carried by `.claude/skills/film/CRAFT.md`: "**Shade with colour, never with black** (owner, 2026-10-12)."

### circle-hands-no-thumbs

- **Date:** 2026-10-12
- **Said:** "just make the hands circles, no thumbs. Give it kind of like a unique artistic taste."
- **Source:** tmp/orchestrate/p5/papercut/spec.md:8; apps/animations/plans/film-flow-audit.md #54
- **Wrong:** The cold-studies paper-cut figures had hands with thumbs and no signature of their own.
- **Cause:** Not recorded.
- **Guard:** judgement only: a design rule of the figures, read by eye and by the critique. Carried by `.claude/skills/film/reference/character-design.md`: "plain circles of the figure's paper, no thumb, no fingers (owner, 2026-10-12)"

### hands-at-sleeve-end

- **Date:** 2026-10-18
- **Said:** "I actually like the style when they have sleeves and like arms, kind of like we have with Jesus and a lot of the characters so far in the cast. Let's make that kind of a standing role for the concept."
- **Source:** the `look` production, v5 decision (2026-10-18)
- **Wrong:** The house hand floated free of the body with no arm, and the cast sheet brief asked for it; the measure flagged a sleeve that reached to a hand.
- **Cause:** The 2026-09-29 rule (`floating-circle-hands-no-arms`), which the kept Christ and the cast had outgrown.
- **Guard:** `packages/film/src/core/cast-sheet.ts` `reachFlags` (a hand no sleeve or arm joins to the body flags `sleeveReach`); `packages/film/src/tools/cast-sheet-brief.ts` `HANDS`

### farmer-sleeves

- **Date:** 2026-10-18
- **Said:** "He lifts his hand up, but it just looks weird without the sleeves. So let's add the sleeves."
- **Source:** the `look` production, v5 (2026-10-18), on the RBF farmer's rig
- **Wrong:** The farmer's raised hand floated with no sleeve, though his concept draws one.
- **Cause:** The rig followed the floating-hand rule over the concept.
- **Guard:** judgement only: a rig's arm is drawn by its painter and read by the critique's pose. Carried by `.claude/skills/film/reference/character-design.md`: "A raised hand is the house hand raised at the end of its sleeve, as the concept draws it"

### faces-more-interesting

- **Date:** 2026-10-13
- **Said:** "make the faces more interesting — rimworld style — what is this art style called? more prior art and art studies into our skill"
- **Source:** tmp/orchestrate/p5/cast/log.md:4
- **Wrong:** The K1 cast's faces were bland.
- **Cause:** Not recorded.
- **Guard:** judgement only: taste; the face kit he approved is the design. Carried by `.claude/skills/film/reference/face-study.md`: "rimworld style"

### hair-looks-stitched-on

- **Date:** 2026-10-13
- **Said:** "ok we need to solve hair, there's somethign about it that just ruins the art"
- **Source:** apps/animations/productions/look.json (Noted 2026-10-13); tmp/orchestrate/p5/headproto/log.md:1; apps/animations/plans/film-flow-audit.md #82
- **Wrong:** Hair, hats, beards and headcloths read as separate pieces stitched onto the head.
- **Cause:** The paper-cut figures' first rule gave every piece its own closed outline (tmp/orchestrate/p5/styleproto/log.md:71).
- **Guard:** `packages/film/src/core/match.ts` `'interiorInk'` (ink on the hair/skin edge, the rule is none; 73c436c69)

### k1-hair-and-ornaments

- **Date:** 2026-10-14
- **Said:** "minimal when it comes to k1 - my main gripe with k1 was hair and ornaments"
- **Source:** apps/animations/productions/look.json (Noted 2026-10-14 11:51); tmp/orchestrate/p5/seedanim/log.md:54-55; apps/animations/plans/film-flow-audit.md #87
- **Wrong:** K1 figures carried fussy hair and ornaments; clothes had details beyond the distinguishing ones.
- **Cause:** Not recorded.
- **Guard:** judgement only: how much detail a figure carries is design. Carried by `.claude/skills/film/reference/character-design.md`: "my main gripe with k1 was hair and ornaments"

### full-screen-cards-not-lettering

- **Date:** 2026-10-14
- **Said:** "remember about the full screen cards with text, look through our sessions where we made that suggestion"
- **Source:** memory feedback_fullscreen_text_cards.md; apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-14 13:54); tmp/orchestrate/p5/rbfscene/log.md:7
- **Wrong:** The RBF cold-open concepts and the first Rive render lettered Job's question above the bench instead of a full-screen card.
- **Cause:** The rule lived in CRAFT rule 1, but the briefs left it out, so the agents drew text over the picture.
- **Guard:** `packages/film/src/tools/findings.ts` `TextOffPlate`; a concept's brief is judgement, carried by the SKILL's "Each brief asks for no lettering".

### eyes-white-outline-vs-concept

- **Date:** 2026-10-14
- **Said:** "also compared to the concept, the eyes do not have a white outline"
- **Source:** apps/animations/plans/film-flow-audit.md #101 (rbfscene Rive render of the cold open)
- **Wrong:** The Rive render's eyes lacked the concept's white outline: the render was not held to its concept.
- **Cause:** Not recorded.
- **Guard:** `packages/film/src/core/critique.ts` `critiquePacket` (the face's features against the concept at 1:1); `packages/film/src/core/match.ts` `compareFigures` (cec4b84a2)

### concepts-in-locked-look

- **Date:** 2026-10-15
- **Said:** "lets lock in that style"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-15 21:17 and 21:19); ask a3c3c0406ea closing note
- **Wrong:** Concept frames (grain.7, robe.1) were not in the Board's woman.court.1 look and were redrawn.
- **Cause:** Not recorded.
- **Guard:** judgement only: a look is judged by eye against the house look's picture. Carried by `.claude/skills/film/SKILL.md`: "so a film's concepts start from that locked look"

### one-silhouette-outline-blended-hair

- **Date:** 2026-10-16
- **Said:** "i prefer the hair of the concept, how it blends, lets keep this. the way the outline is outside of the head details (hair does not have its own outline only the head in total."
- **Source:** ask a669b9776fb (note); apps/animations/productions/righteousness-by-faith.json (2026-10-16 14:49)
- **Wrong:** Round 3: hair carried its own ink line (a waved cap), heads faced front with no ear, and the shading was not the concept's.
- **Cause:** The generator inked every piece on its own (the same cause as the stitched-on hair).
- **Guard:** `packages/film/src/core/match.ts` `'interiorInk'` (73c436c69); `packages/film/src/core/match.ts` `facingRows` (a head faced otherwise than the concept's; 87e023029)

### no-inner-rim-on-ears

- **Date:** 2026-10-16
- **Said:** "the ears have an inner border that act as a lighting that the concept doesnt have"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-16 15:43); tmp/orchestrate/p5/p6-conceptmatch/log.md:1
- **Wrong:** The ears carried a light rim of their own that the concept does not paint.
- **Cause:** Round 4 gave every piece its own rim and tones in the generator (344316e72); inferred.
- **Guard:** `packages/film/src/core/match.ts` `'innerRim'` (73c436c69)

### christ-render-artifacts

- **Date:** 2026-10-17
- **Said:** "theres some artifacts in the render, and the farmer looks nothing like the concept, face proportions and angles are off"
- **Source:** ask aab16c0cb70 (christ: revise); apps/animations/productions/righteousness-by-faith.json (2026-10-17 22:58); tmp/orchestrate/p5/p6-lessons/spec.md
- **Wrong:** Render artifacts on Christ, seen at 1:1: a light line between His hair and cheek, a ragged beard edge, a white point at His crown.
- **Cause:** The orchestrator recommended locking on ratio rows and sampled colours; the artifacts show only at 1:1, and no 1:1 crop or fresh critique ran before the ask.
- **Guard:** `packages/film/src/core/render-artifacts.ts` `headArtifacts` (a sliver read on Christ's hair edge at court 16.51 s; 051f07561); `packages/film/src/core/review-record.ts` `keptOn` and `packages/film/src/tools/ask-materials.ts` `evidence` (a typed keep of Him in court is refused without a review of Him there; 0c7db02db)

### farmer-not-like-concept

- **Date:** 2026-10-17
- **Said:** "theres some artifacts in the render, and the farmer looks nothing like the concept, face proportions and angles are off"
- **Source:** ask aab16c0cb70 (farmer: revise); apps/animations/productions/righteousness-by-faith.json (2026-10-17 22:58); tmp/orchestrate/p5/p6-lessons/spec.md
- **Wrong:** At rain 14.19 s the farmer's head was turned about as rain.rain turns it, a little more (turn 0.141 against the concept's 0.094, both to the viewer's right), but level where the concept tilts it up 12° (roll 0.4° against −11.7°); his face longer and flat at the chin, with Christ's features, on robe.5's body; his raised hand drawn low; a sliver of headcloth beside his face and rain over it.
- **Cause:** A lock recommended on ratio rows and colours; the match read the farmer's head and body as one outline, and the head's angle and the pose were never compared.
- **Guard:** `packages/film/src/core/match.ts` `facingRows` (the roll flagged on rain 14.19 s, the turn read on his skin alone and not flagged; 87e023029); `packages/film/src/core/render-artifacts.ts` `ARTIFACT_KINDS` (its `weather`, rain across a face; 051f07561); `packages/film/src/core/critique.ts` `critiquePacket` (the pose and the face: the critique names the raised hand, cec4b84a2); `packages/film/src/core/review-record.ts` `evidenceProblems` (a keep of him needs a review of him in rain; 0c7db02db)

## Figures and the cast

### bookend-the-setting

- **Date:** 2026-10-13
- **Said:** "for the films, i think a nice thing to do is that opening and closing contexts should be the same -> eg open in a courtroom, close in said courtroom etc"
- **Source:** memory feedback_film_bookend_setting.md; apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-13 11:37)
- **Wrong:** Film scripts did not close in the setting they opened in.
- **Cause:** Not recorded.
- **Guard:** judgement only: a script's shape is content (the 2026-10-09 rule). Carried by `.claude/skills/film/CRAFT.md`: "**Bookend the setting.** Close in the place you opened."

### no-sermon-tracking

- **Date:** 2026-10-14
- **Said:** "no tracking, but as part of the scripts for all our planned series"
- **Source:** memory feedback_scripts_carry_christs_manner.md
- **Wrong:** The agent offered a per-sermon card that measured the owner's speaking.
- **Cause:** Not recorded.
- **Guard:** judgement only: what is offered to him is a choice, not a check. Carried by `.claude/skills/film/CRAFT.md`: "id like to change my own manner of speakign to more closely resemble that"

### keep-faith-forgiveness-power

- **Date:** 2026-10-14
- **Said:** "hmm, lets keep the faith forgiveness power"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-14 23:01, set rbf-script-2026-10-14)
- **Wrong:** The v3 spine (the word is a seed) dropped the refrain of three: faith, forgiveness and power.
- **Cause:** Not recorded.
- **Guard:** judgement only: a script's words are content. Carried by `apps/animations/productions/righteousness-by-faith.json`: "hmm, lets keep the faith forgiveness power"

### plain-lead-not-recurring-cast

- **Date:** 2026-10-15
- **Said:** "i actually liked more the non descriptive character in the room, let's make the recurring cast only background characters, and the main characters non descriptive so they can be better related"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-15 20:07); ask aa28806e8a9 (withdrawn)
- **Wrong:** The v3 concepts cast Max (a recurring cast member) as the accused lead.
- **Cause:** Not recorded.
- **Guard:** judgement only: who leads a film is casting, content. Carried by `.claude/skills/film/SKILL.md`: "**The lead is a plain figure,**"

### plain-lead-too-descriptive

- **Date:** 2026-10-15
- **Said:** "though this is what i mean by non descript"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-15 21:16); ask a3c3c0406ea (superseded)
- **Wrong:** The "plain" lead A (short dark hair, slate-blue top) was still too descriptive.
- **Cause:** Not recorded.
- **Guard:** judgement only: plainness is design, held to his reference picture (apps/animations/docs/ref/plain-lead.png). Carried by `.claude/skills/film/reference/character-design.md`: "the main characters non descriptive"

### character-consistency-across-scenes

- **Date:** 2026-10-15
- **Said:** "whats important is character consistency between scenes, he cant be taller, slimmer, different color, or different clothes (unless the scene calls for it)"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-15 21:20)
- **Wrong:** Concept tries could draw the same figure at another height, build, colour or dress between scenes.
- **Cause:** Not recorded.
- **Guard:** `packages/film/src/core/match.ts` `compareFigures` (each rig held to one concept by its ratio, outline and shade rows; 73c436c69)

### judge-from-cold13

- **Date:** 2026-10-15
- **Said:** "i like judge of cold.13"
- **Source:** ask a3c3c0406ea (cold_note); apps/animations/productions/righteousness-by-faith.json (2026-10-15 22:26)
- **Wrong:** The recommended cold.21 frame's judge was not the one he wanted.
- **Cause:** Not recorded.
- **Guard:** judgement only: a pick between designs is his. Carried by `apps/animations/productions/righteousness-by-faith.json`: "i like judge of cold.13"

### satan-angular-figure

- **Date:** 2026-10-16
- **Said:** "lets make satan that angular figure from the old boards"
- **Source:** ask a4899924c35 (notes); apps/animations/productions/righteousness-by-faith.json (2026-10-16 08:18)
- **Wrong:** The v3 Board drew the accuser as concept robe.5's bearded man in violet, not v2's angular figure.
- **Cause:** Not recorded.
- **Guard:** judgement only: a figure's design is his pick. Carried by `.claude/skills/film/reference/character-design.md`: "Tall, narrow, angular or sagging"

### stain-reads-as-blood-seal-as-coin

- **Date:** 2026-10-16
- **Said:** "ok what is the gold coin in the first frames? is that blood?"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-16 09:35); then ask a389862e313
- **Wrong:** In the cold open the scarlet stain read as blood and the seal as a gold coin.
- **Cause:** Not recorded. The same misread was caught in the 2026-10-11 looks study (fixed per look in 2e2aed302, and in the pixel look's pass 2 on the Workbox, tmp/orchestrate/p5/looks/log.md), but no rule was written then.
- **Guard:** judgement only: what a mark reads as is meaning, read by eye. Carried by `.claude/skills/film/reference/character-design.md`: "**Scarlet moves.**"

### cut-and-we-all-need-the-answer

- **Date:** 2026-10-16
- **Said:** "also i dont think we need the line \"and we all need the answer\" in the beggining"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-16 09:35)
- **Wrong:** The cold open carried an unneeded line.
- **Cause:** Not recorded.
- **Guard:** judgement only: a script's words are content (fixed in f9796aeed). Carried by `apps/animations/productions/righteousness-by-faith.json`: "Cut the line \"And we all need the answer\" from the cold open"

### seal-carries-an-r

- **Date:** 2026-10-16
- **Said:** "lets make the seal have a R on it for righteous"
- **Source:** ask a389862e313 (words)
- **Wrong:** The seal was plain.
- **Cause:** Not recorded.
- **Guard:** judgement only: a prop's design (redrawn in 3b1c6c06a). Carried by `apps/animations/productions/righteousness-by-faith.json`: "lets make the seal have a R on it for righteous"

### rosa-and-the-exchange

- **Date:** 2026-10-16
- **Said:** "id say the grandmother should be one the background cast members, the old lady, secondly we should include that Jesus Himself paid the price of our sins - he asks for our sins, and He gives us His righteousness - an exchange"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-16 09:47)
- **Wrong:** The garden's grandmother was a new figure, and the script lacked the exchange.
- **Cause:** Not recorded.
- **Guard:** judgement only: casting and doctrine are content. Carried by `.claude/skills/film/SKILL.md`: "the grandmother should be one the background cast members, the old lady"

### rigs-keep-concept-proportions

- **Date:** 2026-10-16
- **Said:** "lets keep the body/face shape and proportions the same as the concept"
- **Source:** ask a0298522031; apps/animations/productions/righteousness-by-faith.json (2026-10-16 14:13)
- **Wrong:** Cold pilot round 2: the prosecutor was a wide bell with a small round head where cold.34 draws him tall and narrow with a large squarish head.
- **Cause:** The scene was held to the kept panels' light and staging only; the concept, which sets each figure's build, was not measured.
- **Guard:** `packages/film/src/core/match.ts` `compareFigures` (73c436c69, ca3e4a1a0)

### match-shapes-not-only-ratios

- **Date:** 2026-10-17
- **Said:** "try to match concept face shape, shoes, and body as well"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-17 18:20)
- **Wrong:** The rigs met the ratio rows but not the concept's head outline, garment silhouette or shoes.
- **Cause:** Rounds 3 to 5 measured ratios per head width, not shapes.
- **Guard:** `packages/film/src/core/match.ts` `silhouetteRows` (73c436c69)

### round7-another-round

- **Date:** 2026-10-17
- **Said:** chose: "Another round on these figures first" (no notes)
- **Source:** ask a2a01fa05d8; tmp/orchestrate/p5/rbf-scenes-v3/log.md
- **Wrong:** Round 7's hand-fitted faces and heads still did not match cold.34.
- **Cause:** Shapes were fitted by hand, not traced; round 8 traced the heads from cold-34 and was locked.
- **Guard:** `packages/film/src/core/match.ts` `silhouetteRows` (the head's outline against the concept's, magenta over the scene); the traced variant is p6-stylepit's (d).

### christ-one-body-frame-face

- **Date:** 2026-10-17
- **Said:** "ensure Christ has a consistent body, frame, face"
- **Source:** ask a14290aca0a (notes); apps/animations/productions/righteousness-by-faith.json (2026-10-17 20:25)
- **Wrong:** Christ would be drawn two ways; the two Christ concepts (court.12, robe.5) differ 38% below the beard (measured after).
- **Cause:** Not recorded.
- **Guard:** judgement only: one design kept across films is a library rule, not built yet (p6-stylepit (g)). Carried by `.claude/skills/film/reference/character-design.md`: "**One body, frame and face.**"

### height-band-christ-not-short

- **Date:** 2026-10-17
- **Said:** "lets also make sure every character has similar heights (other than natural variability - or characters that are desdribed as being tall like Goliath) - Jesus should not be short compared to others"
- **Source:** ask a5fc41dfe7b (notes); apps/animations/productions/righteousness-by-faith.json (2026-10-17 20:41)
- **Wrong:** Heights came from each concept; the locked prosecutor stood 16-22% taller than court.12's Christ (measured).
- **Cause:** Not recorded.
- **Guard:** judgement only: a height band is set per cast by design. Carried by `.claude/skills/film/reference/character-design.md`: "**One height band for the cast.**"

### concept-heights-are-rough

- **Date:** 2026-10-17
- **Said:** "since concepts use image generation, we can use them as rough design sketch. i like the design more, but we dont need to take too much stalk on heights sicne its hard to constrain, use it only as a general design"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-17 20:46)
- **Wrong:** Agents took figure heights from image-generated concepts as exact targets.
- **Cause:** Not recorded.
- **Guard:** `packages/film/src/core/match.ts` `HEIGHT_IS_THE_BAND` (the height in heads is information, never flagged; da4faf975)

### concept-angle-is-design

- **Date:** 2026-10-17
- **Said:** "theres some artifacts in the render, and the farmer looks nothing like the concept, face proportions and angles are off"
- **Source:** ask aab16c0cb70; tmp/orchestrate/p5/rbf-scenes-v3/report.md ("Farmer revision 1")
- **Wrong:** The rough-heights rule was read past heights: a concept's three-quarter head was journalled as not borne out, and the farmer's head was drawn level where his concept tilts it up 12°.
- **Cause:** The scene-painter brief told a painter to journal a three-quarter head as not borne out (its match step), so a concept's angle read as a sketch's slip.
- **Guard:** `packages/film/src/core/match.ts` `ANGLE_IS_DESIGN` (a differing turn or roll is a flag, never information; 051f07561)

### bible-people-drawn-once

- **Date:** 2026-10-18
- **Said:** "all characters of the bible are cast members, if they are ever mentioned, they shoudl be drawn once and kept in the library to be used again"
- **Source:** memory feedback_bible_people_are_cast.md
- **Wrong:** Each film or beat drew a Bible person afresh, and each redraw drifted (the RBF figures took eight rounds).
- **Cause:** Not recorded.
- **Guard:** judgement only: the cast library is designed, not built (p6-stylepit (g)). Carried by `.claude/skills/film/reference/character-design.md`: "**Drawn once, kept for every film.**"
