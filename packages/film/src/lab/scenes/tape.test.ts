// The tape wraps a film into rows like lines of text: a laptop's row is a
// minute (12 stills at 5 s), a phone's half that; each still shows the middle
// of its step and names that frame's scene; a cut sits at its scene's exact
// time with the room to the next cut; the bands cover each row scene by
// scene; and a point of a row and a time are one place both ways.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import {
  type TapeScene,
  cutNames,
  perRowAt,
  placeOf,
  rowAt,
  sceneAt,
  stepFrom,
  tapeOf,
  timeAt,
} from './tape.ts';

/** A film of three scenes: 0-40 s, 40-43 s (a short title), 43-130 s. */
const SCENES: ReadonlyArray<TapeScene> = [
  { id: 'cold', start: 0, dur: 40 },
  { id: 'title', start: 40, dur: 3 },
  { id: 'word', start: 43, dur: 87 },
];

describe('tapeOf', () => {
  test("a laptop's row is a minute, a phone's half a minute: the rows are the film's length over that", () => {
    expect(perRowAt(1440)).toBe(12);
    expect(perRowAt(390)).toBe(6);
    const laptop = tapeOf(SCENES, 130, 5, perRowAt(1440));
    expect(laptop.span).toBe(60);
    expect(laptop.rows.map((r) => r.from)).toEqual([0, 60, 120]);
    const phone = tapeOf(SCENES, 130, 5, perRowAt(390));
    expect(phone.rows.length).toBe(5);
  });

  test("each still shows the middle of its step and names that frame's scene; the last row ends with the film", () => {
    const tape = tapeOf(SCENES, 130, 5, 12);
    const first = tape.rows[0];
    expect(first?.stills.length).toBe(12);
    expect(first?.stills.slice(7, 10).map((s) => [s.t, s.scene])).toEqual([
      [37.5, 'cold'],
      [42.5, 'title'],
      [47.5, 'word'],
    ]);
    const last = tape.rows[2];
    expect(last?.stills.map((s) => s.t)).toEqual([122.5, 127.5]);
  });

  test("a cut sits at its scene's time in its row, with the room to the next cut or the row's end", () => {
    const tape = tapeOf(SCENES, 130, 5, 12);
    const cuts = tape.rows[0]?.cuts ?? [];
    expect(cuts.map((c) => [c.scene, c.index, c.at])).toEqual([
      ['cold', 0, 0],
      ['title', 1, 40],
      ['word', 2, 43],
    ]);
    expect(cuts[1]?.x).toBeCloseTo(40 / 60);
    expect(cuts[1]?.room).toBeCloseTo(3 / 60);
    expect(cuts[2]?.room).toBeCloseTo(1 - 43 / 60);
    // A scene that runs on into the next row has no cut there, only its band.
    expect(tape.rows[1]?.cuts).toEqual([]);
    expect(tape.rows[1]?.bands.map((b) => [b.scene, b.x0, b.x1])).toEqual([['word', 0, 1]]);
  });

  test("a cut's name takes the room after its rule, shortened to it, or none; the row's last may sit before its rule", () => {
    // A phone's row (30 s over 360 px, a letter 6 px): cold at 0, a 3 s title at 25, word at 28.
    const scenes: ReadonlyArray<TapeScene> = [
      { id: 'cold', start: 0, dur: 25 },
      { id: 'title', start: 25, dur: 3 },
      { id: 'word', start: 28, dur: 60 },
    ];
    const cuts = tapeOf(scenes, 88, 5, 6).rows[0]?.cuts ?? [];
    expect(cuts.map((c) => [c.scene, c.last])).toEqual([
      ['cold', false],
      ['title', false],
      ['word', true],
    ]);
    expect(cuts[0]?.before).toBe(0);
    expect(cuts[2]?.before).toBeCloseTo(3 / 30);
    // A name starts 12 px past its rule and stops 4 px short of the next: cold has 284 px;
    // title's 3 s (36 px) leaves 20, under the 30 its five letters take, so it is shortened
    // (a letter and the ellipsis take 12); word, the row's last, has 8 px after it (not a
    // letter) and nothing free before it (title's name fills that), so it has no name.
    expect(cutNames(cuts, 360, 6)).toEqual([
      { side: 'after', width: 284 },
      { side: 'after', width: 20 },
      { side: 'none', width: 0 },
    ]);
    // A row twice as wide has room for all three whole.
    expect(cutNames(cuts, 720, 6)).toEqual([
      { side: 'after', width: 584 },
      { side: 'after', width: 56 },
      { side: 'after', width: 32 },
    ]);
    // The row's last cut, short of room after it, sits its name before its rule where the
    // stretch back to the cut before is free of that cut's name: 354 px less cold's 12 + 24
    // and the 16 either side.
    const late = tapeOf(
      [
        { id: 'cold', start: 0, dur: 29.5 },
        { id: 'word', start: 29.5, dur: 60 },
      ],
      90,
      5,
      6,
    ).rows[0]?.cuts;
    expect(cutNames(late ?? [], 360, 6)).toEqual([
      { side: 'after', width: 338 },
      { side: 'before', width: 302 },
    ]);
    // Two cuts a frame apart: neither name overruns the other's rule.
    const close = tapeOf(
      [
        { id: 'a', start: 0, dur: 10 },
        { id: 'b', start: 10, dur: 0.1 },
        { id: 'c', start: 10.1, dur: 50 },
      ],
      60,
      5,
      6,
    ).rows[0]?.cuts;
    expect(cutNames(close ?? [], 360, 6).map((n) => n.side)).toEqual(['after', 'none', 'after']);
  });

  test("the bands cover a row scene by scene, the last row's up to the film's end", () => {
    const tape = tapeOf(SCENES, 130, 5, 12);
    const bands = tape.rows[0]?.bands ?? [];
    expect(bands.map((b) => b.scene)).toEqual(['cold', 'title', 'word']);
    expect(bands[0]?.x0).toBe(0);
    expect(bands[2]?.x1).toBe(1);
    expect(tape.rows[2]?.bands[0]?.x1).toBeCloseTo(10 / 60);
  });
});

describe('a place on the tape', () => {
  const tape = tapeOf(SCENES, 130, 5, 12);

  test('a time is a row and a fraction of it, and that point of the row is that time', () => {
    expect(placeOf(tape, 90)).toEqual({ row: 1, x: 0.5 });
    expect(timeAt(tape, 1, 0.5)).toBe(90);
    expect(rowAt(tape, 500)).toBe(2);
  });

  test("a point past the film's end reads as its last frame, before the start as its first", () => {
    expect(timeAt(tape, 2, 0.9)).toBeLessThan(130);
    expect(timeAt(tape, 0, -1)).toBe(0);
  });

  test("a time's scene is the last that starts at or before it", () => {
    expect(Option.map(sceneAt(SCENES, 41), (s) => s.id)).toEqual(Option.some('title'));
    expect(Option.map(sceneAt(SCENES, 43), (s) => s.id)).toEqual(Option.some('word'));
  });

  test('⌘+ and ⌘− step between 2.5, 5 and 10 s a still, staying at the ends', () => {
    expect(stepFrom(5, true)).toBe(10);
    expect(stepFrom(10, true)).toBe(10);
    expect(stepFrom(5, false)).toBe(2.5);
    expect(stepFrom(2.5, false)).toBe(2.5);
  });
});
