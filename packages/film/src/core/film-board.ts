// The Film: one artboard that nests every scene and plays each on the voice's
// clock. `film sync` writes it to `film.rml` from the film's layout and its
// scenes' timelines. Nobody edits it: a new take, a changed lead or a scene
// redrawn in the editor rewrites it, and the scenes themselves never change.
// Every id in it is the Film's own (`FILM_CLIENT`), laid out by scene, so a
// rewrite moves only what changed and a push patches only that. Pure.

import { Array as Arr, Option, Order } from 'effect';
import { type Placed, transitionDur } from './layout.ts';
import { type Element, argb, el, fragment, num, rmlId } from './rml.ts';
import { EVENT_TRIGGER, type SceneBoard } from './rive.ts';
import type { Transition } from './schema.ts';
import type { Knot } from './warp.ts';

/** The Film artboard's name. */
export const FILM = 'Film';
/** The Film's timeline: the whole film, start to end. */
export const FILM_TIMELINE = 'film';
/** The Film's timeline runs at Rive's own 60 fps; a render samples it at its own rate. */
export const FILM_FPS = 60;
/** The Film's id space: a client number no editor session is handed. */
export const FILM_CLIENT = 881888;
/** The preview soundtrack's asset name. */
export const SOUNDTRACK = 'soundtrack';

/** Property keys (`rive schema Node`, `NestedRemapAnimation`). */
const X = 13;
const OPACITY = 18;
const REMAP_TIME = 202;

/** A scene as the Film nests it: where the layout put it, its board, and its warp. */
export interface FilmScene {
  readonly placed: Placed;
  readonly board: SceneBoard;
  readonly knots: ReadonlyArray<Knot>;
}

export interface FilmBoard {
  /** The frame: every scene is drawn at this size. */
  readonly width: number;
  readonly height: number;
  /** The scenes in film order. */
  readonly scenes: ReadonlyArray<FilmScene>;
  /** The preview soundtrack, a file in the project; none until the film has a mix. */
  readonly soundtrack: Option.Option<string>;
}

const id = (object: number) => rmlId(FILM_CLIENT, object);

/** A scene's block of ids: ten thousand to a scene, after the Film's own. */
const block = (index: number) => (role: number) => id(10_000 * (index + 1) + role);

const frameOf = (seconds: number) => Math.max(0, Math.round(seconds * FILM_FPS));

type Interpolation = 'hold' | 'linear' | 'cubic';

interface Key {
  readonly frame: number;
  readonly value: number;
  readonly interpolation: Interpolation;
}

/** One key per frame, the last written winning, in frame order. */
const settle = (keys: ReadonlyArray<Key>): ReadonlyArray<Key> =>
  Arr.sort(
    [...new Map(keys.map((k): readonly [number, Key] => [k.frame, k])).values()],
    Order.mapInput(Order.Number, (k: Key) => k.frame),
  );

/** Ease in and out, CSS's `ease-in-out`: a slide starts and settles gently. */
const easeInOut = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };

/** One property's keys, with the ids of its property, its keys and their ease curves. */
interface Track {
  readonly property: number;
  readonly keys: ReadonlyArray<Key>;
  readonly id: string;
  readonly key: (i: number) => string;
  readonly ease: (i: number) => string;
}

/** A cubic key's curve, written under it; other keys have none. */
const curve = (key: Key, id: string): ReadonlyArray<Element> => {
  if (key.interpolation !== 'cubic') return [];
  return [el('CubicEaseInterpolator', { ...easeInOut, id })];
};

/** `<KeyedObject>` keying `object` through each of `tracks` that has keys. */
const keyed = (
  object: string,
  id: string,
  tracks: ReadonlyArray<Track>,
): ReadonlyArray<Element> => {
  const used = tracks.filter((t) => t.keys.length > 0);
  if (used.length === 0) return [];
  return [
    el(
      'KeyedObject',
      { objectId: object, id },
      used.map((t) =>
        el(
          'KeyedProperty',
          { propertyKey: t.property, id: t.id },
          t.keys.map((k, i) =>
            el(
              'KeyFrameDouble',
              {
                value: num(k.value),
                frame: k.frame,
                interpolationType: k.interpolation,
                id: t.key(i),
              },
              curve(k, t.ease(i)),
            ),
          ),
        ),
      ),
    ),
  ];
};

