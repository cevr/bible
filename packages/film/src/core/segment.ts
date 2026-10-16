// A name from outside that the film writes into a path or keys a record by:
// a film, a footage source, a mark, a beat, a set's folder, an act.
// One owner, so the next name schema starts from what every earlier one had
// to learn (a `..` footage name, a take keyed `__proto__`, a `.` film).
// A leaf: `schema.ts` and `address-schema.ts` both build on it.

import { Option, Schema } from 'effect';

/** The folder itself and its parent: a path names them, a name never does. */
const FOLDERS: ReadonlySet<string> = new Set(['.', '..']);

/**
 * The keys a record reads off `Object.prototype` instead of its own: in an
 * object literal `__proto__` sets the prototype, and `constructor` and
 * `prototype` are found on every object, so a lookup by one answers though
 * the record never held it.
 */
const PROTOTYPE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** Why `name` is no segment, in plain words; none when it is one. */
const refusalOf = (name: string): Option.Option<string> => {
  if (name === '') return Option.some('a name is never empty');
  if (FOLDERS.has(name)) return Option.some(`"${name}" names a folder, never a name`);
  if (name.includes('/') || name.includes('\\'))
    return Option.some(`"${name}" holds a "/" or a "\\": a name is one path segment`);
  if (name === '__proto__')
    return Option.some(
      '"__proto__" sets an object\'s prototype in a literal, so a record never holds it',
    );
  if (PROTOTYPE_KEYS.has(name))
    return Option.some(
      `every object answers to "${name}" from its prototype, so a record keyed by it finds what it never held`,
    );
  return Option.none();
};

/** Whether `name` is one path segment no record lookup confuses with the prototype's. */
export const isSegment = (name: string): boolean => Option.isNone(refusalOf(name));

/**
 * One path segment, safe as a record key: never empty, `.`, `..`, a `/` or a
 * `\`, `__proto__`, `constructor` or `prototype`. Branded, so a path or
 * record builder that takes a `Segment` refuses a bare string: a name is
 * decoded before it names a file. Each name schema is `Segment.check(…)`,
 * its own pattern on top.
 */
export const Segment = Schema.String.check(
  Schema.makeFilter((name: string) =>
    Option.match(refusalOf(name), { onNone: () => true, onSome: (why) => why }),
  ),
).pipe(Schema.brand('Segment'));
export type Segment = typeof Segment.Type;
