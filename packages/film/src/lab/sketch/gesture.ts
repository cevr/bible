// The sketch surface's state as one explicit machine: the tool and the ink
// chosen, the shapes drawn (`core/sketch.ts`, in panel fractions), the shapes
// selected, the gesture under way and the history of whole gestures. Each
// pointer, key and button the surface hears is an event, and `step` is the
// only way the state changes, so every behaviour the surface has is a pure
// transition its tests drive (`gesture.test.ts`). The behaviour list it
// meets is the unit's (state.md): a press is a click until it travels 4 px
// (6 by touch); a line is hit within 3 px (4 by touch); a stroke, a shape, a
// move, an erase or a text is one undo step; Escape cancels what is being
// made and keeps a stroke; a second finger drops a stroke not yet a drag.
// Pure and DOM-free: the surface (`surface.tsx`) feeds it pointer events in
// fractions and the size the panel is shown at.

import { Array as Arr, Data, Match, Option } from 'effect';
import {
  type SketchItem,
  type SketchPoint,
  type View,
  inside,
  itemAt,
  moved,
} from '../../core/sketch.ts';

/** What a press is made with. */
export type PointerKind = 'mouse' | 'pen' | 'touch';

/** The surface's tools. */
export const SKETCH_TOOLS = [
  'select',
  'pen',
  'arrow',
  'rect',
  'ellipse',
  'text',
  'eraser',
] as const;
export type SketchTool = (typeof SKETCH_TOOLS)[number];

/** The sketch's inks, as the toolbar offers them. */
export const SKETCH_INKS = ['ink', 'red', 'gold'] as const;
export type SketchInk = (typeof SKETCH_INKS)[number];

/** A point of the panel, in its fractions. */
interface At {
  readonly x: number;
  readonly y: number;
}

/** How far a press travels before it is a drag, in view pixels. */
const DRAG_PX: Readonly<Record<PointerKind, number>> = { mouse: 4, pen: 4, touch: 6 };

/** How near a line a press hits it, in view pixels. */
const HIT_PX: Readonly<Record<PointerKind, number>> = { mouse: 3, pen: 3, touch: 4 };

/** A shape made by a click with no drag: a fifth of the panel's height across. */
const CLICK_SIZE = 0.2;

/** What is under way. */
type Gesture = Data.TaggedEnum<{
  /** Nothing: the next press starts a gesture. */
  Idle: {};
  /** A press not yet a drag, with what it means once it is one. */
  Pressing: {
    readonly start: At;
    readonly kind: PointerKind;
    /** What a drag from it does: size a shape, move the selection, or draw a marquee. */
    readonly then: 'shape' | 'move' | 'brush';
  };
  /** A stroke, an arrow, a rectangle or an ellipse being drawn. */
  Drawing: {
    readonly item: SketchItem;
    readonly start: At;
    readonly kind: PointerKind;
    /** How far the pointer has travelled, in view pixels: a second finger keeps a stroke past a drag. */
    readonly travelled: number;
  };
  /** The selection moving: the shapes as they were, and how far they have moved. */
  Dragging: {
    readonly start: At;
    readonly base: ReadonlyArray<SketchItem>;
  };
  /** A marquee from `start` to `to`. */
  Brushing: { readonly start: At; readonly to: At; readonly add: boolean };
  /** The eraser's press: every shape it has crossed, and where it was last. */
  Erasing: {
    readonly marked: ReadonlyArray<string>;
    readonly last: At;
    readonly kind: PointerKind;
  };
  /** A text being typed at a point. */
  Editing: { readonly at: At; readonly text: string };
}>;
const Gesture = Data.taggedEnum<Gesture>();

/** The surface's whole state. */
export interface SketchState {
  readonly tool: SketchTool;
  readonly ink: SketchInk;
  readonly items: ReadonlyArray<SketchItem>;
  readonly selected: ReadonlyArray<string>;
  readonly gesture: Gesture;
  /** The shapes before each whole gesture, newest last: Undo returns to the last. */
  readonly past: ReadonlyArray<ReadonlyArray<SketchItem>>;
  /** The shapes Undo left, newest first: Redo returns to the first. */
  readonly future: ReadonlyArray<ReadonlyArray<SketchItem>>;
  /** The next shape's number (`s<n>`). */
  readonly next: number;
}

