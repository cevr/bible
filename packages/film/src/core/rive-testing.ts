// Test helpers for the RML writers: walk an element tree, and read one back as
// `rive inspect` would report it, so a writer is held to what the reader reads.

import { expect } from 'bun:test';
import { Array as Arr } from 'effect';
import type { Timings } from './schema.ts';
import type { Element, Value } from './rml.ts';
import type { RiveNode } from './rive.ts';

/** No takes: `layout` times every scene by its estimate. */
export const unrecorded: Timings = { voice: 'test', scenes: {} };

/** Every element under `root`, depth first, `root` included. */
export const elements = (root: Element): ReadonlyArray<Element> => [
  root,
  ...root.children.flatMap(elements),
];

export const attr = (element: Element, key: string) => element.attrs.find(([k]) => k === key)?.[1];

/** The one element under `roots` of type `name` whose attributes include `match`. */
export const only = (
  roots: ReadonlyArray<Element>,
  name: string,
  match: Readonly<Record<string, Value>> = {},
): Element => {
  const found = roots
    .flatMap(elements)
    .filter((e) => e.name === name && Object.entries(match).every(([k, v]) => attr(e, k) === v));
  expect({ name, match, found: found.length }).toEqual({ name, match, found: 1 });
  return Arr.getUnsafe(found, 0);
};

/** The keys under a `<KeyedProperty>`: frame, value and interpolation. */
export const keys = (property: Element) =>
  property.children.map((k) => ({
    frame: attr(k, 'frame'),
    value: attr(k, 'value'),
    interpolation: attr(k, 'interpolationType'),
  }));

const NUMERIC = new Set(['width', 'height', 'x', 'y', 'fps', 'duration', 'frame', 'propertyKey']);

/** An attribute as `rive inspect` types it. */
const typed = (key: string, value: Value): string | number => {
  if (NUMERIC.has(key)) return Number(value);
  return String(value);
};

/** An element as `rive inspect --json` reports it: its tag is its type. */
export const toNode = (element: Element): RiveNode => ({
  ...Object.fromEntries(element.attrs.map(([k, v]) => [k, typed(k, v)])),
  type: element.name,
  children: element.children.map(toNode),
});
