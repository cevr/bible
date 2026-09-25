import { describe, expect, test } from 'bun:test';
import { layout } from './layout.ts';
import type { Timings } from './schema.ts';

/** No recorded takes: every scene is estimated. */
const noTakes: Timings = { voice: '', scenes: {} };
import { type SceneClock, resolveTimeline } from './timeline.ts';

const clock: SceneClock = {
  scene: 'justified',
  marks: new Map([
    ['fiction', 2],
    ['as', 5],
  ]),
  speechStart: 0.5,
  speechEnd: 8.5,
  dur: 9.4,
};

describe('timeline', () => {
  test('a mark anchor starts at the mark, scene-local, plus its offset', () => {
    const cues = resolveTimeline({ slam: { mark: 'fiction', offset: 0.9, dur: 0.35 } }, clock);
    expect(cues.get('slam')).toEqual({
      start: 0.5 + 2 + 0.9,
      end: 0.5 + 2 + 0.9 + 0.35,
      dur: 0.35,
    });
  });

  test('`after` chains from the end of a cue, `with` from its start, in any declared order', () => {
    const cues = resolveTimeline(
      {
        no: { with: 'strike', offset: 0.3, dur: 0.6 },
        strike: { after: 'ask', offset: -0.2, dur: 0.5 },
        ask: { after: 'slam', offset: 0.85, dur: 1 },
        slam: { mark: 'fiction', dur: 0.35 },
      },
      clock,
    );
    const at = (n: string) => cues.get(n)?.start ?? NaN;
    expect(at('ask')).toBeCloseTo(2.5 + 0.35 + 0.85);
    expect(at('strike')).toBeCloseTo(at('ask') + 1 - 0.2);
    expect(at('no')).toBeCloseTo(at('strike') + 0.3);
    expect(cues.get('no')?.end).toBeCloseTo(at('no') + 0.6);
  });

  test('scene anchors read the scene landmarks; an instant has no length', () => {
    const cues = resolveTimeline(
      {
        open: { scene: 'start', offset: 0.1 },
        voice: { scene: 'speech' },
        hush: { scene: 'speechEnd', offset: 0.2 },
        close: { scene: 'end', offset: -1, dur: 1 },
      },
      clock,
    );
    expect(cues.get('open')).toEqual({ start: 0.1, end: 0.1, dur: 0 });
    expect(cues.get('voice')?.start).toBe(0.5);
    expect(cues.get('hush')?.start).toBeCloseTo(8.7);
    expect(cues.get('close')?.end).toBeCloseTo(9.4);
  });

  test('an unknown mark names the scene and the cue', () => {
    expect(() => resolveTimeline({ slam: { mark: 'nope' } }, clock)).toThrow(
      'scene justified: cue "slam" names unknown mark {nope}',
    );
  });

  test('an unknown cue names the scene and the cue that refers to it', () => {
    expect(() => resolveTimeline({ ask: { after: 'slam' } }, clock)).toThrow(
      'scene justified: cue "ask" refers to unknown cue "slam"',
    );
  });

  test('a cycle is an authoring error', () => {
    expect(() =>
      resolveTimeline({ a: { after: 'b' }, b: { with: 'c' }, c: { after: 'a' } }, clock),
    ).toThrow('scene justified: cue "a" is part of a cycle (a → b → c → a)');
  });

  test('layout resolves each scene’s cues once, against its own voice', () => {
    const [a] = layout(
      [{ id: 'a', say: 'Look {live}and live.', lead: 0.5, timeline: { lift: { mark: 'live' } } }],
      noTakes,
    );
    expect(a?.cues.get('lift')?.start).toBe(0.5 + (a?.voice.marks.get('live') ?? NaN));
  });
});
