// Upstream: packages/react/src/number-field/utils/parse.ts
//
// Reading numbers back from text a person typed or a formatter rendered:
// locale group and decimal separators, currency and unit labels, percent and
// permille signs, Unicode signs, and Arabic-Indic, Persian, fullwidth and Han
// numerals. Also the symbols a locale and format render, which the input
// accepts while typing.
import { getFormatter } from '../../utils/formatNumber.ts';

// Han numerals in digit order, both zero forms first ('零' at 0, '〇' at 1),
// so a character's digit is `max(indexOf - 1, 0)`.
const HAN_NUMERALS = '零〇一二三四五六七八九';

// Arabic-Indic (U+0660–0669), Persian (U+06F0–06F9) and fullwidth (U+FF10–FF19)
// digits are contiguous ranges whose bases are multiples of 16, so
// `charCode % 16` is the digit in all three.
const NON_ASCII_DIGIT_RE = /[٠-٩۰-۹０-９]/g;
const HAN_RE = /[零〇一二三四五六七八九]/g;

export const PERCENTAGES = ['%', '٪', '％', '﹪'];
export const PERMILLE = ['‰', '؉'];

// Fullwidth punctuation common in CJK input.
export const FULLWIDTH_DECIMAL = '．'; // U+FF0E
export const FULLWIDTH_GROUP = '，'; // U+FF0C

export const PERCENT_RE = /[%٪％﹪]/;
export const PERMILLE_RE = /[‰؉]/;
const PERCENT_GLOBAL_RE = /[%٪％﹪]/g;
const PERMILLE_GLOBAL_RE = /[‰؉]/g;

// Detection (non-global, so no `lastIndex` state). Arabic-Indic and Persian
// share one: both point the heuristic at the `ar` locale.
export const ARABIC_PERSIAN_DETECT_RE = /[٠-٩۰-۹]/;
export const HAN_DETECT_RE = /[零〇一二三四五六七八九]/;

const ANY_NUMERAL_DETECT_RE = /[0-9٠-٩۰-۹０-９零〇一二三四五六七八九]/;

/** Whether the character is a digit in any numeral system the field accepts. */
export function isNumeralChar(char: string): boolean {
  return ANY_NUMERAL_DETECT_RE.test(char);
}

export const BASE_NON_NUMERIC_SYMBOLS = [
  '.',
  ',',
  FULLWIDTH_DECIMAL,
  FULLWIDTH_GROUP,
  '٫',
  '٬',
] as const;
export const SPACE_SEPARATOR_RE = /\p{Zs}/u;
// Format and bidi controls (the marks RTL locales put around exponent and
// currency signs). `parseNumber` strips them, so typing treats them as ignorable.
export const FORMAT_CONTROL_DETECT_RE = /\p{Cf}/u;
const FORMAT_CONTROL_GLOBAL_RE = /\p{Cf}/gu;
export const PLUS_SIGNS_WITH_ASCII = ['+', '＋', '﹢'];
export const MINUS_SIGNS_WITH_ASCII = ['-', '−', '－', '‒', '–', '—', '﹣'];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function shiftDecimal(value: number, exponentDelta: number) {
  const [coefficient, exponent = '0'] = String(value).split('e');
  return Number(`${coefficient}e${Number(exponent) + exponentDelta}`);
}

export const ANY_MINUS_RE = /[-−－‒–—﹣]/gu;
export const ANY_PLUS_RE = /[+＋﹢]/gu;
export const ANY_MINUS_DETECT_RE = /[-−－‒–—﹣]/;
export const ANY_PLUS_DETECT_RE = /[+＋﹢]/;

// A number with a group separator and a fraction, so the formatter emits every
// locale part (group, decimal, currency, unit, literal, exponent…).
const SAMPLE_FORMAT_NUMBER = 11111.1;

