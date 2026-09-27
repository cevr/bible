import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { layout } from './layout.ts';
import type { Music, Timings } from './schema.ts';

/** No recorded takes: every scene is estimated. */
const noTakes: Timings = { voice: '', scenes: {} };
import { cueTime, effectKey, filmEnd, musicKey, musicPlan } from './sound.ts';

/** The failure's tag, or `ok`. */
const outcome = <A, E extends { readonly _tag: string }>(r: Result.Result<A, E>) =>
  Result.match(r, { onSuccess: () => 'ok', onFailure: (e) => e._tag });

const placed = layout(
  [
    { id: 'a', say: 'Look {live}and live.', lead: 0.5, tail: 1 },
    { id: 'b', min: 4 },
    { id: 'c', min: 5 },
  ],
  noTakes,
);

/** Scene `a`'s timeline fires `lift` 1.7 s into the scene, as its warp plays it. */
const events = new Map([['a', new Map([['lift', 1.7]])]]);

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
    expect(
      Result.getOrThrow(cueTime({ scene: 'a', mark: 'live', offset: 0.25 }, placed, events)),
    ).toBeCloseTo(0.5 + live + 0.25);
    expect(Result.getOrThrow(cueTime({ scene: 'c' }, placed, events))).toBe(
      placed[2]?.start ?? NaN,
    );
  });

  test('an event cue lands where the scene plays the Event, plus its offset', () => {
    const start = placed[0]?.start ?? NaN;
    expect(Result.getOrThrow(cueTime({ scene: 'a', event: 'lift' }, placed, events))).toBe(
      start + 1.7,
    );
    expect(
      Result.getOrThrow(cueTime({ scene: 'a', event: 'lift', offset: 0.1 }, placed, events)),
    ).toBeCloseTo(start + 1.8);
  });

  test('an unknown scene, mark or Event is an authoring error', () => {
    expect(outcome(cueTime({ scene: 'z' }, placed, events))).toBe('UnknownScene');
    expect(outcome(cueTime({ scene: 'a', mark: 'nope' }, placed, events))).toBe('UnknownMark');
    expect(outcome(cueTime({ scene: 'a', event: 'nope' }, placed, events))).toBe('UnknownEvent');
    expect(outcome(cueTime({ scene: 'b', event: 'lift' }, placed, events))).toBe('UnknownEvent');
    expect(outcome(cueTime({ scene: 'a', event: 'lift', mark: 'live' }, placed, events))).toBe(
      'CueInvalid',
    );
  });

  test('acts cover the whole film, split at their scenes', () => {
    const plan = Result.getOrThrow(musicPlan(music, placed));
    const ms = plan.chunks.map((c) => c.duration_ms);
    expect(ms.reduce((x, y) => x + y, 0)).toBe(Math.round(filmEnd(placed) * 1000));
    expect(ms[0]).toBe(Math.round((placed[2]?.start ?? 0) * 1000));
  });

  test('every act carries the film-wide styles ahead of its own', () => {
    const [open] = Result.getOrThrow(musicPlan(music, placed)).chunks;
    expect(open?.positive_styles).toEqual(['piano', 'sparse']);
    expect(open?.negative_styles).toEqual(['vocals']);
    expect(open?.text).toBe('[Open]');
  });

  test('acts out of film order are refused', () => {
    const backwards = { ...music, acts: [...music.acts].reverse() };
    expect(outcome(musicPlan(backwards, placed))).toBe('ActTooShort');
  });

  test('keys change with the request, not with the gain', () => {
    const plan = Result.getOrThrow(musicPlan(music, placed));
    expect(musicKey({ ...music, gain: 0.9 }, plan)).toBe(musicKey(music, plan));
    expect(musicKey({ ...music, model: 'music_v2' }, plan)).not.toBe(musicKey(music, plan));
    const e = { prompt: 'paper', secs: 1, at: [] };
    expect(effectKey({ ...e, gain: 0.1 })).toBe(effectKey(e));
    expect(effectKey({ ...e, secs: 2 })).not.toBe(effectKey(e));
  });
});
