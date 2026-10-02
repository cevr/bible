// Upstream: packages/utils/src/formatNumber.ts, packages/utils/src/stringifyLocale.ts
//
// Number formatting through cached `Intl.NumberFormat` instances: one
// formatter per locale and options pair, reused across calls. A `null` value
// formats as the empty string.

const cache = new Map<string, Intl.NumberFormat>();

/** A locale argument as a stable string key (arrays joined by commas). */
export function stringifyLocale(locale?: Intl.LocalesArgument): string {
  if (Array.isArray(locale)) {
    return locale.map((value: Intl.LocalesArgument) => stringifyLocale(value)).join(',');
  }
  if (locale == null) {
    return '';
  }
  return String(locale);
}

/** The cached formatter for `locale` and `options`. */
export function getFormatter(
  locale?: Intl.LocalesArgument,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = JSON.stringify({ locale: stringifyLocale(locale), options });
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.NumberFormat(locale, options);
  cache.set(key, formatter);
  return formatter;
}

export function formatNumber(
  value: number | null,
  locale?: Intl.LocalesArgument,
  options?: Intl.NumberFormatOptions,
): string {
  if (value == null) {
    return '';
  }
  return getFormatter(locale, options).format(value);
}
