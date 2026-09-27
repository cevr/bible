// A film's Rive project as the tools read it: `rive inspect --json`, decoded,
// then reduced to what the film needs of each artboard. A scene is the artboard
// named after its beat. Its `main` timeline is the scene's own clock, drawn at
// any pace, and each Event keyed on that timeline is a moment the film can
// name: a `{mark}` the voice pins it to, or a cue a sound plays on. Pure.

import { Array as Arr, Option, Order, Schema } from 'effect';

/** One object of the inspected document: its type, its identity, the properties the film reads, its children. */
export interface RiveNode {
  readonly type: string;
  readonly id?: string;
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
  readonly fps?: number;
  /** A timeline's length, in frames. */
  readonly duration?: number;
  readonly frame?: number;
  readonly objectId?: string;
  readonly propertyKey?: number;
  readonly artboardId?: string;
  readonly text?: string;
  readonly children?: ReadonlyArray<RiveNode>;
}

export const RiveNode = Schema.Struct({
  type: Schema.String,
  id: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  width: Schema.optionalKey(Schema.Finite),
  height: Schema.optionalKey(Schema.Finite),
  x: Schema.optionalKey(Schema.Finite),
  y: Schema.optionalKey(Schema.Finite),
  fps: Schema.optionalKey(Schema.Finite),
  duration: Schema.optionalKey(Schema.Finite),
  frame: Schema.optionalKey(Schema.Finite),
  objectId: Schema.optionalKey(Schema.String),
  propertyKey: Schema.optionalKey(Schema.Finite),
  artboardId: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
  children: Schema.optionalKey(
    Schema.Array(Schema.suspend((): Schema.Codec<RiveNode> => RiveNode)),
  ),
});

/** A compiler problem, as `rive inspect` lists it. */
export const RiveProblem = Schema.Struct({
  severity: Schema.String,
  kind: Schema.String,
  file: Schema.optionalKey(Schema.String),
  line: Schema.optionalKey(Schema.Finite),
  message: Schema.String,
});
export type RiveProblem = typeof RiveProblem.Type;

/** `rive inspect --json`: what the project builds to. */
export const Inspected = Schema.Struct({
  problems: Schema.Array(RiveProblem),
  artboards: Schema.Array(RiveNode),
  roots: Schema.Array(RiveNode),
});
export type Inspected = typeof Inspected.Type;

/** The `Event.trigger` property: a key on it fires the Event at its frame. */
export const EVENT_TRIGGER = 395;

/** The timeline a scene is drawn on; every other timeline is the scene's own business. */
export const MAIN = 'main';

/** A node of this name marks a scene as a storyboard: seeded by `film sync`, not drawn yet. */
export const STORYBOARD = 'storyboard';

/** A moment on a scene's timeline: an Event keyed there, in the timeline's seconds. */
export interface SceneEvent {
  readonly name: string;
  readonly id: string;
  readonly at: number;
}

/** The timeline a scene is drawn on. */
export interface SceneTimeline {
  readonly id: string;
  readonly fps: number;
  readonly frames: number;
  /** Its length in seconds: where the scene's last drawn moment is. */
  readonly seconds: number;
}

/** A line of text a scene can show, by the name of its run. */
export interface TextRun {
  readonly name: string;
  readonly text: string;
}

/** An artboard as a scene. */
export interface SceneBoard {
  readonly name: string;
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly main: Option.Option<SceneTimeline>;
  /** Every Event keyed on `main`, in time order; one keyed twice is listed twice. */
  readonly events: ReadonlyArray<SceneEvent>;
  /** Events the artboard declares that `main` never fires. */
  readonly unkeyed: ReadonlyArray<string>;
  readonly runs: ReadonlyArray<TextRun>;
  readonly storyboard: boolean;
  /** Whether another artboard may nest it: a `ComponentAsset` names it. */
  readonly component: boolean;
}

export interface FontRef {
  readonly id: string;
  readonly name: string;
}

/** A film's Rive project: its artboards by name, its fonts, and what the compiler said. */
export interface RiveDocument {
  readonly boards: ReadonlyMap<string, SceneBoard>;
  readonly fonts: ReadonlyArray<FontRef>;
  readonly problems: ReadonlyArray<RiveProblem>;
}

