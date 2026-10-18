// The committed `figures.riv` is the build of these rigs: the project the
// rigs print is the one its stamp (`figures.stamp.json`) says it was built
// from, and the file is the one that build wrote (`unbuilt`). A rig edited
// without a rebuild (`bun src/films/righteousness-by-faith/rigs/build.ts`)
// fails here, on a host with no Rive CLI too. And the figures the owner
// locked are drawn as he kept them: each one's print alone is the one its
// lock holds (`unlocked`), and a part of him moved breaks his lock, so the
// print the film holds is his parts as drawn. Every override on them is in
// his words: its quote is a decision's or a note's on RBF's ledger
// (`unsaid`), so one in words he never said is broken. What a lock answers a
// print and its way out are the house's
// (`packages/film/src/style/lock.test.ts`), and so is how an override is
// held to his words (`packages/film/src/style/override.test.ts`).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { Ear, overridesIn } from '@bible/film/style';
import { unbuilt, unlocked, unsaid } from '@bible/film/style/build';
import { LEDGER } from './build.ts';
import { ARTBOARDS, aloneRml, figureOverrides, figuresRml, lockedPrints } from './figures.ts';
import { judge } from './judge-rig.ts';
import { PAPERS } from './papers.ts';
import { prosecutor } from './prosecutor-rig.ts';
import PROSECUTOR_LOCK from './prosecutor.lock.json' with { type: 'json' };

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

  it.effect.layer(BunServices.layer)(
    'the lead, the judge and the prosecutor are drawn as the owner locked them',
    () =>
      Effect.gen(function* () {
        const locked = lockedPrints();
        expect(locked.map((l) => l.item)).toEqual(['lead', 'judge', 'prosecutor']);
        expect(yield* unlocked(locked)).toEqual({ broken: [], overridden: [] });
        // One artboard (SkinHand) draws both their hands, so they are of one paper.
        expect(prosecutor.hands.paper).toEqual(judge.hands.paper);
      }),
  );

  it.effect.layer(BunServices.layer)('a part of a locked figure moved breaks his lock', () =>
    Effect.gen(function* () {
      // The prosecutor with his ear a unit further back.
      const moved = aloneRml(
        'prosecutor',
        { ...prosecutor, ear: Ear({ at: [54, 17.5], r: [10, 16.5], paper: PAPERS.ear }) },
        'skinHand',
      );
      const changed = yield* unlocked([
        { item: 'prosecutor', lock: PROSECUTOR_LOCK, print: moved },
      ]);
      expect(changed.broken.map((b) => b.item)).toEqual(['prosecutor']);
      expect(changed.overridden).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)("every override on them is in the owner's words", () =>
    Effect.gen(function* () {
      expect(yield* unsaid(LEDGER, figureOverrides())).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)(
    "an override in words the owner never said is broken, and one in his words on RBF's ledger is not",
    () =>
      Effect.gen(function* () {
        // The prosecutor's lock with an override that frees a changed print of him.
        const freed = (quote: string) =>
          overridesIn({
            ...prosecutor,
            lock: {
              ...PROSECUTOR_LOCK,
              override: {
                rule: 'FigureLock',
                place: 'prosecutor',
                reason: 'his ear a unit back',
                quote,
                frees: 'b'.repeat(64),
              },
            },
          }).map((override) => ({ item: 'prosecutor', override }));
        const fabricated = yield* unsaid(LEDGER, freed('move his ear back, as the owner asked'));
        expect(fabricated.map((u) => u.item)).toEqual(['prosecutor']);
        // A decision of the owner's on RBF's ledger (2026-10-15), in his words.
        expect(yield* unsaid(LEDGER, freed('lets lock in that style'))).toEqual([]);
      }),
  );
});
