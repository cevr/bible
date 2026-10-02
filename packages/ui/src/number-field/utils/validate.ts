// Upstream: packages/react/src/number-field/utils/validate.ts
//
// Turns a candidate value into the one the field stores: snapped to the step
// (when `snapOnStep`), clamped to `[min, max]` (when asked), and cleaned of
// the binary noise stepping arithmetic leaves (`0.1 + 0.2`), or rounded as
// the format's rounding options say.
import { clamp } from '../../utils/clamp.ts';
import { getFormatter } from '../../utils/formatNumber.ts';
import { parseNumber } from './parse.ts';

// A relative factor scaled by the step size when snapping.
const STEP_EPSILON_FACTOR = 1e-10;
// An absolute cap (in the value's own units) on how far noise cleanup may move a value.
const MAX_FLOATING_POINT_CLEANUP_DELTA = 1e-10;

/** Format options with the Intl NumberFormat v3 rounding options. */
export type NumberFormatOptionsWithRounding = Intl.NumberFormatOptions & {
  roundingIncrement?: number | undefined;
  roundingMode?: string | undefined;
  roundingPriority?: string | undefined;
};

export function hasNumberFormatRoundingOptions(
  format?: NumberFormatOptionsWithRounding,
): format is NumberFormatOptionsWithRounding {
  return (
    format?.maximumFractionDigits != null ||
    format?.minimumFractionDigits != null ||
    format?.maximumSignificantDigits != null ||
    format?.minimumSignificantDigits != null ||
    format?.roundingIncrement != null ||
    format?.roundingMode != null ||
    format?.roundingPriority != null
  );
}

export function removeFloatingPointErrors(
  value: number,
  format?: NumberFormatOptionsWithRounding,
): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  if (!hasNumberFormatRoundingOptions(format)) {
    // Clean binary noise without dropping real precision. The cleanup is
    // bounded, so sub-epsilon digits that arithmetic produced are normalized
    // to ~15 significant digits. From the 2^19 binade (~5.2e5) up a single
    // ULP exceeds the absolute cap, so noise there is left as it is rather
    // than risk real digits.
    const roundedValue = parseFloat(value.toPrecision(15));
    const cleanupDelta = Math.abs(roundedValue - value);
    const cleanupTolerance = Math.min(
      Number.EPSILON * Math.max(1, Math.abs(value)),
      MAX_FLOATING_POINT_CLEANUP_DELTA,
    );
    return cleanupDelta <= cleanupTolerance ? roundedValue : value;
  }

  const options: NumberFormatOptionsWithRounding = {
    ...format,
    // These change only the display decoration, not the rounding.
    signDisplay: 'auto',
    currencySign: 'standard',
    notation: format.notation === 'compact' ? 'standard' : format.notation,
    useGrouping: false,
  };
  const formatter = getFormatter('en-US', options);
  const roundedText = formatter.format(value);
  const roundedValue = parseNumber(roundedText, 'en-US', format);
  if (roundedValue === null) {
    return value;
  }
  return formatter.format(roundedValue) === roundedText ? roundedValue : value;
}

function snapToStep(value: number, base: number, step: number, nearest: boolean) {
  const stepSize = Math.abs(step);
  const direction = Math.sign(step);
  const tolerance = stepSize * STEP_EPSILON_FACTOR * direction;
  const rawSteps = value - base + tolerance;

  if (nearest) {
    return base + Math.round(rawSteps / step) * step;
  }
  const snappedSteps =
    direction > 0 ? Math.floor(rawSteps / stepSize) : Math.ceil(rawSteps / stepSize);
  return base + snappedSteps * stepSize;
}

export function toValidatedNumber(
  value: number | null,
  step: number | undefined,
  minWithDefault: number,
  maxWithDefault: number,
  minWithZeroDefault: number,
  format: NumberFormatOptionsWithRounding | undefined,
  snapOnStep: boolean,
  small: boolean,
  shouldClamp: boolean,
): number | null {
  if (value === null) {
    return value;
  }

  let nextValue = value;

  if (step != null && snapOnStep && step !== 0) {
    const base =
      small || minWithDefault === Number.MIN_SAFE_INTEGER ? minWithZeroDefault : minWithDefault;
    // Snap before clamping so bounds off the step grid stay reachable. Small
    // (Alt) steps snap to the nearest multiple; others snap in their direction.
    nextValue = snapToStep(nextValue, base, step, small);
  }

  // Clamp before rounding so a value just outside a fractional bound comes in
  // first, and again after, in case rounding pushed it back out.
  if (shouldClamp) {
    nextValue = clamp(nextValue, minWithDefault, maxWithDefault);
  }

  // A value no step produced (typed, pasted, controlled) carries no noise, so
  // every digit is kept.
  if (step == null && !hasNumberFormatRoundingOptions(format)) {
    return nextValue;
  }

  const roundedValue = removeFloatingPointErrors(nextValue, format);
  return shouldClamp ? clamp(roundedValue, minWithDefault, maxWithDefault) : roundedValue;
}