/** Every node under `node`, depth first, the node itself included. */
const descendants = (node: RiveNode): ReadonlyArray<RiveNode> => [
  node,
  ...(node.children ?? []).flatMap(descendants),
];

/** A node's drawing tree: everything but its timelines and state machines. */
const drawn = (node: RiveNode): ReadonlyArray<RiveNode> =>
  (node.children ?? [])
    .filter((c) => c.type !== 'LinearAnimation' && c.type !== 'StateMachine')
    .flatMap(descendants);

const byTime = Order.mapInput(Order.Number, (e: SceneEvent) => e.at);

/** Where each Event fires on `timeline`, in its seconds. */
const eventsOn = (
  timeline: RiveNode,
  fps: number,
  declared: ReadonlyMap<string, string>,
): ReadonlyArray<SceneEvent> =>
  (timeline.children ?? [])
    .filter((k) => k.type === 'KeyedObject')
    .flatMap((keyed) =>
      Option.match(Option.fromNullishOr(declared.get(keyed.objectId ?? '')), {
        onNone: () => [],
        onSome: (name) =>
          (keyed.children ?? [])
            .filter((p) => p.type === 'KeyedProperty' && p.propertyKey === EVENT_TRIGGER)
            .flatMap((p) => p.children ?? [])
            .filter((k) => k.type === 'KeyFrameCallback')
            .map((k) => ({ name, id: keyed.objectId ?? '', at: (k.frame ?? 0) / fps })),
      }),
    );

/** The nodes of type `type` that carry an id, each with its id. */
const withIds = (nodes: ReadonlyArray<RiveNode>, type: string) =>
  nodes
    .filter((n) => n.type === type)
    .flatMap((n) =>
      Option.toArray(
        Option.map(Option.fromNullishOr(n.id), (id): readonly [string, RiveNode] => [id, n]),
      ),
    );

/** One artboard as a scene; `components` are the artboard ids a `ComponentAsset` names. */
export const sceneBoard = (artboard: RiveNode, components: ReadonlySet<string>): SceneBoard => {
  const nodes = drawn(artboard);
  const declared = new Map(
    withIds(nodes, 'Event').map(([id, n]): readonly [string, string] => [id, n.name ?? '']),
  );
  const timeline = Arr.findFirst(
    artboard.children ?? [],
    (c) => c.type === 'LinearAnimation' && c.name === MAIN,
  );
  const main = Option.map(timeline, (t): SceneTimeline => {
    const fps = t.fps ?? 60;
    const frames = t.duration ?? 0;
    return { id: t.id ?? '', fps, frames, seconds: frames / fps };
  });
  const events = Option.match(
    Option.zipWith(timeline, main, (t, m): readonly [RiveNode, SceneTimeline] => [t, m]),
    {
      onNone: () => [],
      onSome: ([t, m]) => Arr.sort(eventsOn(t, m.fps, declared), byTime),
    },
  );
  const keyed = new Set(events.map((e) => e.id));
  return {
    name: artboard.name ?? '',
    id: artboard.id ?? '',
    width: artboard.width ?? 0,
    height: artboard.height ?? 0,
    x: artboard.x ?? 0,
    y: artboard.y ?? 0,
    main,
    events,
    unkeyed: [...declared].filter(([id]) => !keyed.has(id)).map(([, name]) => name),
    runs: nodes
      .filter((n) => n.type === 'TextValueRun')
      .map((n) => ({ name: n.name ?? '', text: n.text ?? '' })),
    storyboard: nodes.some((n) => n.name === STORYBOARD),
    component: components.has(artboard.id ?? ''),
  };
};

/** The inspected project as the film reads it. */
export const riveDocument = (inspected: Inspected): RiveDocument => {
  const components = new Set(
    inspected.roots
      .filter((r) => r.type === 'ComponentAsset')
      .flatMap((r) => Option.toArray(Option.fromNullishOr(r.artboardId))),
  );
  return {
    boards: new Map(
      inspected.artboards.map((a): readonly [string, SceneBoard] => [
        a.name ?? '',
        sceneBoard(a, components),
      ]),
    ),
    fonts: withIds(inspected.roots, 'FontAsset').map(([id, r]) => ({ id, name: r.name ?? '' })),
    problems: inspected.problems,
  };
};
