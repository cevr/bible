// One lab command, defined once: its name, what it takes and answers and
// how it refuses (an Effect `Tool`: its parameters, success and failure
// schemas), the effect it runs, and how a terminal reads its answer. The
// transports are made from the definition and from nothing else
// (`lab-commands.ts` lists the set):
//
// - MCP (`lab-mcp.ts`): the tool, its arguments decoded by its parameters,
//   its answer encoded by its success, its refusal said in its words; a
//   command whose answer is pictures (`content`) is answered with them beside
//   the structured answer.
// - The CLI (`lab-cli.ts`): `film lab <name>`, a flag for each field of its
//   parameters, by the field's own name; `--json` prints the success's JSON,
//   the plain answer its `lines`.
//
// What a command runs needs services (`R`): the set keeps each command where
// those are (`HereNeeds` in a terminal's own process, `InLabNeeds` only in
// the running lab), so where the CLI runs it follows from the types.

import { Array as Arr, Context, Effect, Match, Option, Predicate, Schema } from 'effect';
import type { FileSystem } from 'effect';
import type { McpSchema, Tool } from 'effect/ai';
import type { LabLinks } from '../core/lab-events.ts';

/** The lab's own links, where every link a command answers points: on this machine, and from the owner's phone. */
export class LabAddress extends Context.Service<LabAddress, LabLinks>()(
  '@bible/film/tools/LabAddress',
) {}

/** A command's input that does not read as its parameters, in the schema's words (as a toolkit says it). */
class LabInputInvalid extends Schema.TaggedError<LabInputInvalid>()('LabInputInvalid', {
  command: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `Invalid parameters for tool '${this.command}': ${this.reason}`;
  }
}

/** A command that refused: its refusal's tag and its words. */
export class LabCommandRefused extends Schema.TaggedError<LabCommandRefused>()(
  'LabCommandRefused',
  { command: Schema.String, tag: Schema.String, reason: Schema.String },
) {
  override get message() {
    return this.reason;
  }
}

/** A refusal as a command declares it: a tagged error with words of its own. */
interface Named {
  readonly _tag: string;
  readonly message: string;
}

/** MCP's content for an answer: its lines and its stills as images. */
type Pictured = Effect.Effect<
  ReadonlyArray<McpSchema.ContentBlock>,
  LabCommandRefused,
  FileSystem.FileSystem
>;

/** A command's answer as a transport hands it on: its JSON, its plain lines, and its pictures when it has them. */
export interface Answered {
  readonly json: Schema.Json;
  readonly lines: ReadonlyArray<string>;
  readonly pictured: Option.Option<Pictured>;
}

/**
 * One command of the lab's set, its types closed over by its definition: a
 * transport hands it JSON and gets JSON back.
 */
export interface LabCommand<R> {
  /** The tool MCP lists it by: its name, description, annotations and schemas. */
  readonly tool: Tool.Any;
  readonly name: string;
  /** `raw` read as the command's input and written again: what a transport sends on, checked. */
  readonly input: (raw: Schema.Json) => Effect.Effect<Schema.Json, LabInputInvalid>;
  /** `raw` read as the command's input, run, and answered. */
  readonly call: (
    raw: Schema.Json,
  ) => Effect.Effect<Answered, LabInputInvalid | LabCommandRefused, R>;
  /** The lab's structured answer read back as the command's own (a terminal that asked the lab). */
  readonly answered: (json: Schema.Json) => Effect.Effect<Answered, Schema.SchemaError>;
}

/** A schema a command takes or answers by: plain data, no service to read or write it. */
type DataSchema = Schema.Top & Schema.ConstraintCodec<unknown, unknown, never, never>;

/** A refusal a command declares: plain data, with words of its own. */
type RefusalSchema = Schema.Top & Schema.ConstraintCodec<Named, unknown, never, never>;

const JsonText = Schema.fromJsonString(Schema.Json);
const jsonText = Schema.encodeSync(JsonText);
const readJsonValue = Schema.decodeUnknownEffect(Schema.Json);

/** How a command reads its input, as a toolkit reads a tool's: every problem said, a field it does not take ignored. */
const READ_INPUT = { errors: 'all', onExcessProperty: 'ignore' } as const;

/**
 * A command over `tool`: `run` is what it does; `lines` how a terminal reads
 * its answer (each scalar and each listed record a line, `plainLines`,
 * unless given); `content` its MCP answer when that is pictures.
 */
export const labCommand = <
  Name extends string,
  P extends DataSchema,
  S extends DataSchema,
  F extends RefusalSchema,
  M extends Tool.FailureMode,
  R,
