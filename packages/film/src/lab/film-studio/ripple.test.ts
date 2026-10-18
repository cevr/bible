// An edit's ripple on the probe film's timeline before the lab reads it
// again: a beat moved lays the beats end to end in the new order, its Board
// panels, take and scene with it, the act bands and score movements on the
// beats they begin on; a hold grows its beat and pushes every later beat,
// a lead moving the beat's words and marks with it; and the playhead comes
// back to the same moment of the same beat.

import { describe, expect, test } from 'bun:test';
import { Match, Option } from 'effect';
import type { FilmTimeline, Lane } from '../../core/timeline-schema.ts';
import { probeTimeline } from '../fixtures/probe-timeline.ts';
import { anchorOf, anchoredT, rippled, scriptOf } from './ripple.ts';

const sound: Lane = {
  track: 'sound',
  clips: [
    { start: 0, dur: 4.715, state: 'made', clock: 'measured', movement: 'calm', from: 'one' },
    { start: 4.715, dur: 7.6, state: 'made', clock: 'measured', movement: 'rise', from: 'two' },
  ],
};

const lanes: ReadonlyArray<Lane> = [...probeTimeline(2).lanes, sound];
const probe: FilmTimeline = { ...probeTimeline(2), lanes };

/** Each clip of `track` on `t`: its beat (or movement, or panel) and its span. */
const clipsOf = (t: FilmTimeline, track: Lane['track']) =>
  t.lanes
    .filter((l) => l.track === track)
    .flatMap(
      (l): ReadonlyArray<{ readonly name: string; readonly start: number; readonly dur: number }> =>
        l.clips.map((c) => ({
          name: Match.value(c).pipe(
            Match.when({ panel: Match.string }, (p) => p.panel),
            Match.when({ movement: Match.string }, (m) => m.movement),
            Match.when({ beat: Match.string }, (b) => b.beat),
            Match.orElse(() => ''),
          ),
          start: c.start,
          dur: c.dur,
        })),
    );

describe('a beat moved, before the lab reads it again', () => {
  const moved = rippled(probe, { _tag: 'Move', beat: 'three', before: Option.some('two') });

  test('lays the beats end to end in the new order', () => {
    expect(scriptOf(moved).map((b) => [b.beat, b.start])).toEqual([
      ['one', 0],
      ['three', 4.715],
      ['two', 8.77],
    ]);
    expect(moved.duration).toBe(12.315);
  });

  test('moves each clip of a beat with it, and the parts on their beats', () => {
    const scenes = clipsOf(moved, 'scenes').map((c) => [c.name, c.start]);
    expect(scenes).toEqual([
      ['one', 0],
      ['three', 4.715],
      ['two', 8.77],
    ]);
    const board = clipsOf(moved, 'board').find((c) => c.name === 'two.start');
    expect(board?.start).toBe(8.77);
    expect(clipsOf(moved, 'sound').map((c) => [c.start, c.dur])).toEqual([
      [0, 8.77],
      [8.77, 3.545],
    ]);
    expect(moved.bands.map((b) => [b.name, b.start, b.end])).toEqual([
      ['opening', 0, 4.715],
      ['close', 4.715, 12.315],
    ]);
  });
});

describe('a hold set, before the lab reads it again', () => {
  test('a tail grows its beat and pushes every later one', () => {
    const held = rippled(probe, { _tag: 'Hold', beat: 'one', edge: 'tail', from: 0.1, to: 1.1 });
    expect(scriptOf(held).map((b) => [b.beat, b.start, b.dur])).toEqual([
      ['one', 0, 5.715],
      ['two', 5.715, 3.545],
      ['three', 9.26, 4.055],
    ]);
    expect(held.duration).toBe(13.315);
    expect(scriptOf(held)[0]?.hold.tail).toBe(1.1);
  });

  test('a lead moves the beat’s words and marks with it', () => {
    const held = rippled(probe, { _tag: 'Hold', beat: 'one', edge: 'lead', from: 0.5, to: 1.5 });
    expect(scriptOf(held)[0]?.marks.map((m) => m.at)).toEqual([2.2, 3.6]);
    const fall = clipsOf(held, 'board').find((c) => c.name === 'one.fall');
    expect(fall?.start).toBe(3.6);
  });
});

describe('the playhead through an edit', () => {
  test('stays on the same moment of the same beat', () => {
    const anchor = Option.getOrThrow(anchorOf(probe, 9.26));
    const moved = rippled(probe, { _tag: 'Move', beat: 'three', before: Option.some('one') });
    expect(anchoredT(moved, anchor, 9.26)).toBe(1);
    expect(anchoredT(probe, anchor, 1)).toBe(9.26);
  });

  test('follows the words when the lead changes', () => {
    const anchor = Option.getOrThrow(anchorOf(probe, 2.6));
    const held = rippled(probe, { _tag: 'Hold', beat: 'one', edge: 'lead', from: 0.5, to: 1.5 });
    expect(anchoredT(held, anchor, 2.6)).toBe(3.6);
  });
});
