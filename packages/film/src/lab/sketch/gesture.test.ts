// The sketch surface's behaviour, one test per behaviour the unit keeps
// (state.md's list, in our words): pen, arrow, rectangle and ellipse, text,
// eraser, select and move, delete, undo and redo, inks, and how a second
// finger, a lost pointer and Escape end a gesture. Driven through `step`
// alone, on a 1000 × 500 view, so a fraction of 0.001 across is a pixel.

import { describe, expect, test } from 'bun:test';
import { Array as Arr, Match, Option } from 'effect';
import type { SketchItem } from '../../core/sketch.ts';
import {
  type PointerKind,
  type SketchEvent,
  SketchEvent as E,
  type SketchState,
  type SketchTool,
  canRedo,
  canUndo,
  isDot,
  shownOf,
  sketchOf,
  step,
} from './gesture.ts';

const view = { w: 1000, h: 500 };

const run = (s: SketchState, ...events: ReadonlyArray<SketchEvent>): SketchState =>
  Arr.reduce(events, s, (now, e) => step(now, e, view));

const at = (x: number, y: number) => ({ x, y });
const down = (
  x: number,
  y: number,
  kind: PointerKind = 'mouse',
  shift = false,
  p = Option.none<number>(),
) => E.Down({ at: at(x, y), kind, shift, pressure: p });
const to = (x: number, y: number, shift = false, p = Option.none<number>()) =>
  E.Move({ at: at(x, y), shift, pressure: p });
const up = E.Up();

const using = (tool: SketchTool, items: ReadonlyArray<SketchItem> = []) =>
  run(sketchOf(items), E.Tool({ tool }));

const tags = (s: SketchState) => s.items.map((i) => i._tag);

/** Where a box shape (a rectangle, an ellipse) stands, to a thousandth. */
const where = (item: Option.Option<SketchItem>) =>
  Option.match(item, {
    onNone: () => ({}),
    onSome: (drawn) =>
      Match.value(drawn).pipe(
        Match.tag('Rect', 'Ellipse', (box) => ({ x: box.x.toFixed(3), y: box.y.toFixed(3) })),
        Match.orElse(() => ({})),
      ),
  });

/** A rectangle. */
const isRect = (item: SketchItem): item is Extract<SketchItem, { _tag: 'Rect' }> =>
  item._tag === 'Rect';

const rect = (id: string, x: number, y: number, w = 0.1, h = 0.1): SketchItem => ({
  _tag: 'Rect',
  id,
  ink: 'ink',
  x,
  y,
  w,
  h,
});

describe('a press', () => {
  test('is a click until it travels 4 px with a mouse, 6 with a finger', () => {
    const mouse = run(using('rect'), down(0.5, 0.5), to(0.503, 0.5));
    expect(mouse.gesture._tag).toBe('Pressing');
    expect(run(mouse, to(0.505, 0.5)).gesture._tag).toBe('Drawing');
    const finger = run(using('rect'), down(0.5, 0.5, 'touch'), to(0.505, 0.5));
    expect(finger.gesture._tag).toBe('Pressing');
    expect(run(finger, to(0.507, 0.5)).gesture._tag).toBe('Drawing');
  });
});

