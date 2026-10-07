// Upstream: packages/react/src/number-field/utils/parse.test.ts
//
// Parsing typed and formatted numbers: locales, numeral systems, signs,
// percent and permille, currency and units, and what is not a number.
import { describe, expect, it } from 'bun:test';

import { getAllowedNonNumericKeys } from './root/allowedNonNumericKeys.ts';
import { getNumberLocaleDetails, isNumeralChar, parseNumber } from './utils/parse.ts';

describe('NumberField parse', () => {
  describe('getNumberLocaleDetails', () => {
    it('returns the number locale details', () => {
      const details = getNumberLocaleDetails('en-US');
      expect(details.decimal).toBe('.');
      expect(details.group).toBe(',');
      expect(details.currency).toBe(undefined);
      expect(details.percent).toBe(undefined);
      expect(details.unit).toBe(undefined);
    });

    it('resolves the decimal separator of an integer format from the locale', () => {
      expect(getNumberLocaleDetails('de-DE', { maximumFractionDigits: 0 }).decimal).toBe(',');
    });
  });

  describe('parseNumber', () => {
    it('parses a number', () => {
      const numberString = new Intl.NumberFormat().format(1234.56);
      expect(parseNumber(numberString)).toBe(1234.56);
    });

    it('parses percentages by default', () => {
      expect(parseNumber('12%')).toBe(0.12);
    });

    it('parses a number with Han numerals', () => {
      expect(parseNumber('一,二三四.五六')).toBe(1234.56);
    });

    it('parses percentages with Arabic numerals', () => {
      expect(parseNumber('١٢٪')).toBe(0.12);
    });

    it('parses percentages with Han numerals', () => {
      expect(parseNumber('一二%')).toBe(0.12);
    });

    it('returns null for an invalid number', () => {
      expect(parseNumber('invalid')).toBe(null);
    });

    it('handles percentages with style: "percent"', () => {
      expect(parseNumber('12%', 'en-US', { style: 'percent' })).toBe(0.12);
    });

    it('parses prefix percentages', () => {
      const format = { style: 'percent', maximumFractionDigits: 2 } as const;
      const formatted = new Intl.NumberFormat('tr-TR', format).format(0.0123);
      expect(parseNumber(formatted, 'tr-TR', format)).toBe(0.0123);
    });

    it('parses scientific notation percentages', () => {
      expect(parseNumber('1e-7%', 'en-US', { style: 'percent' })).toBe(1e-9);
    });

    it('handles percentages with style: "unit" and unit: "percent"', () => {
      expect(parseNumber('12%', 'en-US', { style: 'unit', unit: 'percent' })).toBe(12);
    });

    it('strips an interleaved percent sign (1%2)', () => {
      expect(parseNumber('1%2', 'en-US', { style: 'percent' })).toBe(0.12);
      expect(parseNumber('1%2', 'en-US', { style: 'unit', unit: 'percent' })).toBe(12);
    });

    it('parses fullwidth digits and punctuation', () => {
      expect(parseNumber('１，２３４．５６')).toBe(1234.56);
      expect(parseNumber('１２％')).toBe(0.12);
    });

    it('parses Persian digits', () => {
      expect(parseNumber('۱۲۳۴')).toBe(1234);
      expect(parseNumber('۱۲٫۳۴')).toBe(12.34);
      expect(parseNumber('۱۲٪')).toBe(0.12);
    });

    it('parses Persian digits with Arabic thousands and decimal characters', () => {
      expect(parseNumber('۱۲٬۳۴۵٫۶۷')).toBe(12345.67);
    });

    it('parses permille values', () => {
      expect(parseNumber('12‰')).toBe(0.012);
      expect(parseNumber('12؉')).toBe(0.012);
    });

    it('strips bidi/control characters', () => {
      expect(parseNumber('1‎234.56')).toBe(1234.56);
      expect(parseNumber('‎12‏%')).toBe(0.12);
    });

    it('handles unicode minus and plus signs', () => {
      expect(parseNumber('−1234')).toBe(-1234);
      expect(parseNumber('1234−')).toBe(-1234);
      expect(parseNumber('＋1234')).toBe(1234);
      expect(parseNumber('1234＋')).toBe(1234);
    });

    it('parses french formatted numbers with narrow no-break space grouping', () => {
      const fr = new Intl.NumberFormat('fr-FR').format(1234.5);
      expect(parseNumber(fr, 'fr-FR')).toBe(1234.5);
      expect(parseNumber(`${fr}−`, 'fr-FR')).toBe(-1234.5);
    });

    it('parses currency when options specify currency style', () => {
      expect(parseNumber('$1,234.56', 'en-US', { style: 'currency', currency: 'USD' })).toBe(
        1234.56,
      );
    });

    it('parses scientific notation with currency codes', () => {
      const format = {
        style: 'currency',
        currency: 'EUR',
        currencyDisplay: 'code',
        notation: 'scientific',
        maximumFractionDigits: 2,
      } as const;
      const formatted = new Intl.NumberFormat('en-US', format).format(12345);
      expect(parseNumber(formatted, 'en-US', format)).toBe(12300);
    });

    it.each(['ar-EG', 'fa-IR'] as const)(
      'parses localized scientific notation for %s',
      (locale) => {
        const format = { notation: 'scientific', maximumFractionDigits: 2 } as const;
        const formatted = new Intl.NumberFormat(locale, format).format(12345);
        expect(parseNumber(formatted, locale, format)).toBe(12300);
      },
    );

    it.each(['ar-EG', 'fa-IR'] as const)(
      'parses localized percent scientific notation with a negative exponent for %s',
      (locale) => {
        const format = {
          style: 'percent',
          notation: 'scientific',
          maximumFractionDigits: 2,
        } as const;
        const formatted = new Intl.NumberFormat(locale, format).format(0.0000012345);
        expect(parseNumber(formatted, locale, format)).toBe(0.00000123);
      },
    );

    it.each(['ar-EG', 'fa-IR'] as const)(
      'parses localized tiny percent scientific notation for %s',
      (locale) => {
        const format = {
          style: 'percent',
          notation: 'scientific',
          maximumFractionDigits: 2,
        } as const;
        const formatted = new Intl.NumberFormat(locale, format).format(0.0000000000012345);
        expect(parseNumber(formatted, locale, format)).toBe(0.00000000000123);
      },
    );

    it('parses scientific notation permille values', () => {
      expect(parseNumber('1e-7‰', 'en-US')).toBe(1e-10);
    });

    it('parses units when options specify unit style', () => {
      expect(parseNumber('12 kg', 'en-US', { style: 'unit', unit: 'kilogram' })).toBe(12);
    });

    it('returns null for Infinity-like inputs', () => {
      expect(parseNumber('Infinity')).toBe(null);
      expect(parseNumber('-Infinity')).toBe(null);
      expect(parseNumber('∞')).toBe(null);
    });

    it('returns null when parsing overflows to Infinity', () => {
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'percent',
        maximumFractionDigits: 2,
      }).format(Number.MAX_VALUE);
      expect(parseNumber(formatted, 'en-US', { style: 'percent' })).toBe(null);
    });

    it('collapses extra dots from mixed-locale inputs', () => {
      expect(parseNumber('1.234.567.89')).toBe(1234567.89);
    });

    it('parses number with mixed separators (FR)', () => {
      expect(parseNumber('1.234.567,89', 'fr-FR')).toBe(1234567.89);
    });

    it('parses number with mixed separators (US)', () => {
      expect(parseNumber('1.234.567,89', 'en-US')).toBe(1234.56789);
    });

    it('returns null for empty and whitespace-only input', () => {
      expect(parseNumber('')).toBe(null);
      expect(parseNumber('   ')).toBe(null);
    });

    it('returns null for just a sign', () => {
      expect(parseNumber('-')).toBe(null);
      expect(parseNumber('+')).toBe(null);
    });

    it('handles ASCII leading and trailing signs', () => {
      expect(parseNumber('+1234')).toBe(1234);
      expect(parseNumber('1234+')).toBe(1234);
      expect(parseNumber('-1234')).toBe(-1234);
      expect(parseNumber('1234-')).toBe(-1234);
    });

    it('supports multiple unicode minus variants', () => {
      expect(parseNumber('‒123')).toBe(-123);
      expect(parseNumber('–123')).toBe(-123);
      expect(parseNumber('—123')).toBe(-123);
      expect(parseNumber('－123')).toBe(-123);
      expect(parseNumber('﹣123')).toBe(-123);
    });

    it('supports additional unicode plus variants', () => {
      expect(parseNumber('﹢123')).toBe(123);
    });

    it('handles additional percent symbol variants', () => {
      expect(parseNumber('12％')).toBe(0.12);
      expect(parseNumber('12﹪')).toBe(0.12);
      expect(parseNumber('12٪')).toBe(0.12);
    });

    it('parses Arabic punctuation with ASCII digits', () => {
      expect(parseNumber('1٬234٫56')).toBe(1234.56);
    });

    it('removes various Unicode space groupings (fr-FR)', () => {
      expect(parseNumber('1 234,56', 'fr-FR')).toBe(1234.56);
      expect(parseNumber('1 234,56', 'fr-FR')).toBe(1234.56);
      expect(parseNumber('1 234,56', 'fr-FR')).toBe(1234.56);
      expect(parseNumber('1 234,56', 'fr-FR')).toBe(1234.56);
    });

    it('handles Swiss grouping apostrophe', () => {
      expect(parseNumber('1’234.56', 'de-CH')).toBe(1234.56);
      expect(parseNumber("1'234.56", 'de-CH')).toBe(1234.56);
    });

    it('parses de-DE formatted numbers', () => {
      expect(parseNumber('1.234,56', 'de-DE')).toBe(1234.56);
      expect(parseNumber('1.234.567,89', 'de-DE')).toBe(1234567.89);
    });

    it('parses currency prefix/suffix across locales', () => {
      const options = { style: 'currency', currency: 'EUR' } as const;
      const en = new Intl.NumberFormat('en-US', options).format(1234.56);
      const fr = new Intl.NumberFormat('fr-FR', options).format(1234.56);
      expect(parseNumber(en, 'en-US', options)).toBe(1234.56);
      expect(parseNumber(fr, 'fr-FR', options)).toBe(1234.56);
    });

    it('parses units with different formats', () => {
      expect(parseNumber('12 km/h', 'en-US', { style: 'unit', unit: 'kilometer-per-hour' })).toBe(
        12,
      );
      expect(parseNumber('12 m/s', 'en-US', { style: 'unit', unit: 'meter-per-second' })).toBe(12);
    });

    it('treats bidi/format controls as ignorable in the middle of input', () => {
      expect(parseNumber('1‪234‬.56')).toBe(1234.56);
      expect(parseNumber('‪12‬%')).toBe(0.12);
    });

    it('returns null for Infinity with explicit sign and surrounding spaces', () => {
      expect(parseNumber(' +Infinity ')).toBe(null);
      expect(parseNumber(' -∞ ')).toBe(null);
      expect(parseNumber('+Infinity')).toBe(null);
    });

    it('collapses multiple consecutive dots keeping only the last as decimal', () => {
      expect(parseNumber('1..5')).toBe(1.5);
      expect(parseNumber('123..456..789.01')).toBe(123456789.01);
      expect(parseNumber('....5')).toBe(0.5);
    });

    // Every digit of every numeral system the mapping decodes.
    it('maps the full Persian digit range', () => {
      expect(parseNumber('۹۸۷۶۵۴۳۲۱۰')).toBe(9876543210);
    });

    it('maps the full fullwidth digit range', () => {
      expect(parseNumber('０１２３４５６７８９')).toBe(123456789);
    });

    it('maps the full Han digit range', () => {
      expect(parseNumber('九八七六五四三二一〇')).toBe(9876543210);
    });

    it('maps both Han zero forms to 0', () => {
      expect(parseNumber('零')).toBe(0);
      expect(parseNumber('〇')).toBe(0);
    });
  });

  describe('isNumeralChar', () => {
    it('accepts a digit from every supported numeral system', () => {
      for (const char of ['0', '9', '٠', '٩', '۰', '۹', '０', '９', '零', '〇', '九']) {
        expect(isNumeralChar(char)).toBe(true);
      }
    });

    it('rejects non-digit characters', () => {
      for (const char of ['.', ',', '-', '+', '%', '٫', 'a', ' ']) {
        expect(isNumeralChar(char)).toBe(false);
      }
    });
  });

  describe('getAllowedNonNumericKeys', () => {
    const base = { locale: 'en-US', format: undefined };

    it('allows minus signs only when negatives are reachable', () => {
      const nonNegative = getAllowedNonNumericKeys({ ...base, minWithDefault: 0 });
      expect(nonNegative.has('-')).toBe(false);
      expect(nonNegative.has('+')).toBe(true);
      expect(getAllowedNonNumericKeys({ ...base, minWithDefault: -5 }).has('-')).toBe(true);
    });

    it('allows the percent and permille variants only for percent formats', () => {
      const percent = getAllowedNonNumericKeys({
        ...base,
        format: { style: 'percent' },
        minWithDefault: 0,
      });
      expect(percent.has('％')).toBe(true);
      expect(percent.has('‰')).toBe(true);
      const plain = getAllowedNonNumericKeys({ ...base, minWithDefault: 0 });
      expect(plain.has('%')).toBe(false);
      expect(plain.has('‰')).toBe(false);
    });

    it('allows every character a unit or currency renders, but no compact suffix', () => {
      const speed = getAllowedNonNumericKeys({
        ...base,
        format: { style: 'unit', unit: 'kilometer-per-hour' },
        minWithDefault: 0,
      });
      for (const char of ['k', 'm', '/', 'h', ' ']) {
        expect(speed.has(char)).toBe(true);
      }
      const compact = getAllowedNonNumericKeys({
        ...base,
        format: { notation: 'compact' },
        minWithDefault: 0,
      });
      expect(compact.has('K')).toBe(false);
    });

    it("keeps the locale's decimal separator typeable for integer formats", () => {
      const keys = getAllowedNonNumericKeys({
        locale: 'de-DE',
        format: { maximumFractionDigits: 0 },
        minWithDefault: 0,
      });
      expect(keys.has(',')).toBe(true);
    });
  });
});
