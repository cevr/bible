// Upstream: packages/react/src/number-field/root/NumberFieldRoot.tsx (getAllowedNonNumericKeys)
//
// The characters besides digits the input accepts for a locale and format:
// the separators, every symbol the formatter renders (currency, units,
// exponent, literals), percent and permille variants for percent formats,
// plus signs always, and minus signs when negatives are reachable.
import {
  BASE_NON_NUMERIC_SYMBOLS,
  getFormatParts,
  getNumberLocaleDetails,
  MINUS_SIGNS_WITH_ASCII,
  PERCENTAGES,
  PERMILLE,
  PLUS_SIGNS_WITH_ASCII,
  SPACE_SEPARATOR_RE,
} from '../utils/parse.ts';

export interface AllowedNonNumericKeysOptions {
  locale: Intl.LocalesArgument | undefined;
  format: Intl.NumberFormatOptions | undefined;
  minWithDefault: number;
  allowOutOfRange: boolean;
}

export function getAllowedNonNumericKeys(options: AllowedNonNumericKeysOptions): Set<string> {
  const { locale, format } = options;
  const parts = getFormatParts(locale, format);
  const keys = new Set<string>(BASE_NON_NUMERIC_SYMBOLS);
  const addAll = (chars: ReadonlyArray<string>) => {
    for (const char of chars) {
      keys.add(char);
    }
  };

  // An integer format renders no decimal, but the locale's stays typeable.
  keys.add(
    parts.find((part) => part.type === 'decimal')?.value ??
      getNumberLocaleDetails(locale, format).decimal,
  );

  // Every non-digit character the formatter renders, one character at a time
  // (the input checks typed text per character). Compact suffixes (`K`, `M`)
  // stay out: `parseNumber` cannot reverse them.
  for (const part of parts) {
    if (
      part.type === 'integer' ||
      part.type === 'fraction' ||
      part.type === 'exponentInteger' ||
      part.type === 'compact'
    ) {
      continue;
    }
    addAll(Array.from(part.value));
    if (SPACE_SEPARATOR_RE.test(part.value)) {
      keys.add(' ');
    }
  }

  // Percent and permille variants the formatter does not emit but people type or paste.
  const style = format?.style;
  if (style === 'percent' || (style === 'unit' && format?.unit === 'percent')) {
    addAll(PERCENTAGES);
  }
  if (style === 'percent' || (style === 'unit' && format?.unit === 'permille')) {
    addAll(PERMILLE);
  }

  // Minus when negatives are valid, or when out-of-range entry lets native
  // underflow validation be reached from the keyboard.
  addAll(PLUS_SIGNS_WITH_ASCII);
  if (options.minWithDefault < 0 || options.allowOutOfRange) {
    addAll(MINUS_SIGNS_WITH_ASCII);
  }

  return keys;
}
