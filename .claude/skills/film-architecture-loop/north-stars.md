# North stars

Every candidate names the north star it serves, and every rejection names the north star it would break. When two pull against each other, the ledger row says so and the decision cites a principle from `~/Developer/personal/dotfiles/principles/`. A sweep does not decide it.

| North star                 | It holds when                                                                                                                                                                                     | A candidate breaks it when                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pure frames**            | Any frame renders alone from the film and a time: no state carried between frames, randomness seeded by key. So preview scrubs anywhere and export splits across pages.                           | It keeps mutable scene state, replays a timeline from zero to reach a frame, reads `Math.random` or the wall clock, or makes frame N depend on N-1. |
| **Narration is the clock** | Time comes from recorded words. A scene is sized by its take; a motion is pinned to a mark. Re-recording a line moves everything tied to it.                                                      | It pins a motion or a sound to a literal second, or sizes a scene by hand where the take could size it.                                             |
| **Declared once**          | A moment (a stamp lands, a cord drops) is named in one place, and the picture, the sound, the captions and the checks all read that name.                                                         | The same time is written in two places, such as a scene's `progress(…, mark + 0.9)` and `sound.ts` repeating `mark + 1.2`.                          |
| **Effect-native tooling**  | Work outside the draw loop is an `Effect` or `Stream`. Resources (browser pages, open files, API calls) live in a `Scope`. Failures are typed. Every file and API boundary decodes with `Schema`. | It adds a bare Promise chain, an untyped `throw`, a manual cleanup, or a hand-written JSON cast at a boundary where Effect has the tool.            |
| **Cheap iteration**        | Every generated asset is content-addressed by its request. A rerun does only stale work, a remix never calls a paid API, and the review loop (a stills or contact sheet) takes seconds.           | A change forces a full re-render, re-recording or regeneration it does not need, or the review loop gets slower.                                    |
| **Checked, not eyeballed** | A defect class a review finds once becomes a check: collisions, stale assets, unknown marks, missing sources.                                                                                     | A fix lands for one instance of a class the engine could detect.                                                                                    |
| **Explicit over implicit** | What matters is visible where it is written: the clock a scene reads, a seed key, a transition, a gain, an asset's hash.                                                                          | It adds a hidden default, a magic name, or behavior that depends on call order or ambient globals.                                                  |

## The draw-loop boundary

The per-frame draw path (`draw(frame)`, ink, cutout, type) runs thousands of times per render and stays synchronous, allocation-light plain code. **Effect-native tooling** governs everything around it: loading, narration, sound, checks, render orchestration. A candidate that puts an Effect runtime inside the draw path is rejected on **Cheap iteration**.

## How to use them in a sweep

- A deletion that keeps every north star is the best candidate. Name the north star that makes the deleted code unnecessary.
- **Explicit** beats **declarative brevity**: shorter code that hides a clock, a seed or a time is rejected.
- **Pure frames** beats **authoring ergonomics**: a timeline model that needs replay to seek is rejected unless it compiles to random-access time.
- Adopt a pattern from prior art only when it keeps every north star. Record which north star each rejected pattern fails.
