# Storyboard

A film is drawn as a **board**, as a studio's is: after its script and its concepts, the script's beats drawn as held panels in the kept concepts' look before any voice is staged or scene is drawn, then played as the animatic, then the scenes built to the board, then the render held against it ([SKILL.md](../SKILL.md), The flow). The record is `src/films/<film>/board.json` (committed); its images sit in `src/films/<film>/board/` (git-ignored, each try recorded with its sha256, so a copy from another checkout is known to be the same). Commands are in `apps/animations/README.md` (`bun run board …`); the routes and the store are under **Board** in `packages/film/README.md`.

## A panel

A **panel** is one held frame of a beat: `<beat>.<at>`, held from the `{mark}` `at` in the beat's line (or `start`) until the next panel. The board plans a beat's panels from the marks its `picture` names, at most three, one at the start when it names none. A **picture panel** is its tries, one kept with a why. A **text panel** is set by the engine in the film's card style and has no tries:

- `board card` for words the narration says (CRAFT rule 1: the narration's words appear on screen only as a full-screen card, set exactly as spoken from the panel's mark, the payoff large).
- `board verse` for Scripture on its page, verbatim KJV, its phrase swept as it is said.

The image route letters a sign well enough, yet a word the narration says always goes on a card the engine sets: its words are the take's, and a card is where the board shows it lands. A brief that asks for lettering in the picture ("the question writes itself above the bench") is a script question for the owner, never a prompt.

## Making the board

1. **Style.** Every film's board takes the locked house look (owner, 2026-10-15: "lets lock in that style"; [director-vision.md](director-vision.md), The locked house look), set once with its block, its reference image and the film's world in a paragraph (palette, the plain lead and cast as their sheets draw them, setting):

   ```
   bun run board style <film> --id 9005 --name "K1-minimal · house look" \
     --block-file docs/ref/house-look.txt --ref docs/ref/house-look.png --world-file <world.txt>
   ```

   No code default exists: the house look is those two committed files (the image gives the paper, the line and the light; its hands float, which the house no longer draws: every hand is at the end of an arm in its sleeve), and `board style` copies the image into the board folder as `style.9005.png`. A frame the owner already approved, a kept concept among them, comes in by `board import` with `--keep` and `--why`.

2. **Draw.** `bun run board <film> --lanes 3` (or `--beat id,id`): two tries a panel on `okra image`'s Codex route, with the style ref attached. The route is the Codex one only: never pass `--model`, never a paid route, and keep personal data out of every prompt. A try takes about 50 s (37–164 s); RBF's 100 tries took 31 minutes on 3 lanes. `--dry-run` prints the prompts first.
3. **Pick.** Look at both tries of every panel against its brief, the line at its mark, the style and the frames already kept, and keep one with a concrete why (`bun run lab keep_try --film <film> --panel <beat>.<at> --try <n> --why …`). The owner keeps a try in the studio's inspector too; an agent's picks are the owner's to overrule.
4. **Text.** Set every card and verse panel (`board card|verse`): where the line's key word or a quotation must be read, the board shows the card at its mark.

### What the route does

