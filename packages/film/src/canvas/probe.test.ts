// The probe is attached to a context for one draw and detached after it, even
// when the draw throws: the next frame's records must never land in the list
// of a frame that failed. The same holds for `unprobed`, which puts the probe
// back after a draw it hides from the check, and for `probePlate`, which
// marks the lines drawn inside it as on its plate.

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { type Probe, probeOf, probePlate, probing, recordText, unprobed } from './probe.ts';

/**
 * A stand-in context (bun has no canvas): attaching and detaching a probe only
 * keys a WeakMap by it, and no draw here touches it.
 */
const context = (): CanvasRenderingContext2D => Schema.decodeSync(Schema.Any)({});

/** A stand-in context the probe can read: an identity transform, full opacity. */
const drawable = (): CanvasRenderingContext2D =>
  Schema.decodeSync(Schema.Any)({
    globalAlpha: 1,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  });

const probe = (): Probe => ({ sink: { texts: [], inks: [] }, scene: 'a', dx: 0, alpha: 1 });

const boom = () => {
  throw new Error('the draw failed');
};

describe('probe', () => {
  test('a draw that throws while probed still detaches the probe', () => {
    const ctx = context();
    expect(() => probing(ctx, probe(), boom)).toThrow('the draw failed');
    expect(probeOf(ctx)).toBeUndefined();
  });

  test('a draw that throws inside unprobed puts the probe back', () => {
    const ctx = context();
    const p = probe();
    probing(ctx, p, () => {
      expect(() => unprobed(ctx, boom)).toThrow('the draw failed');
      expect(probeOf(ctx)).toBe(p);
    });
  });

  test('probePlate marks the lines drawn inside it as on its plate, and names it by them', () => {
    const ctx = drawable();
    const p = probe();
    const card: ReadonlyArray<readonly [number, number]> = [
      [-310, -165],
      [310, -165],
      [310, 165],
      [-310, 165],
    ];
    probing(ctx, p, () => {
      probePlate(ctx, card, () => {
        recordText(ctx, probeOf(ctx)!, 'Justify', -150, -120, 300, 70, 1);
        recordText(ctx, probeOf(ctx)!, 'declared righteous', -250, 40, 500, 60, 1);
      });
      recordText(ctx, probeOf(ctx)!, 'elsewhere', 0, 0, 100, 40, 1);
    });
    const [plate, ...lines] = p.sink.texts;
    expect(p.sink.inks.map((i) => i.kind)).toEqual(['plate']);
    expect(plate).toMatchObject({ text: 'Justify / declared righteous', x: -310, w: 620, h: 330 });
    expect(lines.map((l) => [l.text, l.on])).toEqual([
      ['Justify', plate?.order],
      ['declared righteous', plate?.order],
      ['elsewhere', undefined],
    ]);
  });

  test('a draw that throws inside probePlate puts the probe back', () => {
    const ctx = drawable();
    const p = probe();
    probing(ctx, p, () => {
      expect(() =>
        probePlate(
          ctx,
          [
            [0, 0],
            [10, 10],
          ],
          boom,
        ),
      ).toThrow('the draw failed');
      expect(probeOf(ctx)).toBe(p);
    });
  });
});
