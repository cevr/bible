// The probe is attached to a context for one draw and detached after it, even
// when the draw throws: the next frame's records must never land in the list
// of a frame that failed. The same holds for `unprobed`, which puts the probe
// back after a draw it hides from the check.

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { type Probe, probeOf, probing, unprobed } from './probe.ts';

/**
 * A stand-in context (bun has no canvas): attaching and detaching a probe only
 * keys a WeakMap by it, and no draw here touches it.
 */
const context = (): CanvasRenderingContext2D => Schema.decodeSync(Schema.Any)({});

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
});
