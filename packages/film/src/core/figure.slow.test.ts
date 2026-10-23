// The figure measure on figures drawn with known numbers (`fixtures/figure.ts`),
// each ratio against the geometry it was drawn with. The real crops are read
// in `tools/figure-crops.slow.test.ts`, which decodes their PNGs.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import {
  type FigureMeasure,
  HEAD_RADII,
  hsvOf,
  measureFigure,
  type Ratio,
  shadeKind,
} from './figure.ts';
import { drawFigure, type FigureSpec, headWidth, PLAIN } from './fixtures/figure.ts';
import { cropRaster, type Raster } from './raster.ts';

const measured = (spec: FigureSpec): FigureMeasure =>
  Result.getOrThrow(measureFigure(drawFigure(spec)));

/** The ratio's value; NaN when it is missing, so the test's numbers fail on it. */
const valueOf = (m: FigureMeasure, ratio: Ratio): number =>
  Option.match(Option.fromUndefinedOr(m.ratios.find((r) => r.ratio === ratio)), {
    onNone: () => Number.NaN,
    onSome: (r) => r.value,
  });

const whyMissing = (m: FigureMeasure, ratio: Ratio) =>
  Option.fromUndefinedOr(m.missing.find((r) => r.ratio === ratio)?.why);

describe('a drawn figure', () => {
  const plain = measured(PLAIN);
  const W = headWidth(PLAIN);

  test('reads each proportion it was drawn with, as a share of the head width', () => {
    const near = (ratio: Ratio, drawn: number, within = 0.02) =>
      expect(Math.abs(valueOf(plain, ratio) - drawn)).toBeLessThan(within);
    // The head: its fill and its line, the hair cap inside it.
    near('headHeight', (2 * (PLAIN.ry + PLAIN.line)) / W);
    near('outline', PLAIN.line / W, 0.01);
    near('eyeSpacing', PLAIN.eyeGap / W, 0.01);
    // The eyes against their spacing: a pixel of an eye is a 48th of it.
    near('eyeWidth', PLAIN.eyeW / PLAIN.eyeGap, 0.035);
    near('eyeHeight', PLAIN.eyeH / PLAIN.eyeGap, 0.035);
    // The robe at its hem, and the figure from the hair's top to the feet's bottom.
    near('hem', (PLAIN.robeHem + 2 * PLAIN.line) / W);
    near('hand', (44 + 2 * PLAIN.line) / W);
    // The feet: two shoes 48 wide inside their line, 40 either side of the middle.
    near('feetWidth', (80 + 2 * (24 + PLAIN.line)) / W);
  });

  test('says why a mark it was not drawn with is missing', () => {
    expect(whyMissing(plain, 'browLength')).toEqual(Option.some('no brow over either eye'));
    expect(whyMissing(plain, 'mouthWidth')).toEqual(Option.some('no mark under the eyes'));
  });

  test('reads its outline: the head round, the body widening to its hem, the feet under it', () => {
    expect(plain.silhouette.head).toHaveLength(HEAD_RADII);
    // A head drawn round reads within a twentieth of a head of round at every angle.
    for (const r of plain.silhouette.head) expect(Math.abs(r - 0.5)).toBeLessThan(0.06);
    const [top, bottom] = [plain.silhouette.body[0]!, plain.silhouette.body.at(-1)!];
    expect(bottom.right - bottom.left).toBeGreaterThan(top.right - top.left);
    expect(
      Math.abs(bottom.right - bottom.left - (PLAIN.robeHem + 2 * PLAIN.line) / W),
    ).toBeLessThan(0.03);
    expect(plain.silhouette.feet).toBeDefined();
  });

  test("with dark grained hair whose specks read as ink, reads the hair's whole height and its outline's top", () => {
    const dark = measured({ ...PLAIN, darkHair: true });
    expect(Math.abs(valueOf(dark, 'headHeight') - (2 * (PLAIN.ry + PLAIN.line)) / W)).toBeLessThan(
      0.02,
    );
    for (const r of dark.silhouette.head) expect(Math.abs(r - 0.5)).toBeLessThan(0.06);
  });

  test('behind a rail as wide as its body, its hem and its feet are hidden, not read off the rail', () => {
    const behind = measured({ ...PLAIN, rail: true });
    expect(whyMissing(behind, 'hem')).toEqual(
      Option.some('a line runs on past the body at its lowest row: it stands behind something'),
    );
    expect(whyMissing(behind, 'feetWidth')).toEqual(Option.some('its feet are hidden'));
  });

  test("reads its own line when a wall's thin lines behind it hold more runs of line than it", () => {
    const walled = measured({ ...PLAIN, wall: true });
    expect(Math.abs(valueOf(walled, 'outline') - PLAIN.line / W)).toBeLessThan(0.01);
    expect(Math.abs(valueOf(walled, 'eyeSpacing') - PLAIN.eyeGap / W)).toBeLessThan(0.01);
  });

  test('cut by the crop under its hem, its feet are past the edge, not missing from the drawing', () => {
    const hem = PLAIN.cy + PLAIN.ry + PLAIN.robeDepth;
    const cut = cropRaster(drawFigure({ ...PLAIN, feet: false }), [
      0,
      0,
      400,
      hem + 2 * PLAIN.line,
    ]);
    expect(whyMissing(Result.getOrThrow(measureFigure(cut)), 'feetWidth')).toEqual(
      Option.some("its feet would lie past the crop's edge"),
    );
  });

  test('with no feet says so, and its outline has none', () => {
    const bare = measured({ ...PLAIN, feet: false });
    expect(whyMissing(bare, 'feetWidth')).toEqual(Option.some('no feet under the hem'));
    expect(bare.silhouette.feet).toBeUndefined();
  });

  test('a hair line with its own ink reads as interior ink; one without, none', () => {
    expect(valueOf(plain, 'interiorInk')).toBe(0);
    // The ink band runs the head's width at the hair line: most of a head long.
    expect(valueOf(measured({ ...PLAIN, hairInk: true }), 'interiorInk')).toBeGreaterThan(0.5);
  });

  test('an ear with a light rim inside its edge reads as an inner rim; one without, none', () => {
    const ear = { ...PLAIN, eyeGap: 30 };
    expect(valueOf(measured({ ...ear, ear: { rim: false } }), 'innerRim')).toBeLessThan(0.05);
    expect(valueOf(measured({ ...ear, ear: { rim: true } }), 'innerRim')).toBeGreaterThan(0.15);
  });

  test('a robe shaded in a colour reads as colour; a flat robe has no shade', () => {
    expect(plain.bodyShading).toBeUndefined();
    const shaded = measured({ ...PLAIN, robeShade: [80, 108, 168] });
    expect(shaded.bodyShading?.kind).toBe('colour');
  });

  test('a robe shaded toward grey, its saturation halved and its hue kept, reads as grey', () => {
    // Near enough the robe's colour to be one fill with it (`STEP`), as a shade is.
    expect(measured({ ...PLAIN, robeShade: [104, 118, 135] }).bodyShading?.kind).toBe('grey');
  });

  test('reads its mouth open when it is a filled shape, closed when it is a line', () => {
    expect(measured({ ...PLAIN, mouth: { open: true, width: 30 } }).mouth).toBe('open');
    expect(measured({ ...PLAIN, mouth: { open: false, width: 30 } }).mouth).toBe('closed');
    expect(plain.mouth).toBeUndefined();
  });

  test("reads the face's marks against the eye spacing: a line half as heavy again moves none of them", () => {
    const face = { ...PLAIN, mouth: { open: false, width: 30 } };
    const [light, heavy] = [measured(face), measured({ ...face, line: 10 })];
    // The outer width holds the line: 4 px more of it each side widens the head 6%.
    for (const ratio of ['eyeWidth', 'eyeHeight', 'mouthWidth'] as const)
      expect({ ratio, off: Math.abs(valueOf(heavy, ratio) / valueOf(light, ratio) - 1) }).toEqual({
        ratio,
        off: expect.closeTo(0, 1.5),
      });
  });

  test("under a headcloth its face's fill runs on into with no line, shades the skin alone", () => {
    // The RBF farmer's cream cloth, 61 from his skin: near enough to pass for a shade of it.
    const cloth = measured({ ...PLAIN, headcloth: [230, 220, 190] });
    expect(plain.headShading).toBeUndefined();
    expect(cloth.headShading).toBeUndefined();
  });

  test('a crop with no ink is no figure', () => {
    const blank: Raster = { width: 40, height: 40, rgba: new Uint8Array(40 * 40 * 4).fill(240) };
    const m = measureFigure(blank);
    expect(Result.isFailure(m) && m.failure.reason).toBe('no dark warm ink in it');
  });
});

