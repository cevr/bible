import { Effect, Option } from "effect";
import type { Cleanup, EventHandler, Host, PropertyValue, StaticProps } from "../host.js";

/**
 * The browser host. Property names reach `setProperty` exactly as JSX wrote
 * them: a name the element owns becomes a property, anything else becomes an
 * attribute, so `value` and `disabled` behave and `aria-label` still lands.
 */

/** A DOM node the runtime may parent, text, or listen to. */
export type DomNode = Node;

const asElement = (node: Node): Option.Option<Element> => {
  if (node instanceof Element) {
    return Option.some(node);
  }
  return Option.none();
};

const applyProperty = (node: Node, name: string, value: PropertyValue): void => {
  const element = asElement(node);
  if (Option.isNone(element)) {
    return;
  }
  const target = element.value;
  if (name in target) {
    Reflect.set(target, name, value);
    return;
  }
  if (value === false) {
    target.removeAttribute(name);
    return;
  }
  target.setAttribute(name, String(value));
};

/** An event target that carries the text a person typed. */
interface Valued {
  readonly value: string;
}

const valueOf = (event: Event): string => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const valued: Valued = target;
    return valued.value;
  }
  return "";
};

export const host: Host<DomNode> = {
  createElement: (tag: string, staticProps: StaticProps) => {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(staticProps)) {
      applyProperty(element, name, value);
    }
    return element;
  },
  createText: (text: string) => document.createTextNode(text),
  setProperty: applyProperty,
  insert: (parent, node, anchor) => {
    Option.match(anchor, {
      onNone: () => parent.appendChild(node),
      onSome: (before) => parent.insertBefore(node, before),
    });
  },
  remove: (parent, node) => {
    if (node.parentNode === parent) {
      parent.removeChild(node);
    }
  },
  setText: (node, text) => {
    node.textContent = text;
  },
  addEventListener: (node, name, handler: EventHandler): Cleanup => {
    const listener = (event: Event): void =>
      handler({ value: valueOf(event), preventDefault: () => event.preventDefault() });
    node.addEventListener(name, listener);
    return () => node.removeEventListener(name, listener);
  },
};

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

export interface HydrationReport {
  /** Server nodes the client built differently. Empty when both agreed. */
  readonly mismatches: ReadonlyArray<string>;
  /** Server nodes the client never claimed. They are removed. */
  readonly unclaimed: number;
}

export interface Hydration {
  readonly host: Host<DomNode>;
  /** Call after `mount`: removes unclaimed server nodes and reports agreement. */
  readonly finish: Effect.Effect<HydrationReport>;
}

const TEXT_NODE = 3;
const COMMENT_NODE = 8;

/** Every node under `root` in document order. Comments only separate text. */
const collect = (root: Node): Array<Node> => {
  const out: Array<Node> = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== COMMENT_NODE) {
        out.push(child);
      }
      walk(child);
    }
  };
  walk(root);
  return out;
};

/**
 * A host that adopts the nodes a server rendered instead of creating new
 * ones. The runtime creates nodes in document order, so the next unclaimed
 * server node is the one this call means. A node that does not match is
 * recorded and replaced; once every server node is claimed the host creates
 * normally, which is what a `For` row added later needs.
 */
export const hydrate = (root: Node): Hydration => {
  const pending = collect(root);
  const mismatches: Array<string> = [];
  let cursor = 0;

  const claim = (): Option.Option<Node> => {
    const next = Option.fromNullishOr(pending[cursor]);
    if (Option.isSome(next)) {
      cursor += 1;
    }
    return next;
  };

  /** The client wins: drop a server node and everything under it. */
  const discard = (node: Node): void => {
    while (Option.exists(Option.fromNullishOr(pending[cursor]), (next) => node.contains(next))) {
      cursor += 1;
    }
    Option.map(Option.fromNullishOr(node.parentNode), (parent) => parent.removeChild(node));
  };

  const hydrating: Host<DomNode> = {
    createElement: (tag, staticProps) => {
      const candidate = claim();
      if (Option.isSome(candidate)) {
        const found = asElement(candidate.value);
        if (Option.isSome(found) && found.value.tagName.toLowerCase() === tag.toLowerCase()) {
          return found.value;
        }
        mismatches.push(`expected <${tag}>, found ${describe(candidate.value)}`);
        discard(candidate.value);
      }
      return host.createElement(tag, staticProps);
    },
    createText: (text) => {
      const candidate = claim();
      if (Option.isSome(candidate)) {
        if (candidate.value.nodeType === TEXT_NODE) {
          if (candidate.value.textContent !== text) {
            mismatches.push(`text "${String(candidate.value.textContent)}" became "${text}"`);
            candidate.value.textContent = text;
          }
          return candidate.value;
        }
        mismatches.push(`expected text "${text}", found ${describe(candidate.value)}`);
        discard(candidate.value);
      }
      return host.createText(text);
    },
    setProperty: host.setProperty,
    insert: (parent, node, anchor) => {
      if (node.parentNode === parent && Option.isNone(anchor)) {
        return;
      }
      if (
        node.parentNode === parent &&
        Option.isSome(anchor) &&
        node.nextSibling === anchor.value
      ) {
        return;
      }
      host.insert(parent, node, anchor);
    },
    remove: host.remove,
    setText: host.setText,
    addEventListener: host.addEventListener,
  };

  const finish = Effect.sync((): HydrationReport => {
    const leftover = pending.slice(cursor);
    for (const node of leftover) {
      Option.map(Option.fromNullishOr(node.parentNode), (parent) => parent.removeChild(node));
    }
    cursor = pending.length;
    return { mismatches: [...mismatches], unclaimed: leftover.length };
  });

  return { host: hydrating, finish };
};

const describe = (node: Node): string => {
  const element = asElement(node);
  if (Option.isSome(element)) {
    return `<${element.value.tagName.toLowerCase()}>`;
  }
  return `text "${String(node.textContent)}"`;
};

/** Read a payload the server wrote with `Html.jsonScript`. */
export const readJsonScript = (id: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(document.getElementById(id)), (script) =>
    Option.fromNullishOr(script.textContent),
  );
