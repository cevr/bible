// The probe is attached to a context for one draw and detached after it, even
// when the draw throws: the next frame's records must never land in the list
// of a frame that failed. The same holds for `unprobed`, which puts the probe
// back after a draw it hides from the check, and for `probePlate`, which
// marks the lines drawn inside it as on its plate.

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import {
  type Probe,
  probeOf,
  probeHand,
  probePlate,
  probing,
  recordInk,
  recordPlate,
  recordText,
  unprobed,
} from './probe.ts';

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

  test('each record carries the scale of the space it was drawn in', () => {
    const ctx: CanvasRenderingContext2D = Schema.decodeSync(Schema.Any)({
      globalAlpha: 1,
      getTransform: () => ({ a: 0, b: 3, c: -3, d: 0, e: 40, f: 0 }),
    });
    const p = probe();
    recordText(ctx, p, 'turned', 0, 0, 10, 10, 1);
    recordInk(
      ctx,
      p,
      'stroke',
      [
        [0, 0],
        [10, 0],
      ],
      2,
      1,
    );
    expect(p.sink.texts.map((t) => t.scale)).toEqual([3]);
    expect(p.sink.inks.map((m) => [m.scale, m.width])).toEqual([[3, 6]]);
  });

  test('what the caption probe records is tagged as the caption; nothing else is', () => {
    const ctx = drawable();
    const p = probe();
    const voice: Probe = { ...p, caption: true };
    recordText(ctx, p, 'one two three', 0, 0, 100, 40, 1);
    recordPlate(ctx, voice, 0, 900, 400, 60, 0.8);
    recordText(ctx, voice, 'one two three', 0, 900, 400, 60, 0.8);
    expect(p.sink.texts.map((t) => t.caption)).toEqual([undefined, true]);
    expect(p.sink.inks.map((m) => m.caption)).toEqual([true]);
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

describe('probeHand', () => {
  /** A context scaled 2× and moved (100, 50): what the person's units land on. */
  const placed = (): CanvasRenderingContext2D =>
    Schema.decodeSync(Schema.Any)({
      globalAlpha: 0.5,
      getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 }),
    });
  const BODY: ReadonlyArray<readonly [number, number]> = [
    [-30, -120],
    [30, -120],
    [30, 0],
    [-30, 0],
  ];

  test('records each arm on screen: its hand, its shoulder, its grow, and whether its body hides it', () => {
    const ctx = placed();
    const p: Probe = { sink: { texts: [], inks: [], hands: [] }, scene: 'a', dx: 10, alpha: 0.8 };
    let asked = 0;
    const body = () => {
      asked++;
      return [BODY];
    };
    probing(ctx, p, () => {
      probeHand(ctx, {
        side: 'far',
        shoulder: [-17, -111],
        at: [-10, -60],
        grow: 1,
        over: false,
        body,
      });
      probeHand(ctx, {
        side: 'near',
        shoulder: [17, -111],
        at: [80, -60],
        grow: 0.4,
        over: true,
        body,
      });
    });
    expect(p.sink.hands).toEqual([
      {
        scene: 'a',
        side: 'far',
        x: 90,
        y: -70,
        sx: 76,
        sy: -172,
        grow: 1,
        inside: true,
        over: false,
        alpha: 0.4,
      },
      {
        scene: 'a',
        side: 'near',
        x: 270,
        y: -70,
        sx: 144,
        sy: -172,
        grow: 0.4,
        inside: false,
        over: true,
        alpha: 0.4,
      },
    ]);
    expect(asked).toBe(2);
  });

  test('a probe that does not collect hands, or none, records nothing and builds no body', () => {
    const ctx = placed();
    let asked = 0;
    const body = () => {
      asked++;
      return [BODY];
    };
    const hand = {
      side: 'near',
      shoulder: [17, -111],
      at: [0, -60],
      grow: 1,
      over: false,
      body,
    } as const;
    probeHand(ctx, hand);
    const p = probe();
    probing(ctx, p, () => probeHand(ctx, hand));
    expect(p.sink).toEqual({ texts: [], inks: [] });
    expect(asked).toBe(0);
  });
});