>(
  tool: Tool.Tool<
    Name,
    { readonly parameters: P; readonly success: S; readonly failure: F; readonly failureMode: M }
  >,
  spec: {
    readonly run: (input: P['Type']) => Effect.Effect<S['Type'], F['Type'], R>;
    readonly lines?: (output: S['Type']) => ReadonlyArray<string>;
    readonly content?: (
      output: S['Type'],
    ) => Effect.Effect<ReadonlyArray<McpSchema.ContentBlock>, Named, FileSystem.FileSystem>;
  },
): LabCommand<R> => {
  const name = tool.name;
  const decodeInput = Schema.decodeUnknownEffect(tool.parametersSchema);
  const encodeInput = Schema.encodeUnknownEffect(tool.parametersSchema);
  const encodeOutput = Schema.encodeUnknownEffect(tool.successSchema);
  const decodeOutput = Schema.decodeUnknownEffect(tool.successSchema);
  const invalid = (error: Schema.SchemaError) =>
    LabInputInvalid.make({ command: name, reason: error.message });
  const refusedAs = (error: Named) =>
    LabCommandRefused.make({ command: name, tag: error._tag, reason: error.message });
  const lines = Option.fromUndefinedOr(spec.lines);
  const content = Option.fromUndefinedOr(spec.content);

  /** The answer `output`, as its JSON (`json`) says it. */
  const answerOf = (output: S['Type'], json: Schema.Json): Answered => ({
    json,
    lines: Option.match(lines, {
      onNone: () => plainLines(json),
      onSome: (read) => read(output),
    }),
    pictured: Option.map(content, (picture) => Effect.mapError(picture(output), refusedAs)),
  });

  /** `output` as JSON: encoded by the command's success. A success that does not encode is the command's defect. */
  const jsonOf = (output: S['Type']) =>
    Effect.orDie(Effect.flatMap(encodeOutput(output), (encoded) => readJsonValue(encoded)));

  return {
    tool,
    name,
    input: (raw) =>
      decodeInput(raw, READ_INPUT).pipe(
        Effect.flatMap((decoded) => encodeInput(decoded)),
        Effect.flatMap((encoded) => readJsonValue(encoded)),
        Effect.mapError(invalid),
      ),
    call: (raw) =>
      Effect.gen(function* () {
        const decoded = yield* Effect.mapError(decodeInput(raw, READ_INPUT), invalid);
        const output = yield* Effect.mapError(spec.run(decoded), refusedAs);
        return answerOf(output, yield* jsonOf(output));
      }),
    answered: (json) => Effect.map(decodeOutput(json), (output) => answerOf(output, json)),
  };
};

// ---------------------------------------------------------------------------
// A plain answer, a line a record

const BARE = /^[^\s"=]+$/;

const isJsonObject = Schema.is(Schema.JsonObject);
const isJsonArray = Schema.is(Schema.Array(Schema.Json));

/** A JSON value in one line: a word as it is when it has no space, else as JSON. Pure. */
const scalar = (value: Schema.Json): string =>
  Option.getOrElse(
    Option.filter(Option.liftPredicate(value, Predicate.isString), (word) => BARE.test(word)),
    () => jsonText(value),
  );

/** A record's fields as `key=value` each, a nested one as its JSON. Pure. */
const fieldsLine = (record: Schema.JsonObject): string =>
  Object.entries(record)
    .map(([key, value]) => `${key}=${scalar(value)}`)
    .join(' ');

/** One field of an answer as its own lines: a record on one, a list a line an item, a scalar none (it is on the first). Pure. */
const nestedLines = (key: string, value: Schema.Json): ReadonlyArray<string> =>
  Match.value(value).pipe(
    Match.when(isJsonObject, (record) => [`${key} ${fieldsLine(record)}`]),
    Match.when(isJsonArray, (all) =>
      Arr.match(all, {
        onEmpty: () => [`${key}=[]`],
        onNonEmpty: (items) =>
          items.map((one, i) =>
            Option.match(Option.liftPredicate(one, isJsonObject), {
              onSome: (record) => `${key}[${i}] ${fieldsLine(record)}`,
              onNone: () => `${key}[${i}] ${scalar(one)}`,
            }),
          ),
      }),
    ),
    Match.orElse(() => []),
  );

/**
 * An encoded answer as plain lines: its scalar fields on the first line, then
 * each record of each list on its own (`notes[0] id=n1 status=open …`), and
 * each nested record on its own (`page id=… links=…`). Pure.
 */
const plainLines = (encoded: Schema.Json): ReadonlyArray<string> =>
  Option.match(Option.liftPredicate(encoded, isJsonObject), {
    onNone: () => [scalar(encoded)],
    onSome: (record) => {
      const entries = Object.entries(record);
      const head = entries.filter(([, value]) => !isJsonObject(value) && !isJsonArray(value));
      return [
        ...Arr.match(head, {
          onEmpty: () => [],
          onNonEmpty: (fields) => [fieldsLine(Object.fromEntries(fields))],
        }),
        ...entries.flatMap(([key, value]) => nestedLines(key, value)),
      ];
    },
  });
