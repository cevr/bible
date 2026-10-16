// The axis property: every option of every art-direction axis
// (`direction.ts`), one axis at a time with the others at K1, builds a valid
// rig (with the Rive CLI: `build.test.ts`), passes the figure-parts tests, keeps both heads inside their
// artboards (what `paintGl` copies), declares a face probe as tall as the
// head it draws, and reaches every part its axis names. Every hand is one
// closed circle, and every line the outline axis names is laid on every
// piece and on the gavel as drawn.
//
// The colours, under K1 and every option: one colour model owns the look
// (`ramp`, CRAFT 12, its law checked in the film's `colour.test.ts`). Every
// colour a rig paints is read from the built rig by its role and must be a
// base the palette declares or what `ramp` derives from one under the court's
// key light: a crease's far side and a cut edge's light core from their
// paper, every cast from the paper it falls on, the ink from the direction.
// A clipped cast's surface is read from its clip, which holds in every pose; a
// piece's own shadow must move with what it falls on, so its rest is every
// pose; no timeline animates a colour. A cast is laid only where it can show
// past its piece's ink. The judge's hand, a rig over the host's scenery, lays
// no cast of its own: the host lays it, read from the drawing in every pose
// and checked against the court's own geometry (`underHand`, the one
// inventory). Every colour the host lays round the figures, read whole from
// the drawing (fills, rectangles, strokes, the shadows they cast, a
// gradient's every stop), is a base, a derived shade, an ink or the kit's
// named shading (`KIT_SHADING`). The knobs themselves are held to CRAFT 12's
// floors by the model (`ramp` refuses knobs under them).
//
// The property is told in four files, so the runner's workers take them side
// by side: each option's rig here; the colours (`direction-colours.test.ts`);
// the hands and lines (`direction-hands.test.ts`); and what the host lays
// round the figures (`direction-host.test.ts`). What they read of the rigs is
// `test/direction-rigs.ts`; of the host's drawing, `test/direction-host.ts`.

import { describe, expect, test } from 'bun:test';
import { ramps } from '../../palette.ts';
import { paperProps } from '../cutpaper/court.ts';
import { accusedFace, accusedHead } from './accused-rig.ts';
import { inkOf, propsOf } from './direction.ts';
import { figureRigs, figuresRml } from './figures.ts';
import { JUDGE_FACE, judgeFace } from './judge-rig.ts';
import { boxOf } from './parts.ts';
import { type Element, argb } from './rml.ts';
import { CASES, attr, num, walk, named, pointsOf, reachOf, MOVES } from './test/direction-rigs.ts';

