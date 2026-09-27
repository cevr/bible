// A storyboard: the artboard `film sync` seeds for a beat nobody has drawn
// yet. It shows the beat's picture brief and names each mark as the voice
// reaches it. It already carries what a drawn scene keeps: a `main` timeline
// as long as the beat, and an Event per mark at its spoken time, so the film
// plays in sync from its first sync and a drawing starts on the right clock.
// Everything under the node named `storyboard` is the card; drawing the scene
// replaces that node (and its keys) and keeps the Events. Pure.

import { Array as Arr, Option } from 'effect';
import type { Placed } from './layout.ts';
import { type Element, argb, el, fragment, rmlId } from './rml.ts';
import { EVENT_TRIGGER, MAIN, STORYBOARD } from './rive.ts';

/** Property keys (`rive schema Node`). */
const OPACITY = 18;

/** The card's look: parchment, ink, and a warm accent for the mark that is sounding. */
const PAPER = '#efe6d2';
const INK = '#2a3440';
const ACCENT = '#b0533c';

export interface StoryboardInput {
  /** The beat: its id names the artboard; its brief is the card. */
  readonly beat: { readonly id: string; readonly picture: string };
  readonly placed: Placed;
  /** The scene's own id space: a client number unique to this scene. */
  readonly client: number;
  /** A `FontAsset` id to set the card in. */
  readonly font: string;
  readonly width: number;
  readonly height: number;
  /** Where the artboard sits on the editor's backboard. */
  readonly x: number;
  readonly y: number;
}

/** The fps a storyboard's timeline runs at: Rive's own. */
const FPS = 60;

/**
 * The client number for a scene's ids: a hash of its beat id, kept clear of
 * the small numbers the editor hands its sessions and of the Film's own.
 */
export const sceneClient = (beat: string): number => {
  let h = 2166136261;
  for (let i = 0; i < beat.length; i++) h = Math.imul(h ^ beat.charCodeAt(i), 16777619);
  return 100_000 + ((h >>> 0) % 700_000);
};

/** A line of text: a `Text`, its style and the one run it holds, named `run`. */
const text = (
  ids: (n: number) => string,
  base: number,
  props: {
    readonly name: string;
    readonly run: string;
    readonly value: string;
    readonly font: string;
    readonly size: number;
    readonly color: string;
    readonly layout: Readonly<Record<string, string | number>>;
  },
): Element =>
  el('Text', { ...props.layout, name: props.name, id: ids(base) }, [
    el(
      'TextStylePaint',
      {
        fontSize: props.size,
        fontAssetId: props.font,
        name: `${props.name} style`,
        id: ids(base + 1),
      },
      [
        el('Fill', { name: 'Fill', id: ids(base + 2) }, [
          el('SolidColor', { colorValue: argb(props.color), name: 'Color', id: ids(base + 3) }),
        ]),
      ],
    ),
    el('TextValueRun', {
      styleId: ids(base + 1),
      text: props.value,
      name: props.run,
      id: ids(base + 4),
    }),
  ]);

