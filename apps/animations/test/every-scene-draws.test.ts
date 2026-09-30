// Every scene of every registered film draws: at its first frame, at each cue's
// edges and midpoint, at its 60% point and at its last frame, through the film's own
// compositor (`createFilm(...).render`). A scene that reads a mark, a cue or a
// knob its film no longer has throws at draw time, and until now only a render
// or `film check`'s layout leg (run by hand) drew it: 4f46add3 was a `declared`
// card reading `{declared}` after the revised script removed the mark.
//
// Bun has no canvas, so the frame is drawn into the framework's stand-in
// context (`@bible/film/stand-in`), keeping nothing: every call it does not
// track answers a value that reads as nothing, except where a real canvas
// refuses an argument (a negative arc, ellipse or gradient radius, a colour
// stop off 0..1), where it throws as the real one does. Nothing is
// rasterised, which is the point: this is the draw path's logic, the part a
// script edit can break, run in the gate.
// A throw only between samples (say, a branch at 30% of a cue) still needs a
// render to find.

import { BunServices } from '@effect/platform-bun';
import { type SceneSpec, createFilm } from '@bible/film/canvas';
import { TimingsJson, sceneMoments } from '@bible/film/core';
import { recorder, standInDom } from '@bible/film/stand-in';
import { importFilmModule } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { FILMS } from '../server.ts';
import { films } from '../src/films/index.ts';

/** Every film the player and the renderer know: the registry's keys. */
const FILM_NAMES = Object.keys(films);

/** The stand-in keeps nothing: the test asks only whether each frame draws. */
const BLANK = { record: false } as const;

const ScenesModule = Schema.Struct({ scenes: Schema.Array(Schema.Any) });

/** A film's scenes and committed timings, read as the player reads them. */
const filmOf = Effect.fn('test.filmOf')(function* (film: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const module = yield* Effect.promise(() =>
    importFilmModule(path.join(FILMS, film, 'scenes', 'index.ts')),
  );
  const scenes: ReadonlyArray<SceneSpec> = (yield* Schema.decodeUnknownEffect(ScenesModule)(module))
    .scenes;
  const timings = yield* Schema.decodeEffect(TimingsJson)(
    yield* fs.readFileString(path.join(FILMS, film, 'narration', 'timings.json')),
  );
  return createFilm({
    title: film,
    paper: { base: '#fff', tone: '#000', seed: 1 },
    shade: '#000',
    scenes,
    timings,
    captions: { font: '38px x', color: '#000', plate: '#fff' },
  });
});

/** Why a frame failed to draw, or none. */
const drawAt = (film: ReturnType<typeof createFilm>, T: number) =>
  Effect.sync(() => film.render(recorder(1920, 1080, BLANK).ctx, T, { captions: true })).pipe(
    Effect.as(Option.none<string>()),
    Effect.catchDefect((defect) => Effect.succeedSome(String(defect))),
  );

describe('every scene draws', () => {
  for (const name of FILM_NAMES)
    it.effect.layer(BunServices.layer)(
      `${name}: every scene at its start, each cue's edges and midpoint, its 60% point and its end`,
      () =>
        Effect.gen(function* () {
          yield* standInDom(BLANK);
          const film = yield* filmOf(name);
          const fps = film.fps;
          const edges = film.placed.flatMap((p) => {
            const first = Math.ceil(p.start * fps - 1e-6);
            const last = Math.ceil((p.start + p.dur) * fps - 1e-6) - 1;
            // Mid-span, where a branch on `0 < f.at(cue) < 1` draws and neither edge does.
            const mids = [...p.cues]
              .filter(([, c]) => c.end > c.start)
              .map(([cue, c]) => ({
                scene: p.spec.id,
                at: `cue ${cue} mid`,
                frame: Math.min(
                  last,
                  Math.max(first, Math.round((p.start + (c.start + c.end) / 2) * fps)),
                ),
              }));
            return [
              { scene: p.spec.id, at: 'start', frame: first },
              { scene: p.spec.id, at: 'end', frame: last },
              ...mids,
            ];
          });
          const moments = [...sceneMoments(film.placed, fps, { marks: false }), ...edges];
          const failures: string[] = [];
          for (const m of moments) {
            const failed = yield* drawAt(film, m.frame / fps);
            if (Option.isSome(failed))
              failures.push(`${m.scene} (${m.at}, frame ${m.frame}): ${failed.value}`);
          }
          expect(moments.length).toBeGreaterThan(film.placed.length * 3);
          expect(failures).toEqual([]);
        }).pipe(Effect.scoped),
      30_000,
    );
});
