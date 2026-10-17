// The sketch surface as compound components, our own clean-room surface on
// perfect-freehand (MIT; no tldraw code or package: its licence is
// source-available): `<Sketch.Provider>` holds the sketch's one machine
// (`gesture.ts`), as its owner keeps it, and its commands; `<Sketch.Surface>`
// is the layer the hand draws on, over a picture, in the picture's own
// pixels (`width` × `height`: the film's, in an `svg.lab-overlay` over the
// try the studio's markup shows); and
// `<Sketch.Toolbar>` the tools, the inks, Undo, Redo, Delete and Clear;
// `<Sketch.Keys>` puts its commands on the page while it is mounted. A
// pointer, a pen and a finger are heard alike (`touch-action: none`: the page
// never scrolls or zooms under a drawing finger), a pen's pressure kept, a
// second finger calling a gesture off. Its keys are commands (V P A R O T E,
// Delete, ⌘Z, ⇧⌘Z, Escape), on the page only while `Keys` is mounted: the
// page mounts it with the surface, so a key drawn with is never a key the
// page's other views lose while nothing is being drawn.

import { For, Show } from '@solidjs/web';
import { Boolean as Bool, Effect, Option } from 'effect';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, onCleanup, onSettled, useContext } from 'solid-js';
import { Pointer, Surface as PressSurface } from '../../browser/pointer.ts';
import { type Command, quietly } from '../../command/command.ts';
import type { Hub } from '../../command/hub.ts';
import { focusFor } from '../focus.ts';
import { pressed } from '../pressed.ts';
import type { Host } from '../../browser/host.ts';
import {
  type PointerKind,
  SKETCH_INKS,
  SKETCH_TOOLS,
  type SketchEvent,
  SketchEvent as E,
  type SketchInk,
  type SketchState,
  type SketchTool,
  canRedo,
  canUndo,
  shownOf,
} from './gesture.ts';
import { INK_COLOUR, drawnOf, lineWidth, textSize } from '../../canvas/sketch.ts';
import { type SketchItem, TEXT_LINE } from '../../core/sketch.ts';

/** The size the surface is shown at, in screen pixels: what the machine's distances are measured in. */
type ScreenView = { readonly w: number; readonly h: number };

interface SketchContextValue {
  /** The page's host: the pointer a stroke is pressed through. */
  readonly host: Host;
  readonly state: Accessor<SketchState>;
  readonly send: (event: SketchEvent, view: ScreenView) => void;
  /** The size the surface is shown at now (a toolbar's event has none of its own). */
  readonly view: () => ScreenView;
  readonly setView: (read: () => ScreenView) => void;
}

const SketchContext = createContext<SketchContextValue>();

const useSketch = (): SketchContextValue => useContext(SketchContext);

/** Each tool's name, its key, and its glyph's strokes (24 × 24). */
const TOOL: Readonly<
  Record<SketchTool, { readonly label: string; readonly key: string; readonly d: string }>
> = {
  select: { label: 'Select', key: 'v', d: 'M6 4l12 8-5 1.5 3 6-2.5 1-3-6L6 18z' },
  pen: { label: 'Pen', key: 'p', d: 'M4 20l3-1 11-11-2-2L5 17zM14 6l2 2' },
  arrow: { label: 'Arrow', key: 'a', d: 'M5 19L19 5M10 5h9v9' },
  rect: { label: 'Rectangle', key: 'r', d: 'M4 6h16v12H4z' },
  ellipse: {
    label: 'Ellipse',
    key: 'o',
    d: 'M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z',
  },
  text: { label: 'Text', key: 't', d: 'M5 6h14M12 6v13M9 19h6' },
  eraser: { label: 'Eraser', key: 'e', d: 'M8 19h11M4 15l9-9 6 6-7 7H8z' },
};

/** Each ink's name, as the toolbar says it. */
const INK_NAME: Readonly<Record<SketchInk, string>> = {
  ink: 'Black ink',
  red: 'Red ink',
  gold: 'Gold ink',
};

