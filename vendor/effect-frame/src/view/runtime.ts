import type { Source } from "effect-frame/actor";
import { Effect, Exit, Match, Option, Predicate, Queue, Scope, Stream } from "effect";
import type { Accessor } from "@solidjs/signals";
import { createRenderEffect, createRoot, createSignal, flush, untrack } from "@solidjs/signals";
import type { Cleanup, Host, PropertyValue, StaticProps } from "./host.js";
import type { ElementNode, ForNode, Node, PropValue } from "./jsx-runtime.js";
import type { Bound, Prepared, View } from "./view.js";
import { Context as ViewContext, capabilities as makeCapabilities } from "./view.js";

/**
 * The mount runtime. It walks one JSX tree, resolves every explicitly bound
 * source, and then builds host nodes. Solid's graph carries an update from a
 * source to a host write; it is never a public entry point.
 */

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/**
 * Solid reads a stored function as a compute, so every value the runtime
 * holds travels boxed. One box, one rule, and a view may bind a source whose
 * value happens to be a function.
 */
interface Box<A> {
  readonly value: A;
}

interface Cell<A> {
  readonly read: Accessor<A>;
  readonly write: (value: A) => void;
}

const makeCell = <A>(initial: A): Cell<A> => {
  const [read, write] = createSignal<Box<A>>({ value: initial }, { equals: false });
  return { read: () => read().value, write: (value) => void write({ value }) };
};

// ---------------------------------------------------------------------------
// Signal-backed sources
// ---------------------------------------------------------------------------

const SignalBacked = Symbol.for("effect-frame/view/SignalBacked");

/**
 * A source whose value already lives in the reactive graph. `For` gives one
 * to each row: the row's item, updated in place when the list replaces that
 * key. The runtime reads its accessor straight from the graph.
 */
interface SignalSource<A> extends Source<A> {
  readonly [SignalBacked]: Accessor<A>;
}

/**
 * A subscriber to `changes` lives outside the reactive graph, so the effect
 * that feeds it gets an owner of its own: one root, disposed with the
 * stream's scope. Delivery runs untracked, because an offer can resume the
 * consumer fiber synchronously and that consumer may read a signal; such a
 * read is the consumer's, not this effect's.
 */
const signalSource = <A>(read: Accessor<A>): SignalSource<A> => ({
  [SignalBacked]: read,
  get: Effect.sync(read),
  changes: Stream.callback<A>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        createRoot((dispose) => {
          createRenderEffect(read, (value) => untrack(() => void Queue.offerUnsafe(queue, value)));
          return dispose;
        }),
      ),
      (dispose) => Effect.sync(dispose),
    ),
  ),
});

const isSignalSource = <A>(source: Source<A>): source is SignalSource<A> => SignalBacked in source;

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

/**
 * A slot is one child position under a parent. `nodes` is the span the slot
 * currently occupies, in order, so a dynamic slot replaces only its own span
 * and leaves its siblings alone.
 */
interface Slot<HostNode> {
  nodes: ReadonlyArray<HostNode>;
}

/** Builds a slot's content under `parent`. `changed` reports a new span. */
type Build<HostNode> = (parent: HostNode, slot: Slot<HostNode>, changed: () => void) => void;

/** An index that may be out of range, and a key that may be absent. */
const at = <A>(items: ReadonlyArray<A>, index: number): Option.Option<A> =>
  Option.fromNullishOr(items[index]);

const get = <K, V>(map: ReadonlyMap<K, V>, key: K): Option.Option<V> =>
  Option.fromNullishOr(map.get(key));

/** The first node after this slot, which anchors an ordered insert. */
const anchorAfter = <HostNode>(
  slots: ReadonlyArray<Slot<HostNode>>,
  index: number,
): Option.Option<HostNode> => {
  for (let i = index + 1; i < slots.length; i += 1) {
    const first = Option.flatMap(at(slots, i), (slot) => at(slot.nodes, 0));
    if (Option.isSome(first)) {
      return first;
    }
  }
  return Option.none();
};

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

