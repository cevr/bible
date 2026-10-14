// A text panel on the board is set by the engine in the film's card style: a
// card held from the beat's start (the board's `start`, not a mark the line
// says) sets the line from its first word.

import { describe, expect, test } from 'bun:test';
import { Result, Schema } from 'effect';
import { paintText } from './board.ts';
import type { CardStyle } from './card.ts';
import type { Film } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';
import type { Placed } from '../core/layout.ts';
import { estimate } from '../core/narration.ts';
import { voicedAt } from '../core/voiced.ts';

const STYLE: CardStyle = {
  ground: '#0e1010',
  type: { family: 'x', size: 60, color: '#f2e9d7' },
  payoffScale: 2.5,
  payoffColor: '#e6b347',
};

/** A film with only what a card reads of it: its size, its title, its card style. */
const film: Film = Schema.decodeSync(Schema.Any)({
  width: 1920,
  height: 1080,
  title: 'probe',
  look: { card: { style: STYLE } },
});

/** Beat `one` saying `line`, its words heard as an estimate times them, with the marks `marks`. */
const placed = (line: string, marks: ReadonlyArray<readonly [string, number]>): Placed => {
  const words = estimate(line).map((w) => ({ ...w, voiced: voicedAt(w.start + 0.15, w.end) }));
  return Schema.decodeSync(Schema.Any)({
    spec: { id: 'one' },
    voice: { words, marks: new Map(marks) },
    speechStart: 0,
    start: 0,
  });
};

describe('a card panel', () => {
  test("held from the beat's start, sets the line from its first word", () => {
    const r = recorder(1920, 1080);
    const set = withDom(() =>
      paintText(
        r.ctx,
        film,
        placed('Be just with God.', []),
        { _tag: 'Card', payoff: 'just' },
        'start',
        0,
        9,
      ),
    );
    expect(set).toEqual(Result.succeed(undefined));
  });
  test('held from a mark the line lacks, says so', () => {
    const r = recorder(1920, 1080);
    const set = withDom(() =>
      paintText(
        r.ctx,
        film,
        placed('Be just with God.', []),
        { _tag: 'Card', payoff: 'just' },
        'gone',
        0,
        9,
      ),
    );
    expect(Result.isFailure(set) && set.failure).toContain('{gone}');
  });
});