const entering = (p: Placed): Transition => p.spec.enter ?? { kind: 'cut' };

const hold = (frame: number, value: number): Key => ({ frame, value, interpolation: 'hold' });

/** How a scene arrives: the first is there from frame 0; a fade blends in; anything else cuts. */
const shownKeys = (scene: Placed): ReadonlyArray<Key> => {
  const enter = entering(scene);
  const start = frameOf(scene.start);
  if (scene.index === 0) return [hold(0, 1)];
  if (enter.kind === 'fade')
    return [
      hold(0, 0),
      { frame: start, value: 0, interpolation: 'linear' },
      hold(frameOf(scene.start + enter.dur), 1),
    ];
  return [hold(0, 0), hold(start, 1)];
};

/**
 * When a scene shows: from its start (fading in over a `fade`), until the
 * scene after it has finished arriving; the first shows from frame 0 and the
 * last until the end.
 */
const opacityKeys = (scene: Placed, next: Option.Option<Placed>): ReadonlyArray<Key> =>
  settle([
    ...shownKeys(scene),
    ...Option.toArray(
      Option.map(next, (n) => hold(frameOf(n.start + transitionDur(n.spec.enter)), 0)),
    ),
  ]);

/** A pan's arrival: in from one side, over its `dur`. */
const arriveKeys = (scene: Placed, width: number): ReadonlyArray<Key> => {
  const enter = entering(scene);
  if (enter.kind !== 'pan' || scene.index === 0) return [];
  const side = (enter.dir ?? 1) * width;
  return [
    hold(0, side),
    { frame: frameOf(scene.start), value: side, interpolation: 'cubic' },
    hold(frameOf(scene.start + enter.dur), 0),
  ];
};

/** A pan's departure: out the other side while the next scene pans in. */
const leaveKeys = (next: Option.Option<Placed>, width: number): ReadonlyArray<Key> =>
  Option.match(next, {
    onNone: () => [],
    onSome: (n): ReadonlyArray<Key> => {
      const pan = entering(n);
      if (pan.kind !== 'pan') return [];
      return [
        { frame: frameOf(n.start), value: 0, interpolation: 'cubic' },
        hold(frameOf(n.start + pan.dur), -(pan.dir ?? 1) * width),
      ];
    },
  });

/**
 * Where a scene sits across: a `pan` slides it in from one side while the
 * scene before slides out the other, like a camera across one long mural.
 * None when neither its arrival nor the next scene's is a pan.
 */
const panKeys = (scene: Placed, next: Option.Option<Placed>, width: number): ReadonlyArray<Key> => {
  const arrive = arriveKeys(scene, width);
  const leave = leaveKeys(next, width);
  if (arrive.length === 0 && leave.length === 0) return [];
  if (arrive.length === 0) return settle([hold(0, 0), ...leave]);
  return settle([...arrive, ...leave]);
};

/** A timeline time as a fraction of its length, which is what a remap keys. */
const fraction = (drawn: number, seconds: number) => {
  if (seconds <= 0) return 0;
  return drawn / seconds;
};

/** The scene's timeline through the film: its warp, as a fraction of the timeline's length. */
const timeKeys = (scene: FilmScene): ReadonlyArray<Key> =>
  Option.match(scene.board.main, {
    onNone: () => [],
    onSome: (main) =>
      settle(
        scene.knots.map(([real, drawn]): Key => ({
          frame: frameOf(scene.placed.start + real),
          value: fraction(drawn, main.seconds),
          interpolation: 'linear',
        })),
      ),
  });

