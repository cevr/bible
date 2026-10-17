import { describe, expect, test } from 'bun:test';
import { EASE, type Expression, acted } from './face.ts';

const WIDE: Expression = { ...EASE, eyes: 2, browY: -4 };
const SHUT: Expression = { ...EASE, eyes: 0, mouth: -2 };

describe('acted', () => {
  test('a face no beat has reached wears the one it started from', () => {
    expect(
      acted({ ...EASE }, EASE, [
        [WIDE, 0],
        [SHUT, 0],
      ]),
    ).toEqual({ ...EASE });
  });

  test('each beat moves the face from where the last one left it', () => {
    const face = acted({ ...EASE }, EASE, [
      [WIDE, 1],
      [SHUT, 0.5],
    ]);
    expect(face.eyes).toBeCloseTo(1);
    expect(face.browY).toBeCloseTo(-2);
    expect(face.mouth).toBeCloseTo(-1);
  });

  test('a beat past its end holds there', () => {
    expect(acted({ ...EASE }, EASE, [[WIDE, 1.5]])).toEqual(acted({ ...EASE }, EASE, [[WIDE, 1]]));
  });
});
