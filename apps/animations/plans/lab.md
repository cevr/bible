# Film Lab — design

Sources: Brian Lovin, "Give your agent a laboratory" (the agent builds instruments to measure, compare and iterate
itself; the human sets success criteria instead of checking by hand). modem-dev/sideshow (a live surface the
human comments on; `GET /api/comments?wait=60` long-poll; a Claude Code _monitor_ runs `sideshow watch` so each
comment arrives as a notification, exactly once).

## Decision: Canvas 2D, per frame. Not three.js.

- A frame is already a pure function of `T` (`film.render(ctx, T)`). A live editor is just: change data → redraw
  the current `T`. No retained scene graph to keep in sync, no replay. That is the easiest possible editor.
- three.js buys depth, lighting and shaders. Cut paper is 2D; a retained graph fights the pure-frame rule
  (R3F/Motion rejected for this in prior-art.md). A WebGL post pass stays an opt-in later look pass.

## The rule that makes editing possible: tweakable = data

A tweak must land in exactly one place the code reads (north star: declared once). Two kinds of data exist or
are cheap to add:

1. **Cues** (built in P1-2): `timeline: { slam: { mark: 'fiction', offset: 0.9, dur: 0.35, ease: 'inQuad' } }`.
   Timing and easing of every named moment. Add `ease` to `Span` so easing is data too.
2. **Knobs** (new): `knobs: { handY: 800, tagAngle: 0.12, quoteAt: [960, 170] }` on a drawing, read as
   `f.knob('handY')`. Numbers and points. Typed like cues (`Frame<C, K>`).

Everything still hard-coded stays hard-coded; the lab only exposes what a scene promotes to a cue or a knob.
Promoting is a one-line change the agent makes when a note asks to tweak something.

## Write-back: edits go to source, not a sidecar

The lab saves by rewriting the `timeline`/`knobs` object literal in the scene's `.ts` file (oxc-parser for
positions + a string splice; values only, formatting by oxfmt). No `tweaks.json` layer, so there is never a
second place a value lives (Theatre's absolute-time JSON was rejected for exactly this). Bun HMR reloads the
scene; the git diff is the record of what changed; the golden/`film check` loop verifies it.

## The app: `film lab <film>`

A Bun server (reuses the app's PreviewServer + HMR) serving the player with a lab mode:

- **Timeline**: scenes, marks, cues (spans), sound cues, music acts (P1-4 draws these). Drag a cue's start/end
  → its `offset`/`dur` changes; snaps to words (word timings are known) and frames.
- **Inspector** for the selected cue/knob: numbers, an ease picker with the curve drawn, point knobs as
  draggable handles on the canvas.
- **Motion tools**: loop A–B, 0.25×/0.5× playback, step by frame, onion skin (±N frames ghosted), a motion
  trail for a knob-driven object.
- **Compare**: split or blink view — current vs. HEAD (render HEAD in a second page) or vs. golden.
- **Notes**: click the canvas (optionally drag a box) at any frame → a note `{id, film, scene, T, frame, cue?,
box?, text, still}`. The still is the exact frame PNG. Stored in `apps/animations/lab/<film>/notes.json` +
  `stills/` (gitignored). Status: open → agent-replied → resolved; replies thread under the note. Notes show as
  pins on the timeline.

## The agent's side (the laboratory)

- `film notes <film> --watch`: streams new notes as lines (for a Claude Code Monitor, like `sideshow watch`),
  exactly once. `film notes <film>` lists open notes; `film notes reply <id> "…"` / `resolve <id>`.
- Every note hands the agent the frame, the still, the scene, the nearest cue/mark, and the box → it reads the
  still, makes the change (promote to a knob/cue if needed), re-renders the same frame, attaches the after-still
  to the reply. The human sees before/after in the lab.
- Instruments the agent already owns: `film check`, stills at cues, golden diff, contact sheets, `film cues`.
  The film skill gets a "lab loop" section.

## Build order (each a commit that passes the gate)

All five batches are built.

- L1 Done. `ease` on Span + knobs (`f.knob`), typed; tests. No picture change. Every cue declares its ease
  (`refactor(animations): declared eases for every cue`).
- L2 Done. Lab server + notes store + `film notes` (list/watch/reply/resolve) + notes UI (pin, box, pen,
  thread).
- L3 Done. Cue editing on the timeline + inspector + source write-back (oxc splice) + HMR round-trip test:
  identity locator (SceneSources), SceneWriter (splice, oxfmt, read-back, one undo), StaticCheck after each
  write, the strip and inspector.
- L4 Done.
  - Motion tools (`lab-motion.ts`): onion skin (± N frames, warm before / cool after, only what moved), 0.25×
    and 0.5× playback, loop the selected cue or A–B. Step by frame was already the player's ←/→.
  - Compare vs HEAD (`lab-compare.ts`, SceneHead): wipe and blink; data only, says when code changed.
  - Knob handles under a transform: each read records its canvas transform (`KnobRead.transform`); the
    handle sits at `transform · value` and a drag maps back through the inverse (`core/affine.ts`).
  - Stroke probe for `check`: `InkOverText` (a stroke's centre line through a line of text) and
    `PlateOffFrame`, with `marks` for deliberate marks and `probePlate` for plates. It found and fixed five
    real defects (measure, witness, justified, within, 1888).
  - Look-book (`lookbook.ts`, `film lookbook`): palette swatches + every scene's stills at its cue edges
    and 60% point, live in the lab and written to `out/<film>/lookbook.jpg`.
- L5 Done. The film skill's Lab loop (look-book first, Monitor on `film notes --watch`, per-note
  still → change → same-frame render → reply with the after-still → resolve on the user's OK, motion,
  compare, `git diff` review, check after edits) and both READMEs.

## Later

Not built; each waits for a need.

- **Generated painted assets with key-colour regions.** When the look pass brings in generated art, its
  key-colour regions (Ruiz's magenta hair) become knobs, so a character is recoloured without regenerating.
- **A props-and-figures sheet.** The look-book shows scenes at their moments; a sheet of every kit prop and
  figure drawn alone, at one scale, would check consistency before any scene uses them.
- **Compare vs golden**, beside compare vs HEAD (the golden stills already exist; the lab would load one).
- **Compare a code change.** Compare draws HEAD's data through today's code; a code change needs HEAD's
  bundle in a second page.
- **A motion trail** for a knob-driven object (the path its handle takes across a cue), next to the onion
  skin.
- **A board of stills** the agent posts into the lab for review (per cue, per scene), Ruiz's shared board.
- **Continuous sampling in `check`.** The probe samples marks, cue edges and the 60% point; a sweep that
  crosses text between two samples is still found by eye.
- **A WebGL look pass** (post-processing over the 2D frame), opt-in.

## From Steve Ruiz's Danger World thread (x.com/steveruizok/status/2099053259147121069)

- **Look-book before final art**: a sheet of every character, prop and UI piece, tweaked for consistency first.
  → `film lookbook <film>`: renders every kit prop and figure (and palette swatches) on one sheet; it is the
  first lab page for a new film and the consistency reference for scenes.
- **Feedback is visual: annotation or "screenshot surgery"**, and the agent dumps screenshots of every screen
  and state into a shared board (a tldraw file). → Notes get a pen/arrow layer drawn on the frame, not just a
  box and text; the agent can post a "board" of stills (per cue, per scene) into the lab for review.
- **Everything voiced by TTS, regenerated when content changes** → we already do this (content-addressed takes).
- **Key colour in generated art** (magenta hair) → recolour per character without regenerating. Relevant when
  the look pass brings in generated painted assets: key-colour regions become knobs.
