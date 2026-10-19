// The cast sheet's measure on sheets drawn with known faults (`fixtures/figure.ts`):
// a clean turnaround reads no flag, and each fault drawn into a turnaround
// is the flag it was drawn for. The poses, heads and headgear sheets are read
// in `cast-sheet-poses.test.ts`, so the two files run side by side.

import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
import {
  measureSheet,
  SheetMeasure,
  type SheetOptions,
  sheetLines,
  sheetOverlay,
  sheetTable,
} from './cast-sheet.ts';
import { measureFigure } from './figure.ts';
import { drawFigure, drawSheet, type FigureSpec, flipRaster, PLAIN } from './fixtures/figure.ts';
import { cropRaster } from './raster.ts';

/** A figure as a turnaround draws it: the robe shaded on its right, the hand at the end of its sleeve, the eyes `eyeShift` px off the face's middle. */
const base: FigureSpec = { ...PLAIN, robeShade: [60, 78, 150], arm: 'sleeve' };
const at = (eyeShift: number, extra: Partial<FigureSpec> = {}) =>
  drawFigure({ ...base, eyeShift, ...extra });
/** A view facing the viewer's right as a painter draws one: the left-facing drawing flipped, its shade drawn on the far side so the lit side stays left. */
const turned = (eyeShift: number) => flipRaster(at(-eyeShift, { lit: 'right' }));

const turnaround: SheetOptions = { kind: 'turnaround', count: 6, anchor: 1 };
const read = (sheet: ReturnType<typeof drawSheet>, options: SheetOptions): SheetMeasure =>
  Result.getOrThrow(measureSheet(sheet, options));
/** Each flag as `<check>:<views>`. */
const flagsOf = (m: SheetMeasure) => m.flags.map((f) => `${f.check}:${f.views.join(',')}`);

describe('a clean turnaround', () => {
  const front = at(0);
  const sheet = drawSheet([front, at(-14), at(-26), at(0, { eyeW: 0 }), turned(26), turned(14)]);
  const concept = Result.getOrThrow(measureFigure(front));
  const m = read(sheet, {
    ...turnaround,
    concepts: [{ name: 'front', measure: concept, view: 1 }],
  });

  test("reads no flag: each view faces its slot, is lit left, and holds the anchor's size", () => {
    expect(flagsOf(m)).toEqual([]);
    expect(m.views.map((v) => v.lit)).toEqual(['left', 'left', 'left', 'left', 'left', 'left']);
    expect(new Set(m.views.map((v) => v.height)).size).toBe(1);
  });

  test('reads the anchor against the canon', () => {
    expect(m.canon.heads).toBeCloseTo(496 / 144, 2);
    expect(m.canon.squash).toBeGreaterThan(0);
    expect(m.canon.squash).toBeLessThan(5);
  });

  test('says the back view shows no face, so it reads no facing, sleeve or bare arm', () => {
    const back = m.unmeasured.filter((u) => u.view === 4).map((u) => u.check);
    expect(back).toEqual(['facing', 'hairBeard', 'sleeveReach', 'bareArm']);
  });

  test('holds a kept concept to its view with no row flagged', () => {
    expect(m.concepts).toHaveLength(1);
    expect(m.concepts[0]?.rows).toBeGreaterThan(0);
    expect(m.concepts[0]?.flagged).toEqual([]);
  });

  test("writes a table, a line per flag, JSON that decodes and an overlay the sheet's size", () => {
    expect(sheetTable('clean', m)).toContain('No flags.');
    expect(sheetLines('clean', m)).toEqual([
      'sheet clean kind=turnaround views=6 anchor=1 flags=0 heads=3.44 squash=3',
    ]);
    const json = Schema.fromJsonString(SheetMeasure);
    expect(Schema.decodeSync(json)(Schema.encodeSync(json)(m))).toEqual(m);
    const overlay = sheetOverlay(sheet, m);
    expect([overlay.width, overlay.height]).toEqual([sheet.width, sheet.height]);
  });
});

describe('a turnaround whose hands float free', () => {
  // The old house hand: a circle a hand's width beside the robe, no sleeve or arm to it.
  const free = (eyeShift: number, extra: Partial<FigureSpec> = {}) =>
    drawFigure({ ...PLAIN, robeShade: [60, 78, 150], eyeShift, ...extra });
  const m = read(
    drawSheet([
      free(0),
      free(-14),
      free(-26),
      free(0, { eyeW: 0 }),
      flipRaster(free(-26, { lit: 'right' })),
      flipRaster(free(-14, { lit: 'right' })),
    ]),
    turnaround,
  );

  test('flags each view whose hand reads, for its sleeve (owner, 2026-10-18)', () => {
    expect(flagsOf(m)).toEqual([
      'sleeveReach:1',
      'sleeveReach:2',
      'sleeveReach:3',
      'sleeveReach:5',
      'sleeveReach:6',
    ]);
    expect(
      m.views.map((v) =>
        Option.getOrElse(Option.fromUndefinedOr(v.free), (): number | 'unread' => 'unread'),
      ),
    ).toEqual([1, 1, 1, 'unread', 1, 1]);
  });
});