/** What a build produced, and the closer for the scope it was built in. */
interface Owned<A> {
  readonly value: A;
  readonly close: () => void;
}

/**
 * The tracker turns a `Source` into a reactive accessor. It is synchronous by
 * design: host nodes are built inside the Solid root, and a `For` row that
 * appears long after mount must plan its own body there.
 *
 * `track` reads the source's current value and forks its subscription into
 * whichever scope is current, through the context captured at mount. A source
 * whose `get` suspends cannot be bound, and saying so here keeps every later
 * phase free of Effects.
 *
 * `owned` runs a build under a fresh child scope and hands back the closer.
 * Whatever that build tracks is subscribed in that child, so closing it ends
 * exactly those subscriptions. A `Show` branch uses it; the mount root is the
 * scope everything else falls back to.
 */
interface Tracker {
  readonly track: <A>(source: Source<A>) => Accessor<A>;
  readonly register: (cleanup: Cleanup) => void;
  readonly owned: <A>(build: () => A) => Owned<A>;
}

interface Renderer<HostNode> {
  readonly host: Host<HostNode>;
  readonly tracker: Tracker;
}

const makeTracker = Effect.fn("View.makeTracker")(function* () {
  const cleanups: Array<Cleanup> = [];
  const context = yield* Effect.context<Scope.Scope>();
  const mountScope = yield* Effect.scope;
  const runSync = Effect.runSyncWith(context);
  const runFork = Effect.runForkWith(context);

  // The scope a subscription forks into. `owned` swaps it for the duration of
  // one build, so a branch's subscriptions land in the branch's own scope.
  let current: Scope.Scope = mountScope;

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanups.length = 0;
    }),
  );

  const track = <A>(source: Source<A>): Accessor<A> => {
    if (isSignalSource(source)) {
      return source[SignalBacked];
    }
    const cell = makeCell(source.get.pipe(runSync));
    runFork(
      Effect.forkIn(
        Stream.runForEach(source.changes, (value) => Effect.sync(() => cell.write(value))),
        current,
      ),
    );
    return cell.read;
  };

  const owned = <A>(build: () => A): Owned<A> => {
    const outer = current;
    const child = Scope.forkUnsafe(outer);
    current = child;
    const value = build();
    current = outer;
    return { value, close: () => void runFork(Scope.close(child, Exit.void)) };
  };

  return {
    track,
    register: (cleanup: Cleanup) => void cleanups.push(cleanup),
    owned,
  } satisfies Tracker;
});

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * What a selector produced, rendered the way a host can apply it. A binding
 * carries whatever its projection returned, so this is where an arbitrary
 * value becomes one a host understands.
 */
const asPropertyValue = <A>(value: A): PropertyValue => {
  if (Predicate.isString(value) || Predicate.isNumber(value) || Predicate.isBoolean(value)) {
    return value;
  }
  return String(value);
};

const asText = (value: PropertyValue): string => {
  if (value === false) {
    return "";
  }
  return String(value);
};

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** Turn one JSX node into a builder. Recursion is plain and synchronous. */
const plan = <HostNode>(renderer: Renderer<HostNode>, node: Node): Build<HostNode> =>
  Match.value(node).pipe(
    Match.withReturnType<Build<HostNode>>(),
    Match.tagsExhaustive({
      Empty: () => nothing(),
      Text: (text) => staticText(renderer.host, text.text),
      Bound: (bound) => dynamicText(renderer.host, renderer.tracker.track(bound.source)),
      List: (list) =>
        sequence(
          renderer.host,
          list.children.map((child) => plan(renderer, child)),
        ),
      Element: (element) => planElement(renderer, element),
      For: (list) => planFor(renderer, list),
      // The branch is planned lazily, inside the owner that shows it, so a
      // hidden branch has tracked no source. `For` plans each row the same
      // way, for the same reason.
      Show: (branch) =>
        show(renderer.tracker, renderer.host, renderer.tracker.track(branch.when), () =>
          plan(renderer, branch.children),
        ),
    }),
  );

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const nothing =
  <HostNode>(): Build<HostNode> =>
  () => {};

