import type { Source } from "effect-frame/actor";
import { select } from "effect-frame/actor/client";
import type { Node, View } from "effect-frame/view";
import type { Scope } from "effect";
import { Effect, Option, Result, Schema, SubscriptionRef } from "effect";

/**
 * A route is a bidirectional codec for a URL plus the view that URL shows
 * (#18). Both halves are data: the template is parsed once into parts that
 * print as well as match, and the params and search carry Schemas that
 * decode and encode. Nothing in a route runs; the router runs it.
 *
 * The URLPattern grammar is the notation and the URLPattern object is not
 * used: the object only parses, and a router needs to print.
 */

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

/** One piece of a path template. */
export type Part =
  | { readonly _tag: "Literal"; readonly text: string }
  | { readonly _tag: "Segment"; readonly name: string }
  | { readonly _tag: "Tail"; readonly name: string };

/** A template the grammar accepts but the router cannot print. */
export class TemplateRejected extends Schema.TaggedError<TemplateRejected>()("TemplateRejected", {
  template: Schema.String,
  reason: Schema.String,
}) {}

const reject = (template: string, reason: string) =>
  Result.fail(TemplateRejected.make({ template, reason }));

const partOf = (template: string, raw: string): Result.Result<Part, TemplateRejected> => {
  if (raw === "*") {
    return reject(template, "an unnamed wildcard has no name to print from");
  }
  if (raw.includes("(")) {
    return reject(template, "a regexp group cannot print; refine the param's Schema instead");
  }
  if (!raw.startsWith(":")) {
    return Result.succeed({ _tag: "Literal", text: raw });
  }
  if (raw.endsWith("*")) {
    return Result.succeed({ _tag: "Tail", name: raw.slice(1, -1) });
  }
  if (raw.endsWith("?")) {
    return reject(template, "an optional segment is not supported yet; use a search param");
  }
  return Result.succeed({ _tag: "Segment", name: raw.slice(1) });
};

/**
 * Parse a template into parts. Rejected, not diagnosed: a regexp group and
 * an unnamed wildcard cannot print, and nothing may follow a tail because
 * the tail would swallow it silently.
 */
export const parseTemplate = (
  template: string,
): Result.Result<ReadonlyArray<Part>, TemplateRejected> => {
  const parts: Array<Part> = [];
  for (const raw of segmentsOf(template)) {
    const last = Option.fromNullishOr(parts[parts.length - 1]);
    if (Option.exists(last, (part) => part._tag === "Tail")) {
      return reject(template, "nothing may follow a tail");
    }
    const part = partOf(template, raw);
    if (Result.isFailure(part)) {
      return Result.fail(part.failure);
    }
    parts.push(part.success);
  }
  return Result.succeed(parts);
};

const segmentsOf = (path: string): ReadonlyArray<string> =>
  path.split("/").filter((segment) => segment !== "");

const decodeSegment = Option.liftThrowable(decodeURIComponent);

/** What the path parts decode to, before the params Schema sees it. */
export const PathRecord = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Array(Schema.String)]),
);
export type PathRecord = Schema.Schema.Type<typeof PathRecord>;

/** Match a pathname against parts. Every segment is percent-decoded first. */
export const matchPath = (
  parts: ReadonlyArray<Part>,
  pathname: string,
): Option.Option<PathRecord> => {
  const segments = segmentsOf(pathname);
  const record: Record<string, string | ReadonlyArray<string>> = {};
  let index = 0;
  for (const part of parts) {
    if (part._tag === "Tail") {
      const rest = Option.all(segments.slice(index).map(decodeSegment));
      if (Option.isNone(rest)) {
        return Option.none();
      }
      record[part.name] = rest.value;
      index = segments.length;
      continue;
    }
    const segment = Option.flatMap(Option.fromNullishOr(segments[index]), decodeSegment);
    if (Option.isNone(segment)) {
      return Option.none();
    }
    index += 1;
    if (part._tag === "Literal") {
      if (segment.value !== part.text) {
        return Option.none();
      }
      continue;
    }
    record[part.name] = segment.value;
  }
  if (index !== segments.length) {
    return Option.none();
  }
  return Option.some(record);
};

/** Print parts from a record. Total for a record the params Schema produced. */
export const printPath = (parts: ReadonlyArray<Part>, record: PathRecord): string => {
  const printed = parts.flatMap((part): ReadonlyArray<string> => {
    if (part._tag === "Literal") {
      return [encodeURIComponent(part.text)];
    }
    const value = Option.getOrThrowWith(Option.fromNullishOr(record[part.name]), () =>
      TemplateRejected.make({
        template: part.name,
        reason: "the params Schema produced no value for this part",
      }),
    );
    if (Array.isArray(value)) {
      return value.map(encodeURIComponent);
    }
    return [encodeURIComponent(String(value))];
  });
  return `/${printed.join("/")}`;
};

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * The query string as a keyed multimap. Search params never take part in
 * matching: two URLs that differ only in their query match the same route
 * with different search values, so a filter change is a stayed transition.
 */