describe.each(CASES)('option %s', (_, d) => {
  const rigs = figureRigs(d);
  const board = (rig: ReadonlyArray<Element>) => rig[0] as Element;
  const accused = board(rigs.accused);
  const judge = board(rigs.judge);
  const hand = board(rigs.hand);

  test('the project file has no thumbs and no mittens', () => {
    expect(figuresRml(d)).not.toMatch(/thumb|mitten/i);
  });

  test('the project file is the same text every time, and every id in it is its own', () => {
    const rml = figuresRml(d);
    expect(figuresRml(d)).toBe(rml);
    const defined = [...rml.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(defined).size).toBe(defined.length);
  });

  test('every hand is the same part: one circle of twelve points, creased and outlined alike', () => {
    const palms = [
      ...named([accused], 'nearPalm'),
      ...named([accused], 'farPalm'),
      ...named([hand], 'palm'),
    ];
    expect(palms).toHaveLength(3);
    const shapeOf = (palm: Element) => ({
      paths: palm.children.filter((e) => e.name === 'PointsPath').length,
      points: walk([palm]).filter((e) => e.name === 'CubicMirroredVertex').length,
      // A shadow is laid where it shows and on what it falls on (`casts` in `parts.ts`), so it
      // differs by hand: the paper and its edge are the part.
      paints: palm.children
        .filter((e) => e.name !== 'PointsPath' && attr(e, 'name') !== 'Shadow')
        .map((e) => attr(e, 'name')),
    });
    const shapes = palms.map(shapeOf);
    expect(shapes[0]?.points).toBe(12);
    expect(shapes[0]?.paints).toContain('Paper');
    for (const shape of shapes)
      expect(shape).toEqual({ paths: 1, points: 12, paints: shapes[0]?.paints ?? [] });
    // Nothing but the one path and paints: no part hangs off a hand.
    for (const palm of palms)
      for (const child of palm.children)
        expect([child.name, ['PointsPath', 'Fill', 'Stroke'].includes(child.name)]).toEqual([
          child.name,
          true,
        ]);
  });

  test('the accused and the judge wear the same face kit, the judge at his own scale', () => {
    const parts = ['face', 'features', 'brows', 'eyeL', 'eyeR', 'mouthLine', 'mouthOh', 'faceRest'];
    for (const part of parts)
      expect([part, named([accused], part).length, named([judge], part).length]).toEqual([
        part,
        1,
        1,
      ]);
    // The kit scales with the head the axis draws: the accused's by the head's scale, the judge's by his own times it.
    const hs = accusedHead(d).scale;
    expect(num(named([accused], 'face')[0], 'scaleX', 1)).toBeCloseTo(hs, 6);
    expect(num(named([judge], 'face')[0], 'scaleX', 1)).toBeCloseTo(JUDGE_FACE * hs, 6);
    expect(JUDGE_FACE).toBeGreaterThan(1);
  });

  test('both heads, their ink, shadow and moves, sit inside their artboards (what paintGl copies)', () => {
    for (const b of [accused, judge]) {
      const box = boxOf(pointsOf(b, 'head'));
      const pad = reachOf(b, 'head') + MOVES;
      const width = num(b, 'width', 0);
      const height = num(b, 'height', 0);
      expect({
        artboard: attr(b, 'name'),
        top: box.y0 - pad >= 0,
        bottom: box.y1 + pad <= height,
      }).toEqual({
        artboard: attr(b, 'name'),
        top: true,
        bottom: true,
      });
      expect([box.x0 - pad >= 0, box.x1 + pad <= width]).toEqual([true, true]);
    }
  });

  test('each face probe is as tall as the head it is declared on', () => {
    for (const [b, face] of [
      [accused, accusedFace(d)],
      [judge, judgeFace(d)],
    ] as const) {
      const box = boxOf(pointsOf(b, 'head'));
      // The outline's points fall a little inside the curve through them.
      expect(Math.abs(face.height / (box.y1 - box.y0) - 1)).toBeLessThan(0.03);
      expect(named([b], face.node)).toHaveLength(1);
    }
    expect(accusedHead(d).scale).toBeGreaterThan(0);
  });

  test('the ink reaches every line it names: the figures, the sheets, the block and the gavel', () => {
    const inks = [accused, judge, hand].flatMap((b) =>
      named([b], 'Ink').flatMap((paint) =>
        paint.children.filter((c) => c.name === 'SolidColor').map((c) => attr(c, 'colorValue')),
      ),
    );
    expect(inks.length).toBeGreaterThan(0);
    expect(new Set(inks)).toEqual(new Set([argb(inkOf(d))]));
    const props = propsOf(d);
    if (d.colour === 'grey' && d.ink === 'warm') expect(props).toEqual(paperProps);
    else
      expect([props.sheetInk, props.blockInk, props.gavelInk]).toEqual([
        inkOf(d),
        inkOf(d),
        inkOf(d),
      ]);
  });

  test("every head and hand is the people's one figure paper", () => {
    for (const [b, shape] of [
      [accused, 'head'],
      [accused, 'nearPalm'],
      [accused, 'farPalm'],
      [judge, 'head'],
      [hand, 'palm'],
    ] as const) {
      const paper = named([b], shape)
        .find((e) => e.name === 'Shape')
        ?.children.find((c) => attr(c, 'name') === 'Paper');
      const stops = walk(paper ? [paper] : [])
        .filter((e) => e.name === 'GradientStop')
        .map((e) => attr(e, 'colorValue'));
      expect([shape, stops]).toEqual([
        shape,
        [ramps.figure.base, ramps.figure.base, ramps.figure.shade, ramps.figure.shade].map((c) =>
          argb(c),
        ),
      ]);
    }
  });
});
