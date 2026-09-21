import type { Source } from "@effect-frame/actor";
import type { ForNode, Node, ShowNode } from "./jsx-runtime.js";

/**
 * Control flow in JSX. Both take an explicit source, so a reader sees what
 * makes the branch or the list move. They only build a marker; the runtime
 * interprets it.
 */

export interface ForProps<Item> {
  readonly each: Source<ReadonlyArray<Item>>;
  readonly keyBy: (item: Item) => string;
  /** Each row receives a read-only source for its own keyed item. */
  readonly children: (item: Source<Item>) => Node;
}

export const For = <Item>(props: ForProps<Item>): ForNode<Item> => ({
  _tag: "For",
  each: props.each,
  keyBy: props.keyBy,
  render: props.children,
});

export interface ShowProps {
  readonly when: Source<boolean>;
  readonly children: Node;
}

export const Show = (props: ShowProps): ShowNode => ({
  _tag: "Show",
  when: props.when,
  children: props.children,
});
