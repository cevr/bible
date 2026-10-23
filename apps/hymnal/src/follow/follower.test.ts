import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { followerOf, type Host, LEAD, type Report } from './follower';
import { OFF } from './marks';
import { type TimedLine, type Timeline, timelineOf } from './timeline';

const line = (start: number, syllables: ReadonlyArray<number>): TimedLine => ({
  start,
  until: start + 1000,
  played: true,
  even: false,
  syllables,
  words: syllables.map((_, k) => k),
});

/** Three lines a second each from 1 s: two words, then a line-level line, then two words. */
const three: Timeline = {
  lines: [line(1000, [1000, 1500]), line(2000, []), line(3000, [3000, 3400])],
  first: 1000,
  end: 4000,
};

/** A follower over `timeline` on a hand-moved clock: what it scrolled to and logged. */
const harness = (timeline: Timeline = three) => {
  let now = 0;
  let timers: Array<{ at: number; run: () => void }> = [];
  const scrolled: Array<number> = [];
  const logged: Array<string> = [];
  const host: Host = {
    now: () => now,
    wake: (ms, run) => {
      const timer = { at: now + ms, run };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
    scrollTo: (to) => scrolled.push(to),
    log: (event) => logged.push(event),
  };
  const follower = followerOf(timeline, host);
  /** Moves the clock to `to`, running each timer due on the way. */
  const advance = (to: number) => {
    for (;;) {
      const due = timers.filter((t) => t.at <= to).toSorted((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      now = due.at;
      due.run();
    }
    now = to;
  };
  const marks = () => timeline.lines.map((_, k) => follower.marks.markOf(k));
  const report = (told: Report) => follower.report(told);
  return { advance, marks, report, scrolled, logged, follower };
};

const playing = (at: number): Report => ({ _tag: 'Here', at, state: 'playing' });

describe('followerOf', () => {
  it('marks nothing before the first sung line, then each line and syllable as it is sung', () => {
    const h = harness();
    h.report(playing(0));
    expect(h.marks()).toEqual([OFF, OFF, OFF]);
    h.advance(1000);
    expect(h.marks()).toEqual([0, OFF, OFF]);
    h.advance(1600);
    expect(h.marks()).toEqual([1, OFF, OFF]);
    h.advance(2100);
    expect(h.marks()).toEqual([OFF, -1, OFF]);
    h.advance(3500);
    expect(h.marks()).toEqual([OFF, OFF, 1]);
    h.advance(4100);
    expect(h.marks()).toEqual([OFF, OFF, OFF]);
  });

  it('marks the sung syllable, not its word, and a line with no syllable times whole (F1b)', () => {
    // Line 0: syllables at 1000 and 1500 in one word, 2000 in the next; line 1 even, marked whole.
    const small = Option.getOrThrow(timelineOf('1,1000,2000,0.500,500;3,2000,1000'));
    const h = harness(small);
    const at = (ms: number) => {
      h.advance(ms);
      return h.marks();
    };
    h.report(playing(0));
    expect(at(999)).toEqual([OFF, OFF]);
    expect(at(1000)).toEqual([0, OFF]);
    expect(at(1499)).toEqual([0, OFF]);
    expect(at(1500)).toEqual([1, OFF]);
    expect(at(2000)).toEqual([2, OFF]);
    expect(at(3000)).toEqual([OFF, -1]);
    expect(at(4000)).toEqual([OFF, OFF]);
  });

  it('scrolls to each line LEAD ms before it is sung, once each', () => {
    const h = harness();
    h.report(playing(0));
    h.advance(1000 - LEAD - 1);
    expect(h.scrolled).toEqual([]);
    h.advance(1000 - LEAD);
    expect(h.scrolled).toEqual([0]);
    h.advance(3000 - LEAD);
    expect(h.scrolled).toEqual([0, 1, 2]);
    h.advance(5000);
    expect(h.scrolled).toEqual([0, 1, 2]);
  });

  it('holds the marks and never scrolls while paused', () => {
    const h = harness();
    h.report({ _tag: 'Here', at: 1600, state: 'paused' });
    expect(h.marks()).toEqual([1, OFF, OFF]);
    h.advance(10_000);
    expect(h.marks()).toEqual([1, OFF, OFF]);
    expect(h.scrolled).toEqual([]);
  });

  it('runs on between reports and is not moved back by a report a little behind', () => {
    const h = harness();
    h.report(playing(1000));
    h.advance(600);
    h.report(playing(1450));
    expect(h.marks()).toEqual([1, OFF, OFF]);
  });

  it('moves the marks at once on a seek and scrolls to the line sung there', () => {
    const h = harness();
    h.report(playing(1000));
    h.advance(1100);
    h.report(playing(3100));
    expect(h.marks()).toEqual([OFF, OFF, 0]);
    expect(h.scrolled.at(-1)).toBe(2);
  });

  it('holds the scroll on a drag but keeps the marks moving; the pill scrolls to the line sung now', () => {
    const h = harness();
    h.report(playing(1000));
    h.follower.drag();
    expect(h.follower.held.get()).toBe(true);
    expect(h.logged.at(-1)).toBe('pause reason=drag');
    const before = h.scrolled.length;
    // The player reported 1000 ms at host time 0, so host time 2500 is 3500 ms into the hymn.
    h.advance(2500);
    expect(h.marks()).toEqual([OFF, OFF, 1]);
    expect(h.scrolled.length).toBe(before);
    h.follower.resume();
    expect(h.follower.held.get()).toBe(false);
    expect(h.logged.at(-1)).toBe('resume reason=pill');
    expect(h.scrolled.at(-1)).toBe(2);
  });

  it('ends a hand pause on a seek and scrolls to the line sung there', () => {
    const h = harness();
    h.report(playing(3000));
    h.follower.drag();
    h.advance(100);
    h.report(playing(1100));
    expect(h.follower.held.get()).toBe(false);
    expect(h.logged).toContain('resume reason=seek');
    expect(h.scrolled.at(-1)).toBe(0);
  });

  it('ends a hand pause on a seek however small, and scrolls back to the line sung there', () => {
    const h = harness();
    h.report(playing(1000));
    // Host time 1000 is 2000 ms into the hymn: line 1 is sung and shown.
    h.advance(1000);
    expect(h.scrolled.at(-1)).toBe(1);
    h.follower.drag();
    const before = h.scrolled.length;
    // A seek 100 ms on lies inside the clock's slack: only the seek itself tells the follow.
    h.follower.seek();
    h.report(playing(2100));
    expect(h.follower.held.get()).toBe(false);
    expect(h.logged.at(-1)).toBe('resume reason=seek');
    expect(h.scrolled.slice(before)).toEqual([1]);
  });

  it('drops a hand pause when the player pauses or leaves, and a drag while paused holds nothing', () => {
    const h = harness();
    let told = 0;
    h.follower.held.subscribe(() => (told += 1));
    h.report(playing(1000));
    h.follower.drag();
    h.report({ _tag: 'Here', at: 1000, state: 'paused' });
    expect(h.follower.held.get()).toBe(false);
    h.follower.drag();
    expect(h.follower.held.get()).toBe(false);
    h.report(playing(1000));
    h.follower.drag();
    h.report({ _tag: 'Away' });
    expect(h.follower.held.get()).toBe(false);
    expect(told).toBe(4);
    expect(h.logged.filter((event) => event.startsWith('resume'))).toEqual([]);
  });

  it('clears the marks and logs the end when the player leaves the hymn', () => {
    const h = harness();
    h.report(playing(1000));
    h.report({ _tag: 'Away' });
    expect(h.marks()).toEqual([OFF, OFF, OFF]);
    expect(h.logged.at(-1)).toBe('end');
    expect(h.logged[0]).toBe('line i=0 of=3 at=1000');
  });
});
