# Lessons

One entry per mistake the repo was shown, and the guard that now keeps it
from happening again: an owner's correction, a reviewer's finding folded or
declined, and an agent's claim taken back. Each entry gives the day, the
words as they were said, where they are kept, what was wrong, why it went
wrong when the record says, and its guard.

A guard is the cheapest thing that catches the mistake, by class:

- `lint:<rule>, proof `file` `name``: a deterministic rule, an oxlint rule on
  at error in `.oxlintrc.json` (a JSON rule, or the `film` plugin's), and the
  test or fixture that shows it red (a fixture marks its line `RED <rule>`).
- `judged:<rule>, corpus `file``: a judged rule (`judged/<rule>`), when its
  measured precision on its labelled corpus lets it gate. The corpus decides:
  a judged rule that only warns guards nothing, and its lesson is a skill line.
- `skill: <why no code can hold it>. Carried by `file`: "<the line>"`: a line
  of a skill, a rule file or a production ledger, quoted word for word.
- `code: `file` `name``: a check, a test, a refusal or a match row that is
  neither a lint nor a judged rule, by its file and the name it lives under.
- `none: <why>`: no guard; a reviewer's finding declined, with why.

The owner's rule of 2026-10-09 sets the line for the films: what a film says
(doctrine, quoting, tone, wording) is guidance for the agent, never a lint, a
test or a check ("we dont need to encode these rules in codes or tests or
lints, just for the skill guidance is enough"). Their guards here are visual
and process checks, and skill lines.

**After any owner revise, add his entry here, and its guard, before
redrawing** (`.claude/skills/film/SKILL.md`, "The lessons ledger"). **Every
finding a review folds or declines gets an entry**, its Source citing the
finding as `<unit>/<review file> F<n>`; a review states each finding as
`### F<n> <severity>: <what>` with a `Guard class:` line (lint, judged,
skill, code or none) and a `Cheapest guard:` line, and `bun run merge-audit
--review <file>` refuses a unit whose findings are not all cited here.
`packages/scripts/src/lessons/ledger.test.ts` holds every entry to its fields
and every guard to what its file holds.

The form of an entry, each field on its own line:

- **Date:** the day it was said (YYYY-MM-DD).
- **Kind:** `owner`, `review` or `retraction`.
- **Said:** the words verbatim, in double quotes; or, when the owner chose without words, `chose:` and the option's words.
- **Source:** the ask, the note, the ledger, the memory or the review finding that keeps it.
- **Wrong:** what the work did.
- **Cause:** why, when the record says; "Not recorded." when it does not.
- **Guard:** one of the classes above.

## Process and tooling

### open-renders-after-render

- **Date:** 2026-09-25
- **Kind:** owner
- **Said:** "after rendering, use the open cli to open it so i can view it"
- **Source:** memory feedback_open_renders.md; apps/animations/plans/film-flow-audit.md #3
- **Wrong:** Renders were reported in text; the owner could not watch them.
- **Cause:** Not recorded.
- **Guard:** skill: opening a file on the owner's screen is an agent's step at the end of a render, not a property of the render. Carried by `.claude/skills/film/SKILL.md`: "On the Mac, `open` the MP4 too, so he can watch it at once"

### no-film-check-in-gate

- **Date:** 2026-09-27
- **Kind:** owner
- **Said:** "remove the film gate completely, not needed"
- **Source:** memory feedback_animations_gate_no_new_films.md
- **Wrong:** The agent put `film check` into the apps/animations gate.
- **Cause:** Not recorded.
- **Guard:** skill: the gate is what CI runs, and a rule about what it leaves out has no test that is not the gate itself. Carried by `.claude/skills/film/SKILL.md`: "`bun run check <film>` reviews it by hand, never in a gate"

### art-direction-over-speed

- **Date:** 2026-09-27
- **Kind:** owner
- **Said:** "the goal is to not sacrifice artistic merit and direction for performance either, but keep performance top of mind for sure"
- **Source:** memory feedback_art_direction_over_performance.md; apps/animations/plans/film-flow-audit.md #13
- **Wrong:** Look-changing speed-ups (pastel pre-blend, vignette once, grain sheet) moved pixels for draw time.
- **Cause:** Not recorded.
- **Guard:** skill: whether a change moves pixels to the eye is the owner's call on stills. Carried by `.claude/skills/film/SKILL.md`: "Art direction beats performance: a change that moves pixels needs the owner's OK and stills identical to the eye"

### speed-in-framework-not-films

- **Date:** 2026-09-27
- **Kind:** owner
- **Said:** "we want to improve performance of the framework, not specific films in general as a rule"
- **Source:** memory feedback_art_direction_over_performance.md; apps/animations/plans/film-flow-audit.md #14
- **Wrong:** Speed work was aimed at single films (scene-local simplification or cache).
- **Cause:** Not recorded.
- **Guard:** skill: where a speed-up lives is a design choice a reviewer reads in the diff. Carried by `.claude/skills/film/SKILL.md`: "Speed lives in the framework (`@bible/film`), never in one film's scenes."

### content-rules-not-in-code

- **Date:** 2026-10-09
- **Kind:** owner
- **Said:** "we dont need to encode these rules in codes or tests or lints, just for the skill guidance is enough"
- **Source:** apps/animations/plans/film-flow-audit.md #40
- **Wrong:** Content (script and doctrine) rules were being encoded as code checks, tests or lints.
- **Cause:** Not recorded.
- **Guard:** skill: this is the rule that keeps content out of code, so no code can hold it. Carried by `.claude/skills/film/SKILL.md`: "**Content rules are guidance, not gates.**"

### prototypes-not-on-laptop

- **Date:** 2026-10-12
- **Kind:** owner
- **Said:** "dont see it running on the laptop, prototype so we can choose by looking at the renders"
- **Source:** apps/animations/plans/film-flow-audit.md #60
- **Wrong:** The skill pointed the owner at the Workbox host; the prototypes could not be seen and picked on the laptop.
- **Cause:** Not recorded.
- **Guard:** skill: which host the owner looks on is where the lab runs, an operating choice. Carried by `.claude/skills/film/SKILL.md`: "on the laptop's port 8229 (owner, 2026-10-13: the laptop hosts it while the Workbox is read-only)"

### max-effort-render-critique

- **Date:** 2026-10-13
- **Kind:** owner
- **Said:** "when it comes to rendering and critiquing and whatnot, launch subagents with the max reasoning effort."
- **Source:** memory feedback_max_effort_render_critique.md; apps/animations/plans/film-flow-audit.md #67
- **Wrong:** Render, critique and review subagents ran at their usual effort.
- **Cause:** Not recorded.
- **Guard:** code: `packages/film/src/tools/counsel.ts` `'--effort'` (the judge's and the critique's counsel run Opus at max effort); for subagents an agent launches by hand, judgement, carried by the SKILL's Judge line.

### taste-review-by-fresh-opus

- **Date:** 2026-10-13
- **Kind:** owner
- **Said:** "lets not use okra counsel for a reviewer when it comes to taste/style/art - let a fresh opus do that"
- **Source:** apps/animations/plans/film-flow-audit.md #75; memory feedback_reviews_via_counsel_review.md
- **Wrong:** The film's taste and art judge was `okra counsel` (the other model family).
- **Cause:** Not recorded.
- **Guard:** code: `packages/film/src/tools/counsel.ts` `'opus'`; `packages/film/src/tools/counsel.ts` `Counsel` (asked by `tools/critique.ts`; cec4b84a2)

### choices-not-visible

- **Date:** 2026-10-13
- **Kind:** owner
- **Said:** "i dont see any choices or anything"
- **Source:** tmp/orchestrate/p5/log.md:1
- **Wrong:** The open choices lived in docs and branches; nothing in the lab showed them to pick from.
- **Cause:** Not recorded.
- **Guard:** skill: whether a choice is put before him is the agent's step, and the lab shows whatever is published. Carried by `.claude/skills/film/SKILL.md`: "**Ask, don't chat.**"

### local-url-with-links

- **Date:** 2026-10-14
- **Kind:** owner
- **Said:** "add a local url as well when giving the urls"
- **Source:** memory feedback_set_links_three_urls.md; apps/animations/plans/film-flow-audit.md #94
- **Wrong:** Lab links were given without the local URL.
- **Cause:** Not recorded.
- **Guard:** code: `packages/film/src/tools/asks-mcp.ts` `linksOf` (an ask answers its local and phone links); a link pasted in chat by hand is judgement, carried by the SKILL's "give him the page's local and phone links once".

### ask-text-fields-optional

- **Date:** 2026-10-14
- **Kind:** owner
- **Said:** "in general we should make textfields optional, required text fields usually are a burden, multiple choice etc is better"
- **Source:** memory feedback_asks_prefer_choices.md; apps/animations/plans/film-flow-audit.md #115, #116
- **Wrong:** An ask's "Anything else (optional)" box blocked Send; asks leaned on typed answers.
- **Cause:** Not recorded.
- **Guard:** code: `packages/film/src/core/ask.ts` `requiredOf` (words are optional unless asked for, and a required one is refused on a step with a choice); `packages/film/src/core/ask.ts` `unrecommended` (labmcp a8d71faf0)

### ask-shows-material-in-place

- **Date:** 2026-10-15
- **Kind:** owner
- **Said:** "this one here is asking about the script, but where is the script? I'd have to go look for it."
- **Source:** memory feedback_lab_agent_led_harness.md; ask ad1157de05b (withdrawn); tmp/orchestrate/p5/guidedask/log.md
- **Wrong:** The RBF v3 "keep the script?" ask pointed elsewhere for the script instead of showing it.
- **Cause:** Not recorded.
- **Guard:** code: `packages/film/src/core/ask.ts` `materialsIn`; `packages/film/src/tools/ask-materials.ts` `problems` (an ask's material is found where its views find it, or the ask is refused; guidedask 1a6c698b1)

### ask-one-page

- **Date:** 2026-10-15
- **Kind:** owner
- **Said:** "lets always make it one page no need for multiple pages"
- **Source:** memory feedback_lab_agent_led_harness.md; ask ad3aebb0697 (withdrawn, replaced by a086603ff6a)
- **Wrong:** The guided script ask split its material and questions over steps behind Send.
- **Cause:** Not recorded.
- **Guard:** code: `packages/film/src/core/ask.ts` `oneQuestion`; `packages/film/src/core/ask.ts` `pageIdOf` (asks in a row join one scrolling page)

### ask-script-is-script-reader

- **Date:** 2026-10-15
- **Kind:** owner
- **Said:** "this doesnt seem like the script editing component, where can we play the sound?"
- **Source:** memory feedback_lab_agent_led_harness.md
- **Wrong:** The script in the ask was prose, not the Script reader with playable takes and editable marks.
- **Cause:** Not recorded.
- **Guard:** code: `packages/film/src/core/ask.ts` `scriptSource` (a script under review is a script block, read by the Script reader; test 68917913c)

### code-first-sound

- **Date:** 2026-10-15
- **Kind:** owner
- **Said:** "the control and consistency of code-based sound fx + realistic sounds when I absolutely need them"
- **Source:** memory feedback_code_first_sound.md
- **Wrong:** Simple sound effects were generated ElevenLabs takes (drift, credits) rather than code.
- **Cause:** Not recorded.
- **Guard:** skill: whether code can reach a sound is heard, not measured; the synth gives code its means (unit p6-synth). Carried by `.claude/skills/film/SKILL.md`: "**Effects are code first**"

### sound-remakes

- **Date:** 2026-10-16
- **Kind:** owner
- **Said:** chose: "Remake the code sound" (for book.close and snake.hiss, no words; he kept the remakes in ask af1a97fa4ea)
- **Source:** ask a67404e1eae
- **Wrong:** The code versions of book.close and snake.hiss did not pass his ear.
- **Cause:** Not recorded.
- **Guard:** skill: an ear's verdict on one sound; no film plays a code trial until he chooses it. Carried by `.claude/skills/film/SKILL.md`: "No film plays a code trial until he chooses it."

### wait-on-asks-not-owner

- **Date:** 2026-10-18
- **Kind:** owner
- **Said:** "also lets make the lab cli have a latch or something we can use that you can wait on an answer instead of asking me"
- **Source:** memory feedback_wait_on_asks.md
- **Wrong:** Agents asked the owner to say "answered" after each ask.
- **Cause:** Not recorded.
- **Guard:** code: `packages/film/src/tools/ask-cli.ts` `wait` (`film ask wait`; 8db69f813; `--page` 76f991de4)

## The look

### floating-circle-hands-no-arms

- **Date:** 2026-09-29
- **Kind:** owner
- **Said:** "lets remove arms and just have floating hands, circular like it is now"
- **Source:** apps/animations/plans/film-flow-audit.md #23 (canvas-era RBF, before v3)
- **Wrong:** Figures were drawn with arms.
- **Cause:** Not recorded.
- **Guard:** skill: superseded on 2026-10-18 by `hands-at-sleeve-end`, which gives every hand a sleeve; a hand's design is a figure's design, held against the sheet by the critique's pose and proportion. Carried by `.claude/skills/film/CRAFT.md`: "**One hand design per look: a circle at the end of an arm in its sleeve, never a hand floating free of the body**"

### shade-with-colour-not-grey

- **Date:** 2026-10-12
- **Kind:** owner
- **Said:** "use complementary colors for shading rather than blacks or darker grays"
- **Source:** apps/animations/plans/film-flow-audit.md #56; memory feedback_shade_with_colour.md; tmp/orchestrate/p5/papercut/log.md, replan.md
- **Wrong:** Figure shading used black, grey or a darker copy of the base; the K1 skin crease was the base dimmed.
- **Cause:** A director-vision rule contradicted his, and hand-written shade hexes let it fail review three rounds running (papercut/replan.md).
- **Guard:** code: `packages/film/src/core/match.ts` `shade: colour, not grey` (73c436c69); CRAFT rule 12 (0b1f4c364)

### outlines-may-be-black

- **Date:** 2026-10-12
- **Kind:** owner
- **Said:** "outlines can be black, shading !== outlining"
- **Source:** apps/animations/plans/film-flow-audit.md #57; memory feedback_shade_with_colour.md
- **Wrong:** The shading rule was read as banning black outlines: ink is not shading.
- **Cause:** Not recorded.
- **Guard:** skill: a clarification of the shading rule, which the match's grey row already reads on the shade alone. Carried by `.claude/skills/film/CRAFT.md`: "**Shade with colour, never with black** (owner, 2026-10-12)."

### circle-hands-no-thumbs

- **Date:** 2026-10-12
- **Kind:** owner
- **Said:** "just make the hands circles, no thumbs. Give it kind of like a unique artistic taste."
- **Source:** tmp/orchestrate/p5/papercut/spec.md:8; apps/animations/plans/film-flow-audit.md #54
- **Wrong:** The cold-studies paper-cut figures had hands with thumbs and no signature of their own.
- **Cause:** Not recorded.
- **Guard:** skill: a design rule of the figures, read by eye and by the critique. Carried by `.claude/skills/film/reference/character-design.md`: "plain circles of the figure's paper, no thumb, no fingers (owner, 2026-10-12)"

### hands-at-sleeve-end

- **Date:** 2026-10-18
- **Kind:** owner
- **Said:** "I actually like the style when they have sleeves and like arms, kind of like we have with Jesus and a lot of the characters so far in the cast. Let's make that kind of a standing role for the concept."
- **Source:** the `look` production, v5 decision (2026-10-18)
- **Wrong:** The house hand floated free of the body with no arm, and the cast sheet brief asked for it; the measure flagged a sleeve that reached to a hand.
- **Cause:** The 2026-09-29 rule (`floating-circle-hands-no-arms`), which the kept Christ and the cast had outgrown.
- **Guard:** code: `packages/film/src/core/cast-sheet.ts` `reachFlags` (a hand no sleeve or arm joins to the body flags `sleeveReach`); `packages/film/src/tools/cast-sheet-brief.ts` `HANDS`

### farmer-sleeves

- **Date:** 2026-10-18
- **Kind:** owner
- **Said:** "He lifts his hand up, but it just looks weird without the sleeves. So let's add the sleeves."
- **Source:** the `look` production, v5 (2026-10-18), on the RBF farmer's rig
- **Wrong:** The farmer's raised hand floated with no sleeve, though his concept draws one.
- **Cause:** The rig followed the floating-hand rule over the concept.
- **Guard:** skill: a rig's arm is drawn by its painter and read by the critique's pose. Carried by `.claude/skills/film/reference/character-design.md`: "A raised hand is the house hand raised at the end of its sleeve, as the concept draws it"

### faces-more-interesting

- **Date:** 2026-10-13
- **Kind:** owner
- **Said:** "make the faces more interesting — rimworld style — what is this art style called? more prior art and art studies into our skill"
- **Source:** tmp/orchestrate/p5/cast/log.md:4
- **Wrong:** The K1 cast's faces were bland.
- **Cause:** Not recorded.
- **Guard:** skill: taste; the face kit he approved is the design. Carried by `.claude/skills/film/reference/face-study.md`: "rimworld style"

### hair-looks-stitched-on

- **Date:** 2026-10-13
- **Kind:** owner
- **Said:** "ok we need to solve hair, there's somethign about it that just ruins the art"
- **Source:** apps/animations/productions/look.json (Noted 2026-10-13); tmp/orchestrate/p5/headproto/log.md:1; apps/animations/plans/film-flow-audit.md #82
- **Wrong:** Hair, hats, beards and headcloths read as separate pieces stitched onto the head.
- **Cause:** The paper-cut figures' first rule gave every piece its own closed outline (tmp/orchestrate/p5/styleproto/log.md:71).
- **Guard:** code: `packages/film/src/core/match.ts` `'interiorInk'` (ink on the hair/skin edge, the rule is none; 73c436c69)

### k1-hair-and-ornaments

- **Date:** 2026-10-14
- **Kind:** owner
- **Said:** "minimal when it comes to k1 - my main gripe with k1 was hair and ornaments"
- **Source:** apps/animations/productions/look.json (Noted 2026-10-14 11:51); tmp/orchestrate/p5/seedanim/log.md:54-55; apps/animations/plans/film-flow-audit.md #87
- **Wrong:** K1 figures carried fussy hair and ornaments; clothes had details beyond the distinguishing ones.
- **Cause:** Not recorded.
- **Guard:** skill: how much detail a figure carries is design. Carried by `.claude/skills/film/reference/character-design.md`: "my main gripe with k1 was hair and ornaments"

### full-screen-cards-not-lettering

- **Date:** 2026-10-14
- **Kind:** owner
- **Said:** "remember about the full screen cards with text, look through our sessions where we made that suggestion"
- **Source:** memory feedback_fullscreen_text_cards.md; apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-14 13:54); tmp/orchestrate/p5/rbfscene/log.md:7
- **Wrong:** The RBF cold-open concepts and the first Rive render lettered Job's question above the bench instead of a full-screen card.
- **Cause:** The rule lived in CRAFT rule 1, but the briefs left it out, so the agents drew text over the picture.
- **Guard:** code: `packages/film/src/tools/findings.ts` `TextOffPlate`; a concept's brief is judgement, carried by the SKILL's "Each brief asks for no lettering".

### eyes-white-outline-vs-concept

- **Date:** 2026-10-14
- **Kind:** owner
- **Said:** "also compared to the concept, the eyes do not have a white outline"
- **Source:** apps/animations/plans/film-flow-audit.md #101 (rbfscene Rive render of the cold open)
- **Wrong:** The Rive render's eyes lacked the concept's white outline: the render was not held to its concept.
- **Cause:** Not recorded.
- **Guard:** code: `packages/film/src/core/critique.ts` `critiquePacket` (the face's features against the concept at 1:1); `packages/film/src/core/match.ts` `compareFigures` (cec4b84a2)

### concepts-in-locked-look

- **Date:** 2026-10-15
- **Kind:** owner
- **Said:** "lets lock in that style"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-15 21:17 and 21:19); ask a3c3c0406ea closing note
- **Wrong:** Concept frames (grain.7, robe.1) were not in the Board's woman.court.1 look and were redrawn.
- **Cause:** Not recorded.
- **Guard:** skill: a look is judged by eye against the house look's picture. Carried by `.claude/skills/film/SKILL.md`: "so a film's concepts start from that locked look"

### one-silhouette-outline-blended-hair

- **Date:** 2026-10-16
- **Kind:** owner
- **Said:** "i prefer the hair of the concept, how it blends, lets keep this. the way the outline is outside of the head details (hair does not have its own outline only the head in total."
- **Source:** ask a669b9776fb (note); apps/animations/productions/righteousness-by-faith.json (2026-10-16 14:49)
- **Wrong:** Round 3: hair carried its own ink line (a waved cap), heads faced front with no ear, and the shading was not the concept's.
- **Cause:** The generator inked every piece on its own (the same cause as the stitched-on hair).
- **Guard:** code: `packages/film/src/core/match.ts` `'interiorInk'` (73c436c69); `packages/film/src/core/match.ts` `facingRows` (a head faced otherwise than the concept's; 87e023029)

### no-inner-rim-on-ears

- **Date:** 2026-10-16
- **Kind:** owner
- **Said:** "the ears have an inner border that act as a lighting that the concept doesnt have"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-16 15:43); tmp/orchestrate/p5/p6-conceptmatch/log.md:1
- **Wrong:** The ears carried a light rim of their own that the concept does not paint.
- **Cause:** Round 4 gave every piece its own rim and tones in the generator (344316e72); inferred.
- **Guard:** code: `packages/film/src/core/match.ts` `'innerRim'` (73c436c69)

### christ-render-artifacts

- **Date:** 2026-10-17
- **Kind:** owner
- **Said:** "theres some artifacts in the render, and the farmer looks nothing like the concept, face proportions and angles are off"
- **Source:** ask aab16c0cb70 (christ: revise); apps/animations/productions/righteousness-by-faith.json (2026-10-17 22:58); tmp/orchestrate/p5/p6-lessons/spec.md
- **Wrong:** Render artifacts on Christ, seen at 1:1: a light line between His hair and cheek, a ragged beard edge, a white point at His crown.
- **Cause:** The orchestrator recommended locking on ratio rows and sampled colours; the artifacts show only at 1:1, and no 1:1 crop or fresh critique ran before the ask.
- **Guard:** code: `packages/film/src/core/render-artifacts.ts` `headArtifacts` (a sliver read on Christ's hair edge at court 16.51 s; 051f07561); `packages/film/src/core/review-record.ts` `keptOn` and `packages/film/src/tools/ask-materials.ts` `evidence` (a typed keep of Him in court is refused without a review of Him there; 0c7db02db)

### farmer-not-like-concept

- **Date:** 2026-10-17
- **Kind:** owner
- **Said:** "theres some artifacts in the render, and the farmer looks nothing like the concept, face proportions and angles are off"
- **Source:** ask aab16c0cb70 (farmer: revise); apps/animations/productions/righteousness-by-faith.json (2026-10-17 22:58); tmp/orchestrate/p5/p6-lessons/spec.md
- **Wrong:** At rain 14.19 s the farmer's head was turned about as rain.rain turns it, a little more (turn 0.141 against the concept's 0.094, both to the viewer's right), but level where the concept tilts it up 12° (roll 0.4° against −11.7°); his face longer and flat at the chin, with Christ's features, on robe.5's body; his raised hand drawn low; a sliver of headcloth beside his face and rain over it.
- **Cause:** A lock recommended on ratio rows and colours; the match read the farmer's head and body as one outline, and the head's angle and the pose were never compared.
- **Guard:** code: `packages/film/src/core/match.ts` `facingRows` (the roll flagged on rain 14.19 s, the turn read on his skin alone and not flagged; 87e023029); `packages/film/src/core/render-artifacts.ts` `ARTIFACT_KINDS` (its `weather`, rain across a face; 051f07561); `packages/film/src/core/critique.ts` `critiquePacket` (the pose and the face: the critique names the raised hand, cec4b84a2); `packages/film/src/core/review-record.ts` `evidenceProblems` (a keep of him needs a review of him in rain; 0c7db02db)

## Figures and the cast

### bookend-the-setting

- **Date:** 2026-10-13
- **Kind:** owner
- **Said:** "for the films, i think a nice thing to do is that opening and closing contexts should be the same -> eg open in a courtroom, close in said courtroom etc"
- **Source:** memory feedback_film_bookend_setting.md; apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-13 11:37)
- **Wrong:** Film scripts did not close in the setting they opened in.
- **Cause:** Not recorded.
- **Guard:** skill: a script's shape is content (the 2026-10-09 rule). Carried by `.claude/skills/film/CRAFT.md`: "**Bookend the setting.** Close in the place you opened."

### no-sermon-tracking

- **Date:** 2026-10-14
- **Kind:** owner
- **Said:** "no tracking, but as part of the scripts for all our planned series"
- **Source:** memory feedback_scripts_carry_christs_manner.md
- **Wrong:** The agent offered a per-sermon card that measured the owner's speaking.
- **Cause:** Not recorded.
- **Guard:** skill: what is offered to him is a choice, not a check. Carried by `.claude/skills/film/CRAFT.md`: "id like to change my own manner of speakign to more closely resemble that"

### keep-faith-forgiveness-power

- **Date:** 2026-10-14
- **Kind:** owner
- **Said:** "hmm, lets keep the faith forgiveness power"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-14 23:01, set rbf-script-2026-10-14)
- **Wrong:** The v3 spine (the word is a seed) dropped the refrain of three: faith, forgiveness and power.
- **Cause:** Not recorded.
- **Guard:** skill: a script's words are content. Carried by `apps/animations/productions/righteousness-by-faith.json`: "hmm, lets keep the faith forgiveness power"

### plain-lead-not-recurring-cast

- **Date:** 2026-10-15
- **Kind:** owner
- **Said:** "i actually liked more the non descriptive character in the room, let's make the recurring cast only background characters, and the main characters non descriptive so they can be better related"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-15 20:07); ask aa28806e8a9 (withdrawn)
- **Wrong:** The v3 concepts cast Max (a recurring cast member) as the accused lead.
- **Cause:** Not recorded.
- **Guard:** skill: who leads a film is casting, content. Carried by `.claude/skills/film/SKILL.md`: "**The lead is a plain figure,**"