const staticText =
  <HostNode>(host: Host<HostNode>, text: string): Build<HostNode> =>
  (parent, slot) => {
    const node = host.createText(text);
    slot.nodes = [node];
    host.insert(parent, node, Option.none());
  };

const dynamicText =
  <HostNode>(host: Host<HostNode>, accessor: Accessor<unknown>): Build<HostNode> =>
  (parent, slot) => {
    const read = (): string => asText(asPropertyValue(accessor()));
    const node = host.createText(read());
    slot.nodes = [node];
    host.insert(parent, node, Option.none());
    createRenderEffect(read, (text) => host.setText(node, text), { defer: true });
  };

const sequence =
  <HostNode>(host: Host<HostNode>, builds: ReadonlyArray<Build<HostNode>>): Build<HostNode> =>
  (parent, slot, changed) => {
    const slots: ReadonlyArray<Slot<HostNode>> = builds.map(() => ({ nodes: [] }));
    const sync = (): void => {
      slot.nodes = slots.flatMap((child) => child.nodes);
      changed();
    };
    builds.forEach((build, index) => {
      Option.match(at(slots, index), {
        onNone: () => {},
        onSome: (child) =>
          build(parent, child, () => {
            const anchor = anchorAfter(slots, index);
            for (const created of child.nodes) {
              host.insert(parent, created, anchor);
            }
            sync();
          }),
      });
    });
    sync();
  };

/**
 * A branch that is currently drawn: the span it occupies and the reactive
 * owner that keeps it live. Hidden is the absence of one, so there is no
 * state describing a branch that has nodes but no owner, or the reverse.
 */
interface Branch<HostNode> {
  readonly slot: Slot<HostNode>;
  readonly dispose: () => void;
}

/**
 * A branch exists only while it is shown. Showing plans and builds it inside
 * its own reactive owner, exactly as a `For` row is built; hiding disposes
 * that owner and removes the span it holds. The branch's own slot is the
 * single record of what it owns, so a nested `Show` that reveals content
 * underneath this one reports upward through `changed` and this slot stays
 * true. Nothing survives a hide: a hidden branch holds no host node, keeps no
 * source subscribed, and runs no binding.
 */
const show =
  <HostNode>(
    tracker: Tracker,
    host: Host<HostNode>,
    when: Accessor<boolean>,
    child: () => Build<HostNode>,
  ): Build<HostNode> =>
  (parent, slot, changed) => {
    let branch: Option.Option<Branch<HostNode>> = Option.none();

    const build = (): Branch<HostNode> => {
      const inner: Slot<HostNode> = { nodes: [] };
      // One reactive owner and one Effect scope per shown branch: the render
      // effects live in the first, the source subscriptions in the second.
      // Building reads every source it binds, for the first value. Those
      // reads are deliberate and do not subscribe this branch's `when`
      // effect to them, so the build runs untracked.
      const branchOwner = tracker.owned(() =>
        createRoot((disposeBranch) => {
          untrack(() =>
            child()(parent, inner, () => {
              slot.nodes = inner.nodes;
              changed();
            }),
          );
          return disposeBranch;
        }),
      );
      return {
        slot: inner,
        dispose: () => {
          branchOwner.value();
          branchOwner.close();
        },
      };
    };

    const tearDown = (shown: Branch<HostNode>): void => {
      shown.dispose();
      for (const node of shown.slot.nodes) {
        host.remove(parent, node);
      }
    };

    const apply = (visible: boolean): void => {
      if (visible === Option.isSome(branch)) {
        return;
      }
      if (visible) {
        const shown = build();
        branch = Option.some(shown);
        slot.nodes = shown.slot.nodes;
      } else {
        Option.match(branch, { onNone: () => {}, onSome: tearDown });
        branch = Option.none();
        slot.nodes = [];
      }
      changed();
    };

    apply(when());
    createRenderEffect(when, apply, { defer: true });
  };

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

