// The fixture rig (`src/rive/fixtures/arm/arm.rml`, built to `build/arm.riv` by
// `cd src/rive/fixtures/arm && rive . --once`): a 200 × 200 artboard `Arm`
// with two bones (`upper`, `lower`) reaching for a node `target` through one
// IK constraint (`Reach`, its strength bound to the view model's `reach`),
// the target's x keyed by the timeline `reach` (60 → 170 over 2 s) and its y
// bound to the number `lift`, a `face` node at the lower bone's tip, an
// empty `idle` timeline the machine `Binds` plays, a `boil` that crawls the
// upper piece's width (60, 60.4, 59.8, 60.2, a quarter second each, looped)
// and the `fresh` timeline that puts each of its three paths (two
// rectangles, the face's disc) a unit wide and back, the boiled width among
// them. Feet (the artboard's centre) at our origin.

import { Option } from 'effect';
import type { PoseOf, RiveEngine, RivePropSpec } from '../rive.ts';
import { type SceneSpec, createFilm, drawing } from '../film.ts';
import armRiv from '../../rive/fixtures/arm/build/arm.riv' with { type: 'file' };

/** The arm, drawn by `engine`. */
export const armRig = (
  engine: RiveEngine,
): RivePropSpec<'idle' | 'reach' | 'boil', 'lift' | 'reach'> => ({
  source: {
    riv: armRiv,
    artboard: 'Arm',
    timelines: ['idle', 'reach', 'boil'],
    fresh: 'fresh',
    numbers: ['lift', 'reach'],
    stateMachine: 'Binds',
    refresh: ['upper'],
  },
  engine,
  key: `fixtures/arm/${engine}`,
  origin: [100, 100],
  face: { node: 'face', height: 24 },
});

/** Where the face stands, in our units from the origin, when the arm hangs at rest with no reach. */
export const HANGING_FACE = [40 - 100, 160 - 100] as const;

/**
 * The pose at scene time `t`: the reach played over two seconds and the
 * lift swung, with the reach's strength off for the first half second and
 * the timeline left at rest (mix 0) over the last, so frames that differ only
 * in what was drawn before them are told apart; the upper piece boiling.
 */
export const armPose = (t: number): ArmPose => ({
  timelines: [
    ['idle', t % 1],
    ['reach', t % 2, Number(t < 1.5)],
    ['boil', t % 1],
  ],
  // Slack, the lift left at its rest; then reaching, the lift swung.
  numbers: Option.match(
    Option.liftPredicate(t, (s) => s < 0.5),
    {
      onSome: () => ({ reach: 0 }),
      onNone: () => ({ reach: 0.8, lift: 120 + 40 * Math.sin(t * 3) }),
    },
  ),
});

/** A pose of the arm. */
export type ArmPose = PoseOf<ReturnType<typeof armRig>>;

/** A fixture film of `scenes`, four seconds each, at 1920 × 1080. */
export const armFilm = (scenes: ReadonlyArray<SceneSpec>) =>
  createFilm({
    title: 'arm',
    paper: { base: '#ffffff', tone: '#000000', seed: 1 },
    shade: '#000000',
    scenes,
    captions: { font: '38px x', color: '#000000', plate: '#ffffff' },
  });

/** The arm drawn by `engine`, posed by `armPose`, at the frame's centre, twice its size. */
export const armScene = (id: string, engine: RiveEngine): SceneSpec => ({
  id,
  min: 4,
  ...drawing({
    timeline: {},
    rigs: { arm: armRig(engine) },
    draw: (f) => {
      f.ctx.save();
      f.ctx.translate(f.w / 2, f.h / 2);
      f.ctx.scale(2, 2);
      f.rive('arm', armPose(f.t));
      f.ctx.restore();
    },
  }),
});
