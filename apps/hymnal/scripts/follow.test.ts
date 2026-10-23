/**
 * The follow check's judge, held to hand-made snapshots: four lines in a
 * scroll 600 pt tall, the selected one moved by hand. No simulator.
 */

import { describe, expect, it } from 'bun:test';

import { judge, type Node, type Sample, sampleOf } from './follow/samples';

const SCROLL = { x: 0, y: 100, width: 400, height: 600 };
const LENGTHS = [2000, 1500, 800, 3000];

/** A snapshot's nodes: the scroll, a line 40 pt tall at each top, `selected` marked, and the button. */
const nodes = (
  tops: ReadonlyArray<number>,
  selected: number,
  button = 'Pause hymn 100',
): ReadonlyArray<Node> => [
  { identifier: 'hymn-scroll', rect: SCROLL },
  ...tops.map((y, index) => ({
    identifier: 'line',
    selected: index === selected,
    rect: { x: 20, y, width: 300, height: 40 },
  })),
  { label: button },
];

const TOPS = [200, 260, 320, 380];

/** A run that marks each line in turn, ending on the last. */
const run = (marks: ReadonlyArray<number>, tops = TOPS): ReadonlyArray<Sample> => [
  ...marks.map((mark, i) => sampleOf(nodes(tops, mark), 100, i * 500)),
  sampleOf(nodes(tops, -1, 'Play hymn 100 again'), 100, marks.length * 500),
];

describe('the follow judge', () => {
  it('holds a run that marks every line in order, in view, to the end', () => {
    const verdict = judge(100, LENGTHS, run([0, 0, 1, 1, 2, 3, 3]), 1);
    expect(verdict).toMatchObject({
      seen: 4,
      missed: [],
      backwards: 0,
      last: true,
      outside: 0,
      ended: true,
      holds: true,
    });
  });

  it('keeps no words: a sample holds only states and frames', () => {
    const sample = sampleOf(
      [...nodes(TOPS, 0), { identifier: 'line', label: 'words', selected: false }],
      100,
      0,
    );
    expect(sample.lines.map((line) => Object.keys(line).sort())).toEqual(
      Array.from({ length: 5 }, () => ['rect', 'selected']),
    );
  });

  it('counts a step back', () => {
    const verdict = judge(100, LENGTHS, run([0, 1, 0, 1, 2, 3]), 1);
    expect(verdict.backwards).toBe(1);
    expect(verdict.holds).toBe(false);
  });

  it('names a line over 1 s never seen, and lets a short one pass unseen', () => {
    expect(judge(100, LENGTHS, run([0, 2, 3]), 1).missed).toEqual([1]);
    expect(judge(100, LENGTHS, run([0, 1, 3]), 1).holds).toBe(true);
  });

  it('fails a run that never reaches the last line, or never ends', () => {
    const short = judge(100, LENGTHS, run([0, 1, 2]), 1);
    expect(short.last).toBe(false);
    const playing = judge(
      100,
      LENGTHS,
      [0, 1, 2, 3].map((mark, i) => sampleOf(nodes(TOPS, mark), 100, i * 500)),
      1,
    );
    expect(playing).toMatchObject({ last: true, ended: false, holds: false });
  });

  it('counts a sample whose selected line, or the next line top, is out of the scroll', () => {
    const below = [200, 260, 680, 740];
    expect(judge(100, LENGTHS, run([0, 1, 2, 3], below), 1).outside).toBe(2);
    const under = [200, 260, 320, 720];
    expect(judge(100, LENGTHS, run([0, 1, 2], under), 1).outside).toBe(1);
  });

  it('fails two lines selected at once, a count of lines unlike the timeline, and a second touch', () => {
    const two = sampleOf(nodes(TOPS, 1), 100, 0);
    const both: Sample = {
      ...two,
      lines: two.lines.map((line, index) => ({ ...line, selected: index < 2 })),
    };
    expect(judge(100, LENGTHS, [both, ...run([1, 2, 3])], 1).doubled).toBe(1);
    const three = sampleOf(nodes(TOPS.slice(0, 3), 0), 100, 0);
    expect(judge(100, LENGTHS, [three, ...run([0, 1, 2, 3])], 1).mismatched).toBe(1);
    expect(judge(100, LENGTHS, run([0, 1, 2, 3]), 2).holds).toBe(false);
  });

  it('fails a sample with no scroll in it', () => {
    const lost: Sample = { ...sampleOf(nodes(TOPS, 3), 100, 0), scroll: false };
    expect(judge(100, LENGTHS, [...run([0, 1, 2]), lost], 1).outside).toBe(1);
  });
});