/** The sketch's commands: a key for each tool, and Delete, Undo, Redo and Escape over the shapes. */
const sketchCommands = (s: SketchContextValue): ReadonlyArray<Command> => {
  const send = (e: SketchEvent) => s.send(e, s.view());
  return [
    ...SKETCH_TOOLS.map((tool): Command => ({
      id: `sketch.tool-${tool}`,
      label: `Draw with ${TOOL[tool].label}`,
      group: 'Sketch',
      keys: [TOOL[tool].key],
      touch: `the ${TOOL[tool].label} button over the panel`,
      when: () => true,
      run: quietly(() => send(E.Tool({ tool }))),
    })),
    {
      id: 'sketch.undo',
      label: 'Undo in the sketch',
      group: 'Sketch',
      keys: ['mod+z'],
      touch: 'the Undo button over the panel',
      when: () => canUndo(s.state()),
      run: quietly(() => send(E.Undo())),
    },
    {
      id: 'sketch.redo',
      label: 'Redo in the sketch',
      group: 'Sketch',
      keys: ['mod+shift+z'],
      touch: 'the Redo button over the panel',
      when: () => canRedo(s.state()),
      run: quietly(() => send(E.Redo())),
    },
    {
      id: 'sketch.delete',
      label: 'Delete the shapes selected',
      group: 'Sketch',
      keys: ['delete', 'backspace'],
      touch: 'select shapes, then Delete over the panel',
      when: () => s.state().selected.length > 0,
      run: quietly(() => send(E.Delete())),
    },
    {
      id: 'sketch.escape',
      label: 'Stop the shape, or let the selection go',
      group: 'Sketch',
      keys: ['escape'],
      keysIn: ['page', 'field'],
      touch: 'the Select button over the panel',
      when: () => true,
      run: quietly(() => send(E.Escape())),
    },
  ];
};

/** The sketch's machine, as its owner keeps it, over the page's host. */
const Provider = (
  props: ParentProps<{
    readonly host: Host;
    readonly state: Accessor<SketchState>;
    readonly send: (event: SketchEvent, view: ScreenView) => void;
  }>,
) => {
  let read = (): ScreenView => ({ w: 1, h: 1 });
  const value: SketchContextValue = {
    host: props.host,
    state: props.state,
    send: (e, v) => props.send(e, v),
    view: () => read(),
    setView: (r) => {
      read = r;
    },
  };
  return <SketchContext value={value}>{props.children}</SketchContext>;
};

/** The sketch's commands on the page's hub, while this is mounted. */
const Keys = (props: { readonly hub: Hub }) => {
  onCleanup(props.hub.commands.register(...sketchCommands(useSketch())));
  return <></>;
};

/** The shape `item` when it is a text. */
const textOf = (item: SketchItem): Option.Option<Extract<SketchItem, { _tag: 'Text' }>> =>
  Option.liftPredicate(item, (i): i is Extract<SketchItem, { _tag: 'Text' }> => i._tag === 'Text');

/** What a pointer event says of its device. */
const kindOf = (e: PointerEvent): PointerKind => {
  if (e.pointerType === 'pen') return 'pen';
  if (e.pointerType === 'touch') return 'touch';
  return 'mouse';
};

/** Each move a pointer event carries: its coalesced moves when the browser keeps them, else itself. */
const movesOf = (e: PointerEvent): ReadonlyArray<PointerEvent> =>
  Option.getOrElse(
    Option.filter(
      Option.map(Option.fromUndefinedOr(e.getCoalescedEvents), (coalesced) => coalesced.call(e)),
      (events) => events.length > 0,
    ),
    () => [e],
  );

/** A drawn shape's paint: its ink filled, or its ink stroked. */
const paintOf = (fill: boolean, ink: string) =>
  Bool.match(fill, {
    onTrue: () => ({ fill: ink, stroke: 'none' }),
    onFalse: () => ({ fill: 'none', stroke: ink }),
  });

