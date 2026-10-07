// Upstream: packages/react/src/number-field/utils/validate.test.ts
//
// What the field stores for a candidate value: clamping, float-noise cleanup
// of stepped values, and the format's rounding options.
import { describe, expect, it } from 'bun:test';

import {
  type NumberFormatOptionsWithRounding,
  removeFloatingPointErrors,
  toValidatedNumber as toValidatedNumberImpl,
} from './utils/validate.ts';

interface ValidateOptions {
  stepped: boolean;
  minWithDefault: number;
  maxWithDefault: number;
  format: NumberFormatOptionsWithRounding | undefined;
}

const defaultOptions: ValidateOptions = {
  stepped: true,
  minWithDefault: Number.MIN_SAFE_INTEGER,
  maxWithDefault: Number.MAX_SAFE_INTEGER,
  format: undefined,
};

// Over the positional signature, so cases can spread option objects.
const toValidatedNumber = (value: number | null, options: ValidateOptions) =>
  toValidatedNumberImpl(
    value,
    options.stepped,
    options.minWithDefault,
    options.maxWithDefault,
    options.format,
  );

const formatted = (value: number, format: NumberFormatOptionsWithRounding) =>
  new Intl.NumberFormat('en-US', format).format(value);

describe('NumberField validate', () => {
  describe('removeFloatingPointErrors', () => {
    it('returns 0.3 for 0.2 + 0.1', () => {
      expect(removeFloatingPointErrors(0.2 + 0.1)).toBe(0.3);
    });

    it('cleans negative floating point noise without a format', () => {
      expect(removeFloatingPointErrors(-0.1 - 0.2)).toBe(-0.3);
    });

    it('preserves precision finer than 3 fraction digits without a format', () => {
      expect(removeFloatingPointErrors(0.0005)).toBe(0.0005);
      expect(removeFloatingPointErrors(1.23456)).toBe(1.23456);
    });

    it('preserves safe integers exactly without a format', () => {
      expect(removeFloatingPointErrors(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
      expect(removeFloatingPointErrors(Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER);
    });

    it('cleans 16-digit noise patterns from arithmetic', () => {
      expect(removeFloatingPointErrors(0.1 + 0.7)).toBe(0.8);
      expect(removeFloatingPointErrors(0.1 + 0.2 + 0.3)).toBe(0.6);
    });

    it('leaves large-magnitude noise uncleaned once one ULP exceeds the absolute cap', () => {
      expect(removeFloatingPointErrors(1000000.1 + 0.2)).toBe(1000000.1 + 0.2);
      expect(removeFloatingPointErrors(1000000.1 + 0.2)).not.toBe(1000000.3);
    });

    it('returns non-finite values untouched', () => {
      expect(removeFloatingPointErrors(Infinity)).toBe(Infinity);
      expect(removeFloatingPointErrors(-Infinity)).toBe(-Infinity);
      expect(removeFloatingPointErrors(NaN)).toBeNaN();
    });

    it('rounds compact notation against its standard equivalent', () => {
      expect(
        removeFloatingPointErrors(1234.567, { notation: 'compact', maximumFractionDigits: 1 }),
      ).toBe(1234.6);
    });

    it('returns 0.3 for 0.2 + 0.1 with maximumFractionDigits', () => {
      expect(removeFloatingPointErrors(0.2 + 0.1, { maximumFractionDigits: 1 })).toBe(0.3);
    });

    it('respects roundingMode when maximumFractionDigits is provided', () => {
      expect(
        removeFloatingPointErrors(1.239, { maximumFractionDigits: 2, roundingMode: 'floor' }),
      ).toBe(1.23);
    });

    it('respects half-even rounding at ties', () => {
      const format = { maximumFractionDigits: 2, roundingMode: 'halfEven' } as const;
      expect(removeFloatingPointErrors(1.235, format)).toBe(1.24);
      expect(removeFloatingPointErrors(1.245, format)).toBe(1.24);
    });

    it('respects rounding mode differences for negative values', () => {
      expect(
        removeFloatingPointErrors(-1.239, { maximumFractionDigits: 2, roundingMode: 'floor' }),
      ).toBe(-1.24);
      expect(
        removeFloatingPointErrors(-1.239, { maximumFractionDigits: 2, roundingMode: 'trunc' }),
      ).toBe(-1.23);
    });

    it('rounds percent values at display scale when maximumFractionDigits is provided', () => {
      expect(
        removeFloatingPointErrors(0.01236, { style: 'percent', maximumFractionDigits: 2 }),
      ).toBe(0.0124);
      expect(
        removeFloatingPointErrors(0.01239, {
          style: 'percent',
          maximumFractionDigits: 2,
          roundingMode: 'floor',
        }),
      ).toBe(0.0123);
    });

    it.each(['floor', 'ceil', 'trunc', 'expand'] as const)(
      'preserves exact percent precision boundaries with roundingMode: %s',
      (roundingMode) => {
        expect(
          removeFloatingPointErrors(0.0046, {
            style: 'percent',
            maximumFractionDigits: 2,
            roundingMode,
          }),
        ).toBe(0.0046);
      },
    );

    it('rounds percent values at display scale when only minimumFractionDigits is provided', () => {
      expect(
        removeFloatingPointErrors(0.01239, {
          style: 'percent',
          minimumFractionDigits: 2,
          roundingMode: 'floor',
        }),
      ).toBe(0.0123);
    });

    it('rounds values with significant digit precision', () => {
      expect(
        removeFloatingPointErrors(12345, { maximumSignificantDigits: 3, roundingMode: 'floor' }),
      ).toBe(12300);
    });

    it('rounds percent values at display scale when significant digits are provided', () => {
      expect(
        removeFloatingPointErrors(0.01239, {
          style: 'percent',
          maximumSignificantDigits: 3,
          roundingMode: 'floor',
        }),
      ).toBe(0.0123);
    });

    it('rounds percent significant digit values without reintroducing binary noise', () => {
      const format = {
        style: 'percent',
        maximumSignificantDigits: 2,
        roundingMode: 'floor',
      } as const;
      const rounded = removeFloatingPointErrors(0.009995, format);
      expect(rounded).toBe(0.0099);
      expect(formatted(rounded, format)).toBe(formatted(0.009995, format));
    });

    it('preserves tiny percent significant digit values after scaling back', () => {
      const format = { style: 'percent', maximumSignificantDigits: 2 } as const;
      const rounded = removeFloatingPointErrors(0.000001234, format);
      expect(rounded).toBe(0.0000012);
      expect(formatted(rounded, format)).toBe(formatted(0.000001234, format));
    });

    it('preserves meaningful percent precision above directional rounding boundaries', () => {
      const format = { style: 'percent', maximumFractionDigits: 2, roundingMode: 'ceil' } as const;
      const rounded = removeFloatingPointErrors(0.01230000001, format);
      expect(rounded).toBe(0.0124);
      expect(formatted(rounded, format)).toBe(formatted(0.01230000001, format));
    });

    it('preserves high-precision percent fraction digits', () => {
      const value = 0.001234567890123456;
      expect(
        removeFloatingPointErrors(value, { style: 'percent', maximumFractionDigits: 16 }),
      ).toBe(value);
    });

    it('preserves high-precision percent boundaries with directional rounding', () => {
      const format = {
        style: 'percent',
        maximumFractionDigits: 16,
        roundingMode: 'floor',
      } as const;
      const rounded = removeFloatingPointErrors(0.0046, format);
      expect(rounded).toBe(0.0046);
      expect(formatted(rounded, format)).toBe(formatted(0.0046, format));
    });

    it('preserves tiny values when Intl supports more than 20 fraction digits', () => {
      expect(removeFloatingPointErrors(1e-21, { maximumFractionDigits: 21 })).toBe(1e-21);
    });

    it('uses percent fraction defaults when significant digits use roundingPriority', () => {
      const format = {
        style: 'percent',
        maximumSignificantDigits: 3,
        roundingPriority: 'morePrecision',
      } as const;
      const rounded = removeFloatingPointErrors(0.0123456, format);
      expect(rounded).toBe(0.0123);
      expect(formatted(rounded, format)).toBe(formatted(0.0123456, format));
    });

    it('respects roundingPriority when fraction and significant digits are provided', () => {
      expect(
        removeFloatingPointErrors(1.2399, {
          minimumFractionDigits: 2,
          maximumSignificantDigits: 3,
          roundingMode: 'floor',
          roundingPriority: 'morePrecision',
        }),
      ).toBe(1.239);
    });

    it('does not scale unit percent values when maximumFractionDigits is provided', () => {
      expect(
        removeFloatingPointErrors(1.239, {
          style: 'unit',
          unit: 'percent',
          maximumFractionDigits: 2,
          roundingMode: 'floor',
        }),
      ).toBe(1.23);
    });

    it('rounds currency values without percent scaling', () => {
      expect(
        removeFloatingPointErrors(1.239, {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
          roundingMode: 'floor',
        }),
      ).toBe(1.23);
    });

    it('rounds scientific currency code values', () => {
      expect(
        removeFloatingPointErrors(12345, {
          style: 'currency',
          currency: 'EUR',
          currencyDisplay: 'code',
          notation: 'scientific',
          maximumFractionDigits: 2,
        }),
      ).toBe(12300);
    });

    it('preserves negative values when signDisplay hides the sign', () => {
      const format = { maximumFractionDigits: 2, signDisplay: 'never' } as const;
      const rounded = removeFloatingPointErrors(-1.239, format);
      expect(rounded).toBe(-1.24);
      expect(formatted(rounded, format)).toBe(formatted(-1.239, format));
    });

    it('rounds negative accounting currency values', () => {
      const format = {
        style: 'currency',
        currency: 'USD',
        currencySign: 'accounting',
        maximumFractionDigits: 2,
      } as const;
      const rounded = removeFloatingPointErrors(-1.239, format);
      expect(rounded).toBe(-1.24);
      expect(formatted(rounded, format)).toBe(formatted(-1.239, format));
    });

    it('respects roundingMode when no precision is provided', () => {
      expect(
        removeFloatingPointErrors(1.2399, { minimumIntegerDigits: 1, roundingMode: 'floor' }),
      ).toBe(1.239);
    });

    it('respects roundingIncrement when maximumFractionDigits is provided', () => {
      expect(
        removeFloatingPointErrors(1.26, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
          roundingIncrement: 5,
        }),
      ).toBe(1.5);
    });

    it('keeps the original finite value when percent scaling overflows before Intl rounding', () => {
      expect(
        removeFloatingPointErrors(Number.MAX_VALUE, {
          style: 'percent',
          maximumFractionDigits: 2,
          roundingMode: 'floor',
        }),
      ).toBe(Number.MAX_VALUE);
    });

    it('rounds scientific notation values at their formatted scale', () => {
      const format = { notation: 'scientific', maximumFractionDigits: 2 } as const;
      const rounded = removeFloatingPointErrors(0.000123456, format);
      expect(rounded).toBe(0.000123);
      expect(formatted(rounded, format)).toBe(formatted(0.000123456, format));
    });

    it('preserves non-invertible scientific rounded zero buckets', () => {
      const format = {
        notation: 'scientific',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        roundingIncrement: 5,
      } as const;
      const rounded = removeFloatingPointErrors(12345, format);
      expect(rounded).toBe(12345);
      expect(formatted(rounded, format)).toBe(formatted(12345, format));
    });

    it('rounds invertible scientific zero buckets', () => {
      expect(
        removeFloatingPointErrors(1, {
          notation: 'scientific',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
          roundingIncrement: 5,
        }),
      ).toBe(0);
    });

    it('returns 1000 for 1000, ignoring grouping', () => {
      expect(removeFloatingPointErrors(1000)).toBe(1000);
    });

    it('ignores formatting style', () => {
      expect(removeFloatingPointErrors(1000, { style: 'currency', currency: 'USD' })).toBe(1000);
    });

    it('uses resolved maximumFractionDigits when only minimum is provided', () => {
      expect(removeFloatingPointErrors(1.234567, { minimumFractionDigits: 5 })).toBe(1.23457);
    });
  });

  describe('toValidatedNumber', () => {
    it('returns null when value is null', () => {
      expect(toValidatedNumber(null, defaultOptions)).toBe(null);
    });

    it('preserves parsed input beyond 15 significant digits when not stepped', () => {
      const options = { ...defaultOptions, stepped: false };
      expect(toValidatedNumber(1.234567890123456, options)).toBe(1.234567890123456);
      expect(toValidatedNumber(0.1234567890123456, options)).toBe(0.1234567890123456);
    });

    it('cleans arithmetic noise when stepping', () => {
      expect(toValidatedNumber(0.1 + 0.7, defaultOptions)).toBe(0.8);
      expect(toValidatedNumber(0.2 + 0.1, defaultOptions)).toBe(0.3);
    });

    it('preserves large fractional values when stepping cleanup would be too coarse', () => {
      const steppedValue = 100000000000000.1 + 0.1;
      expect(toValidatedNumber(steppedValue, defaultOptions)).toBe(steppedValue);
    });

    it('preserves high-significance step values', () => {
      const step = 0.1234567890123456;
      expect(toValidatedNumber(step, defaultOptions)).toBe(step);
    });

    it('clamps to min and max', () => {
      const bounds = { ...defaultOptions, minWithDefault: -10, maxWithDefault: 10 };
      expect(toValidatedNumber(13, bounds)).toBe(10);
      expect(toValidatedNumber(-13, { ...bounds, stepped: false })).toBe(-10);
      expect(toValidatedNumber(5.5, { ...bounds, stepped: false })).toBe(5.5);
    });
  });

  it('applies roundingMode to a stepped value', () => {
    expect(
      toValidatedNumber(1.239, {
        ...defaultOptions,
        format: { maximumFractionDigits: 2, roundingMode: 'floor' },
      }),
    ).toBe(1.23);
  });

  it('clamps the final value after percent rounding crosses max', () => {
    expect(
      toValidatedNumber(0.01236, {
        ...defaultOptions,
        stepped: false,
        maxWithDefault: 0.01235,
        format: { style: 'percent', maximumFractionDigits: 2 },
      }),
    ).toBe(0.01235);
  });

  it('clamps the final value after directional percent rounding crosses min', () => {
    expect(
      toValidatedNumber(0.01234, {
        ...defaultOptions,
        stepped: false,
        minWithDefault: 0.01235,
        format: { style: 'percent', maximumFractionDigits: 2, roundingMode: 'floor' },
      }),
    ).toBe(0.01235);
  });

  it('clamps before rounding for non-integer bounds', () => {
    // 0.4 clamps to 0.6 first, which the integer format rounds to 1.
    expect(
      toValidatedNumber(0.4, {
        ...defaultOptions,
        stepped: false,
        minWithDefault: 0.6,
        maxWithDefault: 10,
        format: { maximumFractionDigits: 0 },
      }),
    ).toBe(1);
  });
});
