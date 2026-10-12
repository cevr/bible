// A Rive rig drawn in the page is a function of its frame's time alone: the
// fixture rig (`src/canvas/fixtures/arm.ts`), loaded as a page loads a film's
// rigs and drawn by the `webgl2` engine (the Rive Renderer on WebGL 2,
// composited in) through a fixture film, gives the same bytes at each of five
// times after two different histories in one page and on a fresh page. And
// what is compared is the rig: its box differs from the frame drawn without
// it. Drawn in the browser tests' Chrome (SwiftShader's WebGL 2,
// `lab/fixtures/browsers.ts`); every frame compared is drawn on this machine.

import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { asset, openTab, respond, scriptOf, servePaths } from '../../src/lab/fixtures/browsers.ts';
import type { RiveFrame } from '../../src/canvas/fixtures/rive-pixels.ts';

/** The five times compared: the reach off, on, mid-swing and left at rest. */
const TARGETS = [0.1, 0.6, 1.1, 1.6, 1.95];

/** Two histories drawn before each target: far ahead and behind, and from the scene's end. */
const HISTORY_A = [3.9, 0.3, 2.2];
const HISTORY_B = [1.0, 3.1];

/** The fixture page's script and the files it loads (the runtimes' wasm, the rig), bundled once for the file. */
const fixture = Effect.cached(
  Effect.promise(() =>
    Bun.build({
      entrypoints: [`${import.meta.dir}/../../src/canvas/fixtures/rive-pixels.ts`],
      target: 'browser',
      format: 'iife',
      publicPath: '/',
    }),
  ).pipe(
    Effect.flatMap((built) =>
      Effect.forEach(built.outputs, (out) =>
        Effect.promise(() => out.arrayBuffer()).pipe(
          Effect.map((buffer) => ({
            kind: out.kind,
            path: out.path.split('/').pop() ?? '',
            bytes: new Uint8Array(buffer),
          })),
        ),
      ),
    ),
  ),
).pipe(Effect.runSync);

/** Times as JSON, to hand to the page. */
const json = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.Finite)));

/** Each target's frame after `histories` (one after another, in one page), on a page of its own. */
const framesOn = (histories: ReadonlyArray<ReadonlyArray<number>>) =>
  Effect.gen(function* () {
    const files = yield* fixture;
    const entry = files.find((f) => f.kind === 'entry-point');
    expect(entry).toBeDefined();
    const script = asset('rive.js', respond(entry?.bytes ?? new Uint8Array(), 'text/javascript'));
    // The wasm and the rig, from the tab's own origin at the paths the bundle names.
    const served = Object.fromEntries(
      files
        .filter((f) => f.kind === 'asset')
        .map((f) => [
          `/${f.path}`,
          respond(
            f.bytes,
            f.path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
          ),
        ]),
    );
    const page = yield* openTab({
      width: 800,
      height: 600,
      microphone: false,
      init: [],
      assets: [script],
      serve: servePaths({
        ...served,
        '/': respond(`<!doctype html><html><body>${scriptOf(script)}</body></html>`, 'text/html'),
      }),
    });
    yield* page.goto('/');
    const drawn: Array<ReadonlyArray<RiveFrame>> = [];
    for (const history of histories)
      drawn.push(
        yield* page.evaluate<ReadonlyArray<RiveFrame>>(
          `riveFrames(${json(history)}, ${json(TARGETS)})`,
        ),
      );
    return drawn;
  });

describe('a Rive rig in the page', () => {
  it.scopedLive(
    'draws the same bytes at each time after either history and on a fresh page',
    () =>
      Effect.gen(function* () {
        const [afterA = [], afterB = []] = yield* framesOn([HISTORY_A, HISTORY_B]);
        const [fresh = []] = yield* framesOn([[]]);
        expect(fresh.map((f) => f.at)).toEqual(TARGETS);
        expect(afterA.map((f) => f.hash)).toEqual(fresh.map((f) => f.hash));
        expect(afterB.map((f) => f.hash)).toEqual(fresh.map((f) => f.hash));
        // Five pictures, not one, and each is the rig: its box is not the bare frame's.
        expect(new Set(fresh.map((f) => f.hash)).size).toBe(TARGETS.length);
        for (const f of fresh) expect(f.rigPixels).toBeGreaterThan(1000);
      }),
    60_000,
  );
});
