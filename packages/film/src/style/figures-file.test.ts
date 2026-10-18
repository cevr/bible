import { describe, expect, test } from 'bun:test';
import { figure } from './figure.ts';
import { figureOverrides, figuresFile, figuresRml, lockedPrints } from './figures-file.ts';
import { paper } from './paper.ts';
import { Tunic } from './parts/body.ts';
import { StubLegs } from './parts/feet.ts';
import { Hair } from './parts/hair.ts';
import { Hands } from './parts/hands.ts';
import { Head } from './parts/head.ts';
import { KitA } from './parts/kit.ts';
import { Stance } from './parts/stance.ts';
import { Stature } from './parts/stature.ts';

// A film's figures file, laid as the film lays it and printed by the house:
// only figures `figure` returned, its artboards in its keys' order with one
// id counter, each locked figure's print alone the same wherever the file
// lays it, and every override its figures carry by the artboard it is laid
// on.

const SKIN = paper({ color: '#ece7fa', shade: '#c9bcf2', light: '#fffffb' }, 'skin');
const WHITE = paper({ color: '#fcfbfc', shade: '#dcd9ec', light: '#ffffff' }, 'white');

/** A lock as its file keeps it, on the plain lead. */
const LOCK = {
  item: 'lead',
  version: 1,
  hash: 'a'.repeat(64),
  ask: 'a92f276635e',
  at: 1792281444576,
  seen: { set: 'concepts', file: 'images/lead.png' },
};

/** An override of the lead's lock, freeing one print of him. */
const OVERRIDE = {
  rule: 'FigureLock' as const,
  place: 'lead',
  frees: 'b'.repeat(64),
  reason: 'a test of the way out',
  quote: 'words a test stands in for',
};

/** A plain figure's parts, of `skin`, its hands of it too. */
const plainOf = (skin: typeof SKIN) => ({
  concept: { image: { set: 'concepts', file: 'images/lead.png' }, box: [0, 0, 100, 200] as const },
  art: { width: 360, height: 470, feet: [180, 440] as const },
  stature: Stature.PlainLead(),
  stance: Stance.Standing({ breath: { period: 4, trunk: 1.012, neck: -2 } }),
  head: Head.Round({ y: -300, r: [73, 72], neck: -236, paper: skin }),
  face: KitA({ x: 0, y: 12, scale: 1.75, gaze: [0, 12] }),
  body: Tunic({
    neck: -236,
    hem: -42,
    half: { neck: 41, hem: 75 },
    radius: 22,
    bow: 4,
    paper: skin,
  }),
  states: [],
  feet: StubLegs({ x: 23.5, r: 14, paper: skin }),
  hands: Hands({ paper: skin, share: 0.34 }),
});

const lead = figure({ ...plainOf(SKIN), lock: LOCK });
const other = figure(plainOf(WHITE));

/** A file of two figures, each with its hands' artboard, the second's hand twice the house's. */
const FILE = figuresFile({
  weight: 1,
  boards: {
    lead: { name: 'Lead', seed: 1, stage: 0, figure: lead, hands: 'leadHand' },
    leadHand: { name: 'LeadHand', seed: 2, stage: 400, hand: SKIN },
    other: { name: 'Other', seed: 3, stage: 500, figure: other, hands: 'otherHand' },
    otherHand: { name: 'OtherHand', seed: 4, stage: 900, hand: WHITE, size: 2 },
  },
});

/** Each artboard's `key` attribute in `rml`, in the order it prints them. */
const artboards = (rml: string, key: string) =>
  Array.from(rml.matchAll(new RegExp(`<Artboard [^>]*\\b${key}="([^"]+)"`, 'g')), (m) => m[1]);

/** Each stroke's thickness in `rml`. */
const thicknesses = (rml: string) =>
  Array.from(rml.matchAll(/<Stroke thickness="([^"]+)"/g), (m) => Number(m[1]));