describe('the pen', () => {
  test('a press starts a stroke at once, a release ends it, and the pen stays the tool', () => {
    const s = run(using('pen'), down(0.1, 0.1), to(0.2, 0.1), to(0.3, 0.2), up);
    expect(tags(s)).toEqual(['Pen']);
    expect(s.tool).toBe('pen');
    expect(s.items[0]?._tag === 'Pen' && s.items[0].points.length).toBe(3);
  });
  test('a tap with no move is a dot', () => {
    const s = run(using('pen'), down(0.4, 0.4), up);
    expect(s.items.map(isDot)).toEqual([true]);
  });
  test('a point is kept only once the pointer is a pixel from the last', () => {
    const s = run(using('pen'), down(0.1, 0.1), to(0.1005, 0.1), to(0.102, 0.1), up);
    expect(s.items[0]?._tag === 'Pen' && s.items[0].points.length).toBe(2);
  });
  test("keeps a pen's pressure, none from a mouse, and none from a pen landing at 0", () => {
    const pen = run(
      using('pen'),
      down(0.1, 0.1, 'pen', false, Option.some(0.6)),
      to(0.2, 0.1, false, Option.some(0.8)),
      up,
    );
    expect(pen.items[0]?._tag === 'Pen' && pen.items[0].points.map((p) => p.p)).toEqual([0.6, 0.8]);
    const mouse = run(using('pen'), down(0.1, 0.1, 'mouse', false, Option.some(0.5)), up);
    expect(mouse.items[0]?._tag === 'Pen' && mouse.items[0].points[0].p).toBeUndefined();
    const landed = run(using('pen'), down(0.1, 0.1, 'pen', false, Option.some(0)), up);
    expect(landed.items[0]?._tag === 'Pen' && landed.items[0].points[0].p).toBeUndefined();
  });
  test('Escape mid-stroke keeps it; Escape idle goes back to Select', () => {
    const s = run(using('pen'), down(0.1, 0.1), to(0.3, 0.1), E.Escape());
    expect(tags(s)).toEqual(['Pen']);
    expect(run(s, E.Escape()).tool).toBe('select');
  });
  test('a whole stroke is one undo step', () => {
    const s = run(using('pen'), down(0.1, 0.1), to(0.2, 0.2), to(0.3, 0.3), up);
    expect(tags(run(s, E.Undo()))).toEqual([]);
  });
});

describe('the arrow', () => {
  test('a press with no drag leaves no arrow; a drag sets tail and head, live', () => {
    expect(tags(run(using('arrow'), down(0.2, 0.2), up))).toEqual([]);
    const live = run(using('arrow'), down(0.2, 0.2), to(0.5, 0.4));
    expect(shownOf(live).items.at(-1)).toMatchObject({
      _tag: 'Arrow',
      from: at(0.2, 0.2),
      to: at(0.5, 0.4),
    });
    expect(tags(run(live, up))).toEqual(['Arrow']);
  });
  test('Escape or a tool change mid-drag removes the arrow being made', () => {
    expect(tags(run(using('arrow'), down(0.2, 0.2), to(0.5, 0.4), E.Escape()))).toEqual([]);
    expect(
      tags(run(using('arrow'), down(0.2, 0.2), to(0.5, 0.4), E.Tool({ tool: 'pen' }))),
    ).toEqual([]);
  });
  test('a zero-length arrow is never kept', () => {
    expect(tags(run(using('arrow'), down(0.2, 0.2), to(0.21, 0.2), to(0.2, 0.2), up))).toEqual([]);
  });
});

describe('the rectangle and the ellipse', () => {
  test('a drag sizes the shape from the press to the pointer', () => {
    const s = run(using('rect'), down(0.6, 0.6), to(0.2, 0.4), up);
    expect(s.items[0]).toMatchObject({ _tag: 'Rect', x: 0.2, y: 0.4 });
    expect(
      s.items[0]?._tag === 'Rect' && [s.items[0].w, s.items[0].h].map((n) => n.toFixed(3)),
    ).toEqual(['0.400', '0.200']);
  });
  test('a click makes a default-size shape centred on it, a fifth of the panel high', () => {
    const s = run(using('ellipse'), down(0.5, 0.5), up);
    const e = s.items[0];
    expect(e?._tag).toBe('Ellipse');
    if (e?._tag !== 'Ellipse') return;
    expect([e.h, e.w * view.w, e.x + e.w / 2, e.y + e.h / 2].map((n) => n.toFixed(3))).toEqual([
      '0.200',
      (0.2 * view.h).toFixed(3),
      '0.500',
      '0.500',
    ]);
  });
  test('Shift keeps a square or a circle (in view pixels)', () => {
    const s = run(using('rect'), down(0.1, 0.1), to(0.5, 0.2, true), up);
    const r = Option.getOrThrow(Option.filter(Arr.get(s.items, 0), isRect));
    expect((r.w * view.w).toFixed(1)).toBe((r.h * view.h).toFixed(1));
  });
  test('each is one undo step, and Escape mid-drag removes it', () => {
    const s = run(
      using('rect'),
      down(0.1, 0.1),
      to(0.3, 0.3),
      up,
      down(0.5, 0.5),
      to(0.7, 0.7),
      up,
    );
    expect(tags(run(s, E.Undo()))).toEqual(['Rect']);
    expect(tags(run(using('rect'), down(0.1, 0.1), to(0.3, 0.3), E.Escape()))).toEqual([]);
  });
});

