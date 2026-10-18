// The committed `figures.riv` is the build of these rigs: the project the
// house prints from RBF's figures file (`FIGURES`) is the one its stamp
// (`figures.stamp.json`) says it was built from, and the file is the one that
// build wrote (`unbuilt`). A rig edited
// without a rebuild (`bun src/films/righteousness-by-faith/rigs/build.ts`)
// fails here, on a host with no Rive CLI too. And the figures the owner
// locked are drawn as he kept them: each one's print alone is the one its
// lock holds (`unlocked`), and a part of him moved breaks his lock, so the
// print the film holds is his parts as drawn. Every override on them cites
// his word: its quote is a decision's or a note's on RBF's ledger, or its
// answer a pick the ledger filed with the decision that answered that ask
// (`unsaid`), so one in words he never said, or citing an ask he never
// answered that way, is broken. What a lock answers a print and its way out
// are the house's (`packages/film/src/style/lock.test.ts`), and so are how an
// override is held to his word (`packages/film/src/style/override.test.ts`)
// and how a figures file is laid and printed
// (`packages/film/src/style/figures-file.test.ts`).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import {
  Ear,
  figure,
  figureOverrides,
  figuresFile,
  figuresRml,
  lockedPrints,
} from '@bible/film/style';
import { unbuilt, unlocked, unsaid } from '@bible/film/style/build';
import { LEDGER } from './build.ts';
import { christ, christFront } from './christ-rig.ts';
import { ARTBOARDS, FIGURES } from './figures.ts';
import { judge } from './judge-rig.ts';
import { PAPERS } from './papers.ts';
import { PROSECUTOR_SPEC, prosecutor } from './prosecutor-rig.ts';
import PROSECUTOR_LOCK from './prosecutor.lock.json' with { type: 'json' };

const here = import.meta.dir;

describe("RBF's figures", () => {
  it.effect.layer(BunServices.layer)('are the build of their rigs', () =>
    Effect.gen(function* () {
      const stale = yield* unbuilt({
        riv: `${here}/figures.riv`,
        stamp: `${here}/figures.stamp.json`,
        rml: figuresRml(FIGURES),
        main: ARTBOARDS.lead,
      });
      expect(stale).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)(
    'the lead, the judge and the prosecutor are drawn as the owner locked them',
    () =>
      Effect.gen(function* () {
        const locked = lockedPrints(FIGURES);
        expect(locked.map((l) => l.item)).toEqual(['lead', 'judge', 'prosecutor']);
        expect(yield* unlocked(locked)).toEqual({ broken: [], overridden: [] });
        // One artboard (SkinHand) draws both their hands, so they are of one paper.
        expect(prosecutor.hands.paper).toEqual(judge.hands.paper);
      }),
  );

  it.effect.layer(BunServices.layer)('a part of a locked figure moved breaks his lock', () =>
    Effect.gen(function* () {
      // RBF's figures with the prosecutor's ear a unit further back.
      const moved = laid(
        figure({
          ...PROSECUTOR_SPEC,
          ear: Ear.Round({ at: [54, 17.5], r: [10, 16.5], paper: PAPERS.ear }),
        }),
      );
      const changed = yield* unlocked(lockedPrints(moved));
      expect(changed.broken.map((b) => b.item)).toEqual(['prosecutor']);
      expect(changed.overridden).toEqual([]);
    }),
  );

  it.effect(
    "Christ's two views are one figure: His head traced in each, one frame, feet and hands, and one robe turned with Him",
    () =>
      Effect.sync(() => {
        const views = [christ, christFront].map((f) => f.head._tag === 'TracedHead' && f.head.view);
        expect(views).toEqual(['threeQuarter', 'front']);
        for (const part of ['art', 'stature', 'stance', 'feet', 'hands'] as const)
          expect(christFront[part]).toEqual(christ[part]);
        // Turned to us His robe is cut to court.you's shoulders, of the same paper and breathing from the same hem.
        const robe = (f: typeof christ) => [f.body._tag, f.body.paper, f.body.hem];
        expect(robe(christFront)).toEqual(robe(christ));
      }),
  );

  it.effect.layer(BunServices.layer)("every override on them cites the owner's word", () =>
    Effect.gen(function* () {
      expect(yield* unsaid(LEDGER, figureOverrides(FIGURES))).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)(
    "an override in words the owner never said is broken, and one in his words on RBF's ledger is not",
    () =>
      Effect.gen(function* () {
        const fabricated = yield* unsaid(
          LEDGER,
          freed({ quote: 'move his ear back, as the owner asked' }),
        );
        expect(fabricated.map((u) => u.item)).toEqual(['prosecutor']);
        // A decision of the owner's on RBF's ledger (2026-10-15), in his words.
        expect(yield* unsaid(LEDGER, freed({ quote: 'lets lock in that style' }))).toEqual([]);
      }),
  );

  it.effect.layer(BunServices.layer)(
    "an override citing an ask no decision on RBF's ledger answered, or a value the owner did not pick there, is broken",
    () =>
      Effect.gen(function* () {
        const ask = (id: string, value: string) =>
          unsaid(LEDGER, freed({ answer: { ask: id, question: 'keep', value } }));
        // No decision on RBF's ledger answers this ask.
        expect((yield* ask('a0000000000', 'lock')).map((u) => u.item)).toEqual(['prosecutor']);
        // The ask he kept and locked the court figures in (2026-10-17): a decision answers it, and files no pick of `revise`.
        expect((yield* ask(PROSECUTOR_LOCK.ask, 'revise')).map((u) => u.item)).toEqual([
          'prosecutor',
        ]);
      }),
  );
});

/** RBF's figures file with `him` laid in the prosecutor's place: a figure `figure` composed of his parts with one changed (`PROSECUTOR_SPEC`), since the file lays no copy of a composed one. */
const laid = (him: typeof prosecutor) =>
  figuresFile({
    weight: FIGURES.weight,
    boards: { ...FIGURES.boards, prosecutor: { ...FIGURES.boards.prosecutor, figure: him } },
  });

/** The overrides of RBF's figures with the prosecutor's lock carrying one citing `cited` that frees a changed print of him. */
const freed = (
  cited:
    | { readonly quote: string }
    | {
        readonly answer: {
          readonly ask: string;
          readonly question: string;
          readonly value: string;
        };
      },
) =>
  figureOverrides(
    laid(
      figure({
        ...PROSECUTOR_SPEC,
        lock: {
          ...PROSECUTOR_LOCK,
          override: {
            rule: 'FigureLock',
            place: 'prosecutor',
            reason: 'his ear a unit back',
            ...cited,
            frees: 'b'.repeat(64),
          },
        },
      }),
    ),
  );
