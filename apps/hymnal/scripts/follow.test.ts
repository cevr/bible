/**
 * The follow check's judge, held to hand-made snapshots: a pager that shows
 * one page 600 pt tall, the open page's scroll with four lines in it, the
 * selected one moved by hand, and the next page's scroll and lines beside it
 * off the screen, as the app's pager keeps them. Each sample's time is set
 * by the line it marks, on a score clock whose first sung line is at
 * `TIMED.first`. No simulator.
 */

import { describe, expect, it } from 'bun:test';

import { judge, type Node, type Sample, sampleOf, soundOff, TIMING } from './follow/samples';

/** The page the pager shows: the window cut to the pager. */
const SCROLL = { x: 0, y: 100, width: 400, height: 600 };

/** The hymn's timeline: four lines, sung from 1 s on the score clock to 8.3 s. */
const TIMED = {
  first: 1000,
  end: 8300,
  lines: [
    { start: 1000, until: 3000 },
    { start: 3000, until: 4500 },
    { start: 4500, until: 5300 },
    { start: 5300, until: 8300 },
  ],
};

const PAGE = 2;
const NEXT = 10;

/**
 * A snapshot's nodes: the window, the pager (which clips each page to the
 * screen's middle), the open page's scroll (its own frame as tall as its
 * content) with a line 40 pt tall at each top and `selected` marked, the
 * next page's scroll off the screen with lines of its own, one selected, and
 * the button.
 */
const nodes = (
  tops: ReadonlyArray<number>,
  selected: number,
  button = 'Pause hymn 100',
): ReadonlyArray<Node> => [
  { index: 0, rect: { x: 0, y: 0, width: 402, height: 874 } },
  { index: 1, parentIndex: 0, rect: { x: 0, y: 100, width: 402, height: 600 } },
  {
    index: PAGE,
    parentIndex: 1,
    identifier: 'hymn-scroll',
    rect: { ...SCROLL, height: 1200 },
  },
  ...tops.map((y, index) => ({
    index: 3 + index,
    parentIndex: PAGE,
    identifier: 'line',
    selected: index === selected,
    rect: { x: 20, y, width: 300, height: 40 },
  })),
  {
    index: NEXT,
    parentIndex: 1,
    identifier: 'hymn-scroll',
    rect: { x: 402, y: 100, width: 400, height: 1200 },
  },
  ...[0, 1].map((index) => ({
    index: NEXT + 1 + index,
    parentIndex: NEXT,
    identifier: 'line',
    selected: index === 0,
    rect: { x: 422, y: 200 + 60 * index, width: 300, height: 40 },
  })),
  { index: 20, parentIndex: 0, label: button },
];

const TOPS = [200, 260, 320, 380];

/**
 * A run that marks each line in turn, then ends. Each sample is taken 200 ms
 * after its line starts on the score clock (`speed` times as fast), and at
 * least 400 ms after the sample before it; the player ends when the timeline
 * does.
 */
const run = (marks: ReadonlyArray<number>, tops = TOPS, speed = 1): ReadonlyArray<Sample> => {
  const times: Array<number> = [];
  for (const mark of marks) {
    const start = TIMED.lines[mark]?.start ?? TIMED.first;
    times.push(Math.max((times.at(-1) ?? -400) + 400, (start - TIMED.first) / speed + 200));
  }
  return [
    ...marks.map((mark, i) => sampleOf(nodes(tops, mark), 100, times[i] ?? 0)),
    sampleOf(nodes(tops, -1, 'Play hymn 100 again'), 100, (TIMED.end - TIMED.first) / speed),
  ];
};