describe('a beardless face whose beard band falls below the head', () => {
  test('reads no beard, so no hair against beard', () => {
    expect(measured({ ...PLAIN, eyeBelow: 35 }).hairBeard).toBeUndefined();
  });
});

describe('long dark hair, a lit band painted on it inside the ink', () => {
  const W = headWidth(PLAIN);
  const drawnHeight = (2 * (PLAIN.ry + PLAIN.line)) / W;
  const [dark, lit] = [
    measured({ ...PLAIN, longHair: true }),
    measured({ ...PLAIN, longHair: true, litBand: true }),
  ];

  test("reads the head to its outline's outer edge, the band moving neither side", () => {
    expect(Math.abs(valueOf(dark, 'headHeight') / drawnHeight - 1)).toBeLessThan(0.03);
    expect(Math.abs(valueOf(lit, 'headHeight') / drawnHeight - 1)).toBeLessThan(0.03);
  });

  test('reads no line of the hair between the band and the skin: the dark hair is the paper the band lies on', () => {
    expect(valueOf(lit, 'interiorInk')).toBeLessThan(0.02);
  });
});

describe("a shade against its fill's lit colour", () => {
  const peach = hsvOf([247, 178, 132]);

  test('a shade with no hue to turn, black or a grey, is grey whatever hue its fill has', () => {
    for (const shade of [
      [0, 0, 0],
      [128, 128, 128],
      [129, 128, 128],
    ] as const)
      expect(shadeKind(peach, hsvOf(shade))).toBe('grey');
  });

  test("a shade cooled toward the light's complement keeps a hue: a colour, however drained", () => {
    expect(shadeKind(peach, hsvOf([92, 98, 120]))).toBe('colour');
  });
});