/** The surface: the shapes drawn, the one being drawn, the text being typed, over `width` × `height`. */
const Surface = (props: { readonly width: number; readonly height: number }) => {
  const sketch = useSketch();
  const view = { w: props.width, h: props.height };
  let svg = Option.none<SVGGraphicsElement>();
  const screen = (): ScreenView =>
    Option.match(svg, {
      onNone: () => ({ w: props.width, h: props.height }),
      onSome: (el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
      },
    });
  sketch.setView(screen);
  /**
   * One press draws at a time (`Pointer.press`): the pointer that pressed
   * first draws, and a second one down meanwhile calls the gesture off.
   */
  const strokes = new PressSurface('the sketch');
  let leading = Option.none<number>();
  const at = (e: PointerEvent) =>
    Option.match(svg, {
      onNone: () => ({ x: 0, y: 0 }),
      onSome: (el) => {
        const r = el.getBoundingClientRect();
        return {
          x: (e.clientX - r.left) / Math.max(1, r.width),
          y: (e.clientY - r.top) / Math.max(1, r.height),
        };
      },
    });
  const pressure = (e: PointerEvent) =>
    Option.liftPredicate(e.pressure, () => e.pointerType === 'pen');
  const send = (event: SketchEvent) => sketch.send(event, screen());
  const shown = () => shownOf(sketch.state());
  const editing = () => {
    const g = sketch.state().gesture;
    return Option.liftPredicate(
      g,
      (x): x is Extract<typeof g, { _tag: 'Editing' }> => x._tag === 'Editing',
    );
  };
  const brushing = () => {
    const g = sketch.state().gesture;
    return Option.liftPredicate(
      g,
      (x): x is Extract<typeof g, { _tag: 'Brushing' }> => x._tag === 'Brushing',
    );
  };
  return (
    <g
      class="lab-sketch"
      data-tool={sketch.state().tool}
      data-gesture={sketch.state().gesture._tag}
    >
      <rect
        class="lab-sketch-catch"
        x="0"
        y="0"
        width={props.width}
        height={props.height}
        ref={(el: SVGRectElement) => {
          svg = Option.some(el);
        }}
        // A press here never moves the keyboard's focus: the text it opens takes it, and keeps it.
        onMouseDown={(e: MouseEvent) => e.preventDefault()}
        onPointerDown={(e: PointerEvent) => {
          if (Option.isSome(leading)) {
            send(E.Second());
            return;
          }
          Effect.runForkWith(sketch.host)(
            Pointer.use((pointer) =>
              pointer.press(e, strokes, () => {
                leading = Option.some(e.pointerId);
                send(
                  E.Down({ at: at(e), kind: kindOf(e), shift: e.shiftKey, pressure: pressure(e) }),
                );
                return Option.some({
                  move: (ev: PointerEvent) => {
                    for (const m of movesOf(ev))
                      send(E.Move({ at: at(m), shift: ev.shiftKey, pressure: pressure(m) }));
                  },
                  // Lifted, the gesture is done; the browser took the press (a cancel, the capture lost): it is lost.
                  end: (lifted: Option.Option<PointerEvent>) => {
                    leading = Option.none();
                    send(Option.match(lifted, { onNone: () => E.Lost(), onSome: () => E.Up() }));
                  },
                });
              }),
            ),
          );
        }}
      />
      <g class="lab-sketch-items" stroke-width={lineWidth(view)}>
        <For each={shown().items}>
          {(item) => (
            <Show
              when={item._tag !== 'Text'}
              fallback={
                <Show when={Option.getOrUndefined(textOf(item))}>
                  {(t) => (
                    // Set from its top, a line a step below the last, as the canvas sets it and the box reads it.
                    <text
                      class="lab-sketch-text"
                      x={t().at.x * props.width}
                      y={t().at.y * props.height}
                      font-size={String(textSize(view))}
                      fill={INK_COLOUR[t().ink]}
                      data-selected={pressed(sketch.state().selected.includes(t().id))}
                      data-marked={pressed(shown().marked.includes(t().id))}
                    >
                      <For each={t().text.split('\n')}>
                        {(line, i) => (
                          <tspan
                            x={t().at.x * props.width}
                            y={t().at.y * props.height + i() * textSize(view) * TEXT_LINE}
                          >
                            {line}
                          </tspan>
                        )}
                      </For>
                    </text>
                  )}
                </Show>
              }
            >
              <path
                class="lab-sketch-item"
                d={drawnOf(view, item).d}
                fill={paintOf(drawnOf(view, item).fill, INK_COLOUR[item.ink]).fill}
                stroke={paintOf(drawnOf(view, item).fill, INK_COLOUR[item.ink]).stroke}
                data-selected={pressed(sketch.state().selected.includes(item.id))}
                data-marked={pressed(shown().marked.includes(item.id))}
              />
            </Show>
          )}
        </For>
        <Show when={Option.getOrUndefined(brushing())}>
          {(g) => {
            const brush = () => {
              const b = g();
              if (b._tag !== 'Brushing') return { x: 0, y: 0, w: 0, h: 0 };
              return {
                x: Math.min(b.start.x, b.to.x) * props.width,
                y: Math.min(b.start.y, b.to.y) * props.height,
                w: Math.abs(b.to.x - b.start.x) * props.width,
                h: Math.abs(b.to.y - b.start.y) * props.height,
              };
            };
            return (
              <path
                class="lab-sketch-brush"
                d={`M${brush().x} ${brush().y}h${brush().w}v${brush().h}h${-brush().w}Z`}
              />
            );
          }}
        </Show>
      </g>
      <Show when={Option.getOrUndefined(editing())}>
        {(g) => {
          // The field takes the keys once it is on the page.
          let field = Option.none<HTMLInputElement>();
          onSettled(() => {
            Option.map(field, (el) => focusFor(el, 'pointer'));
          });
          return (
            <foreignObject
              x={g().at.x * props.width}
              y={g().at.y * props.height - textSize(view) * 0.2}
              width={Math.max(160, props.width * (1 - g().at.x))}
              height={textSize(view) * 1.8}
            >
              <form
                class="lab-sketch-typing"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(E.Commit());
                }}
              >
                <input
                  class="lab-sketch-input"
                  aria-label="The words to pin here"
                  placeholder="Type, then Enter"
                  style={{
                    '--sketch-size': `${textSize(view)}px`,
                    '--sketch-ink': INK_COLOUR[sketch.state().ink],
                  }}
                  value={g().text}
                  ref={(el: HTMLInputElement) => {
                    field = Option.some(el);
                  }}
                  onInput={(e) => send(E.Type({ text: e.currentTarget.value }))}
                  onBlur={() => send(E.Commit())}
                />
              </form>
            </foreignObject>
          );
        }}
      </Show>
    </g>
  );
};