/** One scene nested in the Film, and what the Film's timeline keys on it. */
const nest = (scene: FilmScene, next: Option.Option<Placed>, width: number) => {
  const ids = block(scene.placed.index);
  const remap = Option.map(scene.board.main, (main) =>
    el('NestedRemapAnimation', {
      animationId: main.id,
      name: `${scene.placed.spec.id} time`,
      id: ids(2),
    }),
  );
  const nested = el(
    'NestedArtboard',
    { artboardId: scene.board.id, x: 0, y: 0, name: scene.placed.spec.id, id: ids(1) },
    Option.toArray(remap),
  );
  const keys = [
    ...keyed(ids(1), ids(3), [
      {
        property: OPACITY,
        keys: opacityKeys(scene.placed, next),
        id: ids(4),
        key: (i) => ids(100 + i),
        ease: (i) => ids(150 + i),
      },
      {
        property: X,
        keys: panKeys(scene.placed, next, width),
        id: ids(5),
        key: (i) => ids(200 + i),
        ease: (i) => ids(250 + i),
      },
    ]),
    ...Option.match(remap, {
      onNone: () => [],
      onSome: () =>
        keyed(ids(2), ids(6), [
          {
            property: REMAP_TIME,
            keys: timeKeys(scene),
            id: ids(7),
            key: (i) => ids(1000 + i),
            ease: (i) => ids(5000 + i),
          },
        ]),
    }),
  ];
  return { nested, keys };
};

/** The Film's frames: the end of its last scene. */
export const filmFrames = (scenes: ReadonlyArray<FilmScene>): number =>
  Option.match(Arr.last(scenes), {
    onNone: () => 0,
    onSome: (s) => frameOf(s.placed.start + s.placed.dur),
  });

/** The Film artboard, and the soundtrack it plays in the editor and the previewer. */
export const filmElements = (film: FilmBoard): ReadonlyArray<Element> => {
  const nests = film.scenes.map((scene, i) =>
    nest(
      scene,
      Option.map(Arr.get(film.scenes, i + 1), (n) => n.placed),
      film.width,
    ),
  );
  const soundtrack = Option.map(film.soundtrack, (file) => ({
    event: el('AudioEvent', { assetId: id(21), name: SOUNDTRACK, id: id(20) }),
    asset: el('AudioAsset', { file, name: SOUNDTRACK, id: id(21) }),
    keys: el('KeyedObject', { objectId: id(20), id: id(22) }, [
      el('KeyedProperty', { propertyKey: EVENT_TRIGGER, id: id(23) }, [
        el('KeyFrameCallback', { frame: 0, id: id(24) }),
      ]),
    ]),
  }));
  const artboard = el(
    'Artboard',
    {
      defaultStateMachineId: id(10),
      clip: true,
      x: 0,
      y: -(film.height + 320),
      width: film.width,
      height: film.height,
      styleId: id(4),
      name: FILM,
      id: id(1),
    },
    [
      el('Fill', { name: 'Background', id: id(2) }, [
        el('SolidColor', { colorValue: argb('#000000'), name: 'Color', id: id(3) }),
      ]),
      el('LayoutComponentStyle', { name: 'Artboard Style', id: id(4) }),
      // The first sibling declared draws on top: the last scene first, so each
      // scene arrives over the one before it.
      ...[...nests].reverse().map((n) => n.nested),
      ...Option.toArray(Option.map(soundtrack, (s) => s.event)),
      el('StateMachine', { name: 'Play', id: id(10) }, [
        el('StateMachineLayer', { name: 'Layer', id: id(11) }, [
          el('AnyState', { x: 400, y: -120, id: id(12) }),
          el('ExitState', { x: 600, y: -120, id: id(13) }),
          el('EntryState', { x: 0, y: 0, id: id(14) }, [
            el('StateTransition', { stateToId: id(16), id: id(15) }),
          ]),
          el('AnimationState', { x: 200, y: 0, animationId: id(17), id: id(16) }),
        ]),
      ]),
      el(
        'LinearAnimation',
        { fps: FILM_FPS, duration: filmFrames(film.scenes), name: FILM_TIMELINE, id: id(17) },
        [...nests.flatMap((n) => n.keys), ...Option.toArray(Option.map(soundtrack, (s) => s.keys))],
      ),
    ],
  );
  return [artboard, ...Option.toArray(Option.map(soundtrack, (s) => s.asset))];
};

/** `film.rml`. */
export const filmRml = (film: FilmBoard): string => fragment(filmElements(film));
