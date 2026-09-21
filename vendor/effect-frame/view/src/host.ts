import type { Option } from "effect";

/**
 * What a renderer must provide. The runtime knows nothing about the DOM or a
 * terminal; it only creates, orders, and writes nodes through this interface.
 *
 * Every operation is synchronous. Host writes run inside the reactive graph,
 * which has no place to await an Effect.
 */
export interface Host<Node> {
  readonly createElement: (tag: string, staticProps: StaticProps) => Node;
  readonly createText: (text: string) => Node;
  readonly setProperty: (node: Node, name: string, value: PropertyValue) => void;
  /** Insert `node` before `anchor`, or at the end when the anchor is absent. */
  readonly insert: (parent: Node, node: Node, anchor: Option.Option<Node>) => void;
  readonly remove: (parent: Node, node: Node) => void;
  readonly setText: (node: Node, text: string) => void;
  /** Returns the cleanup that detaches the listener. */
  readonly addEventListener: (node: Node, name: string, handler: EventHandler) => Cleanup;
}

/**
 * What a host can write to a node. A binding may carry any value a selector
 * produced, so the host renders it the way it renders text.
 */
export type PropertyValue = string | number | boolean;

/** Props with no dynamic binding. The host applies them at creation. */
export type StaticProps = Readonly<Record<string, PropertyValue>>;

/**
 * What a host hands an event handler. The DOM gives an `Event`; OpenTUI gives
 * the input's new text. Both carry a value the handler may read, and a
 * default action the view may suppress.
 */
export interface HostEvent {
  /** The event's own value, when it has one: an input's text. */
  readonly value: string;
  readonly preventDefault: () => void;
}

export type EventHandler = (event: HostEvent) => void;

export type Cleanup = () => void;
