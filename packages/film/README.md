# @bible/film

The engine behind the cut-paper explainer films in `apps/animations`: a film
is an ordered list of narrated scenes, laid end to end on a clock set by the
recorded words, and every frame is a pure function of that film and a time.

## Entry points

| Import               | What it holds                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`   | The clock: easing and `progress` (`time`), seeded noise (`random`), `{mark}` narration timing, the sound plan, scene `layout`.    |
| `@bible/film/canvas` | The Canvas 2D draw kit (ink, cutout, paper, type, figure, camera, storyboard) and `createFilm`, which composites any `T`.         |
| `@bible/film/player` | `mountPlayer(films)`: the scrubbable preview and the `?export` handle (`ExportHandle`) a renderer drives. `player.css` styles it. |

## The purity rule

`src/core` never touches the DOM at runtime (type-only DOM references are
fine) and never imports from `canvas` or `player`. Bun scripts, tests and the
browser all read it. `canvas` may import `core`; `player` may import both.

Frames stay pure: no `Math.random`, no wall clock, no state carried between
frames. Seed randomness by key (`f.hand(key)`, `random.ts`).

```sh
bun run gate   # typecheck + tests
```
