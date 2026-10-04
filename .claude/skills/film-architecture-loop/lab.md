# Lab sweep

The lab (`bun run lab`, `/films/<film>/lab`; always on as the box's `film-lab` unit) is where the owner reviews a film and the agent answers: the owner annotates a frame, the agent changes data or code and replies with the after-still. Its design and history are in `apps/animations/plans/lab.md`; its workflow is the `film` skill's Lab loop. A great lab makes a note cheap to leave, cheap to answer and cheap to verify. The lab as a studio (one surface, live from source, addressable, combing scenes, phone-first) has its own north stars and prior arts at the repo root, `NORTH_STAR.md` and `PRIOR_ARTS.md`, swept by `/architecture-loop`; this sweep keeps to the framework's.

## What the sweep checks

1. **Reach.** Every value a note asked to change in past sessions: was it a cue or a knob, or did the agent have to promote it first? A class of value that keeps needing promotion (positions of a figure, a camera framing, a colour) is a finding: the kit or `drawing()` should expose it as data by default.
2. **Write-back.** The lab rewrites literals in the scene's `.ts` file. It refuses non-literals and names them; undo puts the last write back. Check: every refusal path has a test; a write keeps the file formatted; two quick writes cannot interleave; a write to a knob read inside a helper module (court.ts, the kit) lands in the right file or is refused with a reason; a timeline or knobs lifted to a module `const` (to type a scene's shots) stays editable (`packages/film/src/tools/scene-source.test.ts`, on a fixture scene).
3. **Motion tools.** Onion skin, slow playback, cue loop, A/B loop, compare with HEAD (wipe, blink). Each works on every film, not only the one it was built for.
4. **Notes.** A note carries frame, still, box, scene, nearest cue and mark; `notes --watch` delivers each event once and resumes from a cursor. Check a note on a storyboard card, on a transition, and at a scene's last frame.
5. **Speed.** Lab frame time and scrub rate from the performance baseline. The lab redraws the current `T` only (pure frames): anything that redraws more is a finding.
6. **Agent instruments.** What the agent needs to answer a note without the owner: stills at a time, a contact sheet of one cue, the diff of the last write, the check findings for the scene. Missing ones are findings.

## Prior art to compare

| Tool                 | Read it for                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Remotion Studio      | the props panel that saves `defaultProps` back to the source file, the timeline of sequences, the render queue, `remotion benchmark` |
| Theatre.js studio    | the sequence editor, keyframe curves, the object tree; and why its values live in JSON (rejected here: a second copy of a value)     |
| Motion Canvas editor | the timeline with time events you drag (`waitUntil`), the frame-accurate scrubber, hot reload that keeps the time                    |
| modem-dev/sideshow   | a comment on a live surface, long-polled and delivered to the agent once                                                             |
| R3F + leva / drei    | leva's typed controls from a schema, drei's `<PerformanceMonitor>` and `invalidate` (redraw on change only)                          |

## Report

Per finding: which of the six it is, the receipt (file:line, or the agent-browser steps that show it), the north star (usually **Lab-first**), and the change. Lab features are live-checked with `agent-browser` in step 11 of the loop.
