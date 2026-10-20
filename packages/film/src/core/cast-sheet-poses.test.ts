// The cast sheet's measure on pose, heads and headgear sheets drawn with known
// faults (`fixtures/figure.ts`): each sleeve, arm, beard, size and paper
// drawn wrong is the flag it was drawn for, and what a sheet cannot show is
// said, never flagged. A member of its own design is held to its own heads,
// and a smaller figure (a child) to its share of the grown one. The
// turnarounds are read in `cast-sheet.test.ts`.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { measureSheet, type SheetMeasure, type SheetOptions, sheetTable } from './cast-sheet.ts';
import { drawFigure, drawSheet, type FigureSpec, PAPER, PLAIN } from './fixtures/figure.ts';
import { type Raster, scaleRaster } from './raster.ts';

const base: FigureSpec = { ...PLAIN, robeShade: [60, 78, 150], arm: 'sleeve' };
const at = (extra: Partial<FigureSpec> = {}) => drawFigure({ ...base, eyeShift: 0, ...extra });
const read = (
  views: ReadonlyArray<ReturnType<typeof drawFigure>>,
  options: SheetOptions,
): SheetMeasure => Result.getOrThrow(measureSheet(drawSheet(views), options));
const flagsOf = (m: SheetMeasure) => m.flags.map((f) => `${f.check}:${f.views.join(',')}`);

describe("a pose sheet's sleeves and arms", () => {
  const m = read(
    [at(), at({ arm: 'sleeveAtRest' }), at({ arm: 'sleeveReach' }), at({ arm: 'bare' })],
    { kind: 'poses', count: 4, anchor: 1 },
  );

  test('passes a hand at the end of its sleeve, at rest or held out, and flags a hand floating free beside a sleeve and a bare arm', () => {
    expect(flagsOf(m)).toEqual(['sleeveReach:2', 'bareArm:4']);
    expect(
      m.views.map((v) =>
        Option.getOrElse(Option.fromUndefinedOr(v.free), (): number | 'unread' => 'unread'),
      ),
    ).toEqual([0, 1, 0, 'unread']);
    expect(m.views[2]?.reach).toBeGreaterThan(0.5);
    expect(m.views.map((v) => v.bare)).toEqual([0, 0, 0, 1]);
  });
});

describe("a heads sheet's hair and beard", () => {
  const m = read(
    [
      at({ longHair: true, beard: { parted: true }, handless: true }),
      at({ longHair: true, beard: { parted: false }, handless: true }),
    ],
    { kind: 'heads', count: 2, anchor: 1 },
  );

  test('reads a beard parted from the hair, and flags one that runs into it', () => {
    expect(m.views.map((v) => v.hairBeard)).toEqual(['parted', 'merged']);
    expect(flagsOf(m)).toEqual(['hairBeard:2']);
  });

  test('holds no body to the canon, and says so', () => {
    expect(m.canon).toEqual({});
    expect(m.unmeasured).toContainEqual({
      check: 'squash',
      view: 0,
      why: 'a heads sheet draws no body to hold to the canon',
    });
  });
});

describe('a pose sheet drifting from its anchor', () => {
  const m = read(
    [
      at(),
      at({ cy: 120 }),
      at({ robeShade: [104, 104, 104] }),
      at({ robe: [170, 84, 64], robeShade: [150, 60, 80] }),
      at({ robeDepth: 380 }),
    ],
    { kind: 'poses', count: 5, anchor: 1, standing: [1, 2, 3, 4, 5] },
  );

  test('flags a standing view taller, soles off the ground line, a grey shade and another cloth', () => {
    expect(flagsOf(m)).toEqual([
      'height:5,1',
      'ground:2',
      'ground:5',
      'grey:3',
      'papers:3,1',
      'papers:4,1',
    ]);
  });
});

describe('a pose sheet whose anchor is squashed', () => {
  const m = read([at({ rx: 40, ry: 44 }), at()], { kind: 'poses', count: 2, anchor: 1 });

  test("flags the squash to the canon, and the head and hand off the anchor's", () => {
    expect(m.canon.squash).toBeGreaterThan(30);
    expect(flagsOf(m).filter((f) => !f.startsWith('ground'))).toEqual([
      'squash:1',
      'head:2,1',
      'hand:2,1',
    ]);
  });
});

describe('a figure under headgear', () => {
  const m = read([at()], { kind: 'poses', count: 1, anchor: 1, headgear: true });

  test('holds the views to the face opening, and leaves the canon to the lock', () => {
    expect(flagsOf(m)).toEqual([]);
    expect(m.canon).toEqual({});
    expect(m.unmeasured.map((u) => u.check)).toContain('squash');
  });
});

describe('a heads sheet of level, bowed and lifted heads', () => {
  // Busts with no hands; a turned head is narrower than a front one, a bowed head shorter on the page with its eyes lower, a lifted one's higher.
  const bust = (extra: Partial<FigureSpec>) =>
    at({ handless: true, feet: false, robeDepth: 120, longHair: true, ...extra });
  const turned = { eyeShift: -14, rx: 52 };
  const bowed = { ry: 56, eyeBelow: 22 };
  const lifted = { ry: 58, eyeBelow: -4 };
  const sheet = (last: Partial<FigureSpec>) =>
    read(
      [
        bust(turned),
        bust({ ...turned, ...bowed }),
        bust({ ...turned, ...lifted }),
        bust({}),
        bust(bowed),
        bust(last),
      ],
      {
        kind: 'heads',
        count: 6,
        anchor: 1,
        slots: ['left', 'left', 'left', 'front', 'front', 'front'],
        level: [1, 4, 6],
      },
    );
  const m = sheet({});

  test('holds each head by its width among the heads of its turn, and by its height on the level heads, and reads no hand', () => {
    expect(flagsOf(m)).toEqual([]);
    expect(m.views.filter((v) => 'hand' in v)).toEqual([]);
    expect(m.unmeasured).toContainEqual({
      check: 'hand',
      view: 0,
      why: 'a heads sheet draws no hands',
    });
  });

  test("holds a head whose box a lock of hair widens by its eyes, and flags a head drawn bigger than its turn's first", () => {
    // A lock beside the face widens the head's box and leaves the face as it is; a head drawn bigger spaces its eyes wider too.
    expect(flagsOf(sheet({ rx: 68 }))).toEqual([]);
    const big = sheet({ rx: 68, eyeGap: 56 });
    expect(flagsOf(big)).toEqual(['head:6,4']);
    expect(big.flags[0]?.note).toContain("view 4's, its turn's first");
  });
});

