// A code sound's one line, as a list and a review read it: each node by its
// kind and its fields, its child in brackets, its children in square ones.

import { describe, expect, test } from 'bun:test';
import { describeGraph } from './describe.ts';
import type { Node } from './nodes.ts';

const tap: Node = { _tag: 'Sample', sound: 'paper.tap', seed: 2 };

describe('describeGraph', () => {
  test('a chain: each shaper before its child, in brackets', () => {
    const breath: Node = {
      _tag: 'Envelope',
      points: [
        [0, 0],
        [0.2, 1],
        [0.9, 0],
      ],
      curve: 'smooth',
      of: {
        _tag: 'Filter',
        type: 'bandpass',
        hz: { _tag: 'Ramp', from: 400, to: 2200, curve: 'exponential' },
        q: 1.2,
        of: { _tag: 'Noise', color: 'pink', secs: { _tag: 'Vary', min: 0.8, max: 1 } },
      },
    };
    expect(describeGraph(breath)).toBe(
      'Envelope(Filter bandpass 400 Hz→2200 Hz(Noise pink 0.8–1 s))',
    );
  });

  test('a layer and a drive: the children in square brackets, the transfer named', () => {
    const knock: Node = {
      _tag: 'Layer',
      of: [
        { node: { _tag: 'Partials', pitch: 'E5', set: 'glass', secs: 0.4 } },
        {
          node: {
            _tag: 'Gain',
            db: {
              _tag: 'Points',
              points: [
                [0, -60],
                [0.1, 0],
              ],
              curve: 'linear',
            },
            of: {
              _tag: 'Drive',
              db: 6,
              transfer: 'soft',
              of: {
                _tag: 'Osc',
                wave: 'triangle',
                pitch: { _tag: 'Wobble', around: { degree: 2, octave: 4 }, depth: 1 / 3, rate: 5 },
                secs: { _tag: 'Pick', of: [0.5, 1], by: 'seed' },
              },
            },
          },
          at: 0.01,
        },
      ],
    };
    expect(describeGraph(knock)).toBe(
      'Layer[Partials glass E5 0.4 s, Gain -60→0 dB(Drive soft 6 dB(Osc triangle degree 2/4±0.333 {0.5|1} s))]',
    );
  });

  test('a layer of its own length: its seconds before its children', () => {
    const cut: Node = {
      _tag: 'Layer',
      secs: 1.5,
      of: [{ node: tap }, { node: { _tag: 'Noise', color: 'brown', secs: 2 }, at: 0.5 }],
    };
    expect(describeGraph(cut)).toBe('Layer 1.5 s[Sample paper.tap #2, Noise brown 2 s]');
  });

  test('a sequence of repeats: each timing by its count, its span or its rate', () => {
    const steps: Node = {
      _tag: 'Sequence',
      of: [
        { _tag: 'Repeat', timing: { _tag: 'Count', every: 0.25, count: 4 }, of: tap },
        { _tag: 'Repeat', timing: { _tag: 'During', every: 0.5, secs: 2 }, of: tap },
        {
          _tag: 'Repeat',
          timing: { _tag: 'Poisson', rate: 3, secs: { _tag: 'Vary', min: 1, max: 2 } },
          of: { _tag: 'Crush', of: tap },
        },
      ],
      gap: 0.1,
    };
    expect(describeGraph(steps)).toBe(
      'Sequence[Repeat ×4 every 0.25 s(Sample paper.tap #2), Repeat every 0.5 s for 2 s(Sample paper.tap #2), Repeat 3/s for 1–2 s(Crush(Sample paper.tap #2))]',
    );
  });
});