describe('the text', () => {
  test('a click places a text and edits it at once; its words land as one undo step', () => {
    const editing = run(using('text'), down(0.3, 0.3), up);
    expect(editing.gesture._tag).toBe('Editing');
    const s = run(
      editing,
      E.Type({ text: 'lower' }),
      E.Type({ text: 'lower the bench' }),
      E.Commit(),
    );
    expect(s.items[0]).toMatchObject({ _tag: 'Text', at: at(0.3, 0.3), text: 'lower the bench' });
    expect(tags(run(s, E.Undo()))).toEqual([]);
  });
  test('leaving with no words removes it and leaves no undo step', () => {
    const s = run(using('text'), down(0.3, 0.3), up, E.Type({ text: '  ' }), E.Commit());
    expect([tags(s), canUndo(s)]).toEqual([[], false]);
  });
  test('Escape keeps the words; a click away ends the editing', () => {
    const escaped = run(using('text'), down(0.3, 0.3), up, E.Type({ text: 'here' }), E.Escape());
    expect(tags(escaped)).toEqual(['Text']);
    const away = run(using('text'), down(0.3, 0.3), up, E.Type({ text: 'here' }), down(0.8, 0.8));
    expect([tags(away), away.gesture._tag]).toEqual([['Text'], 'Idle']);
  });
});

describe('the eraser', () => {
  const two = [rect('a', 0.1, 0.1), rect('b', 0.5, 0.5)];
  test('marks what it presses and crosses, shown dimmed, and erases them all on release', () => {
    const pressing = run(using('eraser', two), down(0.1, 0.15), to(0.5, 0.55));
    expect(shownOf(pressing).marked).toEqual(['a', 'b']);
    const s = run(pressing, up);
    expect([tags(s), canUndo(s)]).toEqual([[], true]);
    expect(tags(run(s, E.Undo()))).toEqual(['Rect', 'Rect']);
  });
  test("an open shape's middle is not the shape", () => {
    expect(tags(run(using('eraser', two), down(0.15, 0.15), up))).toEqual(['Rect', 'Rect']);
  });
  test('Escape mid-erase erases nothing', () => {
    expect(tags(run(using('eraser', two), down(0.1, 0.15), E.Escape(), up))).toEqual([
      'Rect',
      'Rect',
    ]);
  });
});

