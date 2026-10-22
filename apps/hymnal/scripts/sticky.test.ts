/**
 * The sticky check's frame classifier, held to synthetic columns: a grey
 * ground with one-pixel hairlines drawn where a frame would show them, at
 * the iPhone 18 Pro's layout (3 px per pt, list top 62 pt, topic row 36 pt).
 * No video, no ffmpeg, no simulator.
 */

import { describe, expect, it } from 'bun:test';

import { holds, judge, linesIn, listShows, restOf, summarize } from './sticky/frames';

const layout = { scale: 3, top: 62, topic: 36, hymn: 44 };
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

describe('the frames where the list shows', () => {
  /** The right-edge column's lines: the pinned hairline, then separators every hymn row, then a topic hairline. */
  const list = [98, 101, 145, 189, 233, 277, 313, 357];

  it('finds the list by its rows keeping their pitch', () => {
    expect(listShows(linesIn(column(...list), layout.scale), layout)).toBe(true);
  });

  it('finds no list under a hymn page, whose column holds a lone line or stray ones', () => {
    expect(listShows(linesIn(column(116), layout.scale), layout)).toBe(false);
    expect(listShows(linesIn(column(116, 349, 373, 401, 467, 490), layout.scale), layout)).toBe(
      false,
    );
  });

  it('judges only the shown frames, and holds a pass that judges each of them', () => {
    const shown = Array.from({ length: 30 }, () => frame(98, 230));
    const covered = Array.from({ length: 60 }, () => ({ _tag: 'Covered' }) as const);
    const summary = summarize([...shown, ...covered]);
    expect(summary).toMatchObject({ frames: 90, shown: 30, judged: 30, missing: 0, off: 0 });
    expect(holds(summary, 0.2)).toBe(true);
  });

  it('fails a pass where the list shows in too few frames, or its pinned row is missing', () => {
    const shown = Array.from({ length: 30 }, () => frame(98, 230));
    const covered = Array.from({ length: 60 }, () => ({ _tag: 'Covered' }) as const);
    expect(holds(summarize([...shown, ...covered]), 0.5)).toBe(false);
    expect(holds(summarize([...shown, ...covered]))).toBe(false);
    const blind = [...shown, ...Array.from({ length: 4 }, () => frame()), ...covered];
    expect(summarize(blind)).toMatchObject({ shown: 34, judged: 30, missing: 4 });
    expect(holds(summarize(blind), 0.2)).toBe(false);
  });

  it('fails a pass with a shown frame off its place, though most frames are covered', () => {
    const shown = Array.from({ length: 30 }, () => frame(98, 230));
    const covered = Array.from({ length: 60 }, () => ({ _tag: 'Covered' }) as const);
    expect(holds(summarize([...shown, frame(116), ...covered]), 0.2)).toBe(false);
  });
});
