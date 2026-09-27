// RML, Rive's markup, written as text. The film writes two kinds of artboard
// with it: the Film, which nests every scene on the voice's clock, and a new
// scene's storyboard. Everything else in a film's Rive project is drawn by hand
// or in the editor. Pure.

/** An attribute's value as written: round a number before it gets here. */
export type Value = string | number | boolean;

export interface Element {
  readonly name: string;
  readonly attrs: ReadonlyArray<readonly [string, Value]>;
  readonly children: ReadonlyArray<Element>;
}

/** An element: its attributes in the order written. */
export const el = (
  name: string,
  attrs: Readonly<Record<string, Value>>,
  children: ReadonlyArray<Element> = [],
): Element => ({ name, attrs: Object.entries(attrs), children });

const escape = (value: Value): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');

/** One element per line, four spaces a level, the way `rive pull` writes a file. */
const print = (element: Element, depth: number): string => {
  const pad = '    '.repeat(depth);
  const attrs = element.attrs.map(([key, value]) => ` ${key}="${escape(value)}"`).join('');
  if (element.children.length === 0) return `${pad}<${element.name}${attrs}/>`;
  const inner = element.children.map((child) => print(child, depth + 1)).join('\n');
  return `${pad}<${element.name}${attrs}>\n${inner}\n${pad}</${element.name}>`;
};

/** A project file: the fragment every `.rml` file of a project is. */
export const fragment = (elements: ReadonlyArray<Element>): string =>
  `${print(el('Rive', { version: '1', kind: 'fragment' }, elements), 0)}\n`;

/** An object id: a client number and an object number (`client:object`). */
export const rmlId = (client: number, object: number): string => `${client}:${object}`;

/** A number as RML writes it: six decimals at most, no trailing zeros. */
export const num = (n: number): number => Math.round(n * 1e6) / 1e6;

/** A colour as RML writes it: `#rrggbb` (or `#aarrggbb`) as `AARRGGBB`. */
export const argb = (hex: string): string => {
  const digits = hex.replace(/^#/, '').toUpperCase();
  if (digits.length === 8) return digits;
  return `FF${digits}`;
};
