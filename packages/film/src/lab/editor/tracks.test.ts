// The strip's tracks: cues grouped by the track their spans name, in the
// order written; a cue naming none its own track; overlapping cues of one
// track stacked; each cue's words; the marks as labels in time order.

import { describe, expect, test } from 'bun:test';
import type { ResolvedCue, Timeline } from '../../core/schema.ts';
import { blockWords, countText, heldLanes, labelsOf, stripOrder, tracksOf } from './tracks.ts';

const at = (start: number, dur: number): ResolvedCue => ({
  start,
  end: start + dur,
  dur,
  ease: 'inOutCubic',
  stagger: 0,
});

/** The court's cues, each on the track of whoever moves. */
const COURT: Timeline = {
  build: { at: 'speech', until: 'evidence', track: 'room' },
  drop: { mark: 'evidence', dur: 1.4, track: 'evidence' },
  bow: { mark: 'did', dur: 0.35, track: 'accused' },
  lean: { mark: 'judge', dur: 0.4, track: 'judge' },
  gavel: { mark: 'righteous', offset: -0.37, dur: 0.59, track: 'judge' },
  stamp: { mark: 'righteous', offset: -0.03, dur: 0.2, track: 'judge' },
  lift: { mark: 'righteous', offset: 0.1, dur: 0.37, track: 'accused' },
};
const COURT_CUES = new Map<string, ResolvedCue>([
  ['build', at(0.2, 2.4)],
  ['drop', at(2.6, 1.4)],
  ['bow', at(4.5, 0.35)],
  ['lean', at(5.8, 0.4)],
  ['gavel', at(7.3, 0.59)],
  ['stamp', at(7.64, 0.2)],
  ['lift', at(7.77, 0.37)],
]);

const rowsOf = (timeline: Timeline, cues: ReadonlyMap<string, ResolvedCue>) =>
  tracksOf(timeline, cues).map((t) => [t.name, t.named, t.lanes.map((l) => l.map((b) => b.name))]);

