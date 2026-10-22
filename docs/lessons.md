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

### repo-json-as-formatter-leaves-it

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "the cast record is written unformatted"
- **Source:** p6-casttools/findings.md F4
- **Wrong:** `repoJson` wrote two-space JSON with one array item a line, so each write of a `cast-sheet.json` left a diff for `bun run fmt`.
- **Cause:** It wrote `JSON.stringify` with two spaces, and the formatter sets a short array on one line.
- **Guard:** code: `packages/film/src/core/schema.test.ts` `writes back every committed record a tool writes through it byte for byte`

### publish-set-keeps-production

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "publish_set drops the production keys"
- **Source:** p6-casttools/findings.md F5
- **Wrong:** The lab MCP's `publish_set` stripped `production` and `version` from its manifest, so the set landed on no production's timeline.
- **Cause:** Its manifest patch is a `Schema.Struct` with no `production` or `version`, and a struct's decode drops the keys it does not name.
- **Guard:** code: `packages/film/src/tools/lab-mcp.test.ts` `lands on the production's timeline, stamped as film publish stamps it`

### film-publish-asks-the-lab

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "film publish says the lab will not list a set it lists"
- **Source:** p6-casttools/findings.md F6
- **Wrong:** Run from a worktree, `film publish` said the lab would not list a set that the lab lists.
- **Cause:** It judged the set by the command's own review roots, and a worktree's roots leave out the main checkout the lab serves.
- **Guard:** code: `packages/film/src/tools/lab-mcp.test.ts` `says whether the running lab lists the set, as the lab answers it, and never claims what no lab said`

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

### hand-past-its-cuff

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Neither hand is at the end of a sleeve: both are bare circles laid over the robe at hip height with the robe running on below them"
- **Source:** rbf-lead/findings.md F1 (the rbf-unbake critique of `rain` at mark:rain, fcb2d4ad6)
- **Wrong:** The farmer's raised hand was drawn at the top corner of his far sleeve's cuff, so the sleeve ran on below it and the hand floated beside the sleeve at `rain` 17 s.
- **Cause:** The scene placed the hand at a point traced by eye and turned it with the arm, and nothing held that point to the sleeve's end.
- **Guard:** code: `packages/film/src/style/figure.ts` `handOn` (an arm's hand lies past its sleeve's end and touches it; the host draws it at `armHand`)

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

### close-shot-line-thinner

- **Date:** 2026-10-18
- **Kind:** owner
- **Said:** chose: "About 25% thinner in close shots"
- **Source:** ask a9e82d17477 (`line`: thin); apps/animations/productions/righteousness-by-faith.json (2026-10-18 12:57); out/rbf-v3-cast-2026-10-18/docs/r3.md F7
- **Wrong:** The figures' line was one width at every shot, so in a close shot (the farmer of the rain, Christ close in court) it read heavier than the concept's.
- **Cause:** The ink's widths were written into the print as numbers; no shot could reach them.
- **Guard:** code: `packages/film/src/style/rig/parts.ts` `inkBind` (every ink stroke of a figure and its hands binds its width to `ink`); `packages/film/src/style/house.ts` `inkAt` (0.75 from a head three tenths of the frame); `packages/film/src/style/figures-file.test.ts` `a figure's ink, bound to its view model's ink` (02dd143f6); `packages/film/src/rive/rive.test.ts` `draws an ink stroke as wide as its number maps it` (the runtime maps a bound width linearly; 202e1b3b3)

