import type { Source } from "effect-frame/actor";
import { Option, Predicate } from "effect";
import type { Bound, Prepared } from "./view.js";

/**
 * The JSX element model. A tree is data: the runtime walks it once at mount
 * and creates host nodes. Nothing here reads or writes a host.
 *
 * Every node carries a `_tag`, so the runtime narrows the tree by its tag and
 * never inspects a value's shape. `jsx` and `parse` are the one boundary
 * where a raw JSX expression becomes a tagged node.
 */

/** An intrinsic tag (`div`, `box`) or a component function. */
export type Tag = string | Component;

export type Component = (props: ElementProps) => Node;

/** A JSX value the runtime draws as text. */
export interface TextNode {
  readonly _tag: "Text";
  readonly text: string;
}

/** The absence of a child. JSX cannot produce `null`, so this stands in. */
export interface EmptyNode {
  readonly _tag: "Empty";
}

export interface ListNode {
  readonly _tag: "List";
  readonly children: ReadonlyArray<Node>;
}

export interface ElementNode {
  readonly _tag: "Element";
  readonly tag: string;
  readonly props: ElementProps;
  readonly children: Node;
}

/**
 * A keyed list. Each row receives a read-only source for its own item, so
 * replacing an item under the same key updates that row in place.
 */
export interface ForNode<Item> {
  readonly _tag: "For";
  readonly each: Source<ReadonlyArray<Item>>;
  readonly keyBy: (item: Item) => string;
  readonly render: (item: Source<Item>) => Node;
}

export interface ShowNode {
  readonly _tag: "Show";
  readonly when: Source<boolean>;
  readonly children: Node;
}

/** Control flow in the tree. `control.ts` builds it; `runtime.ts` reads it. */
export type ControlNode = ForNode<never> | ShowNode;

export const Empty: EmptyNode = { _tag: "Empty" };

/** Everything the runtime may find in a child position. */
export type Node = ElementNode | ControlNode | Bound<unknown> | TextNode | ListNode | EmptyNode;

/**
 * What JSX may write in a child position before `parse` tags it. A component
 * may also hand back a raw value, so `parse` accepts the same shapes.
 */
export type Child = Node | string | number | boolean | ReadonlyArray<Child>;

/** A prop the host applies once, at creation. */
export interface StaticValue {
  readonly _tag: "Static";
  readonly value: string | number | boolean;
}

/** Every prop value the runtime understands, once it has been sorted. */
export type PropValue = Bound<unknown> | Prepared | StaticValue;

/** What JSX may write in a prop position, before `classify` sorts it. */
export type RawProp = Child | Bound<unknown> | Prepared;

/**
 * One element's props as JSX wrote them. `children` is a prop like any
 * other, so the index signature covers it and an absent prop is simply a
 * name the record does not hold.
 */
export interface ElementProps {
  readonly [name: string]: RawProp;
}

const isList = (value: RawProp): value is ReadonlyArray<Child> => Array.isArray(value);

/**
 * Parse one JSX child position into a tagged node. A prepared event has no
 * meaning as a child, so it draws nothing.
 */
export const parse = (child: RawProp): Node => {
  if (isList(child)) {
    return { _tag: "List", children: child.map(parse) };
  }
  if (Predicate.isString(child)) {
    return { _tag: "Text", text: child };
  }
  if (Predicate.isNumber(child)) {
    return { _tag: "Text", text: String(child) };
  }
  if (Predicate.isBoolean(child)) {
    return Empty;
  }
  if (child._tag === "Prepared") {
    return Empty;
  }
  return child;
};

/** A missing `children` prop is an empty slot, not a value to parse. */
const parseChildren = (props: ElementProps): Node =>
  Option.match(Option.fromNullishOr(props["children"]), { onNone: () => Empty, onSome: parse });

export const jsx = (tag: Tag, props: ElementProps): Node => {
  if (Predicate.isFunction(tag)) {
    return tag(props);
  }
  return { _tag: "Element", tag, props, children: parseChildren(props) };
};

export const jsxs = jsx;

export const jsxDEV = jsx;

/** `<>...</>` yields its children unchanged. */
export const Fragment: Component = parseChildren;

export declare namespace JSX {
  /** What every JSX expression evaluates to. TypeScript looks for this name. */
  type Element = Node;
  /**
   * Every tag and component this runtime accepts. A component is any function
   * from its own props to a node, so `For` and `Show` fit with no widening.
   */
  type ElementType = string | ((props: never) => Node);
  interface ElementChildrenAttribute {
    readonly children: Child;
  }
  interface IntrinsicElements {
    readonly [tag: string]: ElementProps;
  }
}