/** The storyboard for one beat: its artboard, and the `ComponentAsset` that lets the Film nest it. */
export const storyboardElements = (input: StoryboardInput): ReadonlyArray<Element> => {
  const ids = (n: number) => rmlId(input.client, n);
  const frame = (seconds: number) => Math.max(0, Math.round(seconds * FPS));
  const frames = frame(input.placed.dur);
  const marks = [...input.placed.voice.marks]
    .map(([name, at]) => ({ name, at: frame(input.placed.speechStart + at) }))
    .sort((a, b) => a.at - b.at);
  const label = (i: number) => 1000 + 10 * i;
  const event = (i: number) => label(i) + 5;
  const card = el('Node', { x: 0, y: 0, name: STORYBOARD, id: ids(10) }, [
    text(ids, 11, {
      name: 'Beat',
      run: 'beat',
      value: input.beat.id,
      font: input.font,
      size: 56,
      color: INK,
      layout: { x: 96, y: 72, sizingValue: 'autoWidth' },
    }),
    text(ids, 16, {
      name: 'Brief',
      run: 'brief',
      value: input.beat.picture,
      font: input.font,
      size: 34,
      color: INK,
      layout: {
        x: 96,
        y: 180,
        width: input.width - 192,
        sizingValue: 'autoHeight',
        wrapValue: 'wrap',
      },
    }),
    ...marks.map((m, i) =>
      text(ids, label(i), {
        name: `Mark ${m.name}`,
        run: `mark ${m.name}`,
        value: `{${m.name}}`,
        font: input.font,
        size: 64,
        color: ACCENT,
        layout: {
          x: input.width / 2,
          y: input.height - 120,
          originX: 0.5,
          originY: 0.5,
          sizingValue: 'autoWidth',
          opacity: 0,
        },
      }),
    ),
  ]);
  // Each mark's label shows from its word until a later mark's.
  const labelKeys = marks.map((m, i) => {
    const until = Arr.findFirst(marks, (n) => n.at > m.at);
    return el('KeyedObject', { objectId: ids(label(i)), id: ids(2000 + 10 * i) }, [
      el('KeyedProperty', { propertyKey: OPACITY, id: ids(2001 + 10 * i) }, [
        el('KeyFrameDouble', {
          value: 0,
          frame: 0,
          interpolationType: 'hold',
          id: ids(2002 + 10 * i),
        }),
        el('KeyFrameDouble', {
          value: 1,
          frame: m.at,
          interpolationType: 'hold',
          id: ids(2003 + 10 * i),
        }),
        ...Option.toArray(
          Option.map(until, (n) =>
            el('KeyFrameDouble', {
              value: 0,
              frame: n.at,
              interpolationType: 'hold',
              id: ids(2004 + 10 * i),
            }),
          ),
        ),
      ]),
    ]);
  });
  const eventKeys = marks.map((m, i) =>
    el('KeyedObject', { objectId: ids(event(i)), id: ids(3000 + 10 * i) }, [
      el('KeyedProperty', { propertyKey: EVENT_TRIGGER, id: ids(3001 + 10 * i) }, [
        el('KeyFrameCallback', { frame: m.at, id: ids(3002 + 10 * i) }),
      ]),
    ]),
  );
  const artboard = el(
    'Artboard',
    {
      isComponent: true,
      defaultStateMachineId: ids(40),
      clip: true,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      styleId: ids(2),
      name: input.beat.id,
      id: ids(1),
    },
    [
      el('Fill', { name: 'Background', id: ids(3) }, [
        el('SolidColor', { colorValue: argb(PAPER), name: 'Color', id: ids(4) }),
      ]),
      el('LayoutComponentStyle', { name: 'Artboard Style', id: ids(2) }),
      card,
      ...marks.map((m, i) => el('Event', { name: m.name, id: ids(event(i)) })),
      el('StateMachine', { name: 'Play', id: ids(40) }, [
        el('StateMachineLayer', { name: 'Layer', id: ids(41) }, [
          el('AnyState', { x: 400, y: -120, id: ids(42) }),
          el('ExitState', { x: 600, y: -120, id: ids(43) }),
          el('EntryState', { x: 0, y: 0, id: ids(44) }, [
            el('StateTransition', { stateToId: ids(46), id: ids(45) }),
          ]),
          el('AnimationState', { x: 200, y: 0, animationId: ids(30), id: ids(46) }),
        ]),
      ]),
      el('LinearAnimation', { fps: FPS, duration: frames, name: MAIN, id: ids(30) }, [
        ...eventKeys,
        ...labelKeys,
      ]),
    ],
  );
  return [artboard, el('ComponentAsset', { artboardId: ids(1), name: input.beat.id, id: ids(5) })];
};

/** `scenes/<beat>.rml`. */
export const storyboardRml = (input: StoryboardInput): string =>
  fragment(storyboardElements(input));
