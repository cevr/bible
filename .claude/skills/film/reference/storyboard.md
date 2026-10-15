# Storyboard

A film is drawn as a **board**, as a studio's is: after its script and its concepts, the script's beats drawn as held panels in the kept concepts' look before any voice is staged or scene is drawn, then played as the animatic, then the scenes built to the board, then the render held against it ([SKILL.md](../SKILL.md), The flow). The record is `src/films/<film>/board.json` (committed); its images sit in `src/films/<film>/board/` (git-ignored, each try recorded with its sha256, so a copy from another checkout is known to be the same). Commands are in `apps/animations/README.md` (`bun run board …`); the routes and the store are under **Board** in `packages/film/README.md`.

## A panel

A **panel** is one held frame of a beat: `<beat>.<at>`, held from the `{mark}` `at` in the beat's line (or `start`) until the next panel. The board plans a beat's panels from the marks its `picture` names, at most three, one at the start when it names none. A **picture panel** is its tries, one kept with a why. A **text panel** is set by the engine in the film's card style and has no tries:

- `board card` for words the narration says (CRAFT rule 1: the narration's words appear on screen only as a full-screen card, set exactly as spoken from the panel's mark, the payoff large).
- `board verse` for Scripture on its page, verbatim KJV, its phrase swept as it is said.

The image route letters a sign well enough, yet a word the narration says always goes on a card the engine sets: its words are the take's, and a card is where the board shows it lands. A brief that asks for lettering in the picture ("the question writes itself above the bench") is a script question for the owner, never a prompt.

## Making the board

1. **Style.** `bun run board style <film>` once, from the film's kept concept, or the house style when it has none (9005, K1-minimal, today): its block (every prompt opens with it), its reference image, and the film's world in a paragraph (palette, cast as drawn, setting). A frame the owner already approved, a kept concept among them, comes in by `board import` with `--keep` and `--why`.
2. **Draw.** `bun run board <film> --lanes 3` (or `--beat id,id`): two tries a panel on `okra image`'s Codex route, with the style ref attached. The route is the Codex one only: never pass `--model`, never a paid route, and keep personal data out of every prompt. A try takes about 50 s (37–164 s); RBF's 100 tries took 31 minutes on 3 lanes. `--dry-run` prints the prompts first.
3. **Pick.** Look at both tries of every panel against its brief, the line at its mark, the style and the frames already kept, and keep one with a concrete why (`board pick … --why`). The owner picks on the Board page too; an agent's picks are the owner's to overrule.
4. **Text.** Set every card and verse panel (`board card|verse`): where the line's key word or a quotation must be read, the board shows the card at its mark.

### What the route does

Learned on RBF (style 9005): it holds the style when its reference image rides along; asked for several recipes of one scene it collapses them into one family, so a second idea is a second panel, never a second recipe in one prompt; a fine stylistic trait (a value-stepped beard) appears only sometimes, so a trait the cast must carry is checked in each kept try; and it spells lettering reliably, which is why a prompt asks for no words in the picture rather than trusting it to leave them out (none of RBF's 100 tries carried a stray letter).

What it gets wrong, so a pick checks for it and a tweak names it:

- **Callbacks.** Only the style ref rides along, so a frame that calls back an earlier beat (the cold open's court, the robed figure, a recurring prop row) is redrawn from words and drifts. Name the called-back panel in the tweak and draw over it.
- **The cast.** Crowds and named people drift toward the style ref's people: skin tones, hair, bright clothes, its props. The everyman's grey head warms. Sleeves or stick arms appear on gestures despite the circle-hands rule.
- **Big changes inside a beat.** A beat's later panels copy its first, which holds continuity and drops the change the brief asks for (a circle that keeps growing, specks winking out).
- **Tweaks.** Sent the try with "keep everything", the route returns near copies; the tweak prompt therefore asks for the change plainly, seen at a glance.

## Notes and tweaks

The **Board page** (`/films/<film>/board`, ⇧2 in the studio) is where the owner works the board: the beats in play order, each leading with its panels and the words each holds for (the brief clamped, the line behind **Brief and line**); the **animatic** on the narration's clock (each panel held from its mark, a storyboard card where a beat has none), the column following the beat under the frame until a reader scrolls it (**Follow** takes it back), and a tag on the picture naming the panel and try it shows; **Draw** on a panel (pen with pressure, arrow, rectangle, ellipse, text, eraser; three inks; undo, redo); **Comment**; **Ask for a tweak**; pick between tries; **Approve** a beat; and **Compare** a panel with the scene: while the frame is in the panel's span the picture splits, the panel's left half beside the scene's own right half, and elsewhere it plays the animatic. A film with no drawn scene yet opens on its Board.

A comment or a tweak is a lab note carrying its `panel` (`id`, `try`, `ask: tweak`) and its `sketch`, with a still of the panel as drawn on. Read them with `bun run notes <film>`; a tweak is made with:

```
bun run board tweak <film> <note>
```

It sends the try, the note's still (the sketch on it) and the style ref, with the note's words, and adds the results as new tries (`made: tweak`, the note named); the old tries stay as history. Then pick, reply on the note (`bun run notes reply`) and resolve it once the owner keeps the result.

## Building a scene to its board

The kept panel at a mark is the frame the scene shows at that mark: its staging, its cast and their places, its light. The figures are the engine's K1 rigs, never the panel's drawing; the backgrounds, skies, light and glow follow the kept panel (owner, 2026-10-14: "matched to these panels"). Draw the scene to it ([SKILL.md](../SKILL.md) step 7, **Scenes**), then hold the render against it and against the film's kept concepts:

- On the Board page, **Compare** splits the picture at the panel's mark: the panel's left half, the scene's right half.
- From the terminal, `bun run look <film> --scene <id> --at mark:<at>` gives the scene's still at the mark, to view beside `board/<file>`.

Done when every kept panel's staging reads in its scene's frame at its mark, or the owner has accepted the difference on the board.

## The surface

The Board's drawing surface is our own clean-room Solid 2 surface on `perfect-freehand` (MIT): no tldraw code or package, since tldraw's licence is source-available, not open source. Its behaviour (pointer, pen and touch alike; a second finger cancels a stroke; shift constrains; undo, redo, select, erase, text) is one pure machine, `packages/film/src/lab/sketch/gesture.ts`, each behaviour a case in its test.