### plain-lead-too-descriptive

- **Date:** 2026-10-15
- **Kind:** owner
- **Said:** "though this is what i mean by non descript"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-15 21:16); ask a3c3c0406ea (superseded)
- **Wrong:** The "plain" lead A (short dark hair, slate-blue top) was still too descriptive.
- **Cause:** Not recorded.
- **Guard:** skill: plainness is design, held to his reference picture (apps/animations/docs/ref/plain-lead.png). Carried by `.claude/skills/film/reference/character-design.md`: "the main characters non descriptive"

### character-consistency-across-scenes

- **Date:** 2026-10-15
- **Kind:** owner
- **Said:** "whats important is character consistency between scenes, he cant be taller, slimmer, different color, or different clothes (unless the scene calls for it)"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Decided 2026-10-15 21:20)
- **Wrong:** Concept tries could draw the same figure at another height, build, colour or dress between scenes.
- **Cause:** Not recorded.
- **Guard:** code: `packages/film/src/core/match.ts` `compareFigures` (each rig held to one concept by its ratio, outline and shade rows; 73c436c69)

### judge-from-cold13

- **Date:** 2026-10-15
- **Kind:** owner
- **Said:** "i like judge of cold.13"
- **Source:** ask a3c3c0406ea (cold_note); apps/animations/productions/righteousness-by-faith.json (2026-10-15 22:26)
- **Wrong:** The recommended cold.21 frame's judge was not the one he wanted.
- **Cause:** Not recorded.
- **Guard:** skill: a pick between designs is his. Carried by `apps/animations/productions/righteousness-by-faith.json`: "i like judge of cold.13"

