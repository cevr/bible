import type { Source } from "@effect-frame/actor";
import { select as selectSource } from "@effect-frame/actor/client";
import { Context as ServiceMap, Effect, Option } from "effect";
import type { HostEvent } from "./host.js";
import type { Node } from "./jsx-runtime.js";

/**
 * A dynamic JSX value. `bind` is the only way to make one, so a reader sees
 * every reactive position in a template. The runtime subscribes to
 * `source.changes` inside the view scope; every other JSX value is static.
 */
export interface Bound<A> {
  readonly _tag: "Bound";
  readonly source: Source<A>;
}

/**
 * A prepared event. The runtime hands `run` to the host, and `run` forks the
 * handler's Effect into the view scope.
 */
export interface Prepared {
  readonly _tag: "Prepared";
  /** `true` when the host must suppress its default action first. */
  readonly preventDefault: boolean;
  readonly run: (event: HostEvent) => void;
}

/**
 * A handler maps one host event to work. Its failures must already be
 * handled: a view has no place to return one. Defects reach the fiber's
 * error reporter.
 */
export type Handler = (event: HostEvent) => Effect.Effect<unknown>;

/**
 * The capabilities a mounted view has. Every binding is explicit: nothing
 * here discovers a dependency by watching a read.
 */
export interface Capabilities {
  /** Mark a source as a dynamic JSX value, optionally through a projection. */
  readonly bind: {
    <A>(source: Source<A>): Bound<A>;
    <A, B>(source: Source<A>, project: (value: A) => B): Bound<B>;
  };
  /** Project a source into another source. Both stay explicit inputs. */
  readonly select: <A, B>(source: Source<A>, project: (value: A) => B) => Source<B>;
  /** Run the handler's Effect in the view scope when the host fires. */
  readonly event: (handler: Handler) => Prepared;
  /** `event`, but the host suppresses its default action first. */
  readonly submit: (handler: Handler) => Prepared;
}

export class Context extends ServiceMap.Service<Context, Capabilities>()(
  "@effect-frame/view/src/view/Context",
) {}

/**
 * A view: one setup Effect per mounted identity. Setup runs once. State
 * updates never run it again. `E` and `R` stay visible to the mounting
 * application, and `Scope` owns every resource setup opens.
 */
export interface View<Props, E, R> {
  readonly setup: (props: Props) => Effect.Effect<Node, E, R>;
}

export const make = <Props, E, R>(
  setup: (props: Props) => Effect.Effect<Node, E, R>,
): View<Props, E, R> => ({ setup });

/**
 * Build the capabilities for one mounted view. The captured context and
 * scope are what let `event` run from a synchronous host callback: the
 * forked fiber dies with the view.
 */
export const capabilities = Effect.fn("View.capabilities")(function* () {
  const context = yield* Effect.context<never>();
  const scope = yield* Effect.scope;
  const runFork = Effect.runForkWith(context);

  const prepare = (handler: Handler, preventDefault: boolean): Prepared => ({
    _tag: "Prepared",
    preventDefault,
    run: (event) => void runFork(Effect.forkIn(handler(event), scope)),
  });

  const bind = <A, B>(source: Source<A>, project?: (value: A) => B): Bound<A | B> =>
    Option.match(Option.fromNullishOr(project), {
      onNone: (): Bound<A | B> => ({ _tag: "Bound", source }),
      onSome: (f): Bound<A | B> => ({ _tag: "Bound", source: selectSource(source, f) }),
    });

  return Context.of({
    bind,
    select: selectSource,
    event: (handler) => prepare(handler, false),
    submit: (handler) => prepare(handler, true),
  });
});
