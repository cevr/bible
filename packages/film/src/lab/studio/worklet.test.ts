// The worklet processor as its source runs, off the audio thread: loaded
// against a stand-in worklet scope, it registers under PROCESSOR, posts each
// full block of the input's first channel untouched with its peak and RMS,
// and on a message from the page flushes the part-block it holds as `last`.
// The capture asks for no processing, so none happens here either.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { PROCESSOR, type WorkletBlock, workletSource } from './worklet.ts';

interface Processor {
  readonly process: (inputs: ReadonlyArray<ReadonlyArray<Float32Array>>) => boolean;
}

/** The processor the source registers, run against a stand-in scope, and its port. */
const load = () => {
  const port = { posted: [] as Array<WorkletBlock>, handler: Option.none<() => void>() };
  class Base {
    readonly port = {
      postMessage: (block: WorkletBlock) => void port.posted.push(block),
      set onmessage(f: () => void) {
        port.handler = Option.some(f);
      },
    };
  }
  const registered: Array<{ name: string; ctor: new () => Processor }> = [];
  const run = new Function('AudioWorkletProcessor', 'registerProcessor', workletSource);
  run(Base, (name: string, ctor: new () => Processor) => registered.push({ name, ctor }));
  return { registered, port };
};

/** An instance of the processor the source registered first. */
const spawn = (registered: ReadonlyArray<{ readonly ctor: new () => Processor }>): Processor => {
  const Ctor = Option.getOrThrow(Option.fromUndefinedOr(registered[0])).ctor;
  return new Ctor();
};

const ramp = (n: number, from: number) =>
  Float32Array.from({ length: n }, (_, i) => (from + i) / 4096);

describe('the capture worklet', () => {
  test('registers under PROCESSOR', () => {
    expect(load().registered.map((r) => r.name)).toEqual([PROCESSOR]);
  });

  test('posts each full block of the first channel untouched, with its peak and RMS', () => {
    const { registered, port } = load();

    const processor = spawn(registered);
    const first = ramp(128, 0);
    for (let i = 0; i < 10; i++) processor.process([[ramp(128, i * 128)], [ramp(128, 999)]]);
    expect(port.posted.length).toBe(1);
    const block = port.posted[0];
    expect(block?.samples.length).toBe(1024);
    expect([...(block?.samples.subarray(0, 128) ?? [])]).toEqual([...first]);
    expect(block?.peak).toBeCloseTo(1023 / 4096, 6);
    const expectedRms = Math.sqrt(ramp(1024, 0).reduce((s, x) => s + x * x, 0) / 1024);
    expect(block?.rms).toBeCloseTo(expectedRms, 6);
    expect(block?.last).toBe(false);
  });

  test('a message from the page flushes the part-block it holds, as the last', () => {
    const { registered, port } = load();

    const processor = spawn(registered);
    processor.process([[ramp(300, 0)]]);
    Option.map(port.handler, (flush) => flush());
    expect(port.posted.map((b) => [b.samples.length, b.last])).toEqual([[300, true]]);
  });

  test('an input with no channel keeps the processor alive and posts nothing', () => {
    const { registered, port } = load();

    const processor = spawn(registered);
    expect(processor.process([[]])).toBe(true);
    expect(processor.process([])).toBe(true);
    expect(port.posted).toEqual([]);
  });
});
