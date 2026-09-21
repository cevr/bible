/**
 * PROTOTYPE (ticket #17). Canonical JSON for query cache keys.
 *
 * This is the one place the prototype touches `JSON` directly, and it is a
 * boundary by construction: the input is a JSON string a Schema codec has
 * already produced, and the output is the same document with object keys
 * sorted at every depth. A Schema codec cannot do this for us, because the
 * property it establishes is about the *text*, not the value: two argument
 * values that are equal as data must produce one cache key even when the
 * caller spelled their fields in a different order.
 *
 * `.oxlintrc.json` disables `effect/noGlobals` and the unknown-shape rules
 * for this file alone. Nothing else in the package may reach for `JSON`.
 */

type Json = string | number | boolean | null | ReadonlyArray<Json> | { readonly [k: string]: Json };

const compare = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const sort = (value: Json): Json => {
  if (Array.isArray(value)) {
    return value.map(sort);
  }
  if (typeof value === "object" && value !== null) {
    const sorted: Record<string, Json> = {};
    // Code-unit order, not locale order: the key must be the same on every
    // machine that encodes the same arguments.
    const fields = Object.entries(value).sort(([left], [right]) => compare(left, right));
    for (const [field, nested] of fields) {
      sorted[field] = sort(nested);
    }
    return sorted;
  }
  return value;
};

/**
 * Re-encodes an encoded argument string into its canonical form. The input
 * must be JSON a codec produced; anything else is a programmer error and
 * throws, exactly as a malformed encoded payload does elsewhere.
 */
export const canonicalize = (encoded: string): string => JSON.stringify(sort(JSON.parse(encoded)));
