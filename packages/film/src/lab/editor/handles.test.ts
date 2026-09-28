// Where a point knob's handle sits on the frame, from what the frame read:
// through the transform it was read under, or, read before a camera, through
// the camera that draws it. Numbers only (with the reason) when a transition
// composited it, when two transforms read it, or when it was drawn squashed
// flat. A point knob with a `<name>Zoom` sibling is a camera's target.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import type { KnobRead } from '../../canvas/film.ts';
import type { Affine } from '../../core/affine.ts';
import { handleOf, isCameraTarget, knobMode } from './handles.ts';

const read = (over: Partial<KnobRead> = {}): KnobRead => ({
  scene: 'one',
  name: 'spot',
  value: [100, 50],
  transform: [1, 0, 0, 1, 0, 0],
  ...over,
});

/** A camera pushed in 2× on (400, 200) of a 640 × 360 frame. */
const pushed: Affine = [2, 0, 0, 2, 320 - 800, 180 - 400];

describe('handleOf', () => {
  test('a point read onto the frame sits where its transform puts it', () => {
    const at = handleOf([read({ transform: [2, 0, 0, 2, 10, 20] })], 'one', 'spot');
    expect(at).toMatchObject({ _tag: 'Handle', at: [210, 120] });
  });

  test('a point read before a camera sits where the camera draws it', () => {
    const at = handleOf([read({ value: [300, 250], framed: pushed })], 'one', 'spot');
    expect(at).toMatchObject({ _tag: 'Handle', at: [120, 280] });
  });

  test('numbers only, with the reason, where the frame cannot place it', () => {
    expect(handleOf([], 'one', 'spot')).toEqual({
      _tag: 'NoHandle',
      why: 'not read at this frame: numbers only',
    });
    expect(handleOf([read({ value: 24 })], 'one', 'spot')).toEqual({
      _tag: 'NoHandle',
      why: 'a number',
    });
    // A read into a transition's layer: the frame records no transform.
    const composited = read({ transform: Option.getOrUndefined(Option.none<Affine>()) });
    expect(handleOf([composited], 'one', 'spot')).toEqual({
      _tag: 'NoHandle',
      why: 'read inside a transition here: numbers only',
    });
    expect(handleOf([read(), read({ transform: [2, 0, 0, 2, 0, 0] })], 'one', 'spot')).toEqual({
      _tag: 'NoHandle',
      why: 'read under more than one transform here: numbers only',
    });
    expect(handleOf([read({ transform: [0, 0, 0, 0, 1, 1] })], 'one', 'spot')).toEqual({
      _tag: 'NoHandle',
      why: 'drawn squashed flat here: numbers only',
    });
  });
});

describe('knobMode', () => {
  const knobs = { face: [400, 200] as const, faceZoom: 2, pole: [300, 250] as const };
  const handle = (at: readonly [number, number]) => ({
    _tag: 'Handle' as const,
    value: [400, 200] as const,
    at,
    m: pushed,
    inv: pushed,
  });
  test("a camera's target at the frame's centre drags the picture", () => {
    expect(knobMode(knobs, 'face', handle([320.4, 180]), [640, 360])).toBe('picture');
  });
  test('a target off centre, or any other point, follows the pointer', () => {
    expect(knobMode(knobs, 'face', handle([300, 180]), [640, 360])).toBe('point');
    expect(knobMode(knobs, 'pole', handle([320, 180]), [640, 360])).toBe('point');
  });
});

describe('isCameraTarget', () => {
  test('a point knob with a <name>Zoom knob beside it', () => {
    const knobs = { face: [400, 200] as const, faceZoom: 2, spot: [1, 2] as const };
    expect(isCameraTarget(knobs, 'face')).toBe(true);
    expect(isCameraTarget(knobs, 'spot')).toBe(false);
    expect(isCameraTarget(knobs, 'faceZoom')).toBe(false);
  });
});