describe('a turnaround drawn wrong', () => {
  const v2 = at(-14);
  const v3 = at(-26);
  // The front tipped, the back's robe wider, view 5 a copy of view 3 (so it faces away from view 6), and view 6 view 2 flipped (lit on its right).
  const sheet = drawSheet([
    at(0, { roll: 6 }),
    v2,
    v3,
    at(0, { eyeW: 0, robeHem: 280 }),
    v3,
    flipRaster(v2),
  ]);
  const m = read(sheet, turnaround);

  test('flags each fault on the views it was drawn into, facing first', () => {
    expect(flagsOf(m)).toEqual([
      'facing:5',
      'roll:1',
      'width:1,4',
      'mirror:2,6',
      'sameWay:3,5',
      'profileWay:6,5',
      'lit:6',
    ]);
  });

  test("reads the tip in degrees and the flipped view's light on its right", () => {
    expect(m.views[0]?.roll).toBeGreaterThan(5);
    expect(m.views[5]?.lit).toBe('right');
    expect(sheetTable('bad', m)).toContain('**mirror** (view 2, 6)');
  });
});

describe('a sheet that does not read as asked', () => {
  const sheet = drawSheet([at(0), at(0)]);
  const reason = (options: SheetOptions) =>
    Result.match(measureSheet(sheet, options), {
      onFailure: (e) => e.message,
      onSuccess: () => 'read',
    });

  test('names fewer figures than it asks for, slots that do not fit, and an anchor off the sheet', () => {
    expect(reason({ kind: 'poses', count: 3, anchor: 1 })).toBe(
      'the sheet does not read: 2 figures found, the sheet names 3',
    );
    expect(reason({ kind: 'turnaround', count: 2, anchor: 1 })).toBe(
      'the sheet does not read: 6 slots for 2 figures',
    );
    expect(reason({ kind: 'poses', count: 2, anchor: 3 })).toBe(
      'the sheet does not read: the anchor 3 is not one of the 2 views',
    );
  });
});

describe("a turnaround's partners with a hand against the robe", () => {
  // View 6's hand touches the robe's ink, so the figure's ink ring spans it; its body is as wide as view 2's.
  const sheet = drawSheet([
    at(0),
    at(-14),
    at(-26),
    at(0, { eyeW: 0 }),
    turned(26),
    flipRaster(at(-14, { lit: 'right', limb: { hand: [326, 414], kind: 'free' } })),
  ]);
  const m = read(sheet, turnaround);

  test("holds the partners' widths on the body under the hands, never on where the hands float", () => {
    expect(flagsOf(m)).toEqual([]);
    expect(Math.abs(m.pairs[1]?.widths ?? 99)).toBeLessThan(1);
  });
});

describe('a turnaround painted close together', () => {
  // Each view's robe straight down its sides, cut to its own ink with 3 px of paper each side and drawn with no hands, so a neighbour's ink stands 6 px off its side, inside the 12 px a view's crop is padded by; view 4 is the back.
  const straight = { robeTop: 240, handless: true };
  const tight = (r: ReturnType<typeof at>) => cropRaster(r, [70, 0, 330, 640]);
  const close = drawSheet(
    [
      at(0, straight),
      at(-14, straight),
      at(-26, straight),
      at(0, { ...straight, eyeW: 0 }),
      flipRaster(at(-26, { ...straight, lit: 'right' })),
      flipRaster(at(-14, { ...straight, lit: 'right' })),
    ].map(tight),
  );
  const m = read(close, turnaround);

  test("reads each view's width on its own body, never a neighbour's ink beside it", () => {
    expect(new Set(m.views.map((v) => v.widthToHeight)).size).toBe(1);
    expect(m.pairs.map((p) => p.widths)).toEqual([0, 0, 0]);
  });
});

