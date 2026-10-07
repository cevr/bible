// Upstream: packages/react/src/number-field/utils/validate.ts
//
// Turns a candidate value into the one the field stores: clamped to
// `[min, max]` and cleaned of the binary noise stepping arithmetic leaves
// (`0.1 + 0.2`), or rounded as the format's rounding options say.
import { clamp } from '../../utils/clamp.ts';
import { getFormatter } from '../../utils/formatNumber.ts';
import { parseNumber } from './parse.ts';

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

export function toValidatedNumber(
  value: number | null,
  stepped: boolean,
  minWithDefault: number,
  maxWithDefault: number,
  format: NumberFormatOptionsWithRounding | undefined,
): number | null {
  if (value === null) {
    return value;
  }

  // Clamp before rounding so a value just outside a fractional bound comes in
  // first, and again after, in case rounding pushed it back out.
  const clampedValue = clamp(value, minWithDefault, maxWithDefault);

  // A value no step produced (typed, pasted) carries no noise, so every digit
  // is kept.
  if (!stepped && !hasNumberFormatRoundingOptions(format)) {
    return clampedValue;
  }

  return clamp(removeFloatingPointErrors(clampedValue, format), minWithDefault, maxWithDefault);
}
