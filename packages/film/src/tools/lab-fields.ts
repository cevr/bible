// A lab command's fields, read from the JSON Schema its tool is listed by
// (what an MCP client reads in `tools/list`): each property's name, its kind,
// whether it is required and its description. A command's transports take
// their fields from here (`lab-command.ts` answers them as `fields`), so the
// terminal's flags are the MCP tool's arguments by construction. The JSON
// Schema of an object is made here too (`objectSchema`), for a tool's listing
// and an MCP event's (`mcp-events.ts`) alike.

import { Array as Arr, Option, Predicate, Schema } from 'effect';
import type { JsonSchema } from 'effect';
import type { Tool } from 'effect/ai';

/** What a field is, read from its JSON Schema: one value (a word, a number, a switch), a list of words or numbers, or JSON. */
export type FieldKind = 'word' | 'number' | 'switch' | 'words' | 'numbers' | 'json';

/** A field kind that is one value. */
type Primitive = 'word' | 'number' | 'switch';

/** A field of a command's parameters: its name, its kind, whether it is required, and its words. */
export interface LabField {
  readonly name: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly description: string;
}

const isJsonArray = Schema.is(Schema.Array(Schema.Json));

/** A JSON Schema node, as far as a field is read from one. */
const Node = Schema.Struct({
  $ref: Schema.optionalKey(Schema.String),
  type: Schema.optionalKey(Schema.Json),
  enum: Schema.optionalKey(Schema.Array(Schema.Json)),
  const: Schema.optionalKey(Schema.Json),
  anyOf: Schema.optionalKey(Schema.Array(Schema.Json)),
  oneOf: Schema.optionalKey(Schema.Array(Schema.Json)),
  items: Schema.optionalKey(Schema.Json),
  prefixItems: Schema.optionalKey(Schema.Json),
  properties: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  required: Schema.optionalKey(Schema.Array(Schema.String)),
  description: Schema.optionalKey(Schema.String),
});
type Node = typeof Node.Type;
const readNode = Schema.decodeUnknownOption(Node);
const NO_NODE: Node = {};

/** The JSON Schema types that are one value, and the kind of each. */
const PRIMITIVES = new Map<Schema.Json, Primitive>([
  ['string', 'word'],
  ['integer', 'number'],
  ['number', 'number'],
  ['boolean', 'switch'],
]);

/** A list of one kind of value. */
const LISTS = new Map<Primitive, FieldKind>([
  ['word', 'words'],
  ['number', 'numbers'],
]);

