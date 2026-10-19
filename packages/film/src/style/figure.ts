// A figure, composed: its parts (`parts/`), each a typed value its
// constructor checked, put together and checked again as one (`figure`), so
// a part spread with a field its kind lacks, or a paper copied with a grey
// shade, is refused as the module that composes it loads, and so are parts
// the house cannot draw together (hair, a headcloth or a beard on a round
// head, a pivot outside its garment). Only a figure `figure` returned is
// one a film's figures file lays (`isComposed`), and it is frozen through:
// a copy of it with a part changed was never checked, and a change made in
// it throws, so a change is composed from the figure's spec again. A figure
// stands on its feet, its origin, or sits, its origin its body's middle at
// its head's height, the part of it above what hides its feet drawn; an arm
// that reaches past its garment is in its sleeve, cut in one outline with
// the garment, and turns about a point inside it nearer the sleeve than the
// garment's edge, so the sleeve's root stays under its paper however it
// swings. Its view model's numbers are its parts', in one order, never
// listed by hand (`knobsOf`). How it is drawn is the house's (`rig/draw.ts`).
// A figure the owner locked carries its lock, checked here, and its film
// holds its print to it (`lock.ts`). Pure.

import { Predicate, Schema } from 'effect';
import { ConceptRef } from '../core/match.ts';
import { decoder } from './decode.ts';
import { type Lock, decodeLock } from './lock.ts';
import { ARM_SIDES, type Arm, type ArmSide, decodeArm } from './parts/arm.ts';
import { type Beard, decodeBeard } from './parts/beard.ts';
import { type Garment, decodeGarment } from './parts/body.ts';
import { type Ear, decodeEar } from './parts/ear.ts';
import { type Feet, decodeFeet } from './parts/feet.ts';
import { type Hair, decodeHair } from './parts/hair.ts';
import { type Hands, decodeHands } from './parts/hands.ts';
import { type Headcloth, decodeHeadcloth } from './parts/headcloth.ts';
import { type Head, type RoundHead, decodeHead } from './parts/head.ts';
import { type KitA, decodeKit } from './parts/kit.ts';
import { Length, Point } from './parts/measure.ts';
import { type OpenMouth, decodeMouth } from './parts/mouth.ts';
import { type Over, decodeOver } from './parts/over.ts';
import { type Seated, type Standing, decodeSeated, decodeStanding } from './parts/stance.ts';
import { type GivenRobe, type Stain, type State, decodeState } from './parts/states.ts';
import { type Stature, decodeStature } from './parts/stature.ts';
import { FACE, type FaceKnob, type Pt } from './rig/parts.ts';
import { fromEdge, garmentOutline, inside } from './rig/shapes.ts';

/** A standing figure's artboard: its size, and where its feet stand on it (the rig's origin). */
const StandingArt = Schema.Struct({ width: Length, height: Length, feet: Point });

/** A seated figure's artboard: its size, and where its body's middle at its head's height sits on it (the rig's origin). */
const SeatedArt = Schema.Struct({ width: Length, height: Length, head: Point });

/** A figure's arms that reach past its garment, by side: the near one, the far one, or both. */
interface Arms {
  readonly near?: Arm;
  readonly far?: Arm;
}

/** What every figure is composed of: the concept it is drawn from, and a part in each slot. */
interface Composed {
  /** The owner's lock on it, when he kept it (its `<item>.lock.json`), and an override that frees one print of it, citing his decision on it filed after the lock. */
  readonly lock?: Lock;
  /** The kept concept: its image and the figure's box in it, which `film match` holds the figure to. */
  readonly concept: ConceptRef;
  readonly stature: Stature;
  readonly head: Head;
  /** Cut inside a traced head's outline: its beard, its hair, its headcloth, its ear or ears, and a mouth thrown open. */
  readonly beard?: Beard;
  readonly hair?: Hair;
  readonly headcloth?: Headcloth;
  readonly ear?: Ear;
  readonly face: KitA;
  readonly mouth?: OpenMouth;
  readonly body: Garment;
  /** Its arms in their sleeves, each behind its garment's paper and cut in one outline with it (the farmer's far arm). */
  readonly arms?: Arms;
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

/** A seated figure: its origin is its body's middle at its head's height, and what it sits behind hides its feet. */
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

/** A beard, hair, a headcloth, an ear and an open mouth are cut inside a traced head's outline, so a round head takes none. */
const cutInTracedHead = Schema.makeFilter(
  (s: {
    readonly head: unknown;
    readonly beard?: unknown;
    readonly hair?: unknown;
    readonly headcloth?: unknown;
    readonly ear?: unknown;
    readonly mouth?: unknown;
  }) =>
    isPart(s.head) &&
    s.head._tag === 'RoundHead' &&
    [s.beard, s.hair, s.headcloth, s.ear, s.mouth].some((cut) => cut !== undefined)
      ? 'a round head takes no beard, hair, headcloth, ear or open mouth: each is cut inside a traced head (Head.Traced)'
      : true,
);

/** A seated figure's origin is at its head's height, so its head's `y` is 0. */
const headAtOrigin = Schema.makeFilter((s: { readonly head: unknown }) =>
  Predicate.hasProperty(s.head, 'y') && s.head.y !== 0
    ? `a seated figure's origin is at its head's height: its head's y is ${String(s.head.y)}, not 0`
    : true,
);

/**
 * Every figure's slots: its concept, its arms' sides and its states' kinds
 * checked here, each part and its lock as its kind's after (`figure`); a
 * slot or a side the figure lacks is refused.
 */
const slots = {
  lock: Schema.optionalKey(Schema.Unknown),
  concept: ConceptRef,
  stature: Schema.Unknown,
  head: Schema.Unknown,
  beard: Schema.optionalKey(Schema.Unknown),
  hair: Schema.optionalKey(Schema.Unknown),
  headcloth: Schema.optionalKey(Schema.Unknown),
  ear: Schema.optionalKey(Schema.Unknown),
  face: Schema.Unknown,
  mouth: Schema.optionalKey(Schema.Unknown),
  body: Schema.Unknown,
  arms: Schema.optionalKey(
    Schema.Struct({
      near: Schema.optionalKey(Schema.Unknown),
      far: Schema.optionalKey(Schema.Unknown),
    }),
  ),
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
}).check(cutInTracedHead);
const decodeStandingSlots = decoder(StandingSlots);

