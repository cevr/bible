# Lab tracks — design

Owner (2026-10-14), on a screen recording of a game tool, "scripter": "take a look at this as prior art - you
see it has the script viewer and it ties together? i think we can do that as well for our rive films".

Scripter is three panes and a timeline: the game following the playhead, the script's TypeScript source, and a
timeline with one row per track (Snow, Hero, Ribbon), each call a block sized by its length, labels (`shivering
7.40`) shared across tracks, `until(label)` drawn as a ranged block, open blocks "holds to end". The playhead's
block and its source line light together; a block picked puts the cursor on its line and a line picked picks its
block; ⌘S reflows the timeline and the game.

## Inventory: what the lab already has

Most of the ties exist, one cue at a time (scriptdesk, codefollow, the L3 editor):

| Scripter                                         | Ours, today                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Game · Script · Timeline                         | Code mode (`?code=live`): the picture and the scene source half and half, the cue strip under the picture.                                                                                                         |
| A script                                         | The scene's `drawing({ timeline })`: a named cue per moment, anchored to a `{mark}`, a cue (`after`, `with`) or a landmark.                                                                                        |
| A block (`hero.act('snowed-on', {duration: 6})`) | A cue: `bow: { mark: 'did', dur: 0.35 }`. One bar in the strip.                                                                                                                                                    |
| A label (`label('shivering')`)                   | A narration `{mark}`: one instant every track can anchor to. Drawn as a 2 px tick in the strip's words, its name only in a tooltip.                                                                                |
| `wait().until('shivering')`, `{within}`          | `until`: `build: { at: 'speech', until: 'evidence' }`, its end on the mark, so a re-take moves it. `after`/`with` chain one cue on another.                                                                        |
| "holds to end"                                   | `until: { at: 'end' }`.                                                                                                                                                                                            |
| Playhead lights its block and its line           | The strip lights each cue the playhead is inside (`data-live`); the Source view lights the same cue's literal and every read of it as it fires (`lab/source/lit.ts`).                                              |
| Block → line                                     | A bar pressed selects its cue (`?cue=`); the Source view marks the cue's literal; the inspector's `file:line` opens the view held there.                                                                           |
| Line → block                                     | A tap on a literal's line in the Source view selects that cue and seeks to where it next fires.                                                                                                                    |
| ⌘S reflows                                       | A drag of a bar, an ease pick or a field writes the scene's `.ts` (oxc splice, oxfmt, compare-and-swap, undo); an edit in the author's own editor rebuilds the lab page, which reloads on the same frame and pick. |

What is missing is the one thing that makes scripter's timeline readable at a glance: **who moves when**. Our strip
is one row per cue, named by the cue, so a scene of seven cues is seven rows, and the actor a cue moves is only
known by reading the draw code. The marks, the moments every actor reacts to, have no visible names or times.

## Decision: a cue names its track

A track is the actor or part a cue moves: `accused`, `judge`, `evidence`, `room`. It is authored, one field on the
span, the one place the cue already lives:

```ts
timeline: {
  build: { at: 'speech', until: 'evidence', track: 'room' },
  drop: { mark: 'evidence', dur: 1.4, ease: 'inCubic', stagger: 0.857, track: 'evidence' },
  bow: { mark: 'did', dur: 0.35, track: 'accused' },
  lean: { mark: 'judge', dur: 0.4, track: 'judge' },
  ...
}
```

Why this and not the alternatives:

- **Not scripter's call vocabulary** (`track(hero, hero.act(…), label(…), wait().until(…))`). We already have the
  semantics with better anchors: our labels are the narration's marks (a re-take moves every cue on them), our
  `until` and `after`/`with` are scripter's `until` and sequencing, and every tool (layout, `film cues`, the sound
  plan, lint, the oxc writer, the Source view's lit spans) reads the flat `timeline` by cue name. Nesting cues under
  tracks would break every one of those readers to buy a grouping. One optional field buys it whole.
- **Not derived from the draw's reads.** Who _acts_ on a cue is the author's intent, not a fact the code proves:
  in the court the accused and the judge both read `lean` and `stamp` (one acts, the other reacts), and in the
  cold-studies looks the reads live in look files the scene never names (`lookOf().court(f)`). A runtime
  attribution would need actor scopes in every draw and still could not tell an act from a reaction. Reactions
  are a later, derived layer (below), on top of the authored track.
