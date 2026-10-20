// The committed `figures.riv` is the build of these rigs: the project the
// house prints from RBF's figures file (`FIGURES`) is the one its stamp
// (`figures.stamp.json`) says it was built from, and the file is the one
// that build wrote (`unbuilt`). A rig edited without a rebuild
// (`bun src/films/righteousness-by-faith/rigs/build.ts`) fails here, on a
// host with no Rive CLI too. And the figures the owner locked are drawn as
// he kept them: each one's print alone is the one its lock holds, and each
// lock names his decision on RBF's ledger (`unlocked`); a part of him moved
// breaks his lock, so the print the film holds is his parts as drawn. Every
// override on them cites his word on that figure: a decision on the ledger
// filed at the point `item:<item>`, after the lock it frees, in its quote's
// words or with the pick its answer cites (`unsaid`). So one in words he
// never said, in his words on another matter, or citing an ask he never
// answered that way, is broken and frees nothing. What a lock answers a
// print and its way out are the house's
// (`packages/film/src/style/lock.test.ts`), and so are how an override is
// held to his word, the case it is backed in among them
// (`packages/film/src/style/override.test.ts`), and how a figures file is
// laid and printed (`packages/film/src/style/figures-file.test.ts`).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, Option } from 'effect';
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

  it.effect(
    "bake their ink, and bound would bind every ink stroke but each face's brows and mouth to `ink`",
    () =>
      Effect.sync(() => {
        const blocks = (rml: string) =>
          Array.from(
            rml.matchAll(/<Stroke [^>]*name="Ink">([\s\S]*?)<\/Stroke>/g),
            (m) => m[1] ?? '',
          );
        const binds = (rml: string) => blocks(rml).filter((b) => b.includes('propertyKey="47"'));
        expect(FIGURES.baked).toBe(true);
        // Its rigs follow no shot: they have no number `ink` to follow it by.
        expect(FIGURES.shot).toEqual({});
        expect(binds(figuresRml(FIGURES))).toEqual([]);
        const bound = figuresRml({ ...FIGURES, baked: false });
        const faces = Object.values(FIGURES.boards).filter((b) => 'figure' in b).length;
        expect(blocks(bound).length - binds(bound).length).toBe(3 * faces);
        expect(binds(bound).length).toBeGreaterThan(3 * faces);
      }),
  );

  it.effect.layer(BunServices.layer)(
    'the lead, the judge and the prosecutor are drawn as the owner locked them',
    () =>
      Effect.gen(function* () {
        const locked = lockedPrints(FIGURES);
        expect(locked.map((l) => l.item)).toEqual(['lead', 'judge', 'prosecutor']);
        expect(yield* unlocked(LEDGER, locked)).toEqual({ broken: [], overridden: [] });
        // One artboard (SkinHand) draws both their hands, so they are of one paper.
        expect(prosecutor.hands.paper).toEqual(judge.hands.paper);
      }),
  );

  it.effect.layer(BunServices.layer)(
    "a part of a locked figure moved breaks his lock, and an override freeing that very print in the owner's words on another matter frees nothing",
    () =>
      Effect.gen(function* () {
        const changed = yield* unlocked(LEDGER, lockedPrints(laid(figure(MOVED))));
        expect(changed.broken.map((b) => b.item)).toEqual(['prosecutor']);
        expect(changed.overridden).toEqual([]);
        // His moved print, as the broken lock names it for an override to free.
        const frees = Option.getOrThrow(Arr.head(changed.broken)).hash;
        // A decision of the owner's on RBF's ledger after the lock (2026-10-17), on Christ, at no figure's point.
        const quote = 'ensure Christ has a consistent body, frame, face';
        const quoted = laid(
          figure({
            ...MOVED,
            lock: { ...PROSECUTOR_LOCK, override: { ...OVERRIDE, quote, frees } },
          }),
        );
        const still = yield* unlocked(LEDGER, lockedPrints(quoted));
        expect(still.broken.map((b) => [b.item, b.hash])).toEqual([['prosecutor', frees]]);
        expect(still.broken.map((b) => b.why)).toEqual([
          `prosecutor's lock is broken (FigureLock, a locked figure is drawn as the owner kept it, its print the one its lock holds): prosecutor's override of FigureLock at prosecutor is broken: no decision on his production's ledger at the point item:prosecutor, filed after his lock (2026-10-17T23:57:24.576Z) says "${quote}": file his words as a decision there (\`film production decide\` with \`--quote\`, \`--set\` and \`--point item:prosecutor\`), then quote them verbatim`,
        ]);
        expect(still.overridden).toEqual([]);
      }),
  );

  it.effect(
    "Christ's two views are one figure: His head traced in each, one frame, feet and hands, one robe turned with Him, and one set of knobs",
    () =>
      Effect.sync(() => {
        const views = [christ, christFront].map((f) => f.head._tag === 'TracedHead' && f.head.view);
        expect(views).toEqual(['threeQuarter', 'front']);
        for (const part of ['art', 'stature', 'stance', 'feet', 'hands'] as const)
          expect(christFront[part]).toEqual(christ[part]);
        // The host poses Him in both by one set of numbers (`court-cast.ts`): the same knobs, in one order.
        expect(Object.keys(christFront.knobs)).toEqual(Object.keys(christ.knobs));
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
    "an override in words the owner never said is broken, and so is one in his words on RBF's ledger that are no decision of his on that figure after its lock",
    () =>
      Effect.gen(function* () {
        const quotes = [
          'move his ear back, as the owner asked',
          // A decision of his (2026-10-15), before the lock and at no figure's point.
          'lets lock in that style',
          // A decision of his after the lock (2026-10-17), on Christ, at no figure's point.
          'ensure Christ has a consistent body, frame, face',
          // A note of his (2026-10-16): a note decides nothing.
          'the ears have an inner border that act as a lighting that the concept doesnt have',
        ];
        for (const quote of quotes)
          expect((yield* unsaid(LEDGER, freed({ quote }))).map((u) => u.item)).toEqual([
            'prosecutor',
          ]);
      }),
  );

  it.effect.layer(BunServices.layer)(
    "an override citing an ask no decision on RBF's ledger answered, or the ask the lock was kept in, is broken",
    () =>
      Effect.gen(function* () {
        const ask = (id: string, value: string) =>
          unsaid(LEDGER, freed({ answer: { ask: id, question: 'keep', value } }));
        // No decision on RBF's ledger answers this ask.
        expect((yield* ask('a0000000000', 'lock')).map((u) => u.item)).toEqual(['prosecutor']);
        // The ask he kept and locked the court figures in (2026-10-17): its decision is the lock's own, at no figure's point and no later than it, so the pick it files (keep=lock) backs nothing.
        for (const value of ['lock', 'revise'])
          expect((yield* ask(PROSECUTOR_LOCK.ask, value)).map((u) => u.item)).toEqual([
            'prosecutor',
          ]);
      }),
  );
});

/** RBF's figures file with `him` laid in the prosecutor's place: a figure `figure` composed of his parts with one changed (`PROSECUTOR_SPEC`), since the file lays no copy of a composed one. */
const laid = (him: typeof prosecutor) =>
  figuresFile({
    weight: FIGURES.weight,
    baked: FIGURES.baked,
    boards: { ...FIGURES.boards, prosecutor: { ...FIGURES.boards.prosecutor, figure: him } },
  });

/** The prosecutor's parts with his ear a unit further back. */
const MOVED = {
  ...PROSECUTOR_SPEC,
  ear: Ear.Round({ at: [54, 17.5], r: [10, 16.5], paper: PAPERS.ear }),
};

/** What an override of the prosecutor's lock carries, whatever it cites and frees. */
const OVERRIDE = {
  rule: 'FigureLock',
  place: 'prosecutor',
  reason: 'his ear a unit back',
} as const;

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
        lock: { ...PROSECUTOR_LOCK, override: { ...OVERRIDE, ...cited, frees: 'b'.repeat(64) } },
      }),
    ),
  );