### satan-angular-figure

- **Date:** 2026-10-16
- **Kind:** owner
- **Said:** "lets make satan that angular figure from the old boards"
- **Source:** ask a4899924c35 (notes); apps/animations/productions/righteousness-by-faith.json (2026-10-16 08:18)
- **Wrong:** The v3 Board drew the accuser as concept robe.5's bearded man in violet, not v2's angular figure.
- **Cause:** Not recorded.
- **Guard:** skill: a figure's design is his pick. Carried by `.claude/skills/film/reference/character-design.md`: "Tall, narrow, angular or sagging"

### stain-reads-as-blood-seal-as-coin

- **Date:** 2026-10-16
- **Kind:** owner
- **Said:** "ok what is the gold coin in the first frames? is that blood?"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-16 09:35); then ask a389862e313
- **Wrong:** In the cold open the scarlet stain read as blood and the seal as a gold coin.
- **Cause:** Not recorded. The same misread was caught in the 2026-10-11 looks study (fixed per look in 2e2aed302, and in the pixel look's pass 2 on the Workbox, tmp/orchestrate/p5/looks/log.md), but no rule was written then.
- **Guard:** skill: what a mark reads as is meaning, read by eye. Carried by `.claude/skills/film/reference/character-design.md`: "**Scarlet moves.**"

### cut-and-we-all-need-the-answer

- **Date:** 2026-10-16
- **Kind:** owner
- **Said:** "also i dont think we need the line \"and we all need the answer\" in the beggining"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-16 09:35)
- **Wrong:** The cold open carried an unneeded line.
- **Cause:** Not recorded.
- **Guard:** skill: a script's words are content (fixed in f9796aeed). Carried by `apps/animations/productions/righteousness-by-faith.json`: "Cut the line \"And we all need the answer\" from the cold open"