Learned on RBF (style 9005): it holds the style when its reference image rides along; asked for several recipes of one scene it collapses them into one family, so a second idea is a second panel, never a second recipe in one prompt; a fine stylistic trait (a value-stepped beard) appears only sometimes, so a trait the cast must carry is checked in each kept try; and it spells lettering reliably, which is why a prompt asks for no words in the picture rather than trusting it to leave them out (none of RBF's 100 tries carried a stray letter).

What it gets wrong, so a pick checks for it and a tweak names it. The first three are counted on RBF's v2 Board (`apps/animations/src/films/righteousness-by-faith/v2/board.json`: 52 kept panels, drawn and kept on 2026-10-14, as each keep's why names them, the arms as each try's image shows them). That Board's block asks for hands that float free, so these counts take no sleeve and no free hand as a fault. The faults stand most common first: check a pick for them in this order (a dated count, after taste-skill's tells registry, MIT).

- **The cast.** Crowds and named people drift toward the style ref's people: skin tones, hair, bright clothes, its props (4 of the 52). A head warms off its sheet's colour: the v2 everyman's grey head warmed in 6, and a grey crowd took skin tones in 2 more. Stick arms or bare arms appear on gestures (4 of the 52, kept in 1 at most). The house hand is a circle at the end of an arm in its sleeve (CRAFT.md), and the style ref's hands float, so check that each hand has its sleeve.
- **A part both tries drop.** Two draws of one prompt can fail the same way. In 8 of the 52, both tries shared a fault: a part the brief named was missing in 7 (the gold word-bubble in 3, the white robe in 2), a called-back layout was lost in 2, and one panel had both. Name the part in a tweak, or give it a panel of its own.
- **Callbacks.** Only the style ref rides along, so a frame that calls back an earlier beat (the cold open's court, the robed figure, a recurring prop row) is redrawn from words and drifts: a callback or the beat's own place was lost in 6 of the 52. Name the called-back panel in the tweak and draw over it.
- **Character sheets.** The route does not attach a film's character sheets yet ([film-flow-audit.md](../../../../apps/animations/plans/film-flow-audit.md), `concepttool`). Unattached, the plain lead drifts taller, slimmer or into another hue. Until the route attaches them, draw a try of a sheet's figure with its sheet attached (the plain lead's `apps/animations/docs/ref/plain-lead-sheet.png`, the robe sheet where the story clothes him), and measure the try against the sheet before you pick it (character-design 2.3).
- **Big changes inside a beat.** A beat's later panels copy its first, which holds continuity and drops the change the brief asks for (a circle that keeps growing, specks winking out).
- **Tweaks.** Sent the try with "keep everything", the route returns near copies; the tweak prompt therefore asks for the change plainly, seen at a glance.

## Notes and tweaks

The owner works the board in the studio (`/films/<film>/studio`): a panel's clip on the timeline's Board lane, or a beat, opens the inspector's **Board** section, each of the beat's panels at its mark with its tries as a strip of thumbs, the kept one ringed and its why under it; a try pressed shows in the viewer (a second press, the kept one), and **Keep** keeps it on the version the film plays. **Mark up** draws over a try with a pen and takes the owner's words, saved as a **Tweak** (or a plain note) on that try. **Approve** approves the beat once each of its pictures keeps a try (the button says why not before then), **Withdraw** takes an approval back. The **Notes and asks** section holds the beat's open notes, each with its thread and a reply, and its asks. The old Board page's links (`/films/<film>/board/<beat>?panel=`) land on the studio with that beat or panel selected.

A comment or a tweak is a lab note carrying its `panel` (`id`, `try`, `ask: tweak`), and a sketch and a still of the panel as drawn on when it has them. An agent asks a tweak with the lab's `request_tweak` tool, the owner's word from chat on it. Read them with `bun run lab notes --film <film>`; a tweak is made with:

```
bun run board tweak <film> <note>
```

It sends the try, the note's still (the sketch on it) and the style ref, with the note's words, and adds the results as new tries (`made: tweak`, the note named); the old tries stay as history. Then pick, reply on the note (`bun run lab reply`) and resolve it once the owner keeps the result.

## Building a scene to its board

The kept panel at a mark is the frame the scene shows at that mark: its staging, its cast and their places, its light. The figures are the engine's K1 rigs, never the panel's drawing; the backgrounds, skies, light and glow follow the kept panel (owner, 2026-10-14: "matched to these panels"). Draw the scene to it ([SKILL.md](../SKILL.md) step 7, **Scenes**), then hold the render against it and against the film's kept concepts:

- In the studio, the panel's clip on the Board lane shows the kept try; the scene plays in the viewer at the same mark.
- From the terminal, `bun run look --film <film> --scene <id> --at mark:<at>` gives the scene's still at the mark, to view beside `board/<file>`.

A framing that no kept panel shows (a cut-in, a reverse) takes the beat's kept panels as its source: the same light, places, cast and colours, framed by DIRECTION's staging grammar ([director-vision.md](director-vision.md), "Camera and staging grammar"). Never invent a new design in code. The painter names each one in its report, with its still, and whoever started it shows each one to the owner before a render.

Done when every kept panel's staging reads in its scene's frame at its mark, or the owner has accepted the difference on the board.