export const SearchRecord = Schema.Record(Schema.String, Schema.Array(Schema.String));
export type SearchRecord = Schema.Schema.Type<typeof SearchRecord>;

export const readSearch = (params: URLSearchParams): SearchRecord => {
  const record: Record<string, Array<string>> = {};
  for (const [key, value] of params) {
    const values = Option.getOrElse(Option.fromNullishOr(record[key]), () => {
      const created: Array<string> = [];
      record[key] = created;
      return created;
    });
    values.push(value);
  }
  return record;
};

/** Print a record back, keys in the order the Schema encoded them. */
export const printSearch = (record: SearchRecord): string => {
  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(record)) {
    for (const value of values) {
      params.append(key, value);
    }
  }
  const printed = params.toString();
  if (printed === "") {
    return "";
  }
  return `?${printed}`;
};

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/** A params Schema: decodes the matched path record, encodes back to it. */
export type ParamsCodec = Schema.Codec<unknown, PathRecord>;
/** A search Schema: decodes the query multimap, encodes back to it. */
export type SearchCodec = Schema.Codec<unknown, SearchRecord>;

/**
 * What a route's view receives. Sources, not values: a stayed segment's
 * params can change without its view re-running, so the router publishes
 * the new values into these.
 */
export interface RouteProps<Params, Search> {
  readonly params: Source<Params>;
  readonly search: Source<Search>;
}

export interface RouteDefinition<Params extends ParamsCodec, Search extends SearchCodec, R> {
  /** The URLPattern pathname grammar, restricted to what prints. */
  readonly path: string;
  readonly params: Params;
  readonly search: Search;
  readonly view: View.View<RouteProps<Params["Type"], Search["Type"]>, never, R>;
}

/**
 * A mounted route as the router drives it. `setup` is the view's setup with
 * this URL's values already bound; `update` publishes a later URL into them
 * and answers whether it still matched. The decoded types stay inside the
 * route that made them, so the router needs no cast to hold routes of
 * different shapes in one list.
 */
export interface Entered<R> {
  readonly setup: Effect.Effect<Node, never, R | Scope.Scope | View.Context>;
  readonly update: (url: URL) => Effect.Effect<boolean>;
}

/** A route with its shapes erased: what a router holds. */
export interface AnyRoute<R> {
  readonly name: string;
  readonly enter: (url: URL) => Option.Option<Effect.Effect<Entered<R>>>;
}

export interface Route<
  Name extends string,
  Params extends ParamsCodec,
  Search extends SearchCodec,
  R,
> extends AnyRoute<R> {
  readonly name: Name;
  readonly params: Params;
  readonly search: Search;
  /** Prints. Total: a value of the Schema's own type always encodes. */
  readonly href: (params: Params["Type"], search: Search["Type"]) => string;
}

interface Decoded<Params, Search> {
  readonly params: Params;
  readonly search: Search;
}

/**
 * Rendering mode is a constructor, not a field. `spa` is the one built so
 * far: the route renders on the client only. The others are #18 §6.
 */
export const spa = <
  const Name extends string,
  Params extends ParamsCodec,
  Search extends SearchCodec,
  R,
>(
  name: Name,
  definition: RouteDefinition<Params, Search, R>,
): Route<Name, Params, Search, R> => {
  const parts = Result.getOrThrowWith(parseTemplate(definition.path), (rejected) => rejected);
  const decodeParams = Schema.decodeUnknownOption(definition.params);
  const decodeSearch = Schema.decodeUnknownOption(definition.search);
  const encodeParams = Schema.encodeSync(definition.params);
  const encodeSearch = Schema.encodeSync(definition.search);

  const parse = (url: URL): Option.Option<Decoded<Params["Type"], Search["Type"]>> =>
    Option.flatMap(matchPath(parts, url.pathname), (record) =>
      Option.flatMap(decodeParams(record), (params) =>
        Option.map(decodeSearch(readSearch(url.searchParams)), (search) => ({ params, search })),
      ),
    );

  const enter = (url: URL) =>
    Option.map(parse(url), (decoded) =>
      Effect.map(SubscriptionRef.make(decoded), (current): Entered<R> => {
        const source: Source<Decoded<Params["Type"], Search["Type"]>> = {
          get: SubscriptionRef.get(current),
          changes: SubscriptionRef.changes(current),
        };
        return {
          setup: definition.view.setup({
            params: select(source, (value) => value.params),
            search: select(source, (value) => value.search),
          }),
          update: (next) =>
            Option.match(parse(next), {
              onNone: () => Effect.succeed(false),
              onSome: (value) => Effect.as(SubscriptionRef.set(current, value), true),
            }),
        };
      }),
    );

  return {
    name,
    params: definition.params,
    search: definition.search,
    href: (params, search) =>
      `${printPath(parts, encodeParams(params))}${printSearch(encodeSearch(search))}`,
    enter,
  };
};
