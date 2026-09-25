# @bible/film

The engine behind the cut-paper explainer films in `apps/animations`: a film
is an ordered list of narrated scenes, laid end to end on a clock set by the
recorded words, and every frame is a pure function of that film and a time.

## Entry points

| Import               | What it holds                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`   | The clock: easing and `progress` (`time`), seeded noise (`random`), `{mark}` narration timing, named cues (`timeline`), the sound plan, scene `layout`. |
| `@bible/film/canvas` | The Canvas 2D draw kit (ink, cutout, paper, type, figure, camera, storyboard) and `createFilm`, which composites any `T`.                               |
| `@bible/film/player` | `mountPlayer(films)`: the scrubbable preview and the `?export` handle (`ExportHandle`) a renderer drives. `player.css` styles it.                       |

## Named cues

A moment is declared once. A drawing names the moments something else reads
(a sound, another cue) in its `timeline`, each anchored to a narration
`{mark}`, another cue (`after` its end, `with` its start) or a scene landmark,
never to an absolute second:

```ts
export const justified = drawing({
  timeline: { slam: { mark: 'fiction', offset: 0.9, dur: 0.35 } },
  draw: (f) => {
    const slam = f.at('slam', ease.inQuad); // progress(t, cue.start, cue.dur, ease)
  },
});
// sound.ts: the thud lands where the stamp lands.
{ scene: 'justified', cue: 'slam', edge: 'end' }
```

`layout()` resolves every timeline once (`Placed.cues`, scene-local
`{ start, end, dur }`); an unknown mark or cue, or a cycle, is an error naming
the scene and the cue. `f.cue(name)` reads a resolved cue and `f.at(name,
ease)` its eased progress; with `drawing(...)`, a name the timeline lacks is a
compile error. The sound plan's `cueTime` reads the same map, so picture and
sound cannot drift apart. Ornament (wobble, idle motion) stays inline.

## The purity rule

`src/core` never touches the DOM at runtime (type-only DOM references are
fine) and never imports from `canvas` or `player`. Bun scripts, tests and the
browser all read it. `canvas` may import `core`; `player` may import both.

Frames stay pure: no `Math.random`, no wall clock, no state carried between
frames. Seed randomness by key (`f.hand(key)`, `random.ts`).

```sh
bun run gate   # typecheck + tests
```
