// A cutout face's pre-blended pastel must land the pixels the two-pass look
// lands (flat colour, then the pastel soft-lit over it), to within 8-bit
// rounding, under every canvas transform a camera or `at` puts it through.
// Magnifying a pre-blended tile resamples the blend, where the look blends
// the resampled pastel; soft-light is not linear, so a face pushed in to
// 1.4x or squashed drifts up to 11/255 from the look. Those faces must keep
// the two-pass draw. Drawn in headless Chrome with the renderer's software
// 2D canvas, as the export draws them.

import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { openTab, respond, servePaths } from '../lab/fixtures/browsers.ts';
import type { FaceCase, FaceDelta } from './fixtures/face-pixels.ts';

/** The most a pre-blended face may drift from the look, per channel /255: 8-bit rounding. */
const ROUNDING = 4;
/** The most it may drift on average over the canvas, per channel /255. */
const MEAN = 0.3;

const at = (sx: number, sy: number, rot = 0, x = 400, y = 300): FaceCase['m'] => [
  Math.cos(rot) * sx,
  Math.sin(rot) * sx,
  -Math.sin(rot) * sy,
  Math.cos(rot) * sy,
  x,
  y,
];

/** Transforms the pre-blended fill must take (and match the look under). */
const flat: ReadonlyArray<readonly [string, FaceCase['m']]> = [
  ['identity', at(1, 1)],
  ['a fractional offset', at(1, 1, 0, 400.37, 300.61)],
  ['a quarter-turn tilt', at(1, 1, 0.7)],
  ['a camera pulled back to 0.5', at(0.5, 0.5)],
  ['a camera pulled back to 0.3', at(0.3, 0.3)],
];

/** Transforms that magnify the face: pushed-in cameras and squash landings. */
const magnified: ReadonlyArray<readonly [string, FaceCase['m']]> = [
  ['a camera pushed in to 1.1', at(1.1, 1.1)],
  ['a camera pushed in to 1.4', at(1.4, 1.4)],
  ['a camera pushed in to 2', at(2, 2)],
  ['a camera pushed in to 3', at(3, 3)],
  ['a squash to sy 1.4', at(1, 1.4)],
  ['a squash to sx 3, sy 0.5', at(3, 0.5)],
  ['a tilted push to 2.3', at(2.3, 2.3, 0.7)],
];

const colors = ['#c0392b', '#2c3e50', '#f4d03f', '#7fb3d5', '#101010'];

const cases = (group: typeof flat) =>
  group.flatMap(([name, m]) => colors.map((color): FaceCase => ({ name, m, color })));

/** The fixture page's script, bundled for the browser once for the file. */
const fixture = Effect.cached(
  Effect.promise(() =>
    Bun.build({
      entrypoints: [`${import.meta.dir}/fixtures/face-pixels.ts`],
      target: 'browser',
      format: 'iife',
    }),
  ).pipe(
    Effect.flatMap((built) => {
      const out = built.outputs[0];
      return out === undefined ? Effect.succeed('') : Effect.promise(() => out.text());
    }),
  ),
).pipe(Effect.runSync);

/**
 * Each case drawn both ways in one page: a tab of the browser tests' Chrome,
 * which draws with the renderer's software 2D canvas (`tools/browser.ts`).
 */
const deltas = (faces: ReadonlyArray<FaceCase>) =>
  Effect.gen(function* () {
    const script = yield* fixture;
    const page = yield* openTab({
      width: 800,
      height: 600,
      microphone: false,
      init: [],
      serve: servePaths({
        '/': respond(
          '<!doctype html><html><body><script src="/faces.js"></script></body></html>',
          'text/html',
        ),
        '/faces.js': respond(script, 'text/javascript'),
      }),
    });
    yield* page.goto('/');
    return yield* page.evaluate<ReadonlyArray<FaceDelta>>(`faceDeltas(${json(faces)})`);
  });

/** The cases as JSON, to hand to the page. */
const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** The cases that drift past rounding, named, so a failure says which. */
const drifting = (ds: ReadonlyArray<FaceDelta>) =>
  ds
    .filter((d) => d.max > ROUNDING || d.mean > MEAN)
    .map((d) => `${d.name} ${d.color} max=${d.max}`);

describe('a pre-blended cutout face', () => {
  it.scopedLive(
    'pre-blends every face the transform does not magnify, and matches the look',
    () =>
      Effect.gen(function* () {
        const ds = yield* deltas(cases(flat));
        expect(ds.filter((d) => !d.blended).map((d) => d.name)).toEqual([]);
        expect(drifting(ds)).toEqual([]);
      }),
    60_000,
  );

  it.scopedLive(
    'matches the look under a pushed-in camera or a squash',
    () =>
      Effect.gen(function* () {
        expect(drifting(yield* deltas(cases(magnified)))).toEqual([]);
      }),
    60_000,
  );
});
