// The committed `figures.riv` is the build of these rigs: the project the
// rigs print is the one its stamp (`figures.stamp.json`) says it was built
// from, and the file is the one that build wrote (`unbuilt`). A rig edited
// without a rebuild (`bun src/films/righteousness-by-faith/rigs/build.ts`)
// fails here, on a host with no Rive CLI too.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { unbuilt } from '@bible/film/style/build';
import { ARTBOARDS, figuresRml } from './figures.ts';

const here = import.meta.dir;

describe("RBF's figures", () => {
  it.effect.layer(BunServices.layer)('are the build of their rigs', () =>
    Effect.gen(function* () {
      const stale = yield* unbuilt({
        riv: `${here}/figures.riv`,
        stamp: `${here}/figures.stamp.json`,
        rml: figuresRml(),
        main: ARTBOARDS.lead,
      });
      expect(stale).toEqual([]);
    }),
  );
});
