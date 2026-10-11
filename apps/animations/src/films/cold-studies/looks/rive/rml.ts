// RML, Rive's markup, written from code: an element tree printed the way
// `rive pull` writes a file. The knowledge is the old Rive attempt's
// (`core/rml.ts`, 9d89ab752..31e7db519); the rig is generated, not drawn. Pure.

/** An attribute's value as written: round a number before it gets here (`num`). */
export type Value = string | number | boolean;

export interface Element {
  readonly name: string;
  readonly attrs: ReadonlyArray<readonly [string, Value]>;
  readonly children: ReadonlyArray<Element>;
}

/** An element: its attributes in the order written, undefined ones left out. */
export const el = (
  name: string,
  attrs: Readonly<Record<string, Value | undefined>>,
  children: ReadonlyArray<Element> = [],
): Element => ({
  name,
  attrs: Object.entries(attrs).flatMap(([k, v]) =>
    v === undefined ? [] : [[k, typeof v === 'number' ? num(v) : v] as const],
  ),
  children,
});

const escape = (value: Value): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

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

/** A number as RML writes it: six decimals at most. */
export const num = (n: number): number => Math.round(n * 1e6) / 1e6;

/** A colour as RML writes it: `#rrggbb` with an alpha 0..1 as `AARRGGBB`. */
export const argb = (hex: string, alpha = 1): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${a}${hex.replace(/^#/, '')}`.toUpperCase();
};

/** Hands out ids, `1:n`, in the order asked: a generated file numbers itself the same way every build. */
export const ids = () => {
  let n = 0;
  return () => `1:${++n}`;
};
