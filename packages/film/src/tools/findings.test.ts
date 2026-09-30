// One report for every leg: each finding levelled by `levelOf` and addressed
// by `addressOf` (its part of the film and film second), as `check --json`
// prints it.

import { describe, expect, test } from 'bun:test';
import { type Address, sceneAddress as scene } from '../core/address.ts';
import { UnknownScene } from '../core/errors.ts';
import { AudioStale } from './errors.ts';
import {
  ColourScript,
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

const film: Address = { _tag: 'Film' };

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
    expect(addressOf(overlap)).toEqual({ part: scene('roof'), time: 12.5 });
    expect(addressOf(hot)).toEqual({ part: scene('fall'), time: 30.2 });
    expect(
      addressOf(
        HandJump.make({ scene: 'roof', side: 'far', T: 4, what: 'place', by: 1, max: 0.5 }),
      ),
    ).toEqual({ part: scene('roof'), time: 4 });
  });

  test("dead air is the film's at a time; a seam is at the scene it runs into", () => {
    expect(addressOf(dead)).toEqual({ part: film, time: 463.85 });
    expect(addressOf(seam)).toEqual({ part: scene('b') });
    expect(addressOf(stale)).toEqual({ part: scene('roof') });
  });

  test("a colour script is its act's, a short's finding its short's, with no film second", () => {
    expect(
      addressOf(ColourScript.make({ act: 'valley', measure: 'luma', value: 80, low: 0, high: 50 })),
    ).toEqual({ part: { _tag: 'Act', act: 'valley' } });
    expect(
      addressOf(ShortLength.make({ short: 's', length: 95, max: 90, from: 45, to: 75 })),
    ).toEqual({ part: { _tag: 'Short', id: 's' } });
  });

  test("a finding about the whole film or a scene the film lacks is the film's", () => {
    expect(addressOf(master)).toEqual({ part: film });
    expect(addressOf(UnknownScene.make({ scene: 'nope', known: ['roof'] }))).toEqual({
      part: film,
    });
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

  test("a line carries its address, the film's when the finding is about the whole", () => {
    const [deadLine, masterLine] = report([dead, master], { allowStale: false }).findings.map(
      lineOf,
    );
    expect(deadLine).toEqual({
      level: 'error',
      tag: 'DeadAir',
      message: dead.message,
      address: { part: film, time: 463.85 },
    });
    expect(masterLine).toEqual({
      level: 'error',
      tag: 'AudioStale',
      message: master.message,
      address: { part: film },
    });
  });
});
