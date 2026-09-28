// Looker with fakes: every scene is drawn small at 2 fps on the page pool and
// measured; `--scene` draws only those scenes; every page, the browser and the
// server close. No Chromium.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option } from 'effect';
import { LOOK_STEP } from './look.ts';
import { Looker } from './looker.ts';
import {
  emptyLedger,
  fakeRenderHost,
  holdScenes,
  holdTimings,
  testExportInfo,
  testFilm,
} from './testing.ts';

const film = testFilm(holdScenes, holdTimings);
// Each 2 fps sample flips between two greys.
const heldFrame = (i: number) => Math.round(i / (LOOK_STEP * testExportInfo.fps)) % 2;

const setup = () => {
  const ledger = emptyLedger();
  const layer = Looker.layer.pipe(
    Layer.provide(
      fakeRenderHost(ledger, {
        looked: (i) => ({
          grey: 100 + 100 * heldFrame(i),
          faces: [{ scene: 'held', x: 0, y: 0, size: 500, alpha: 1 }],
        }),
      }),
    ),
  );
  const look = (only: Option.Option<ReadonlySet<string>>) =>
    Effect.gen(function* () {
      return yield* (yield* Looker).look(film, 2, only);
    }).pipe(Effect.provide(layer));
  return { ledger, look };
};

describe('Looker', () => {
  it.live('measures every scene of the film and closes what it opened', () =>
    Effect.gen(function* () {
      const { ledger, look } = setup();
      const looked = yield* look(Option.none());
      expect(looked.height).toBe(testExportInfo.height);
      expect(looked.looks.map((l) => l.scene)).toEqual(['held', 'brief', 'ambient']);
      // Every sample alternates grey, so no second holds; a face counts only in its own scene.
      for (const l of looked.looks) expect([l.seconds > 0, l.held]).toEqual([true, 0]);
      expect(looked.looks.map((l) => l.face)).toEqual([500, 0, 0]);
      expect(ledger.server).toEqual({ started: 1, stopped: 1 });
      expect(ledger.browser).toEqual({ launched: 1, closed: 1 });
      expect(ledger.pages.closed).toBe(ledger.pages.opened);
    }),
  );

  it.live('with scenes given, draws and reports only those', () =>
    Effect.gen(function* () {
      const { look } = setup();
      const looked = yield* look(Option.some(new Set(['brief'])));
      expect(looked.looks.map((l) => l.scene)).toEqual(['brief']);
    }),
  );
});