### seal-carries-an-r

- **Date:** 2026-10-16
- **Kind:** owner
- **Said:** "lets make the seal have a R on it for righteous"
- **Source:** ask a389862e313 (words)
- **Wrong:** The seal was plain.
- **Cause:** Not recorded.
- **Guard:** skill: a prop's design (redrawn in 3b1c6c06a). Carried by `apps/animations/productions/righteousness-by-faith.json`: "lets make the seal have a R on it for righteous"

### rosa-and-the-exchange

- **Date:** 2026-10-16
- **Kind:** owner
- **Said:** "id say the grandmother should be one the background cast members, the old lady, secondly we should include that Jesus Himself paid the price of our sins - he asks for our sins, and He gives us His righteousness - an exchange"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-16 09:47)
- **Wrong:** The garden's grandmother was a new figure, and the script lacked the exchange.
- **Cause:** Not recorded.
- **Guard:** skill: casting and doctrine are content. Carried by `.claude/skills/film/SKILL.md`: "the grandmother should be one the background cast members, the old lady"

### rigs-keep-concept-proportions

- **Date:** 2026-10-16
- **Kind:** owner
- **Said:** "lets keep the body/face shape and proportions the same as the concept"
- **Source:** ask a0298522031; apps/animations/productions/righteousness-by-faith.json (2026-10-16 14:13)
- **Wrong:** Cold pilot round 2: the prosecutor was a wide bell with a small round head where cold.34 draws him tall and narrow with a large squarish head.
- **Cause:** The scene was held to the kept panels' light and staging only; the concept, which sets each figure's build, was not measured.
- **Guard:** code: `packages/film/src/core/match.ts` `compareFigures` (73c436c69, ca3e4a1a0)

