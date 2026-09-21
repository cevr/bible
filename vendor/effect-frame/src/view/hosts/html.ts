import { Effect, Option, Scope } from "effect";
import type { Cleanup, Host, PropertyValue, StaticProps } from "../host.js";
import { mount, render } from "../runtime.js";
import type { View } from "../view.js";

/**
 * The server host. It builds an in-memory tree and serializes it to HTML.
 * Everything it writes is escaped; a value from an actor can never become
 * markup. Adjacent text nodes are separated by an empty comment so the
 * hydrating host sees the same number of text nodes the server created.
 */

export interface HtmlElement {
  readonly _tag: "Element";
  readonly tag: string;
  readonly attributes: Map<string, PropertyValue>;
  readonly children: Array<HtmlNode>;
}

export interface HtmlText {
  readonly _tag: "Text";
  text: string;
}

export type HtmlNode = HtmlElement | HtmlText;

export const element = (tag: string): HtmlElement => ({
  _tag: "Element",
  tag,
  attributes: new Map(),
  children: [],
});

export const escapeText = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const escapeAttribute = (text: string): string => escapeText(text).replaceAll('"', "&quot;");

/**
 * JSON inside a `<script>` must never close the element. `<`, `>`, and `&`
 * become escapes JSON parsers accept, and the two line separators that
 * break older parsers go the same way.
 */
export const escapeJsonScript = (json: string): string =>
  json
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");

const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/** Separates adjacent text nodes so the browser parser keeps them apart. */
export const textSeparator = "<!---->";

const serializeAttributes = (attributes: ReadonlyMap<string, PropertyValue>): string => {
  let out = "";
  for (const [name, value] of attributes) {
    if (value === false) {
      continue;
    }
    if (value === true) {
      out += ` ${name}`;
      continue;
    }
    out += ` ${name}="${escapeAttribute(String(value))}"`;
  }
  return out;
};

export const serializeChildren = (children: ReadonlyArray<HtmlNode>): string => {
  let out = "";
  let previousWasText = false;
  for (const child of children) {
    if (child._tag === "Text" && previousWasText) {
      out += textSeparator;
    }
    out += serialize(child);
    previousWasText = child._tag === "Text";
  }
  return out;
};

export const serialize = (node: HtmlNode): string => {
  if (node._tag === "Text") {
    return escapeText(node.text);
  }
  const open = `<${node.tag}${serializeAttributes(node.attributes)}>`;
  if (voidElements.has(node.tag)) {
    return open;
  }
  return `${open}${serializeChildren(node.children)}</${node.tag}>`;
};

const removeChild = (parent: HtmlNode, node: HtmlNode): void => {
  if (parent._tag === "Text") {
    return;
  }
  const index = parent.children.indexOf(node);
  if (index >= 0) {
    parent.children.splice(index, 1);
  }
};

/** Attribute names as the DOM host would treat them, so both hosts agree. */
const attributeName = (name: string): string => {
  if (name === "className") {
    return "class";
  }
  if (name === "htmlFor") {
    return "for";
  }
  return name;
};

export const host: Host<HtmlNode> = {
  createElement: (tag: string, staticProps: StaticProps) => {
    const node = element(tag);
    for (const [name, value] of Object.entries(staticProps)) {
      node.attributes.set(attributeName(name), value);
    }
    return node;
  },
  createText: (text: string): HtmlText => ({ _tag: "Text", text }),
  setProperty: (node, name, value) => {
    if (node._tag === "Element") {
      node.attributes.set(attributeName(name), value);
    }
  },
  insert: (parent, node, anchor) => {
    if (parent._tag === "Text") {
      return;
    }
    removeChild(parent, node);
    Option.match(anchor, {
      onNone: () => void parent.children.push(node),
      onSome: (before) => {
        const index = parent.children.indexOf(before);
        if (index < 0) {
          parent.children.push(node);
          return;
        }
        parent.children.splice(index, 0, node);
      },
    });
  },
  remove: removeChild,
  setText: (node, text) => {
    if (node._tag === "Text") {
      node.text = text;
    }
  },
  // The server never receives an event. The listener is a no-op and so is its cleanup.
  addEventListener: (): Cleanup => () => {},
};

/**
 * Render one view to HTML. The render owns its own scope: setup runs, one
 * frame is drawn, the tree is serialized, and every resource setup opened
 * is released before the string returns. Two requests never share state.
 */
export const renderToString = Effect.fn("Html.renderToString")(function* <Props, E, R>(
  view: View<Props, E, R>,
  props: Props,
) {
  const scope = yield* Scope.make();
  const root = element("#root");
  const html = yield* mount(view, props, host, root).pipe(
    Effect.andThen(render),
    Effect.map(() => serializeChildren(root.children)),
    Scope.provide(scope),
    Effect.onExit((exit) => Scope.close(scope, exit)),
  );
  return html;
});

/** A JSON payload the client reads back by id. See `Dom.readJsonScript`. */
export const jsonScript = (id: string, json: string): string =>
  `<script type="application/json" id="${escapeAttribute(id)}">${escapeJsonScript(json)}</script>`;
