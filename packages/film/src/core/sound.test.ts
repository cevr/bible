import { describe, expect, test } from 'bun:test';
import { layout } from './layout.ts';
import type { Music } from './schema.ts';
import { cueTime, effectKey, filmEnd, musicKey, musicPlan } from './sound.ts';

const draw = () => {};
const placed = layout(
  [
    {
      id: 'a',
      say: 'Look {live}and live.',
      lead: 0.5,
      tail: 1,
      timeline: { lift: { mark: 'live', offset: 0.2, dur: 0.6 } },
      draw,
    },
    { id: 'b', min: 4, draw },
    { id: 'c', min: 5, draw },
  ],
  undefined,
);

const music: Music = {
  model: 'music_v2_5',
  styles: ['piano'],
  avoid: ['vocals'],
  gain: 0.2,
  acts: [
    { from: 'a', name: 'Open', styles: ['sparse'] },
    { from: 'c', name: 'Close', styles: ['warm'] },
  ],
};

describe('sound', () => {
  test('a cue lands on its mark, after the scene lead, plus its offset', () => {
    const a = placed[0];
    const live = a?.voice.marks.get('live') ?? NaN;
    expect(cueTime({ scene: 'a', mark: 'live', offset: 0.25 }, placed)).toBeCloseTo(
      0.5 + live + 0.25,
    );
    expect(cueTime({ scene: 'c' }, placed)).toBe(placed[2]?.start ?? NaN);
  });

  test('a named cue lands on the start or end of the cue the picture reads', () => {
    const lift = placed[0]?.cues.get('lift');
    const start = lift?.start ?? NaN;
    expect(cueTime({ scene: 'a', cue: 'lift' }, placed)).toBe(start);
    expect(cueTime({ scene: 'a', cue: 'lift', edge: 'end' }, placed)).toBeCloseTo(start + 0.6);
    expect(cueTime({ scene: 'a', cue: 'lift', offset: 0.1 }, placed)).toBeCloseTo(start + 0.1);
  });

  test('an unknown scene, mark or cue is an authoring error', () => {
    expect(() => cueTime({ scene: 'z' }, placed)).toThrow('no scene');
    expect(() => cueTime({ scene: 'a', mark: 'nope' }, placed)).toThrow('no mark');
    expect(() => cueTime({ scene: 'a', cue: 'nope' }, placed)).toThrow(
      'scene "a" has no cue "nope"',
    );
    expect(() => cueTime({ scene: 'a', cue: 'lift', mark: 'live' }, placed)).toThrow('both');
    expect(() => cueTime({ scene: 'a', mark: 'live', edge: 'end' }, placed)).toThrow('edge');
  });

  test('acts cover the whole film, split at their scenes', () => {
    const plan = musicPlan(music, placed);
    const ms = plan.chunks.map((c) => c.duration_ms);
    expect(ms.reduce((x, y) => x + y, 0)).toBe(Math.round(filmEnd(placed) * 1000));
    expect(ms[0]).toBe(Math.round((placed[2]?.start ?? 0) * 1000));
  });

  test('every act carries the film-wide styles ahead of its own', () => {
    const [open] = musicPlan(music, placed).chunks;
    expect(open?.positive_styles).toEqual(['piano', 'sparse']);
    expect(open?.negative_styles).toEqual(['vocals']);
    expect(open?.text).toBe('[Open]');
  });

  test('acts out of film order are refused', () => {
    const backwards = { ...music, acts: [...music.acts].reverse() };
    expect(() => musicPlan(backwards, placed)).toThrow('film order');
  });

  test('keys change with the request, not with the gain', () => {
    const plan = musicPlan(music, placed);
    expect(musicKey({ ...music, gain: 0.9 }, plan)).toBe(musicKey(music, plan));
    expect(musicKey({ ...music, model: 'music_v2' }, plan)).not.toBe(musicKey(music, plan));
    const e = { prompt: 'paper', secs: 1, at: [] };
    expect(effectKey({ ...e, gain: 0.1 })).toBe(effectKey(e));
    expect(effectKey({ ...e, secs: 2 })).not.toBe(effectKey(e));
  });
});