/** What the surface hears. */
export type SketchEvent = Data.TaggedEnum<{
  /** A press at `at`; a pen's pressure where it gave one. */
  Down: {
    readonly at: At;
    readonly kind: PointerKind;
    readonly shift: boolean;
    readonly pressure: Option.Option<number>;
  };
  Move: { readonly at: At; readonly shift: boolean; readonly pressure: Option.Option<number> };
  Up: {};
  /** The system took the pointer away: a stroke is kept, a move lands where it is. */
  Lost: {};
  /** A second finger came down: a gesture not yet a drag is dropped. */
  Second: {};
  Escape: {};
  /** Delete or Backspace: the selection goes. */
  Delete: {};
  Undo: {};
  Redo: {};
  Tool: { readonly tool: SketchTool };
  Ink: { readonly ink: SketchInk };
  /** The text being typed now reads `text`. */
  Type: { readonly text: string };
  /** The text being typed is done (Enter, a click away, the field left). */
  Commit: {};
  /** Every shape goes, as one undo step. */
  Clear: {};
}>;
export const SketchEvent = Data.taggedEnum<SketchEvent>();

/** A fresh surface over `items` (a sketch already drawn), the pen in ink. */
export const sketchOf = (items: ReadonlyArray<SketchItem> = []): SketchState => ({
  tool: 'pen',
  ink: 'red',
  items,
  selected: [],
  gesture: Gesture.Idle(),
  past: [],
  future: [],
  next: Arr.reduce(items, 1, (most, s) => Math.max(most, numberOf(s.id) + 1)),
});

/** The number in a shape's id (`s12` → 12), 0 for one not named so. */
const numberOf = (id: string): number =>
  Option.getOrElse(Option.map(Option.fromNullishOr(/^s(\d+)$/.exec(id)?.[1]), Number), () => 0);

/** The distance between two panel points, in view pixels. */
const px = (view: View, a: At, b: At): number =>
  Math.hypot((a.x - b.x) * view.w, (a.y - b.y) * view.h);

/** A point as a shape keeps it, with the pen's pressure when it gave one. */
const pointOf = (at: At, pressure: Option.Option<number>): SketchPoint =>
  Option.match(pressure, {
    onNone: () => ({ x: at.x, y: at.y }),
    onSome: (p) => ({ x: at.x, y: at.y, p: Math.max(0, Math.min(1, p)) }),
  });

/** A pen's pressure as a stroke keeps it: none from a mouse or a finger, and none from a pen that reads 0 as it lands. */
const pressureOf = (kind: PointerKind, pressure: Option.Option<number>): Option.Option<number> =>
  Option.filter(pressure, (p) => kind === 'pen' && p > 0);

/** The box from `a` to `b`, kept square (in view pixels) with `square`. */
const boxOf = (view: View, a: At, b: At, square: boolean) => {
  if (!square)
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
  const side = Math.max(Math.abs(b.x - a.x) * view.w, Math.abs(b.y - a.y) * view.h);
  const w = side / view.w;
  const h = side / view.h;
  return {
    x: Math.min(a.x, a.x + Math.sign(b.x - a.x || 1) * w),
    y: Math.min(a.y, a.y + Math.sign(b.y - a.y || 1) * h),
    w,
    h,
  };
};

/** The shape the tool sizes from `start` to `to`. */
const sized = (
  s: SketchState,
  view: View,
  id: string,
  start: At,
  to: At,
  square: boolean,
): Option.Option<SketchItem> =>
  Match.value(s.tool).pipe(
    Match.when('arrow', (): Option.Option<SketchItem> =>
      Option.some({ _tag: 'Arrow', id, ink: s.ink, from: start, to }),
    ),
    Match.when('rect', (): Option.Option<SketchItem> =>
      Option.some({ _tag: 'Rect', id, ink: s.ink, ...boxOf(view, start, to, square) }),
    ),
    Match.when('ellipse', (): Option.Option<SketchItem> =>
      Option.some({ _tag: 'Ellipse', id, ink: s.ink, ...boxOf(view, start, to, square) }),
    ),
    Match.orElse(() => Option.none<SketchItem>()),
  );

