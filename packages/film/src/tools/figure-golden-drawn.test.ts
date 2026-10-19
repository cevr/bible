// The figure measure against its pins on the drawn figures
// (`figure-golden-fixture.ts`): each measured whole, every number as `golden.json`
// holds it, and the lean read (`readFigure`) the same numbers less the light
// rims, the shading and the render artifacts. The pins were written by the
// measure they hold, so the pin check is green on the commit before it by
// design: it guards the measure's speed work, which must move no number. The
// real crops and the drawn figures are two files, so they run side by side.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { goldenFaults } from './figure-golden-fixture.ts';

describe("the figure measure's pins on the drawn figures", () => {
  it.effect(
    'hold every case, measured as pinned, and read lean the same less its rims, shading and artifacts',
    () =>
      Effect.gen(function* () {
        expect(yield* goldenFaults('drawn')).toEqual([]);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
