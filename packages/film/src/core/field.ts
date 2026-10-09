// How the inspector shows and steps a number: a schema says it once, as its
// `field` annotation (`unit`, `step`, `coarse`, `fine`, `min`, `max`,
// `readOnly`, `why`), and every control reads it from there: the field's
// arrows and its scrubby label, the nudge keys, the receipt's before → after.
// A step counts in the field's unit or in frames of the film (`{ frames: 1 }`,
// for seconds). The plain step is the arrows', a nudge's and a scrub's per
// pixel; Shift takes the coarse step, Alt the fine one. A number with no
// annotation steps by 0.01 (Shift 0.1, Alt 0.001), and every field reaches
// as far: the fine step and a typed value keep the thousandth, whatever the
// plain step is. Pure.

import { Match, Option, Predicate, Schema } from 'effect';
import { toMs } from './time.ts';

/** A step: in the field's unit, or in frames of the film. */
type Amount = number | { readonly frames: number };

/** What a schema says of its number for the inspector. */
interface FieldAnnotation {
  /** Printed after the value: `s`, `px`; none for a plain number. */
  readonly unit?: string;
  /** The arrows', a nudge's and a scrub's step. */
  readonly step?: Amount;
  /** The step with Shift held. */
  readonly coarse?: Amount;
  /** The step with Alt held: never coarser than the 0.01 every field stepped before. */
  readonly fine?: Amount;
  readonly min?: number;
  readonly max?: number;
  /** Shown, never written (a computed value). */
  readonly readOnly?: boolean;
  /** Why it is read only, for its title. */
  readonly why?: string;
}

declare module 'effect/Schema' {
  namespace Annotations {
    interface Annotations {
      /** How the inspector shows and steps this number (`core/field.ts`). */
      readonly field?: FieldAnnotation;
    }
  }
}

/** `annotation` as a schema's annotations: `Schema.Finite.annotate(inspected({ unit: 's' }))`. */
export const inspected = (annotation: FieldAnnotation) => ({
  field: annotation,
});

/** How a field prints its value: to the thousandth, as the files keep it, without grouping. */
export const FIELD_FORMAT: Intl.NumberFormatOptions = {
  maximumFractionDigits: 3,
  useGrouping: false,
};

/** The scene files' notation, whatever the browser's language: `0.42`, never `0,42`. */
export const FIELD_LOCALE = 'en-US';

/** `value` as a field prints it (`0.433`, `120`, `-0.004`): the one rule of the field, the peek and the receipts' neighbours. */
export const printField = (value: number): string =>
  new Intl.NumberFormat(FIELD_LOCALE, FIELD_FORMAT).format(value);

/** Which step a control takes: Shift's coarse, Alt's fine, or the plain one. */
type Step = 'normal' | 'coarse' | 'fine';

/** A field as the inspector steps it, its amounts in its own unit for the film's rate. */
interface FieldSpec {
  readonly unit: string;
  readonly step: number;
  readonly coarse: number;
  readonly fine: number;
  readonly min: Option.Option<number>;
  readonly max: Option.Option<number>;
  readonly readOnly: boolean;
  readonly why: Option.Option<string>;
}

/** How every lab field stepped before the inspector read a schema: what a bare number keeps. */
const BARE = { step: 0.01, coarse: 0.1, fine: 0.001 } as const;

const amountIn = (amount: Amount, fps: number): number =>
  Match.value(amount).pipe(
    Match.when(Predicate.isNumber, (n) => n),
    Match.orElse((a) => a.frames / fps),
  );

/** The inspector's reading of `schema`'s number, for a film drawn at `fps`. */
export const fieldOf = (schema: Schema.Top, fps: number): FieldSpec => {
  const a: FieldAnnotation = Option.getOrElse(
    Option.fromUndefinedOr(Schema.resolveAnnotations(schema)?.field),
    (): FieldAnnotation => ({}),
  );
  const amount = (key: 'step' | 'coarse' | 'fine') =>
    amountIn(
      Option.getOrElse(Option.fromUndefinedOr(a[key]), () => BARE[key]),
      fps,
    );
  return {
    unit: Option.getOrElse(Option.fromUndefinedOr(a.unit), () => ''),
    step: amount('step'),
    coarse: amount('coarse'),
    fine: amount('fine'),
    min: Option.fromUndefinedOr(a.min),
    max: Option.fromUndefinedOr(a.max),
    readOnly: a.readOnly === true,
    why: Option.fromUndefinedOr(a.why),
  };
};

/** `spec`'s step for `step`. */
const stepOf = (spec: FieldSpec, step: Step): number =>
  ({ normal: spec.step, coarse: spec.coarse, fine: spec.fine })[step];

/** `value` held within `spec`'s bounds, to the thousandth (as the files keep it). */
const bounded = (spec: FieldSpec, value: number): number =>
  toMs(
    Math.min(
      Option.getOrElse(spec.max, () => Infinity),
      Math.max(
        Option.getOrElse(spec.min, () => -Infinity),
        value,
      ),
    ),
  );

/** `value` moved `by` steps of `step` (−1 back, 1 on), held within `spec`'s bounds. */
export const nudged = (spec: FieldSpec, value: number, step: Step, by: number): number =>
  bounded(spec, value + by * stepOf(spec, step));

/**
 * One field as the inspector shows it: which (`id`, its `data-field`), its
 * label, how it steps, its value now, why it cannot be written now if it
 * cannot (its schema's `why` when read only), and the write of a new value
 * (which carries what it moves, before → after, for its receipt once it
 * lands: `cue rise offset 0.42 → 0.38 s`, `knob face [960, 800] → [940, 800]`).
 */
export interface Inspected {
  readonly id: string;
  readonly label: string;
  readonly spec: FieldSpec;
  readonly value: number;
  readonly refusal: Option.Option<string>;
  readonly write: (next: number) => void;
}

/** Why `field` cannot be written: its own refusal, else its schema's read-only reason. */
export const refusalOf = (field: Inspected): Option.Option<string> =>
  Option.orElse(field.refusal, () =>
    Option.map(
      Option.liftPredicate(field.spec, (s) => s.readOnly),
      (s) => Option.getOrElse(s.why, () => 'read only'),
    ),
  );