/** The shape a click with no drag makes at `at`: a rectangle or an ellipse of the default size, centred there. */
const clicked = (s: SketchState, view: View, at: At): Option.Option<SketchItem> => {
  const h = CLICK_SIZE;
  const w = (CLICK_SIZE * view.h) / view.w;
  const box = { x: at.x - w / 2, y: at.y - h / 2, w, h };
  const id = `s${s.next}`;
  return Match.value(s.tool).pipe(
    Match.when('rect', (): Option.Option<SketchItem> =>
      Option.some({ _tag: 'Rect', id, ink: s.ink, ...box }),
    ),
    Match.when('ellipse', (): Option.Option<SketchItem> =>
      Option.some({ _tag: 'Ellipse', id, ink: s.ink, ...box }),
    ),
    Match.orElse(() => Option.none<SketchItem>()),
  );
};

/** `s` with its shapes now `items`, the shapes before them one undo step back. */
const done = (s: SketchState, items: ReadonlyArray<SketchItem>, before = s.items): SketchState => ({
  ...s,
  items,
  past: [...s.past, before],
  future: [],
  gesture: Gesture.Idle(),
});

/** `s` with `item` added as one undo step. */
const added = (s: SketchState, item: SketchItem): SketchState => ({
  ...done(s, [...s.items, item]),
  next: s.next + 1,
});

const idle = (s: SketchState): SketchState => ({ ...s, gesture: Gesture.Idle() });

/** Whether a zero-length arrow (one that would not show) is all `item` is. */
const empty = (view: View, item: SketchItem): boolean =>
  item._tag === 'Arrow' && px(view, item.from, item.to) < 1;

/** The gesture under way ended: a stroke or a shape kept, a move landed, a marquee selected, an erase made. */
const finish = (s: SketchState, view: View): SketchState =>
  Gesture.$match(s.gesture, {
    Idle: () => s,
    Pressing: (g) => {
      if (g.then !== 'shape') return idle(s);
      return Option.match(clicked(s, view, g.start), {
        onNone: () => idle(s),
        onSome: (item) => added(s, item),
      });
    },
    Drawing: (g) => {
      if (empty(view, g.item)) return idle(s);
      return added(s, g.item);
    },
    Dragging: (g) => done(s, s.items, g.base),
    Brushing: (g) => {
      const brush = boxOf(view, g.start, g.to, false);
      const box = {
        x: brush.x * view.w,
        y: brush.y * view.h,
        w: brush.w * view.w,
        h: brush.h * view.h,
      };
      const held = s.items.filter((i) => inside(view, i, box)).map((i) => i.id);
      return { ...idle(s), selected: Arr.union(keptIf(g.add, s.selected), held) };
    },
    Erasing: (g) => {
      if (g.marked.length === 0) return idle(s);
      return {
        ...done(
          s,
          s.items.filter((i) => !g.marked.includes(i.id)),
        ),
        selected: s.selected.filter((id) => !g.marked.includes(id)),
      };
    },
    Editing: (g) => {
      const text = g.text.trim();
      if (text === '') return idle(s);
      return added(s, { _tag: 'Text', id: `s${s.next}`, ink: s.ink, at: g.at, text });
    },
  });

/** `ids` when `keep`, else none. */
const keptIf = (keep: boolean, ids: ReadonlyArray<string>): ReadonlyArray<string> =>
  ids.filter(() => keep);

/** What a gesture under way leaves when it is called off: a stroke kept, the rest as they were before it. */
const callOff = (s: SketchState, view: View): SketchState =>
  Gesture.$match(s.gesture, {
    Idle: () => s,
    Pressing: () => idle(s),
    Drawing: (g) => {
      if (g.item._tag === 'Pen') return finish(s, view);
      return idle(s);
    },
    Dragging: (g) => ({ ...idle(s), items: g.base }),
    Brushing: () => idle(s),
    Erasing: () => idle(s),
    Editing: () => finish(s, view),
  });

