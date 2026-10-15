// The note the Board posts about a panel: the lab's own note with the panel,
// the try shown and what it asks, and the sketch, all of which decode as a
// note's draft does; a tweak needs a try to start from; a note says words or
// carries a sketch.

import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import { BoardName, PANEL_START, type Panel } from '../../core/board.ts';
import { NoteDraft } from '../../core/schema.ts';
import { Segment } from '../../core/segment.ts';
import type { SketchItem } from '../../core/sketch.ts';
import { panelNoteOf, tweakCommand } from './note.ts';

const judge: Panel = {
  id: 'cold.judge',
  beat: BoardName.make('cold'),
  at: BoardName.make('judge'),
  tries: [
    {
      n: 1,
      file: Segment.make('cold.judge.1.png'),
      sha256: 's',
      made: 'generate',
      refs: [],
      at: 'x',
    },
  ],
};
const card: Panel = {
  ...judge,
  id: 'cold.job',
  at: BoardName.make('job'),
  tries: [],
  text: { _tag: 'Card', payoff: 'just' },
};
const arrow: SketchItem = {
  _tag: 'Arrow',
  id: 's1',
  ink: 'red',
  from: { x: 0.6, y: 0.7 },
  to: { x: 0.3, y: 0.7 },
};

const base = {
  panel: judge,
  tried: Option.some(1),
  asking: 'tweak' as const,
  text: ' move the judge left ',
  sketch: [arrow],
  at: 12.3456,
  beatStart: 10,
  fps: 30,
};

describe("a panel's note", () => {
  test('is a note on its beat at its mark, naming the panel, the try and the tweak, with the sketch', () => {
    const draft = panelNoteOf(base);
    expect(draft).toEqual(
      Option.some({
        scene: 'cold',
        T: 12.346,
        local: 2.346,
        frame: 370,
        text: 'move the judge left',
        mark: 'judge',
        panel: { id: 'cold.judge', try: 1, ask: 'tweak' },
        sketch: [arrow],
      }),
    );
    // What it posts decodes as any note's draft: every reader of notes reads it.
    expect(Option.map(draft, Schema.decodeUnknownSync(NoteDraft))).toEqual(draft);
  });
  test('a comment asks nothing; a sketch alone says to see it', () => {
    expect(panelNoteOf({ ...base, asking: 'note', text: '' })).toMatchObject(
      Option.some({ text: 'see the sketch', panel: { id: 'cold.judge', try: 1 } }),
    );
    expect(panelNoteOf({ ...base, text: '', sketch: [] })).toEqual(Option.none());
  });
  test('a tweak needs a try to start from: none on a card, which only takes a comment', () => {
    expect(panelNoteOf({ ...base, panel: card, tried: Option.none() })).toEqual(Option.none());
    const comment = panelNoteOf({ ...base, panel: card, tried: Option.none(), asking: 'note' });
    expect(Option.map(comment, (d) => d.panel)).toEqual(Option.some({ id: 'cold.job' }));
  });
  test('a start panel names no mark', () => {
    const start = panelNoteOf({ ...base, panel: { ...judge, id: 'cold.start', at: PANEL_START } });
    expect(Option.map(start, (d) => Option.fromUndefinedOr(d.mark))).toEqual(
      Option.some(Option.none()),
    );
  });
  test('says the command an agent runs on a tweak', () => {
    expect(tweakCommand('rbf', 'n12')).toBe('bun run board tweak rbf n12');
  });
});
