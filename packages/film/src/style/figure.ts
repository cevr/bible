// A figure, composed: its parts (`parts/`), each a typed value its
// constructor checked, put together and checked again as one (`figure`), so
// a part spread with a field its kind lacks, or a paper copied with a grey
// shade, is refused as the module that composes it loads, and so are parts
// the house cannot draw together (hair on a round head, a given robe over a
// cut robe). A figure stands on its feet, its origin, or sits, its head's
// centre its origin, the part of it above what hides its feet drawn. Its
// view model's numbers are its parts', in one order, never listed by hand
// (`knobsOf`). How it is drawn is the house's (`rig/draw.ts`). A figure the
// owner locked carries its lock, checked here, and its film holds its print
// to it (`lock.ts`). Pure.

import { Predicate, Schema } from 'effect';
import { ConceptRef } from '../core/match.ts';
import { decoder } from './decode.ts';
import { type Lock, decodeLock } from './lock.ts';
import { type Garment, decodeGarment } from './parts/body.ts';
import { type Ear, decodeEar } from './parts/ear.ts';
import { type Feet, decodeFeet } from './parts/feet.ts';
import { type Hair, decodeHair } from './parts/hair.ts';
import { type Hands, decodeHands } from './parts/hands.ts';
import { type Head, type RoundHead, decodeHead } from './parts/head.ts';
import { type KitA, decodeKit } from './parts/kit.ts';
import { Length, Point } from './parts/measure.ts';
import { type OpenMouth, decodeMouth } from './parts/mouth.ts';
import { type Over, decodeOver } from './parts/over.ts';
import { type Seated, type Standing, decodeSeated, decodeStanding } from './parts/stance.ts';
import { type GivenRobe, type Stain, type State, decodeState } from './parts/states.ts';
import { type Stature, decodeStature } from './parts/stature.ts';
import { FACE, type FaceKnob } from './rig/parts.ts';

/** A standing figure's artboard: its size, and where its feet stand on it (the rig's origin). */
const StandingArt = Schema.Struct({ width: Length, height: Length, feet: Point });

/** A seated figure's artboard: its size, and where its head's centre sits on it (the rig's origin). */
const SeatedArt = Schema.Struct({ width: Length, height: Length, head: Point });

/** What every figure is composed of: the concept it is drawn from, and a part in each slot. */
interface Composed {
  /** The owner's lock on it, when he kept it (its `<item>.lock.json`), and an override with his words that frees one print of it. */
  readonly lock?: Lock;
  /** The kept concept: its image and the figure's box in it, which `film match` holds the figure to. */
  readonly concept: ConceptRef;
  readonly stature: Stature;
  readonly head: Head;
  /** Cut inside a traced head's outline: its hair, its ear, and a mouth thrown open. */
  readonly hair?: Hair;
  readonly ear?: Ear;
  readonly face: KitA;
  readonly mouth?: OpenMouth;
  readonly body: Garment;
  /** What lies on its garment with no line of its own (the judge's bands). */
  readonly over?: Over;
  /** What the story does to its garment, in any order: each kind once. */
  readonly states?: ReadonlyArray<State>;
  readonly hands: Hands;
}

/** A standing figure: its feet are its origin. */
interface StandingSpec extends Composed {
  readonly art: typeof StandingArt.Type;
  readonly stance: Standing;
  readonly feet: Feet;
}

/** A seated figure: its head's centre is its origin, and what it sits behind hides its feet. */
interface SeatedSpec extends Composed {
  readonly art: typeof SeatedArt.Type;
  readonly stance: Seated;
  readonly feet?: never;
}

/** What a figure is composed of, as it stands or sits. */
type FigureSpec = StandingSpec | SeatedSpec;

/** A part as a slot holds it before it is checked as its kind's: of some kind. */
const isPart = Schema.is(Schema.Struct({ _tag: Schema.String }));

/** Each state once: one stain and one given robe at most. */
const oncePerKind = Schema.makeFilter((states: ReadonlyArray<unknown>) => {
  const kinds = states.map((s) => (isPart(s) ? s._tag : undefined));
  return new Set(kinds).size === kinds.length ? true : 'a state of one kind is laid twice';
});

/** Hair, an ear and an open mouth are cut inside a traced head's outline, so a round head takes none. */
const cutInTracedHead = Schema.makeFilter(
  (s: {
    readonly head: unknown;
    readonly hair?: unknown;
    readonly ear?: unknown;
    readonly mouth?: unknown;
  }) =>
    isPart(s.head) &&
    s.head._tag === 'RoundHead' &&
    (s.hair !== undefined || s.ear !== undefined || s.mouth !== undefined)
      ? 'a round head takes no hair, ear or open mouth: each is cut inside a traced head (Head.Traced)'
      : true,
);