/** Every shape the eraser crosses from `a` to `b`, by the line's own margin. */
const crossed = (
  s: SketchState,
  view: View,
  a: At,
  b: At,
  kind: PointerKind,
): ReadonlyArray<string> => {
  const steps = Math.max(1, Math.ceil(px(view, a, b) / HIT_PX[kind]));
  return Arr.dedupe(
    Arr.range(0, steps).flatMap((i) => {
      const at = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
      return s.items
        .filter((item) =>
          Option.isSome(itemAt(view, [item], { x: at.x * view.w, y: at.y * view.h }, HIT_PX[kind])),
        )
        .map((item) => item.id);
    }),
  );
};

/** A press: what it starts depends on the tool, and on the shape under it for Select. */
const down = (
  s: SketchState,
  view: View,
  e: Extract<SketchEvent, { _tag: 'Down' }>,
): SketchState => {
  // A press while a text is being typed ends the typing, and starts nothing.
  if (s.gesture._tag === 'Editing') return finish(s, view);
  const at = e.at;
  return Match.value(s.tool).pipe(
    Match.when('pen', (): SketchState => ({
      ...s,
      selected: [],
      gesture: Gesture.Drawing({
        item: {
          _tag: 'Pen',
          id: `s${s.next}`,
          ink: s.ink,
          points: [pointOf(at, pressureOf(e.kind, e.pressure))],
        },
        start: at,
        kind: e.kind,
        travelled: 0,
      }),
    })),
    Match.when('text', (): SketchState => ({
      ...s,
      selected: [],
      gesture: Gesture.Editing({ at, text: '' }),
    })),
    Match.when('eraser', (): SketchState => ({
      ...s,
      gesture: Gesture.Erasing({
        marked: crossed(s, view, at, at, e.kind),
        last: at,
        kind: e.kind,
      }),
    })),
    Match.when('select', (): SketchState => {
      const hit = itemAt(view, s.items, { x: at.x * view.w, y: at.y * view.h }, HIT_PX[e.kind]);
      return Option.match(hit, {
        onNone: (): SketchState => ({
          ...s,
          selected: keptIf(e.shift, s.selected),
          gesture: Gesture.Pressing({ start: at, kind: e.kind, then: 'brush' }),
        }),
        onSome: (item): SketchState => {
          const was = s.selected.includes(item.id);
          const selected = selectedAfter(s.selected, item.id, was, e.shift);
          // A shift-press that let a shape go moves nothing.
          if (!selected.includes(item.id)) return { ...s, selected };
          return {
            ...s,
            selected,
            gesture: Gesture.Pressing({ start: at, kind: e.kind, then: 'move' }),
          };
        },
      });
    }),
    Match.orElse((): SketchState => ({
      ...s,
      selected: [],
      gesture: Gesture.Pressing({ start: at, kind: e.kind, then: 'shape' }),
    })),
  );
};

/** The selection after a press on shape `id`: Shift adds it or lets it go; a plain press on one not selected selects it alone. */
const selectedAfter = (
  selected: ReadonlyArray<string>,
  id: string,
  was: boolean,
  shift: boolean,
): ReadonlyArray<string> => {
  if (shift && was) return selected.filter((s) => s !== id);
  if (shift) return [...selected, id];
  if (was) return selected;
  return [id];
};

