// An edit's ripple on the probe film's timeline before the lab reads it
// again: a beat moved lays the beats end to end in the new order, its Board
// panels, take and scene with it, the act bands and score movements on the
// beats they begin on; a hold grows its beat and pushes every later beat,
// a lead moving the beat's words and marks with it; and the playhead comes
// back to the same moment of the same beat. A hold's preview lays its beat
// as the layout itself would once the hold is written: a silent beat and a
// beat its `min` holds keep their length.

import { describe, expect, test } from 'bun:test';
import { Match, Option, Result } from 'effect';
import { filmClock } from '../../core/film-timeline.ts';
import { layout } from '../../core/layout.ts';
import type { Timed } from '../../core/schema.ts';
import { onTheMs } from '../../core/time.ts';
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

describe('a hold laid by the layout’s own rule', () => {
  // RBF's shape: a voiced beat, a silent title, and a thesis its `min` holds at 28 s.
  const specs: ReadonlyArray<Timed> = [
    { id: 'cold', say: 'one two three four five six' },
    { id: 'title' },
    { id: 'thesis', say: 'seven eight', min: 28 },
  ];
  /** The probe's timeline with `scenes` laid out as its script lane. */
  const laidOut = (scenes: ReadonlyArray<Timed>): FilmTimeline => {
    const placed = Result.getOrThrow(layout(scenes, { voice: '', scenes: {} }));
    const clock = Result.getOrThrow(
      filmClock(placed, { acts: [], movements: [], drawn: () => true }),
    );
    const clips = clock.beats.map((b) => ({
      start: b.start,
      dur: b.dur,
      state: 'made' as const,
      clock: 'estimated' as const,
      beat: b.id,
      ...Option.match(Option.fromUndefinedOr(b.speech), {
        onNone: () => ({}),
        onSome: (speech) => ({ speech }),
      }),
      marks: b.marks,
      hold: b.hold,
    }));
    return {
      ...probe,
      duration: placed.reduce((at, p) => at + p.dur, 0),
      bands: [],
      markers: [],
      lanes: [{ track: 'script', clips }],
    };
  };
  /** Each beat as `t` lays it, on the millisecond: its span, and where its words are heard. */
  const beats = (t: FilmTimeline) =>
    scriptOf(t).map((b) => [
      b.beat,
      ...[b.start, b.dur, b.speech?.start ?? -1, b.speech?.end ?? -1].map(onTheMs),
    ]);
  const shown = laidOut(specs);
  const hold = (beat: string, edge: 'lead' | 'tail', to: number) =>
    Option.match(Option.fromUndefinedOr(scriptOf(shown).find((b) => b.beat === beat)), {
      onNone: () => shown,
      onSome: (b) => rippled(shown, { _tag: 'Hold', beat, edge, from: b.hold[edge], to }),
    });
  const written = (beat: string, edge: 'lead' | 'tail', to: number) =>
    laidOut(
      specs.map((s) =>
        Option.match(
          Option.liftPredicate(s, (x) => x.id === beat),
          {
            onNone: () => s,
            onSome: (x) => ({ ...x, [edge]: to }),
          },
        ),
      ),
    );

  test('a silent beat keeps its length', () => {
    expect(beats(hold('title', 'tail', 5))).toEqual(beats(written('title', 'tail', 5)));
    expect(beats(hold('title', 'tail', 5))).toEqual(beats(shown));
  });

  test('a tail its min absorbs changes nothing; past it the beat grows as the layout lays it', () => {
    expect(beats(hold('thesis', 'tail', 1))).toEqual(beats(written('thesis', 'tail', 1)));
    expect(beats(hold('thesis', 'tail', 1))).toEqual(beats(shown));
    expect(beats(hold('thesis', 'tail', 29))).toEqual(beats(written('thesis', 'tail', 29)));
  });

  test('a lead moves the words inside the length its min holds', () => {
    expect(beats(hold('thesis', 'lead', 2))).toEqual(beats(written('thesis', 'lead', 2)));
    expect(beats(hold('cold', 'lead', 2))).toEqual(beats(written('cold', 'lead', 2)));
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