describe('select and move', () => {
  const two = [rect('a', 0.1, 0.1), rect('b', 0.1, 0.1, 0.2, 0.2)];
  test('a press on a line selects that shape; a press on nothing clears the selection', () => {
    const s = run(using('select', two), down(0.3, 0.2), up);
    expect(s.selected).toEqual(['b']);
    expect(run(s, down(0.9, 0.9), up).selected).toEqual([]);
  });
  test('when shapes overlap the one drawn last wins', () => {
    expect(run(using('select', two), down(0.1, 0.15), up).selected).toEqual(['b']);
  });
  test("a press in an open shape's middle starts a marquee, which selects what it wholly holds", () => {
    const s = run(using('select', two), down(0.25, 0.25), to(0.05, 0.05), up);
    expect(s.selected).toEqual(['a']);
    expect(run(using('select', two), down(0.05, 0.05), to(0.35, 0.35), up).selected).toEqual([
      'a',
      'b',
    ]);
  });
  test('Shift-press adds a shape, or lets one selected go', () => {
    const one = run(using('select', two), down(0.3, 0.2), up);
    const both = run(one, down(0.15, 0.2, 'mouse', true), up);
    expect(both.selected.toSorted()).toEqual(['a', 'b']);
    expect(run(both, down(0.3, 0.2, 'mouse', true), up).selected).toEqual(['a']);
  });
  test('a drag moves every selected shape live, as one undo step; Escape puts them back', () => {
    const s = run(using('select', two), down(0.3, 0.2), to(0.4, 0.3));
    expect(where(Arr.get(s.items, 1))).toEqual({ x: '0.200', y: '0.200' });
    const landed = run(s, up);
    expect(where(Arr.get(landed.items, 1))).toEqual({ x: '0.200', y: '0.200' });
    expect(where(Arr.get(run(landed, E.Undo()).items, 1))).toEqual({ x: '0.100', y: '0.100' });
    expect(where(Arr.get(run(s, E.Escape()).items, 1))).toEqual({ x: '0.100', y: '0.100' });
  });
  test('Shift while dragging keeps the move on its main axis', () => {
    const s = run(using('select', two), down(0.3, 0.2), to(0.5, 0.21, true), up);
    expect(where(Arr.get(s.items, 1))).toEqual({ x: '0.300', y: '0.100' });
  });
  test('Escape idle clears the selection; Delete removes it as one undo step', () => {
    const s = run(using('select', two), down(0.3, 0.2), up);
    expect(run(s, E.Escape()).selected).toEqual([]);
    const gone = run(s, E.Delete());
    expect(gone.items.map((i) => i.id)).toEqual(['a']);
    expect(run(gone, E.Undo()).items.map((i) => i.id)).toEqual(['a', 'b']);
  });
  test('an ink chosen with shapes selected inks them, as one undo step', () => {
    const s = run(using('select', two), down(0.3, 0.2), up, E.Ink({ ink: 'gold' }));
    expect(s.items.map((i) => i.ink)).toEqual(['ink', 'gold']);
    expect(run(s, E.Undo()).items.map((i) => i.ink)).toEqual(['ink', 'ink']);
  });
});

describe('the history', () => {
  test('undo steps back one gesture, redo forward, and a new change clears redo', () => {
    const two = run(using('pen'), down(0.1, 0.1), up, down(0.2, 0.2), up);
    const back = run(two, E.Undo());
    expect([tags(back), canRedo(back)]).toEqual([['Pen'], true]);
    expect(tags(run(back, E.Redo()))).toEqual(['Pen', 'Pen']);
    const branched = run(back, down(0.5, 0.5), up);
    expect(canRedo(branched)).toBe(false);
  });
  test('undo during a gesture not yet made cancels it and undoes nothing', () => {
    const s = run(
      using('pen'),
      down(0.1, 0.1),
      up,
      E.Tool({ tool: 'rect' }),
      down(0.4, 0.4),
      to(0.6, 0.6),
      E.Undo(),
    );
    expect([tags(s), s.gesture._tag]).toEqual([['Pen'], 'Idle']);
  });
  test('clear removes every shape as one undo step', () => {
    const s = run(using('pen'), down(0.1, 0.1), up, down(0.2, 0.2), up, E.Clear());
    expect(tags(s)).toEqual([]);
    expect(tags(run(s, E.Undo()))).toEqual(['Pen', 'Pen']);
  });
});

describe('touch', () => {
  test('a second finger drops a stroke not yet a drag, and keeps one past it', () => {
    expect(tags(run(using('pen'), down(0.1, 0.1, 'touch'), to(0.102, 0.1), E.Second()))).toEqual(
      [],
    );
    expect(tags(run(using('pen'), down(0.1, 0.1, 'touch'), to(0.2, 0.1), E.Second()))).toEqual([
      'Pen',
    ]);
  });
  test('a lost pointer keeps a stroke and lands a move where it is', () => {
    expect(tags(run(using('pen'), down(0.1, 0.1, 'touch'), to(0.2, 0.1), E.Lost()))).toEqual([
      'Pen',
    ]);
    const s = run(using('select', [rect('a', 0.1, 0.1)]), down(0.1, 0.15), to(0.2, 0.25), E.Lost());
    expect(where(Arr.get(s.items, 0))).toEqual({ x: '0.200', y: '0.200' });
  });
});

describe('a sketch reopened', () => {
  test('numbers new shapes past the ones it was given', () => {
    const s = run(sketchOf([rect('s7', 0, 0)]), down(0.5, 0.5), up);
    expect(s.items.map((i) => i.id)).toEqual(['s7', 's8']);
  });
});
