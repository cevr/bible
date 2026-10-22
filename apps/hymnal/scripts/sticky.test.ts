/**
 * The sticky check's frame classifier, held to synthetic columns: a grey
 * ground with one-pixel hairlines drawn where a frame would show them, at
 * the iPhone 18 Pro's layout (3 px per pt, list top 62 pt, topic row 36 pt).
 * No video, no ffmpeg, no simulator.
 */

import { describe, expect, it } from 'bun:test';

import { holds, judge, linesIn, restOf, summarize } from './sticky/frames';

const layout = { scale: 3, top: 62, topic: 36 };
const BAND = 260;
const GROUND = 20;
const LINE = 60;

/** A column of the band's pixel rows with a hairline at each point place (its last pixel row). */
const column = (...lines: ReadonlyArray<number>) => {
  const rows = Array.from({ length: BAND * layout.scale }, () => GROUND);
  for (const line of lines) rows[Math.round(line * layout.scale) - 1] = LINE;
  return rows;
};

/** The verdict of a frame whose hairlines end at these points. */
const frame = (...lines: ReadonlyArray<number>) =>
  judge(linesIn(column(...lines), layout.scale), layout);

describe('the sticky frame classifier', () => {
  it('puts the rest place at the list top plus one topic row', () => {
    expect(restOf(layout)).toBe(97.67);
  });

  it('reads one-pixel lines and passes over thick bands', () => {
    const rows = column(98, 200);
    for (let y = 400; y < 430; y++) rows[y] = LINE;
    expect(linesIn(rows, layout.scale)).toEqual([97.67, 199.67]);
  });

  it('judges the pinned row at rest', () => {
    expect(frame(98, 230)).toEqual({
      _tag: 'Seen',
      pinned: 97.67,
      pushed: false,
      expected: 97.67,
      deviation: 0,
    });
  });

  it('judges the pinned row pushed by the next topic row', () => {
    const verdict = frame(98 - 20, 98 + 16, 240);
    expect(verdict).toMatchObject({ _tag: 'Seen', pushed: true, deviation: 0 });
  });

  it('passes over a separator between the pinned row and the one pushing it', () => {
    const verdict = frame(98 - 12, 98 - 4, 98 + 24);
    expect(verdict).toMatchObject({ _tag: 'Seen', pushed: true, deviation: 0 });
  });

  it('flags a pinned row carried 18 pt with the content', () => {
    const verdict = frame(98 + 18, 220);
    expect(verdict).toMatchObject({ _tag: 'Seen', pushed: false, deviation: 18 });
  });

  it('flags a pinned row carried up while no topic row pushes it', () => {
    const verdict = frame(98 - 18, 98 + 90);
    expect(verdict).toMatchObject({ _tag: 'Seen', pushed: false, deviation: -18 });
  });

  it('counts a frame with no line under the list top as missing', () => {
    expect(frame(40)).toEqual({ _tag: 'Missing' });
  });

  it('holds a pass only when no frame is off and nearly every frame is judged', () => {
    const still = Array.from({ length: 40 }, () => frame(98, 230));
    expect(holds(summarize(still))).toBe(true);
    expect(summarize([...still, frame(98 + 18)])).toMatchObject({ off: 1, worst: 18 });
    expect(holds(summarize([...still, frame(98 + 18)]))).toBe(false);
    const blind = [...still, ...Array.from({ length: 4 }, () => frame())];
    expect(summarize(blind)).toMatchObject({ frames: 44, judged: 40, missing: 4, off: 0 });
    expect(holds(summarize(blind))).toBe(false);
  });
});