describe('tracks', () => {
  test('a track per actor, in the order its first cue is written; its cues on one row while none overlap', () => {
    expect(rowsOf(COURT, COURT_CUES)).toStrictEqual([
      ['room', true, [['build']]],
      ['evidence', true, [['drop']]],
      ['accused', true, [['bow', 'lift']]],
      // The stamp starts inside the gavel's fall: it stacks under it.
      ['judge', true, [['lean', 'gavel'], ['stamp']]],
    ]);
  });

  test('a cue naming no track is its own, named by itself: a scene naming none is one cue to a row', () => {
    const timeline: Timeline = { rise: { at: 'start', dur: 1 }, fall: { after: 'rise', dur: 1 } };
    const cues = new Map([
      ['fall', at(1, 1)],
      ['rise', at(0, 1)],
    ]);
    expect(rowsOf(timeline, cues)).toStrictEqual([
      ['rise', false, [['rise']]],
      ['fall', false, [['fall']]],
    ]);
  });

  test('cues that touch share a lane; an instant on another cue’s start does not hide under it', () => {
    const timeline: Timeline = {
      a: { at: 'start', dur: 1, track: 't' },
      b: { after: 'a', dur: 1, track: 't' },
      tick: { with: 'b', track: 't' },
    };
    const cues = new Map([
      ['a', at(0, 1)],
      ['b', at(1, 1)],
      ['tick', at(1, 0)],
    ]);
    expect(rowsOf(timeline, cues)).toStrictEqual([['t', true, [['a', 'tick'], ['b']]]]);
  });

  test('a cue the clock did not resolve is left out, and a track of none with it', () => {
    expect(rowsOf({ gone: { at: 'start', dur: 1, track: 't' } }, new Map())).toStrictEqual([]);
  });

  test('the strip’s order is track by track, lane by lane', () => {
    expect(stripOrder(tracksOf(COURT, COURT_CUES))).toStrictEqual([
      'build',
      'drop',
      'bow',
      'lift',
      'lean',
      'gavel',
      'stamp',
    ]);
  });

  test('a cue’s words: its length, what it runs until, or that it holds to the end', () => {
    expect(blockWords('bow', { mark: 'did', dur: 0.35 }, at(0, 0.35))).toBe('bow 0.35 s');
    expect(blockWords('tap', { mark: 'did' }, at(0, 0))).toBe('tap');
    expect(blockWords('build', { at: 'speech', until: 'evidence' }, at(0, 2))).toBe(
      'build until {evidence}',
    );
    expect(blockWords('card', { mark: 'job', until: { at: 'end' } }, at(0, 2))).toBe(
      'card · holds to end',
    );
    expect(blockWords('rest', { at: 'start', until: { at: 'speechEnd' } }, at(0, 2))).toBe(
      'rest until speechEnd',
    );
    expect(
      blockWords('sweep', { at: 'speech', until: { cue: 'flood', edge: 'start' } }, at(0, 2)),
    ).toBe('sweep until flood’s start');
    expect(blockWords('tail', { at: 'speech', until: { cue: 'flood' } }, at(0, 2))).toBe(
      'tail until flood’s end',
    );
  });

  test('an end off its point says by how much, and one off the scene’s end no longer holds to it', () => {
    expect(blockWords('near', { mark: 'near', until: 'held', untilOffset: 0.2 }, at(0, 2))).toBe(
      'near until {held} +0.20 s',
    );
    expect(
      blockWords('card', { mark: 'job', until: { at: 'end' }, untilOffset: -1 }, at(0, 2)),
    ).toBe('card until end −1.00 s');
  });

  test('a cue named as another’s track keeps its own row: the two never merge', () => {
    const timeline: Timeline = {
      judge: { at: 'start', dur: 1 },
      lean: { after: 'judge', dur: 1, track: 'judge' },
    };
    const cues = new Map([
      ['judge', at(0, 1)],
      ['lean', at(1, 1)],
    ]);
    expect(rowsOf(timeline, cues)).toStrictEqual([
      ['judge', false, [['judge']]],
      ['judge', true, [['lean']]],
    ]);
  });

  test('while a cue is held its bar keeps the lane it was pressed on; let go, it stacks', () => {
    const timeline: Timeline = {
      a: { at: 'start', dur: 1, track: 't' },
      b: { at: 'start', offset: 2, dur: 1, track: 't' },
    };
    const before = tracksOf(
      timeline,
      new Map([
        ['a', at(0, 1)],
        ['b', at(2, 1)],
      ]),
    );
    // The drag takes b over a.
    const dragged = tracksOf(
      timeline,
      new Map([
        ['a', at(0, 1)],
        ['b', at(0.5, 1)],
      ]),
    );
    const lanes = (tracks: ReturnType<typeof tracksOf>) =>
      tracks.map((t) => t.lanes.map((l) => l.map((b) => [b.name, b.cue.start])));
    expect(lanes(dragged)).toStrictEqual([[[['a', 0]], [['b', 0.5]]]]);
    expect(lanes(heldLanes(before, dragged))).toStrictEqual([
      [
        [
          ['a', 0],
          ['b', 0.5],
        ],
      ],
    ]);
    // A track whose cues changed takes the new lanes.
    const grown = tracksOf(
      { ...timeline, c: { at: 'start', dur: 1, track: 't' } },
      new Map([
        ['a', at(0, 1)],
        ['b', at(0.5, 1)],
        ['c', at(0, 1)],
      ]),
    );
    expect(heldLanes(before, grown)).toStrictEqual(grown);
  });

  test('the marks are labels at their scene seconds, in time order', () => {
    expect(
      labelsOf(
        0.5,
        new Map([
          ['judge', 5],
          ['evidence', 2],
        ]),
      ),
    ).toStrictEqual([
      { name: 'evidence', t: 2.5 },
      { name: 'judge', t: 5.5 },
    ]);
  });

  test('the count names tracks, marks and cues, one of each singular', () => {
    expect(countText(tracksOf(COURT, COURT_CUES), 6)).toBe('4 tracks · 6 marks · 7 cues');
    expect(countText(tracksOf({ a: { at: 'start' } }, new Map([['a', at(0, 0)]])), 1)).toBe(
      '1 track · 1 mark · 1 cue',
    );
  });
});