### match-shapes-not-only-ratios

- **Date:** 2026-10-17
- **Kind:** owner
- **Said:** "try to match concept face shape, shoes, and body as well"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-17 18:20)
- **Wrong:** The rigs met the ratio rows but not the concept's head outline, garment silhouette or shoes.
- **Cause:** Rounds 3 to 5 measured ratios per head width, not shapes.
- **Guard:** code: `packages/film/src/core/match.ts` `silhouetteRows` (73c436c69)

### round7-another-round

- **Date:** 2026-10-17
- **Kind:** owner
- **Said:** chose: "Another round on these figures first" (no notes)
- **Source:** ask a2a01fa05d8; tmp/orchestrate/p5/rbf-scenes-v3/log.md
- **Wrong:** Round 7's hand-fitted faces and heads still did not match cold.34.
- **Cause:** Shapes were fitted by hand, not traced; round 8 traced the heads from cold-34 and was locked.
- **Guard:** code: `packages/film/src/core/match.ts` `silhouetteRows` (the head's outline against the concept's, magenta over the scene); the traced variant is p6-stylepit's (d).

### christ-one-body-frame-face

- **Date:** 2026-10-17
- **Kind:** owner
- **Said:** "ensure Christ has a consistent body, frame, face"
- **Source:** ask a14290aca0a (notes); apps/animations/productions/righteousness-by-faith.json (2026-10-17 20:25)
- **Wrong:** Christ would be drawn two ways; the two Christ concepts (court.12, robe.5) differ 38% below the beard (measured after).
- **Cause:** Not recorded.
- **Guard:** skill: one design kept across films is a library rule, not built yet (p6-stylepit (g)). Carried by `.claude/skills/film/reference/character-design.md`: "**One body, frame and face.**"

### height-band-christ-not-short