/** A move: a stroke grows, a press past the drag distance becomes its drag, a drag follows. */
const move = (s: SketchState, view: View, e: Extract<SketchEvent, { _tag: 'Move' }>): SketchState =>
  Gesture.$match(s.gesture, {
    Idle: () => s,
    Editing: () => s,
    Pressing: (g) => {
      if (px(view, g.start, e.at) < DRAG_PX[g.kind]) return s;
      return Match.value(g.then).pipe(
        Match.when('shape', (): SketchState =>
          Option.match(sized(s, view, `s${s.next}`, g.start, e.at, e.shift), {
            onNone: () => idle(s),
            onSome: (item) => ({
              ...s,
              gesture: Gesture.Drawing({
                item,
                start: g.start,
                kind: g.kind,
                travelled: px(view, g.start, e.at),
              }),
            }),
          }),
        ),
        Match.when('move', (): SketchState =>
          move({ ...s, gesture: Gesture.Dragging({ start: g.start, base: s.items }) }, view, e),
        ),
        Match.when('brush', (): SketchState => ({
          ...s,
          gesture: Gesture.Brushing({ start: g.start, to: e.at, add: e.shift }),
        })),
        Match.exhaustive,
      );
    },
    Drawing: (g) => {
      const travelled = g.travelled + px(view, lastOf(g.item, g.start), e.at);
      if (g.item._tag === 'Pen') {
        const last = lastOf(g.item, g.start);
        // A point is kept once the pointer is a pixel from the last one kept.
        if (px(view, last, e.at) < 1) return s;
        const item: SketchItem = {
          ...g.item,
          points: [...g.item.points, pointOf(e.at, pressureOf(g.kind, e.pressure))],
        };
        return { ...s, gesture: Gesture.Drawing({ ...g, item, travelled }) };
      }
      return Option.match(sized(s, view, g.item.id, g.start, e.at, e.shift), {
        onNone: () => s,
        onSome: (item) => ({ ...s, gesture: Gesture.Drawing({ ...g, item, travelled }) }),
      });
    },
    Dragging: (g) => {
      const by = axisLocked(view, e.at.x - g.start.x, e.at.y - g.start.y, e.shift);
      return {
        ...s,
        items: g.base.map((i) => {
          if (!s.selected.includes(i.id)) return i;
          return moved(i, by.dx, by.dy);
        }),
      };
    },
    Brushing: (g) => ({
      ...s,
      gesture: Gesture.Brushing({ ...g, to: e.at, add: g.add || e.shift }),
    }),
    Erasing: (g) => ({
      ...s,
      gesture: Gesture.Erasing({
        ...g,
        marked: Arr.union(g.marked, crossed(s, view, g.last, e.at, g.kind)),
        last: e.at,
      }),
    }),
  });

/** A move by `dx`, `dy`, kept on its main axis (as the eye reads it, in view pixels) with `lock`. */
const axisLocked = (view: View, dx: number, dy: number, lock: boolean) => {
  if (!lock) return { dx, dy };
  if (Math.abs(dx * view.w) >= Math.abs(dy * view.h)) return { dx, dy: 0 };
  return { dx: 0, dy };
};

/** Where a stroke or a shape being drawn last reached. */
const lastOf = (item: SketchItem, start: At): At =>
  Match.valueTags(item, {
    Pen: (p) => Arr.lastNonEmpty(p.points),
    Arrow: (a) => a.to,
    Rect: () => start,
    Ellipse: () => start,
    Text: (t) => t.at,
  });

/** Undo: a gesture under way is called off and nothing is undone; else the shapes go back one step. */
const undo = (s: SketchState): SketchState => {
  if (s.gesture._tag === 'Editing') return idle(s);
  if (s.gesture._tag !== 'Idle') return cancel(s);
  return Option.match(Arr.last(s.past), {
    onNone: () => s,
    onSome: (before) => ({
      ...s,
      items: before,
      past: s.past.slice(0, -1),
      future: [s.items, ...s.future],
      selected: kept(s.selected, before),
    }),
  });
};

/** What Escape and Undo call off: the gesture as if it never was (a move put back), a stroke dropped too. */
const cancel = (s: SketchState): SketchState =>
  Gesture.$match(s.gesture, {
    Idle: () => s,
    Pressing: () => idle(s),
    Drawing: () => idle(s),
    Dragging: (g) => ({ ...idle(s), items: g.base }),
    Brushing: () => idle(s),
    Erasing: () => idle(s),
    Editing: () => idle(s),
  });

const redo = (s: SketchState): SketchState =>
  Option.match(Arr.head(s.future), {
    onNone: () => s,
    onSome: (after) => ({
      ...idle(s),
      items: after,
      past: [...s.past, s.items],
      future: s.future.slice(1),
      selected: kept(s.selected, after),
    }),
  });

/** The ids of `selected` that `items` still has. */
const kept = (selected: ReadonlyArray<string>, items: ReadonlyArray<SketchItem>) =>
  selected.filter((id) => items.some((i) => i.id === id));

