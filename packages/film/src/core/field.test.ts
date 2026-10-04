import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import { fieldOf, fieldText, inspected, nudged, refusalOf, stepOf } from './field.ts';
import { CueDur, CueOffset, KnobNumber, Pixel } from './schema.ts';

const FPS = 30;

describe('fieldOf', () => {
  test("a cue's seconds step a frame, ten with Shift, a millisecond with Alt", () => {
    const spec = fieldOf(CueOffset, FPS);
    expect(spec.unit).toBe('s');
    expect(spec.step).toBeCloseTo(1 / 30, 9);
    expect(spec.coarse).toBeCloseTo(10 / 30, 9);
    expect(spec.fine).toBe(0.001);
    expect(spec.min).toEqual(Option.none());
  });

  test("a cue's dur never goes below 0, read through its check", () => {
    expect(fieldOf(CueDur, FPS).min).toEqual(Option.some(0));
  });

  test("a frame's step follows the film's rate", () => {
    expect(fieldOf(CueOffset, 24).step).toBeCloseTo(1 / 24, 9);
  });

  test('a pixel steps one, ten with Shift, a hundredth with Alt', () => {
    expect(fieldOf(Pixel, FPS)).toMatchObject({ unit: 'px', step: 1, coarse: 10, fine: 0.01 });
  });

  test("a knob's number steps a hundredth, a tenth with Shift, a thousandth with Alt", () => {
    expect(fieldOf(KnobNumber, FPS)).toMatchObject({
      unit: '',
      step: 0.01,
      coarse: 0.1,
      fine: 0.001,
    });
  });

  test('a number with no annotation steps as every lab field did before (0.01)', () => {
    expect(fieldOf(Schema.Finite, FPS)).toMatchObject({ step: 0.01, coarse: 0.1, fine: 0.001 });
  });

  test("no field's fine step is coarser than the 0.01 every field stepped before", () => {
    for (const schema of [CueOffset, CueDur, Pixel, KnobNumber]) {
      expect(fieldOf(schema, FPS).fine).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('nudged', () => {
  test('moves by the step the modifiers pick, to the thousandth', () => {
    const spec = fieldOf(CueOffset, FPS);
    expect(nudged(spec, 0.4, 'normal', 1)).toBe(0.433);
    expect(nudged(spec, 0.4, 'coarse', -1)).toBe(0.067);
    expect(nudged(spec, 0.4, 'fine', 1)).toBe(0.401);
    expect(stepOf(spec, 'fine')).toBe(0.001);
  });

  test('stops at the bounds', () => {
    expect(nudged(fieldOf(CueDur, FPS), 0.02, 'normal', -1)).toBe(0);
  });
});

describe('fieldText and refusalOf', () => {
  test('prints the value with its unit, or bare', () => {
    expect(fieldText(fieldOf(CueOffset, FPS), 0.38)).toBe('0.38 s');
    expect(fieldText(fieldOf(KnobNumber, FPS), 4)).toBe('4');
  });

  test("a read-only schema's why is the refusal, unless the field has its own", () => {
    const computed = Schema.Finite.annotate(inspected({ readOnly: true, why: 'computed' }));
    const field = {
      id: 'end',
      label: 'end',
      spec: fieldOf(computed, FPS),
      value: 1,
      refusal: Option.none<string>(),
      write: () => {},
    };
    expect(refusalOf(field)).toEqual(Option.some('computed'));
    expect(refusalOf({ ...field, refusal: Option.some('no source') })).toEqual(
      Option.some('no source'),
    );
    expect(refusalOf({ ...field, spec: fieldOf(Schema.Finite, FPS) })).toEqual(Option.none());
  });
});