- **Date:** 2026-10-17
- **Kind:** owner
- **Said:** "lets also make sure every character has similar heights (other than natural variability - or characters that are desdribed as being tall like Goliath) - Jesus should not be short compared to others"
- **Source:** ask a5fc41dfe7b (notes); apps/animations/productions/righteousness-by-faith.json (2026-10-17 20:41)
- **Wrong:** Heights came from each concept; the locked prosecutor stood 16-22% taller than court.12's Christ (measured).
- **Cause:** Not recorded.
- **Guard:** skill: a height band is set per cast by design. Carried by `.claude/skills/film/reference/character-design.md`: "**One height band for the cast.**"

### concept-heights-are-rough

- **Date:** 2026-10-17
- **Kind:** owner
- **Said:** "since concepts use image generation, we can use them as rough design sketch. i like the design more, but we dont need to take too much stalk on heights sicne its hard to constrain, use it only as a general design"
- **Source:** apps/animations/productions/righteousness-by-faith.json (Noted 2026-10-17 20:46)
- **Wrong:** Agents took figure heights from image-generated concepts as exact targets.
- **Cause:** Not recorded.
- **Guard:** code: `packages/film/src/core/match.ts` `HEIGHT_IS_THE_BAND` (the height in heads is information, never flagged; da4faf975)

### concept-angle-is-design

- **Date:** 2026-10-17
- **Kind:** owner
- **Said:** "theres some artifacts in the render, and the farmer looks nothing like the concept, face proportions and angles are off"
- **Source:** ask aab16c0cb70; tmp/orchestrate/p5/rbf-scenes-v3/report.md ("Farmer revision 1")
- **Wrong:** The rough-heights rule was read past heights: a concept's three-quarter head was journalled as not borne out, and the farmer's head was drawn level where his concept tilts it up 12°.
- **Cause:** The scene-painter brief told a painter to journal a three-quarter head as not borne out (its match step), so a concept's angle read as a sketch's slip.
- **Guard:** code: `packages/film/src/core/match.ts` `ANGLE_IS_DESIGN` (a differing turn or roll is a flag, never information; 051f07561)

### bible-people-drawn-once

- **Date:** 2026-10-18
- **Kind:** owner
- **Said:** "all characters of the bible are cast members, if they are ever mentioned, they shoudl be drawn once and kept in the library to be used again"
- **Source:** memory feedback_bible_people_are_cast.md
- **Wrong:** Each film or beat drew a Bible person afresh, and each redraw drifted (the RBF figures took eight rounds).
- **Cause:** Not recorded.
- **Guard:** skill: the cast library is designed, not built (p6-stylepit (g)). Carried by `.claude/skills/film/reference/character-design.md`: "**Drawn once, kept for every film.**"

## Gate and review

### gate-not-ci

- **Date:** 2026-10-19
- **Kind:** owner
- **Said:** "CI is not a verification tool for us"
- **Source:** memory feedback_gate_not_ci.md
- **Wrong:** Agents waited on CI runs after a push and fixed tests that only CI saw red, so the gate on the machine was not the feedback cycle.
- **Cause:** The loop skill's merge step told agents to run `bun run ci` and read its verdict.
- **Guard:** skill: whether an agent reads CI is its choice of action, which no check sees. Carried by `CLAUDE.md`: "Agents never check or wait on CI, and never fix a test only CI sees red"

### comment-claims-code-off

- **Date:** 2026-10-19
- **Kind:** review
- **Said:** "commentClaimsCode 0/43 (20 random + all 23 at p>=0.9; 46 % of every ask)"
- **Source:** judged-efficiency/report.md F3
- **Wrong:** The judged rule commentClaimsCode warned on 301 items of the repo, and the reviewers found none of the 43 they read true, while its items were 46 % of every request.
- **Cause:** Its corpus held 48 cases written for it, with no finding of its own from the repo, so its precision of 0.67 to 0.71 on the corpus said nothing of the repo.
- **Guard:** skill: whether a judged rule is worth its requests is a measure over the repo's own findings, which no check takes. Carried by `.oxlintrc.json`: "It is off, its words and its corpus"

### test-oracle-property-checks

- **Date:** 2026-10-19
- **Kind:** review
- **Said:** "testOracle 0/18 (all property checks; the rule's own example names that shape)"
- **Source:** judged-efficiency/report.md F3
- **Wrong:** testOracle reported determinism, purity, round-trip and metamorphic tests as tautologies, 18 of 18 its reviewers read.
- **Cause:** Its words gave "the same function called again" as a tautology with no bound, which is the shape of every property check.
- **Guard:** skill: a rule's words are content the model reads, and its corpus now holds the 18 as independent cases. Carried by `.oxlintrc.json`: "are INDEPENDENT: each is its own oracle"

### judged-findings-agree-with-store

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Findings can disagree with the shared store"
- **Source:** p6-guardloop/review-1.md F1
- **Wrong:** Two checkouts that asked about one item at once each kept their own answer, the later over the earlier, and the first checkout's findings file still reported its answer; a findings file older than the store's age still reported answers the store had dropped.
- **Cause:** The store took each run's fresh answers over the ones kept meanwhile, and the run reported by its own answers, not the store's; the findings file kept no day.
- **Guard:** code: `packages/scripts/src/judged/run.test.ts` `keeps the first answer kept for a key, and reports by it`, `packages/scripts/lint/judged.test.ts` `or a run past the store`

### judged-findings-know-their-item-code

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Findings survive changes to item extraction"
- **Source:** p6-guardloop/review-1.md F2
- **Wrong:** The plugin reported a run's findings after a rule's selector or the code that makes the items changed, so a finding could sit on an item the rule no longer reads.
- **Cause:** A rule's signature held its words, label, threshold and model but not its selector, and the findings file held no hash of the item code.
- **Guard:** code: `packages/scripts/lint/judged.test.ts` `a rule of other words or selector, other item code`, `packages/scripts/src/judged/findings.ts` `makersHash`

### reach-reads-playwright-config

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The reach check accepts tests Playwright never runs"
- **Source:** p6-guardloop/review-1.md F3
- **Wrong:** The reach check read `playwright test --config=…` as a run of every file under a folder named `test`, so a spec outside the config's testDir counted as reached.
- **Cause:** Every command that was not a bun test was read as a list of path filters.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### each-commit-runs-film-exports

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Intermediate commits fail the existing film suite"
- **Source:** p6-guardloop/review-1.md F4
- **Wrong:** A commit of the unit exported a name no file imports, and the film's package entries test was red on it until a later fix commit.
- **Cause:** `merge-audit --each` runs `bun run guard` on each commit, and the guard did not run the film's exports test.
- **Guard:** code: `packages/film/package.json` `bun test ./src/docs.test.ts ./src/exports.test.ts`, `package.json` `bun run --cwd packages/film test:guard`

