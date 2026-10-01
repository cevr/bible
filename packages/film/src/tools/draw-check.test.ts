// The draw leg (`film check --draw`): a scene that throws, a frame that reads
// the frame drawn before it, and ink drawn over a face, each found by drawing
// the film in this process into the stand-in context.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';
import { type SceneSpec, createFilm } from '../canvas/film.ts';
import { stroke } from '../canvas/ink.ts';
import { probeFace } from '../canvas/probe.ts';
import { standInDom } from '../canvas/fixtures/stand-in.ts';
import { drawFindings, impureAt, momentCounts } from './draw-check.ts';

/** A film of the given scenes, four seconds each. */
const filmOf = (...scenes: ReadonlyArray<readonly [string, SceneSpec['draw']]>) =>
  createFilm({
    title: 'draw',
    paper: { base: '#ffffff', tone: '#000000', seed: 1 },
    shade: '#000000',
    scenes: scenes.map(([id, draw]) => ({ id, min: 4, draw })),
    captions: { font: '38px x', color: '#000000', plate: '#ffffff' },
  });

/** A face declared at (960, 540), 200 px tall, and a rope drawn across it after. */
const roped: SceneSpec['draw'] = (f) => {
  probeFace(f.ctx, 960, 540, 200);
  stroke(
    f.ctx,
    [
      [700, 520],
      [1220, 560],
    ],
    { color: '#000000', width: 6 },
    f.hand('rope'),
  );
};

describe('the draw leg', () => {
  it.effect('a frame that reads the frame drawn before it is caught', () =>
    Effect.gen(function* () {
      yield* standInDom({ record: false });
      // The last frame drawn kept in a module `let`, as a scene that eases from it would.
      let last = 0;
      const impure = filmOf([
        'one',
        (f) => {
          f.ctx.fillRect(last, 0, 10, 10);
          last = f.t;
        },
      ]);
      expect(Option.isSome(impureAt(impure, 30))).toBe(true);
      // The same square placed by its own time is pure.
      const pure = filmOf(['one', (f) => f.ctx.fillRect(f.t, 0, 10, 10)]);
      expect(impureAt(pure, 30)).toEqual(Option.none());
    }).pipe(Effect.scoped),
  );

  it.effect('finds a scene that throws, a frame that is not pure, and a rope over a face', () =>
    Effect.gen(function* () {
      let last = 0;
      const found = yield* drawFindings(() =>
        filmOf(
          ['still', (f) => f.ctx.fillRect(f.t, 0, 10, 10)],
          [
            'broken',
            // A negative radius, which a real canvas refuses.
            (f) => f.ctx.arc(960, 540, -1, 0, Math.PI),
          ],
          [
            'eased',
            (f) => {
              f.ctx.fillRect(last, 0, 10, 10);
              last = f.t;
            },
          ],
          ['roof', roped],
        ),
      );
      const tagged = (tag: string) => found.filter((f) => f._tag === tag).map((f) => f.scene);
      expect(new Set(tagged('DrawThrew'))).toEqual(new Set(['broken']));
      expect(found.find((f) => f._tag === 'DrawThrew')?.message).toContain('radius');
      expect(new Set(tagged('FrameImpure'))).toEqual(new Set(['eased']));
      expect(tagged('InkOverFace')).toEqual(['roof']);
      expect(found.filter((f) => f.scene === 'still')).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.effect('lists ink over faces in film order, a mid-cue finding in its own place', () =>
    Effect.gen(function* () {
      // `knot` is over before the scene's 60% point: its rope is seen only mid-cue.
      const knotted: SceneSpec = {
        id: 'knotted',
        min: 4,
        timeline: { knot: { at: 'start', offset: 0.2, dur: 0.6 } },
        draw: (f) => {
          const knot = f.at('knot');
          if (knot > 0 && knot < 1) roped(f);
        },
      };
      const found = yield* drawFindings(() =>
        createFilm({
          title: 'draw',
          paper: { base: '#ffffff', tone: '#000000', seed: 1 },
          shade: '#000000',
          scenes: [knotted, { id: 'roof', min: 4, draw: roped }],
          captions: { font: '38px x', color: '#000000', plate: '#ffffff' },
        }),
      );
      const faces = found.filter((f) => f._tag === 'InkOverFace');
      expect(faces.map((f) => f.scene)).toEqual(['knotted', 'roof']);
    }).pipe(Effect.scoped),
  );

  it.effect('draws only the scenes it is given, and each at several moments', () =>
    Effect.gen(function* () {
      const build = () => filmOf(['roof', roped], ['bare', (f) => f.ctx.fillRect(0, 0, 1, 1)]);
      const found = yield* drawFindings(build, new Set(['bare']));
      expect(found).toEqual([]);
      yield* standInDom({ record: false });
      const counts = momentCounts(build());
      expect(counts.moments).toBeGreaterThanOrEqual(2 * 3);
      expect(counts.pure).toBeGreaterThanOrEqual(2);
    }).pipe(Effect.scoped),
  );
});