const isEventProp = (name: string): boolean => name.length > 2 && name.startsWith("on");

const eventNameOf = (name: string): string => `${name.slice(2, 3).toLowerCase()}${name.slice(3)}`;

interface ElementPlan<HostNode> {
  readonly tag: string;
  readonly staticProps: StaticProps;
  readonly dynamic: ReadonlyArray<readonly [string, Accessor<unknown>]>;
  readonly events: ReadonlyArray<readonly [string, Prepared]>;
  readonly children: Build<HostNode>;
}

type RawProp = NonNullable<ElementNode["props"][string]>;

/**
 * The one place a raw JSX prop becomes a kind the runtime understands. A
 * marker object keeps its identity; everything else is a static value the
 * host applies once.
 */
/**
 * A prop that carries a marker the runtime owns, rather than a value the host
 * applies. Composed from `isTagged` so a new marker tag is one more clause.
 */
const isMarker = (value: RawProp): value is Bound<unknown> | Prepared =>
  Predicate.or(Predicate.isTagged("Bound"), Predicate.isTagged("Prepared"))(value);

const classify = (value: RawProp): PropValue => {
  if (isMarker(value)) {
    return value;
  }
  return { _tag: "Static", value: asPropertyValue(value) };
};

/** Sort one element's props into the three kinds a host can apply. */
const sortProps = <HostNode>(
  renderer: Renderer<HostNode>,
  element: ElementNode,
): Omit<ElementPlan<HostNode>, "tag" | "children"> => {
  const staticProps: Record<string, PropertyValue> = {};
  const dynamic: Array<readonly [string, Accessor<unknown>]> = [];
  const events: Array<readonly [string, Prepared]> = [];

  for (const [name, raw] of Object.entries(element.props)) {
    const present = Option.fromNullishOr(raw);
    if (name === "children" || Option.isNone(present)) {
      continue;
    }
    const prop = classify(present.value);
    if (prop._tag === "Prepared" && isEventProp(name)) {
      events.push([eventNameOf(name), prop]);
    } else if (prop._tag === "Bound") {
      dynamic.push([name, renderer.tracker.track(prop.source)]);
    } else if (prop._tag === "Static") {
      staticProps[name] = prop.value;
    }
  }

  return { staticProps, dynamic, events };
};

const planElement = <HostNode>(
  renderer: Renderer<HostNode>,
  element: ElementNode,
): Build<HostNode> =>
  buildElement(renderer, {
    tag: element.tag,
    ...sortProps(renderer, element),
    children: plan(renderer, element.children),
  });

const buildElement =
  <HostNode>(renderer: Renderer<HostNode>, element: ElementPlan<HostNode>): Build<HostNode> =>
  (parent, slot) => {
    const { host, tracker } = renderer;
    const node = host.createElement(element.tag, element.staticProps);
    for (const [name, accessor] of element.dynamic) {
      const read = (): PropertyValue => asPropertyValue(accessor());
      host.setProperty(node, name, read());
      createRenderEffect(read, (value) => host.setProperty(node, name, value), { defer: true });
    }
    for (const [name, prepared] of element.events) {
      tracker.register(
        host.addEventListener(node, name, (event) => {
          if (prepared.preventDefault) {
            event.preventDefault();
          }
          prepared.run(event);
        }),
      );
    }
    element.children(node, { nodes: [] }, () => {});
    slot.nodes = [node];
    host.insert(parent, node, Option.none());
  };

// ---------------------------------------------------------------------------
// For
// ---------------------------------------------------------------------------

interface Row<HostNode, Item> {
  readonly slot: Slot<HostNode>;
  readonly set: (item: Item) => void;
  readonly dispose: () => void;
}

/**
 * A keyed list. Each row owns a cell holding its item and receives that cell
 * as a read-only `Source`, so replacing an item under the same key updates
 * the row in place and keeps its host nodes. Every row plans its own body,
 * inside its own reactive owner, so a row created long after mount builds
 * exactly like the first one.
 */