### film-budget-measured-quiet

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The film budget requirement remains unverified"
- **Source:** p6-guardloop/review-1.md F5
- **Wrong:** The unit left the film suite's budget with no counted measure: each run was at a load over the core count, which the budget does not count, and took 10.4 to 12.6 s.
- **Cause:** The machine was busy with other units; the suite's long pole was one test file (`cast-sheet.test.ts`, 10.4 s inside the suite).
- **Guard:** code: `packages/scripts/src/test-budget/budget.ts` `notMeasured`

### reach-takes-workspace-dot

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The reach check rejects `bun test ./`"
- **Source:** p6-guardloop/review-1.md F6
- **Wrong:** `bun test ./` read as a filter no file matched, so a workspace's every test file was called unreached.
- **Cause:** `./` normalised to an empty path, and a path filter matched only under a leading slash.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `bun test ./`

### judged-report-by-store-after-write

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The initial cache still overrides the reconciled store"
- **Source:** p6-guardloop/review-2.md F1
- **Wrong:** A run reported an item cached when it started by that answer, though another run had dropped it and kept another for its key before this run's write.
- **Cause:** The run read an item's answer from the store as it first read it, before the store its write returned.
- **Guard:** code: `packages/scripts/src/judged/run.test.ts` `reports a cached item by the store as its write left it`

### judged-unkept-rule-left-out

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Failed store writes create empty snapshots that suppress findings"
- **Source:** p6-guardloop/review-2.md F2
- **Wrong:** When the store could not be written, the findings file held the rule with no findings for the file, so the plugin reported nothing there even after another checkout kept a finding.
- **Cause:** A rule was left out of a file only for an item no answer came for, not for an answer the store does not keep.
- **Guard:** code: `packages/scripts/src/judged/run.test.ts` `names the files whose answers the store does not keep when its write fails`, `packages/scripts/src/judged/cli.test.ts` `leaves the rule out of their file for the plugin`

### reach-reads-playwright-ignore

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The reach check accepts tests excluded by Playwright"
- **Source:** p6-guardloop/review-2.md F3
- **Wrong:** The reach check called a spec reached that the config's `testIgnore` leaves out.
- **Cause:** The config reader read `testDir` and `testMatch` and not `testIgnore`.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### film-budget-counted-run

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The film budget still has no accepted measurement"
- **Source:** p6-guardloop/review-2.md F4
- **Wrong:** The unit gave the film suite's time at one load average, which the budget does not admit.
- **Cause:** The budget admits a run only when both the 1- and the 5-minute averages are at or below the cores, and the machine was busy with other units.
- **Guard:** code: `packages/scripts/src/test-budget/budget.ts` `notMeasured`

### judged-unrenewed-answers-unkept

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Failed store renewal gives expired answers a fresh snapshot"
- **Source:** p6-guardloop/review-3.md F1
- **Wrong:** When the store could not be written, a run's findings file held cached answers under today's day, though their own day in the store was not renewed and the store could drop them first.
- **Cause:** A failed write left the cached answers counted as kept for the findings file, and the file's day was the run's, not the answers'.
- **Guard:** code: `packages/scripts/src/judged/run.test.ts` `names every file unkept when the store kept its answers but could not renew their day`

### reach-reads-playwright-globs

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The reach check still accepts files Playwright ignores"
- **Source:** p6-guardloop/review-3.md F2
- **Wrong:** The reach check read a `testIgnore` glob with no folder (`unreached.spec.ts`) as a path from the workspace, and missed a quoted `"testIgnore"` key, so it called reached a spec playwright leaves out.
- **Cause:** Playwright puts `**/` before a glob that does not start so and matches it with no regard to case; the reader matched the glob as written and looked for the key unquoted only.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### film-budget-admitted

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The film budget still has no accepted measurement"
- **Source:** p6-guardloop/review-3.md F3
- **Wrong:** The unit's log still said the counted film budget run was pending when it was reviewed.
- **Cause:** The machine's 5-minute load stayed over its 12 cores while other units ran; the counted run, once both averages fell, took 9.4 s at load 2.8 and 11.9.
- **Guard:** code: `packages/scripts/src/test-budget/budget.ts` `notMeasured`

### reach-matches-absolute-paths

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The reach check still accepts tests Playwright excludes"
- **Source:** p6-guardloop/review-4.md F1
- **Wrong:** The reach check called reached a spec that a `testIgnore` regex with its folder in it (`/\/test\/browser\/a\.spec\.ts$/`) leaves out.
- **Cause:** Playwright tests a regex against a test file's absolute path; the reader tested it against the path from the workspace, so a regex that names a leading `/` matched nothing.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### judged-findings-day-of-renewal

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "A midnight run gives findings a later expiry than their backing answers"
- **Source:** p6-guardloop/review-4.md F2
- **Wrong:** A judged run that crossed UTC midnight wrote its findings file under the day after the one it marked its answers seen, so the file outlived those answers by a day.
- **Cause:** The runner read the clock again after `judge` for the findings file's day; `judge` had read it before it asked.
- **Guard:** code: `packages/scripts/src/judged/run.test.ts` `answers the day it marked its answers seen: a run that crosses midnight answers the day it began`

### judged-seen-day-monotonic

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Delayed runs can move renewal dates backward and leave stale findings"
- **Source:** p6-guardloop/review-5.md F1
- **Wrong:** A judged run that began a day before another and ended after it marked the answers both read seen on its own, earlier day, so the store could drop an answer a day before the later run's findings file expired.
- **Cause:** The store set an answer's seen day to the run's day, whatever day the answer already held.
- **Guard:** code: `packages/scripts/src/judged/run.test.ts` `never marks an answer seen on a day before the one a later run marked it: a run that ends last keeps the later day`

### reach-reads-extglobs

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The reach check accepts tests excluded by Playwright extglobs"
- **Source:** p6-guardloop/review-5.md F2
- **Wrong:** The reach check called reached a spec that a `testIgnore` extglob (`*.@(spec|test).ts`) leaves out.
- **Cause:** The reader matched a glob with Bun's `Glob`, which reads no extglobs; playwright reads a glob with the minimatch it bundles, dot files taken.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are read by a glob as playwright reads one, with the minimatch playwright bundles`

