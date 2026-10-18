// A figure, composed: its parts (`parts/`), each a typed value its
// constructor checked, put together and checked again as one (`figure`), so
// a part spread with a field its kind lacks, or a paper copied with a grey
// shade, is refused as the module that composes it loads. Its view model's
// numbers are its parts', in one order, never listed by hand (`knobsOf`).
// How it is drawn is the house's (`rig/draw.ts`). Pure.

import { Predicate, Schema } from 'effect';
import { ConceptRef } from '../core/match.ts';
import { decoder } from './decode.ts';
import { type Garment, decodeGarment } from './parts/body.ts';
import { type Feet, decodeFeet } from './parts/feet.ts';
import { type Hands, decodeHands } from './parts/hands.ts';
import { type Head, type RoundHead, decodeHead } from './parts/head.ts';
import { type KitA, decodeKit } from './parts/kit.ts';
import { Length, Point } from './parts/measure.ts';
import { type Stance, decodeStance } from './parts/stance.ts';
import { type GivenRobe, type Stain, type State, decodeState } from './parts/states.ts';
import { type Stature, decodeStature } from './parts/stature.ts';
import { FACE, type FaceKnob } from './rig/parts.ts';

/** Its artboard: its size, and where its feet stand on it (the rig's origin). */
const Art = Schema.Struct({ width: Length, height: Length, feet: Point });
type Art = typeof Art.Type;

/** What a figure is composed of: the concept it is drawn from, its artboard, and a part in each slot. */
interface FigureSpec {
  /** The kept concept: its image and the figure's box in it, which `film match` holds the figure to. */
  readonly concept: ConceptRef;
  readonly art: Art;
  readonly stature: Stature;
  readonly stance: Stance;
  readonly head: Head;
  readonly face: KitA;
  readonly body: Garment;
  /** What the story does to its garment, in any order: each kind once. */
  readonly states?: ReadonlyArray<State>;
  readonly feet: Feet;
  readonly hands: Hands;
}

/** Each state once: one stain and one given robe at most. */
const oncePerKind = Schema.makeFilter((states: ReadonlyArray<unknown>) => {
  const kinds = states.map((s) => (Predicate.hasProperty(s, '_tag') ? s._tag : undefined));
  return new Set(kinds).size === kinds.length ? true : 'a state of one kind is laid twice';
});

/**
 * A figure's slots: its concept, its artboard and its states' kinds checked
 * here, each part as its kind's after (`figure`); a slot the figure lacks is
 * refused, an arm by CircleHands.
 */
const Slots = Schema.Struct({
  concept: ConceptRef,
  art: Art,
  stature: Schema.Unknown,
  stance: Schema.Unknown,
  head: Schema.Unknown,
  face: Schema.Unknown,
  body: Schema.Unknown,
  states: Schema.optionalKey(Schema.Array(Schema.Unknown).check(oncePerKind)),
  feet: Schema.Unknown,
  hands: Schema.Unknown,
});
const decodeSlots = decoder(Slots, { fields: { arm: 'CircleHands' } });

/** A figure's parts, each checked as its kind's; its states by kind. */
interface Parts {
  readonly concept: ConceptRef;
  readonly art: Art;
  readonly stature: Stature;
  readonly stance: Stance;
  readonly head: Head;
  readonly face: KitA;
  readonly body: Garment;
  readonly states: { readonly stain?: Stain; readonly robe?: GivenRobe };
  readonly feet: Feet;
  readonly hands: Hands;
}

/** A figure composed of its parts, and its view model's numbers at rest, `K` their names. */
export interface ComposedFigure<K extends string> extends Parts {
  readonly knobs: Readonly<Record<K, number>>;
}

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
  | (S extends { readonly states: ReadonlyArray<infer T> } ? StateKnob<T> : never);

/** The centre of `head`, units from the feet: where its face's gaze is measured from. */
const centreOf = (head: Head) => [0, head.y] as const;

/**
 * A figure's numbers at rest, in the house's order (the view model keeps
 * it, so the file keeps its bytes): the face kit's (`FACE`, its gaze first,
 * its rest where the figure's face differs), the stance's, the head's, the
 * states' (the stain before the given robe). A number set again keeps its
 * place.
 */
const knobsOf = (f: Parts) => {
  const [x, y] = centreOf(f.head);
  const knobs = new Map(
    Object.entries({
      ...FACE,
      ...f.face.rest,
      gazeX: x + f.face.gaze[0],
      gazeY: y + f.face.gaze[1],
      ...STANCE,
    }),
  );
  if (f.head._tag === 'RoundHead') knobs.set('faceY', 0);
  if (f.states.stain !== undefined) knobs.set('stain', 1);
  if (f.states.robe !== undefined) knobs.set('robe', 0);
  return Object.fromEntries(knobs);
};

/** Its states by kind, each checked as its own. */
const statesOf = (states: ReadonlyArray<State>): Parts['states'] => {
  const checked = states.map((s, i) => decodeState(s, `states[${i}]`));
  return {
    stain: checked.find((s): s is Stain => s._tag === 'Stain'),
    robe: checked.find((s): s is GivenRobe => s._tag === 'GivenRobe'),
  };
};

/**
 * A figure of `spec`'s parts, each checked again as its kind's (a part's
 * stray field, a paper's grey shade), refused naming the rule it breaks; and
 * its view model's numbers, the parts' own (`knobsOf`).
 */
export const figure = <const S extends FigureSpec>(spec: S): ComposedFigure<KnobsOf<S>> => {
  const { concept, art } = decodeSlots(spec, 'figure');
  const parts: Parts = {
    concept,
    art,
    stature: decodeStature(spec.stature, 'stature'),
    stance: decodeStance(spec.stance, 'stance'),
    head: decodeHead(spec.head, 'head'),
    face: decodeKit(spec.face, 'face'),
    body: decodeGarment(spec.body, 'body'),
    states: statesOf(spec.states ?? []),
    feet: decodeFeet(spec.feet, 'feet'),
    hands: decodeHands(spec.hands, 'hands'),
  };
  // oxlint-disable-next-line effect/noAs -- `KnobsOf` names over the generic spec what `knobsOf` lays at run time by the same rules, which the checker cannot follow from the parts' values to `S`
  return { ...parts, knobs: knobsOf(parts) as Readonly<Record<KnobsOf<S>, number>> };
};