describe('the follow judge', () => {
  it('holds a run that marks every line in order, on time, in view, to the end', () => {
    const verdict = judge(100, TIMED, run([0, 0, 1, 1, 2, 3, 3]), 1);
    expect(verdict).toMatchObject({
      seen: 4,
      missed: [],
      backwards: 0,
      last: true,
      outside: 0,
      adrift: 0,
      early: false,
      ended: true,
      holds: true,
    });
  });

  it("reads the open page's lines and its scroll as the screen shows it, not the pages beside it", () => {
    const sample = sampleOf(nodes(TOPS, 1), 100, 0);
    expect(sample.lines.map((line) => line.selected)).toEqual([false, true, false, false]);
    expect(sample.scroll).toEqual(SCROLL);
  });

  it('keeps no words: a sample holds only states and frames', () => {
    const sample = sampleOf(
      [
        ...nodes(TOPS, 0),
        { index: 30, parentIndex: PAGE, identifier: 'line', label: 'words', selected: false },
      ],
      100,
      0,
    );
    expect(sample.lines.map((line) => Object.keys(line).sort())).toEqual(
      Array.from({ length: 5 }, () => ['rect', 'selected']),
    );
  });

  it('counts a step back', () => {
    const verdict = judge(100, TIMED, run([0, 1, 0, 1, 2, 3]), 1);
    expect(verdict.backwards).toBe(1);
    expect(verdict.holds).toBe(false);
  });

  it('names a line over 1 s never seen, and lets a short one pass unseen', () => {
    expect(judge(100, TIMED, run([0, 2, 3]), 1).missed).toEqual([1]);
    expect(judge(100, TIMED, run([0, 1, 3]), 1).holds).toBe(true);
  });

  it('fails a run that never reaches the last line, or never ends', () => {
    const short = judge(100, TIMED, run([0, 1, 2]), 1);
    expect(short.last).toBe(false);
    const playing = judge(100, TIMED, run([0, 1, 2, 3]).slice(0, -1), 1);
    expect(playing).toMatchObject({ last: true, ended: false, holds: false });
  });

  it('fails a run whose marks race the score clock and end early', () => {
    const verdict = judge(100, TIMED, run([0, 1, 2, 3, 3], TOPS, 2), 1);
    expect(verdict.adrift).toBeGreaterThan(0);
    expect(verdict).toMatchObject({ early: true, ended: true, holds: false });
  });

  it('fails a run whose marks lag the score clock', () => {
    const late = run([0, 1, 2, 3]).map((sample, i) => ({ ...sample, at: sample.at + 2500 * i }));
    expect(judge(100, TIMED, late, 1).adrift).toBeGreaterThan(0);
  });

  it(`lets a mark sit up to ${TIMING} ms from its line's span, and no further`, () => {
    const at = (mark: number, ms: number) => sampleOf(nodes(TOPS, mark), 100, ms);
    const end = sampleOf(nodes(TOPS, -1, 'Play hymn 100 again'), 100, TIMED.end - TIMED.first);
    // Line 1 is sung from 2000 to 3500 ms after the tap.
    const inside = [at(0, 200), at(1, 2000 - TIMING + 1), at(1, 3500 + TIMING - 1), at(3, 4400)];
    expect(judge(100, TIMED, [...inside, end], 1)).toMatchObject({ adrift: 0, holds: true });
    const outside = [at(0, 200), at(1, 2000 - TIMING - 1), at(1, 3500 + TIMING), at(3, 4400)];
    expect(judge(100, TIMED, [...outside, end], 1).adrift).toBe(2);
  });

  it('counts a sample whose selected line, or the next line top, is out of the scroll', () => {
    const below = [200, 260, 680, 740];
    expect(judge(100, TIMED, run([0, 1, 2, 3], below), 1).outside).toBe(2);
    const under = [200, 260, 320, 720];
    expect(judge(100, TIMED, run([0, 1, 2], under), 1).outside).toBe(1);
  });

  it('fails two lines selected at once, a count of lines unlike the timeline, and a second touch', () => {
    const two = sampleOf(nodes(TOPS, 1), 100, 0);
    const both: Sample = {
      ...two,
      lines: two.lines.map((line, index) => ({ ...line, selected: index < 2 })),
    };
    expect(judge(100, TIMED, [both, ...run([1, 2, 3])], 1).doubled).toBe(1);
    const three = sampleOf(nodes(TOPS.slice(0, 3), 0), 100, 0);
    expect(judge(100, TIMED, [three, ...run([0, 1, 2, 3])], 1).mismatched).toBe(1);
    expect(judge(100, TIMED, run([0, 1, 2, 3]), 2).holds).toBe(false);
  });

  it('fails a sample with no scroll in it', () => {
    const lost: Sample = { ...sampleOf(nodes(TOPS, 3), 100, 4400), scroll: false };
    expect(judge(100, TIMED, [...run([0, 1, 2]), lost], 1).outside).toBe(1);
  });
});

describe('the sound check', () => {
  it("reads sound off from the Sound button's unchecked value, and on from checked", () => {
    expect(soundOff([{ label: 'Sound', value: 'unchecked' }])).toBe(true);
    expect(soundOff([{ label: 'Sound', value: 'checked' }])).toBe(false);
    expect(soundOff([{ label: 'Sound off' }])).toBe(false);
    expect(soundOff([])).toBe(false);
  });
});