describe("a film's figures file", () => {
  test("prints each artboard in its keys' order, at its place on the stage, with one id counter for the file", () => {
    const rml = figuresRml(FILE);
    expect(artboards(rml, 'name')).toEqual(['Lead', 'LeadHand', 'Other', 'OtherHand']);
    expect(artboards(rml, 'x')).toEqual(['0', '400', '500', '900']);
    const given = Array.from(rml.matchAll(/ id="([^"]+)"/g), (m) => m[1]);
    expect(given.length).toBeGreaterThan(0);
    expect(new Set(given).size).toBe(given.length);
  });

  test("names each artboard by its key, and draws a hand's at its size", () => {
    expect(FILE.artboards).toEqual({
      lead: 'Lead',
      leadHand: 'LeadHand',
      other: 'Other',
      otherHand: 'OtherHand',
    });
    expect(artboards(figuresRml(FILE), 'width')).toEqual(['360', '64', '360', '128']);
  });

  test("draws the figures' ink at the file's weight against the house look's line", () => {
    const light = Math.max(...thicknesses(figuresRml(FILE)));
    const heavy = Math.max(...thicknesses(figuresRml({ ...FILE, weight: 2 })));
    expect(heavy).toBeGreaterThan(light);
  });

  test("an artboard's name laid twice is refused", () => {
    expect(() =>
      figuresFile({
        weight: 1,
        boards: { ...FILE.boards, again: { name: 'Lead', seed: 5, stage: 1000, hand: SKIN } },
      }),
    ).toThrow(/figuresFile refused: .*an artboard's name is laid twice: Lead/);
  });

  test("a figure's hands laid on no hand's artboard of the file, or on a hand of another paper, are refused", () => {
    expect(() =>
      figuresFile({
        weight: 1,
        boards: {
          // @ts-expect-error a figure's hands are laid on a hand's artboard of its file
          lead: { name: 'Lead', seed: 1, stage: 0, figure: lead, hands: 'other' },
          other: { name: 'Other', seed: 3, stage: 500, figure: other, hands: 'otherHand' },
          otherHand: { name: 'OtherHand', seed: 4, stage: 900, hand: WHITE },
        },
      }),
    ).toThrow(/figuresFile refused: .*lead's hands are laid on other, which is no hand's artboard/);
    expect(() =>
      figuresFile({
        weight: 1,
        boards: {
          lead: { name: 'Lead', seed: 1, stage: 0, figure: lead, hands: 'otherHand' },
          otherHand: { name: 'OtherHand', seed: 4, stage: 900, hand: WHITE },
        },
      }),
    ).toThrow(/figuresFile refused: .*lead's hands are laid on otherHand, a hand of another paper/);
  });

  test('a copy of a composed figure is refused, a part changed in it or not: its parts were never checked', () => {
    const ear = { _tag: 'RoundEar', at: [40, 0], r: [8, 12] } as const;
    const copies = {
      // An ear on a round head, its paper greyed (GreyShade) or rimmed (InnerRim): each `figure` refuses.
      grey: { ...lead, ear: { ...ear, paper: { ...SKIN, shade: '#808080' as const } } },
      rimmed: { ...lead, ear: { ...ear, paper: { ...SKIN, rim: 3 } } },
      // Hair on a round head, which the house cannot draw.
      haired: {
        ...lead,
        hair: Hair.Traced({
          outline: [
            [-40, -20],
            [0, -60],
            [40, -20],
          ],
          paper: SKIN,
        }),
      },
      same: { ...lead },
    };
    for (const copy of Object.values(copies))
      expect(() =>
        figuresFile({
          weight: 1,
          boards: { ...FILE.boards, lead: { ...FILE.boards.lead, figure: copy } },
        }),
      ).toThrow(/figuresFile refused: .*a figure `figure` returned, not a copy of one/);
    // Nor does the house draw one in a file `figuresFile` did not lay.
    expect(() =>
      figuresRml({
        weight: 1,
        boards: { ...FILE.boards, lead: { ...FILE.boards.lead, figure: copies.grey } },
      }),
    ).toThrow(/Lead refused: .*a figure `figure` returned, not a copy of one/);
  });

  test('prints each locked figure alone, with its hands: the same wherever the file lays them and whatever it draws before them', () => {
    const locked = lockedPrints(FILE);
    expect(locked.map((l) => [l.item, l.lock])).toEqual([['lead', LOCK]]);
    const print = locked[0]?.print ?? '';
    expect(artboards(print, 'name')).toEqual(['Lead', 'LeadHand']);
    const moved = figuresFile({
      weight: 1,
      boards: {
        other: { name: 'Other', seed: 3, stage: 0, figure: other, hands: 'otherHand' },
        otherHand: { name: 'OtherHand', seed: 4, stage: 320, hand: WHITE, size: 2 },
        lead: { name: 'Lead', seed: 1, stage: 600, figure: lead, hands: 'leadHand' },
        leadHand: { name: 'LeadHand', seed: 2, stage: 1000, hand: SKIN },
      },
    });
    expect(lockedPrints(moved)).toEqual([{ item: 'lead', lock: LOCK, print }]);
    // His boil's seed is his print's: a change to it is a change to him.
    const reseeded = figuresFile({
      weight: 1,
      boards: { ...FILE.boards, lead: { ...FILE.boards.lead, seed: 9 } },
    });
    expect(lockedPrints(reseeded)[0]?.print).not.toBe(print);
  });

  test("lists every override its figures carry, by the artboard each is laid on, a lock's with the time the ledger filed the lock", () => {
    expect(figureOverrides(FILE)).toEqual([]);
    const freed = figuresFile({
      weight: 1,
      boards: {
        ...FILE.boards,
        lead: {
          ...FILE.boards.lead,
          figure: figure({ ...plainOf(SKIN), lock: { ...LOCK, override: OVERRIDE } }),
        },
      },
    });
    expect(figureOverrides(freed)).toEqual([{ item: 'lead', override: OVERRIDE, since: LOCK.at }]);
  });
});
