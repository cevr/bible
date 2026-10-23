# Motion: a figure that feels alive

How a film's figures, props and scenery move between their poses so they read as alive and not as puppets. It is adapted from [rossark-motion-skill](https://github.com/rossark0/rossark-motion-skill) (MIT, 2026-10-22), cut to what a narrated cut-paper film on Rive needs. The app-only parts (React Native, SwiftUI, reduced motion, interface timing) are left out.

**What wins.** [CRAFT.md](CRAFT.md), [reference/director-vision.md](reference/director-vision.md), a film's kept boards and concepts, and the owner's words outrank this file. Director-vision already sets the camera's breath, the 4 s rule, the hand's arc, how a flat face turns and that the body acts first; this file does not restate them. A figure's proportions come from its cast sheet, never from a number here. The locked look never changes for motion ([SKILL.md](SKILL.md#speed), **Speed**).

## Principles

1. **Never teleport.** Every change is interpolated: a pupil slides, a door swings, a hand travels its arc. A pose never snaps to the next.
2. **Calm by default.** Eased moves with strong curves. One soft overshoot (`outSoft`) only for a paper cut-out landing; no bounce elsewhere.
3. **Small amplitudes.** Life is subtle. When unsure, halve it.
4. **Arcs about pivots.** Each moving part turns about its joint (a stem's base, a hinge, the neck, the shoulder). A straight slide reads as a machine.
5. **Overlap and follow-through.** Parts do not move together. The tip moves later and further than the root; hair, a sleeve's end, a robe's hem and a hanging sign lag and settle.
6. **Variety without chaos.** Repeated things (rain, leaves, a crowd's breath) each take a seeded phase, speed and size. Never `Math.random()` in a frame (a frame is a pure function of time, [RIVE.md](RIVE.md)), and never everything in sync.
7. **One main action per beat, plus two or three idle movements.** The action tells the line; the idle only says the place is alive. Figures not in the action stay quiet.
8. **Opacity for appearing and leaving.** A figure or a prop is never dimmed halfway to mean "less". A diagram's icon that steps back for another is a state the board names, not this.
9. **Give every move enough frames.** A film draws at 30 fps (`FILM_FPS`). A move under about 100 ms is two or three frames and flickers: a blink closes in at least 110 ms.

## Curves

The engine's names are in `packages/film/src/core/time.ts` `ease`.

| What moves                                                                       | Curve                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Travels (a gaze, a sway, a door, a hand on its arc)                              | `inOutCubic` (the default) or `inOutQuart` for a stronger one |
| Opens or arrives (a mouth, a lid reopening, a prop appearing, a line drawing on) | `outCubic` or `outQuart`                                      |
| Leaves or falls away (a leaf dropping, a figure going)                           | `inQuad` or `inCubic`                                         |
| Never stops (rain, a turning wheel, drifting cloud)                              | `linear`                                                      |

Never ease in on something the viewer waits for.

## Moving holds: never a frozen figure

A figure on screen is never fully still, even in a held pose. It carries a small idle layer on every channel, each part on its own period, left and right out of phase:

- **Breath:** the stance's breath (`packages/film/src/style/parts/stance.ts`): standing lifts the trunk, seated swells the garment.
- **Limbs:** a few degrees of sway on two different periods.
- **Joints** (elbows, wrists): a few degrees.
- **Head:** a tilt of ±2° over 4–5 s.
- **Weight:** a small sideways drift over 4–5 s. The hips carry everything above them; the feet stay planted.

Each channel is the key pose, plus the idle waves, plus the follow-through, plus an accent switched on for one cue (a wave of the hand, a nod).

## Poses flow; they do not stop

The engine's `keys` (`core/time.ts`) eases each segment, so its speed falls to zero at every key. That is right for one move (a blink, a lid, a door). For a chain of poses it makes the figure stop dead at each one and read as a robot. For acting, pass through the middle poses with a continuous speed, and hold a pose by repeating its value while the idle layer keeps it alive. The engine has no flowing key helper yet (Gaps, below).

## Follow-through by delay, not springs

A child part reads its parent a moment earlier, 60–150 ms, at 0.3–0.6 of its strength. No overshoot.

- **Counter-motion:** the head rights itself a beat after the body leans: `head(t) = own(t) − 0.45 × lean(t − 0.11)`.
- **Trailing:** the forearm, the hand, hair, a sleeve's end and a hem lag their parent and catch up: `child(t) += 0.45 × (parent(t − 0.09) − parent(t))`.

Times here are in seconds, as a scene's clock reads them.

## Acting

- **Bend the limb.** The elbow is where the acting is. A straight arm only swings like a pendulum. The jointed arm (`JointedArm`) bends; its reach comes from `armReach`.
- **Break the symmetry.** Left and right never mirror: different angles, phases and bends. A symmetric pose reads as a mannequin.
- **The eyes lead.** The eyes move first, then the head, then the body. Blink on a head turn.
- **Blinks.** One every 3–4 s. Close in about 110 ms, hold 30–50 ms, reopen in about 190 ms with an `out` curve: reopening is slower than closing. Now and then a double blink. A tired figure blinks slowly with lids resting a third closed; a focused one rarely.
- **Landing and the hop.** Air time hovers, then falls with gravity, stretching 5–10 %. On contact it squashes 15–20 % and recovers with one small overshoot (`outSoft`). Keep the volume: when the height scales by `sy`, the width scales by `1 / sy^0.6`.
- **In the air, the feet hang.** Anything held up by nothing hangs: the legs limp and close, the toes down, one knee a little folded.
- **The shadow follows the height.** It stays on the floor, with a gap under anything in the air, and shrinks as the body rises. Its colour follows [CRAFT.md](CRAFT.md) rule 12: a hue, never black.
- **Props.** A prop enters already moving, from beyond the frame. A rolling prop turns by its travel over its radius (`angle = Δx / r`) and slows with an ease-out. In a strike, the weight goes onto the support side, the striking limb winds up, and contact falls at the middle of the swing, never at its end. The eyes follow the prop in and out.

**Before calling a figure alive, check:**

- [ ] Nothing is frozen while it is on screen, even in a held pose.
- [ ] No moment has every part stopping at once.
- [ ] The head and the ends of the limbs arrive after the body.
- [ ] Left and right do not mirror.
- [ ] It blinks, and it blinks on its head turns.
- [ ] Anything in the air has hanging feet and a shadow that changes with its height.

## Scenery that lives

Numbers are in artboard units and seconds. They are starting points.

| Subject                    | Recipe                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Plant, tree, grass         | Turn about the base, 1.5–4°, 3–6 s a cycle. Each leaf takes a seeded phase; tips move more than the base                      |
| Cloth, banner, hem         | A wave that travels along the length, growing away from the fixed edge                                                        |
| Fire, lamp, candle         | Lean 2–4° and stretch 3–6 % on two waves of different periods (0.7 s and 1.1 s); the inner flame on a third. No random jitter |
| Smoke, steam, incense      | 2–3 wisps out of phase, each rising while it fades in and out                                                                 |
| Water                      | Rings that grow and fade; a floating thing bobs 1–2 units and rocks 2°                                                        |
| Rain, snow, falling leaves | Each with a seeded phase, ±20 % speed and a sideways drift; linear                                                            |
| Sky                        | Clouds drift over 20–60 s, further layers slower. Rays turn one turn in 30–60 s                                               |
| Light, stars, a glow       | A glow grows 2–5 % over 2–4 s; stars dip at seeded times                                                                      |

## Drawing traps that show in motion

- **A seam where two edges meet.** Two anti-aliased edges on one line leave a hairline: a cut-out (an even-odd hole) that ends on its shape's outline, or a clip edge over another edge. Draw the shape as one outline, and look at the frame at 1:1.
- **Overlapping parts in one path.** Subpaths of one path that overlap can cancel each other where their directions differ, which punches holes. Fill each part on its own, or give each exclusion its own clip.
- **A ring round a closed eye.** Clip the lid to a shape 2 units larger than the eye's white, or its edge shows round the closed eye like glasses.

## From a reference video

When the owner gives a video and says "like this", read it frame by frame, never from one look. Keep the downloaded video in a folder of its own.

1. **Rate and length:** `ffprobe -v error -show_entries stream=width,height,r_frame_rate,duration -of compact ref.mp4`.
2. **Contact sheets at the full frame rate**, cropped to the subject, a second or two a sheet: `ffmpeg -ss START -t DUR -i ref.mp4 -vf "crop=W:H:X:Y,scale=240:-1,tile=10x6" -frames:v 1 sheet.png`. A sheet at 2 frames a second shows only the poses; the timing, the follow-through and the moving holds show only at the full rate.
3. **Measure, do not trust the eye.** Motion of 1–5 % (a breath, a sway, a float) does not show on a sheet, and it is often what makes the reference feel alive. Read the amplitude, as a share of the subject's size, and the period.
4. **Go part by part.** For each part (the feet, the hands, the head, the eyes, the shadow, the props, the background), ask what the reference does with it. A part that does nothing while the rest moves reads as dead.
5. **Compare at the same moments.** Render yours at the same times and stack it under the reference (`vstack`).
6. **Make it ours.** Measure the motion, never copy another studio's drawing.

## Gaps in the engine

- No flowing key helper: `keys` stops at every key (Poses flow, above).
- No follow-through helper: a delayed read of a parent channel is written by hand.
- No blink: the rigs carry no lid track today.
- No tool measures a subject's edges in a video frame by frame (step 3 above).
