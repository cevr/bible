// One report for every leg: each finding levelled by `levelOf` and addressed
// by `addressOf` (its scene and film second), as `check --json` prints it.

import { describe, expect, test } from 'bun:test';
import { UnknownScene } from '../core/errors.ts';
import { AudioStale } from './errors.ts';
import {
  DeadAir,
  EffectHot,
  HandJump,
  SeamLong,
  ShortLength,
  TakeStale,
  TextOverlap,
  addressOf,
  lineOf,
  report,
} from './findings.ts';

const overlap = TextOverlap.make({
  scene: 'roof',
  time: 12.5,
  at: 'mark go',
  a: 'one',
  b: 'two',
  area: 40,
  frames: 1,
});
const dead = DeadAir.make({ from: 463.85, to: 466.35, floor: -60, max: 1.5 });
const hot = EffectHot.make({ effect: 'thud', scene: 'fall', at: 30.2, over: 1 });
const seam = SeamLong.make({ from: 'a', to: 'b', seam: 1.2, max: 0.6 });
const stale = TakeStale.make({ scene: 'roof', reason: 'text changed', recorded: true });
const master = AudioStale.make({
  file: 'full.wav',
  reason: 'mixed for another plan',
  length: 10,
  film: 10,
});

describe('addressOf', () => {
  test('a finding in a frame or a span keeps its scene and film second', () => {
    expect(addressOf(overlap)).toEqual({ scene: 'roof', time: 12.5 });
    expect(addressOf(hot)).toEqual({ scene: 'fall', time: 30.2 });
    expect(
      addressOf(
        HandJump.make({ scene: 'roof', side: 'far', T: 4, what: 'place', by: 1, max: 0.5 }),
      ),
    ).toEqual({ scene: 'roof', time: 4 });
  });

  test('dead air has a time and no scene; a seam is at the scene it runs into', () => {
    expect(addressOf(dead)).toEqual({ time: 463.85 });
    expect(addressOf(seam)).toEqual({ scene: 'b' });
    expect(addressOf(stale)).toEqual({ scene: 'roof' });
  });

  test('a finding about the whole film, a short or a scene the film lacks has no address', () => {
    expect(addressOf(master)).toEqual({});
    expect(addressOf(UnknownScene.make({ scene: 'nope', known: ['roof'] }))).toEqual({});
    expect(
      addressOf(ShortLength.make({ short: 's', length: 95, max: 90, from: 45, to: 75 })),
    ).toEqual({});
  });
});

describe('report', () => {
  test('levels every finding, counts each level, and keeps the order found', () => {
    const found = report([overlap, dead, hot, seam, stale], { allowStale: true });
    expect(found.findings.map((r) => [r.level, r.finding._tag])).toEqual([
      ['error', 'TextOverlap'],
      ['error', 'DeadAir'],
      ['warning', 'EffectHot'],
      ['warning', 'SeamLong'],
      ['warning', 'TakeStale'],
    ]);
    expect([found.errors, found.warnings]).toEqual([2, 3]);
    expect(report([stale, master], { allowStale: false }).errors).toBe(2);
  });

  test('a line carries its address, and none when the finding has none', () => {
    const [deadLine, masterLine] = report([dead, master], { allowStale: false }).findings.map(
      lineOf,
    );
    expect(deadLine).toEqual({
      level: 'error',
      tag: 'DeadAir',
      message: dead.message,
      address: { time: 463.85 },
    });
    expect(masterLine).toEqual({ level: 'error', tag: 'AudioStale', message: master.message });
  });
});