const planFor = <HostNode, Item>(
  renderer: Renderer<HostNode>,
  node: ForNode<Item>,
): Build<HostNode> => buildFor(renderer, node, renderer.tracker.track(node.each));

const buildFor =
  <HostNode, Item>(
    renderer: Renderer<HostNode>,
    node: ForNode<Item>,
    items: Accessor<ReadonlyArray<Item>>,
  ): Build<HostNode> =>
  (parent, slot, changed) => {
    const { host, tracker } = renderer;
    const rows = new Map<string, Row<HostNode, Item>>();
    let order: ReadonlyArray<string> = [];

    const createRow = (item: Item): Row<HostNode, Item> => {
      const rowSlot: Slot<HostNode> = { nodes: [] };
      const cell = makeCell(item);
      // One reactive owner and one Effect scope per row, as for a `Show`
      // branch: whatever the row's body subscribes to ends with the row.
      const rowOwner = tracker.owned(() =>
        createRoot((disposeRow) => {
          // Untracked for the reason a `Show` branch is: the build's reads are
          // first values, not dependencies of the list's own effect.
          untrack(() =>
            plan(renderer, node.render(signalSource(cell.read)))(parent, rowSlot, () => {}),
          );
          return disposeRow;
        }),
      );
      return {
        slot: rowSlot,
        set: cell.write,
        dispose: () => {
          rowOwner.value();
          rowOwner.close();
        },
      };
    };

    const reorder = (): void => {
      const slots = order.flatMap((key) =>
        Option.match(get(rows, key), { onNone: () => [], onSome: (row) => [row.slot] }),
      );
      slots.forEach((child, index) => {
        const anchor = anchorAfter(slots, index);
        for (const created of child.nodes) {
          host.insert(parent, created, anchor);
        }
      });
      slot.nodes = slots.flatMap((child) => child.nodes);
      changed();
    };

    const apply = (next: ReadonlyArray<Item>): void => {
      const keys = next.map(node.keyBy);
      const wanted = new Set(keys);
      for (const [key, row] of rows) {
        if (!wanted.has(key)) {
          for (const created of row.slot.nodes) {
            host.remove(parent, created);
          }
          row.dispose();
          rows.delete(key);
        }
      }
      next.forEach((item, index) => {
        Option.match(at(keys, index), {
          onNone: () => {},
          onSome: (key) =>
            Option.match(get(rows, key), {
              onNone: () => void rows.set(key, createRow(item)),
              onSome: (row) => row.set(item),
            }),
        });
      });
      order = keys;
      reorder();
    };

    apply(items());
    createRenderEffect(items, apply, { defer: true });
  };

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
 * Mount one view on a host. The Scope owns everything: the view's setup
 * resources, the forked source subscriptions, the reactive root, and the host
 * nodes. Closing it runs every Effect finalizer and then removes the nodes.
 */
export const mount = Effect.fn("View.mount")(function* <Props, E, R, HostNode>(
  view: View<Props, E, R>,
  props: Props,
  host: Host<HostNode>,
  root: HostNode,
) {
  const capabilities = yield* makeCapabilities();
  const tree: Node = yield* Effect.provideService(view.setup(props), ViewContext, capabilities);

  const tracker = yield* makeTracker();
  const slot: Slot<HostNode> = { nodes: [] };

  // Planning creates the signals a binding writes to, so it belongs inside
  // the root that owns them.
  const dispose = createRoot((disposeRoot) => {
    plan({ host, tracker }, tree)(root, slot, () => {});
    flush();
    return disposeRoot;
  });

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      dispose();
      for (const node of slot.nodes) {
        host.remove(root, node);
      }
      slot.nodes = [];
    }),
  );
});

/**
 * Deliver every pending host write. A source change reaches its signal on the
 * subscription's own fiber, so this first lets those fibers run and only then
 * flushes the reactive graph. A test calls it after it changes state.
 */
export const render: Effect.Effect<void> = Effect.andThen(
  Effect.repeat(Effect.yieldNow, { times: 9 }),
  Effect.sync(flush),
);