### reach-parses-configs

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The reach check can read inactive configuration text as active settings"
- **Source:** p6-guardloop/review-6.md F1
- **Wrong:** The reach check read a `testIgnore` from a comment, or from an object the config does not export, as the config's own, and read a config that spreads another object into its export as if the spread set nothing.
- **Cause:** The reader matched the config's text with regexes, which cannot tell a setting of the exported object from any other text.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### reach-respects-git-ignore

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The reach check accepts specs excluded by Playwright's Git ignore policy"
- **Source:** p6-guardloop/review-7.md F1
- **Wrong:** The reach check called reached a tracked spec that git's ignore rules name, though playwright skips it when its config sets `respectGitIgnore: true` or sets neither it nor `testDir`.
- **Cause:** The reader took the config's `testDir`, `testMatch` and `testIgnore` for all of playwright's file selection, and did not read `respectGitIgnore` or know which tracked files git ignores.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### reach-reads-gitignore-as-playwright

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The reach check still accepts specs Playwright ignores"
- **Source:** p6-guardloop/review-8.md F1
- **Wrong:** The reach check called reached a spec that a `.gitignore` extglob (`*.@(spec|test).ts`) names, though playwright skips it when it respects git's ignores.
- **Cause:** The reader asked git which tracked files its ignore rules name; playwright reads each `.gitignore` from its `testDir` down with minimatch, which matches some patterns git does not.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### judged-retry-ticks-until-done

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Retry tests can hang after a short cache-read delay"
- **Source:** p6-guardloop/review-8.md F2
- **Wrong:** A judged retry test hung when its run's setup read the disk slowly: it joined a run that still waited on the clock for its next ask.
- **Cause:** The test moved the clock a fixed count of ticks, and slow real I/O let the count run out before the run's retry waited on the clock.
- **Guard:** code: `packages/scripts/src/judged/run.test.ts` `asks again after a 429 that follows slow real I/O, and keeps the answers`

### reach-counts-named-tests

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The reach check discards valid tests before checking their scripts"
- **Source:** p6-guardloop/review-9.md F1
- **Wrong:** The reach check left out a test file that imports its runner under another name (`import { test as scenario } from /* runner */ 'bun:test'`), so no script had to reach it.
- **Cause:** The reader took a file named as a test for one only when a regex found a runner import or a line that calls `describe`, `it` or `test`, and a comment or an alias hid both.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are each a file named as a test that is not data, in the deepest workspace or in none`

### reach-refuses-folder-moves

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The reach check ignores working-directory changes"
- **Source:** p6-guardloop/review-10.md F1
- **Wrong:** The reach check called every test file of a workspace reached by `cd src/test-budget && bun test`, which runs only the files under that folder.
- **Cause:** The reader read each command of a script on its own, every path from the workspace's folder, and lost the folder a `cd` moved the script to.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no script that runs in another folder than its workspace`

### reach-refuses-forwarded-words

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Forwarded script arguments disappear from the reach check"
- **Source:** p6-guardloop/review-11.md F1
- **Wrong:** The reach check called every test file reached by `bun run suite ./src` (with `suite: "bun test"`), which runs only the files under `src`.
- **Cause:** The reader followed `bun run` to the script it names and dropped the words after the name, which bun hands to that script's last command.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no script that hands a script it runs more words`

### reach-allows-known-flags

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Filtered and listing-only runs still count as reaching tests"
- **Source:** p6-guardloop/review-11.md F2
- **Wrong:** The reach check called specs reached by `playwright test -gfast`, `-Gcase` and `--list`, and test files reached by `bun test -tfast`, though each runs some cases or none.
- **Cause:** The reader refused a list of narrowing flags by their exact spelling, so an attached short value, an alias or a mode it did not list passed.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no playwright run that a flag or its config narrows by name, shard or history`

### reach-reads-and-chains

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Conditional commands count as tests even when they never execute"
- **Source:** p6-guardloop/review-11.md F3
- **Wrong:** The reach check called every test file reached by `true || bun test`, which passes and runs no test.
- **Cause:** The shell reader dropped the separators between commands, so the reader counted a command that `||`, `;`, `&` or `|` may skip, or whose failure they hide.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no script whose commands are joined by anything but && or set a variable`

### reach-refuses-shell-changes

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Exported Bun options bypass the variable refusal"
- **Source:** p6-guardloop/review-12.md F1
- **Wrong:** The reach check called every test file reached by `export BUN_OPTIONS=-ttie && bun test`, which runs only the cases whose names match.
- **Cause:** The variable refusal read only a bare assignment or `env` before a program, and not the shell's own commands (`export`, `source`, `alias`) that change what later commands run with.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no script whose commands are joined by anything but && or set a variable`

### reach-takes-the-last-config

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Playwright config resolution can select the wrong file"
- **Source:** p6-guardloop/review-12.md F2
- **Wrong:** The reach check read `-c wide.config.ts --config narrow.config.ts` by the wide config, and read a config named by an absolute or parent path as the default config, though playwright runs the narrow one, or the one named.
- **Cause:** The reader gathered the values of `--config` and `-c` apart and took the last of their joined list, and fell back to the default config when it could not read the named path.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by the config the last --config or -c names, and by none for one not read`

### reach-credits-runners-only

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Commands that only print paths count as test suites"
- **Source:** p6-guardloop/review-12.md F3
- **Wrong:** The reach check called `other/a.test.ts` reached by `echo ./other`, which runs no test.
- **Cause:** The reader read any command it did not know as a wrapper of `bun test` that runs the files it names by path.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are run by hand by a script of their own: a bun test, a wrapper of it the repo names, or playwright`

### reach-refuses-early-exits

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "A successful shell exit credits tests that never run"
- **Source:** p6-guardloop/review-13.md F1
- **Wrong:** The reach check called every test file reached by `exit 0 && bun test`, which passes and runs no test.
- **Cause:** The shell refusal listed the commands that change what later commands run with, and not those that end the script before them (`exit`, `return`).
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no script whose commands are joined by anything but && or set a variable`

### reach-binds-define-config

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Config discovery trusts any function named defineConfig"
- **Source:** p6-guardloop/review-13.md F2
- **Wrong:** The reach check read `export default defineConfig({ testDir: 'e2e' })` by its object, though the config's own `defineConfig` added a `testIgnore` that leaves a spec out.
- **Cause:** The reader took a call by its callee's spelling, and did not ask what the name is bound to.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### reach-refuses-reading-flags

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Loader overrides credit tests that Bun never runs"
- **Source:** p6-guardloop/review-14.md F1
- **Wrong:** The reach check took `bun test --loader=.ts:text --pass-with-no-tests src` as a run of every test file in `src`, though bun reads each file as text and runs no case.
- **Cause:** The flag allow-list asked whether a flag narrows which files a run takes, and not whether it changes how bun reads the files it takes (`--loader`, `--define`, `--tsconfig-override`, `--env-file`).
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no bun test run that changes how bun reads a file`

### reach-reads-config-load

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "CommonJS assignments can replace the config the reader trusts"
- **Source:** p6-guardloop/review-14.md F2
- **Wrong:** The reach check read `export default { testDir: '.' }; module.exports = { testDir: 'narrow' };` by its default export, though playwright loads the object `module.exports` holds and takes only `narrow`.
- **Cause:** The reader read the export statement alone, and did not ask what else loading the config does: a statement, a function or a name it does not bind can replace or change the export.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`