/** A given robe is the tunic's outline again, so the house lays it over a tunic only. */
const robeOverTunic = Schema.makeFilter(
  (s: { readonly body: unknown; readonly states?: ReadonlyArray<unknown> }) =>
    isPart(s.body) &&
    s.body._tag !== 'Tunic' &&
    (s.states ?? []).some((state) => isPart(state) && state._tag === 'GivenRobe')
      ? `a given robe is laid over a tunic only, not a ${s.body._tag}`
      : true,
);

/** A seated figure's origin is its head's centre, so its head sits at 0. */
const headAtOrigin = Schema.makeFilter((s: { readonly head: unknown }) =>
  Predicate.hasProperty(s.head, 'y') && s.head.y !== 0
    ? `a seated figure's origin is its head's centre: its head's y is ${String(s.head.y)}, not 0`
    : true,
);

/**
 * Every figure's slots: its concept and its states' kinds checked here, each
 * part and its lock as its kind's after (`figure`); a slot the figure lacks
 * is refused, an arm by CircleHands.
 */
const slots = {
  lock: Schema.optionalKey(Schema.Unknown),
  concept: ConceptRef,
  stature: Schema.Unknown,
  head: Schema.Unknown,
  hair: Schema.optionalKey(Schema.Unknown),
  ear: Schema.optionalKey(Schema.Unknown),
  face: Schema.Unknown,
  mouth: Schema.optionalKey(Schema.Unknown),
  body: Schema.Unknown,
  over: Schema.optionalKey(Schema.Unknown),
  states: Schema.optionalKey(Schema.Array(Schema.Unknown).check(oncePerKind)),
  hands: Schema.Unknown,
};

/** A standing figure's slots: every figure's, its artboard, its stance and its feet. */
const StandingSlots = Schema.Struct({
  ...slots,
  art: StandingArt,
  stance: Schema.Unknown,
  feet: Schema.Unknown,
}).check(cutInTracedHead, robeOverTunic);
const decodeStandingSlots = decoder(StandingSlots, { fields: { arm: 'CircleHands' } });

/** A seated figure's slots: every figure's, its artboard and its stance; it has no feet. */
const SeatedSlots = Schema.Struct({ ...slots, art: SeatedArt, stance: Schema.Unknown }).check(
  cutInTracedHead,
  robeOverTunic,
  headAtOrigin,
);
const decodeSeatedSlots = decoder(SeatedSlots, { fields: { arm: 'CircleHands' } });

/** Every figure's parts, each checked as its kind's; its states by kind. */
interface ComposedParts {
  readonly lock?: Lock;
  readonly concept: ConceptRef;
  readonly stature: Stature;
  readonly head: Head;
  readonly hair?: Hair;
  readonly ear?: Ear;
  readonly face: KitA;
  readonly mouth?: OpenMouth;
  readonly body: Garment;
  readonly over?: Over;
  readonly states: { readonly stain?: Stain; readonly robe?: GivenRobe };
  readonly hands: Hands;
}

/** A standing figure's parts: every figure's, its artboard, its stance and its feet. */
export interface StandingParts extends ComposedParts {
  readonly art: typeof StandingArt.Type;
  readonly stance: Standing;
  readonly feet: Feet;
}

/** A seated figure's parts: every figure's, its artboard and its stance. */
export interface SeatedParts extends ComposedParts {
  readonly art: typeof SeatedArt.Type;
  readonly stance: Seated;
}

/** A figure's parts, standing or seated. */
export type Parts = StandingParts | SeatedParts;

/** A figure composed of its parts (`P`, as its stance has them), and its view model's numbers at rest, `K` their names. */
export type ComposedFigure<K extends string, P extends Parts = Parts> = P & {
  readonly knobs: Readonly<Record<K, number>>;
};

/** Whether `f` sits. */
export const isSeated = (f: Parts): f is SeatedParts => f.stance._tag === 'Seated';

/** Whether `spec` sits. */
const isSeatedSpec = (spec: FigureSpec): spec is SeatedSpec => spec.stance._tag === 'Seated';

/** The stance's numbers, every stance's, at rest: upright, his head level and up. */
const STANCE = { lean: 0, tilt: 0, nod: 0 } as const;

/** The number a head adds: a face drawn on a round head slides down it as he bows. */
type HeadKnob<H> = H extends RoundHead ? 'faceY' : never;