/** `node` with its `$ref` followed into `defs`. Pure. */
const resolved = (node: Node, defs: JsonSchema.Definitions): Node =>
  Option.fromUndefinedOr(node.$ref).pipe(
    Option.flatMap((ref) => Option.fromUndefinedOr(defs[ref.replace(/^#\/\$defs\//, '')])),
    Option.flatMap(readNode),
    Option.match({ onNone: () => node, onSome: (target) => resolved(target, defs) }),
  );

/** The one primitive every member of a union is, when they agree. Pure. */
const unionOf = (
  union: ReadonlyArray<Schema.Json>,
  defs: JsonSchema.Definitions,
): Option.Option<Primitive> => {
  const kinds = union.map((one) =>
    Option.flatMap(readNode(one), (node) => primitiveOf(node, defs)),
  );
  return Option.filter(Option.flatten(Arr.head(kinds)), (kind) =>
    kinds.every((k) => Option.contains(k, kind)),
  );
};

/** The primitive a schema node is, when it is one: a word (a string, an enum or a union of them), a number or a switch. Pure. */
const primitiveOf = (node: Node, defs: JsonSchema.Definitions): Option.Option<Primitive> => {
  const at = resolved(node, defs);
  const word = Option.some<Primitive>('word');
  return Option.fromUndefinedOr(at.type).pipe(
    Option.flatMap((type) => Option.fromUndefinedOr(PRIMITIVES.get(type))),
    Option.orElse(() =>
      Option.flatMap(
        Option.filter(Option.fromUndefinedOr(at.enum), (all) => all.every(Predicate.isString)),
        () => word,
      ),
    ),
    Option.orElse(() =>
      Option.flatMap(
        Option.filter(Option.fromUndefinedOr(at.const), Predicate.isString),
        () => word,
      ),
    ),
    Option.orElse(() =>
      Option.flatMap(
        Option.orElse(Option.fromUndefinedOr(at.anyOf), () => Option.fromUndefinedOr(at.oneOf)),
        (union) => unionOf(union, defs),
      ),
    ),
  );
};

/** A list field's kind: an array whose every item (its leading ones too, a non-empty list's) is one primitive. Pure. */
const listOf = (at: Node, defs: JsonSchema.Definitions): Option.Option<FieldKind> => {
  const itemKinds = [
    ...Option.toArray(Option.fromUndefinedOr(at.items)),
    ...Option.getOrElse(
      Option.filter(Option.fromUndefinedOr(at.prefixItems), isJsonArray),
      (): ReadonlyArray<Schema.Json> => [],
    ),
  ].map((item) => Option.flatMap(readNode(item), (node) => primitiveOf(node, defs)));
  return Option.filter(Option.flatten(Arr.head(itemKinds)), (kind) =>
    itemKinds.every((k) => Option.contains(k, kind)),
  ).pipe(
    Option.filter(() => at.type === 'array'),
    Option.flatMap((kind) => Option.fromUndefinedOr(LISTS.get(kind))),
  );
};

/** A field's kind from its JSON Schema node. Pure. */
const kindOf = (node: Node, defs: JsonSchema.Definitions): FieldKind => {
  const at = resolved(node, defs);
  return Option.getOrElse(
    Option.orElse(primitiveOf(at, defs), () => listOf(at, defs)),
    (): FieldKind => 'json',
  );
};

/**
 * The fields a command takes, as the JSON Schema MCP lists its tool by
 * says them: each property, its kind, whether it is required and its
 * description. Pure.
 */
export const fieldsOf = (tool: Tool.Any): ReadonlyArray<LabField> => {
  const document = Schema.toJsonSchemaDocument(tool.parametersSchema);
  const defs = document.definitions;
  const root = resolved(
    Option.getOrElse(readNode(document.schema), () => NO_NODE),
    defs,
  );
  const required = Option.getOrElse(
    Option.fromUndefinedOr(root.required),
    (): ReadonlyArray<string> => [],
  );
  const properties = Option.getOrElse(Option.fromUndefinedOr(root.properties), () => ({}));
  return Object.entries(properties).flatMap(([name, value]) =>
    Option.toArray(
      Option.map(readNode(value), (node) => ({
        name,
        kind: kindOf(node, defs),
        required: required.includes(name),
        description: Option.getOrElse(
          Option.orElse(Option.fromUndefinedOr(resolved(node, defs).description), () =>
            Option.fromUndefinedOr(node.description),
          ),
          () => '',
        ),
      })),
    ),
  );
};

// ---------------------------------------------------------------------------
// A schema as MCP lists it

const RefRoot = Schema.Struct({ $ref: Schema.String });
const isRefRoot = Schema.is(RefRoot);

/**
 * A schema's JSON Schema with an object root, as MCP lists a tool's input
 * and output: a top-level `$ref` inlined. `excess` says what it does with a
 * key it does not name: `ignore` (more are allowed) or `error` (none are).
 */
export const objectSchema = (schema: Schema.Top, excess: 'ignore' | 'error' = 'ignore') => {
  const document = Schema.toJsonSchemaDocument(schema, { onExcessProperty: excess });
  const { definitions } = document;
  const root = Option.liftPredicate(document.schema, isRefRoot).pipe(
    Option.flatMap((ref) =>
      Option.fromUndefinedOr(definitions[ref.$ref.replace(/^#\/\$defs\//, '')]),
    ),
    Option.getOrElse(() => document.schema),
  );
  return Arr.match(Object.keys(definitions), {
    onEmpty: () => root,
    onNonEmpty: () => ({ ...root, $defs: definitions }),
  });
};