/** The formatter's parts for a sample number: every non-numeric symbol it renders. */
export function getFormatParts(
  locale?: Intl.LocalesArgument,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormatPart[] {
  return getFormatter(locale, options).formatToParts(SAMPLE_FORMAT_NUMBER);
}

export type NumberLocaleDetails = Partial<Record<Intl.NumberFormatPartTypes, string>> & {
  decimal: string;
};

/** The symbol of each part type the locale and format render; `decimal` always set. */
export function getNumberLocaleDetails(
  locale?: Intl.LocalesArgument,
  options?: Intl.NumberFormatOptions,
): NumberLocaleDetails {
  const result: Partial<Record<Intl.NumberFormatPartTypes, string>> = {};
  for (const part of getFormatParts(locale, options)) {
    result[part.type] = part.value;
  }
  // An integer format renders no decimal separator, so take it from the plain
  // locale formatter (it is the same for every style of one locale).
  let decimal = '.';
  for (const part of getFormatter(locale).formatToParts(0.1)) {
    if (part.type === 'decimal') {
      decimal = part.value;
    }
  }
  return { ...result, decimal };
}

function groupSeparatorRegExp(group: string | undefined): RegExp | null {
  if (!group) {
    return null;
  }
  if (/\p{Zs}/u.test(group)) {
    return /\p{Zs}/gu;
  }
  // Some environments format the apostrophe group as ASCII, others curly.
  if (group === "'" || group === '’') {
    return /['’]/g;
  }
  return new RegExp(escapeRegExp(group), 'g');
}

function guessLocale(input: string, locale: Intl.LocalesArgument | undefined) {
  if (locale !== undefined) {
    return locale;
  }
  if (ARABIC_PERSIAN_DETECT_RE.test(input)) {
    return 'ar';
  }
  if (HAN_DETECT_RE.test(input)) {
    return 'zh';
  }
  return undefined;
}

type Replacement = readonly [RegExp | null, string | ((match: string) => string)];

function applyReplacements(input: string, replacements: ReadonlyArray<Replacement>) {
  let out = input;
  for (const [regex, replacement] of replacements) {
    if (!regex) {
      continue;
    }
    out =
      typeof replacement === 'string'
        ? out.replace(regex, replacement)
        : out.replace(regex, replacement);
  }
  return out;
}

/** Splits off a leading or trailing sign; returns the rest and whether it was negative. */
function takeSigns(input: string): [string, boolean] {
  let isNegative = false;
  const takeSign = (_match: string, sign: string) => {
    if (sign === '-') {
      isNegative = true;
    }
    return '';
  };
  const rest = input.replace(/([+-])\s*$/, takeSign).replace(/^\s*([+-])/, takeSign);
  return [rest, isNegative];
}

/** Parses formatted or typed text to a number, or `null` when it is not one. */
export function parseNumber(
  formattedNumber: string,
  locale?: Intl.LocalesArgument,
  options?: Intl.NumberFormatOptions,
): number | null {
  const normalized = formattedNumber
    .replace(FORMAT_CONTROL_GLOBAL_RE, '')
    .trim()
    .replace(ANY_MINUS_RE, '-')
    .replace(ANY_PLUS_RE, '+');
  const [input, isNegative] = takeSigns(normalized);

  const computedLocale = guessLocale(input, locale);
  const { group, decimal, currency, exponentSeparator } = getNumberLocaleDetails(
    computedLocale,
    options,
  );

  // Every unit part (such as "km/h").
  const unitParts = getFormatter(computedLocale, options)
    .formatToParts(1)
    .filter((part) => part.type === 'unit')
    .map((part) => escapeRegExp(part.value));
  const unitRegex = unitParts.length ? new RegExp(unitParts.join('|'), 'g') : null;

  let unformatted = applyReplacements(input, [
    [groupSeparatorRegExp(group), ''],
    [new RegExp(escapeRegExp(decimal), 'g'), '.'],
    // Fullwidth and Arabic decimal, then group, punctuation.
    [/[．٫]/g, '.'],
    [/[，٬]/g, ''],
    [currency ? new RegExp(escapeRegExp(currency), 'g') : null, ''],
    [unitRegex, ''],
    [PERCENT_GLOBAL_RE, ''],
    [PERMILLE_GLOBAL_RE, ''],
    [exponentSeparator ? new RegExp(escapeRegExp(exponentSeparator), 'g') : null, 'e'],
    [NON_ASCII_DIGIT_RE, (ch) => String(ch.charCodeAt(0) % 16)],
    [HAN_RE, (ch) => String(Math.max(HAN_NUMERALS.indexOf(ch) - 1, 0))],
  ]);

  // Mixed locales: only the last '.' is the decimal point.
  const lastDot = unformatted.lastIndexOf('.');
  if (lastDot !== -1) {
    unformatted = `${unformatted.slice(0, lastDot).replace(/\./g, '')}.${unformatted.slice(lastDot + 1).replace(/\./g, '')}`;
  }

  if (/^[-+]?Infinity$/i.test(input) || input.includes('∞')) {
    return null;
  }

  let num = parseFloat((isNegative ? '-' : '') + unformatted);

  const style = options?.style;
  const isUnitPercent = style === 'unit' && options?.unit === 'percent';
  const hasPercentSymbol = PERCENT_RE.test(formattedNumber) || style === 'percent';
  if (PERMILLE_RE.test(formattedNumber)) {
    num = shiftDecimal(num, -3);
  } else if (!isUnitPercent && hasPercentSymbol) {
    num = shiftDecimal(num, -2);
  }

  return Number.isFinite(num) ? num : null;
}