describe('a beard read under the mouth', () => {
  // No beard over a dark robe; a beard run into the locks under a hair line inked across them.
  const m = read(
    [
      at({ longHair: true, robe: [104, 70, 46], robeShade: [88, 62, 84] }),
      at({ longHair: true, beard: { parted: false }, hairInk: true }),
    ],
    { kind: 'poses', count: 2, anchor: 1 },
  );

  test('says a view with no beard is not measured, never parted, and reads a beard run into the locks as merged', () => {
    expect(m.views.map((v) => v.hairBeard ?? 'not read')).toEqual(['not read', 'merged']);
    expect(m.unmeasured).toContainEqual({
      check: 'hairBeard',
      view: 1,
      why: 'no beard reads under the mouth',
    });
  });
});

describe('a figure under a headcloth', () => {
  const cloth = { headcloth: [196, 170, 120] as const };
  const m = read([at(cloth), at({ ...cloth, robeDepth: 380 })], {
    kind: 'poses',
    count: 2,
    anchor: 1,
    headgear: true,
    standing: [1, 2],
  });

  test('holds the head to its face opening, not the cloth round it', () => {
    expect(m.views[0]?.head).toBeGreaterThan(80);
    expect(m.views[0]?.head).toBeLessThan(100);
    expect(flagsOf(m)).toEqual(['height:2,1', 'ground:2']);
  });
});

describe('a beard under a dark headcloth', () => {
  // The cloth's dark band meets the beard at the cheeks: no hair shows, so no parting is read.
  const dark = { headcloth: [112, 74, 50] as const, beard: { parted: false } };
  const m = read([at(dark), at(dark)], {
    kind: 'poses',
    count: 2,
    anchor: 1,
    headgear: true,
    standing: [1, 2],
  });

  test('reads no hair under the cloth, and says so', () => {
    expect(flagsOf(m)).toEqual([]);
    expect(m.views.map((v) => v.hairBeard ?? 'not read')).toEqual(['not read', 'not read']);
    expect(m.unmeasured.filter((u) => u.check === 'hairBeard').map((u) => u.why)).toEqual([
      'headgear: the cloth hides the hair, so no parting is read',
      'headgear: the cloth hides the hair, so no parting is read',
    ]);
  });
});

/** The lowest row of `r` that is not paper: the figure's soles. */
const soleOf = (r: Raster): number => {
  for (let y = r.height - 1; y >= 0; y--)
    for (let x = 0; x < r.width; x++) {
      const i = (y * r.width + x) * 4;
      if (r.rgba[i] !== PAPER[0] || r.rgba[i + 1] !== PAPER[1] || r.rgba[i + 2] !== PAPER[2])
        return y;
    }
  return r.height - 1;
};

/** `r` drawn `share` of its size on paper of its own size, centred, its soles on `r`'s ground line. */
const smaller = (r: Raster, share: number): Raster => {
  const small = scaleRaster(r, share);
  const rgba = new Uint8Array(r.width * r.height * 4);
  for (let i = 0; i < r.width * r.height; i++) rgba.set([...PAPER, 255], i * 4);
  const dx = Math.floor((r.width - small.width) / 2);
  const dy = soleOf(r) - soleOf(small);
  for (let y = 0; y < small.height; y++)
    rgba.set(
      small.rgba.subarray(y * small.width * 4, (y + 1) * small.width * 4),
      ((y + dy) * r.width + dx) * 4,
    );
  return { width: r.width, height: r.height, rgba };
};

describe('a member of its own design', () => {
  // A short robe: the figure stands about 2.7 of its heads, as the plain lead's 2.6.
  const short = at({ robeDepth: 220 });
  const standing: SheetOptions = { kind: 'poses', count: 2, anchor: 1, standing: [1, 2] };

  test('is held to its own heads, never the canon', () => {
    const canon = read([short, short], standing);
    expect(flagsOf(canon)).toEqual(['squash:1']);
    const own = read([short, short], { ...standing, heads: 2.7 });
    expect(flagsOf(own)).toEqual([]);
    expect(own.canon.against).toBe(2.7);
    expect(sheetTable('own', own)).toContain('heads against 2.7;');
  });
});

describe('a pose sheet that draws a smaller figure beside the grown one', () => {
  const grown = at();
  const child = smaller(grown, 0.75);
  const options: SheetOptions = { kind: 'poses', count: 2, anchor: 1, standing: [1, 2] };

  test("holds the smaller figure's height and head to its share of the grown one's", () => {
    expect(flagsOf(read([grown, child], options))).toEqual(['height:2,1', 'head:2,1']);
    const m = read([grown, child], {
      ...options,
      figures: [{ view: 2, height: 0.75, heads: 3.44 }],
      heads: 3.44,
    });
    expect(flagsOf(m)).toEqual([]);
  });
});