### hand-follows-its-figures-shot

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Local hand sizing changes the shot's ink value"
- **Source:** p6-closeink/review-1.md F1
- **Wrong:** A hand drawn larger than the hand rig (the judge's at 1.23) read its shot with its own size in it, so in a push-in its ink thinned before its figure's.
- **Cause:** The shot was read from the whole transform the rig was drawn under, and a scene folds a hand's size into the place it draws it at.
- **Guard:** code: `packages/film/src/rive/rive.test.ts` `a rig drawn at a size is drawn that size, and follows the shot of the space it stands in, as its figure does`

### face-marks-are-line-too

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Facial ink strokes bypass `ink`"
- **Source:** p6-closeink/review-2.md F2
- **Wrong:** The brows and the mouth line kept their widths at every shot while the rest of each figure's ink thinned in a close shot, so in the shots where a face reads most its marks grew heavy against its line.
- **Cause:** The face's marks were read as features, not line; the owner's answer was "every figure's line".
- **Guard:** code: `packages/film/src/style/figures-file.test.ts` `binds every ink stroke of a figure and its hands, the brows and the mouth among them`

### sized-draw-throw-keeps-its-save

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "A failed sized draw leaves the context scaled"
- **Source:** p6-closeink/review-2.md F1
- **Wrong:** A rig that throws while drawn at a size leaves its context scaled.
- **Cause:** The draw path keeps no try/finally; a throw fails the frame.
- **Guard:** none: declined; a throw fails its frame, and every frame sets its context's transform afresh as it starts (`packages/film/src/canvas/film.ts`), as `at` and `paintCanvas` already rely on.

### ink-bind-names-its-target

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Tests do not verify the ink binding target"
- **Source:** p6-closeink/review-3.md F1
- **Wrong:** The generator test held each ink bind's source to an id's shape only, so a bind aimed at another number of the view model passed.
- **Cause:** The test read the bind's form, not what it names.
- **Guard:** code: `packages/film/src/style/figures-file.test.ts` `binds every ink stroke of a figure and its hands, the brows and the mouth among them`

### sized-draw-proved-sized

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The size test passes when sizing does nothing"
- **Source:** p6-closeink/review-3.md F2
- **Wrong:** The size test read only the widths Rive sets and the shot read, so a draw that ignored `size` passed.
- **Cause:** The mock context wrote down no transform at a stroke.
- **Guard:** code: `packages/film/src/rive/rive.test.ts` `a rig drawn at a size is drawn that size, and follows the shot of the space it stands in, as its figure does`

### readme-row-after-face-fold

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "README still excludes face marks"
- **Source:** p6-closeink/review-3.md F3
- **Wrong:** The style row of the film README said the face's marks stay as cut after they were bound.
- **Cause:** The fold changed the code and the tests, and the row was not read back.
- **Guard:** none: `bun run doc-lines` already lists the row for each change to the style files, and the review reads it; the row is corrected.

### silhouette-ink-bind-tested

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Narrowing removes silhouette-binding coverage"
- **Source:** p6-closeink/review-5.md F1
- **Wrong:** RBF's build test, narrowed to the lead and his hand for speed, and the generator's ink test both drew only round-headed figures, so a silhouette stroke left unbound passed both.
- **Cause:** The narrowed print kept no figure the silhouette draws, and no test of the silhouette read its bind.
- **Guard:** code: `packages/film/src/style/rig/parts.test.ts` `binds its ink's width to the figure's number`

### walker-comment-after-its-change

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Walker comment describes removed filtering"
- **Source:** p6-closeink/review-6.md F1
- **Wrong:** A test helper's comment said it skipped a named node after its `skip` was removed.
- **Cause:** The helper's code changed and its comment was not read back.
- **Guard:** skill: whether a comment still says what its code does is judged by reading both, and the judged comment rule is off on its corpus. Carried by `CLAUDE.md`: "A comment says what the code does now and why"

### hand-prop-comment-after-unbake

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Hand comment incorrectly says “no view model”"
- **Source:** rbf-unbake/review-1.md F1
- **Wrong:** RBF's hand spec said a circle hand has no view model after the file bound its ink, which gives every hand the number `ink`.
- **Cause:** The unbake changed one flag in `figures.ts`; the comment on the hand spec in `rigs.ts` reads that flag's effect and was not read back.
- **Guard:** skill: whether a comment still says what its code does is judged by reading both, and the judged comment rule is off on its corpus. Carried by `CLAUDE.md`: "A comment says what the code does now and why"

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

### cast-brief-heads-from-band

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "the cast-sheet brief asks every member for 3⅓ heads"
- **Source:** p6-casttools/findings.md F1
- **Wrong:** The cast-sheet brief asked every member for about three and a third heads, and the measure squashed every anchor toward 3.36, so the plain figures (2.6 heads) and a child on a pose sheet were asked and held to the adult canon.
- **Cause:** The brief and the measure read one constant, `CANON_HEADS`, and the record had no field for a member's own heads.
- **Guard:** code: `packages/film/src/tools/cast-sheet-brief.test.ts` `stands a canon member at the canon, and a member of its own design at its own`, `packages/film/src/core/cast-sheet-poses.test.ts` `is held to its own heads, never the canon`

### cast-brief-hair-only-when-shown

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "the brief adds the hair paragraph to every member"
- **Source:** p6-casttools/findings.md F2
- **Wrong:** Every cast-sheet brief carried the hair-and-beard rule, so Jeremiah and the sower under their headcloths and the plain figures with no hair were asked for hair they do not show.
- **Cause:** The rule was one sentence of the sheet rules, and the record said nothing of the hair.
- **Guard:** code: `packages/film/src/tools/cast-sheet-brief.test.ts` `is spoken of only on a member whose hair shows`

### cast-underlay-own-heights

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "the underlay stands every mannequin at one height"
- **Source:** p6-casttools/findings.md F3
- **Wrong:** The retry's underlay stood every standing mannequin at the canon's height, so the IDEA child was redrawn on an underlay that asks it to stand as tall as the grown figure.
- **Cause:** `mannequinUnderlay` took one height for every view, and the record named no smaller figure.
- **Guard:** code: `packages/film/src/core/cast-underlay.test.ts` `stands a smaller figure its share of the grown one's height, its head a larger share of it`, `packages/film/src/tools/cast-sheet-make.test.ts` `is briefed and underlaid at its own heads, its smaller figure smaller, with no hair paragraph`

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
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are each a file named as a test that is not data, in the deepest workspace or in none, and not a link`

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
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no playwright run that a flag or its config narrows by name, line, shard or history, or reads by another tsconfig`

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

### reach-names-config-calls

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Config calls can stop Playwright before any tests run"
- **Source:** p6-guardloop/review-15.md F1
- **Wrong:** The reach check read `const stopped = Number.constructor('process.exit(0)')(); export default { testDir: '.' };` as a config that takes its tests, though loading it ends the run before playwright starts.
- **Cause:** The reader allowed the names a config reads and not what it calls: a member of an allowed name reaches `Function`, and a call of it runs any code.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### reach-reads-bunfig-tables

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Bunfig loader settings bypass the file-reading refusal"
- **Source:** p6-guardloop/review-15.md F2
- **Wrong:** The reach check took `bun test src` as a run of every test file in `src` in a workspace whose `bunfig.toml` sets `[loader] ".ts" = "text"`, which makes bun read each file as text and run no case.
- **Cause:** The bunfig reader checked the keys of `[test]` alone, and not the other tables, which change how bun reads a file.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no bun test run whose bunfig may narrow it or change how bun reads a file, and by one whose bunfig does neither`

### reach-refuses-shadowed-calls

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Allowed config call names can bind to arbitrary functions"
- **Source:** p6-guardloop/review-16.md F1
- **Wrong:** The reach check read a config that declares `const Number = defineConfig.constructor` and then calls `Number('process.exit(0)')()` through it, as a config that takes its tests.
- **Cause:** The reader allowed a call by the name `Number` without asking what the name is bound to: a config's own `const` can shadow it.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### reach-trusts-loaded-code

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Preloads and execution hooks can remove all credited cases"
- **Source:** p6-guardloop/review-16.md F2
- **Wrong:** A preload that replaces a test file's source by an `onLoad` hook, a reporter that drops every case, or a global setup that exits early, makes a credited file run no case.
- **Cause:** The reach check reads which files a runner takes and loads as tests; what the code a run loads does is the repo's, as a test file's own code is.
- **Guard:** none: the check reads selection, not the behaviour of the repo's code; a preload, a reporter or a setup module that hides its tests is a defect of that code, as a test that asserts nothing is, and reading it would mean running it. The trust is said in `packages/scripts/src/test-budget/reach.ts`'s header.

### reach-refuses-tsconfig-overrides

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "TypeScript path mappings bypass trusted Playwright imports"
- **Source:** p6-guardloop/review-16.md F3
- **Wrong:** The reach check took `playwright test --tsconfig other.json`, and a config that sets `tsconfig`, as runs it reads, though another tsconfig may map `@playwright/test` to a module whose `defineConfig` adds a `testIgnore`.
- **Cause:** The flag and setting allow-lists asked whether a flag narrows which files run, and not whether it changes how the config's imports resolve. The toolchain's own resolution of a module (the tsconfig the repo keeps) stays trusted, as the code it resolves to is.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no playwright run that a flag or its config narrows by name, line, shard or history, or reads by another tsconfig`

### reach-refuses-shell-expansions

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Shell expansion and redirection change the arguments being credited"
- **Source:** p6-guardloop/review-16.md F4
- **Wrong:** The reach check credited every file a glob names in `bun test --conditions ./src/guard/*.test.ts`, though the shell expands the glob and bun takes the first file as the condition's value, and credited `other/report.log.test.ts` to `bun test src > report.log`.
- **Cause:** The script reader took a word as its text, not as the shell expands it, and took a redirection's target for a filter.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no script whose words the shell expands or redirects`

### reach-refuses-line-filters

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Playwright positionals can select a line while appearing to select every file"
- **Source:** p6-guardloop/review-16.md F5
- **Wrong:** The reach check credited every spec to `playwright test --pass-with-no-tests '.*|:999999'`, though playwright reads the trailing number as a line and runs no case.
- **Cause:** The reader took a filter as a regex of the file alone, and did not read playwright's `parseLocationArg`.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no playwright run that a flag or its config narrows by name, line, shard or history, or reads by another tsconfig`

### reach-reads-test-dir

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Playwright directory values still produce incorrect discovery"
- **Source:** p6-guardloop/review-16.md F6
- **Wrong:** The reach check read `testDir: '/elsewhere'` as a folder under the config's, and `testDir: ''` as a set `testDir`, which turned git's ignore rules off though playwright turns them on.
- **Cause:** The reader joined the value to the config's folder and asked whether the key is set, where playwright resolves an absolute path as it is and reads an empty one as none (`pathResolve`).
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### reach-reads-disk

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Discovery lacks filesystem metadata that can exclude tracked specs"
- **Source:** p6-guardloop/review-16.md F7
- **Wrong:** The reach check credited a spec that is a symbolic link, which playwright's walk skips, and read only the `.gitignore` files git lists, though playwright reads an untracked, ignored one too.
- **Cause:** The reader's inputs came from git's file list, which carries no entry type and leaves ignored files out.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are read from the repo on disk: each .gitignore playwright's walk reads, tracked or not, and each file that is a link or under one`

### reach-reads-selection-not-cases

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Empty and conditional-only files count as executed tests"
- **Source:** p6-guardloop/review-16.md F8
- **Wrong:** A comment-only test file, a loop over an empty array, and `test.each([])` are credited as reached, though each registers no case.
- **Cause:** The reach check proves that a runner takes a file, not that the file registers a case; whether it does is what the file's code does when run.
- **Guard:** none: a reached file with no case is a weak test, not an unreached one; the test strength checks (`film/tests-keep-their-strength`, the test budget's strength check) are where an empty test belongs, and proving a file registers a case means running it.

### judged-findings-name-their-store

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Findings remain attached to a previous store after its location changes"
- **Source:** p6-guardloop/review-16.md F9
- **Wrong:** The judged plugin reported a run's findings after `settings.judged.store` named another store, though the new store kept no such answer.
- **Cause:** The findings file named the checkout, the model, the rules, the files and the day, and not the store its answers came from.
- **Guard:** code: `packages/scripts/lint/judged.test.ts` `reports the last run's findings of a file as it stands, and the store's for a file changed since, a rule of other words or selector, other item code, a run of another store, or a run past the store's age`

### reach-reads-printable-scripts

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Shell tokenization credits runners and filters that the shell omits"
- **Source:** p6-guardloop/review-17.md F1
- **Wrong:** The reach check credited `true \` and `# comment && bun test` on the next line, which the shell joins into `true` and a comment, and `bun test src<U+00A0>lint`, which the shell hands bun as one filter.
- **Cause:** The script reader split words on JavaScript's whitespace and read a comment before it joined continued lines, where the shell splits on a space, a tab and a line's end alone and joins lines first.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no script that holds a character the shell may read otherwise than the reader`

### reach-refuses-reserved-words

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Shell prefixes bypass the refusal of commands that end the script"
- **Source:** p6-guardloop/review-18.md F1
- **Wrong:** The reach check credited `! exit 0 && bun test` and `time exit 0 && bun test`, which the shell passes without running bun.
- **Cause:** The reader asked whether a command's first word ends the script, and a reserved word (`!`, `time`) put the command that does behind it.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no script whose commands are joined by anything but && or set a variable`

### reach-prunes-ignored-folders

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Bun directory exclusions still credit the files beneath them"
- **Source:** p6-guardloop/review-18.md F2
- **Wrong:** The reach check credited `src/guard/parts.test.ts` to `bun test --path-ignore-patterns='**/guard' src`, though bun's scan skips the folder the pattern matches and all under it.
- **Cause:** The reader matched an ignore pattern against the file's path alone, not against each folder on it.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `leave out what a flag's value or a plain ignore pattern names`

### reach-reads-filter-flags

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Playwright argument filters use different regex flags"
- **Source:** p6-guardloop/review-18.md F3
- **Wrong:** The reach check credited `a.spec.ts` to the filter `^(?!.*A).*`, though playwright reads a filter with no regard to case and takes no path that holds an `a`.
- **Cause:** The reader built a filter's regex with no flags, where playwright's `forceRegExp` gives `gi`, or the flags of a `/<pattern>/<flags>` form.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### reach-reads-bun-scan

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Bun default discovery credits hidden directories and unsupported extensions"
- **Source:** p6-guardloop/review-18.md F4
- **Wrong:** The reach check credited `src/.hidden/a.test.ts` and `a.test.mtsx` to `bun test`, though bun's scan enters no folder whose name starts with `.` and reads no `.mtsx` (measured on bun 1.4.3).
- **Cause:** The reader used the repo's inventory of test names for bun's scan, which is narrower.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by a bun test that names no filter, a path, or a part of one`

### reach-refuses-ignore-globs

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Bun directory globs still credit files the runner excludes"
- **Source:** p6-guardloop/review-19.md F1
- **Wrong:** The reach check credited `src/guard/parts.test.ts` to `bun test --path-ignore-patterns='**/guard/'`, though bun's scan skips the folder (measured on bun 1.4.3), and so for `**/gu*/`, `**/[g]uard/`, `**/{guard}/` and `src/**/`.
- **Cause:** The reader matched a glob with its own glob code against a folder's path with no closing `/`, where bun's scan matches folders by rules the reader does not reproduce.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no run that names an ignore glob`

### reach-refuses-mapped-filters

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Playwright filters ignore source maps in the reach check"
- **Source:** p6-guardloop/review-19.md F2
- **Wrong:** The reach check credited `e2e/a.spec.js` with an inline source map that names `original.ts` to `playwright test a.spec.js`, though playwright filters a mapped file by the sources its map names and leaves it out.
- **Cause:** The reader matched a positional filter against the file's own path alone.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by playwright as its config's testDir, testMatch and testIgnore set them`

### reach-reads-plain-ignores

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Escaped Bun ignore patterns still credit excluded test files"
- **Source:** p6-guardloop/review-20.md F1
- **Wrong:** The reach check credited `src/guard/parts.test.ts` to `bun test --path-ignore-patterns='src\/guard'`, though bun reads the backslash as an escape and skips the folder (measured on bun 1.4.3), and so for `src/guard/parts.test.t\s`.
- **Cause:** The reader refused a deny-list of glob characters and read every other pattern literally, so a character bun reads otherwise passed.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `leave out what a flag's value or a plain ignore pattern names, and are reached by no run that names an ignore glob`

### reach-refuses-mixed-filters

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Mixed Bun filters credit files the runner never loads"
- **Source:** p6-guardloop/review-21.md F1
- **Wrong:** The reach check credited `src/guard/parts.test.ts` to `bun test ./missing parts`, though bun reads every filter as a path once one is (measured on bun 1.4.3), and so for `/guard` and `..`, which run none.
- **Cause:** The reader read each filter on its own, a `./` one as a path and any other as a part of one, where bun picks one reading for the whole command.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are taken by a bun test that names no filter, a path, or a part of one`

### reach-refuses-optional-values

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Playwright snapshot modes become spurious file filters"
- **Source:** p6-guardloop/review-21.md F2
- **Wrong:** The reach check credited `all/left.spec.ts` to `playwright test --update-snapshots all narrow`, though playwright reads `all` as the snapshot mode and filters by `narrow` alone.
- **Cause:** The allow-list read `--update-snapshots` and `-u` as taking no value, where playwright declares them `[mode]`, a value or none.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are reached by no playwright run that a flag or its config narrows by name, line, shard or history, or reads by another tsconfig`

### tests-bound-each-case

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The credits-refusal test no longer detects loss of halting"
- **Source:** p6-guardloop/review-22.md F1
- **Wrong:** The case that sends no part after a refusal held both its statuses to the rate limit's bound of 32 requests, so a runner that sent all 20 parts after a refusal for credits passed it.
- **Cause:** One bound, raised for the rate limit's retries, served a case that sends no retry.
- **Guard:** code: `packages/scripts/src/judged/run.test.ts` `sends no part after one the account refuses, for credits or a rate limit`

### reach-reads-linked-folders

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Symlinked directories still credit tests Playwright skips"
- **Source:** p6-guardloop/review-23.md F1
- **Wrong:** The reach check credited `w/linked/a.spec.ts` to `playwright test`, where `w/linked` is a tracked folder made a symbolic link: git still lists its file, and playwright's walk does not enter the link.
- **Cause:** The reader asked whether the test file itself is a link, not whether a folder above it is one.
- **Guard:** code: `packages/scripts/src/test-budget/reach.test.ts` `are read from the repo on disk: each .gitignore playwright's walk reads, tracked or not, and each file that is a link or under one`

### button-words-optically-centred

- **Date:** 2026-10-20
- **Kind:** owner
- **Said:** "it's not centred. The subscribe button here on YouTube. So let's make sure the buttons are optically centred."
- **Source:** scrawl capture of firsttheblade.com, 2026-10-20 12:42 (frames #1 and #3: the header pill and the night button)
- **Wrong:** The words of the site's buttons sat above the middle of their pills: 2.75 px in the header pill and 3.13 px in the night button.
- **Cause:** A font's line box keeps room above the capitals and below the baseline, and the buttons centred the line box, not the letters.
- **Guard:** code: `apps/firsttheblade/src/buttons.test.ts` `a pill and a button label are trimmed to the cap height and the baseline, so their letters sit in the middle`; `every button wraps its words in a trimmed label`

### tests-build-shared-fixtures-at-load

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "A fixture the cases share is made by the first case that asks"
- **Source:** p6-testspeed/findings.md F1
- **Wrong:** The sound library's tests made their library in an `Effect.cached` memo the first case on it ran inside its 5 s limit, with the cases concurrent, so which case paid, and the paid calls it counted, moved with their order; the package entries' and film services' tests read the source graph in their first case, 0.55 s alone and past 5 s under load.
- **Cause:** A memo made where the file loads is built on its first use, inside that case's time limit.
- **Guard:** lint:film/no-lazy-test-fixture, proof `packages/film/lint/fixtures/no-lazy-test-fixture.ts` `RED film/no-lazy-test-fixture`

### gate-runs-tests-alone

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The gate runs every workspace's tests at once beside the checks"
- **Source:** p6-testspeed/findings.md F2
- **Wrong:** The gate was red in 10 of 10 runs: a case took ten times its time alone (0.47 s alone, 6.1 s in the gate) past its 5 s limit.
- **Cause:** `turbo run gate test` ran every workspace's tests in parallel beside the typechecks, builds and Selah's native gate, each test runner one worker per core.
- **Guard:** code: `packages/scripts/src/gate.test.ts` `the gate is gate.sh: the checks, then the tests under the lock`, `packages/scripts/src/gate.test.ts` `the tests run each workspace's alone, one after another`

### test-git-turns-maintenance-off

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Git's detached maintenance breaks a test repository's delete"
- **Source:** p6-testspeed/findings.md F3
- **Wrong:** The gate's files test failed with NotFound when its scope deleted the test repository, in 11 of 15 runs of a commit and a delete on one process.
- **Cause:** Git 2.56 starts automatic maintenance detached after a commit, and its `.git/objects/maintenance.lock` came and went while the recursive delete walked the folder; each of six test files wrote its own git config, and none turned it off.
- **Guard:** lint:film/test-git-config, proof `packages/film/lint/fixtures/test-git-config.ts` `RED film/test-git-config`

### mcp-events-flake-unreproduced

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The lab's MCP events case was red once under load and is not reproduced"
- **Source:** p6-testspeed/findings.md F4
- **Wrong:** `logs a callback by its origin alone` failed once in a loaded gate.
- **Cause:** Not recorded: 25 runs under 24 busy loops, and 6 film suites under 12, gave no failure.
- **Guard:** none: a guard for a cause not seen would guess at it; the phased gate runs the film's tests alone, and the case stays open.

### lazy-fixture-rule-reads-pipes

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Piped caches bypass the lazy-fixture guard"
- **Source:** p6-testspeed/review-1.md F1
- **Wrong:** `film/no-lazy-test-fixture` passed `read.pipe(Effect.cached, Effect.runSync)` where the file loads, a memo the first case to ask builds inside its time limit.
- **Cause:** The rule read only a call of a memo maker, not a memo maker handed to a pipe.
- **Guard:** lint:film/no-lazy-test-fixture, proof `packages/film/lint/fixtures/no-lazy-test-fixture.ts` `export const piped = read.pipe(Fx.cached, Fx.runSync); // RED film/no-lazy-test-fixture`

### lazy-fixture-rule-spares-helpers

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The fixture guard rejects an unapplied TTL helper"
- **Source:** p6-testspeed/review-1.md F2
- **Wrong:** `film/no-lazy-test-fixture` reported `const withinMinute = Effect.cachedWithTTL('1 minute')`, a helper that makes no memo until a case applies it.
- **Cause:** The rule read every call of a TTL form as a memo, whether it was given its effect or its ttl alone.
- **Guard:** code: `packages/film/lint/fixtures/no-lazy-test-fixture.ts` `it.effect('applies a helper in its own case', () => Fx.flatten(withinMinute(read)));`

### test-git-rule-reads-git-arguments

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The Git rule reports arguments belonging to other programs"
- **Source:** p6-testspeed/review-1.md F3
- **Wrong:** `film/test-git-config` reported `ChildProcess.make('tar', ['-c', 'archive.entry=fixture'])`, where `archive.entry=fixture` is a file name.
- **Cause:** The rule read every array's `-c` as git's, with no sign the array was git's arguments.
- **Guard:** code: `packages/film/lint/fixtures/test-git-config.ts` `make('tar', ['-c', 'archive.entry=fixture']);`

### gate-runs-timed-checks-alone

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The contrast check's browser runs in the checks, beside a cold build"
- **Source:** p6-testspeed/findings.md F5
- **Wrong:** A cold gate failed in firsttheblade's contrast check: its screenshots missed their 30 s limit, at the checks' lowered priority beside every cold typecheck and build and Selah's native build.
- **Cause:** The checks phase was laid for work with no time limit, and a package's own `gate` script, which waits on a browser, was taken as one.
- **Guard:** code: `packages/scripts/src/gate.test.ts` `a package's own gate holds no time limit (Selah's native gate, firsttheblade's promise check): a check with a time limit is its gate:timed, run with the tests`

### cpu-bound-cases-run-serial

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The Media cases encode three at a time, each limit holding its siblings' work"
- **Source:** p6-testspeed/findings.md F6
- **Wrong:** Three Media cases failed their 5 s limit in a warm gate at load 39 to 46: the suite ran its encodes three at a time, and its slowest case took 0.77 to 1.07 s alone at load 30, against 0.57 to 0.63 s one after another.
- **Cause:** `describe.concurrent` over cases that each encode on the CPU puts the siblings' work inside each case's limit.
- **Guard:** skill: whether a case's work is on the CPU or waits on something is a reading of what it does, which no rule sees. Carried by `packages/film/README.md`: "runs them one after another (`describe`, not `describe.concurrent`):"

### lazy-fixture-rule-reads-curried-memos

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Curried TTL caches bypass the fixture guard"
- **Source:** p6-testspeed/review-2.md F1
- **Wrong:** `film/no-lazy-test-fixture` passed `Effect.cachedWithTTL('1 minute')(read)` and a named TTL helper applied where the file loads, each a memo the first case to ask builds inside its limit.
- **Cause:** The rule read a memo maker's own call and a pipe's steps, not a maker applied by a call of its own or through a name.
- **Guard:** lint:film/no-lazy-test-fixture, proof `packages/film/lint/fixtures/no-lazy-test-fixture.ts` `export const named = withinMinute(read); // RED film/no-lazy-test-fixture`

### test-git-rule-follows-spreads

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The Git guard accepts the original faulty fixture"
- **Source:** p6-testspeed/review-2.md F2
- **Wrong:** `film/test-git-config` passed the base `guard/files.test.ts`, whose `AS_TEST` held three settings spread into git's arguments, the very file whose delete the maintenance lock broke.
- **Cause:** The rule took an array as git's only by a name that says git or a call it is handed to, not by where it is spread.
- **Guard:** lint:film/test-git-config, proof `packages/film/lint/fixtures/test-git-config.ts` `const AS_TEST = ['-c', 'user.name=t', 'commit']; // RED film/test-git-config`

### lazy-fixture-rule-spares-flows

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Deferred function composition is rejected as a shared fixture"
- **Source:** p6-testspeed/review-2.md F3
- **Wrong:** `film/no-lazy-test-fixture` reported `flow(Effect.cached, Effect.flatten)` where the file loads, a helper whose every call makes its own memo.
- **Cause:** The rule read a memo maker handed to any call as a pipe step, `flow` among them.
- **Guard:** code: `packages/film/lint/fixtures/no-lazy-test-fixture.ts` `it.effect('applies a flow in its own case', () => Fx.flatten(composed(read)));`

### docs-name-renamed-scripts

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Firsttheblade’s README names the removed task"
- **Source:** p6-testspeed/review-2.md F4
- **Wrong:** The firsttheblade README said the app's `gate` is `bun run contrast` after the script became `gate:timed`.
- **Cause:** The sentence names a script, not a file, so no docs check reads it when the script is renamed.
- **Guard:** skill: a sentence's claim goes stale with no file named in it changing, which only a reader sees. Carried by `CLAUDE.md`: "A sentence's claim goes stale with no name in it changing, so the docs test cannot see it"

### docs-count-plugin-rules

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The film README counts twenty-five plugin rules after the unit added two"
- **Source:** p6-testspeed/findings.md F7
- **Wrong:** The film README said twenty-five of the plugin's rules have an asserted message after the unit's two rules made twenty-seven.
- **Cause:** A count in words changes with no name in its sentence changing.
- **Guard:** skill: a count in a sentence is a claim only a reader holds to the code. Carried by `CLAUDE.md`: "a unit's review request carries this list, and the reviewer reads those lines"

### series-script-place-true

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The series list has empty slots (26 and 28) and stale \"of 13\" counts in script headers"
- **Source:** series-tidy/findings.md F1
- **Wrong:** The theology scripts' headers said "2 of 13", "3 of 13" and "5 of 13" after the plan grew to 44 episodes, and the plan said 43 episodes and kept 26 and 28 empty with lettered numbers between.
- **Cause:** A header's count is a copy of the plan's size, and nothing read the copy against the plan when an episode was added.
- **Guard:** code: `apps/animations/scripts.test.ts` `placeFaults`

### renumber-reads-prose-references

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "two episode references remain stale"
- **Source:** series-tidy/review-1.md F1
- **Wrong:** After the theology renumber, `series/theology/series.md` still said "05's landing" and `series/delivery.md` "theology 05's heaven", both meaning The Word Made Flesh, now 08.
- **Cause:** The renumber's scans matched file names, T-codes and bare numbers, and a possessive in prose is none of those; a number in a sentence has no name a test can follow.
- **Guard:** skill: an episode number in prose is a claim only a reader holds to the renumber's map. Carried by `apps/animations/series/README.md`: "A renumber reads every reference against its old-to-new map, possessives and prose included"

### series-plan-numbered-in-order

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "the plan reader accepts letters"
- **Source:** series-tidy/review-1.md F2
- **Wrong:** The place test read a plan's entries with an optional letter, so a plan could grow `44b`, a gap or a duplicate again and every test stayed green while no script sat on that entry.
- **Cause:** The test held scripts to their plan but never held the plan's own numbers to their count.
- **Guard:** code: `apps/animations/scripts.test.ts` `planFaults`

### code-chip-font-under-button-reset

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The mark chips do not get the font that `.st-code-chip` sets"
- **Source:** p6-studio-steps/review-4.md F1
- **Wrong:** A mark's chip that seeks was set in Geist on an 18 px line while a plain chip was set in the code's mono face, so the band's chips differed by whether they could be pressed.
- **Cause:** The chip's font sat on one class (0,1,0), and the studio's button reset `.st-app button:where(…) { font: inherit }` (0,1,1) outranked it on a button.
- **Guard:** code: `packages/film/e2e/lab/studio/code.dom.test.ts` `chip.fontFamily === code.fontFamily`

### mail-send-claimed-before-it-goes

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "A failed send record permits duplicate mail"
- **Source:** ftb-mail/review-1.md F1
- **Wrong:** The film's delivery sent the letter and then recorded it, so a record that failed after a good send left the subscriber waiting, and the queue's retry sent the film again.
- **Cause:** The send was made idempotent by its record alone, which lands after the side effect it guards.
- **Guard:** code: `apps/firsttheblade/src/mail/mail.test.ts` `a letter sent whose outcome could not be kept is never sent again`

### signup-work-after-the-answer

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Signup timing exposes list state"
- **Source:** ftb-mail/review-1.md F2
- **Wrong:** The sign-up gave every address the same 303, but a new address's answer waited for its confirm letter and a confirmed one's did not, so the time told who was on the list.
- **Cause:** The same answer was taken for the same response; the work that depends on the address ran before it.
- **Guard:** code: `apps/firsttheblade/src/mail/mail.test.ts` `the answer comes before the list or the mailer is touched, the same for every address`

### one-click-leave-reads-no-body

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Multipart one-click unsubscribe returns a forbidden redirect"
- **Source:** ftb-mail/review-1.md F3
- **Wrong:** The leave route read a one click only from the urlencoded body text, so a multipart one click left the list and was answered with a 303, which RFC 8058 forbids.
- **Cause:** The route told a mail app from the page's button by the body's spelling, one of the two encodings the RFC allows.
- **Guard:** code: `apps/firsttheblade/src/mail/mail.test.ts` `a mail app's one click leaves in either form encoding, never redirected (RFC 8058)`

### confirm-hour-survives-leaving

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Rejoining resets the hourly confirmation limit"
- **Source:** ftb-mail/review-1.md F4
- **Wrong:** Joining again after leaving cleared `confirm_sent_at`, so leave and sign-up in turn sent a confirm letter each time, past the hour between them.
- **Cause:** One column held two meanings, the newest link and the start of the hour, and the rejoin cleared it for the first.
- **Guard:** code: `apps/firsttheblade/src/mail/list.test.ts` `leaving and joining again does not start the hour between confirm letters again`

### film-letter-made-before-its-claim

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Signing failure permanently blocks an unsent film"
- **Source:** ftb-mail/review-2.md F1
- **Wrong:** The delivery claimed a film's send and then signed the letter's token, so a signing defect left the send claimed with no letter sent, and every retry passed the subscriber over.
- **Cause:** At-most-once was taken from the claim, and work that can fail stood between the claim and the send.
- **Guard:** code: `apps/firsttheblade/src/mail/mail.test.ts` `a film letter that cannot be made claims nothing, and the next try sends it`

### background-work-catches-every-cause

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Background defects bypass logging and claim cleanup"
- **Source:** ftb-mail/review-2.md F2
- **Wrong:** The sign-up's work after the answer caught typed failures only, so a defect left no log line and kept the confirm letter's claim for the hour.
- **Cause:** Work no caller awaits has no one to surface a defect but itself.
- **Guard:** code: `apps/firsttheblade/src/mail/mail.test.ts` `a confirm letter that cannot be made is logged, and the next try sends it`

### deferred-work-reads-its-own-time

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "A delayed sign-up can issue an unusable newest link"
- **Source:** ftb-mail/review-2.md F3
- **Wrong:** The sign-up read its issue time in the request and claimed with it later, so a leave between the two made the newest link one that never confirms, and it used up the hour.
- **Cause:** A time taken before work was moved out of the request kept its old place.
- **Guard:** code: `apps/firsttheblade/src/mail/mail.test.ts` `a sign-up whose work runs after the address leaves sends a link that confirms`

### background-test-starts-work-at-once

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The ordering test proves behavior its fake supplies"
- **Source:** ftb-mail/review-2.md F4
- **Wrong:** The test that the sign-up answers before its work held the work until it was settled, while Alchemy's `waitUntil` starts it at once, and the doc said the work runs after the answer.
- **Cause:** The test double was built for the order wanted, not the one the host gives.
- **Guard:** code: `apps/firsttheblade/src/mail/mail.test.ts` `a sign-up is answered while its letter is still being sent`

### send-claim-checks-the-subscriber

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "A completed unsubscribe does not prevent a new send claim"
- **Source:** ftb-mail/review-3.md F1
- **Wrong:** The delivery checked that the subscriber was confirmed, made the letter, then claimed the send by its key alone, so one who left while the letter was made was still sent the film.
- **Cause:** The check and the claim were two statements, and work was put between them.
- **Guard:** code: `apps/firsttheblade/src/mail/mail.test.ts` `a subscriber who leaves while their letter is made is not sent it`

### docs-follow-a-changed-contract

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Two descriptions retain the incorrect response ordering"
- **Source:** ftb-mail/review-3.md F2
- **Wrong:** The Worker's mail module and the firsttheblade README still said a sign-up's work runs after its answer once the background port said the answer only does not wait for it.
- **Cause:** The contract's wording was corrected where the finding pointed, and the same claim in other files names no file the change touched.
- **Guard:** skill: a sentence's claim goes stale with no file named in it changing, which only a reader sees. Carried by `CLAUDE.md`: "A sentence's claim goes stale with no name in it changing, so the docs test cannot see it"

### rebase-leaves-no-marker

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Rebase leaves a conflict marker in the lessons ledger"
- **Source:** ftb-mail/review-4.md F1
- **Wrong:** The rebase of ftb-mail onto origin/main kept both sides of each append to `docs/lessons.md` but left diff3's base line, `||||||| parent of …`, in three commits.
- **Cause:** The resolver read only the two-way conflict form, and git rerere replayed its resolution on the second try.
- **Guard:** code: `packages/scripts/src/merge-audit.ts` `each: Flag.String('each')`

### contact-rule-waits-for-verified-inbox

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Contact provisioning runs before destination verification"
- **Source:** ftb-mail-2/review-1.md F1
- **Wrong:** The prod stack declared the rule forwarding hello@firsttheblade.com in the same deploy that registered the owner's inbox, while Email Routing takes a forward only to a verified destination and Alchemy's Address does not wait for the verification.
- **Cause:** The resources were wired by their props, and the provider contract (verified first, a human click between) was not read for its order.
- **Guard:** skill: the verification is a click in the owner's inbox that only Cloudflare sees, so no local test reaches it. Carried by `apps/firsttheblade/README.md`: "only to a verified destination, so the rule is declared once `.env` says"

### stage-isolation-names-shared-resources

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The stage guide gives a false isolation guarantee"
- **Source:** ftb-mail-2/review-1.md F2
- **Wrong:** The README and the Site Worker's doc still said a throwaway stage never touches the domain after every stage was made to reconcile the shared sending domain.
- **Cause:** The claim sat in files about the site's hostnames, and the change that made the domain shared named neither line.
- **Guard:** skill: a sentence's claim goes stale with no file named in it changing, which only a reader sees. Carried by `CLAUDE.md`: "A sentence's claim goes stale with no name in it changing, so the docs test cannot see it"

### letter-tests-use-the-sent-path

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Postal footer tests bypass the production configuration path"
- **Source:** ftb-mail-2/review-1.md F3
- **Wrong:** Every postal test passed the address to the letters explicitly, while the list's own calls take the default, so a default that stopped reading `POSTAL_ADDRESS` stayed green.
- **Cause:** The test was written against the parameter it added, not the call the product makes.
- **Guard:** code: `apps/firsttheblade/src/mail/letters.test.ts` `the letters the list sends carry POSTAL_ADDRESS`

### confirm-in-one-step

- **Date:** 2026-10-20
- **Kind:** owner
- **Said:** "I had to press the confirm on the email and then I had to press confirm again on the website. Let's make that one step"
- **Source:** the owner's live test of the email list on the stage agent-mailtest, 2026-10-20
- **Wrong:** Confirming took two presses: the button in the letter, then the button on the confirm page.
- **Cause:** The confirm page waited for its button so mail scanners, which open links, would confirm no one, and nothing pressed it for a person who had already pressed once in the letter.
- **Guard:** code: `apps/firsttheblade/src/confirm.test.ts` `is one step: the confirm page's form carries the id the browser's entry posts as it opens`

### kit-return-focus-states-the-ring

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "the kit's return focus left the ring to the browser after an owner's own close"
- **Source:** p6-studio-cssdocs/findings.md F1
- **Wrong:** After ⌘K's chosen row closed it, the kit gave the focus back to the opener with a plain focus, so whether the opener showed the ring was Chromium's guess, not the input's.
- **Cause:** The kit's return focus asked for the ring only when the close came with a key's event, and ⌘K closes by its owner's `open` with none.
- **Guard:** code: `packages/ui/test/browser/dialog.test.ts` `shows the ring on the opener when a key closed it`

### focus-watch-armed-before-initial-focus

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "the Record case read the recorder's own initial focus as the next command's move"
- **Source:** p6-studio-cssdocs/findings.md F2
- **Wrong:** The focus property's Record case failed 1 run in 24 alone and 4 in 6 under load, naming the recorder's Close as moved to by a key with no ring, though a pointer had opened the recorder.
- **Cause:** The kit's initial focus lands a frame after the recorder mounts; the case reopened the recorder by a click and armed its watch for the next command before that frame ran.
- **Guard:** code: `packages/film/e2e/lab/focus-follows-input.dom.test.ts` `FRAMES_SETTLED`

### kit-return-ring-on-text-fields-only

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "pointer return focus treats sliders and checkboxes as text fields"
- **Source:** p6-studio-cssdocs/review-1.md F2
- **Wrong:** The kit's return focus after a pointer close asked for the ring on any enabled input, so a range or a checkbox the popup gave the focus back to rang though the pointer closed it.
- **Cause:** The ring rule reused `isTypeableElement`, which means any input a key reaches, where the rule needs a field the user types into.
- **Guard:** code: `packages/ui/test/browser/dialog.test.ts` `shows no ring on a range opener when a pointer closed it: a range is pressed, not typed in`

### reset-guard-reads-specificity

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "the reset guard checks syntax instead of specificity"
- **Source:** p6-studio-cssdocs/review-1.md F3
- **Wrong:** The reset guard refused `:where(.a) > :where(button)` and a list of `:where`s, which weigh nothing, and let `.a button { font : inherit; }` pass, which weighs (0,1,1).
- **Cause:** It read a rule's whole selector list as one selector, a combinator as weight, and the declaration by one spelling.
- **Guard:** code: `packages/film/src/lab/resets.test.ts` `weighs`

### doc-token-is-the-one-read

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "the new studio prose names the wrong width token"
- **Source:** p6-studio-cssdocs/review-1.md F4
- **Wrong:** The design language said the studio's inspector sits at `--inspector-w` (320 px, the review's inspector sheet), while the studio's grid reads `--st-insp-w`, 460 px from `INSPECTOR_W`.
- **Cause:** The prose named the token by its role, and two tokens share the role; nothing reads a token in prose against the selector that consumes it.
- **Guard:** skill: which token a part reads is a claim about a rule's `var(--…)`, and a token of the same name role exists elsewhere, so no anchor check can tell them apart. Carried by `design-language/design-language.md`: "A token this document names for a part is the one that part's own rule reads"

### removed-consumer-strands-an-export

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "bar removal leaves an unused public export"
- **Source:** p6-studio-cssdocs/review-1.md F1
- **Wrong:** Removing the preview's bar left `@bible/ui/press` re-exporting `LONG_PRESS_DELAY`, which only the bar's held tick read, and the gate went red on it.
- **Cause:** The removal followed the bar's own imports out of the film and stopped at the package edge, so the kit's re-export of what the bar alone took stayed.
- **Guard:** code: `packages/scripts/src/dead-exports/graph.ts` `deadExports`

### concept-keeps-the-kept-picture

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The kept closing picture was rewritten"
- **Source:** in-its-order/review-1.md F1
- **Wrong:** The film's `thesis` picture replaced the kept draft's three-word answer, GROW IN GRACE, with a full-screen card of the whole 14-word verse and a hard cut, past CRAFT rule 1's 12 words; the fix sets the take's first clause, "Grow in grace", as the card.
- **Cause:** The move of the sky lettering onto a card, which rule 1 asks, was made by carrying the whole say over, not the draft's own three words.
- **Guard:** skill: whether a picture keeps the draft's intent is read beside the draft, and no check reads a picture's prose. Carried by `.claude/skills/film/SKILL.md`: "make the smallest change that holds the rule and name it in the set as a question for the owner; never rewrite the kept text silently"

### cast-dress-change-goes-to-the-owner

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Jeremiah’s costume contradicts the kept Cast"
- **Source:** in-its-order/review-1.md F2
- **Wrong:** Jeremiah's `look.md` drew an olive mantle where the kept Cast row says a camel mantle, and the ledger recorded no change. The olive stays: camel drew as Christ's walnut in all 23 of his tries (dE 1–8 from walnut, measured), and a Bible figure confusable with Christ breaks a standing rule; the set now names the change as the owner's question.
- **Cause:** The change was made to answer the route's drift and was told only in the set's prose, not put to the owner.
- **Guard:** skill: the route's colour drift shows only in the drawn tries, and the choice between the kept dress and the Christ rule is the owner's. Carried by `.claude/skills/film/SKILL.md`: "Where a house rule or the image route forces a change (lettering a card must carry, a colour the route draws as Christ's)"

### look-shade-keeps-saturation

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "Two looks specify desaturated grey shades"
- **Source:** in-its-order/review-1.md F3
- **Wrong:** Jeremiah's and the sower's looks named violet-grey shades, #5f5f66 and #5c5f66, whose saturation falls from 0.227 to 0.069 and from 0.305 to 0.098; they are now #5e5470 and #5a4f74 (0.250 and 0.319, measured).
- **Cause:** The shade was picked for its hue's direction and its value, and its saturation was not measured against the base.
- **Guard:** skill: a `look.md` is prose the image route reads, and no check parses its colours. Carried by `.claude/skills/film/CRAFT.md`: "a shade keeps or raises its saturation as its value drops"

### film-comment-tells-no-draft-history

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "A comment recounts the previous presentation"
- **Source:** in-its-order/review-1.md F4
- **Wrong:** The film's `script.ts` header said how the draft drew the thesis and how the film now differs, which is the text's history; it now says what the card holds and why.
- **Cause:** The comment was written while the draft and the film were being compared, and kept that comparison.
- **Guard:** skill: the judged history rule only warns (now 4 positives in its corpus, `packages/scripts/src/judged/fixtures/history-comment.json`), so a reader holds it. Carried by `CLAUDE.md`: "A comment says what the code does now and why"

### confirm-without-reload

- **Date:** 2026-10-20
- **Kind:** owner
- **Said:** "when we open the confirm link, it kind of flashes. It goes from one state to the next. It's kind of janky a bit."
- **Source:** the owner's confirm of the live email list, 2026-10-20
- **Wrong:** The confirm page showed its words and button, then reloaded into the confirmed page: two pages and a flash for one step.
- **Cause:** The one-step confirm submitted the form as the page opened, so the browser loaded a second page, and the press stayed visible until it did; drawing the answer in place still swapped one set of words for another, so the page now opens on a skeleton of the notice and the answer's words arrive into it.
- **Guard:** code: `apps/firsttheblade/src/confirm.test.ts` `loads into the next step: a skeleton while the post runs, the answer drawn in place, the button only with no script`

### ai-sounding-site-copy

- **Date:** 2026-10-20
- **Kind:** owner
- **Said:** "Also, my wife made some comments that a lot of the copy here feels a little AI generated, if we can kind of tweak it."
- **Source:** the owner's message on the First the Blade site, 2026-10-20 (unit ftb-copy)
- **Wrong:** The site's words read as if no one wrote them: stock phrases ("from its first principles to its deepest truths", "one step at a time", "coming soon"), the "not X but Y" turn ("a promise, not a program") and tidy runs of three.
- **Cause:** The copy was written to sound like the series' voice rules, phrase by phrase, and nothing read it back as plain speech.
- **Guard:** code: `apps/firsttheblade/src/copy.test.ts` `the site's words hold no stock phrase, no not-X-but-Y turn and no em-dash`

### light-from-the-sun

- **Date:** 2026-10-21
- **Kind:** owner
- **Said:** "Also, it's kind of weird to have light shimmering here and the sun here."
- **Source:** the owner's notes on the First the Blade hero, 2026-10-21 (unit ftb-motion brief, note 1); he circled the light rays at the top left and the sun at the right
- **Wrong:** The hero's painted field threw its light rays down from the top-left corner while its sun sat low on the right horizon, so the light came from no sun.
- **Cause:** The field was painted as one picture, its rays and its sun each drawn for themselves, and nothing held the light to its source.
- **Guard:** code: `apps/firsttheblade/kit/field-still.test.ts` `are each the still the owner approved, byte for byte, under the ask that showed him them`, `apps/firsttheblade/kit/field-still.test.ts` `refuse any change to a served still until the owner approves it`, `apps/firsttheblade/src/motion/sun.test.ts` `never grows brighter as it goes out of the sun, in any direction`. They hold the rules: "Every shipped field still, at every srcset size, is byte-identical to one the owner approved by name", and "Every image the site serves is in the approval record or in a named list of images outside the rule, each with its reason" (`OUTSIDE`, `apps/firsttheblade/kit/served.ts`). The record is `apps/firsttheblade/kit/approved-stills.json`; whether a still's light comes from the sun is the owner's look, given through a lab ask with 1:1 crops.

### field-old-rays-on-left-hills

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "faint traces of the old top-left rays remain on the far-left hills"
- **Source:** ftb-motion/self-findings.md F1
- **Wrong:** The repainted field keeps faint diagonal streaks of the old top-left rays on its far-left hills, clear at 2x and faint at 1:1.
- **Cause:** The kit paints the left of the sky again from its clear middle columns, and the hills are land, which it leaves as painted; the still's guard reads the sky's light alone (`skyLight`), so it does not see them. A streamline inversion to lift them failed.
- **Guard:** code: `apps/firsttheblade/kit/field-paint.test.ts` `takes a streak’s step off its hill, so no edge is left across it`, `apps/firsttheblade/kit/field-paint.test.ts` `each has its step on the master, and the shipped still has none across it`. The owner chose to lift the streaks from the painting (ask a714e0e2d89); how faint a trace may stay is his eye on the stills.

### taught-card-stir-looks-like-rest

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the Taught of the Lord card at full stir looks like its rest"
- **Source:** ftb-motion/self-findings.md F2
- **Wrong:** The Taught of the Lord card's leaf turns from scaleX 1 to -1, so the hovered card's end state is the mirror of its rest and a still of it shows almost no change.
- **Cause:** The stir is the leaf's turn itself, and only the turn moves.
- **Guard:** none: declined; the turn is the brief's "the book turns a leaf", and whether its end state should differ is a design call the owner makes on the video.

### field-canvas-without-mipmaps

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the field's canvas samples its still without mipmaps"
- **Source:** ftb-motion/self-findings.md F3
- **Wrong:** The field's canvas draws its still with linear filtering and no mipmaps, so its edges differ faintly from the browser's own downsizing at strong magnification (56.3 dB PSNR in the field band).
- **Cause:** The srcset picks a still within 2x of the canvas, where mipmaps add blur.
- **Guard:** none: declined; the measured takeover is below sight, and mipmaps would blur the field against its still.

### field-light-guard-reads-the-still

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the light guard never reads the shipped still, so a still with the old top-left rays passes the gate"
- **Source:** ftb-motion/round-1-findings.md F1
- **Wrong:** `lightFromTheSun` checked only the procedural `sunLight` the kit lays on, never a still's pixels, so the base's stills with the old top-left rays passed every test when swapped back in.
- **Cause:** The guard was written against the light the kit computes, not the picture it ships.
- **Guard:** code: `apps/firsttheblade/kit/field-still.test.ts` `refuse any change to a served still until the owner approves it`, `apps/firsttheblade/kit/field-still.test.ts` `refuse every light the earlier light guards let through`. They hold the rules: "Every shipped field still, at every srcset size, is byte-identical to one the owner approved by name", and "Every image the site serves is in the approval record or in a named list of images outside the rule, each with its reason" (`OUTSIDE`, `apps/firsttheblade/kit/served.ts`). The record is `apps/firsttheblade/kit/approved-stills.json`; whether a still's light comes from the sun is the owner's look, given through a lab ask with 1:1 crops.

### night-smoothstep-edges-in-order

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "three smoothstep calls in the night shader pass their edges high first, which GLSL ES 3.00 leaves undefined"
- **Source:** ftb-motion/round-1-findings.md F2
- **Wrong:** `NIGHT_FRAGMENT` wrote its falls as `smoothstep(0.47, 0.4, …)`, `smoothstep(0.09, 0.0, …)` and `smoothstep(0.3, 0.16, …)`; GLSL ES 3.00 leaves the result undefined when the first edge is not below the second, so a driver may draw no sky, no stars or no dark.
- **Cause:** A fall was written by swapping the edges, which the drivers it was looked at on happen to draw as meant.
- **Guard:** code: `apps/firsttheblade/src/motion/shaders.test.ts` `write each smoothstep with its lower edge first`

### motion-texture-per-unit

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "each picture load makes a new texture and leaks the one before it, and the context is never released"
- **Source:** ftb-motion/round-1-findings.md F3
- **Wrong:** The scene made a new texture each time its picture loaded a larger file and never deleted the one before, and an ended scene left its WebGL2 context for the collector.
- **Cause:** The texture was made where it was filled, so filling it again made another; the context was not a resource of the scene's scope.
- **Guard:** none: the leak is bounded by the srcset's three files and freed with the canvas; the repair is in the structure: one texture per unit filled again on load, and the context acquired with a release that calls `loseContext()` (`apps/firsttheblade/src/motion/scene.ts`).

### tests-state-behaviour-not-the-code

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "some new tests restate the code or its formatting instead of a behaviour"
- **Source:** ftb-motion/round-1-findings.md F4
- **Wrong:** `emblems.test.ts` imported `LEAF`, exported only for it, and expected the drawing to contain it, so a corrupted leaf stayed green; `styles.test.ts` matched exact stylesheet text, so a reformat turned it red with nothing changed.
- **Cause:** The expected values were taken from the module and the file's text instead of written from what the reader sees.
- **Guard:** skill: whether an expected value restates its module is a reading of the test, not a property code can check. Carried by `apps/firsttheblade/README.md`: "A test writes its expected value itself and never imports it from the module under test; a style test asserts parsed rules under their media queries, not formatted stylesheet text."

### lead-hands-off-cuffs

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "hand diameter: no round hand beside the body"
- **Source:** rbf-lead/findings.md F2
- **Wrong:** After the lead was traced with sleeves, every scene still drew his circle hands at the plain lead's rest points, 30 to 60 units off his cuffs, bobbing on their own.
- **Cause:** Each host kept its own hand points, and nothing tied a hand to the arm it ends.
- **Guard:** code: `apps/animations/src/films/righteousness-by-faith/rigs/lead-rig.ts` `reachHands`

### elbow-on-its-rest-side

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "the near arm held the open hand out with its upper sleeve level from the shoulder"
- **Source:** rbf-lead/findings.md F3
- **Wrong:** The reach chose the elbow out from the body, which for a hand held out beside him is the elbow above the line, and a choice by a fixed direction flipped the elbow as a hand swept across it.
- **Cause:** Of the two elbows that reach a point, the choice was a fixed direction, not the side the arm comes from.
- **Guard:** code: `packages/film/src/style/figure.test.ts` `bends with the elbow on the side of the line to the point its hand hangs on at rest`

### traced-ink-spikes

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "the silhouette's line jagged along the arms and zigzagged in loops where the neck meets the shoulders"
- **Source:** rbf-lead/findings.md F4
- **Wrong:** The lead's first trace took a point at every 3 to 4 sheet pixels, and the house's smoothing turned their wobble into spikes and loops.
- **Cause:** The tracer followed the sheet's edge pixel by pixel.
- **Guard:** skill: the trace is a tool run by hand on a sheet, outside the repo's code. Carried by `.claude/skills/film/RIVE.md`: "A figure's outlines traced from its concept sheet take a point every 8 sheet pixels or more"

### traced-row-astray

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "a bump on the near arm's outer edge at its elbow"
- **Source:** rbf-lead/findings.md F5
- **Wrong:** One row of the sheet read the near sleeve's edge 10 px out, off a curl of the hair, and the sleeve kept a knob there.
- **Cause:** Each row's edge was taken alone.
- **Guard:** skill: the trace is a tool run by hand on a sheet, outside the repo's code. Carried by `.claude/skills/film/RIVE.md`: "An edge read row by row takes the median of three rows"

### traced-hair-over-face

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "A long lock of hair sweeps from the crown down across the right side of the face"
- **Source:** rbf-lead/findings.md F6
- **Wrong:** The lead's traced hair ran a lock over his far temple and brow, and his fringe kept a notch where skin showed through.
- **Cause:** The trace closed the hair with the ears behind it and never cut the face's skin or the brows out again; the dark between two curls left a gap open to the face.
- **Guard:** skill: the trace is a tool run by hand on a sheet, outside the repo's code. Carried by `.claude/skills/film/RIVE.md`: "A mass traced from a sheet and closed to fill its gaps (the hair) is cut again by the parts in front of it after the closing"

### hem-ink-over-trousers

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The band across the waist under the sweater hem is outline-black, where the concept's is brown."
- **Source:** rbf-lead/findings.md F7
- **Wrong:** The lead's top drew its outline along its hem over his trousers, where the sheet draws no line.
- **Cause:** The garment's line ran round its whole outline, and the trousers lay behind all of it.
- **Guard:** code: `packages/film/src/style/figure.test.ts` `a garment over trousers draws its line just behind the trousers' line, so their paper covers it under the hem; over other feet, no rule`

### shoulder-turns-with-arm

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The right shoulder rides up against the jaw while the left slopes away"
- **Source:** rbf-lead/findings.md F8
- **Wrong:** When the lead held his hand out, his far shoulder rose against his jaw.
- **Cause:** The upper sleeve held the whole shoulder from the neck, so the shoulder turned with the arm about its pivot.
- **Guard:** skill: the sleeve's shape is traced by hand from a sheet, outside the repo's code. Carried by `.claude/skills/film/RIVE.md`: "A jointed arm's upper sleeve ends at its shoulder in a ball about its pivot"

### leg-split-ragged

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The dark split between the legs starts below the hem in a ragged tip."
- **Source:** rbf-lead/findings.md F9
- **Wrong:** The split between the lead's legs began in a ragged notch.
- **Cause:** The two legs met edge to edge above the split, and each one's boil opened a notch where they parted.
- **Guard:** skill: the legs are traced by hand from a sheet, outside the repo's code. Carried by `.claude/skills/film/RIVE.md`: "Two legs traced side by side run past the middle at their tops so they overlap"

### elbow-on-its-pivot

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "A zero-length upper arm passes both `JointedArm` and `figure` validation."
- **Source:** rbf-lead/review-1.md F1
- **Wrong:** A jointed arm whose elbow lay on its shoulder's pivot was made, and a reach of it answered NaN for its turn, its bend and its hand.
- **Cause:** The figure checked that the elbow lay inside both sleeves, and nothing checked that the upper sleeve had a length.
- **Guard:** code: `packages/film/src/style/figure.test.ts` `whose elbow lies outside either sleeve or on its shoulder's pivot, or whose hand lies short of its forearm's end, is refused`

### traced-table-unread

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "`COLOURS` has no production consumer; `papers.ts` separately defines the palette."
- **Source:** rbf-lead/review-1.md F2
- **Wrong:** The lead's traced file exported the sheet's colours as a table that no module read.
- **Cause:** The tracer wrote every table it measured, and the film's papers took their colours by hand.
- **Guard:** skill: the tracer is a tool outside the repo's code, and the dead-export check sweeps packages, not a film's modules. Carried by `.claude/skills/film/RIVE.md`: "A tracer writes only the tables its rig reads"

### comment-names-old-kind

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The comment still describes the lead as “a round head.”"
- **Source:** rbf-lead/review-1.md F3
- **Wrong:** RBF's rig test called the lead a round head after his head was traced.
- **Cause:** The comment named the lead's part kind in words, and the change of kind touched the rig file, not the test.
- **Guard:** skill: a comment's words about another file's part kind carry no name a check can follow. Carried by `CLAUDE.md`: "A comment says what the code does now and why"

### repo-json-fill-counts-comma

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`repoJson` fills a number line to 101 characters and keeps an exponent's `+`"
- **Source:** p6-casttools/review-1.md F1
- **Wrong:** `repoJson` wrote a filled number line one column past oxfmt's width, and wrote `1e+30` where oxfmt writes `1e30`.
- **Cause:** The fill measured each number without the comma that follows it, and the scalars were written by `JSON.stringify`, which keeps an exponent's plus.
- **Guard:** code: `packages/film/src/core/schema.test.ts` `breaks a filled line before a number its comma would carry past the line, and drops an exponent's plus`

### retry-holds-smaller-to-anchor

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "a retry tells a smaller figure to stand as tall as the grown one, with the grown one's head"
- **Source:** p6-casttools/review-1.md F2
- **Wrong:** A cast sheet's retry told a child to stand as tall as the anchor, with the anchor's head and hands.
- **Cause:** The drift sentences held every view to the anchor's numbers, and the record's per-view stature reached the measure but not the retry's words.
- **Guard:** code: `packages/film/src/tools/cast-sheet-make.test.ts` `is briefed and underlaid at its own heads, its smaller figure smaller, with no hair paragraph`

### concept-cli-reads-the-record

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`concept measure` and `concept brief` cannot take a smaller figure"
- **Source:** p6-casttools/review-1.md F3
- **Wrong:** `film concept brief` and `measure` by hand could not name a smaller figure, so they printed another prompt and flagged a child that `cast` passes.
- **Cause:** The two commands took one flag per field of the sheet, and the record gained fields that no flag carried.
- **Guard:** code: `packages/film/src/tools/concept-cli.test.ts` `measure the smaller figure at the record's share and heads, where the canon's flags it` and `packages/film/src/tools/concept-cli.test.ts` `brief the prompt the member's record paints from: its smaller figure, and no hair`

### smaller-figure-test-cannot-fail

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the measure test of the smaller figure cannot fail"
- **Source:** p6-casttools/review-1.md F4
- **Wrong:** The measure's smaller-figure test passed with the heads factor removed and with no hold on the child at all.
- **Cause:** The test gave the child the grown member's heads, so the factor cancelled, and it asserted only that nothing was flagged.
- **Guard:** code: `packages/film/src/core/cast-sheet-poses.test.ts` `flags a smaller figure drawn at the grown height, or with the grown head`

### preview-head-by-own-heads

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the preview's head fallback scales the anchor's head by height only"
- **Source:** p6-casttools/review-1.md F5
- **Wrong:** A child whose head did not read was cut in the preview at the anchor's head scaled by height, about 18 % too large.
- **Cause:** The fallback left out the two figures' own heads, and a smaller figure's head is a larger share of its height.
- **Guard:** code: `packages/film/src/core/cast-preview.test.ts` `cuts a smaller figure whose head does not read at its own head, never the anchor's share of its height`

### stamp-owned-by-the-store

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "only the MCP has the stamp's refusals, as strings, and the plan docs disagree about them"
- **Source:** p6-casttools/review-1.md F6
- **Wrong:** `publish_set` refused a production with no ledger and an unopened version, and `film publish` stamped both.
- **Cause:** The MCP wrote its own check as strings beside the store's `publish`, so the rule had two owners, and the two plan docs said opposite things.
- **Guard:** code: `packages/film/src/tools/lab-mcp.test.ts` `refuses a production with no ledger, a version never opened and a version with no production alike through publish_set and film publish, and stamps nothing`

### publish-waits-on-a-held-lab

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`film publish` waits on the lab with no time limit before it prints"
- **Source:** p6-casttools/review-1.md F7
- **Wrong:** `film publish` stayed silent while a lab held its call, though the stamp had landed.
- **Cause:** The listing had no time limit, and the lab client's handshake and session end could not be interrupted.
- **Guard:** code: `packages/film/src/tools/lab-mcp.test.ts` `says the listing is unknown once a lab that takes the call never answers it`

### underlay-sizes-read-loose

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the underlay test passes a child at 2.5 heads in place of 2.2"
- **Source:** p6-casttools/review-1.md F8
- **Wrong:** The underlay's size test passed a child drawn at 2.5 heads where 2.2 was asked.
- **Cause:** The test read the heads with `toBeCloseTo(x, 0)`, half a head either way, and drew no wrong child to reject.
- **Guard:** code: `packages/film/src/core/cast-underlay.test.ts` `tells a child drawn at the wrong heads or the wrong share from the one asked`

### smaller-figure-words-stale

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "two sentences still hold each figure to the anchor and the canon"
- **Source:** p6-casttools/review-1.md F9
- **Wrong:** The measure's check table and the underlay's header still held every figure to the anchor and the canon after smaller figures had their own sizes.
- **Cause:** A sentence's claim goes stale while no name in it changes, so the docs test cannot see it.
- **Guard:** skill: the claim is in words, which no check reads. Carried by `CLAUDE.md`: "a unit's review request carries this list, and the reviewer reads those lines"

### baby-heads-cite-the-owner

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the baby's 2.0 heads could cite the owner's decision"
- **Source:** p6-casttools/review-1.md F10
- **Wrong:** The design doc gave the plain figures' baby no source for its 2.0 heads, and restated the child's band as 0.67.
- **Cause:** The owner decided the baby's heads in chat, and the doc line was written before his decision was relayed.
- **Guard:** skill: an owner's decision is words, which no check reads. Carried by `.claude/skills/film/reference/character-design.md`: "the plain figures' baby at 2.0 heads, as the owner kept it"

### interrupted-handshake-orphans-session

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "an interrupted handshake leaves the lab a session no one ends"
- **Source:** p6-casttools/round-2-findings.md F1
- **Wrong:** The lab client's comment said an interrupted handshake leaves no session to end, though the lab may have opened one whose answer the interrupt dropped.
- **Cause:** The lab names a session only in its answer, and its transport keeps no expiry, so a session whose answer never reached the client stays until the lab restarts.
- **Guard:** none: the transport's missing expiry predates the unit and is its own work; one idle session per held handshake until the lab restarts, as a killed client leaves. The comment in `packages/film/src/tools/lab-client.ts` names it.

### publish-limit-holds-the-session-end

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`film publish` can discard a listing it received, and can take 10 s while it says 5 s"
- **Source:** p6-casttools/round-2-findings.md F2
- **Wrong:** `film publish` printed the listing unknown when the lab answered `sets` and then held the session's DELETE.
- **Cause:** The 5 s limit wrapped the scope, so it counted the session's end as well as the call.
- **Guard:** code: `packages/film/src/tools/lab-mcp.test.ts` `prints the listing the lab gave once its session end is held, within the end's own limit`

### session-end-limit-unguarded

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the F7 guard does not cover the release's time limit"
- **Source:** p6-casttools/round-2-findings.md F3
- **Wrong:** The test for a held lab held `initialize`, so the session's end never ran, and removing the end's time limit left it green.
- **Cause:** The guard held the first request only, and no case let the lab open a session and then hold its end.
- **Guard:** code: `packages/film/src/tools/lab-mcp.test.ts` `prints the listing the lab gave once its session end is held, within the end's own limit`

### verify-ready-wait-no-deadline

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the readiness wait and the doctor's requests have no deadline"
- **Source:** verify-ftb/round-1-findings.md F1
- **Wrong:** `verify:launch` and `verify:drive` retried the home page 200 times with no limit on one try, and the doctor's requests had none either, so a preview that took the connection and never answered held both forever instead of ending in `NotReady` or `DoctorFailed`.
- **Cause:** The retry counted tries, not time, and a fetch waits as long as its own limit allows.
- **Guard:** code: `apps/firsttheblade/scripts/verify/instance.test.ts` `fails a preview that takes the connection and never answers as NotReady, within its wait`; `apps/firsttheblade/scripts/verify/instance.test.ts` `fails at once as NotReady when the preview exits before it answers`; `apps/firsttheblade/scripts/verify/instance.test.ts` `fails the doctor's answers check on a request that never answers`

### verify-preview-reads-root-env

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the preview child process is started without `--no-env-file`"
- **Source:** verify-ftb/round-1-findings.md F2
- **Wrong:** The preview was spawned as `bun <entry>` in the scratch root, so a `.env` put in the root gave it `MAIL_ADMIN_TOKEN`, though its comment said no secret reaches a run.
- **Cause:** The scripts ran with `--no-env-file`, but the child they spawned did not, and Bun reads `.env` from its working directory.
- **Guard:** code: `apps/firsttheblade/scripts/verify/instance.test.ts` `starts the preview with no root's .env read`

### verify-failed-step-keeps-token

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "a failed browser step can keep the confirm URL, with its token, in the proof"
- **Source:** verify-ftb/round-1-findings.md F3
- **Wrong:** A failed step's message and the line its `failed` step kept were Playwright's own words, which name the confirm URL with its live token.
- **Cause:** `redactTokens` covered letters and step URLs, not error messages.
- **Guard:** code: `apps/firsttheblade/scripts/verify/instance.test.ts` `keeps no token in a failed step's message or its kept line`

### verify-launch-clobbers-root

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`verify:drive` (or a second `verify:launch`) in a root that already holds a running preview overwrites its `launch.json`"
- **Source:** verify-ftb/round-1-findings.md F4
- **Wrong:** A second launch in a root checked only its port, then wrote its record over the first preview's, which `verify:stop` could then no longer find.
- **Cause:** The skill stated "a root with no preview running", and no code held it.
- **Guard:** code: `apps/firsttheblade/scripts/verify/instance.test.ts` `refuses a root whose preview still runs`

### verify-hold-counts-capture

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the hold check measures time that includes the evidence capture"
- **Source:** verify-ftb/round-1-findings.md F5
- **Wrong:** The confirm journey timed the skeleton's hold from the link's load to after its own screenshot, ARIA snapshot and `steps.json`, so a slow capture could pass a hold cut to 250 ms.
- **Cause:** The time was read on the drive's clock around its own work, not on the page's.
- **Guard:** code: `apps/firsttheblade/scripts/verify/drive.ts` `markHold`; `apps/firsttheblade/scripts/verify/drive.ts` `heldOn` (a build with the hold at 250 ms fails `verify:drive confirm` at "the skeleton held 260 ms")

### verify-leave-runs-mail-send

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`features/leave.md` tells the reader to run `mail:send`, which defaults to prod and reads the real `.env`, and the file contradicts itself"
- **Source:** verify-ftb/round-1-findings.md F6
- **Wrong:** The leave feature's preconditions and step 2 told a verifier to send a film with `mail:send`, which sends to prod's list with the real admin token unless its origin is given.
- **Cause:** Not recorded.
- **Guard:** skill: whether a verifier runs a command is a choice no check sees. Carried by `.claude/skills/verify-firsttheblade/features/leave.md`: "`mail:send` defaults to prod's origin and loads `.env`: never run it in a verify run until a helper owns the send."

### verify-stop-cwd-substring

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`stop` matches the root's directory by substring"
- **Source:** verify-ftb/round-1-findings.md F7
- **Wrong:** `verify:stop` took a PID whose directory began with the root's path, such as `<root>2`, as that root's preview.
- **Cause:** The `lsof` output was searched with `includes`, not read line by line.
- **Guard:** code: `apps/firsttheblade/scripts/verify/instance.test.ts` `reads a root's directory from lsof by the whole path`

### verify-stage-unproven-unsaid

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the skill offers `verify:stage up` with no note that it is unproven"
- **Source:** verify-ftb/round-1-findings.md F8
- **Wrong:** `SKILL.md` and the not-found feature offered a stage as a way to verify, and only the proof's README said no stage had been deployed.
- **Cause:** Not recorded.
- **Guard:** skill: whether a helper has been proven is a fact of a run, not of the code. Carried by `.claude/skills/verify-firsttheblade/SKILL.md`: "The stage is unproven: no `agent-` stage has been deployed by this helper; report its first run as such."

### verify-try-deadline-untested

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "no test holds the per-try deadline that SKILL.md states"
- **Source:** verify-ftb/round-2-findings.md F1
- **Wrong:** With the per-try `Effect.timeout` removed, a first try that stalled held the wait until its outer deadline, and every test stayed green because the outer deadline ended it as `NotReady` too.
- **Cause:** The tests ended in `NotReady` either way, so neither deadline was told apart.
- **Guard:** code: `apps/firsttheblade/scripts/verify/instance.test.ts` `ends a try that stalls at its own deadline, so the next try is ready`

### verify-refusal-reason-unasserted

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the F4 test also passes on a refusal from the port check"
- **Source:** verify-ftb/round-2-findings.md F2
- **Wrong:** The busy-root test asserted only `Refused`, which the port check also answers, so it held with the root check removed.
- **Cause:** Two checks answer the same tag, and the test read the tag alone.
- **Guard:** code: `apps/firsttheblade/scripts/verify/instance.test.ts` `refuses a root whose preview still runs`

### verify-production-deadlines-untested

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "no test holds the production deadlines, because the tests pass their own through test-only parameters"
- **Source:** verify-ftb/round-2-findings.md F3
- **Wrong:** The deadline tests passed short deadlines of their own, so `READY` or `ANSWER_WITHIN` could grow to minutes with every test green.
- **Cause:** The defaults were parameters' defaults that no test read.
- **Guard:** code: `apps/firsttheblade/scripts/verify/instance.test.ts` `holds the deadlines the skill states: 1 s a try, 20 s a wait, 5 s a request`

### email-cadence-limits

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "The confirmed page drops the email list's limits"
- **Source:** ftb-copy/round-2-findings.md F1 (the review's M1)
- **Wrong:** The plain-copy rewrite cut the confirmed page to "We will email you when each new film is out." It and the confirm letter no longer said one email per film and nothing else, the list's promise that every other page states.
- **Cause:** The rewrite read each sentence for its voice, and nothing held the list's promise to every sentence that says how often we email.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `STATED`; `apps/firsttheblade/scripts/promise-census.ts` `r2-M1 the confirmed page drops "and nothing else"`

### email-promise-found-by-phrase

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the cadence guard misses a rewrite that drops the words \"each new film\""
- **Source:** ftb-copy/round-3-findings.md F1 (repeat of round-2 M1)
- **Wrong:** The guard for the email list's promise checked only the strings that held "each new film" or "each time a new film". "Thank you. We will email you when a new film is out." or "We send one email per film." dropped a limit and passed.
- **Cause:** The guard assumed a sentence about how often we email can be found by its phrases. A rewording leaves the phrases, and the guard with them.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `PROMISE_SENTENCES`; `apps/firsttheblade/scripts/promise-census.ts` `r3-F1 the confirmed page drops "each new film"`

### copy-check-verse-field-order

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the Verse exemption depends on field order"
- **Source:** ftb-copy/round-3-findings.md F2
- **Wrong:** The copy check left out a Verse's `text` only when `text` came before `ref`, so `{ ref, text }` with "Wonderful" failed, and any object with `text` then `ref` passed, Scripture or not.
- **Cause:** It matched the two fields as one run of source text, in one order, and never read the `ref`.
- **Guard:** code: `apps/firsttheblade/src/copy.test.ts` `the checks catch what they are for`

### copy-check-split-turns

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the copy check reads strings, not rendered sentences"
- **Source:** ftb-copy/round-3-findings.md F3
- **Wrong:** A turn or stock phrase split by a JSX expression, an inline element or a `+` (`<p>Not a rule {name}, but a gift</p>`) passes the copy check, since each string is read alone.
- **Cause:** The check reads source strings, and Bun's tests cannot draw the Solid pages, which need the Vite SSR build.
- **Guard:** none: declined; no page has such a split (round 3's scan of every built page), and the built pages quote Scripture with no mark the stock-phrase check could leave out, as it leaves out a Verse's text in the sources.

### copy-check-strips-strings

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`uncommented` also strips comment markers that sit inside string or JSX text"
- **Source:** ftb-copy/round-2-findings.md F2 (the review's m1)
- **Wrong:** The copy check took out a `/* ... */` or a `//` that sat inside a string, and with it the words after it, so a stock phrase there passed.
- **Cause:** It took comments out with regular expressions that cannot tell a string from code.
- **Guard:** code: `apps/firsttheblade/src/copy.test.ts` `the checks catch what they are for`

### copy-check-misses-wrapped-phrases

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "a phrase wrapped across two JSX lines is missed"
- **Source:** ftb-copy/round-2-findings.md F3 (the review's m2)
- **Wrong:** A stock phrase that the formatter wrapped onto a second JSX line ("grow with" / "us") passed the copy check.
- **Cause:** The check matched the source text line for line, with its line breaks, not the words a reader sees.
- **Guard:** code: `apps/firsttheblade/src/copy.test.ts` `the checks catch what they are for`

### copy-check-blocks-scripture

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the never-words also block faithful KJV quotes"
- **Source:** ftb-copy/round-2-findings.md F4 (the review's m3)
- **Wrong:** A verse quoted word for word, such as Isaiah 9:6 with "Wonderful", would fail the copy check, though the site quotes the KJV exactly.
- **Cause:** The check read Scripture as the site's own words.
- **Guard:** code: `apps/firsttheblade/src/copy.test.ts` `the checks catch what they are for`

### copy-check-skips-kit

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`kit/channel.md` is not scanned"
- **Source:** ftb-copy/round-2-findings.md F5 (the review's m4)
- **Wrong:** The YouTube description and playlist rows in `apps/firsttheblade/kit/channel.md`, rewritten with the site's copy, were outside the copy check.
- **Cause:** The check read only the files under `src`.
- **Guard:** code: `apps/firsttheblade/src/copy.test.ts` `the site's words hold no stock phrase, no not-X-but-Y turn and no em-dash`

### moved-path-trailing-slash

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`/series/the-true-remedies/` gave a redirect to the page on the base. Now it gives 404"
- **Source:** ftb-copy/round-2-findings.md F6 (the review's m5)
- **Wrong:** The health series' former path with a trailing slash answered 404, not the 301.
- **Cause:** The Worker looked a moved path up by its exact text, and the assets answer a path with or without its trailing slash.
- **Guard:** code: `apps/firsttheblade/src/worker/respond.test.ts` `answers the health series' former path, with or without its trailing slash, with a 301 to its page, query kept`

### og-card-file-name

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`public/og/remedies.jpg` keeps its file name. This is fine."
- **Source:** ftb-copy/round-2-findings.md F7 (the review's o1)
- **Wrong:** The health series' link card kept its old file name after the rename, so a link card scraper that cached it by its URL may show the old card for a while.
- **Cause:** The card's file name comes from the series' id, which the rename kept, since no reader sees it.
- **Guard:** none: declined; no reader sees the file name, and the card is served with a day's cache, so the old card lapses.

### email-promise-read-in-sources

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the email census misses cadence strings with no mail word, with a mail word that fails SENTENCE, or in kit/draw.ts"
- **Source:** ftb-copy/round-4-findings.md F1 (repeat of round-3 F1)
- **Wrong:** The promise's census read the site's source strings and took those with a mail word in a sentence, so "We will be in touch every week.", "EMAIL WEEKLY", `Email {"weekly"}` and a cadence on a thumbnail in `kit/draw.ts` passed.
- **Cause:** The guard read the sources, where a sentence is split, spelled and placed as its code is, and not what a reader gets; each repair widened the net over the sources, and each review found a sentence the sources hid.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `NET`; `apps/firsttheblade/scripts/promise-census.ts` `r4-F1 a cadence split by a JSX expression`

### email-promise-checked-by-spelling

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the census checks the spelling `${PROMISE}`, not the value the page uses"
- **Source:** ftb-copy/round-4-findings.md F2 (repeat of round-3 F1)
- **Wrong:** A page that bound its own `const PROMISE = 'a note every week'` kept the spelling `${PROMISE}`, so the census passed while every promise on the page said "a note every week".
- **Cause:** The census held the source's spelling of the promise, not the words the page printed.
- **Guard:** code: `apps/firsttheblade/scripts/promise-census.ts` `r4-F2 the form binds a PROMISE of its own`

### copy-check-verse-any-book

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the Verse exemption takes any capitalised word as a book"
- **Source:** ftb-copy/round-4-findings.md F3
- **Wrong:** The copy check left out the text of `{ ref: 'Trailer 1:1', text: 'a wonderful film' }` as Scripture, and kept the text of a verse from Song of Solomon, a book of three words.
- **Cause:** It took a reference to be any capitalised word before a chapter and verse, not a book of the Bible.
- **Guard:** code: `apps/firsttheblade/src/copy.test.ts` `BOOKS`

### signup-label-leans-on-heading

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the form label leans on a heading outside the form"
- **Source:** ftb-copy/round-4-findings.md F4
- **Wrong:** A screen reader announces the sign-up field as "Or get them by email", without the heading "See each new film" that tells what "them" is.
- **Cause:** The label was written to be read under its heading.
- **Guard:** none: the owner's copy choice; he kept the new copy (ask a1c0dc5b995).

### email-promise-no-net-word

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "What is left is a sentence with no mail word and no frequency word"
- **Source:** ftb-copy/round-4-findings.md F1
- **Wrong:** A sentence that says how often we write with no word the net holds (`apps/firsttheblade/scripts/promise.ts` `NET`: no word of mail or of the list, no word of how often, and no word of time inside any word), such as "Expect a word from us when there is one.", passes the promise check.
- **Cause:** The check finds a sentence about how often we email by its words, and no list of words reaches every way to say it.
- **Guard:** skill: which sentences speak of how often is a reading of their sense, and no word list holds every way to say it. Carried by `apps/firsttheblade/README.md`: "Say how often and what we email only in the promise's words."

### email-promise-worker-answers

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "Domain: every page, letter and kit string a reader sees that speaks of how often we email."
- **Source:** ftb-copy/round-4-findings.md F1
- **Wrong:** The Worker's own plain-text answers (405, and the mail routes' 503) are not in the built output, so the promise check does not read them.
- **Cause:** The Worker writes them as it answers, outside the build.
- **Guard:** none: a residual; there are two, neither speaks of email, and a review reads a new one.

### email-promise-browser-script

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "Domain: every page, letter and kit string a reader sees that speaks of how often we email."
- **Source:** ftb-copy/round-4-findings.md F1
- **Wrong:** Words the browser script draws (the phone menu's) are in `dist/assets/*.js`, which the promise check skips.
- **Cause:** The check reads no built script (`WORDLESS`); the phone menu's own words are the residual `email-promise-browser-script-prose`.
- **Guard:** none: a residual; the menu's links are the served pages' own (`src/ui/nav.ts`), which the check reads there.

### email-promise-painted-words

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "The kit includes `kit/draw.ts`, whose `lines` are drawn onto the thumbnails a viewer sees"
- **Source:** ftb-copy/round-4-findings.md F1
- **Wrong:** The promise check reads the words of each kit picture from the HTML it is drawn from (`kit/draw.ts` `SEEN`), not from its pixels, so words painted into a picture's art, or a picture put in `public/` by hand, are not read.
- **Cause:** Reading a picture's words from its pixels would need text recognition.
- **Guard:** none: a residual; the paintings hold no words, and the kit draws every picture the site serves with words on it.

### email-promise-net-whole-words

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`NET` matches whole words only (`\bweekly\b`). So compound and rarer frequency words do not match."
- **Source:** ftb-copy/rw-round-1-findings.md F1 (repeat of round-4 F1)
- **Wrong:** The promise check's net took a word of how often only whole, so "Expect a new film from us biweekly.", "Plus a bimonthly roundup.", "Look for us quarterly.", "Expect a film from us nightly.", "A new film lands in your box on weekends.", "Expect us tonight and tomorrow." and "And our seasonal roundup." passed.
- **Cause:** The net listed whole words of how often, and a word of time is built into longer words (bi-, semi-, -ly, -s, to-).
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `NET`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r1-F1 "biweekly"`

### email-promise-tags-split-words

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "Any tag that is not in `TAG_GAPS` (for example `u`, `s`, `label`) becomes a block break."
- **Source:** ftb-copy/rw-round-1-findings.md F2
- **Wrong:** The promise check read a page as a list of tags, each tag it did not list a break and `a` a space, so `<u>wee</u>kly` and `<a href=/x>wee</a>kly`, which a browser shows as "weekly", passed as fragments the net missed.
- **Cause:** The page was read with patterns over its tags, not parsed as a browser parses it, and an element the list missed broke the words around it.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `markupWords`, `layoutProblems`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r1-F2 the sign-up label splits "weekly" with <u>`

### email-promise-unread-attributes

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`SEEN_ATTRIBUTES` reads only double-quoted `alt`, `aria-label`, `title` and `placeholder`."
- **Source:** ftb-copy/rw-round-1-findings.md F3
- **Wrong:** Words a reader sees or hears in an `<input type="submit" value>`, an `aria-description`, a single-quoted `alt` and a stylesheet's `content:` passed the promise check unread.
- **Cause:** The check named the attributes it read in one quote style, and did not read stylesheets.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `SEEN_ATTRIBUTES`, `cssWords`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r1-F3 the sign-up button as <input type=submit value>`

### email-promise-held-anywhere

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`HELD` is one list for all artefacts, so a held sentence passes on any page"
- **Source:** ftb-copy/rw-round-1-findings.md F4
- **Wrong:** "We will not send another one for an hour.", held for the check page, passed on the confirmed page, where it reads as a cadence.
- **Cause:** The held sentences were one list for every artefact.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `HELD`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r1-F4 "for an hour" said on the confirmed page`

### email-promise-stale-dist

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "A replayed build leaves extra pages that a later build wrote. A stale page can satisfy `gone:` and `no such artefact` checks."
- **Source:** ftb-copy/rw-round-1-findings.md F5
- **Wrong:** The promise check read whatever `dist/` held, and a turbo replay of the build restores its files without taking away a page another build left there.
- **Cause:** The gate ran the check on the build turbo gave it, which may be a replay.
- **Guard:** code: `apps/firsttheblade/package.json` `"promise": "bun run build && bun scripts/promise.ts"`

### merge-checks-run-by-hand

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "Rerun `bun run merge-audit --each` and `bun run redfirst` with the tools before the merge."
- **Source:** ftb-copy/rw-round-1-findings.md F6
- **Wrong:** Round 1 of the rewrite ran merge-audit's each-commit check and redfirst by hand, since the disk was full and the tools could not make their scratch worktree.
- **Cause:** Other work had filled the disk.
- **Guard:** none: the tools exist and refuse loudly on a full disk; round 2 ran them (`tmp/orchestrate/p5/ftb-copy/rw-merge-each-2.log`, `rw-redfirst-2.log`).

### email-promise-invisible-characters

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "an invisible character inside a word hides it from the net"
- **Source:** ftb-copy/rw-round-2-findings.md F1 (repeat of rw-round-1 F2)
- **Wrong:** `<p>Expect us wee&shy;kly.</p>`, the same with a zero-width space or a zero-width joiner, and a full-width "ｗｅｅｋｌｙ" each passed the promise check, though a reader sees "weekly".
- **Cause:** The check matched the net against the characters as decoded, and a format character or a full-width letter is a different character from the one the reader takes it for.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `fold`, `SEEN_CHARACTERS`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r2-F1 a soft hyphen inside "weekly"`

### email-promise-generated-content

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "CSS generated content is read apart from the element text it draws beside"
- **Source:** ftb-copy/rw-round-2-findings.md F2 (repeat of rw-round-1 F3)
- **Wrong:** `.button-label::after{content:" and our news"}` made the sign-up button read "Email me new films and our news", and the check passed it as the held "Email me new films"; `content:"kly"` after "wee" drew "weekly".
- **Cause:** The check read each stylesheet string as its own run of words, and does not resolve which element a selector draws it beside.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `GENERATED`, `CSS_STRINGS`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r2-F2 generated content after the sign-up button`

### email-promise-join-checked-by-net

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the both-layouts check tests whether the net matches, not whether the other layout's sentence is held"
- **Source:** ftb-copy/rw-round-2-findings.md F3
- **Wrong:** `<label>Or get them by email</label><div style="display:inline"> and our news too</div>` passed: a reader sees "Or get them by email and our news too", which breaks "and nothing else".
- **Cause:** At a break, the check asked only whether the joined words held a net word that neither side held, so a join beside a held sentence that already held one was never read as a sentence.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `joinsOf`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r2-F3 an inline <div> after the sign-up label`

### email-promise-letter-sender

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the letters' sender name and address are not read"
- **Source:** ftb-copy/rw-round-2-findings.md F4
- **Wrong:** `FROM` (`apps/firsttheblade/src/mail/mailer.ts`), which every inbox shows beside each letter, was not read, so "First the Blade Weekly" or `weekly@firsttheblade.com` would have passed.
- **Cause:** The check read the letters as their builders return them, and the sender is set where the Worker sends them.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `blocks: [FROM.name, FROM.email]`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r2-F4 the letters are from "First the Blade Weekly"`

### email-promise-unknown-meta

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "meta tags outside SEEN_META are dropped, not failed"
- **Source:** ftb-copy/rw-round-2-findings.md F5
- **Wrong:** `<meta name="application-name" content="First the Blade Weekly">`, a name some systems show for a pinned site, passed unread.
- **Cause:** The check read the meta tags a pattern named and dropped every other one.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `UNSEEN_META`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r2-F5 <meta name="application-name">`

### email-promise-what-we-send

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the skill line covers how often we email, not what we email"
- **Source:** ftb-copy/rw-round-2-findings.md F6
- **Wrong:** "Plus our news and offers." and "Plus recipes and promotions." break the promise's "and nothing else", held no net word, and the README's line spoke only of how often we email.
- **Cause:** The net and the skill line were written for the promise's first limit (how often), not its second (what we send).
- **Guard:** skill: what we send beside the films is a reading of a sentence's sense past the words the net holds (`apps/firsttheblade/scripts/promise.ts` `NET`, "what we send"). Carried by `apps/firsttheblade/README.md`: "Say how often and what we email only in the promise's words."

### email-promise-built-twice

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the gate builds dist/ twice on a miss"
- **Source:** ftb-copy/rw-round-2-findings.md F7
- **Wrong:** On a cache miss, the gate's `promise` step built the app again after turbo's `build`, about 2 s of work done twice.
- **Cause:** The step built fresh so it never read a stale `dist/`, rather than checking the one turbo built; a check by file times would refuse a cached build after a source is saved unchanged, so the build stamps the hash of its sources and of each file it wrote.
- **Guard:** code: `apps/firsttheblade/package.json` `"gate": "bun scripts/promise.ts && bun run promise:census"`; `apps/firsttheblade/scripts/built.ts` `sourcesHash`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r2-F7 a source changed after the build`

### email-promise-download-name

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "a download file name is not read"
- **Source:** ftb-copy/rw-round-2-findings.md F8
- **Wrong:** `<a download="weekly-digest.pdf">` passed, and the browser shows the name in its save dialog.
- **Cause:** The check's list of attributes a reader sees left `download` out, and an attribute in no list was dropped.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `SEEN_ATTRIBUTES`, `UNSEEN_ATTRIBUTES`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r2-F8 a download file name`

### email-promise-fails-closed

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "repeat of rw-r1 F2 (a word the reader sees, which the check reads in fragments)"
- **Source:** ftb-copy/rw-round-2-findings.md F1; ftb-copy/rw-round-2-findings.md F2; ftb-copy/rw-round-2-findings.md F5
- **Wrong:** Rounds 1 and 2 of the rewrite each closed the ways the review found text to reach a reader (words split by tags, attributes, stylesheets, then invisible characters, generated content, joins, the sender, meta tags), and each review found one more.
- **Cause:** The check rested on "it can rebuild what a reader sees by understanding every way text reaches the page", and a source it did not understand was dropped, not failed.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `HTML_ELEMENTS`, `UNSEEN_ATTRIBUTES`, `UNSEEN_META`, `LETTER_HEADERS`, `WORDLESS`; `apps/firsttheblade/scripts/promise-census.ts` `fail-closed an element the check does not read`

### email-promise-joins-in-document-order

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "At each gap, build the other layout's sentence."
- **Source:** ftb-copy/rw-round-2-findings.md F3; ftb-copy/rw-round-3-findings.md F7
- **Wrong:** The promise check joins runs of words in the order the page holds them, so a stylesheet that moves a box out of that order (`order`, a reversed flex row, an absolute position) can set side by side two runs the check never reads joined.
- **Cause:** Where a box is drawn is the browser's layout, and the check reads the page, not its layout.
- **Guard:** none: a residual; the built stylesheet sets `order: 0` only and reverses no row. Of its 14 positioned rules (12 `position:absolute`, 2 `position:fixed`), the five that hold words (`.skip`, `.site-header`, `.strip`, `.field-words`, `.menu-popup`) draw their boxes in the order the page holds them, top to bottom; the other nine draw a picture, a veil, an empty generated box, a `.visually-hidden` run (heard in its place) or the off-screen `.signup-trap`. A review reads a stylesheet that moves a box with words.

### email-promise-paste-ready-entry

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the closed lists refuse ordinary edits, and the message is not ready to paste"
- **Source:** ftb-copy/rw-round-3-findings.md F6
- **Wrong:** A refused sentence printed only its words, so each ordinary edit of the site's copy (a page's first words, a new page, the first talk of a series) left the owner or an agent to work out which list of `HELD` holds it and how to write it there.
- **Cause:** The check was written to refuse, not to say how to hold what it refuses; the owner kept it and asked for its errors to print a ready-to-paste exception (ask a3e589137f5, ship-keep).
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `entriesOf`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r3-F6 a refused sentence, held by the entry it prints`

### email-promise-css-escape

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "escaped CSS identifiers pass the content and attr() rules where no minifier runs"
- **Source:** ftb-copy/rw-round-3-findings.md F4
- **Wrong:** `c\6f ntent:\61ttr(data-count)` in a stylesheet the build does not minify (one copied from `public/`, or a letter's `<style>`) passed the promise check, and a browser reads it as `content:attr(data-count)`.
- **Cause:** The check matches `content:` and `attr()` by name, and an escape spells the name with other characters.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `unread: CSS escape`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r3-F4 an escaped content: and attr() in a stylesheet no minifier reads`

### email-promise-link-card-picture

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "an og or twitter image from another origin is not failed"
- **Source:** ftb-copy/rw-round-3-findings.md F5
- **Wrong:** `<meta property="og:image" content="https://example.com/weekly-news.jpg">` passed the promise check, and a link card draws that picture, with any words in it, where no policy of the site's applies.
- **Cause:** `og:image` and `twitter:image` were in the list of meta tags whose content no reader sees as words, and the picture they name is read by none of the check's readers.
- **Guard:** code: `apps/firsttheblade/scripts/promise.ts` `LINK_CARD_PICTURES`, `isDrawnLinkCard`; `apps/firsttheblade/scripts/promise-census.ts` `rw-r3-F5 a link card picture from elsewhere`

### email-promise-hidden-text

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "hidden text satisfies the promise"
- **Source:** ftb-copy/rw-round-3-findings.md F1
- **Wrong:** In a built page, `and nothing else.` changed to `<span class="visually-hidden">and nothing else</span>.`, or the same with `aria-hidden="true"`, passed the promise check, and a sighted reader sees "We send you one email when each new film is out, ."
- **Cause:** The check reads every text node as seen; it does not resolve what a class, `aria-hidden` or a style hides.
- **Guard:** none: the owner chose to ship and keep the round-3 check and log this path as a known limit (ask a3e589137f5, ship-keep, 2026-10-21); `apps/firsttheblade/README.md` "Known limits of `bun run promise`" names it, and a review reads markup that hides part of a promise sentence.

### email-promise-bidi-controls

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "fold deletes bidi controls, so a reversed word is read as no word"
- **Source:** ftb-copy/rw-round-3-findings.md F2
- **Wrong:** `<p>Expect us &#x202e;.ylkeew&#x202c;</p>` passed the promise check, and a reader sees "Expect us weekly."; `unicode-bidi:bidi-override;direction:rtl` passed too.
- **Cause:** `fold` drops every format character before the net reads a string, the bidi controls with them, and no rule reads `unicode-bidi`.
- **Guard:** none: the owner chose to ship and keep the round-3 check and log this path as a known limit (ask a3e589137f5, ship-keep, 2026-10-21); `apps/firsttheblade/README.md` "Known limits of `bun run promise`" names it, and a review reads a bidi control or `unicode-bidi` in a page or a stylesheet.

### email-promise-browser-script-prose

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the site's browser scripts are a reader source that is neither read nor failed"
- **Source:** ftb-copy/rw-round-3-findings.md F3
- **Wrong:** The phone menu is drawn only in the browser (`apps/firsttheblade/src/client.tsx` replaces its slot), so a literal in `src/ui/phone-menu.tsx` or `src/confirm.ts` reaches a reader through `dist/assets/client.js` or `confirm.js` alone; "Close menu. New films every week, plus our news and offers." in `client.js` passed the promise check.
- **Cause:** The check lists the built scripts as wordless (`WORDLESS`); it could read their string literals (17 prose literals in `client.js`, one netted and already held), and that reader was not built.
- **Guard:** none: the owner chose to ship and keep the round-3 check and log this path as a known limit (ask a3e589137f5, ship-keep, 2026-10-21); `apps/firsttheblade/README.md` "Known limits of `bun run promise`" names it, and a review reads a word added to `src/ui/phone-menu.tsx` or `src/confirm.ts`.

### email-promise-stamp-inputs

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the stamp's sources omit the root tsconfig, the lock and @bible/ui"
- **Source:** ftb-copy/rw-round-3-findings.md F8
- **Wrong:** The build's stamp hashes turbo's `build` inputs for the app only (`apps/firsttheblade/scripts/built.ts` `buildInputs`), so `bun scripts/promise.ts` run by hand after an edit of the root tsconfig, the lock or `@bible/ui` reads the old `dist/` as current.
- **Cause:** The stamp reads the app's own inputs from `apps/firsttheblade/turbo.json`; the rest of what a build reads, turbo hashes for itself.
- **Guard:** none: the gate builds through turbo, whose hash covers them, and `bun run promise` builds first; `apps/firsttheblade/README.md` "Known limits of `bun run promise`" names the inputs the stamp reads.

### field-light-guard-reads-the-master

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "repeat of r1 F1: the light guard still passes stills whose rays come from the top left"
- **Source:** ftb-motion/round-2-findings.md F1
- **Wrong:** `skyLight` read a still's light against the still's own sky and row colours, in luma, with a rise of 0.07 allowed; head mixed 0.3 or 0.4 toward the old stills, gold or white beams from the top left, and the kit's repaint cut short to 0.2 or 0.3 of the width or laid at 0.5 or 0.7 all passed, and so did 34 of 40 seeded top-left rays beyond the WebP noise.
- **Cause:** The guard held a still against itself, so what the still held moved its own reference, and its tolerance came from no measured noise.
- **Guard:** code: `apps/firsttheblade/kit/field-still.test.ts` `refuse every light the earlier light guards let through`, `apps/firsttheblade/kit/field-still.test.ts` `refuse any change to a served still until the owner approves it`. They hold the rules: "Every shipped field still, at every srcset size, is byte-identical to one the owner approved by name", and "Every image the site serves is in the approval record or in a named list of images outside the rule, each with its reason" (`OUTSIDE`, `apps/firsttheblade/kit/served.ts`). The record is `apps/firsttheblade/kit/approved-stills.json`; whether a still's light comes from the sun is the owner's look, given through a lab ask with 1:1 crops.

### hero-sway-seen-at-a-glance

- **Date:** 2026-10-21
- **Kind:** owner
- **Said:** "a bit more swaying - the movements are too unnoticble"
- **Source:** the owner's answer to ask a714e0e2d89, 2026-10-21 (unit ftb-motion, round 3 brief, answer 5)
- **Wrong:** The hero's wheat swayed by 0.0045 of the painting's width at a gust's full push, so a plant's tip moved about 1 px between frames 3 s apart at 1280 wide, and the field read as still.
- **Cause:** The sway was set by eye to stay calm, and nothing held it to a size a viewer sees.
- **Guard:** code: `apps/firsttheblade/src/motion/shaders.test.ts` `sway the hero’s plants at least as far as the owner asked`, `apps/firsttheblade/src/motion/shaders.test.ts` `a sway below the floor is refused`. They hold the field shader's sway at or above 0.016 of the width, the floor the owner set when he asked for "A bit more" than 0.012 on ask adf28c17753.

### hero-sway-a-bit-more

- **Date:** 2026-10-21
- **Kind:** owner
- **Said:** chose: "A bit more"
- **Source:** the owner's answer to ask adf28c17753, 2026-10-22T01:18:28Z (unit ftb-motion, rewrite round 2; kept in `apps/firsttheblade/kit/fixtures/ask-adf28c17753.json`)
- **Wrong:** At 0.012 of the painting's width the hero's wheat still swayed too little for him, after the before/after clips of round 3.
- **Cause:** The step from 0.0045 was the least that moved the tips 2 css px on desktop, measured, and it stopped at what a measure called seen rather than at what he saw.
- **Guard:** code: `apps/firsttheblade/src/motion/shaders.test.ts` `sway the hero’s plants at least as far as the owner asked`, `apps/firsttheblade/src/motion/shaders.test.ts` `a sway below the floor is refused`. They hold the field shader's sway at or above 0.016 of the width, and refuse 0.012.

### emblem-stirs-calm

- **Date:** 2026-10-21
- **Kind:** owner
- **Said:** chose: "Make it calm like the others"
- **Source:** the owner's answer to ask a714e0e2d89, 2026-10-21 (unit ftb-motion, round 3 brief, answer 3)
- **Wrong:** The tree card's stir swung on a spring, `cubic-bezier(0.34, 1.56, 0.64, 1)` over 900 ms, past its lean and back, while the other cards' stirs eased in 600 ms with no overshoot.
- **Cause:** The tree was given a livelier easing of its own, and nothing held the emblems' stirs to one family.
- **Guard:** code: `apps/firsttheblade/src/motion/styles.test.ts` `each emblem stirs calmly, its easing never overshooting or springing back`, `apps/firsttheblade/src/motion/styles.test.ts` `find an emblem eased with a spring`.

### styles-test-reads-every-hover

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the styles test passes an ungated hover stir written another way"
- **Source:** ftb-motion/round-2-findings.md F2
- **Wrong:** The styles test's rule reader read a nested `&:hover` block as a property and split `:is(:hover, :focus-within)` at its inner comma, and the hover case held only the literal `.card:hover`, so `.card { &:hover { --stir: 1; } }`, `.card:is(:hover, :focus-within) { --stir: 1 }` and `.cards .card:hover { --stir: 1 }` each stirred a card with no fine-pointer gate and stayed green.
- **Cause:** The reader was written for the stylesheet as it stood, and the case named one spelling of a hover instead of every rule a hover stirs.
- **Guard:** code: `apps/firsttheblade/src/motion/styles.test.ts` `are read with their media, their selectors and parents, and their declarations`, `apps/firsttheblade/src/motion/styles.test.ts` `refuse each generated ungated hover stir and pass each gated one`, `apps/firsttheblade/src/motion/styles.test.ts` `pointing stirs a card only where a fine pointer hovers, so a tap leaves no card stirred`, `apps/firsttheblade/src/motion/styles.test.ts` `find each hover stir outside the fine-pointer query, however it is written`, `apps/firsttheblade/src/motion/styles.test.ts` `split a selector list at its own commas, not inside :is()`.

### field-light-is-the-owners-look

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "repeat of r2 F1; thin lines and faint rays from the top left pass the light guard, and the property test cannot generate them"
- **Source:** ftb-motion/round-3-findings.md F1
- **Wrong:** Three rounds of a measured light guard (`skyLight` against the master's clear sky, `lightFromTheSun` with a 0.02 rise) each passed lights from the top left: a 1 px white or gold line, counsel's faint ray, and the kit's repaint at 0.95 of its reach.
- **Cause:** The rule was a measure of the painting's sky, and the painting's own texture reads 2 to 4 times the WebP noise against any clear-sky reference, so no tolerance both passes the shipped stills and refuses a faint line; whether light comes from the sun is the owner's look.
- **Guard:** code: `apps/firsttheblade/kit/field-still.test.ts` `are each the still the owner approved, byte for byte, under the ask that showed him them`, `apps/firsttheblade/kit/field-still.test.ts` `refuse any change to a served still until the owner approves it`, `apps/firsttheblade/kit/field-still.test.ts` `refuse a still the record does not name, and a record entry with no file`, `apps/firsttheblade/kit/field-still.test.ts` `refuse every light the earlier light guards let through`. The rewrite (ftb-motion rewrite-spec.md) holds the rules: "Every shipped field still, at every srcset size, is byte-identical to one the owner approved by name", and "Every image the site serves is in the approval record or in a named list of images outside the rule, each with its reason" (`OUTSIDE`, `apps/firsttheblade/kit/served.ts`).

### field-still-approved-in-a-lab-ask

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "a repainted or re-encoded still goes to the owner as a lab ask with 1:1 crops before its hashes are approved"
- **Source:** ftb-motion/round-3-findings.md F1 (the rewrite's approval step)
- **Wrong:** A changed master, kit step or encode could ship a still the owner never saw.
- **Cause:** The kit wrote the stills, and the gate judged them by a measure, not by his approval.
- **Guard:** skill: whether a repainted still's light is right is the owner's eye at 1:1, and the record is written only after he answers. Carried by `.claude/skills/verify-firsttheblade/features/motion.md`: "An approval ask shows every pinned still byte for byte as an image block; a crop or a render of it is not the still."

### styles-test-reads-quoted-braces

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "repeat of r2 F2; a quoted brace in a declaration hides an ungated hover from the styles test"
- **Source:** ftb-motion/round-3-findings.md F2
- **Wrong:** The styles test's reader ended a block at the first `}`, even one in a string, so `.cards .card:hover { content: "}"; --stir: 1; }` dropped its stir and popped the `@media` stack early, and the ungated hover passed.
- **Cause:** The reader split the sheet at braces and semicolons with no notion of a quoted string.
- **Guard:** code: `apps/firsttheblade/src/motion/styles.test.ts` `read a brace, a semicolon, a colon or a comment in a quoted string as part of its value`, `apps/firsttheblade/src/motion/styles.test.ts` `find each hover stir outside the fine-pointer query, however it is written`.

### hill-streaks-tied-to-the-master

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the streak lift's test moves with its own constants, so nothing ties `HILL_STREAKS` to the master"
- **Source:** ftb-motion/round-3-findings.md F3
- **Wrong:** The streak lift's fixture was painted where `HILL_STREAKS` says, so a streak moved in the constant moved the fixture too and the test stayed green, while the master's real edge stayed and a step was lifted onto the wrong hill.
- **Cause:** No test read the master's streaks.
- **Guard:** code: `apps/firsttheblade/kit/field-paint.test.ts` `were measured on this master, so a new one refuses them until they are measured again`, `apps/firsttheblade/kit/field-paint.test.ts` `each has its step on the master, and the shipped still has none across it`.

### sway-comments-tell-history

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "two comments tell history"
- **Source:** ftb-motion/round-3-findings.md F4
- **Wrong:** The comments on `SWAY` and `SWAY_FLOOR` told the old value and the round that raised it ("raised it from 0.0045", "round 3 raised it to this").
- **Cause:** The comments were written as the change's story, not as what the code does and why.
- **Guard:** none: the repo's rule is `CLAUDE.md` "**Comments:**", read by every review; a lint pattern for `round \d` would also refuse the ledger's own Sources and the film rounds the comments name on purpose.

### stills-are-what-the-app-serves

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the served-still inventory is a file-name glob, so an added still outside it ships unrecorded and the gate stays green"
- **Source:** ftb-motion/rewrite-round-1-findings.md F1
- **Wrong:** The stills rule read `src/art` by a `field-` name and `public/og` whole, so a shader layer `src/art/sky-768.webp` imported from `scene.ts`, or a still at `public/field-hero.webp`, shipped with no record entry and the provenance test stayed green.
- **Cause:** The inventory was a list of the names the stills had, not what the app serves.
- **Guard:** code: `apps/firsttheblade/kit/field-still.test.ts` `are each a still the record names or an image outside the rule, with why`, `apps/firsttheblade/kit/field-still.test.ts` `refuse an image added under any served folder or named from any module, until the record names it`, `apps/firsttheblade/kit/field-still.test.ts` `refuse a new layer the shader imports and a still served from public/, by any name`. They hold the rule: "Every image the site serves is in the approval record or in a named list of images outside the rule, each with its reason." The inventory (`apps/firsttheblade/kit/served.ts`) reads every image file under `public/` and `src/`, and every image a module names, by Vite's parser and lightningcss.

### approval-reads-the-owners-answer

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`kit:approve` records `approved` for any answer, any ask and the bytes as they stand, so the record can name stills the ask never showed"
- **Source:** ftb-motion/rewrite-round-1-findings.md F2
- **Wrong:** `kit:approve --ask <id> --answer <words>` wrote `approved` for an empty answer, for an ask the lab did not hold, and over stills changed after the ask, hashing the files as they stood.
- **Cause:** The answer was typed by the agent, not read from the lab, and the approval did not compare the stills with the ones the pending record pinned.
- **Guard:** code: `apps/firsttheblade/kit/approval.test.ts` `approves the pinned stills an image block showed byte for byte, on the approve choice, storing the lab, the answer's label and the shown files' hashes`, `apps/firsttheblade/kit/approval.test.ts` `refuses an ask the lab does not hold, and one whose record holds no receipt, on pin and approve; a file its receipt has no hash of shows nothing`, `apps/firsttheblade/kit/approval.test.ts` `refuses an ask the owner has not answered, and an answer to the stills question that is not the approve choice`, `apps/firsttheblade/kit/approval.test.ts` `refuses a record not pending on the ask, and an approval already given`, `apps/firsttheblade/kit/approval.test.ts` `refuses stills other than the ones the record pinned, naming each`. They hold the rule: "An approval names an ask the owner answered with approval, and the stills that ask showed."

### prod-deploy-refuses-pending-stills

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "nothing refuses a `pending` record at merge or prod deploy"
- **Source:** ftb-motion/rewrite-round-1-findings.md F3
- **Wrong:** The prod deploy built and shipped with the record `pending`, so stills the owner had not approved could reach the site.
- **Cause:** Only the kit and its test read the record; the deploy did not.
- **Guard:** code: `apps/firsttheblade/kit/shippable.test.ts` `refuses a pending record, and an approval whose shown files lack a still that no earlier approval showed byte for byte, before it builds`, `apps/firsttheblade/kit/shippable.test.ts` `runs first in the stack on stage prod, so every prod deploy and plan runs it, and on no other stage`.

### styles-test-reads-with-a-css-parser

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the styles reader still misses an ungated hover in four inputs (repeat of round 3 F2's class)"
- **Source:** ftb-motion/rewrite-round-1-findings.md F4
- **Wrong:** The styles test's hand reader passed four ungated hover stirs: `.cards .card:HOVER`, a rule after `@layer motion;`, an unquoted `url(x}y.png)` and `content: "\}"`, after two rounds of fixes for other spellings.
- **Cause:** Each hand reader rested on the premise "the hover rules can be found by reading the stylesheet's text shape", and each fix covered the spellings found so far, not CSS.
- **Guard:** code: `apps/firsttheblade/src/motion/styles.test.ts` `find each hover stir outside the fine-pointer query, however it is written`, `apps/firsttheblade/src/motion/styles.test.ts` `refuse each generated ungated hover stir and pass each gated one`, `apps/firsttheblade/src/motion/styles.test.ts` `are read with their media, their selectors and parents, and their declarations`. The test reads the sheet with lightningcss, the parser Vite builds it with, and walks its rules, selectors and media queries.

### one-code-cases-change-one-code

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the \"one pixel one code\" cases do not test a one-code change"
- **Source:** ftb-motion/rewrite-round-1-findings.md F5
- **Wrong:** At JPEG quality 100 a one-code nudge encoded to the same bytes as the unchanged still, so the case named a one-code change it never made.
- **Cause:** The case compared the nudged encode with the shipped file, which differs by re-encoding alone, not with an unchanged control encoded the same way.
- **Guard:** code: `apps/firsttheblade/kit/field-still.test.ts` `refuse any change to a served still until the owner approves it`: each change is encoded beside an unchanged control the same way and kept only when its bytes differ from the control.

### earlier-lights-rebuilt-from-the-base

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the earlier-round cases start from the resized master, not from the base stills or the probes' inputs"
- **Source:** ftb-motion/rewrite-round-1-findings.md F6
- **Wrong:** The earlier-round light cases were painted over the master resized to each width, not over the stills origin/main shipped, so they were not the counterexamples the probes found.
- **Cause:** The cases were rebuilt from the nearest input to hand, not from the receipts.
- **Guard:** code: `apps/firsttheblade/kit/field-still.test.ts` `refuse every light the earlier light guards let through`: each case starts from the base's still (`git show c56180093:apps/firsttheblade/src/art/field-<width>.webp`) or the probe's input, in the probe's order.

### sun-comment-tells-history

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`src/motion/sun.ts:4-6` tells history"
- **Source:** ftb-motion/rewrite-round-1-findings.md F7
- **Wrong:** The comment on the sun told the owner's revise of 2026-10-21 (the painted rays from the top left while the sun sat at the right).
- **Cause:** The comment was written as the change's story, not as what the code does and why.
- **Guard:** none: the repo's rule is `CLAUDE.md` "**Comments:**", read by every review, as for `sway-comments-tell-history`.

### approval-binds-the-shown-bytes

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the record can name stills the ask never showed, so `kit:approve --ask adf28c17753` would write an unsound record"
- **Source:** ftb-motion/rewrite-round-2-findings.md F1
- **Wrong:** The record pinned five link cards (`public/og/*.jpg`) whose bytes this unit changed and that no ask showed, and `approve` turned it approved on the owner's real answer to ask adf28c17753, which showed screenshots of the page.
- **Cause:** The premise "an approval holds when the owner's answer says approve" was false: his answer does not say which bytes he saw, and nothing read what the ask showed. The new premise: an approval binds bytes the owner was shown. Rule: "A still is approved only if its SHA-256 equals a file that an image block of the approving ask showed, and that ask's `stills` answer is `approve`."
- **Guard:** code: `apps/firsttheblade/kit/approval.test.ts` `refuses each pinned still no image block on a step he reached showed byte for byte, naming each: one shown as a crop, one in a block of another kind, one on a step his answers did not reach`, `apps/firsttheblade/kit/approval.test.ts` `refuses the owner's real answer to ask adf28c17753 as it holds no receipt, and with its saved hashes as one, as its image blocks showed screenshots of the page, not the stills, naming each still`, `apps/firsttheblade/kit/approval.test.ts` `refuses the owner's real answer to ask ab47076e90b as it holds no receipt, and it stays an earlier approval of the stills it showed, each kept by its path with the hash it showed`, `apps/firsttheblade/kit/approval.test.ts` `over random pinned stills, some byte copies of others, image blocks on random steps, answers reaching any of them, and receipts missing and adding entries, approves only stills a reached block showed by the receipt, or an approval it gave, and refuses a re-pin after it to bytes not shown`, `apps/firsttheblade/kit/approval.test.ts` `the committed record is on an ask saved beside it, each approval it keeps held by its saved ask, and every still was shown byte for byte`. `kit:approve` reads the hash of each image block's file from the receipt the lab keeps as it makes the ask, the hash of the copy its page serves (`packages/film/src/tools/ask-store.ts` `receipted`).

### served-images-read-from-the-build

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the inventory misses images that Vite serves, and the generator is as narrow as the guard"
- **Source:** ftb-motion/rewrite-round-2-findings.md F2
- **Wrong:** The source reader passed a template `new URL`, an `import.meta.glob`, a `.jfif` import and a `.jxl` under `public/`, each of which the build emits, and the generator drew only the forms the reader held.
- **Cause:** The premise "reading the source can list every image the site serves" was false: each reader holds the forms its author thought of. The new premise: the served images are read from the build output. Rule: "Every image file in the built site (`dist/`, after `vite build`) is in the approval record or in the named `OUTSIDE` list, each with its reason." A file is an image by its bytes, not its name.
- **Guard:** code: `apps/firsttheblade/kit/shippable.test.ts` `builds the site and refuses each built image no approved still holds: a template new URL, an import.meta.glob, a .jfif import, a .jxl under public/; every other image passes, one still approved by an earlier approval`, `apps/firsttheblade/kit/build-walk.test.ts` `refuses every image under any name, extension and folder, each file named as an image that no signature reads as unknown, and passes the approved stills and the images outside the rule under any name`, `apps/firsttheblade/kit/build-walk.test.ts` `reads each format by its first bytes, a gzipped one by what it unzips to`, `apps/firsttheblade/kit/build-walk.test.ts` `reads an svg by its root element after any prolog, and no other markup as one`, `apps/firsttheblade/kit/build-walk.test.ts` `reads none of the site's other files as an image`.

### every-prod-deploy-walks-the-build

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "a prod deploy can skip `shippable`, and `shippable` reads the source, not the build output"
- **Source:** ftb-motion/rewrite-round-2-findings.md F3
- **Wrong:** `shippable` ran only from the `deploy` script, so `bunx alchemy deploy --stage prod` shipped with no check, and it read the sources, not `dist/`.
- **Cause:** The gate sat on one command that starts a deploy, not in the stack every prod deploy runs.
- **Guard:** code: `apps/firsttheblade/kit/shippable.test.ts` `runs first in the stack on stage prod, so every prod deploy and plan runs it, and on no other stage`, `apps/firsttheblade/kit/shippable.test.ts` `refuses a pending record, and an approval whose shown files lack a still that no earlier approval showed byte for byte, before it builds`.

### approval-names-its-lab

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the record does not say which lab answered"
- **Source:** ftb-motion/rewrite-round-2-findings.md F4
- **Wrong:** The approved record kept the ask and the answers but not the lab URL they were read from, so a record approved from another checkout's lab read the same.
- **Cause:** The lab was a dependency of `approve`, and its URL was not written down with what it gave.
- **Guard:** code: `apps/firsttheblade/kit/approval.test.ts` `approves the pinned stills an image block showed byte for byte, on the approve choice, storing the lab, the answer's label and the shown files' hashes`. `kit:shippable` prints the lab URL (`apps/firsttheblade/kit/shippable.ts` `checked`).

### sway-comment-names-the-old-value

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "the sway comment names the old value"
- **Source:** ftb-motion/rewrite-round-2-findings.md F5
- **Wrong:** `src/motion/shaders.ts` and `shaders.test.ts` named the sway's earlier value beside the owner's choice.
- **Cause:** The comment was written as the change's story, not as what the code does and why.
- **Guard:** skill: the judged rule `judged/historyComment` warns and fails open, so it gates nothing; the repo's comment rule is read by every review. Carried by `CLAUDE.md`: "A comment says what the code does now and why; history told in words (what it used to do, which pass changed it) is a finding."

### styles-test-reads-scope-roots

- **Date:** 2026-10-21
- **Kind:** review
- **Said:** "`@scope (.cards:hover) { .card { --stir: 1 } }` passes the styles guard"
- **Source:** ftb-motion/rewrite-round-2-findings.md F6
- **Wrong:** A hover in an `@scope` root stirred a card outside the fine-pointer query, and the styles test passed it.
- **Cause:** The reader took a rule's parents from nested style rules only, not from an `@scope` rule's root, and the generator drew no `@scope`.
- **Guard:** code: `apps/firsttheblade/src/motion/styles.test.ts` `@scope (.cards:hover) { .card { --stir: 1 } }`, `apps/firsttheblade/src/motion/styles.test.ts` `@scope (.cards) { :scope:hover .card { ${body} } }`.

### past-approval-holds-its-own-bytes

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "it checks a past ask against the stills as they stand. Make it hold the stills that ask's fixture showed, so a later re-pin cannot turn it red. A past approval stays true of its own bytes."
- **Source:** ftb-remedies-emblem/follow-up-1.md F1
- **Wrong:** The test of the owner's real answer to ask ab47076e90b pinned the stills as they stand, so the re-pin of `public/og/remedies.jpg` on ask aa434d8c292 turned it red; and the record kept one approval, so a later ask had to show every still again, the unchanged ones too.
- **Cause:** The test read the app's current stills, not the bytes the ask showed, and the record had no place for an approval that stays true of the bytes it showed.
- **Guard:** code: `apps/firsttheblade/kit/approval.test.ts` `refuses the owner's real answer to ask ab47076e90b as it holds no receipt, and it stays an earlier approval of the stills it showed, each kept by its path with the hash it showed`, `apps/firsttheblade/kit/approval.test.ts` `an earlier approval keeps the stills unchanged since: a later ask need show only the changed still, and a still changed since no ask showed is refused`.

### pinned-ask-saved-beside-the-record

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "Fix the cause: `kit:pin` writes the ask record it read to `kit/fixtures/ask-<id>.json`, and `kit:approve` rewrites it with the answered record, so the committed record always has its saved ask."
- **Source:** ftb-remedies-emblem/follow-up-1.md F2
- **Wrong:** `kit:pin --ask aa434d8c292` wrote the record pending on an ask no file in `kit/fixtures/` held, so the committed-record test could not read it.
- **Cause:** Saving the ask was a step done by hand, outside `pin` and `approve`.
- **Guard:** code: `apps/firsttheblade/kit/approval.test.ts` `pin saves the ask as the lab gives it with its receipt, and approve saves it again as answered with the receipt of the steps he reached`, `apps/firsttheblade/kit/approval.test.ts` `the committed record is on an ask saved beside it, each approval it keeps held by its saved ask, and every still was shown byte for byte`.

### release-bundle-keeps-sdk-setup

- **Date:** 2026-10-22
- **Kind:** owner
- **Said:** "Okay, it crashes on startup"
- **Source:** the owner's report on the first Release build of the hymnal on his iPhone, 2026-10-22 (run hymnapp, after shell merged at 46263e5dd)
- **Wrong:** The Release app threw "iOS SDK bindings need a native iOS build" at launch and closed; the Debug app ran.
- **Cause:** One's `ios-runtime.native.js` connects the SDK bindings as a side effect, but One's `package.json` lists no side effect for it, so the tree-shaken Release bundle dropped the call; the Debug bundle is not tree-shaken, and no unit had built Release.
- **Guard:** code: `apps/hymnal/vite/sdkruntime.test.ts` `with sdkRuntime, the tree-shaken bundle connects the SDK bindings`, `apps/hymnal/vite/sdkruntime.test.ts` `without it, One’s package drops the set-up, so the plugin is still needed`.

### approval-counts-reached-steps-only

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "approval counts image blocks in steps the owner never reached"
- **Source:** ftb-motion/rewrite-round-3-findings.md F1
- **Wrong:** `imagesShown` read the image blocks of every step of the ask, so an ask whose stills sat only on a branch his answer did not take still approved them.
- **Cause:** The reader took the ask's steps as what the page showed, but the page shows only the sections his answers reach; and the property's `held()` put its images on a step outside `answered`, so it held the defect as correct.
- **Guard:** code: `apps/firsttheblade/kit/approval.test.ts` `refuses each pinned still no image block on a step he reached showed byte for byte, naming each: one shown as a crop, one in a block of another kind, one on a step his answers did not reach`, `apps/firsttheblade/kit/approval.test.ts` `over random pinned stills, some byte copies of others, image blocks on random steps, answers reaching any of them, and receipts missing and adding entries, approves only stills a reached block showed by the receipt, or an approval it gave, and refuses a re-pin after it to bytes not shown`.

### approval-receipt-made-with-the-ask

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "\"shown\" is the bytes the lab serves at approve time, not the bytes it showed before the answer"; "the receipt holds the bytes at make time, so a set file changed before the answer approves bytes the owner never saw"; "premise 1 is written wider than the code holds it, and its property draws only set files on one page"
- **Source:** ftb-motion/rewrite-round-3-findings.md F2; ftb-approval-receipts/round-1-findings.md F1; ftb-approval-receipts/round-2-findings.md F1
- **Wrong:** `kit:approve` fetched each image block's file from the lab and hashed it at approve time, so a file rewritten after the answer approved bytes the owner never saw. Then the lab hashed each file as it made the ask but its page still served the set's file as it stood, so a second `publish_set` before the answer showed the owner other bytes than the receipt held, and `approve` took the receipt's. Then the docs said every image a page serves is a copy, while a board block and a video poster show live, and a file that failed to copy kept its live src with no receipt; the property drew only set files in image blocks on one page.
- **Cause:** The premise "the lab's file at a shown src is what the owner saw" was false twice, and its replacement was written wider than the code held it, in six places worded apart. The rule is one sentence now, the doc of `receipted` in `ask-store.ts`, and each place that states it states it word for word: An image whose src the receipt names is served only as its copy. Each file-served image of an image block or an option is copied as the ask is made, or the make is refused (`AskRefused`, naming the src). A board block's panels and a video's poster or frame show live and bind nothing. The shown route serves a copy only while it holds its hash, and the lab refuses an answer while a copy no longer does.
- **Guard:** code: `packages/film/src/tools/receipt-rule.test.ts` `is the doc of receipted in ask-store.ts, its first three sentences`, `packages/film/src/tools/receipt-rule.test.ts` `is stated word for word in each place that states it`, `packages/film/src/tools/ask-materials.test.ts` `shows each image file as the copy it makes with the ask, by its SHA-256, which a later rewrite of the file does not move; a video's frame has none`, `packages/film/src/tools/ask-materials.test.ts` `serves each image of random asks only as the copy its receipt holds, over the receipt rule's whole domain: set files, board tries and note stills, in image blocks and options, on pages of one to three steps and asks sharing a page, their files rewritten at random; a frame, a board block and a video block show live; a file missing or failing to copy refuses the make, naming its src`, `packages/film/src/tools/ask-materials.test.ts` `refuses an answer, and serves no bytes, once a copy its page shows no longer holds its hash, and takes and serves it while the copy does`, `packages/film/src/tools/lab-mcp.test.ts` `serves an ask's image from the copy it made, after a second publish_set rewrites the set's file, and takes the answer on it`, `packages/film/src/tools/ask-store.test.ts` `keeps the receipt of its images as it makes the ask: each try's file copied by its SHA-256 and shown as the copy; a try with no file refuses the make, naming its src`, `apps/firsttheblade/kit/approval.test.ts` `refuses an ask the lab does not hold, and one whose record holds no receipt, on pin and approve; a file its receipt has no hash of shows nothing`, `apps/firsttheblade/kit/approval.test.ts` `pin saves the ask as the lab gives it with its receipt, and approve saves it again as answered with the receipt of the steps he reached`.

### shown-copy-checked-before-it-is-served

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "`shownFile` serves a copy without checking its hash, under an immutable cache header"
- **Source:** ftb-approval-receipts/round-2-findings.md F2
- **Wrong:** After the make, a write over a copy in `asks/shown/` left `shownFile` returning it, and the shown route served those bytes as `immutable`, so a browser could keep bytes the receipt does not hold after the copy was put right.
- **Cause:** The route trusted a copy's name to stand for its bytes; only `answerPage` hashed it. `shownFile` now reads the copy once, hashes it, and refuses a copy that no longer holds its hash before any cacheable response; the route serves the bytes it hashed.
- **Guard:** code: `packages/film/src/tools/ask-materials.test.ts` `refuses an answer, and serves no bytes, once a copy its page shows no longer holds its hash, and takes and serves it while the copy does`.

### build-walk-reads-a-data-url-built-at-run-time

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "residual 6 is false: the walk does not find a data URL built at run time in `dist`"
- **Source:** ftb-approval-receipts/round-2-findings.md F3
- **Wrong:** `DATA_URL` in `kit/build-walk.ts` had no arm for the scheme at a string's end, so a chunk holding `"data:"+t+";base64,"` passed the walk, and so did a page holding `data&#58;image/png`, while the residual said the walk caught a data URL made at run time.
- **Cause:** The walk's pattern read only a literal data URL, and the residual was written from the lint's reach, not the walk's. The pattern now reads the scheme at a string's end and a colon written as an HTML character reference, a key or a name `data` aside; a URL put together from smaller pieces is named as outside the walk.
- **Guard:** code: `apps/firsttheblade/src/worker/respond.test.ts` `every response, of each kind the Worker sends over random paths and methods, carries a content policy that lets no picture in from anywhere but this origin, so a data URL never paints`. No reader of text holds this: the content policy (`img-src 'self'`) has the browser refuse a data URL however it is spelled, so the walk's data-URL pattern was removed (ftb-approval-receipts/round-3-findings.md F1, entry `data-url-refused-by-the-browser`).

### leaf-hold-refuses-a-reset-and-a-stir-off-a-card

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "the leaf hold lets through an `all:` reset and a `--stir` set on a part"
- **Source:** ftb-approval-receipts/round-2-findings.md F4
- **Wrong:** `svg > g { all: initial !important }` and `svg > g { --stir: 100 !important }` each passed every case of the leaf's hold, though the first undoes the sway and the second turns the leaf 500deg.
- **Cause:** The hold read only `transform-origin`, `transition`, the moving properties and `animation`, and it put the stir into `var(--stir)` with no cascade, so a stir set between the card and a part was never read. It now refuses `all` on a rule that reaches a part, and `--stir` on any rule whose subject is not a card.
- **Guard:** code: `apps/firsttheblade/src/motion/styles.test.ts` `the leaf’s hold refuses a sway too wide, a slow or linear turn, a turn at rest, a part turned about another point, a pivot set by a rule that names no emblem, a stem turned against its blade or moved by a rule naming only its type, a blade left still, a part reset by all, a stir set anywhere but on a card, and passes rules no part of it can match`.

### random-approval-draws-the-rules-domain

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "the random approval test never puts an image on a step the answer did not reach"
- **Source:** ftb-approval-receipts/round-1-findings.md F2
- **Wrong:** The random approval test put every image on the two steps its answers reached, with a receipt equal to the files, so a mutant whose `imagesShown` read every step of the ask passed it.
- **Cause:** The generator drew from a narrower domain than the rule's: image blocks on any step, answers that reach any subset of them (with a step the ask lacks and a step twice), and a receipt that misses files and holds others. The test now draws each of those, its oracle counts only blocks on the steps it drew as reached, and its `seen` holds a refusal of a still shown only on an unreached step.
- **Guard:** code: `apps/firsttheblade/kit/approval.test.ts` `over random pinned stills, some byte copies of others, image blocks on random steps, answers reaching any of them, and receipts missing and adding entries, approves only stills a reached block showed by the receipt, or an approval it gave, and refuses a re-pin after it to bytes not shown`.

### random-approval-draws-twin-stills

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "the random approval test never draws two stills with the same bytes"
- **Source:** ftb-approval-receipts/round-1-findings.md F5
- **Wrong:** Each still the random test rewrote got fresh random bytes, so a `stillsNotShown` that named one path per missing hash passed it.
- **Cause:** Two stills that share bytes were outside the generator, though the rule names each still, not each hash. The test now writes some stills as byte copies of others, and its `seen` holds a refusal that names both of two stills of one hash.
- **Guard:** code: `apps/firsttheblade/kit/approval.test.ts` `over random pinned stills, some byte copies of others, image blocks on random steps, answers reaching any of them, and receipts missing and adding entries, approves only stills a reached block showed by the receipt, or an approval it gave, and refuses a re-pin after it to bytes not shown`.

### earlier-approvals-held-by-their-saved-ask

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "`approve` and `shippable` count each earlier approval without checking it against its saved ask"
- **Source:** ftb-remedies-emblem/round-1-findings.md F1
- **Wrong:** An earlier entry of the record with no saved ask, an answer other than approve, hashes its saved receipt lacked, or the current ask's id passed `approve`, `shippable` and `prodGate`.
- **Cause:** `Given` checked only the shape of an earlier entry; nothing read the ask it names.
- **Guard:** code: `apps/firsttheblade/kit/approval.test.ts` `approve and shippable refuse each kept approval its saved ask does not hold: no saved ask, one of another ask, not answered approve, other files than it saved, its receipt or the steps he reached, a repeat of the current ask`, `apps/firsttheblade/kit/approval.test.ts` `the committed record is on an ask saved beside it, each approval it keeps held by its saved ask, and every still was shown byte for byte`.

### past-ask-fixtures-bound-per-path

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "the past ask's still fixtures are not bound to their hashes, one path at a time"
- **Source:** ftb-remedies-emblem/round-1-findings.md F3
- **Wrong:** The approval tests passed with `public/og/remedies.jpg` in `kit/fixtures/ask-ab47076e90b.stills/` holding the home card's bytes.
- **Cause:** The test checked that the fixtures' hashes were among the shown ones, not that each path held the hash its ask showed for it.
- **Guard:** code: `apps/firsttheblade/kit/approval.test.ts` `refuses the owner's real answer to ask ab47076e90b as it holds no receipt, and it stays an earlier approval of the stills it showed, each kept by its path with the hash it showed`.

### random-approval-test-has-its-own-oracle

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "the random approval test takes its expected refusals from `stillsNotShown`, the function under test"
- **Source:** ftb-remedies-emblem/round-1-findings.md F4
- **Wrong:** A defect in `stillsNotShown` would change the result and the expectation together.
- **Cause:** The test's expectation called the code it tested.
- **Guard:** code: `apps/firsttheblade/kit/approval.test.ts` `over random pinned stills, some byte copies of others, image blocks on random steps, answers reaching any of them, and receipts missing and adding entries, approves only stills a reached block showed by the receipt, or an approval it gave, and refuses a re-pin after it to bytes not shown`.

### build-walk-reads-every-svg-encoding

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "UTF-16 and non-UTF-8 SVG files escape the build walk"
- **Source:** ftb-motion/rewrite-round-3-findings.md F3
- **Wrong:** `formatOf` decoded a file as strict UTF-8 before it looked for the `svg` root, so an SVG in UTF-16 with a byte order mark, in ISO-8859-1, or gzipped UTF-16 was no image to the walk, and the SVG generator wrote only UTF-8.
- **Cause:** The walk read one encoding of the many XML allows, and a file it could not read passed as no image, so a form it did not know failed open.
- **Guard:** code: `apps/firsttheblade/kit/build-walk.test.ts` `reads an svg in UTF-16 little or big end first, with its byte order mark or none, in ISO-8859-1, and each gzipped`, `apps/firsttheblade/kit/build-walk.test.ts` `refuses every image under any name, extension and folder, each file named as an image that no signature reads as unknown, and passes the approved stills and the images outside the rule under any name`.

### leaf-sway-held-by-its-values

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "the leaf's style test holds the stem-foot pivot only on its own rule, not the amplitude, the easing or the rest pose"
- **Source:** ftb-remedies-emblem/round-1-findings.md F2
- **Wrong:** The stylesheet tests passed with the sway at `500deg`, a `20s linear` transition, `rotate: calc(5deg + 0deg * var(--stir))`, and an added `.emblem-remedies svg > g { transform-origin: 0 0 }`.
- **Cause:** The stir reader checked only that `var(--stir)` occurs, and the leaf test read the pivot of one selector and the names of the moved properties, not their values or the other rules on the parts.
- **Guard:** code: `apps/firsttheblade/src/motion/styles.test.ts` `the healing leaf sways as one about its stem’s foot: each rule on its parts turns them from 0deg at rest to 5deg stirred, about the foot, on the tree’s tokens, and nothing else moves them`, `apps/firsttheblade/src/motion/styles.test.ts` `the leaf’s hold refuses a sway too wide, a slow or linear turn, a turn at rest, a part turned about another point, a pivot set by a rule that names no emblem, a stem turned against its blade or moved by a rule naming only its type, a blade left still, a part reset by all, a stir set anywhere but on a card, and passes rules no part of it can match`.

### each-commit-runs-the-ledger

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "the per-commit guard does not hold the ledger test, so \"each commit green\" is not shown"
- **Source:** ftb-motion/rewrite-round-3-findings.md F4
- **Wrong:** The ledger test gave 5 failures on a commit of the unit that renamed the tests its entries cite, and `merge-audit --each` said every commit was green.
- **Cause:** `merge-audit --each` runs `bun run guard` on each commit, and the guard did not run `packages/scripts/src/lessons/ledger.test.ts`.
- **Guard:** code: `./package.json` `bun test ./packages/scripts/src/lessons/ledger.test.ts`, the root `guard` script that `merge-audit --each` runs on each commit.

### images-ship-as-their-own-files

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "an image inside another file is not walked (latent)"
- **Source:** ftb-motion/rewrite-round-3-findings.md F5
- **Wrong:** No image ships inlined now, but nothing refused one: a `?inline` import, or a data URL written in a script, a stylesheet or a drawing, puts an image inside another file of `dist/`, where the build walk does not read it.
- **Cause:** The build walk reads the built site's files, one image per file, and nothing held the site's sources to shipping each image as a file of its own.
- **Guard:** code: `apps/firsttheblade/src/worker/respond.test.ts` `every response, of each kind the Worker sends over random paths and methods, carries a content policy that lets no picture in from anywhere but this origin, so a data URL never paints`, `packages/film/lint/config.test.ts` `refuses an inlined import (Vite's own test of it) in every module the First the Blade site serves, scripts too, and passes a URL import`. The `?inline` import is refused by the site block's `no-restricted-imports` pattern in `.oxlintrc.json`, which the config test runs; a data URL written anywhere is refused by the browser under the content policy, so `film/no-data-url` and the source scan were removed (entry `data-url-refused-by-the-browser`).

### built-files-hold-no-data-url

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "the inline-image guards read the sources, and four forms pass them"
- **Source:** ftb-approval-receipts/round-1-findings.md F3
- **Wrong:** A `public/rogue.js` holding `data:image/png` passed every build-walk test, a `src/x.js` passed the lint, which read only `src/**/*.{ts,tsx}`, an import `./a.png?inline=1` passed the lint's `?inline` pattern though Vite inlines it, and no test held `assetsInlineLimit: 0`, without which Vite inlines each imported image under 4 KiB.
- **Cause:** The guards read the sources, which cannot list what the build emits, and the source scan skipped every script as linted while the lint read only the TypeScript of `src/`.
- **Guard:** code: `apps/firsttheblade/kit/build-walk.test.ts` `refuses every image under any name, extension and folder, each file named as an image that no signature reads as unknown, and passes the approved stills and the images outside the rule under any name`, `apps/firsttheblade/kit/build-walk.test.ts` `inlines no imported asset, so each image the build emits is a file of its own`, `packages/film/lint/config.test.ts` `refuses an inlined import (Vite's own test of it) in every module the First the Blade site serves, scripts too, and passes a URL import`, `apps/firsttheblade/src/worker/respond.test.ts` `every response, of each kind the Worker sends over random paths and methods, carries a content policy that lets no picture in from anywhere but this origin, so a data URL never paints`. A data URL in a built file is refused by the browser under the content policy, not by a reader of the file's text (entry `data-url-refused-by-the-browser`).

### leaf-hold-reads-every-rule-on-its-parts

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "the leaf test reads only rules that name `.emblem-remedies`"
- **Source:** ftb-approval-receipts/round-1-findings.md F4
- **Wrong:** All 15 stylesheet cases passed with `svg > g { transform-origin: 0 0 !important; }`, which moves the blade's pivot off the stem's foot, and with `.emblem-remedies svg > path { rotate: calc(-5deg * var(--stir)) }`, which turns the stem against the blade.
- **Cause:** The hold picked the rules on the leaf by the emblem's class, not by what can match its parts, and read each turn's size, not its way.
- **Guard:** code: `apps/firsttheblade/src/motion/styles.test.ts` `the leaf’s hold refuses a sway too wide, a slow or linear turn, a turn at rest, a part turned about another point, a pivot set by a rule that names no emblem, a stem turned against its blade or moved by a rule naming only its type, a blade left still, a part reset by all, a stir set anywhere but on a card, and passes rules no part of it can match`, `apps/firsttheblade/src/motion/styles.test.ts` `the healing leaf sways as one about its stem’s foot: each rule on its parts turns them from 0deg at rest to 5deg stirred, about the foot, on the tree’s tokens, and nothing else moves them`.

### data-url-refused-by-the-browser

- **Date:** 2026-10-22
- **Kind:** review
- **Said:** "the data-URL guards read raw text, so the walk refuses valid scripts and passes escaped data URLs"
- **Source:** ftb-approval-receipts/round-3-findings.md F1
- **Wrong:** The build walk's `DATA_URL` pattern and the `film/no-data-url` lint read files as text, so each held only the spellings its author thought of: escaped data URLs passed, and a valid minified script (`n?t.data:"none"`) was refused, which could block a prod deploy.
- **Cause:** The premise that a reader of built or source text can find every data-URL image was false four times (ftb-motion rewrite-r3 F5, this unit's r1 F3, r2 F3, r3 F1). The new premise: the browser refuses every image not served from the site's origin, as every response carries `img-src 'self'`, so a data URL, a blob or a foreign image never paints, however it is spelled. The text readers were removed; the `?inline` import rule stays, as it reads an import specifier the parser gives exactly.
- **Guard:** code: `apps/firsttheblade/src/worker/respond.test.ts` `every response, of each kind the Worker sends over random paths and methods, carries a content policy that lets no picture in from anywhere but this origin, so a data URL never paints`, `apps/firsttheblade/src/worker/respond.test.ts` `the policy reader refuses each way a policy lets a foreign picture in, and passes one that keeps to this origin`.