/** Escape: a stroke is kept, a shape or a move called off; idle, the selection goes, then the tool goes back to Select. */
const escape = (s: SketchState, view: View): SketchState => {
  if (s.gesture._tag === 'Drawing' && s.gesture.item._tag === 'Pen') return finish(s, view);
  if (s.gesture._tag === 'Editing') return finish(s, view);
  if (s.gesture._tag !== 'Idle') return cancel(s);
  if (s.selected.length > 0) return { ...s, selected: [] };
  return { ...s, tool: 'select' };
};

/** One event heard by the surface shown at `view` (its size on screen, in pixels). */
export const step = (s: SketchState, e: SketchEvent, view: View): SketchState =>
  SketchEvent.$match(e, {
    Down: (d) => down(s, view, d),
    Move: (m) => move(s, view, m),
    Up: () => {
      if (s.gesture._tag === 'Editing') return s;
      return finish(s, view);
    },
    Lost: () => {
      if (s.gesture._tag === 'Editing') return s;
      if (s.gesture._tag === 'Pressing') return idle(s);
      if (s.gesture._tag === 'Erasing') return idle(s);
      return finish(s, view);
    },
    Second: () =>
      Gesture.$match(s.gesture, {
        Idle: () => s,
        Pressing: () => idle(s),
        Drawing: (g) => {
          if (g.item._tag === 'Pen' && g.travelled >= DRAG_PX[g.kind]) return finish(s, view);
          return idle(s);
        },
        Dragging: (g) => ({ ...idle(s), items: g.base }),
        Brushing: () => idle(s),
        Erasing: () => idle(s),
        Editing: () => s,
      }),
    Escape: () => escape(s, view),
    Delete: () => {
      if (s.gesture._tag !== 'Idle' || s.selected.length === 0) return s;
      return {
        ...done(
          s,
          s.items.filter((i) => !s.selected.includes(i.id)),
        ),
        selected: [],
      };
    },
    Undo: () => undo(s),
    Redo: () => {
      if (s.gesture._tag !== 'Idle') return s;
      return redo(s);
    },
    Tool: (t) => {
      const settled = callOff(s, view);
      return {
        ...settled,
        tool: t.tool,
        selected: keptIf(t.tool === 'select', settled.selected),
      };
    },
    Ink: (i) => ({
      ...s,
      ink: i.ink,
      // The selection takes the ink chosen, as one undo step.
      ...Option.match(
        Option.liftPredicate(s, (now) => now.gesture._tag === 'Idle' && now.selected.length > 0),
        {
          onNone: () => ({}),
          onSome: (now) =>
            done(
              { ...now, ink: i.ink },
              now.items.map((item) => {
                if (!now.selected.includes(item.id)) return item;
                return { ...item, ink: i.ink };
              }),
            ),
        },
      ),
    }),
    Type: (t) => {
      if (s.gesture._tag !== 'Editing') return s;
      return { ...s, gesture: Gesture.Editing({ ...s.gesture, text: t.text }) };
    },
    Commit: () => {
      if (s.gesture._tag !== 'Editing') return s;
      return finish(s, view);
    },
    Clear: () => {
      if (s.items.length === 0) return cancel(s);
      return { ...done(cancel(s), []), selected: [] };
    },
  });

/**
 * What the surface shows: the shapes, with the one being drawn among them
 * (a move's shapes where they are now), and the shapes the eraser has marked
 * (drawn dimmed until it lets go).
 */
export const shownOf = (
  s: SketchState,
): { readonly items: ReadonlyArray<SketchItem>; readonly marked: ReadonlyArray<string> } =>
  Gesture.$match(s.gesture, {
    Idle: () => ({ items: s.items, marked: [] }),
    Pressing: () => ({ items: s.items, marked: [] }),
    Drawing: (g) => ({ items: [...s.items, g.item], marked: [] }),
    Dragging: () => ({ items: s.items, marked: [] }),
    Brushing: () => ({ items: s.items, marked: [] }),
    Erasing: (g) => ({ items: s.items, marked: g.marked }),
    Editing: () => ({ items: s.items, marked: [] }),
  });

/** Whether `s` has anything to undo or redo, as the toolbar's buttons show. */
export const canUndo = (s: SketchState): boolean => s.past.length > 0 || s.gesture._tag !== 'Idle';
export const canRedo = (s: SketchState): boolean =>
  s.future.length > 0 && s.gesture._tag === 'Idle';