/** A seated figure's slots: every figure's, its artboard and its stance; it has no feet. */
const SeatedSlots = Schema.Struct({ ...slots, art: SeatedArt, stance: Schema.Unknown }).check(
  cutInTracedHead,
  headAtOrigin,
);
const decodeSeatedSlots = decoder(SeatedSlots);

/** Every figure's parts, each checked as its kind's; its states by kind. */
interface ComposedParts {
  readonly lock?: Lock;
  readonly concept: ConceptRef;
  readonly stature: Stature;
  readonly head: Head;
  readonly beard?: Beard;
  readonly hair?: Hair;
  readonly headcloth?: Headcloth;
  readonly ear?: Ear;
  readonly face: KitA;
  readonly mouth?: OpenMouth;
  readonly body: Garment;
  readonly arms: Arms;
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

/** The figures `figure` returned, each as it returned it. */
const composed = new WeakSet<object>();

/** `u` and every object it holds, frozen, each once: a figure stays the one its parts were checked as. */
const frozen = <A>(u: A, seen = new Set<object>()): A => {
  if (Predicate.isObjectOrArray(u) && !seen.has(u)) {
    seen.add(u);
    Object.freeze(u);
    for (const v of Object.values(u)) frozen(v, seen);
  }
  return u;
};

/** Whether `u` is a figure `figure` returned, not a copy of one: only such a figure has had its parts checked, and it is frozen, so they stay as checked. */
export const isComposed = (u: unknown): u is ComposedFigure<string> =>
  Predicate.isObject(u) && composed.has(u);

/** Whether `f` sits. */
export const isSeated = (f: Parts): f is SeatedParts => f.stance._tag === 'Seated';

/** Whether `spec` sits. */
const isSeatedSpec = (spec: FigureSpec): spec is SeatedSpec => spec.stance._tag === 'Seated';

/** The stance's numbers, every stance's, at rest: upright, his head level and up. */
const STANCE = { lean: 0, tilt: 0, nod: 0 } as const;

/** The number a round head adds (a face drawn on it slides down it as he bows); none for a head typed as either kind. */
type HeadKnob<H> = [H] extends [RoundHead] ? 'faceY' : never;

/** The number each state adds. */
type StateKnob<S> = S extends Stain ? 'stain' : S extends GivenRobe ? 'robe' : never;

/** The numbers states written as a list of known length add; none for states typed as any list. */
type StatesKnob<T> =
  T extends ReadonlyArray<infer S> ? (number extends T['length'] ? never : StateKnob<S>) : never;

/** The number each arm adds, by its side (`nearArm`, `farArm`); none for a side typed as one that may be missing. */
type ArmKnob<A> = {
  readonly [Side in keyof A & ArmSide]: A[Side] extends Arm ? `${Side}Arm` : never;
}[keyof A & ArmSide];

/**
 * The names of a figure's numbers (`knobsOf`'s, as types), read off its
 * spec's types: never a name its parts may not add, so a part typed wider
 * than its kind (a `Head`, states as any list, an arm's side that may be
 * missing) adds none.
 */
type KnobsOf<S extends FigureSpec> =
  | FaceKnob
  | keyof typeof STANCE
  | HeadKnob<S['head']>
  | (S extends { readonly mouth: OpenMouth } ? 'shout' : never)
  | (S extends { readonly states: infer T } ? StatesKnob<T> : never)
  | (S extends { readonly arms: infer A } ? ArmKnob<A> : never);

/**
 * Where a face's gaze is measured from, units from the figure's origin: its
 * body's middle at its head's height. A round head's centre is there; a
 * traced head is carried `set.x` right of it (`rig/draw.ts`), its gaze still
 * measured from the body's middle.
 */
const gazeFrom = (head: Head) => [0, head.y] as const;

/**
 * A figure's numbers at rest, in the house's order (the view model keeps
 * it, so the file keeps its bytes): the face kit's (`FACE`, its gaze first,
 * its rest where the figure's face differs), the open mouth's, the
 * stance's, the head's, the states' (the stain before the given robe), the
 * arms' (each its turn at rest, the near one first). A number set again
 * keeps its place.
 */
const knobsOf = (f: Parts) => {
  const [x, y] = gazeFrom(f.head);
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
  for (const side of ARM_SIDES) {
    const arm = f.arms[side];
    if (arm !== undefined) knobs.set(`${side}Arm`, arm.rest);
  }
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

/**
 * A decode of the pivot of an arm whose sleeve is `sleeve`, on the garment
 * `garment`: a point inside the garment, the sleeve nearer it than the
 * garment's edge (at no distance when the pivot lies inside the sleeve), so
 * a point of the sleeve stays under the garment's paper however it swings.
 */
const pivotOn = (garment: ReadonlyArray<Pt>, sleeve: ReadonlyArray<Pt>) =>
  decoder(
    Point.check(
      Schema.makeFilter((pivot: Pt) => {
        if (!inside(pivot, garment)) {
          return `its pivot (${pivot.join(', ')}) lies outside its garment: an arm turns inside it`;
        }
        const reach = inside(pivot, sleeve) ? 0 : fromEdge(pivot, sleeve);
        const edge = fromEdge(pivot, garment);
        if (reach < edge) return true;
        const [r, e] = [reach.toFixed(1), edge.toFixed(1)];
        return `its sleeve lies ${r} from its pivot, its garment's edge ${e}: a sleeve lies nearer its pivot than the edge`;
      }),
    ),
  );

/** Its arms by side, each checked as an arm and its pivot as one on `body`'s outline (`pivotOn`). */
const armsOf = (arms: Arms, body: Garment): Arms => {
  const garment = garmentOutline(body);
  const armOn = (arm: Arm | undefined, part: string) => {
    if (arm === undefined) return undefined;
    const checked = decodeArm(arm, part);
    pivotOn(garment, checked.outline)(checked.pivot, part);
    return checked;
  };
  return { near: armOn(arms.near, 'arms.near'), far: armOn(arms.far, 'arms.far') };
};

/** Every figure's parts of `spec`, each checked as its kind's, its arms on its checked garment, and its lock, under its checked `concept`. */
const composedOf = (spec: FigureSpec, concept: ConceptRef): ComposedParts => {
  const body = decodeGarment(spec.body, 'body');
  return {
    lock: spec.lock === undefined ? undefined : decodeLock(spec.lock, 'lock'),
    concept,
    stature: decodeStature(spec.stature, 'stature'),
    head: decodeHead(spec.head, 'head'),
    beard: spec.beard === undefined ? undefined : decodeBeard(spec.beard, 'beard'),
    hair: spec.hair === undefined ? undefined : decodeHair(spec.hair, 'hair'),
    headcloth:
      spec.headcloth === undefined ? undefined : decodeHeadcloth(spec.headcloth, 'headcloth'),
    ear: spec.ear === undefined ? undefined : decodeEar(spec.ear, 'ear'),
    face: decodeKit(spec.face, 'face'),
    mouth: spec.mouth === undefined ? undefined : decodeMouth(spec.mouth, 'mouth'),
    body,
    arms: armsOf(spec.arms ?? {}, body),
    over: spec.over === undefined ? undefined : decodeOver(spec.over, 'over'),
    states: statesOf(spec.states ?? []),
    hands: decodeHands(spec.hands, 'hands'),
  };
};

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
 * stray field, a paper's grey shade) and together (a beard on a round head),
 * refused naming the rule it breaks; and its view model's numbers, the
 * parts' own (`knobsOf`), their names as `KnobsOf` reads them off the spec.
 * Only the figure it returns is one a figures file lays (`isComposed`),
 * frozen through, so a change made in it throws.
 */
export function figure<const S extends StandingSpec>(
  spec: S,
): ComposedFigure<KnobsOf<S>, StandingParts>;
export function figure<const S extends SeatedSpec>(
  spec: S,
): ComposedFigure<KnobsOf<S>, SeatedParts>;
export function figure(spec: FigureSpec): ComposedFigure<string> {
  const parts = partsOf(spec);
  const f = frozen({ ...parts, knobs: knobsOf(parts) });
  composed.add(f);
  return f;
}