- **Not a scene-level `tracks: { accused: ['bow', 'lift'] }` list.** That is a second place a cue is named, kept in
  step with the timeline by hand (derive, don't sync). The rows' order is derived instead: tracks in the order
  their first cue is written.

A cue with no `track` is its own track, named by the cue. That is today's strip exactly: every existing scene draws
as it does now, and a scene opts in cue by cue. There is no "untracked" row and no special case.

`track` is a free string, not typed against the rigs: actors are not all rigs (the evidence, the verdict stamp, the
camera), and a misspelt track shows at once as its own row. `patchSpan` keeps it through a lab edit, as it keeps
`silence`, so a dragged bar stays in its row. Layout, the clock and the picture never read it: no frame moves.

## The timeline, derived

`lab/editor/tracks.ts` (pure, tested) turns what the strip already reads (the stage's `timelineOf` spans and
`cuesOf` resolved cues, and the placed scene's marks) into rows:

- **Tracks** in the order of their first cue; each track's cues packed into lanes (a cue goes in the first lane it
  does not overlap, by its resolved start and end), so two moves of one actor that overlap stack and never hide
  each other. A lane is a strip row (`.lab-strip-row`), so the lab's one Follow rule (`lab/follow.ts`), the grips,
  the in/out range drag and every existing test keep working unchanged.
- **A block's words:** its name and length (`bow 0.35 s`), its `until` (`build until {evidence}`), an end off its
  point by how much (`near until {held} +0.20 s`), "holds to end" for a span `until` the scene's end, written inside
  its bar on a named track (one its spans name, however many cues it has). A cue that names no track is its own
  row, named by the cue at the left with no words in its bar, as today.
- **While a cue is held** its bar keeps its lane (`heldLanes`): the bar holds the pointer's capture, so remounting
  it on another lane would cancel the grip. It stacks once let go.
- **Labels:** each `{mark}` of the scene's voice as a flag on a ruler over the words, with its scene time
  (`evidence 1.62`), and a faint rule down through every row, so a block's edge on a mark reads as tied to it. In
  Code mode only: there the strip is the code's timeline, as scripter's is. Edit, Note, Motion, Compare and Record
  keep their at-rest budgets (UR2-17, `e2e/lab/touch-budgets.dom.test.ts`), so there the marks stay ticks on the
  words, named in their tooltips.
- **The count:** the strip's head says `3 tracks · 6 marks · 7 cues`.

## The ties

- **Playhead → block and line:** as today; a block keeps `data-live`, its literal line lights.
- **Block → line:** a bar pressed selects its cue, and the Source view marks its literal (as today).
- **Line → block:** a tap on a literal selects its cue outside Code mode (as today; in Code mode a tap seeks, the
  codefollow decision).
- **Hover, both ways:** the pointer over a bar marks its literal's line in the code, and the pointer over a cue's
  line marks its bar: scripter's "cursor on the line" without a pick, no URL and no history. This is the slice's new
  tie.
- **Not built: a pick scrolling both views.** It would move the Source view and the strip's rows on a pick, which
  changes the one Follow rule's hold (`lab/follow.ts`: a scroll the view did not make lets Follow go; a pick that
  scrolls would be a third kind). Picks already mark both sides and hover ties them while reading; scroll-on-pick
  waits for the owner.

## Live edit and reflow

The write path stays the lab's one: a value spliced into the literal through `SourceWriter` (compare-and-swap,
oxfmt, check, undo), or the author's own editor. Either rebuilds the page, which reloads on the same frame and pick,
so the timeline reflows from the new source. An in-lab text editor for the whole file (scripter's ⌘S) is a second
write kind, a whole-file write that the lab's rule ("values only, formatting by oxfmt", `plans/lab.md`) does not
have; it is listed below, not built, until the owner asks for it.

## Beside the Script and the Board

- **Script** (scriptdesk) is the film's words with the cues tied to them; **Board** is the pictures planned before
  the scenes exist; **tracks** are a scene's cues by actor under its picture, beside its code. One cue model under
  all three: a cue tied to a mark on the Script is the same block on the mark's flag here.
- A Board panel names its beat; a scene's tracks are its beat's acting. Later: a Board panel's note on an actor
  ("the judge leans too early") lands on that actor's track.

## Later (not in the first slice)

- **Reactions:** the reads of another track's cue (the accused's fear reads the judge's `lean`), derived from the
  frame's reads (`player.hearClock()`), drawn as a thin echo on the reacting track.
- **The look's code:** a Rive look's poses live in look files (`looks/rive/accused.ts`), not the scene; the Source
  view shows the scene file only. A read in a look's file, lit with its block, needs the code answer to span
  files.
- **A Rive act as data:** a cue on a rig's track that plays one of its timelines stretched over its length (today
  each look's `cueTime` helper). Then a block is literally scripter's `hero.act('bow')`.
- **Whole-file edit with ⌘S** (above).

## First slice

On cold-studies (the film with Rive looks: `rive`, `rivegl`, `papercut`, `papercutgl`): `track` on the span, the
strip's track rows, block words, mark flags and rules, the count, the hover ties both ways; court and job declare
their tracks. Proved by unit tests of `tracks.ts`, the strip's e2e, and a live
lab.