/** The number each state adds. */
type StateKnob<S> = S extends Stain ? 'stain' : S extends GivenRobe ? 'robe' : never;

/** The names of a figure's numbers (`knobsOf`'s, as types). */
type KnobsOf<S extends FigureSpec> =
  | FaceKnob
  | keyof typeof STANCE
  | HeadKnob<S['head']>
  | (S extends { readonly mouth: OpenMouth } ? 'shout' : never)
  | (S extends { readonly states: ReadonlyArray<infer T> } ? StateKnob<T> : never);

/** The centre of `head`, units from the origin: where its face's gaze is measured from. */
const centreOf = (head: Head) => [0, head.y] as const;

/**
 * A figure's numbers at rest, in the house's order (the view model keeps
 * it, so the file keeps its bytes): the face kit's (`FACE`, its gaze first,
 * its rest where the figure's face differs), the open mouth's, the
 * stance's, the head's, the states' (the stain before the given robe). A
 * number set again keeps its place.
 */
const knobsOf = (f: Parts) => {
  const [x, y] = centreOf(f.head);
  const knobs = new Map(
    Object.entries({
      ...FACE,
      ...f.face.rest,
      gazeX: x + f.face.gaze[0],
      gazeY: y + f.face.gaze[1],
    }),
  );
  if (f.mouth !== undefined) knobs.set('shout', 0);
  for (const [name, rest] of Object.entries(STANCE)) knobs.set(name, rest);
  if (f.head._tag === 'RoundHead') knobs.set('faceY', 0);
  if (f.states.stain !== undefined) knobs.set('stain', 1);
  if (f.states.robe !== undefined) knobs.set('robe', 0);
  return Object.fromEntries(knobs);
};

/** Its states by kind, each checked as its own. */
const statesOf = (states: ReadonlyArray<State>): ComposedParts['states'] => {
  const checked = states.map((s, i) => decodeState(s, `states[${i}]`));
  return {
    stain: checked.find((s): s is Stain => s._tag === 'Stain'),
    robe: checked.find((s): s is GivenRobe => s._tag === 'GivenRobe'),
  };
};

/** Every figure's parts of `spec`, each checked as its kind's, and its lock, under its checked `concept`. */
const composedOf = (spec: FigureSpec, concept: ConceptRef): ComposedParts => ({
  lock: spec.lock === undefined ? undefined : decodeLock(spec.lock, 'lock'),
  concept,
  stature: decodeStature(spec.stature, 'stature'),
  head: decodeHead(spec.head, 'head'),
  hair: spec.hair === undefined ? undefined : decodeHair(spec.hair, 'hair'),
  ear: spec.ear === undefined ? undefined : decodeEar(spec.ear, 'ear'),
  face: decodeKit(spec.face, 'face'),
  mouth: spec.mouth === undefined ? undefined : decodeMouth(spec.mouth, 'mouth'),
  body: decodeGarment(spec.body, 'body'),
  over: spec.over === undefined ? undefined : decodeOver(spec.over, 'over'),
  states: statesOf(spec.states ?? []),
  hands: decodeHands(spec.hands, 'hands'),
});

/** A figure's parts of `spec`: its slots checked as its stance's, then each part as its kind's. */
const partsOf = (spec: FigureSpec): Parts => {
  if (isSeatedSpec(spec)) {
    const { concept, art } = decodeSeatedSlots(spec, 'figure');
    return { ...composedOf(spec, concept), art, stance: decodeSeated(spec.stance, 'stance') };
  }
  const { concept, art } = decodeStandingSlots(spec, 'figure');
  return {
    ...composedOf(spec, concept),
    art,
    stance: decodeStanding(spec.stance, 'stance'),
    feet: decodeFeet(spec.feet, 'feet'),
  };
};

/**
 * A figure of `spec`'s parts, each checked again as its kind's (a part's
 * stray field, a paper's grey shade) and together (hair on a round head),
 * refused naming the rule it breaks; and its view model's numbers, the
 * parts' own (`knobsOf`), their names as `KnobsOf` reads them off the spec.
 */
export function figure<const S extends StandingSpec>(
  spec: S,
): ComposedFigure<KnobsOf<S>, StandingParts>;
export function figure<const S extends SeatedSpec>(
  spec: S,
): ComposedFigure<KnobsOf<S>, SeatedParts>;
export function figure(spec: FigureSpec): ComposedFigure<string> {
  const parts = partsOf(spec);
  return { ...parts, knobs: knobsOf(parts) };
}