describe("a turnaround whose view's box overlaps its neighbour's", () => {
  // As the close turnaround, with a lock of view 6's hair drawn out level from its head over view 5's shoulder (a band of ink from x 1244 to its head, never touching view 5): view 6's box now spans view 5's robe on the rows its width is read on.
  const straight = { robeTop: 240, handless: true };
  const tight = (r: ReturnType<typeof at>) => cropRaster(r, [70, 0, 330, 640]);
  const sheet = drawSheet(
    [
      at(0, straight),
      at(-14, straight),
      at(-26, straight),
      at(0, { ...straight, eyeW: 0 }),
      flipRaster(at(-26, { ...straight, lit: 'right' })),
      flipRaster(at(-14, { ...straight, lit: 'right' })),
    ].map(tight),
  );
  for (let y = 96; y < 104; y++)
    for (let x = 1244; x < 1392; x++) sheet.rgba.set([58, 38, 28, 255], (y * sheet.width + x) * 4);
  const m = read(sheet, turnaround);

  test("reads its width on its own ring's pixels, never on the neighbour its box spans", () => {
    expect(new Set(m.views.map((v) => v.widthToHeight)).size).toBe(1);
    expect(m.pairs.map((p) => p.widths)).toEqual([0, 0, 0]);
  });
});

describe('a turnaround whose hands float low, in the band its width is read on', () => {
  // The hands float free beside the robe at 480 px, inside the band (from 0.76 of the height); the back and the profiles read no face, so no hand's disc is cut out of them.
  const limb = { hand: [372, 480] as const, kind: 'free' as const };
  const low = (eyeShift: number, extra: Partial<FigureSpec> = {}) =>
    at(eyeShift, { limb, ...extra });
  const sheet = drawSheet([
    low(0),
    low(-14),
    low(-26, { oneEye: true }),
    low(0, { eyeW: 0 }),
    flipRaster(low(-26, { oneEye: true, lit: 'right' })),
    flipRaster(low(-14, { lit: 'right' })),
  ]);
  const m = read(sheet, turnaround);

  test('reads the width on the body alone, faced or not, never on where the hands float', () => {
    expect(new Set(m.views.map((v) => v.widthToHeight)).size).toBe(1);
    expect(flagsOf(m).filter((f) => f.startsWith('width'))).toEqual([]);
  });
});

describe('a turnaround whose profiles are swapped', () => {
  // Each profile shows one eye, so neither reads a face; the hair falls behind it, away from the eye.
  const profile = (eyeShift: number) => at(eyeShift, { oneEye: true });
  const profileRight = flipRaster(at(-26, { oneEye: true, lit: 'right' }));
  const views = (three: ReturnType<typeof at>, five: ReturnType<typeof at>) =>
    drawSheet([at(0), at(-14), three, at(0, { eyeW: 0 }), five, turned(14)]);
  const right = read(views(profile(-26), profileRight), turnaround);
  const swapped = read(views(profileRight, profile(-26)), turnaround);

  test('holds each profile to the three-quarter on its side, and flags both when they face away', () => {
    expect(right.unmeasured.filter((u) => u.check === 'facing').map((u) => u.view)).toEqual([
      3, 4, 5,
    ]);
    expect(flagsOf(right)).toEqual([]);
    expect(flagsOf(swapped)).toEqual(['profileWay:2,3', 'profileWay:6,5']);
  });
});

describe('a sheet painted on no paper', () => {
  // The route can answer with the paper left out: every pixel round the figures transparent, its colour a dark grey no eye sees.
  const opaque = drawSheet([at(0), at(-14)]);
  const rgba = Uint8Array.from(opaque.rgba);
  for (let i = 0; i < rgba.length; i += 4)
    if (rgba[i] === 238 && rgba[i + 1] === 230 && rgba[i + 2] === 214) rgba.set([70, 70, 70, 0], i);
  const options: SheetOptions = { kind: 'poses', count: 2, anchor: 1, slots: ['front', 'left'] };

  test('reads its figures as on white paper', () => {
    const m = read({ ...opaque, rgba }, options);
    expect(m.views.map((v) => v.box)).toEqual(read(opaque, options).views.map((v) => v.box));
    expect(flagsOf(m)).toEqual([]);
  });
});

describe('a sheet that draws more figures than it names', () => {
  const sheet = drawSheet([
    at(0),
    at(0, { rx: 50, ry: 55, robeDepth: 280, robeHem: 200 }),
    at(-14),
  ]);
  const m = read(sheet, { kind: 'poses', count: 2, anchor: 1, slots: ['front', 'left'] });

  test('reads the largest it names, and says how many it found', () => {
    expect(m.found).toBe(3);
    expect(sheetTable('three', m)).toContain('3 figures found, the sheet names 2');
    expect(sheetLines('three', m)[0]).toContain('found=3');
  });
});
