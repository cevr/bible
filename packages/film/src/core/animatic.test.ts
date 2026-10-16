// The animatic times each panel from its mark: a beat's first panel opens
// the beat, a later one takes over where its mark is said, a beat with no
// panel shows its card, and a mark the line lacks holds from the beat's start.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { type BoardFile, BoardName, type Panel, emptyBoard } from './board.ts';
import { Segment } from './segment.ts';
import { Shot, type TimedBeat, shotsOf } from './animatic.ts';

const marks = (start: number, at: Record<string, number>) => (name: string) =>
  Option.map(Option.fromUndefinedOr(at[name]), (t) => start + t);

const beats: ReadonlyArray<TimedBeat> = [
  { id: 'cold', start: 0, end: 10, markAt: marks(0, { room: 2, judge: 5 }) },
  { id: 'title', start: 10, end: 14, markAt: marks(10, {}) },
  { id: 'word', start: 14, end: 20, markAt: marks(14, { said: 3 }) },
];

const panel = (beat: string, at: string): Panel => ({
  id: `${beat}.${at}`,
  beat: BoardName.make(beat),
  at: BoardName.make(at),
  tries: [
    {
      n: 1,
      file: Segment.make(`${beat}.${at}.1.png`),
      sha256: 's',
      made: 'generate',
      refs: [],
      at: 'x',
    },
  ],
});

const board: BoardFile = {
  ...emptyBoard('f'),
  panels: [panel('cold', 'judge'), panel('cold', 'room'), panel('word', 'gone')],
};

const named = (s: Shot) =>
  Shot.$match(s, {
    Boarded: (b) => `${b.panel.id}@${b.from}`,
    Unboarded: (u) => `card ${u.beat}@${u.from}`,
  });

describe('the animatic', () => {
  const shots = shotsOf(beats, board);
  test("holds each panel from its mark, the beat's first from the beat's start", () => {
    expect(shots.map(named)).toEqual([
      'cold.room@0',
      'cold.judge@5',
      'card title@10',
      'word.gone@14',
    ]);
  });
  test('a panel at a mark its line lacks holds from the beat start', () => {
    const gone = shots.find((s) => s._tag === 'Boarded' && s.panel.id === 'word.gone');
    expect(
      Option.map(
        Option.fromUndefinedOr(gone),
        Shot.$match({ Boarded: (b) => b.at, Unboarded: () => -1 }),
      ),
    ).toEqual(Option.some(14));
  });
});