/** A toolbar button's glyph. */
const Glyph = (props: { readonly d: string }) => (
  <svg class="lab-sketch-glyph" viewBox="0 0 24 24" aria-hidden="true">
    <path d={props.d} />
  </svg>
);

/** The tools, the inks, Undo, Redo, Delete and Clear. */
const Toolbar = () => {
  const sketch = useSketch();
  const send = (e: SketchEvent) => sketch.send(e, sketch.view());
  return (
    <div class="lab-sketch-bar" role="toolbar" aria-label="Sketch">
      <div class="lab-sketch-group" role="group" aria-label="Tool">
        <For each={SKETCH_TOOLS}>
          {(tool) => (
            <button
              type="button"
              class="sh-btn lab-sketch-tool"
              aria-pressed={pressed(sketch.state().tool === tool)}
              aria-label={TOOL[tool].label}
              title={`${TOOL[tool].label} (${TOOL[tool].key.toUpperCase()})`}
              onClick={() => send(E.Tool({ tool }))}
            >
              <Glyph d={TOOL[tool].d} />
            </button>
          )}
        </For>
      </div>
      <div class="lab-sketch-group" role="group" aria-label="Ink">
        <For each={SKETCH_INKS}>
          {(ink) => (
            <button
              type="button"
              class="sh-btn lab-sketch-ink"
              aria-pressed={pressed(sketch.state().ink === ink)}
              aria-label={INK_NAME[ink]}
              title={INK_NAME[ink]}
              style={{ '--ink': INK_COLOUR[ink] }}
              onClick={() => send(E.Ink({ ink }))}
            >
              <span class="lab-sketch-swatch" />
            </button>
          )}
        </For>
      </div>
      <div class="lab-sketch-group" role="group" aria-label="History">
        <button
          type="button"
          class="sh-btn"
          disabled={!canUndo(sketch.state())}
          onClick={() => send(E.Undo())}
        >
          Undo
        </button>
        <button
          type="button"
          class="sh-btn"
          disabled={!canRedo(sketch.state())}
          onClick={() => send(E.Redo())}
        >
          Redo
        </button>
        <button
          type="button"
          class="sh-btn"
          disabled={sketch.state().selected.length === 0}
          onClick={() => send(E.Delete())}
        >
          Delete
        </button>
        <button
          type="button"
          class="sh-btn"
          disabled={sketch.state().items.length === 0}
          onClick={() => send(E.Clear())}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export const Sketch = { Provider, Surface, Toolbar, Keys };
